/** Radix-2 FFT 与功率谱工具。仅用于本地分析，不依赖 Web Audio 的 AnalyserNode。 */

export function isPow2(n: number) {
  return n > 0 && (n & (n - 1)) === 0;
}

/** In-place complex FFT。`sign = -1` 为正变换，`1` 为逆变换（不含 1/n）。 */
export function fft(re: Float64Array, im: Float64Array, sign: -1 | 1 = -1) {
  const n = re.length;
  if (!isPow2(n)) throw new Error("fft size must be a power of two");
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]!;
      re[i] = re[j]!;
      re[j] = t;
      t = im[i]!;
      im[i] = im[j]!;
      im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len;
    const wRe0 = Math.cos(ang);
    const wIm0 = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cRe = 1;
      let cIm = 0;
      for (let j = 0; j < half; j++) {
        const aRe = re[i + j]!;
        const aIm = im[i + j]!;
        const bRe = re[i + j + half]!;
        const bIm = im[i + j + half]!;
        const tRe = bRe * cRe - bIm * cIm;
        const tIm = bRe * cIm + bIm * cRe;
        re[i + j] = aRe + tRe;
        im[i + j] = aIm + tIm;
        re[i + j + half] = aRe - tRe;
        im[i + j + half] = aIm - tIm;
        const nRe = cRe * wRe0 - cIm * wIm0;
        cIm = cRe * wIm0 + cIm * wRe0;
        cRe = nRe;
      }
    }
  }
}

/** 逆变换，结果含 1/n 归一化。 */
export function ifft(re: Float64Array, im: Float64Array) {
  fft(re, im, 1);
  const n = re.length;
  for (let i = 0; i < n; i++) {
    re[i] = re[i]! / n;
    im[i] = im[i]! / n;
  }
}

const windows = new Map<number, Float64Array>();

/** 周期 Hann 窗，均值平方为 0.375，便于功率谱标定。 */
export function hann(n: number) {
  const hit = windows.get(n);
  if (hit) return hit;
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  windows.set(n, w);
  return w;
}

export type PowerSpectrum = {
  power: Float64Array;
  /** 单边谱，k=0..n/2 */
  bins: number;
  fftSize: number;
  sampleRate: number;
  df: number;
  /** 时域均方值（窗函数已校正） */
  ms: number;
};

/**
 * 加 Hann 窗做功率谱。功率按 Parseval 标定，使 Σpower = 时域均方值，
 * 这样谱级可以直接与声级计路径对齐。
 */
export function powerSpectrum(frame: Float32Array, sampleRate: number): PowerSpectrum {
  const n = frame.length;
  if (!isPow2(n)) throw new Error("frame length must be a power of two");
  const w = hann(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = (frame[i] ?? 0) * w[i]!;
  fft(re, im);
  const bins = n / 2 + 1;
  const power = new Float64Array(bins);
  // Hann 窗均值平方 = 3/8。
  const norm = 1 / (n * n * 0.375);
  let ms = 0;
  for (let k = 0; k < bins; k++) {
    const p = ((re[k]! * re[k]! + im[k]! * im[k]!) * norm) * (k === 0 || k === n / 2 ? 1 : 2);
    power[k] = p;
    ms += p;
  }
  return { power, bins, fftSize: n, sampleRate, df: sampleRate / n, ms };
}

export function powerToDb(power: Float64Array, offsetDb = 0) {
  const out = new Float32Array(power.length);
  for (let i = 0; i < power.length; i++) {
    out[i] = 10 * Math.log10(Math.max(power[i]!, 1e-22)) + offsetDb;
  }
  return out;
}

/** 频带内功率和，索引按单边谱计算。 */
export function bandPower(power: Float64Array, sampleRate: number, fftSize: number, f1: number, f2: number) {
  const i1 = Math.max(0, Math.floor((f1 * fftSize) / sampleRate));
  const i2 = Math.min(power.length - 1, Math.ceil((f2 * fftSize) / sampleRate));
  let p = 0;
  for (let i = i1; i <= i2; i++) p += power[i]!;
  return p;
}

/** 窄带功率，带宽取中心频率的 ±4.5%，至少 ±1 个频点。 */
export function orderPower(power: Float64Array, sampleRate: number, fftSize: number, hz: number) {
  if (!(hz > 12) || !Number.isFinite(hz)) return 0;
  const center = Math.round((hz * fftSize) / sampleRate);
  if (center < 1 || center >= power.length) return 0;
  const half = Math.max(1, Math.round(center * 0.045));
  let p = 0;
  for (let i = Math.max(1, center - half); i <= Math.min(power.length - 1, center + half); i++) {
    p += power[i]!;
  }
  return p;
}

/** 排序后取中位数，作为包络谱、本底谱的鲁棒参考。 */
export function median(values: Float64Array, from = 0, to = values.length) {
  const copy = Array.from(values.slice(Math.max(0, from), Math.min(values.length, to)));
  if (!copy.length) return 0;
  copy.sort((a, b) => a - b);
  const mid = copy.length >> 1;
  return copy.length % 2 ? copy[mid]! : (copy[mid - 1]! + copy[mid]!) / 2;
}
