import { getDb } from "../pglite";

export type SessionRecord = {
  id: string;
  asset_id: string;
  point_id: string | null;
  started_at: number;
  ended_at: number | null;
  duration_sec: number | null;
  sample_rate: number;
  phase: string;
  rpm: number | null;
  mic_status: string;
  algorithm_version: string;
  diagnosis_status: string | null;
  diagnosis_json: string | null;
};

export async function createSession(
  session: Omit<SessionRecord, "ended_at" | "duration_sec" | "diagnosis_status" | "diagnosis_json">,
): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO sessions (id, asset_id, point_id, started_at, sample_rate, phase, rpm, mic_status, algorithm_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      session.id,
      session.asset_id,
      session.point_id,
      session.started_at,
      session.sample_rate,
      session.phase,
      session.rpm,
      session.mic_status,
      session.algorithm_version,
    ],
  );
}

export async function endSession(
  id: string,
  diagnosisStatus: string,
  diagnosisJson: string,
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const res = await db.query<{ started_at: number }>(
    "SELECT started_at FROM sessions WHERE id = $1",
    [id],
  );
  const startedAt = res.rows[0]?.started_at ?? now;
  await db.query(
    `UPDATE sessions SET ended_at = $1, duration_sec = $2, diagnosis_status = $3, diagnosis_json = $4 WHERE id = $5`,
    [now, (now - startedAt) / 1000, diagnosisStatus, diagnosisJson, id],
  );
}

export async function listSessions(assetId?: string, limit = 50): Promise<SessionRecord[]> {
  const db = await getDb();
  const q = assetId
    ? "SELECT * FROM sessions WHERE asset_id = $1 ORDER BY started_at DESC LIMIT $2"
    : "SELECT * FROM sessions ORDER BY started_at DESC LIMIT $1";
  const res = assetId
    ? await db.query<SessionRecord>(q, [assetId, limit])
    : await db.query<SessionRecord>(q, [limit]);
  return res.rows;
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  const db = await getDb();
  const res = await db.query<SessionRecord>("SELECT * FROM sessions WHERE id = $1", [id]);
  return res.rows[0] ?? null;
}
