import { bandPower, median, orderPower } from "./fft.ts";

export type SpectralFeatures = {
  dominantHz: number;
  flatness: number;
  hfRatio: number;
  oneXRatio: number;
  twoXRatio: number;
  bpfRatio: number;
  halfRatio: number;
  harmonicCount: number;
  /** 8 个相对频带电平（dB re 总能量），用于工况无关的正常指纹 */
  bandDb: number[];
  /** 1×、2×、BPF/TPF、半阶次的绝对电平（dB re 总能量） */
  orderDb: { oneX: number; twoX: number; bpf: number; half: number };
  /** 上述谱线相对噪声底的 SNR（dB），用于判断谱线是否可信 */
  orderSnr: { oneX: number; twoX: number; bpf: number; half: number };
};

export const FEATURE_BANDS: { key: string; f1: number; f2: number }[] = [
  { key: "40–80", f1: 40, f2: 80 },
  { key: "80–160", f1: 80, f2: 160 },
  { key: "160–315", f1: 160, f2: 315 },
  { key: "315–630", f1: 315, f2: 630 },
  { key: "630–1250", f1: 630, f2: 1250 },
  { key: "1.25–2.5k", f1: 1250, f2: 2500 },
  { key: "2.5–5k", f1: 2500, f2: 5000 },
  { key: "5–10k", f1: 5000, f2: 10000 },
];

