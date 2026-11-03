import { getDb } from "../pglite";

/**
 * 设置仓储：key-value 持久化到 PGlite。
 * 与 zustand 的内存状态配合，启动时从 DB 加载。
 */
export async function getSetting<T = unknown>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const res = await db.query<{ value: string }>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  if (res.rows.length === 0) return fallback;
  try {
    return JSON.parse(res.rows[0]!.value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [key, JSON.stringify(value), Date.now()],
  );
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const db = await getDb();
  const res = await db.query<{ key: string; value: string }>("SELECT key, value FROM settings");
  const out: Record<string, unknown> = {};
  for (const row of res.rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}
