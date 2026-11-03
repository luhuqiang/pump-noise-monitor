/**
 * P0 静默失效源判定：削顶、AGC、采样率、Worklet 掉帧、麦克风被系统切走。
 * 这些失效的共同点是“仪表还在动，但数据已经不可信”，必须在结论层显式 invalid。
 */

export type InvalidReason =
  | "clip"
  | "agc"
  | "sample_rate"
  | "worklet_drop"
  | "mic_lost"
  | "silence";

export type MicStatus = "ok" | "missing" | "ended" | "muted";

export type ChannelStatus = {
  valid: boolean;
  reasons: InvalidReason[];
  clip: boolean;
  clipRate: number;
  agc: boolean;
  sampleRate: number;
  sampleRateOk: boolean;
  mic: MicStatus;
  droppedFrames: number;
};

export const CLIP_LEVEL = 0.95;
export const CLIP_RUN_SAMPLES = 3;
export const CLIP_RATE_LIMIT = 0.001;
export const CLIP_WINDOW_BLOCKS = 10;
export const SAMPLE_RATE = 48000;
export const SAMPLE_RATE_TOLERANCE = 1;

export function sampleRateValid(sr: number) {
  return Number.isFinite(sr) && Math.abs(sr - SAMPLE_RATE) <= SAMPLE_RATE_TOLERANCE;
}

/** 同一采样块内连续 ≥3 个样点达到 0.95 才判削顶，避免单点毛刺误报。 */
export class ClipTracker {
  private run = 0;
  private rates: number[] = [];
  private lastRate = 0;
  private hit = false;

  update(samples: Float32Array | null, fallbackPeak = 0) {
    if (!samples || !samples.length) {
      this.lastRate = 0;
      if (fallbackPeak >= CLIP_LEVEL) {
        this.run += 1;
        this.hit = this.run >= CLIP_RUN_SAMPLES;
      } else {
        this.run = 0;
      }
      return this.hit;
    }
    let clipped = 0;
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i] ?? 0;
      if (Math.abs(x) >= CLIP_LEVEL) {
        clipped++;
        this.run++;
        if (this.run >= CLIP_RUN_SAMPLES) this.hit = true;
      } else {
        this.run = 0;
      }
    }
    this.lastRate = clipped / Math.max(1, samples.length);
    this.rates.push(this.lastRate);
    if (this.rates.length > CLIP_WINDOW_BLOCKS) this.rates.shift();
    if (this.lastRate > CLIP_RATE_LIMIT) this.hit = true;
    return this.hit;
  }

  get clipRate() {
    if (!this.rates.length) return this.lastRate;
    const avg = this.rates.reduce((sum, v) => sum + v, 0) / this.rates.length;
    return Math.max(avg, CLIP_RATE_LIMIT * (this.hit ? 1 : 0));
  }

  get clipped() {
    return this.hit;
  }

  reset() {
    this.run = 0;
    this.rates = [];
    this.lastRate = 0;
    this.hit = false;
  }
}

/**
 * AGC 判据：全频带同步平移。24 个对数带相对上一帧的差值，
 * 均值 |Δ| ≥ 1.8 dB、极差 ≤ 0.7 dB、最大偏离 ≤ 1.2 dB，保持 8 秒。
 * 单频带变化（例如泵声本身）不会触发；用户手改增益或系统切音源
 * 造成的平移先记事件，判定时近 5 秒内有变更则跳过，不误报 AGC。
 */
export class AgcDetector {
  private prev: number[] | null = null;
  private holdUntil = 0;
  private active = false;
  /** 最近一次增益/音源变更时间戳（ms） */
  private gainChangedAt = 0;

  noteGainChanged(nowMs: number) {
    this.gainChangedAt = nowMs;
    // 增益变更后旧的"持续 8 秒"hold 作废，避免把人为变更算作 AGC 介入。
    this.holdUntil = Math.min(this.holdUntil, nowMs);
  }