function db(p: number) {
  return 10 * Math.log10(Math.max(p, 1e-22));
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 噪声底窄带能量：有逐点噪声谱时直接求和，否则用区间中位数近似。 */
function noiseAround(
  noise: Float64Array | null,
  power: Float64Array,
  sampleRate: number,
  fftSize: number,
  hz: number,
  iLo: number,
  iHi: number,
) {
  if (noise) return orderPower(noise, sampleRate, fftSize, hz);
  const floor = median(power, iLo, iHi);
  const center = Math.round((hz * fftSize) / sampleRate);
  const half = Math.max(1, Math.round(center * 0.045));
  return Math.max(floor, 1e-22) * (2 * half + 1);
}

export function featuresFromPower(
  power: Float64Array,
  noise: Float64Array | null,
  sampleRate: number,
  fftSize: number,
  rpm: number,
  blades: number,
): SpectralFeatures {
  const n = power.length;
  const iLo = Math.max(1, Math.floor((200 * fftSize) / sampleRate));
  const iHi = Math.min(n - 1, Math.floor((8000 * fftSize) / sampleRate));

  const minBin = Math.max(2, Math.floor((20 * fftSize) / sampleRate));
  const maxBin = Math.min(n - 2, Math.floor((5000 * fftSize) / sampleRate));
  let maxI = minBin;
  for (let i = minBin; i <= maxBin; i++) if (power[i]! > power[maxI]!) maxI = i;
  const a = db(power[maxI - 1] ?? 1e-22);
  const b = db(power[maxI] ?? 1e-22);
  const c = db(power[maxI + 1] ?? 1e-22);
  const denom = a - 2 * b + c;
  const delta = denom === 0 ? 0 : 0.5 * (a - c) / denom;
  const dominantHz = Math.max(0, (maxI + delta) * sampleRate / fftSize);

  let logSum = 0;
  let sum = 0;
  let count = 0;
  for (let i = iLo; i <= iHi; i++) {
    const mag = Math.sqrt(power[i]!);
    sum += mag;
    logSum += Math.log(mag + 1e-16);
    count++;
  }
  const flatness = count > 0 && sum > 0 ? Math.exp(logSum / count) / (sum / count) : 0;

  const hf = bandPower(power, sampleRate, fftSize, 2000, 8000);
  const lf = bandPower(power, sampleRate, fftSize, 40, 500);
  const hfRatio = hf / Math.max(lf, 1e-18);

  const total = bandPower(power, sampleRate, fftSize, 40, 10000);
  const bandDb = FEATURE_BANDS.map((band) => clamp(db(bandPower(power, sampleRate, fftSize, band.f1, band.f2) / Math.max(total, 1e-22)), -120, 6));

  const f0 = rpm > 0 ? rpm / 60 : 0;
  let oneXRatio = 0;
  let twoXRatio = 0;
  let bpfRatio = 0;
  let halfRatio = 0;
  let harmonicCount = 0;
  const orderDb = { oneX: -120, twoX: -120, bpf: -120, half: -120 };
  const orderSnr = { oneX: -10, twoX: -10, bpf: -10, half: -10 };

  if (f0 >= 15) {
    const p1 = orderPower(power, sampleRate, fftSize, f0);
    const p2 = orderPower(power, sampleRate, fftSize, f0 * 2);
    const bpf = orderPower(power, sampleRate, fftSize, f0 * Math.max(2, blades));
    const halfFreq = [0.5, 1.5, 2.5, 3.5].map((k) => f0 * k);
    const halfP = halfFreq.reduce((acc, hz) => acc + orderPower(power, sampleRate, fftSize, hz), 0);
    const intP = [1, 2, 3, 4].reduce((acc, k) => acc + orderPower(power, sampleRate, fftSize, f0 * k), 0);
    const denomP = Math.max(bpf, 1e-18);
    oneXRatio = clamp(p1 / denomP, 0, 99);
    twoXRatio = clamp(p2 / denomP, 0, 99);
    bpfRatio = clamp(bpf / Math.max(p1, 1e-18), 0, 99);
    halfRatio = clamp(halfP / Math.max(intP, 1e-18), 0, 99);

    const harms: number[] = [];
    let loudest = 0;
    for (let h = 1; h <= 10; h++) {
      const p = orderPower(power, sampleRate, fftSize, f0 * h);
      harms.push(p);
      if (p > loudest) loudest = p;
    }
    const gate = loudest * Math.pow(10, -12 / 10);
    harmonicCount = harms.filter((p) => p >= gate && p > 0).length;

    orderDb.oneX = clamp(db(p1 / Math.max(total, 1e-22)), -120, 6);
    orderDb.twoX = clamp(db(p2 / Math.max(total, 1e-22)), -120, 6);
    orderDb.bpf = clamp(db(bpf / Math.max(total, 1e-22)), -120, 6);
    orderDb.half = clamp(db(halfP / Math.max(total, 1e-22)), -120, 6);

    const snrOf = (hz: number, p: number) =>
      clamp(db(p / Math.max(noiseAround(noise, power, sampleRate, fftSize, hz, iLo, iHi), 1e-22)), -10, 60);
    orderSnr.oneX = snrOf(f0, p1);
    orderSnr.twoX = snrOf(f0 * 2, p2);
    orderSnr.bpf = snrOf(f0 * Math.max(2, blades), bpf);
    orderSnr.half = clamp(
      db((halfP / 4) / Math.max((noiseAround(noise, power, sampleRate, fftSize, f0 * 0.5, iLo, iHi) + noiseAround(noise, power, sampleRate, fftSize, f0 * 1.5, iLo, iHi) + noiseAround(noise, power, sampleRate, fftSize, f0 * 2.5, iLo, iHi) + noiseAround(noise, power, sampleRate, fftSize, f0 * 3.5, iLo, iHi)) / 4, 1e-22)),
      -10,
      60,
    );
  }

  return {
    dominantHz,
    flatness,
    hfRatio: clamp(hfRatio, 0, 99),
    oneXRatio,
    twoXRatio,
    bpfRatio,
    halfRatio,
    harmonicCount,
    bandDb,
    orderDb,
    orderSnr,
  };
}

/**
 * AnalyserNode 的 dB 谱版本（旧接口，保留给自检脚本与降级路径）。
 * 故障判决主路径使用 featuresFromPower，以便带入噪声底。
 */
export function spectralFeatures(
  dbSpectrum: Float32Array,
  sampleRate: number,
  fftSize: number,
  rpm: number,
  blades: number,
): SpectralFeatures {
  const power = new Float64Array(dbSpectrum.length);
  for (let i = 0; i < dbSpectrum.length; i++) {
    power[i] = Math.pow(10, Math.max(-200, dbSpectrum[i] ?? -140) / 10);
  }
  return featuresFromPower(power, null, sampleRate, fftSize, rpm, blades);
}
