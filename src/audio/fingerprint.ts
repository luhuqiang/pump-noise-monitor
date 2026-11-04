/**
 * 正常指纹：把工况归一化后的特征向量做成轻量马氏距离（对角协方差）。
 * 只回答"和已学过的正常状态差多远"，不负责命名故障。
 *
 * 基线充分性门槛：≥30 帧、≥3 个工况档、麦克风位置进入 key；
 * 不满足时偏离分一律为 null，结论层只能给 low_confidence。
 *
 * 基线老化机制（评审 §2.1）：
 * - 每 90 天或每 500 运行小时提示复测；
 * - 异常连续 7 天：ageInfo 返回 needsResample，结论层同时提示"可能基线过期"；
 * - 维修事件 → recordMaintenance 直接 delete store[key]，旧基线作废。
 */

import type { SpectralFeatures } from "./features";
import type { EnvelopeSummary } from "./envelope";
import type { CrestGate } from "./event-rail";

const KEY = "pump-acoustic-baseline-v2";
const MAX_BUCKET_SAMPLES = 40;
const MAX_KEYS = 6;
export const MIN_BASELINE_FRAMES = 30;
export const MIN_BASELINE_BUCKETS = 3;

/** 老化阈值（评审 §2.1） */
export const BASELINE_AGE_DAYS = 90;
export const BASELINE_RUN_HOURS = 500;
export const BASELINE_ABNORMAL_DAYS = 7;
export const BASELINE_ANOMALY_THRESHOLD = 60;

export type BaselineBucket = {
  mean: number[];
  variance: number[];
  n: number;
};

export type Baseline = {
  buckets: Record<string, BaselineBucket>;
  frames: number;
  /** 基线版本号：每次维修事件 +1，旧版本自动作废 */
  version: number;
  /** 建立时间（ISO 字符串，毫秒精度） */
  createdAt: string;
  /** 最近一次被引擎访问的时间戳（ms），用于估算运行时长 */
  lastRunAt: number;
  /** 累计运行分钟数（engine 每 ~0.68 s 一帧时累加 ~0.011 min） */
  runMinutes: number;
  /** 最近一次 anomaly.score 超过阈值的时间戳（ms），0 表示从未异常 */
  lastAnomalyAt: number;
  /** anomaly.score 超阈值的连续天数（engine 每日 0 点重置） */
  consecutiveAbnormalDays: number;
  /** 摆位指纹：4–8 kHz / 1–2 kHz 能量比（自然对数域），未记录时 null */
  placementRatio: number | null;
  /** 摆位比值的历史标准差（对数域） */
  placementLogStd: number;
  /** 记录摆位比值时的设备指纹（换机后比值不可比） */
  placementDeviceId: string | null;
  /** 摆位超限的连续次数；≥2 才提示"疑似移动设备" */
  placementDriftStreak: number;
  /** 冲击门限（验收期冻结，随基线版本固化；null 表示未冻结） */
  crestGate: CrestGate | null;
  /** 建立基线时的轴频与 95% 不确定度（评审 17 §1） */
  shaftHz: number | null;
  shaftHzSigma: number | null;
  shaftCapturedAt: string | null;
};

export type AgeInfo = {
  daysSinceCreated: number;
  runHours: number;
  needsResample: boolean;
  /** 维修事件后旧基线已作废（store 里找不到这条 key） */
  maintenanceBlocked: boolean;
  notes: string[];
};

type Store = Record<string, Baseline>;

export type BaselineInfo = {
  ready: boolean;
  frames: number;
  buckets: number;
  needFrames: number;
  needBuckets: number;
};

export type ConditionBucket = "低负载" | "常用负载" | "高负载";

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const store = parsed as Store;
    // 兼容旧数据：补老化字段默认值
    for (const k of Object.keys(store)) {
      const b = store[k]!;
      if (b.version === undefined) b.version = 1;
      if (!b.createdAt) {
        const legacy = (b as { at?: string }).at;
        b.createdAt = legacy ?? new Date().toISOString();
      }
      if (b.lastRunAt === undefined) b.lastRunAt = 0;
      if (b.runMinutes === undefined) b.runMinutes = 0;
      if (b.lastAnomalyAt === undefined) b.lastAnomalyAt = 0;
      if (b.consecutiveAbnormalDays === undefined) b.consecutiveAbnormalDays = 0;
      if (b.placementRatio === undefined) b.placementRatio = null;
      if (b.placementLogStd === undefined) b.placementLogStd = 0.12;
      if (b.placementDeviceId === undefined) b.placementDeviceId = null;
      if (b.placementDriftStreak === undefined) b.placementDriftStreak = 0;
      if (b.crestGate === undefined) b.crestGate = null;
      if (b.shaftHz === undefined) b.shaftHz = null;
      if (b.shaftHzSigma === undefined) b.shaftHzSigma = null;
      if (b.shaftCapturedAt === undefined) b.shaftCapturedAt = null;
    }
    return store;
  } catch {
    return {};
  }
}

