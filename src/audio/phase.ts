/**
 * 运行态状态机：idle → starting → steady → stopping → idle。
 * 启动判据只看阶次结构是否出现，不看能量跳升；低转速时阶次不可靠，直接禁用阶次结论。
 */

import type { SpectralFeatures } from "./features";

export type RunPhase = "idle" | "starting" | "steady" | "stopping";

export const STARTING_HOLD_MS = 5000;
export const ABSENT_TO_STOP_MS = 3000;
export const STOP_TO_IDLE_MS = 3000;
export const ORDER_PRESENT = 0.55;
export const ORDER_ABSENT = 0.3;
export const MIN_ORDER_CYCLES = 20;
export const MIN_ORDER_RPM = 900;

/** 窗口内至少积累 20 个转频周期，且转速不低于 900 r/min，阶次结论才可信。 */
export function ordersReliable(rpm: number, windowSec: number) {
  if (!(rpm >= MIN_ORDER_RPM) || !(windowSec > 0)) return false;
  return (rpm / 60) * windowSec >= MIN_ORDER_CYCLES;
}

/** 0–1 的阶次结构出现度：1×/2×/BPF 任一谱线 SNR ≥ 12 dB 且相对能量不低。 */
export function orderPresence(f: SpectralFeatures, rpm: number, windowSec: number) {
  if (!ordersReliable(rpm, windowSec)) return 0;
  const snr = [f.orderSnr.oneX, f.orderSnr.twoX, f.orderSnr.bpf];
  const rel = [f.orderDb.oneX, f.orderDb.twoX, f.orderDb.bpf];
  let best = 0;
  for (let i = 0; i < snr.length; i++) {
    const s = Math.max(0, Math.min(1, ((snr[i] ?? -10) - 6) / 14));
    const l = Math.max(0, Math.min(1, ((rel[i] ?? -120) + 40) / 25));
    best = Math.max(best, Math.min(s, l));
  }
  return best;
}

export class PhaseTracker {
  phase: RunPhase = "idle";
  private since = 0;
  private absentSince = 0;
  private present = false;

  update(nowMs: number, present: boolean, running: boolean) {
    this.present = present;
    if (!running) {
      this.to("idle", nowMs);
      return this.phase;
    }
    if (this.phase === "idle") {
      if (present) this.to("starting", nowMs);
      else this.since ||= nowMs;
      return this.phase;
    }
    if (this.phase === "starting") {
      if (present) {
        if (nowMs - this.since >= STARTING_HOLD_MS) this.to("steady", nowMs);
        this.absentSince = 0;
      } else if (nowMs - this.since >= STARTING_HOLD_MS) {
        // 启动 5 秒仍没有阶次结构：回到 idle，等待下一次启动。
        this.to("idle", nowMs);
      }
      return this.phase;
    }
    if (this.phase === "steady") {
      if (present) {
        this.absentSince = 0;
      } else {
        this.absentSince ||= nowMs;
        if (nowMs - this.absentSince >= ABSENT_TO_STOP_MS) this.to("stopping", nowMs);
      }
      return this.phase;
    }
    // stopping
    if (present) {
      this.to("starting", nowMs);
    } else if (nowMs - this.since >= STOP_TO_IDLE_MS) {
      this.to("idle", nowMs);
    }
    return this.phase;
  }

  get orderPresent() {
    return this.present;
  }

  reset() {
    this.phase = "idle";
    this.since = 0;
    this.absentSince = 0;
    this.present = false;
  }

  private to(next: RunPhase, nowMs: number) {
    this.phase = next;
    this.since = nowMs;
    this.absentSince = 0;
  }
}

export function phaseText(phase: RunPhase) {
  switch (phase) {
    case "idle":
      return "静止";
    case "starting":
      return "启动中";
    case "steady":
      return "稳定运行";
    case "stopping":
      return "停机中";
  }
}
