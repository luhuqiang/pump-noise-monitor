import type { PumpTypeId } from "./scenarios.ts";
import type { SpectralFeatures } from "./features.ts";
import type { EnvelopeSummary } from "./envelope.ts";
import type { RunPhase } from "./phase.ts";
import type { InvalidReason } from "./validity.ts";

/**
 * 听诊仪 · 结论层
 * 只承诺两种故障：汽蚀（cavitation）、堵塞（blockage）。
 * 其余一律"证据不足"或"本次不作结论"。
 *
 * D2: 故障名只出现在 ok 状态；low 状态不排序、不显示百分比；invalid 时机制区整块移除。
 */

export const ALGORITHM_VERSION = "v2.0-2026.11";

/** 三态：有把握 / 证据不足 / 本次不作结论 */
export type TriState = "ok" | "low" | "invalid";

/** 旧版完整方向枚举（组件 icon/map 依赖），含承诺的两个故障 + 旧版线索方向 */
export type DirectionId =
  | "healthy"
  | "repeated_impact"
  | "cavitation"
  | "blockage"
  | "wideband_hf"
  | "one_x"
  | "two_x"
  | "half_orders"
  | "low_harmonics"
  | "lf_pulsation";

export type DirectionScore = {
  id: DirectionId;
  title: string;
  note: string;
  /** 旧版兼容：概率百分比 0-100 */
  probability?: number;
};

/** 旧版 severity 类型（兼容两种命名） */
export type Severity = "正常" | "警告" | "危险" | "健康" | "注意" | "严重";

export type Diagnosis = {
  status: TriState;
  /** ok 时为汽蚀/堵塞；low 时仍给出可能方向但不排序；invalid 时为空 */
  directions: DirectionScore[];
  /** 证据卡数据（对象形式） */
  evidence: {
    spectrum: string;
    order: string;
    placement: string;
  };
  /** invalid 时的修复清单 */
  fixList: string[];
  /** Agent 下一步建议的模板 key */
  nextStep: string;

  // ====== 旧版兼容字段（组件直接访问）======
  /** 旧版 severity：正常/警告/危险（从 status + severityLabel 推断） */
  severity: "正常" | "警告" | "危险";
  /** 旧版 severityLabel：更细的标签 */
  severityLabel: string;
  /** 旧版 anomaly：异常等级 0-100 */
  anomaly: number;
  /** 旧版 title：结论文本 */
  title: string;
  /** 旧版 confidence：置信度 0-100 */
  confidence: number;
  /** 旧版 summary：摘要文本 */
  summary: string;
  /** 旧版 excluded：已排除的方向列表 */
  excluded: DirectionId[];
  /** 旧版兼容：confidence 的别名 */
  confidencePct?: number;
  /** 旧版兼容：下一步动作 key */
  action?: string;
};

export type DiagnoseInput = SpectralFeatures & {
  pumpType: PumpTypeId;
  level: number;
  crest: number;
  kurtosis: number;
  snrDb?: number;
  envelope?: EnvelopeSummary;
  clipped?: boolean;
  agc?: boolean;
  valid?: boolean;
  invalidReasons?: InvalidReason[];
  phase?: RunPhase;
  rpm?: number;
  ordersReliable?: boolean;
  sampleRateOk?: boolean;
  dropouts?: number;
};

export const DIRECTION_TITLE: Record<DirectionId, string> = {
  healthy: "正常",
  repeated_impact: "重复冲击",
  cavitation: "汽蚀",
  blockage: "堵塞",
  wideband_hf: "高频宽带",
  one_x: "1× 偏大",
  two_x: "2× 偏大",
  half_orders: "半阶次",
  low_harmonics: "低次谐波",
  lf_pulsation: "低频脉动",
};
function addLegacy(base: { status: "ok" | "low" | "invalid"; directions: any; evidence: any; fixList: any; nextStep: string }): Diagnosis {
  const severity = base.status === "ok" ? "正常" : base.status === "low" ? "警告" : "危险";
  const title = base.directions?.[0]?.title ?? (base.status === "ok" ? "正常" : "—");
  return {
    ...base,
    severity,
    severityLabel: base.status === "ok" ? "健康" : base.status === "low" ? "存疑" : "无效",
    anomaly: base.status === "ok" ? 0 : base.status === "low" ? 35 : 70,
    title,
    confidence: base.status === "ok" ? 95 : base.status === "low" ? 55 : 10,
    summary: base.evidence.spectrum,
    excluded: [],
  };
}

