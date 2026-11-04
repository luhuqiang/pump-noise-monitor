/**
 * S4 门控冻结模块
 *
 * crest gate（冲击门限）冻结的薄封装。freezeCrestGate 从 EventRail.history
 * 计算门限 → 写入 fingerprint 的 Baseline.crestGate，供后续 anomalyOf 使用。
 */
import type { CrestGate } from "./event-rail.ts";
import { saveCrestGate, loadBaseline, baselineKey } from "./fingerprint.ts";

export type { CrestGate };

/**
 * 冻结 crest gate：把给定 gate 写入 baseline key（device + bgVersion）。
 */
export function freezeCrestGate(
  device: string,
  bgVersion: number,
  gate: CrestGate,
): boolean {
  const key = baselineKey(device, bgVersion);
  const b = loadBaseline(key);
  if (!b) return false;
  return saveCrestGate(key, gate);
}