  update(bandsDb: number[], nowMs: number) {
    if (!bandsDb.length) return this.active;
    // 近 5 秒有增益变更 → 跳过判定，等数据稳定后再算。
    // gainChangedAt 初始为 0 时视为"从未变更"，不跳过。
    if (this.gainChangedAt > 0 && nowMs - this.gainChangedAt < 5000) return (this.active = false);
    if (!this.prev || this.prev.length !== bandsDb.length) {
      this.prev = bandsDb.slice();
      return this.active;
    }
    const diffs = bandsDb.map((v, i) => v - (this.prev![i] ?? v));
    this.prev = bandsDb.slice();
    let sum = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const d of diffs) {
      sum += d;
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    const mean = sum / diffs.length;
    const spread = hi - lo;
    const maxDev = diffs.reduce((m, d) => Math.max(m, Math.abs(d - mean)), 0);
    // 双重保险：均值条件 + 全带一致性。单频带 +6 dB 的情况 spread 会远超 0.7，
    // 同时最大单带偏移也远大于均值，不会误判。
    if (Math.abs(mean) >= 1.8 && spread <= 0.7 && maxDev <= 1.2) {
      this.holdUntil = nowMs + 8000;
    }
    this.active = nowMs < this.holdUntil;
    return this.active;
  }

  get agc() {
    return this.active;
  }

  reset() {
    this.prev = null;
    this.holdUntil = 0;
    this.active = false;
    this.gainChangedAt = 0;
  }
}

/** Worklet 每 ~0.68 s 一块；超过 1.4 s 没有新块记一次掉帧，连续 >2 块判失效。 */
export const BLOCK_GAP_MS = 1400;
export const MAX_DROPPED_FRAMES = 2;

export class DropTracker {
  private lastAt = 0;
  private dropped = 0;
  private initialized = false;

  block(nowMs: number) {
    this.lastAt = nowMs;
    this.dropped = 0;
    this.initialized = true;
  }

  /** 定时检查；返回当前是否失效。 */
  check(nowMs: number) {
    if (!this.initialized) return false;
    if (nowMs - this.lastAt > BLOCK_GAP_MS) {
      const gaps = Math.floor((nowMs - this.lastAt) / BLOCK_GAP_MS);
      this.dropped += Math.max(1, gaps);
      this.lastAt += gaps * BLOCK_GAP_MS;
    }
    return this.dropped > MAX_DROPPED_FRAMES;
  }

  get count() {
    return this.dropped;
  }

  reset() {
    this.lastAt = 0;
    this.dropped = 0;
    this.initialized = false;
  }
}

export type ValidityInput = {
  clip: boolean;
  clipRate: number;
  agc: boolean;
  sampleRate: number;
  mic: MicStatus;
  droppedFrames: number;
  levelDbfs: number;
};

export function channelStatus(input: ValidityInput): ChannelStatus {
  const reasons: InvalidReason[] = [];
  if (input.clip || input.clipRate > CLIP_RATE_LIMIT) reasons.push("clip");
  if (input.agc) reasons.push("agc");
  const sampleRateOk = sampleRateValid(input.sampleRate);
  if (!sampleRateOk) reasons.push("sample_rate");
  if (input.droppedFrames > MAX_DROPPED_FRAMES) reasons.push("worklet_drop");
  if (input.mic === "ended" || input.mic === "muted" || input.mic === "missing") {
    reasons.push("mic_lost");
  }
  if (!Number.isFinite(input.levelDbfs) || input.levelDbfs < -70) reasons.push("silence");
  return {
    valid: reasons.length === 0,
    reasons,
    clip: input.clip || input.clipRate > CLIP_RATE_LIMIT,
    clipRate: input.clipRate,
    agc: input.agc,
    sampleRate: input.sampleRate,
    sampleRateOk,
    mic: input.mic,
    droppedFrames: input.droppedFrames,
  };
}

export function invalidText(reason: InvalidReason) {
  switch (reason) {
    case "clip":
      return "输入削顶（≥0.95 连续 3 点）";
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
