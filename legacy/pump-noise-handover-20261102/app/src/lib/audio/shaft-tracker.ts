/**
 * 轴频跟踪：从功率谱上估计谐波梳的真实基频，
 * 再与铭牌额定转速交叉校验（评审 15 §2.2 / 16 §2.3 / 17 §1、§4）。
 *
 * 精度（评审 17 §1）：0.68 s 窗 Δf≈1.47 Hz，46 Hz 上就是 3.2%——
 * 单帧谱峰撑不起"判 5%"这种结论。所以改为：
 *   1. 谐波联合拟合：1×–5× 谱峰做抛物线插值后，按梳状谱线性回归取斜率，
 *      等效孔径扩大到 5×，分辨率约提升 1/N；
 *   2. 多窗累计：最近 4 s 内的独立窗按 1/σ² 加权合并；
 *   3. 每次都给 ±95% 不确定度，偏差必须超过 3σ 才允许判"不符"。
 *
 * 防倍频锁定（评审 16 §2.3 / 17 §4）：
 *   1. 多个候选得分接近时，优先取**最低的强基频**；
 *   2. 1/2× 与 1/3× 亚谐波位置**同时**出现谱线，且这些位置不与主梳的
 *      整数阶重合，才判"存在亚谐波"；
 *   3. SNR 不足时只能说"转速不确定"，不能说"无亚谐波"——两种失败方向不同。
 */

export type ShaftTrack = {
  /** 从谱上跟踪到的实际轴频（Hz）；ambiguous 时为 0 */
  trackedF0: number;
  /** 轴频的 95% 不确定度（±Hz）；单窗估计或累计后的结果 */
  trackedF0UncertaintyHz: number;
  /** 铭牌额定轴频（rpm/60，Hz） */
  ratedF0: number;
  /** 实际与额定的相对偏差（%），ambiguous 时为 NaN */
  rpmDeltaPct: number;
  /** 相对偏差的不确定度（±%，95%） */
  rpmDeltaPctUncertainty: number;
  /** 偏差 ≤5%、梳强度足够、无亚谐波歧义且不确定度足够小时才可靠 */
  reliable: boolean;
  /** 偏差 >5% 且超出 3σ，才允许判"转速与铭牌不符" */
  mismatch: boolean;
  /** 候选 f0 搜索时看到的谐波梳强度（0–1） */
  combScore: number;
  /** 转速不确定（亚谐波成立，或谱线 SNR 不足） */
  ambiguous: boolean;
  /** 明确成立：1/2× 与 1/3× 亚谐波同时存在且非整数阶重合 */
  subharmonic: boolean;
  /** 1/2×、1/3× 分数阶位置出现谱线的占比（取较小者，0–1） */
  subharmonicRatio: number;
  /** 主梳谱线平均突出度（dB），用于 SNR 判据 */
  lineSnrDb: number;
  /** 谱线 SNR 不足，无法判定亚谐波有无 */
  insufficientSnr: boolean;
  /** 参与累计的独立窗数 */
  windowCount: number;
  /** 参与累计的时间跨度（秒） */
  spanSec: number;
};

export const SHAFT_TRACK_TOLERANCE_PCT = 5;
export const SHAFT_SEARCH_RATIO_LO = 0.4;
export const SHAFT_SEARCH_RATIO_HI = 1.6;
/** 候选得分 ≥ 0.75×最高分才算"强基频" */
const STRONG_CANDIDATE_RATIO = 0.75;
/** 亚谐波位置出现谱线的占比 ≥ 0.55 即视为成立（1/2× 与 1/3× 必须都成立） */
const SUBHARMONIC_AMBIGUITY = 0.55;
/** 谱线突出度门限（峰高 - 局部中位噪声底，dB）。低于此值视为噪声，不计分。 */
const MIN_LINE_PROMINENCE = 6;
/** 主梳谱线平均突出度低于此值 → SNR 不足，不能下"无亚谐波"结论 */
const MIN_DECISION_SNR_DB = 10;
/** 估计局部噪声底的半窗宽（bin） */
const LOCAL_HALF_WIDTH = 6;
/** 多窗累计：最多 6 窗、时间跨度不超过 4 s（评审 17 §1②） */
const MAX_ACCUM_WINDOWS = 6;
const MAX_ACCUM_SPAN_SEC = 4;
/** 不确定度下限：再干净的合成谱也不可能无限精确 */
const UNCERTAINTY_FLOOR_HZ = 0.1;
/** 偏差判"不符"的显著性倍数（95% 区间约 ±2σ，这里再保守取 3σ） */
const MISMATCH_SIGMA = 3;

function median(values: number[]): number {
  if (!values.length) return -160;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? -160) : (((s[mid - 1] ?? -160) + (s[mid] ?? -160)) / 2);
}

