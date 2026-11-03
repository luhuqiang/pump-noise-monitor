/** 极简 className 合并（clsx 风格，仅处理 string | false | undefined） */
export function cn(...classes: Array<string | false | undefined | null>): string {
  let out = "";
  for (const c of classes) {
    if (typeof c === "string" && c.length > 0) {
      out += (out ? " " : "") + c;
    }
  }
  return out;
}

/** 数值夹在 [min, max] 之间 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 格式化 dB 值（保留 1 位小数，-Infinity 显示为 -∞） */
export function fmtDb(db: number, digits = 1): string {
  if (!Number.isFinite(db)) return "-\u221E";
  return db.toFixed(digits);
}

/** 格式化频率 Hz（整数 kHz 或小数 Hz） */
export function fmtHz(hz: number): string {
  if (!Number.isFinite(hz)) return "—";
  if (hz >= 1000) return (hz / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return hz.toFixed(0);
}

/** 格式化通用数值 */
export function fmtNum(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}
