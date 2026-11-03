import { getDb } from "../pglite";

export type EvidenceRecord = {
  id: string;
  session_id: string;
  kind: string;
  title: string;
  detail: string;
  created_at: number;
};

export async function saveEvidence(
  sessionId: string,
  kind: string,
  title: string,
  detail: string,
): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO evidence (id, session_id, kind, title, detail, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [`${sessionId}-${kind}`, sessionId, kind, title, detail, Date.now()],
  );
}

export async function listEvidence(sessionId: string): Promise<EvidenceRecord[]> {
  const db = await getDb();
  const res = await db.query<EvidenceRecord>(
    "SELECT * FROM evidence WHERE session_id = $1 ORDER BY created_at",
    [sessionId],
  );
  return res.rows;
}