/**
 * 谱线突出度 = 峰高 − 局部中位噪声底。
 *
 * 不能用全谱分位数当噪声底：水泵谱的能量集中在低频、高频本底极低，
 * 10% 分位数会掉到 −150 dB，于是 −105 dB 的噪声 bin 也"高出噪声底 45 dB"，
 * 整条噪声地毯都被当成谱线，健康泵也会被判亚谐波歧义。
 */
function lineProminence(powerDb: number[], bin: number): number {
  if (bin < 1 || bin >= powerDb.length) return 0;
  let peak = powerDb[bin] ?? -160;
  for (const d of [-1, 1]) {
    const b = bin + d;
    if (b >= 1 && b < powerDb.length) {
      const v = powerDb[b] ?? -160;
      if (v > peak) peak = v;
    }
  }
  const lo = Math.max(1, bin - LOCAL_HALF_WIDTH);
  const hi = Math.min(powerDb.length - 1, bin + LOCAL_HALF_WIDTH);
  const local: number[] = [];
  for (let b = lo; b <= hi; b++) {
    if (Math.abs(b - bin) > 1) local.push(powerDb[b] ?? -160);
  }
  return peak - median(local);
}

/** 在给定 bin 附近取最大值，并做 dB 域抛物线插值到亚 bin 精度。 */
function peakNear(powerDb: number[], centerBin: number) {
  const lo = Math.max(1, centerBin - 3);
  const hi = Math.min(powerDb.length - 2, centerBin + 3);
  let best = lo;
  let bestVal = powerDb[lo] ?? -160;
  for (let b = lo + 1; b <= hi; b++) {
    const v = powerDb[b] ?? -160;
    if (v > bestVal) {
      bestVal = v;
      best = b;
    }
  }
  const ym = powerDb[best - 1] ?? bestVal;
  const y0 = powerDb[best] ?? bestVal;
  const yp = powerDb[best + 1] ?? bestVal;
  const denom = ym - 2 * y0 + yp;
  const delta = denom !== 0 ? 0.5 * (ym - yp) / denom : 0;
  const frac = Math.max(-0.5, Math.min(0.5, delta));
  return { bin: best + frac, prominence: lineProminence(powerDb, best) };
}

type HarmonicFit = {
  f0: number;
  sigmaHz: number;
  snrDb: number;
  used: number;
};

/**
 * 1×–5× 谐波联合拟合（评审 17 §1①③）：
 * 每个谐波做抛物线插值得到亚 bin 频率，再对 (h, f_h) 做加权最小二乘，
 * 斜率就是基频。权重取谱线突出度；残差给出斜率的标准误。
 */
function fitHarmonics(powerDb: number[], df: number, coarseF0: number): HarmonicFit | null {
  const points: { h: number; hz: number; w: number }[] = [];
  let snrSum = 0;
  for (let h = 1; h <= 5; h++) {
    const peak = peakNear(powerDb, Math.round((coarseF0 * h) / df));
    if (peak.prominence < MIN_LINE_PROMINENCE) continue;
    points.push({ h, hz: peak.bin * df, w: peak.prominence });
    snrSum += peak.prominence;
  }
  if (points.length < 3) return null;
  const snrDb = snrSum / points.length;

  const W = points.reduce((a, p) => a + p.w, 0);
  if (!(W > 0)) return null;
  const xBar = points.reduce((a, p) => a + (p.w / W) * p.h, 0);
  const yBar = points.reduce((a, p) => a + (p.w / W) * p.hz, 0);
  const sxx = points.reduce((a, p) => a + (p.w / W) * (p.h - xBar) ** 2, 0);
  if (!(sxx > 0)) return null;
  const sxy = points.reduce((a, p) => a + (p.w / W) * (p.h - xBar) * (p.hz - yBar), 0);
  const slope = sxy / sxx;
  const intercept = yBar - slope * xBar;

  let chi2 = 0;
  for (const p of points) {
    const r = p.hz - (intercept + slope * p.h);
    chi2 += (p.w / W) * r * r;
  }
  const dof = points.length - 2;
  const sigma2 = dof > 0 ? chi2 / dof : 0;
  const se = Math.sqrt(Math.max(sigma2, 0) / sxx);
  const sigmaHz = Math.max(UNCERTAINTY_FLOOR_HZ, 2 * se);

  return { f0: slope, sigmaHz, snrDb, used: points.length };
}

function combScoreAt(powerDb: number[], df: number, f0: number): number {
  let score = 0;
  for (let h = 1; h <= 5; h++) {
    const p = lineProminence(powerDb, Math.round((f0 * h) / df));
    if (p >= MIN_LINE_PROMINENCE) score += p / h;
  }
  return score;
}