function soft(x: number, lo: number, hi: number) {
  return Math.max(0, Math.min(1, (x - lo) / (hi - lo || 1)));
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 两方向证据强度（0–1）：
 * - 汽蚀 ≈ 2–8 kHz 宽带抬升 + 平坦度升高
 * - 堵塞 ≈ 低频周期性脉动 + 低次谐波
 */
function strength(f: DiagnoseInput): Record<DirectionId, number> {
  const cavitation = clamp(
    0.6 * soft(f.hfRatio, 0.75, 2.0) + 0.4 * soft(f.flatness, 0.15, 0.45),
    0,
    1,
  );
  const halfLo = f.pumpType === "vortex" ? 0.32 : 0.38;
  const blockage = clamp(
    0.5 * soft(f.halfRatio, halfLo, halfLo * 2.1) +
      0.3 * soft(-(f.bandDb[1] ?? -40), 8, 22) +
      0.2 * soft(f.oneXRatio, 1.2, 3.0),
    0,
    1,
  );
  const healthy = clamp(
    0.42 * soft(f.bpfRatio, 1.1, 2.4) +
      0.22 * (1 - soft(f.kurtosis, 4, 7)) +
      0.18 * (1 - soft(f.hfRatio, 0.5, 1.3)) +
      0.18 * (1 - soft(f.halfRatio, 0.25, 0.6)),
    0,
    1,
  );
  return { cavitation, blockage, healthy, repeated_impact: 0, wideband_hf: 0, one_x: 0, two_x: 0, half_orders: 0, low_harmonics: 0, lf_pulsation: 0 };
}

function noteOf(f: DiagnoseInput) {
  return `峭度 ${f.kurtosis.toFixed(1)} · 高频比 ${f.hfRatio.toFixed(2)} · 半阶次 ${f.halfRatio.toFixed(2)}`;
}

function bandEvidence(f: DiagnoseInput): string {
  const sorted = f.bandDb
    .map((db, i) => ({ db, i }))
    .sort((a, b) => b.db - a.db)
    .slice(0, 2);
  const labels = ["40–80", "80–160", "160–315", "315–630", "630–1250", "1.25–2.5k", "2.5–5k", "5–10k"];
  return sorted.map(({ db, i }) => `${labels[i] ?? `${i}`} ${db.toFixed(1)} dB`).join("，");
}

function orderEvidence(f: DiagnoseInput): string {
  if (f.ordersReliable === false) return "阶次不可用（转速不足或转数不够）";
  return `1× ${f.oneXRatio.toFixed(2)} · 2×/1× ${(f.twoXRatio / Math.max(f.oneXRatio, 1e-9)).toFixed(2)}`;
}

function invalidText(reason: InvalidReason): string {
  switch (reason) {
    case "clip":
      return "输入削顶——降低手机音量或移动测点";
    case "agc":
      return "系统 AGC 介入——关闭系统降噪/自动增益";
    case "sample_rate":
      return "采样率不是 48 kHz——检查音频设置";
    case "worklet_drop":
      return "音频块掉帧——关闭后台应用释放算力";
    case "mic_lost":
      return "麦克风被系统切走——重新授权或重启采集";
    case "silence":
      return "电平过低——确认手机已贴住金属面";
  }
}

export function diagnose(f: DiagnoseInput): Diagnosis {
  const snr = Number.isFinite(f.snrDb) ? (f.snrDb as number) : 20;
  const phase = f.phase ?? "steady";

  // --- invalid：数据不可信，机制区整块移除 ---
  const invalid =
    f.valid === false ||
    !Number.isFinite(f.level) ||
    f.level < -70 ||
    f.clipped === true;
  if (invalid) {
    const reasons = (f.invalidReasons ?? []).map(invalidText);
    if (f.clipped && !reasons.some((r) => r.startsWith("输入削顶"))) {
      reasons.unshift(invalidText("clip"));
    }
    return addLegacy({
      status: "invalid",
      directions: [],
      evidence: {
        spectrum: bandEvidence(f),
        order: orderEvidence(f),
        placement: `SNR ${snr.toFixed(0)} dB · ${f.agc ? "AGC 介入" : "无 AGC"}`,
      },
      fixList: reasons.length ? reasons : ["采集链路异常，请检查麦克风与采样率"],
      nextStep: "fix_invalid",
    });
  }

  // 非稳态（启动/停机）只给证据，不作结论
  if (phase !== "steady") {
    return addLegacy({
      status: "low",
      directions: [],
      evidence: {
        spectrum: bandEvidence(f),
        order: orderEvidence(f),
        placement: `SNR ${snr.toFixed(0)} dB · 运行态 ${phase}`,
      },
      fixList: [],
      nextStep: "wait_steady",
    });
  }

  // --- 计算两方向强度 ---
  const s = strength(f);
  const cav = s.cavitation;
  const blk = s.blockage;
  const h = s.healthy;

  // 信噪比门限：SNR < 8 时强制 low
  const snrOk = snr >= 8;
  // 阶次可用门限
  const reliable = f.ordersReliable !== false;

  // 判断是否有把握：
  // 某方向强度 ≥ 0.6 且显著高于另一方向（差值 ≥ 0.25）且 SNR 足够
  const cavLead = cav >= 0.6 && cav - blk >= 0.25;
  const blkLead = blk >= 0.6 && blk - cav >= 0.25;
  const healthyLead = h >= 0.6 && h - Math.max(cav, blk) >= 0.2;

  const hasConfidence = snrOk && reliable && (cavLead || blkLead || healthyLead);

  if (!hasConfidence) {
    // low：给出可能方向但不排序、不显示百分比
    const dirs: DirectionScore[] = [];
    if (cav > 0.3) dirs.push({ id: "cavitation", title: DIRECTION_TITLE.cavitation, note: noteOf(f) });
    if (blk > 0.3) dirs.push({ id: "blockage", title: DIRECTION_TITLE.blockage, note: noteOf(f) });
    return addLegacy({
      status: "low",
      directions: dirs,
      evidence: {
        spectrum: bandEvidence(f),
        order: orderEvidence(f),
        placement: `SNR ${snr.toFixed(0)} dB · 证据不足`,
      },
      fixList: [],
      nextStep: "retest",
    });
  }

  // ok：有把握，输出唯一方向
  let decided: DirectionId;
  if (healthyLead) decided = "healthy";
  else if (cavLead) decided = "cavitation";
  else decided = "blockage";

  return addLegacy({
    status: "ok",
    directions: decided === "healthy" ? [] : [{ id: decided, title: DIRECTION_TITLE[decided], note: noteOf(f) }],
    evidence: {
      spectrum: bandEvidence(f),
      order: orderEvidence(f),
      placement: `SNR ${snr.toFixed(0)} dB · 无削顶`,
    },
    fixList: [],
    nextStep: decided === "healthy" ? "report" : "report_with_fault",
  });
}
