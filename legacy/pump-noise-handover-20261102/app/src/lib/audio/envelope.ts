/**
 * 包络谱分析：带通 → 解析信号 → 包络 → 低频 FFT。
 * 轴承/扫膛等周期冲击会在包络谱上留下 BPFO/BPFI/BSF/FTF 及其谐波。
 */

import { fft, hann, ifft, isPow2 } from "./fft";

export type BearingKey = "BPFO" | "BPFI" | "BSF" | "FTF";

/** 通用滚动轴承特征阶次（9 球、d/D≈0.20 的典型值），用于近似定位，不替代轴承台账。 */
export const BEARING_ORDERS: { key: BearingKey; order: number; label: string }[] = [
  { key: "BPFO", order: 3.58, label: "外圈" },
  { key: "BPFI", order: 5.42, label: "内圈" },
  { key: "BSF", order: 2.36, label: "滚动体" },
  { key: "FTF", order: 0.398, label: "保持架" },
];

export type BearingMatch = {
  key: BearingKey;
  order: number;
  hz: number;
  levelDb: number;
  snrDb: number;
  score: number;
};

export type EnvelopePeak = { hz: number; order: number; db: number; prominence: number };

export type EnvelopeSummary = {
  sampleRate: number;
  fftSize: number;
  df: number;
  band: [number, number];
  spectrumDb: Float32Array;
  peaks: EnvelopePeak[];
  /** 最强冲击重复频率（Hz）与其转频阶次 */
  repHz: number;
  repOrder: number;
  /** 最强包络峰的相对强度，0–1 */
  strongest: number;
  matches: BearingMatch[];
  /** 轴承特征综合得分 0–1 */
  bearingScore: number;
  /** 高频突发（汽蚀/碰磨）得分 0–1 */
  burstScore: number;
  /** 包络峭度，高斯约 2 */
  envKurtosis: number;
};

