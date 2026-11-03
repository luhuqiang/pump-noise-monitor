import { getDb } from "../pglite";

export type SegmentRecord = {
  id: string;
  session_id: string;
  offset_ms: number;
  duration_ms: number;
  band_db: string;
  crest: number | null;
  kurtosis: number | null;
  snr: number | null;
  features_json: string;
  created_at: number;
};

export async function saveSegment(seg: Omit<SegmentRecord, "id" | "created_at">): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO segments (id, session_id, offset_ms, duration_ms, band_db, crest, kurtosis, snr, features_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      `${seg.session_id}-${seg.offset_ms}`,
      seg.session_id,
      seg.offset_ms,
      seg.duration_ms,
      seg.band_db,
      seg.crest,
      seg.kurtosis,
      seg.snr,
      seg.features_json,
      Date.now(),
    ],
  );
}

export async function listSegments(sessionId: string): Promise<SegmentRecord[]> {
  const db = await getDb();
  const res = await db.query<SegmentRecord>(
    "SELECT * FROM segments WHERE session_id = $1 ORDER BY offset_ms",
    [sessionId],
  );
  return res.rows;
}
