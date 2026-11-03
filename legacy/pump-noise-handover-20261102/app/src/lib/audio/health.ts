import type { Diagnosis } from "./diagnose";

/** 健康分只依据结论状态、严重度与基线偏离，不再按具体故障名给固定分。 */
export function healthScore(
  diagnosis: Diagnosis | null,
  level: number,
  warn: number,
  danger: number,
) {
  if (!diagnosis || diagnosis.status === "invalid") return null;
  let base =
    diagnosis.severity === "正常" ? 96 : diagnosis.severity === "警告" ? 42 : 66;
  if (diagnosis.status === "low_confidence") base = Math.min(base, 74);
  if (diagnosis.anomaly !== null) base -= Math.min(30, diagnosis.anomaly * 0.3);
  if (Number.isFinite(level) && level > warn) {
    const span = Math.max(1, danger - warn);
    base -= Math.min(20, ((level - warn) / span) * 20);
  }
  return Math.round(Math.max(0, Math.min(100, base)));
}

export function healthLabel(score: number) {
  if (score >= 85) return "良好";
  if (score >= 68) return "关注";
  if (score >= 48) return "异常";
  return "严重";
}
