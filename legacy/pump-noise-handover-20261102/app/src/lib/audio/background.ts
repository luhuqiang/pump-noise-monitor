/**
 * 背景谱：24 个对数带（40–10000 Hz），随测点设备键持久化，并在 baselineKey 中带版本号。
 * 重新采集背景后版本 +1，旧基线自动失效，避免拿旧背景解释新环境。
 */

import { bandPower, median } from "./fft";

export const BG_STORE_KEY = "pump-bg-v1";
export const BG_BANDS = 24;
export const BG_MIN_HZ = 40;
export const BG_MAX_HZ = 10000;

export type BackgroundProfile = {
  device: string;
  /** 同一 deviceKey 的版本号，从 1 开始递增 */
  version: number;
  at: string;
  bandsDb: number[];
  orderPresence: number;
  floorDb: number;
  source: "mic" | "demo";
  frames: number;
};

type Store = Record<string, BackgroundProfile>;

function read(): Store {
  try {
    const raw = localStorage.getItem(BG_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

function write(store: Store) {
  try {
    localStorage.setItem(BG_STORE_KEY, JSON.stringify(store));
  } catch {
    /* 隐私模式忽略 */
  }
}

export function backgroundEdges() {
  const ratio = Math.pow(BG_MAX_HZ / BG_MIN_HZ, 1 / BG_BANDS);
  return Array.from({ length: BG_BANDS }, (_, i) => BG_MIN_HZ * Math.pow(ratio, i));
}

export function bandLevels(power: Float64Array, sampleRate: number, fftSize: number) {
  const edges = backgroundEdges();
  const top = BG_MAX_HZ * (BG_MAX_HZ / BG_MIN_HZ) ** (1 / BG_BANDS);
  return edges.map((lo, i) => {
    const hi = i + 1 < edges.length ? edges[i + 1]! : top;
    const p = bandPower(power, sampleRate, fftSize, lo, Math.min(hi, sampleRate / 2 - 1));
    return 10 * Math.log10(Math.max(p, 1e-22));
  });
}

export function floorOf(bandsDb: number[]) {
  if (!bandsDb.length) return Number.NaN;
  const sorted = bandsDb.slice().sort((a, b) => a - b);
  const take = Math.max(1, Math.floor(sorted.length / 4));
  const low = sorted.slice(0, take);
  return median(Float64Array.from(low), 0, low.length);
}

export function loadBackground(device: string): BackgroundProfile | null {
  const p = read()[device];
  if (!p || !Array.isArray(p.bandsDb) || p.bandsDb.length !== BG_BANDS) return null;
  return p;
}

export function backgroundVersion(device: string) {
  return loadBackground(device)?.version ?? 0;
}

export function saveBackground(
  device: string,
  bandsDb: number[],
  meta: { source: "mic" | "demo"; frames: number; orderPresence: number },
): BackgroundProfile {
  const store = read();
  const prev = store[device];
  const profile: BackgroundProfile = {
    device,
    version: (prev?.version ?? 0) + 1,
    at: new Date().toISOString(),
    bandsDb: bandsDb.slice(0, BG_BANDS),
    orderPresence: meta.orderPresence,
    floorDb: floorOf(bandsDb),
    source: meta.source,
    frames: meta.frames,
  };
  store[device] = profile;
  const keys = Object.keys(store);
  if (!(device in store) && keys.length >= 8) delete store[keys[0]!];
  if (keys.length >= 8) {
    const oldest = keys
      .filter((k) => k !== device)
      .sort((a, b) => (store[a]?.at ?? "").localeCompare(store[b]?.at ?? ""));
    if (oldest[0]) delete store[oldest[0]];
  }
  write(store);
  return profile;
}

export function resetBackground(device: string) {
  const store = read();
  delete store[device];
  write(store);
}

export function backgroundKey(device: string, version: number) {
  return `${device}|bg${version}`;
}
