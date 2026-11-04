/**
 * 本地持久层（正式版：IndexedDB）。
 * S3 改造：localStorage 过渡层已升级到 IndexedDB（D-01），接口签名保持不变，
 * S2 界面侧（Settings/InstrumentPanel/ResultPage）无感知。
 */
import { get, getAll, put } from "./idb";
import { runMigrationIfNeeded } from "./migrate";

// DB 懒打开（第一次调用时自动迁移）
let _ready: Promise<void> | null = null;
function ensureReady(): Promise<void> {
  if (_ready) return _ready;
  _ready = runMigrationIfNeeded();
  return _ready;
}

/** ---- 设置 ---- */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  await ensureReady();
  const rec = await get<{ value: T }>("settings", key);
  return rec?.value ?? fallback;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await ensureReady();
  await put("settings", { key, value, updated_at: Date.now() });
}

/** ---- 草稿会话 ---- */
const DRAFT_CAP = 20;

export type DraftRecord = {
  id: string;
  savedAt: number;
  pointId: string;
  elapsed: number;
  sampleRate: number;
  status: "draft" | "invalid";
  note: string;
  diagnosis: unknown;
};

export async function listDrafts(): Promise<DraftRecord[]> {
  await ensureReady();
  const evs = await getAll<{ id: string; detail: string; kind: string; created_at: number; diagnosis?: unknown }>(
    "evidence",
  );
  return evs
    .filter((e) => e.id.startsWith("draft_"))
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
    .slice(0, DRAFT_CAP)
    .map((e) => ({
      id: e.id,
      savedAt: e.created_at ?? Date.now(),
      pointId: e.detail?.match(/pointId=(\S+)/)?.[1] ?? "unknown",
      elapsed: Number(e.detail?.match(/elapsed=(\d+)/)?.[1] ?? 0),
      sampleRate: 48000,
      status: (e.kind as "draft" | "invalid") ?? "draft",
      note: e.detail ?? "",
      diagnosis: (e as { diagnosis?: unknown }).diagnosis,
    }));
}

export async function saveDraft(
  rec: Omit<DraftRecord, "id" | "savedAt">,
): Promise<DraftRecord> {
  await ensureReady();
  const full: DraftRecord = {
    ...rec,
    id: `draft_${Date.now()}`,
    savedAt: Date.now(),
  };
  await put("evidence", {
    id: full.id,
    session_id: "",
    kind: full.status,
    title: `草稿 · ${full.pointId}`,
    detail: `pointId=${full.pointId} elapsed=${full.elapsed}s · ${full.note ?? ""}`,
    created_at: full.savedAt,
    diagnosis: full.diagnosis,
  });
  return full;
}
