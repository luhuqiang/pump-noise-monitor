import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function fmtDb(n: number) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

export function fmtHz(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(2)} kHz`;
  return `${n.toFixed(1)} Hz`;
}

export function fmtNum(n: number, digits = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}
