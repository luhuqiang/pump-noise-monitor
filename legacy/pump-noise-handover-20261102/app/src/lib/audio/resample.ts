/**
 * 采样率降级路径（评审 16 §2.1）。
 *
 * 部分设备音频硬件只支持 44.1 kHz，浏览器无法给出 48 kHz 的 AudioContext。
 * 此时不能继续 close + restart（会无限重启），只能在内部把 44.1 kHz
 * 带限重采样到 48 kHz 继续分析，同时由 validity 标 invalid：
 * "采样率非 48k，阶次结论不可用"。
 *
 * 用 Hann 窗 sinc 插值（16 抽头），保证 1 kHz 基准音的频率与幅度不失真；
 * 降采样时截止频率按 ratio 收缩，避免混叠。
 */

export const RESAMPLE_TARGET = 48000;

const TAPS = 16;
const HALF = TAPS / 2;

/** 任意采样率 → 48 kHz。输入已是 48k 时原样返回。 */
export function resampleTo48k(input: Float32Array, sr: number): Float32Array {
  if (!Number.isFinite(sr) || sr <= 0) return input;
  if (Math.abs(sr - RESAMPLE_TARGET) <= 1) return input;
  const ratio = RESAMPLE_TARGET / sr;
  const outLen = Math.max(1, Math.floor(input.length * ratio));
  const out = new Float32Array(outLen);
  // 降采样时把截止频率压到新的 Nyquist 以内
  const fc = Math.min(1, ratio) * 0.95;

  for (let i = 0; i < outLen; i++) {
    const t = i / ratio;
    const i0 = Math.floor(t);
    let sum = 0;
    for (let k = -HALF + 1; k <= HALF; k++) {
      const idx = i0 + k;
      if (idx < 0 || idx >= input.length) continue;
      const x = t - idx;
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * fc * x) / (Math.PI * fc * x);
      const win = 0.5 + 0.5 * Math.cos((Math.PI * x) / HALF);
      sum += (input[idx] ?? 0) * sinc * win;
    }
    // 归一化：∑ sinc(fc·k) ≈ 1/fc，乘以 fc 把通带增益拉回 0 dB。
    out[i] = sum * fc;
  }
  return out;
}

/** 取不大于 n 的最大 2 的幂。FFT 要求长度是 2 的幂，重采样后截断尾部即可。 */
export function floorPow2(n: number): number {
  if (n < 1) return 1;
  return 1 << (31 - Math.clz32(n));
}