function soft(x: number, lo: number, hi: number) {
  return Math.max(0, Math.min(1, (x - lo) / (hi - lo || 1)));
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function envelopeAnalysis(frame: Float32Array, sampleRate: number, f0: number): EnvelopeSummary {
  const n = frame.length;
  const minHz = Math.max(1500, f0 * 10);
  const maxHz = Math.min(6000, sampleRate * 0.46);
  const band: [number, number] = [minHz, maxHz];

  if (!isPow2(n) || n < 1024) {
    return emptySummary(sampleRate, n, band);
  }

  let mean = 0;
  for (let i = 0; i < n; i++) mean += frame[i] ?? 0;
  mean /= n;

  const w = hann(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = ((frame[i] ?? 0) - mean) * w[i]!;
  fft(re, im);

  const i1 = Math.max(1, Math.floor((band[0] * n) / sampleRate));
  const i2 = Math.min(n / 2 - 1, Math.ceil((band[1] * n) / sampleRate));
  for (let k = 0; k < n; k++) {
    const inBand = k >= i1 && k <= i2;
    if (inBand) {
      re[k] *= 2;
      im[k] *= 2;
    } else {
      re[k] = 0;
      im[k] = 0;
    }
  }
  ifft(re, im);

  // 包络：解析信号的模。
  const env = new Float64Array(n);
  let envMean = 0;
  for (let i = 0; i < n; i++) {
    env[i] = Math.hypot(re[i]!, im[i]!);
    envMean += env[i]!;
  }
  envMean /= n;

  const envW = hann(n);
  const ere = new Float64Array(n);
  const eim = new Float64Array(n);
  let m2 = 0;
  let m4 = 0;
  for (let i = 0; i < n; i++) {
    const v = env[i]! - envMean;
    m2 += v * v;
    m4 += v * v * v * v;
    ere[i] = v * envW[i]!;
  }
  m2 /= n;
  m4 /= n;
  const envKurtosis = m2 > 1e-20 ? m4 / (m2 * m2) : 0;
  fft(ere, eim);

  const bins = n / 2 + 1;
  const power = new Float64Array(bins);
  for (let k = 0; k < bins; k++) {
    power[k] = ere[k]! * ere[k]! + eim[k]! * eim[k]!;
  }
  const df = sampleRate / n;
  const searchMax = Math.min(sampleRate / 2, Math.max(500, f0 * 6.5));
  const kMax = Math.min(bins - 1, Math.floor(searchMax / df));
  const kMin = Math.max(1, Math.floor((Math.max(2, f0 * 0.18)) / df));

  // 包络谱本底：搜索区间中位数。
  const slice = Array.from(power.slice(kMin, kMax + 1)).sort((a, b) => a - b);
  const floor = slice.length ? slice[Math.floor(slice.length / 2)]! : 1e-22;
  const safeFloor = Math.max(floor, 1e-22);

  const spectrumDb = new Float32Array(bins);
  for (let k = 0; k < bins; k++) {
    spectrumDb[k] = 10 * Math.log10(Math.max(power[k]!, 1e-22) / safeFloor);
  }

  const peaks: EnvelopePeak[] = [];
  for (let k = Math.max(2, kMin); k < kMax - 1; k++) {
    const v = power[k]!;
    if (v <= power[k - 1]! || v < power[k + 1]!) continue;
    let local = 0;
    for (let j = k - 6; j <= k + 6; j++) {
      if (j >= 1 && j < bins) local += power[j]!;
    }
    local /= 13;
    const prom = 10 * Math.log10(Math.max(v, 1e-22) / Math.max(local, 1e-22));
    if (prom < 3) continue;
    peaks.push({ hz: k * df, order: k * df / Math.max(1, f0), db: 10 * Math.log10(Math.max(v, 1e-22)), prominence: prom });
  }
  peaks.sort((a, b) => b.prominence - a.prominence);
  const top = peaks.slice(0, 8);
  const strongest = soft(top[0]?.prominence ?? 0, 4, 16);
  const repHz = top[0]?.hz ?? 0;
  const repOrder = top[0]?.order ?? 0;

  const matches: BearingMatch[] = BEARING_ORDERS.map((item) => {
    const hz = item.order * f0;
    const center = Math.round(hz / df);
    let level = 0;
    const half = Math.max(1, Math.round(center * 0.012));
    for (let k = Math.max(1, center - half); k <= Math.min(bins - 1, center + half); k++) {
      level = Math.max(level, power[k]!);
    }
    const snrDb = 10 * Math.log10(Math.max(level, 1e-22) / safeFloor);
    const score = soft(snrDb, 4, 16) * (item.key === "FTF" ? 0.6 : 1);
    return {
      key: item.key,
      order: item.order,
      hz,
      levelDb: 10 * Math.log10(Math.max(level, 1e-22)),
      snrDb: clamp(snrDb, -10, 60),
      score,
    };
  });
  const bearingScore = Math.max(...matches.map((m) => m.score));

  return {
    sampleRate,
    fftSize: n,
    df,
    band,
    spectrumDb,
    peaks: top,
    repHz,
    repOrder,
    strongest,
    matches,
    bearingScore: clamp(bearingScore, 0, 1),
    burstScore: clamp(soft(envKurtosis, 2.6, 7), 0, 1),
    envKurtosis,
  };
}

function emptySummary(sampleRate: number, n: number, band: [number, number]): EnvelopeSummary {
  return {
    sampleRate,
    fftSize: n,
    df: n > 0 ? sampleRate / n : 0,
    band,
    spectrumDb: new Float32Array(0),
    peaks: [],
    repHz: 0,
    repOrder: 0,
    strongest: 0,
    matches: BEARING_ORDERS.map((item) => ({
      key: item.key,
      order: item.order,
      hz: 0,
      levelDb: -200,
      snrDb: -10,
      score: 0,
    })),
    bearingScore: 0,
    burstScore: 0,
    envKurtosis: 0,
  };
}
