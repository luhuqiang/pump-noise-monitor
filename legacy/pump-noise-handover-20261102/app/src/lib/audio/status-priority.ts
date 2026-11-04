/**
 * 标题与状态的唯一优先级矩阵（评审 18 P1-1）。
 *
 * 旧实现把 invalid、转速歧义、摆位提示分散在引擎的 if/else 链里，
 * crest 与事件轨只追加证据，不参与标题裁决，导致同一帧可能出现
 * "标题说转速不确定、摘要说疑似移动设备"的自相矛盾。
 *
 * 现在自上而下取第一条，命中即停：
 *   1. invalid           采集链路不可信
 *   2. warming           非 steady（启动/停机/未运行）
 *   3. shaft_ambiguous   亚谐波或谱线 SNR 不足
 *   4. shaft_mismatch    实测转速与铭牌偏差 >5% 且超出 3σ
 *   5. crest_event       冻结门限命中（当前 z 超限或近 2 s 有冲击）
 *   6. placement_moved   摆位指纹连续 ≥2 次超限
 *   7. low_confidence    基线/样本不足
 *   8. normal            正常
 *
 * 只改标题、严重度与证据，不动概率与方向列表：概率仍来自同一次 softmax。
 */

import type { Diagnosis, StatusPriority } from "./diagnose";
import type { ShaftTrack } from "./shaft-tracker";
import type { PlacementCheck } from "./fingerprint";
import type { ShortEvent } from "./event-rail";
import type { RunPhase } from "./phase";

export type PriorityContext = {
  /** 采集链路是否可信；false 时只允许 invalid */
  valid: boolean;
  phase: RunPhase;
  shaft: ShaftTrack | null;
  placement: PlacementCheck | null;
  event: ShortEvent | null;
  ratedRpm: number;
};

/** crest 命中：门限已冻结，且当前 z 超限或近 2 s 已有冲击事件。 */
export function crestEventHit(event: ShortEvent | null): boolean {
  if (!event || !event.gateFrozen) return false;
  if (event.eventsPerSec > 0) return true;
  const z = event.currentCrestZ;
  const limit = event.crestGateZ;
  return z !== null && limit !== null && z >= limit;
}

function withEvidence(d: Diagnosis, line: string): Diagnosis {
  d.evidence = [...d.evidence, line];
  return d;
}

