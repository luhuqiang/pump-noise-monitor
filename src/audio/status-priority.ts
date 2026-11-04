/**
 * 听诊仪 · 优先级矩阵
 * 自上而下取第一条，命中即停：
 *   1. invalid           采集链路不可信
 *   2. warming           非 steady（启动/停机）
 *   3. shaft_ambiguous   亚谐波或谱线 SNR 不足 → 阶次禁用，降为 low
 *   4. shaft_mismatch    转速与铭牌偏差 >5% 且超出 3σ → 阶次禁用，降为 low
 *   5. crest_event       冻结门限命中 → 补证据，不改故障结论
 *   6. placement_moved   摆位指纹连续 ≥2 次超限 → 补证据
 *   7. 正常裁决          维持 diagnose() 的 ok/low
 */

import type { Diagnosis } from "./diagnose";
import type { ShaftTrack } from "./shaft-tracker";
import type { PlacementCheck } from "./fingerprint";
import type { ShortEvent } from "./event-rail";
import type { RunPhase } from "./phase";

export type PriorityContext = {
  valid: boolean;
  phase: RunPhase;
  shaft: ShaftTrack | null;
  placement: PlacementCheck | null;
  event: ShortEvent | null;
  ratedRpm: number;
};

export function crestEventHit(event: ShortEvent | null): boolean {
  if (!event || !event.gateFrozen) return false;
  if (event.eventsPerSec > 0) return true;
  const z = event.currentCrestZ;
  const limit = event.crestGateZ;
  return z !== null && limit !== null && z >= limit;
}

export function applyStatusPriority(input: Diagnosis, ctx: PriorityContext): Diagnosis {
  const d: Diagnosis = {
    ...input,
    evidence: { ...input.evidence },
    // 统一补旧版兼容字段（如果 diagnose 没填的话）
    severity: input.severity ?? (input.status === "ok" ? "正常" : input.status === "low" ? "警告" : "危险"),
    severityLabel: input.severityLabel ?? input.status === "ok" ? "健康" : input.status === "low" ? "存疑" : "无效",
    anomaly: input.anomaly ?? 0,
    title: input.title ?? (input.directions[0]?.title ?? (input.status === "ok" ? "正常" : "—")),
    confidence: input.confidence ?? (input.status === "ok" ? 95 : input.status === "low" ? 55 : 10),
    summary: input.summary ?? input.evidence.spectrum,
    excluded: input.excluded ?? [],
  };

  // 1. invalid
  if (d.status === "invalid" || !ctx.valid) {
    d.status = "invalid";
    return d;
  }

  // 2. 非稳态
  if (ctx.phase !== "steady") {
    d.status = "low";
    d.nextStep = "wait_steady";
    return d;
  }

  const shaft = ctx.shaft;

  // 3. 转速不确定 → 阶次禁用，降为 low
  if (shaft?.ambiguous) {
    d.status = "low";
    d.directions = [];
    d.evidence.order = shaft.insufficientSnr
      ? `谱线 SNR 不足（${shaft.lineSnrDb.toFixed(1)} dB，门限 10 dB），阶次禁用`
      : `亚谐波歧义（1/2× 与 1/3× 同时成立），阶次禁用`;
    d.nextStep = "retest_shaft";
    return d;
  }

  // 4. 转速与铭牌不符 → 阶次禁用，降为 low
  if (shaft?.mismatch) {
    d.status = "low";
    d.directions = [];
    d.evidence.order = `转速不符：实测 ${(shaft.trackedF0 * 60).toFixed(0)} r/min，铭牌 ${ctx.ratedRpm} r/min，阶次禁用`;
    d.nextStep = "retest_shaft";
    return d;
  }

  // 5. crest 事件：补证据，不改故障结论
  if (crestEventHit(ctx.event)) {
    const ev = ctx.event!;
    d.evidence.placement += ` · 冲击 ${ev.eventsPerSec.toFixed(1)}/s`;
  }

  // 6. 摆位指纹：补证据
  const placement = ctx.placement;
  if (placement?.state === "moved") {
    d.evidence.placement += ` · 摆位偏移 ${(placement.delta * 100).toFixed(0)}%`;
  }

  return d;
}