/**
 * 1/2×、1/3× 亚谐波检查：只取不与整数阶主梳重合的分数阶位置。
 *
 * 1/2× 取 k=1,3,5,7,9；1/3× 取 k=1,2,4,5,7,8（k=3、6 分别落在 1×、2× 上）。
 * 返回"出现谱线的位置占比"，而不是能量比：能量比里的分子必然包含主梳
 * 自身的谱线（1/2× 的 h=2 就是 1×），健康泵的亚谐波得分天然有 0.7 左右，
 * 阈值再低都会误报。占比只数"本不该有"的分数阶位置，尺度无关。
 *
 * 额外要求（评审 17 §4）：命中的谱峰不能落在主梳整数阶的 ±0.8 bin 内，
 * 否则那只是主梳换了 bin，不构成亚谐波。
 */
function subharmonicPresence(powerDb: number[], df: number, f0: number, divisor: 2 | 3): number {
  const ks = divisor === 2 ? [1, 3, 5, 7, 9] : [1, 2, 4, 5, 7, 8];
  let hits = 0;
  let validPositions = 0;
  for (const k of ks) {
    const hz = (f0 * k) / divisor;
    const bin = Math.round(hz / df);
    // 主梳整数阶位置（h≥1）与当前分数阶位置重合 → 不算独立亚谐波
    const nearestOrder = Math.round(hz / f0);
    if (nearestOrder >= 1 && Math.abs(hz - nearestOrder * f0) <= 0.8 * df) continue;
    validPositions++;
    const p = lineProminence(powerDb, bin);
    if (p >= MIN_LINE_PROMINENCE) hits++;
  }
  return validPositions ? hits / validPositions : 0;
}

function emptyTrack(ratedF0: number, insufficientSnr: boolean, lineSnrDb: number): ShaftTrack {
  return {
    trackedF0: 0,
    trackedF0UncertaintyHz: Number.NaN,
    ratedF0,
    rpmDeltaPct: Number.NaN,
    rpmDeltaPctUncertainty: Number.NaN,
    reliable: false,
    mismatch: false,
    combScore: 0,
    ambiguous: true,
    subharmonic: false,
    subharmonicRatio: 0,
    lineSnrDb,
    insufficientSnr,
    windowCount: 0,
    spanSec: 0,
  };
}

export function trackShaftFreq(
  powerDb: number[],
  sr: number,
  fftSize: number,
  ratedRpm: number,
): ShaftTrack {
  const ratedF0 = Math.max(1, ratedRpm / 60);
  const lo = ratedF0 * SHAFT_SEARCH_RATIO_LO;
  const hi = ratedF0 * SHAFT_SEARCH_RATIO_HI;
  const df = sr / fftSize;

  const step = Math.max(0.1, df * 0.5);
  const candidates: { f0: number; score: number }[] = [];
  for (let f0 = lo; f0 <= hi; f0 += step) {
    const score = combScoreAt(powerDb, df, f0);
    if (score > 0) candidates.push({ f0, score });
  }
  if (!candidates.length) return emptyTrack(ratedF0, true, 0);

  const bestScore = Math.max(...candidates.map((c) => c.score));
  // 优先取最低的强基频：真实基频之下的亚谐波组合更难自然成立
  const strong = candidates.filter((c) => c.score >= bestScore * STRONG_CANDIDATE_RATIO);
  const chosen = strong.reduce((low, c) => (c.f0 < low.f0 ? c : low), strong[0]!);

  // 谐波联合拟合：把 1×–5× 的亚 bin 谱峰做回归，得到 f0 与不确定度
  const fit = fitHarmonics(powerDb, df, chosen.f0);
  const f0 = fit ? fit.f0 : chosen.f0;
  const sigmaHz = fit ? fit.sigmaHz : Math.max(UNCERTAINTY_FLOOR_HZ, df * 0.5);
  const lineSnrDb = fit ? fit.snrDb : combScoreAt(powerDb, df, chosen.f0) / 5;
  const insufficientSnr = lineSnrDb < MIN_DECISION_SNR_DB;

  // 亚谐波：1/2× 与 1/3× 必须同时成立（评审 17 §4）
  const sub2 = subharmonicPresence(powerDb, df, f0, 2);
  const sub3 = subharmonicPresence(powerDb, df, f0, 3);
  const subharmonicRatio = Math.min(sub2, sub3);
  const subharmonic = sub2 >= SUBHARMONIC_AMBIGUITY && sub3 >= SUBHARMONIC_AMBIGUITY;
  // SNR 不足 → 只能说"转速不确定"，不能报"无亚谐波"
  const ambiguous = insufficientSnr || subharmonic;

  const combScore = Math.max(0, Math.min(1, chosen.score / 20));
  const deltaHz = Math.abs(f0 - ratedF0);
  const rpmDeltaPct = deltaHz / ratedF0 * 100;
  const rpmDeltaPctUncertainty = (sigmaHz / ratedF0) * 100;
  const mismatch =
    !ambiguous && rpmDeltaPct > SHAFT_TRACK_TOLERANCE_PCT && deltaHz > MISMATCH_SIGMA * sigmaHz;
  const reliable =
    !ambiguous &&
    !mismatch &&
    rpmDeltaPct <= SHAFT_TRACK_TOLERANCE_PCT &&
    combScore >= 0.2;

  return {
    trackedF0: ambiguous ? 0 : f0,
    trackedF0UncertaintyHz: ambiguous ? Number.NaN : sigmaHz,
    ratedF0,
    rpmDeltaPct: ambiguous ? Number.NaN : rpmDeltaPct,
    rpmDeltaPctUncertainty: ambiguous ? Number.NaN : rpmDeltaPctUncertainty,
    reliable,
    mismatch,
    combScore,
    ambiguous,
    subharmonic,
    subharmonicRatio,
    lineSnrDb,
    insufficientSnr,
    windowCount: 1,
    spanSec: 0,
  };
}