export function applyStatusPriority(input: Diagnosis, ctx: PriorityContext): Diagnosis {
  const d: Diagnosis = { ...input, evidence: [...input.evidence] };

  if (d.status === "invalid" || !ctx.valid) {
    d.priority = "invalid";
    return d;
  }

  if (ctx.phase !== "steady") {
    d.priority = "warming";
    return d;
  }

  const shaft = ctx.shaft;

  // 3. 转速不确定：SNR 不足与亚谐波歧义是两种失败方向，文案必须分开
  if (shaft?.ambiguous) {
    d.priority = "shaft_ambiguous";
    d.title = "转速不确定 · 阶次结论已禁用";
    d.summary = shaft.insufficientSnr
      ? `主梳谱线平均突出度仅 ${shaft.lineSnrDb.toFixed(1)} dB（门限 10 dB），谱线 SNR 不足，无法判断亚谐波有无。本次不输出转速数值与方向结论，请靠近测点或降低背景噪声后重测。`
      : "谱线上 1/2× 与 1/3× 亚谐波同时成立，无法确定唯一基频。本次不输出转速数值与方向结论，请确认变频器设定与实际滑差。";
    withEvidence(
      d,
      shaft.insufficientSnr
        ? `SNR 不足：主梳平均突出度 ${shaft.lineSnrDb.toFixed(1)} dB（门限 10 dB），不能报"无亚谐波"`
        : `亚谐波歧义：1/2× 与 1/3× 同时成立（分数阶谱线占比 ${(shaft.subharmonicRatio * 100).toFixed(0)}%，门限 55%）`,
    );
    d.severity = "关注";
    d.status = "low_confidence";
    d.directions = [];
    d.confidencePct = Math.min(d.confidencePct, 30);
    return d;
  }

  // 4. 转速与铭牌不符：偏差必须超出 3σ 才判，数值一律带误差棒
  if (shaft?.mismatch) {
    d.priority = "shaft_mismatch";
    d.title = "转速与铭牌不符 · 阶次结论已禁用";
    d.summary = `轴频跟踪实际 ${(shaft.trackedF0 * 60).toFixed(0)} ± ${(shaft.trackedF0UncertaintyHz * 60).toFixed(0)} r/min，铭牌 ${ctx.ratedRpm} r/min，偏差 ${shaft.rpmDeltaPct.toFixed(1)}% ± ${shaft.rpmDeltaPctUncertainty.toFixed(1)}%（>5% 且超出 3σ）。阶次坐标整体错位，本次不输出方向结论。`;
    withEvidence(
      d,
      `轴频跟踪：${shaft.trackedF0.toFixed(2)} ± ${shaft.trackedF0UncertaintyHz.toFixed(2)} Hz vs 额定 ${shaft.ratedF0.toFixed(2)} Hz（${shaft.windowCount} 窗 / ${shaft.spanSec.toFixed(1)} s，梳强度 ${shaft.combScore.toFixed(2)}）`,
    );
    d.severity = "关注";
    d.status = "low_confidence";
    d.directions = [];
    d.confidencePct = Math.min(d.confidencePct, 40);
    return d;
  }

  // 正常跟踪也写误差棒：没有误差的偏差数值就是假精确
  if (shaft?.reliable) {
    withEvidence(
      d,
      `轴频跟踪：${shaft.trackedF0.toFixed(2)} ± ${shaft.trackedF0UncertaintyHz.toFixed(2)} Hz（额定 ${shaft.ratedF0.toFixed(2)} Hz，偏差 ${shaft.rpmDeltaPct.toFixed(1)}% ± ${shaft.rpmDeltaPctUncertainty.toFixed(1)}%；${shaft.windowCount} 窗 / ${shaft.spanSec.toFixed(1)} s）`,
    );
  }

  // 5. crest / 事件轨：门限已冻结且命中，标题升为冲击提示，但不抹掉方向列表
  if (crestEventHit(ctx.event)) {
    const ev = ctx.event!;
    d.priority = "crest_event";
    d.title = "冲击超门限 · 需复核";
    d.summary = `事件轨近 2 s 记录 ${ev.eventsPerSec.toFixed(1)} 次/秒冲击，当前 crest z ${ev.currentCrestZ?.toFixed(2) ?? "—"}（门限 ${ev.crestGateZ?.toFixed(2) ?? "—"}）。先核对润滑、游隙与测点安装，再用振动包络谱复核。${d.summary}`;
    d.severity = d.status === "ok" ? "警告" : d.severity;
    d.confidencePct = Math.min(d.confidencePct, 55);
  }

  const placement = ctx.placement;

  // 6. 摆位指纹：同设备、连续两次超限才判"疑似移动"，其余只提示
  //     crest 已命中时不再改写标题，只补证据——否则又回到自相矛盾的老问题。
  if (placement?.state === "moved") {
    withEvidence(d, `摆位指纹偏移 ${(placement.delta * 100).toFixed(0)}%（4–8k / 1–2k 能量比，连续 ≥2 次超限）`);
    if (d.priority !== "crest_event") {
      d.priority = "placement_moved";
      d.summary = `疑似移动设备，建议重新标定。${d.summary}`;
    }
  } else if (placement?.state === "recalibration_suggested") {
    withEvidence(d, "设备指纹变化，但基线偏离与频带一致性正常：建议复标定，本次不判移动");
  } else if (placement?.state === "device_changed") {
    withEvidence(d, "检测设备已更换：摆位比值不可跨设备比较，需重新标定（本次不告警）");
  } else if (placement?.state === "uncalibrated") {
    withEvidence(d, "摆位指纹尚未标定：下次建基线时一并记录，本次不告警");
  }

  if (!d.priority || d.priority === "normal") {
    d.priority = d.status === "low_confidence" ? "low_confidence" : "normal";
  }
  return d;
}
