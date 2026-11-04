/**
 * 特征片段仓储：IndexedDB segments store。
 */
import { getAllBy, put } from "../idb";

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

export async function saveSegment(
  seg: Omit<SegmentRecord, "id" | "created_at">,
): Promise<void> {
  await put("segments", {
    ...seg,
    id: `${seg.session_id}-${seg.offset_ms}`,
    created_at: Date.now(),
  });
}

export async function listSegments(sessionId: string): Promise<SegmentRecord[]> {
  const rows = await getAllBy<SegmentRecord>("segments", "by_session", sessionId);
  return rows.sort((a, b) => a.offset_ms - b.offset_ms);
}