function write(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* 隐私模式忽略 */
  }
}

/** 测点键：泵型 + 型号 + 测点距离 + 麦克风朝向。 */
export function deviceKey(pumpType: string, model: string, distance: number, micDir: string) {
  const tag = model.trim().slice(0, 24) || "未填写";
  const dir = micDir.trim().slice(0, 16) || "未填写";
  return `${pumpType}|${tag}|${Number.isFinite(distance) ? distance.toFixed(2) : "?"}m|${dir}`;
}

/** 基线键：测点键 + 背景谱版本号。 */
export function baselineKey(device: string, bgVersion: number) {
  return `${device}|bg${Math.max(0, Math.round(bgVersion))}`;
}

export function conditionBucket(loadRatio: number): ConditionBucket {
  const r = Number.isFinite(loadRatio) ? loadRatio : 1;
  if (r < 0.7) return "低负载";
  if (r > 1.05) return "高负载";
  return "常用负载";
}

export function loadBaseline(key: string): Baseline | null {
  const b = read()[key];
  if (!b || !b.buckets || typeof b.buckets !== "object") return null;
  return b;
}

/** 用户显式重置/重建基线：删除旧数据并返回"下一个版本号"。
 * 版本号由调用方保存，之后每次 learnBaseline 都写入新基线，并进入每份报告。 */
export function resetBaseline(key: string): number {
  const store = read();
  const nextVersion = (store[key]?.version ?? 0) + 1;
  delete store[key];
  write(store);
  return nextVersion;
}

export function baselineInfo(baseline: Baseline | null): BaselineInfo {
  const frames = baseline?.frames ?? 0;
  const buckets = baseline ? Object.keys(baseline.buckets).length : 0;
  return {
    ready: frames >= MIN_BASELINE_FRAMES && buckets >= MIN_BASELINE_BUCKETS,
    frames,
    buckets,
    needFrames: Math.max(0, MIN_BASELINE_FRAMES - frames),
    needBuckets: Math.max(0, MIN_BASELINE_BUCKETS - buckets),
  };
}

