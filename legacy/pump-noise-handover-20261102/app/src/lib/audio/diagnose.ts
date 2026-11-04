import type { PumpTypeId } from "./scenarios.ts";
import type { SpectralFeatures } from "./features.ts";
import type { EnvelopeSummary } from "./envelope.ts";
import type { RunPhase } from "./phase.ts";
import { phaseText } from "./phase.ts";
import type { InvalidReason } from "./validity.ts";

/**
 * 结论层只做三件事：偏离程度、频带证据、可能方向。
 * 在可控标注样本集建立之前，任何具体故障名都不允许出现在标题、摘要或建议里。
 */

export const ALGORITHM_VERSION = "v1.0-2026.11";

export type Severity = "正常" | "关注" | "警告";
export type DiagnosisStatus = "ok" | "low_confidence" | "invalid";

/**
 * 标题与状态的唯一优先级来源（自上而下取第一条）：
 * invalid → 转速不确定/亚谐波 → 转速不符 → crest 冲击 → 摆位移动 → 低置信 → 正常。
 * 纯函数实现见 status-priority.ts，引擎只负责把上下文拼好。
 */
export type StatusPriority =
  | "invalid"
  | "warming"
  | "shaft_ambiguous"
  | "shaft_mismatch"
  | "crest_event"
  | "placement_moved"
  | "low_confidence"
  | "normal";

export type DirectionId =
  | "repeated_impact"
  | "wideband_hf"
  | "one_x"
  | "two_x"
  | "half_orders"
  | "low_harmonics"
  | "lf_pulsation"
  | "healthy";

export type DirectionScore = {
  id: DirectionId;
  title: string;
  /** 0–100，与其余方向一起由单次 softmax 归一化 */
  probability: number;
  note: string;
};

export type Diagnosis = {
  status: DiagnosisStatus;
  /** 当前生效的标题优先级（由 status-priority.ts 统一裁决） */
  priority: StatusPriority;
  title: string;
  summary: string;
  confidence: "低" | "中" | "高";
  confidencePct: number;
  severity: Severity;
  evidence: string[];
  /** 负证据：已排除的方向及原因（invalid / 削顶 / 禁用阶次时为空） */
  excluded: string[];
  action: string;
  directions: DirectionScore[];
  /** 正常基线偏离程度 0–100，基线不充分时为 null */
  anomaly: number | null;
};

export type DiagnoseInput = SpectralFeatures & {
  pumpType: PumpTypeId;
  /** 未校准相对声级 dBFS */
  level: number;
  crest: number;
  kurtosis: number;
  snrDb?: number;
  envelope?: EnvelopeSummary;
  anomaly?: number | null;
  baselineCount?: number;
  baselineReady?: boolean;
  baselineFrames?: number;
  baselineBuckets?: number;
  clipped?: boolean;
  clipRate?: number;
  agc?: boolean;
  valid?: boolean;
  invalidReasons?: InvalidReason[];
  phase?: RunPhase;
  windowSec?: number;
  rpm?: number;
  ordersReliable?: boolean;
  fidelity?: number;
};

export type Logits = Record<DirectionId, number>;

export const DIRECTION_KEYS: DirectionId[] = [
  "repeated_impact",
  "wideband_hf",
  "one_x",
  "two_x",
  "half_orders",
  "low_harmonics",
  "lf_pulsation",
  "healthy",
];

const ORDER_KEYS: DirectionId[] = ["one_x", "two_x", "half_orders", "low_harmonics"];

export const DIRECTION_TITLE: Record<DirectionId, string> = {
  repeated_impact: "重复冲击 / 高频瞬态",
  wideband_hf: "2–8 kHz 宽带抬升",
  one_x: "1× 转频突出",
  two_x: "2× 转频偏高",
  half_orders: "半阶次成串",
  low_harmonics: "1× 与低次谐波",
  lf_pulsation: "低频周期性脉动",
  healthy: "谱形平稳",
};

const DIRECTION_ACTION: Record<DirectionId, string> = {
  repeated_impact: "核对润滑、游隙与测点安装，再用振动包络谱复核冲击间隔。",
  wideband_hf: "核对进口压力、液位与过滤器压差，先降流量试运行。",
  one_x: "核对叶轮结垢、偏磨与装配偏心，并与振动 1× 对照。",
  two_x: "复核联轴器对中、电机软脚与管路应力。",
  half_orders: "紧固地脚、轴承座、联轴器与管路支撑，检查垫片与基础刚度。",
  low_harmonics: "测量口环与轴向间隙，结合流量与扬程变化复核。",
  lf_pulsation: "检查吸入管路密封、液位与排气，排除周期性夹气。",
  healthy: "保持同测点、同工况复测，持续积累基线。",
};

