/**
 * 单麦克风降噪：最小值统计跟踪噪声底 + 判决引导的先验信噪比 + Wiener/MMSE 谱增益。
 * 降噪结果只用于可视化与 SNR 估计，故障判决始终使用原始谱（见 engine.ts）。
 */

export type DenoiseFrame = {
  cleanPower: Float64Array;
  noisePower: Float64Array;
  /** 全带 SNR = 10 lg(ΣP / ΣN) */
  snrDb: number;
  /** 分带 SNR：40–500 Hz、500–2000 Hz、2–8 kHz */
  bandSnr: [number, number, number];
  /** 各频带降噪前后能量保留率 */
  retention: [number, number, number];
  /** 保留率均值，1 表示几乎没动 */
  fidelity: number;
  /** 音乐噪声指标：增益处于中间区的频点占比，越低越好 */
  music: number;
  /** 噪声底全带电平（dB re 输入均方） */
  floorDb: number;
};

const MIN_GAIN = 0.06;
const DD_ALPHA = 0.98;

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

export class Denoiser {
  private noise: Float64Array | null = null;
  private gain: Float64Array | null = null;
  private prevGamma: Float64Array | null = null;

  reset() {
    this.noise = null;
    this.gain = null;
    this.prevGamma = null;
  }

  private ensure(n: number) {
    if (!this.noise || this.noise.length !== n) {
      this.noise = new Float64Array(n);
      this.gain = new Float64Array(n).fill(1);
      this.prevGamma = new Float64Array(n).fill(1);
      this.noise.fill(0);
      this.ready = false;
    }
  }

  private ready = false;

  update(power: Float64Array, sampleRate: number, fftSize: number): DenoiseFrame {
    const n = power.length;
    this.ensure(n);
    const noise = this.noise!;
    const gain = this.gain!;
    const prevGamma = this.prevGamma!;
    if (!this.ready) {
      for (let k = 0; k < n; k++) noise[k] = Math.max(power[k]! * 0.5, 1e-22);
      this.ready = true;
    }

    const clean = new Float64Array(n);
    let musicCount = 0;
    let active = 0;
    for (let k = 0; k < n; k++) {
      const p = power[k]!;
      const nk = noise[k]!;
      // 噪声底：向下快速跟随，向上缓慢爬升；远离底噪的谱线不会被吞掉。
      if (p < nk) noise[k] = nk * 0.65 + p * 0.35;
      else {
        const r = p / Math.max(nk, 1e-22);
        noise[k] = Math.min(p, nk * (r < 1.3 ? 1.02 : 1.0006));
      }
      const gamma = clamp(p / Math.max(noise[k]!, 1e-22), 1e-6, 1e6);
      const xi = DD_ALPHA * gain[k]! * gain[k]! * prevGamma[k]! + (1 - DD_ALPHA) * Math.max(0, gamma - 1);
      const g = Math.max(MIN_GAIN, xi / (1 + xi));
      gain[k] = g;
      prevGamma[k] = gamma;
      clean[k] = g * g * p;
      if (p > noise[k]! * 4) {
        active++;
        if (g > MIN_GAIN + 0.02 && g < 0.4) musicCount++;
      }
    }

    // 频率方向 3 点平滑，压低音乐噪声的孤立频点。
    for (let k = 1; k < n - 1; k++) {
      gain[k] = 0.25 * gain[k - 1]! + 0.5 * gain[k]! + 0.25 * gain[k + 1]!;
    }

    // 用平滑后的增益重算输出。
    for (let k = 0; k < n; k++) clean[k] = gain[k]! * gain[k]! * power[k]!;

    let sumP = 0;
    let sumN = 0;
    for (let k = 1; k < n; k++) {
      sumP += power[k]!;
      sumN += noise[k]!;
    }
    const snrDb = clamp(10 * Math.log10(Math.max(sumP, 1e-22) / Math.max(sumN, 1e-22)), -10, 80);

    const band = (f1: number, f2: number) => {
      const i1 = Math.max(1, Math.floor((f1 * fftSize) / sampleRate));
      const i2 = Math.min(n - 1, Math.ceil((f2 * fftSize) / sampleRate));
      let rp = 0;
      let cp = 0;
      let np = 0;
      for (let k = i1; k <= i2; k++) {
        rp += power[k]!;
        cp += clean[k]!;
        np += noise[k]!;
      }
      return { rp, cp, np };
    };
    const low = band(40, 500);
    const mid = band(500, 2000);
    const high = band(2000, 8000);
    const snrOf = (b: { rp: number; np: number }) =>
      clamp(10 * Math.log10(Math.max(b.rp, 1e-22) / Math.max(b.np, 1e-22)), -10, 80);
    const retentionOf = (b: { rp: number; cp: number }) =>
      clamp(b.rp > 1e-20 ? b.cp / b.rp : 1, 0, 1);

    const retention: [number, number, number] = [retentionOf(low), retentionOf(mid), retentionOf(high)];
    const bandSnr: [number, number, number] = [snrOf(low), snrOf(mid), snrOf(high)];

    return {
      cleanPower: clean,
      noisePower: noise.slice(),
      snrDb,
      bandSnr,
      retention,
      fidelity: clamp((retention[0] + retention[1] + retention[2]) / 3, 0, 1),
      music: active ? musicCount / active : 0,
      floorDb: 10 * Math.log10(Math.max(sumN, 1e-22)),
    };
  }
}