export function learnBaseline(
  key: string,
  vector: number[],
  bucket: string,
  opts?: {
    placementRatio?: number | null;
    version?: number;
    /** 本次重建时冻结的冲击门限（评审 17 §2） */
    crestGate?: CrestGate | null;
    /** 建立基线时的轴频与 95% 不确定度（评审 17 §1） */
    shaft?: { hz: number; sigmaHz: number } | null;
    /** 当前设备指纹（换机后摆位比值不可比） */
    deviceId?: string | null;
  },
): Baseline | null {
  if (!vector.length) return null;
  const store = read();
  const prev = store[key];
  const buckets = prev ? { ...prev.buckets } : {};
  const old = buckets[bucket];
  let next: BaselineBucket;
  if (!old || old.mean.length !== vector.length) {
    next = { mean: vector.slice(), variance: vector.map(() => 0.01), n: 1 };
  } else if (old.n >= MAX_BUCKET_SAMPLES) {
    next = old;
  } else {
    const n = old.n + 1;
    const mean = old.mean.map((m, i) => m + ((vector[i] ?? m) - m) / n);
    const variance = old.variance.map((v, i) => {
      const oldMean = old.mean[i] ?? 0;
      const newMean = mean[i] ?? oldMean;
      return ((n - 1) * v + ((vector[i] ?? oldMean) - oldMean) * ((vector[i] ?? oldMean) - newMean)) / n;
    });
    next = { mean, variance, n };
  }
  buckets[bucket] = next;
  const now = Date.now();
  // 摆位指纹：只在同设备下比较；换机后旧比值不可比 → 重新标定（评审 17 §5）
  const prevFrames = prev?.frames ?? 0;
  const curRatio = Number.isFinite(opts?.placementRatio as number) ? (opts!.placementRatio as number) : null;
  const curDevice = opts?.deviceId ?? prev?.placementDeviceId ?? null;
  const deviceChanged =
    !!prev?.placementDeviceId && !!curDevice && prev.placementDeviceId !== curDevice;
  let placementRatio = deviceChanged ? null : (prev?.placementRatio ?? null);
  let placementLogStd = deviceChanged ? 0.12 : (prev?.placementLogStd ?? 0.12);
  // 换机后跳过 placementRatio 写入 —— 让新设备的 placementRatio 在下一次 learnBaseline（无 deviceChanged）时自然初始化
  if (curRatio !== null && !deviceChanged) {
    const n = prevFrames + 1;
    if (placementRatio === null) {
      placementRatio = curRatio;
      placementLogStd = 0.12;
    } else {
      const oldMean = placementRatio;
      const newMean = oldMean + (curRatio - oldMean) / n;
      const spread = Math.abs(curRatio - oldMean);
      placementLogStd = Math.sqrt(((n - 1) * placementLogStd * placementLogStd + spread * spread) / n);
      placementRatio = newMean;
    }
  }
  const shaft = opts?.shaft && Number.isFinite(opts.shaft.hz) ? opts.shaft : null;
  const baseline: Baseline = {
    buckets,
    frames: prevFrames + 1,
    version: opts?.version ?? prev?.version ?? 1,
    createdAt: prev?.createdAt ?? new Date(now).toISOString(),
    lastRunAt: now,
    runMinutes: prev?.runMinutes ?? 0,
    lastAnomalyAt: prev?.lastAnomalyAt ?? 0,
    consecutiveAbnormalDays: prev?.consecutiveAbnormalDays ?? 0,
    placementRatio,
    placementLogStd,
    placementDeviceId: curDevice,
    placementDriftStreak: deviceChanged ? 0 : (prev?.placementDriftStreak ?? 0),
    // 门限一旦冻结就随版本固化，运行期不再自动更新（评审 17 §2）
    crestGate: opts?.crestGate ?? prev?.crestGate ?? null,
    shaftHz: shaft?.hz ?? prev?.shaftHz ?? null,
    shaftHzSigma: shaft?.sigmaHz ?? prev?.shaftHzSigma ?? null,
    shaftCapturedAt: shaft ? new Date(now).toISOString() : (prev?.shaftCapturedAt ?? null),
  };
  if (!(key in store) && Object.keys(store).length >= MAX_KEYS) delete store[Object.keys(store)[0]!];
  store[key] = baseline;
  write(store);
  return baseline;
}

/** 验收期手动冻结冲击门限：只写入已有基线，不新增特征样本。 */
export function saveCrestGate(key: string, gate: CrestGate): boolean {
  const store = read();
  const b = store[key];
  if (!b) return false;
  b.crestGate = gate;
  write(store);
  return true;
}

function pooled(baseline: Baseline): { mean: number[]; variance: number[]; n: number } {
  const list = Object.values(baseline.buckets);
  if (!list.length) return { mean: [], variance: [], n: 0 };
  const len = Math.max(...list.map((b) => b.mean.length));
  const mean = new Array<number>(len).fill(0);
  const m2 = new Array<number>(len).fill(0);
  let n = 0;
  for (const b of list) {
    for (let i = 0; i < b.mean.length; i++) mean[i] = (mean[i] ?? 0) + (b.mean[i] ?? 0) * b.n;
    n += b.n;
  }
  if (n > 0) for (let i = 0; i < len; i++) mean[i] = (mean[i] ?? 0) / n;
  for (const b of list) {
    for (let i = 0; i < b.mean.length; i++) {
      const d = (b.mean[i] ?? 0) - (mean[i] ?? 0);
      m2[i] = (m2[i] ?? 0) + (b.variance[i] ?? 0) * b.n + d * d * b.n;
    }
  }
  const variance = m2.map((v) => (n > 0 ? v / n : 0.01));
  return { mean, variance, n };
}

export function anomalyOf(vector: number[], baseline: Baseline | null, bucket?: string) {
  const info = baselineInfo(baseline);
  if (!baseline || !info.ready || vector.length === 0) {
    return { distance: 0, score: null as number | null, n: baseline?.frames ?? 0, ...info };
  }
  const chosen = (bucket && baseline.buckets[bucket]) || pooled(baseline);
  if (chosen.mean.length !== vector.length) {
    return { distance: 0, score: null as number | null, n: info.frames, ...info };
  }
  let sum = 0;
  for (let i = 0; i < vector.length; i++) {
    const std = Math.sqrt(Math.max(chosen.variance[i] ?? 0, 1e-4));
    const z = ((vector[i] ?? 0) - (chosen.mean[i] ?? 0)) / std;
    sum += z * z;
  }
  const distance = Math.sqrt(sum / vector.length);
  const score = Math.max(0, Math.min(100, 100 * (1 - Math.exp(-distance / 2.2))));
  return { distance, score, n: info.frames, ...info };
}