/**
 * 多窗累计（评审 17 §1②）：把最近 4 s 内的独立窗按 1/σ² 合并，
 * 不确定度约按 √K 收敛。只累计“可用”的窗；当前窗不确定/歧义时直接透传。
 */
export class ShaftAccumulator {
  private windows: { f0: number; sigmaHz: number; atMs: number }[] = [];

  push(track: ShaftTrack, nowMs: number): ShaftTrack {
    if (track.ambiguous || track.insufficientSnr || !(track.trackedF0 > 0)) {
      return track;
    }
    if (Number.isFinite(track.trackedF0UncertaintyHz)) {
      this.windows.push({
        f0: track.trackedF0,
        sigmaHz: track.trackedF0UncertaintyHz,
        atMs: nowMs,
      });
    }
    const cutoff = nowMs - MAX_ACCUM_SPAN_SEC * 1000;
    this.windows = this.windows.filter((w) => w.atMs >= cutoff).slice(-MAX_ACCUM_WINDOWS);
    if (this.windows.length <= 1) {
      return { ...track, windowCount: this.windows.length, spanSec: 0 };
    }

    let wSum = 0;
    let fSum = 0;
    for (const w of this.windows) {
      const weight = 1 / Math.max(w.sigmaHz * w.sigmaHz, 1e-6);
      wSum += weight;
      fSum += weight * w.f0;
    }
    const f0 = fSum / wSum;
    const sigmaHz = Math.max(UNCERTAINTY_FLOOR_HZ, Math.sqrt(1 / wSum));
    const spanSec = Math.max(0, (nowMs - this.windows[0]!.atMs) / 1000);
    const ratedF0 = track.ratedF0;
    const deltaHz = Math.abs(f0 - ratedF0);
    const rpmDeltaPct = deltaHz / ratedF0 * 100;
    const rpmDeltaPctUncertainty = (sigmaHz / ratedF0) * 100;
    const mismatch =
      rpmDeltaPct > SHAFT_TRACK_TOLERANCE_PCT && deltaHz > MISMATCH_SIGMA * sigmaHz;
    const reliable =
      !mismatch &&
      rpmDeltaPct <= SHAFT_TRACK_TOLERANCE_PCT &&
      track.combScore >= 0.2;

    return {
      ...track,
      trackedF0: f0,
      trackedF0UncertaintyHz: sigmaHz,
      rpmDeltaPct,
      rpmDeltaPctUncertainty,
      mismatch,
      reliable,
      windowCount: this.windows.length,
      spanSec,
    };
  }

  reset() {
    this.windows = [];
  }
}

/** ordersReliable 的扩展：基础逻辑（转速 + 窗口 + 周期数）通过了，
 * 但轴频跟踪显示偏差 >5%、谐波梳太弱、亚谐波歧义或 SNR 不足 → 仍判不可靠。 */
export function ordersReliableWithTrack(
  rpmRated: number,
  windowSec: number,
  track: ShaftTrack | null,
): boolean {
  const basePass = ordersReliableBase(rpmRated, windowSec);
  if (!basePass) return false;
  if (!track) return true; // 没跑跟踪时保守放行（跟踪在 steady 段才跑）
  return track.reliable;
}

/** 复用 phase.ts 的基础逻辑，避免互相依赖。 */
function ordersReliableBase(rpm: number, windowSec: number) {
  if (!(rpm >= 900) || !(windowSec > 0)) return false;
  return (rpm / 60) * windowSec >= 20;
}
