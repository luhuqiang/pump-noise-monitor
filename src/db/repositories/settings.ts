/**
 * 设置仓储：IndexDB settings store（key-value）。
 * 接口签名与原 PGlite 版本一致，实现已切 IndexedDB（D-01）。
 */
import { getAll, get, put } from "../idb";

export async function getSetting<T = unknown>(key: string, fallback: T): Promise<T> {
  const rec = await get<{ key: string; value: T }>("settings", key);
  return rec?.value ?? fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await put("settings", { key, value, updated_at: Date.now() });
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const rows = await getAll<{ key: string; value: unknown }>("settings");
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}