function soft(x: number, lo: number, hi: number) {
  return Math.max(0, Math.min(1, (x - lo) / (hi - lo || 1)));
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function dbToP(v: number) {
  return Math.max(0.02, Math.min(0.98, v));
}

/** 各方向的证据强度（0–1），只描述机制，不命名故障。 */
function strength(f: DiagnoseInput): Record<DirectionId, number> {
  const env = f.envelope;
  const repeated = clamp(
    (env
      ? 0.5 * (soft(f.kurtosis, 4.2, 9) * soft(f.crest, 2.3, 4)) + 0.42 * env.bearingScore + 0.08 * soft(f.hfRatio, 0.6, 1.8)
      : 0.75 * (soft(f.kurtosis, 4.2, 9) * soft(f.crest, 2.3, 4)) + 0.25 * soft(f.hfRatio, 0.6, 1.8)),
    0,
    1,
  );
  const wideband = clamp(0.6 * soft(f.hfRatio, 0.75, 2.0) + 0.4 * soft(f.flatness, 0.15, 0.45), 0, 1);
  const rel2 = f.twoXRatio / Math.max(f.oneXRatio, 1e-9);
  const oneX = soft(f.oneXRatio, f.pumpType === "vortex" ? 1.6 : 1.8, 4.5);
  const twoX = clamp(0.65 * soft(rel2, 0.45, 1.0) + 0.35 * soft(f.twoXRatio, 1.2, 3.2), 0, 1);
  const halfLo = f.pumpType === "vortex" ? 0.32 : 0.38;
  const half = clamp(0.6 * soft(f.halfRatio, halfLo, halfLo * 2.2) + 0.4 * soft(f.harmonicCount, 4, 8), 0, 1);
  const lowHarm = clamp(
    0.5 * soft(f.oneXRatio, 1.2, 3.4) + 0.3 * (1 - soft(f.bpfRatio, 1.0, 1.8)) + 0.2 * soft(f.flatness, 0.1, 0.34),
    0,
    1,
  );
  const lfPulse = clamp(0.6 * soft(f.halfRatio, halfLo, halfLo * 2.1) + 0.4 * soft(-(f.bandDb[1] ?? -40), 8, 22), 0, 1);
  const healthy = clamp(
    0.42 * soft(f.bpfRatio, 1.1, 2.4) +
      0.22 * (1 - soft(f.kurtosis, 4, 7)) +
      0.18 * (1 - soft(f.hfRatio, 0.5, 1.3)) +
      0.18 * (1 - soft(f.halfRatio, 0.25, 0.6)),
    0,
    1,
  );
  return {
    repeated_impact: repeated,
    wideband_hf: wideband,
    one_x: oneX,
    two_x: twoX,
    half_orders: half,
    low_harmonics: lowHarm,
    lf_pulsation: lfPulse,
    healthy,
  };
}

/** 特征层 → logits。低转速时阶次类方向直接压到极小值，禁止阶次结论。 */
export function faultLogits(f: DiagnoseInput): Logits {
  const s = strength(f);
  const reliable = f.ordersReliable !== false;
  const logits = {} as Logits;
  for (const key of DIRECTION_KEYS) {
    let score = s[key];
    if (!reliable && ORDER_KEYS.includes(key)) score = 0;
    logits[key] = Math.log(dbToP(score)) - Math.log(1 - dbToP(score)) * 0.15;
  }
  logits.healthy += 0.35;
  if (!reliable) logits.healthy += 0.5;
  return logits;
}

/** 唯一一次 softmax：之前只允许在 logits 层做 EMA，不允许对概率反复平滑。 */
export function softmaxLogits(logits: Logits): Record<DirectionId, number> {
  const keys = DIRECTION_KEYS;
  const max = Math.max(...keys.map((k) => logits[k] ?? 0));
  const exps = keys.map((k) => Math.exp((logits[k] ?? 0) - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  const out = {} as Record<DirectionId, number>;
  keys.forEach((k, i) => {
    out[k] = (exps[i]! / sum) * 100;
  });
  return out;
}

export function smoothLogits(prev: Logits, next: Logits, alpha = 0.3): Logits {
  const out = {} as Logits;
  for (const key of DIRECTION_KEYS) {
    out[key] = prev[key] === undefined ? next[key] : prev[key]! + alpha * (next[key] - prev[key]!);
  }
  return out;
}

function noteOf(f: DiagnoseInput) {
  return [
    `峭度 ${f.kurtosis.toFixed(1)} · 波峰 ${f.crest.toFixed(2)}`,
    `高频比 ${f.hfRatio.toFixed(2)} · 平坦度 ${f.flatness.toFixed(2)}`,
    `1×/BPF ${f.oneXRatio.toFixed(2)} · 2×/1× ${(f.twoXRatio / Math.max(f.oneXRatio, 1e-9)).toFixed(2)}`,
    `半阶次 ${f.halfRatio.toFixed(2)} · 谐波 ${f.harmonicCount}`,
  ].join(" · ");
}

function bandEvidence(f: DiagnoseInput) {
  const sorted = f.bandDb
    .map((db, i) => ({ db, i }))
    .sort((a, b) => b.db - a.db)
    .slice(0, 2);
  const labels = ["40–80", "80–160", "160–315", "315–630", "630–1250", "1.25–2.5k", "2.5–5k", "5–10k"];
  return sorted.map(({ db, i }) => `${labels[i] ?? `${i}`} ${db.toFixed(1)} dB（相对总能量）`);
}

function invalidText(reason: InvalidReason) {
  switch (reason) {
    case "clip":
      return "输入削顶";
    case "agc":
      return "系统 AGC 全频带同步平移";
    case "sample_rate":
      return "采样率不是 48 kHz";
    case "worklet_drop":
      return "音频块连续掉帧";
    case "mic_lost":
      return "麦克风被系统切走或静音";
    case "silence":
      return "电平过低";
  }
}

/**
 * 负证据（评审 16 §5）：「不是轴承、不是汽蚀，因为对应特征均不存在」比
 * 「可能是 X」更能建立信任。但数据不可信（invalid / 削顶 / 阶次禁用）时，
 * 排除同样不可信，一律不输出。
 */
function negativeEvidence(f: DiagnoseInput, reliable: boolean): string[] {
  if (f.valid === false || f.clipped) return [];
  if (!reliable) return [];
  const scores = f.envelope?.matches ?? [];
  const score = (key: string) => scores.find((m) => m.key === key)?.score ?? 0;
  const out: string[] = [];
  if (Math.max(score("BPFO"), score("BPFI"), score("BSF"), score("FTF")) < 0.25) {
    out.push("已排除轴承类：BPFO/BPFI/BSF 包络无峰簇");
  }
  if (f.hfRatio < 0.75 && f.flatness < 0.2) {
    out.push("已排除汽蚀/宽带高频：2–8 kHz 未抬升");
  }
  if (f.oneXRatio < 1.6) {
    out.push("已排除不平衡类：1× 转频不突出");
  }
  const rel2 = f.twoXRatio / Math.max(f.oneXRatio, 1e-9);
  if (rel2 < 0.5) {
    out.push("已排除对中/松动：2×/1× 无明显优势");
  }
  if (f.halfRatio < 0.4 && f.harmonicCount < 4) {
    out.push("已排除半阶次松动：无半阶次谱簇");
  }
  return out;
}

export function diagnose(f: DiagnoseInput, logits?: Logits, held?: DirectionId): Diagnosis {
  const reliable = f.ordersReliable !== false;
  const phase = f.phase ?? "steady";
  const anomaly = f.anomaly ?? null;
  const snr = Number.isFinite(f.snrDb) ? (f.snrDb as number) : 20;
  const snrGood = soft(snr, 8, 24);
  const quality = `SNR ${snr.toFixed(0)} dB${f.clipped ? " · 输入削顶" : ""}`;
  const bands = bandEvidence(f);
  const baseEvidence = [quality, ...bands, `相位 ${phase}${reliable ? "" : " · 阶次结论已禁用"}`];

  const invalid = f.valid === false || (!Number.isFinite(f.level) || f.level < -70);
  if (invalid) {
    const reasons = (f.invalidReasons ?? []).map(invalidText);
    return {
      status: "invalid",
      priority: "invalid",
      title: "信号无效",
      summary: `当前数据不可用于判读：${reasons.length ? reasons.join("；") : "电平或采集链路异常"}。先修复采集条件，本次不输出方向结论。`,
      confidence: "低",
      confidencePct: 0,
      severity: "关注",
      evidence: [...baseEvidence, ...(reasons.length ? [`失效源 ${reasons.join("、")}`] : [])],
      excluded: [],
      action: "检查麦克风位置与被系统切走的情况、关闭系统降噪/AGC、确认采样率 48 kHz，再重新观测。",
      directions: [],
      anomaly,
    };
  }

  const raw = logits ?? faultLogits(f);

  // 启动 5 秒内与停机过程不出结论：只保留频带证据，方向列表置空。
  if (phase !== "steady") {
    const label = phaseText(phase);
    return {
      status: "low_confidence",
      priority: "warming",
      title: phase === "starting" ? "启动中 · 暂不判读" : phase === "stopping" ? "停机中 · 暂不判读" : "未运行 · 暂不判读",
      summary: `当前运行态为${label}。${phase === "starting" ? "启动 5 秒内不输出结论，" : ""}只保留频带证据：${bands.join("；")}。`,
      confidence: "低",
      confidencePct: 0,
      severity: "关注",
      evidence: [
        ...baseEvidence,
        `基线 ${f.baselineFrames ?? f.baselineCount ?? 0} 帧 / ${f.baselineBuckets ?? 0} 档`,
      ],
      excluded: [],
      action: "等待运行稳定后再判读。声学线索不能替代振动检测与拆检。",
      directions: [],
      anomaly,
    };
  }

  const probs = softmaxLogits(raw);
  const faults = DIRECTION_KEYS.filter((k) => k !== "healthy");
  const sorted = faults
    .map((id) => ({ id, probability: probs[id] }))
    .sort((a, b) => b.probability - a.probability);
  const top = sorted[0]!;
  const second = sorted[1]?.probability ?? 0;
  const healthy = probs.healthy;

  const directions: DirectionScore[] = sorted
    .filter((item) => item.probability >= 1)
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: DIRECTION_TITLE[item.id],
      probability: item.probability,
      note: noteOf(f),
    }));

  const separation = (top.probability - second) / Math.max(top.probability, 1);
  let confidencePct = Math.round(100 * (0.45 * (top.probability / 100) + 0.3 * clamp(separation, 0, 1) + 0.25 * snrGood));
  const baselineReady = f.baselineReady === true;
  if (!baselineReady) confidencePct = Math.min(confidencePct, 45);
  if (phase !== "steady") confidencePct = Math.min(confidencePct, 40);
  if (!reliable) confidencePct = Math.min(confidencePct, 45);
  if (snr < 8) confidencePct = Math.min(confidencePct, 40);
  if (f.clipped) confidencePct = Math.min(confidencePct, 30);
  confidencePct = clamp(confidencePct, 0, 95);
  const confidence: Diagnosis["confidence"] = confidencePct >= 75 ? "高" : confidencePct >= 50 ? "中" : "低";

  const healthyLead = healthy >= top.probability;
  const lowConfidence = !baselineReady || phase !== "steady" || snr < 8 || confidencePct < 50;
  const status: DiagnosisStatus = lowConfidence ? "low_confidence" : "ok";
  /** 滞回只作用在这里：概率始终来自同一次 softmax，不做二次平滑。 */
  const decided: DirectionId = status === "ok" ? (held ?? (healthyLead ? "healthy" : top.id)) : top.id;

  let title: string;
  let summary: string;
  if (status === "ok" && decided === "healthy") {
    title = "运转平稳";
    summary = `当前谱形接近已学习的正常基线${anomaly === null ? "" : `，偏离 ${anomaly.toFixed(0)}/100`}。主要能量集中在 ${bands[0] ?? "叶频附近"}，未见单一方向占优。`;
  } else if (status === "ok" && anomaly !== null && anomaly >= 65) {
    title = "偏离正常基线";
    summary = `与已学习基线偏离 ${anomaly.toFixed(0)}/100。频带证据：${bands.join("；")}。可能方向仅作排查提示，不是故障结论。`;
  } else if (lowConfidence && anomaly !== null && anomaly >= 65) {
    title = "把握不足 · 已偏离基线";
    summary = `与已学习基线偏离 ${anomaly.toFixed(0)}/100。频带证据：${bands.join("；")}。可能方向仅作排查提示，不是故障结论。`;
  } else if (lowConfidence) {
    title = "把握不足";
    summary = `样本或运行状态还不够稳定，只能给出偏离程度与频带证据。${anomaly === null ? "基线尚未满足 ≥30 帧 / ≥3 工况档。" : `偏离 ${anomaly.toFixed(0)}/100。`}可能方向：${DIRECTION_TITLE[top.id]}。`;
  } else {
    title = "特征分散";
    summary = `没有单一方向占据明显优势。频带证据：${bands.join("；")}；相对最突出的是“${DIRECTION_TITLE[top.id]}”。仅供排查参考。`;
  }

  const severity: Severity = ((): Severity => {
    if (title === "运转平稳") return "正常";
    if (status === "ok" && decided !== "healthy" && top.probability >= 55 && anomaly !== null && anomaly >= 65) return "警告";
    return "关注";
  })();

  return {
    status,
    priority: status === "low_confidence" ? "low_confidence" : "normal",
    title,
    summary,
    confidence,
    confidencePct,
    severity,
    evidence: [
      ...baseEvidence,
      `正常指纹偏离 ${anomaly === null ? "基线未满足门槛" : `${anomaly.toFixed(0)}/100`} · 基线 ${f.baselineFrames ?? f.baselineCount ?? 0} 帧 / ${f.baselineBuckets ?? 0} 档`,
      ...(f.agc ? ["AGC 同步平移"] : []),
    ],
    excluded: negativeEvidence(f, reliable),
    action: `${DIRECTION_ACTION[status === "ok" ? decided : top.id]} 声学线索不能替代振动检测与拆检。`,
    directions,
    anomaly,
  };
}
