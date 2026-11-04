/**
 * 证据卡仓储：IndexedDB evidence store。
 */
import { getAllBy, put } from "../idb";

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
  await put("evidence", {
    id: `${sessionId}-${kind}`,
    session_id: sessionId,
    kind,
    title,
    detail,
    created_at: Date.now(),
  });
}

export async function listEvidence(sessionId: string): Promise<EvidenceRecord[]> {
  const rows = await getAllBy<EvidenceRecord>("evidence", "by_session", sessionId);
  return rows.sort((a, b) => a.created_at - b.created_at);
}
