/**
 * 会话仓储：IndexedDB sessions store。
 */
import { get, getAll, getAllBy, put } from "../idb";

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
  await put("sessions", {
    ...session,
    ended_at: null,
    duration_sec: null,
    diagnosis_status: null,
    diagnosis_json: null,
  });
}

export async function endSession(
  id: string,
  diagnosisStatus: string,
  diagnosisJson: string,
): Promise<void> {
  const now = Date.now();
  const existing = await get<SessionRecord>("sessions", id);
  if (!existing) return;
  await put("sessions", {
    ...existing,
    ended_at: now,
    duration_sec: (now - existing.started_at) / 1000,
    diagnosis_status: diagnosisStatus,
    diagnosis_json: diagnosisJson,
  });
}

export async function listSessions(assetId?: string, limit = 50): Promise<SessionRecord[]> {
  const all = assetId
    ? await getAllBy<SessionRecord>("sessions", "by_asset", assetId)
    : await getAll<SessionRecord>("sessions");
  return all.sort((a, b) => b.started_at - a.started_at).slice(0, limit);
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  return (await get<SessionRecord>("sessions", id)) ?? null;
}