/** 工况归一化特征向量：频带相对电平 + 谱形 + 阶次比 + 包络轴承阶次得分。 */
export function featureVector(
  f: SpectralFeatures,
  kurtosis: number,
  crest: number,
  env?: EnvelopeSummary | null,
): number[] {
  const lg = (v: number) => Math.log10(Math.max(v, 0.001));
  const matches = env?.matches ?? [];
  const envScore = (key: string) => matches.find((m) => m.key === key)?.score ?? 0;
  return [
    ...f.bandDb,
    f.flatness,
    lg(f.hfRatio + 0.05),
    Math.min(kurtosis, 20),
    Math.min(crest, 8),
    lg(f.oneXRatio + 0.05),
    lg(f.twoXRatio + 0.05),
    lg(f.bpfRatio + 0.05),
    lg(f.halfRatio + 0.05),
    envScore("BPFO"),
    envScore("BPFI"),
    envScore("BSF"),
    envScore("FTF"),
  ];
}

/**
 * engine 每 analyseBlock 调一次：更新 baseline 的访问时间、运行分钟数、
 * 以及 anomaly 统计（供 ageInfo 输出"异常持续 N 天"提示）。
 * 这比每次都调 ageInfo 便宜得多。
 */
export function updateBaselineAccess(key: string, nowMs: number, anomalyScore: number | null) {
  const store = read();
  const b = store[key];
  if (!b) return;
  const dt = b.lastRunAt ? (nowMs - b.lastRunAt) / 60000 : 0;
  // 每次访问约 0.68 s，累加 runMinutes；上限不超过 5 min（防止浏览器切后台时 dt 爆炸）
  if (dt > 0 && dt < 5) b.runMinutes += dt;
  b.lastRunAt = nowMs;

  if (anomalyScore !== null && anomalyScore >= BASELINE_ANOMALY_THRESHOLD) {
    // 上次异常距今跨天 → consecutiveAbnormalDays +1
    if (b.lastAnomalyAt > 0) {
      const diffDays = Math.floor((nowMs - b.lastAnomalyAt) / 86400000);
      if (diffDays >= 1) {
        b.consecutiveAbnormalDays = Math.min(b.consecutiveAbnormalDays + 1, 30);
      }
    } else {
      b.consecutiveAbnormalDays = 1;
    }
    b.lastAnomalyAt = nowMs;
  } else if (b.lastAnomalyAt > 0) {
    // 连续正常一天后重置 consecutiveAbnormalDays
    const diffDays = Math.floor((nowMs - b.lastAnomalyAt) / 86400000);
    if (diffDays >= 1) b.consecutiveAbnormalDays = 0;
  }

  store[key] = b;
  write(store);
}

/**
 * 维修事件：旧基线直接作废（delete store[key]），下次 learnBaseline 自然生成新版本。
 * 调用方在 UI 上给"已标记维修事件，建议重新采集基线"的提示。
 */
export function recordMaintenance(key: string) {
  const store = read();
  delete store[key];
  write(store);
}

/** 摆位指纹偏移门限（对数域，约 ±57% 能量比变化）。 */
export const PLACEMENT_DRIFT_THRESHOLD = 0.45;
/** 连续超限次数达到该值才提示"疑似移动设备"（评审 17 §5） */
export const PLACEMENT_DRIFT_STREAK_MIN = 2;

export type PlacementState = "ok" | "moved" | "device_changed" | "recalibration_suggested" | "uncalibrated";

export type PlacementCheck = {
  state: PlacementState;
  delta: number;
  /** 更新后的连续超限次数（由调用方持久化） */
  streak: number;
};

/** 换机判定时用于"其余一致性指标"的输入。 */
export type PlacementConsistency = {
  /** 相对正常基线的偏离分 0–100；null 表示基线未满足门槛 */
  anomalyScore: number | null;
};

/**
 * 摆位指纹（评审 16 §3.2 / 17 §5）：4–8 kHz 与 1–2 kHz 能量比对测点位置敏感、
 * 对工况相对不敏感。但该比值同时受手机型号频响、距离与背景噪声影响，所以：
 *   - 只在**同设备**下比较；换机 → 按"需重新标定"处理，不告警；
 *   - UA 会随浏览器升级漂移，换机判据改为稳定设备签名，并再看其余一致性：
 *     基线偏离仍正常 → 降级为"建议复标定"（recalibration_suggested），不判移动；
 *   - 连续两次超限才提示"疑似移动设备"。
 */
