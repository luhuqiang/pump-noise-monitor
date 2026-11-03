import { getDb } from "../pglite";

export type BaselineRecord = {
  id: string;
  asset_id: string;
  point_id: string | null;
  version: number;
  frames: number;
  buckets: number;
  fingerprint: string;
  created_at: number;
  is_active: number;
};

export async function saveBaseline(
  assetId: string,
  pointId: string | null,
  fingerprint: string,
  frames: number,
  buckets: number,
): Promise<void> {
  const db = await getDb();
  const id = `${assetId}-${pointId ?? "global"}-${Date.now()}`;
  // 停用旧基线
  await db.query(
    "UPDATE baselines SET is_active = 0 WHERE asset_id = $1 AND COALESCE(point_id, 'global') = COALESCE($2, 'global')",
    [assetId, pointId],
  );
  await db.query(
    `INSERT INTO baselines (id, asset_id, point_id, version, frames, buckets, fingerprint, created_at, is_active)
     VALUES ($1, $2, $3, COALESCE((SELECT MAX(version) FROM baselines WHERE asset_id = $2), 0) + 1, $4, $5, $6, $7, 1)`,
    [id, assetId, pointId, frames, buckets, fingerprint, Date.now()],
  );
}

export async function getActiveBaseline(
  assetId: string,
  pointId: string | null,
): Promise<BaselineRecord | null> {
  const db = await getDb();
  const res = await db.query<BaselineRecord>(
    `SELECT * FROM baselines WHERE asset_id = $1 AND COALESCE(point_id, 'global') = COALESCE($2, 'global') AND is_active = 1 LIMIT 1`,
    [assetId, pointId],
  );
  return res.rows[0] ?? null;
}