export function placementCheck(
  baseline: Baseline | null,
  currentRatio: number | null,
  currentDeviceId: string,
  consistency?: PlacementConsistency,
): PlacementCheck | null {
  if (!baseline) return null;
  if (baseline.placementDeviceId && currentDeviceId && baseline.placementDeviceId !== currentDeviceId) {
    const score = consistency?.anomalyScore ?? null;
    const otherwiseNormal = score !== null && score < BASELINE_ANOMALY_THRESHOLD;
    return {
      state: otherwiseNormal ? "recalibration_suggested" : "device_changed",
      delta: 0,
      streak: 0,
    };
  }
  if (baseline.placementRatio === null || currentRatio === null || !Number.isFinite(currentRatio)) {
    return { state: "uncalibrated", delta: 0, streak: 0 };
  }
  const delta = Math.abs(currentRatio - baseline.placementRatio);
  const limit = Math.max(PLACEMENT_DRIFT_THRESHOLD, baseline.placementLogStd * 3);
  if (delta <= limit) return { state: "ok", delta, streak: 0 };
  const streak = baseline.placementDriftStreak + 1;
  return {
    state: streak >= PLACEMENT_DRIFT_STREAK_MIN ? "moved" : "ok",
    delta,
    streak,
  };
}

/** 持久化摆位超限的连续次数（只在变化时落盘）。 */
export function updatePlacementStreak(key: string, streak: number) {
  const store = read();
  const b = store[key];
  if (!b || b.placementDriftStreak === streak) return;
  b.placementDriftStreak = streak;
  store[key] = b;
  write(store);
}

/**
 * 设备指纹：用来判断"是否换了手机"。
 * 不能用整段 UA：浏览器升级会改版本号，导致每升级一次就被判"换机"。
 * 这里只取平台 + 机型（Android 去掉 Build/版本号），对 UA 版本漂移不敏感。
 */
export function captureDeviceId(): string {
  try {
    const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
    if (!ua) return "unknown";
    const android = /Android[^;]*;\s*([^;)]+)/.exec(ua);
    const model = android?.[1]
      ? android[1].split(" Build/")[0]!.split(";").pop()!.trim()
      : /(iPhone|iPad|iPod)/.exec(ua)?.[1] ?? "";
    const platform = /Windows NT|Macintosh|CrOS|Linux/.exec(ua)?.[0] ?? "";
    return `${platform || "other"}|${model || "unknown"}`.slice(0, 80);
  } catch {
    return "unknown";
  }
}

/** 基线老化检查（评审 15 §2.1 / 16 §3.1）。consecutiveAbnormalDays 只用于提示，
 * 绝不自动滚动基线——自动更新等于用异常定义正常。 */
export function ageInfo(baseline: Baseline | null, nowMs: number, key?: string): AgeInfo {
  const notes: string[] = [];
  if (!baseline) {
    return {
      daysSinceCreated: 0,
      runHours: 0,
      needsResample: true,
      maintenanceBlocked: key ? true : false,
      notes: ["基线未建立或已被维修事件作废，需重新采集"],
    };
  }
  const createdAt = new Date(baseline.createdAt).getTime();
  const daysSinceCreated = Math.max(0, Math.floor((nowMs - createdAt) / 86400000));
  const runHours = baseline.runMinutes / 60;

  if (daysSinceCreated >= BASELINE_AGE_DAYS) notes.push(`基线已存在 ${daysSinceCreated} 天（门限 ${BASELINE_AGE_DAYS} 天）`);
  if (runHours >= BASELINE_RUN_HOURS) notes.push(`累计运行 ${runHours.toFixed(0)} 小时（门限 ${BASELINE_RUN_HOURS} 小时）`);
  if (baseline.consecutiveAbnormalDays >= BASELINE_ABNORMAL_DAYS) {
    notes.push(
      `连续 ${baseline.consecutiveAbnormalDays} 天出现偏离，也可能是基线过期而非泵真故障；重建须手动确认，系统不会自动更新基线`,
    );
  }

  const needsResample = notes.length > 0;
  return {
    daysSinceCreated,
    runHours,
    needsResample,
    maintenanceBlocked: false,
    notes,
  };
}
