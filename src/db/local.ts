/**
 * S2 过渡持久层（localStorage）。
 * PGlite 移除属 S3；S2 界面侧不引用 db/pglite（避免 postgres.wasm 进 APK，包体 200–500KB 约束）。
 * 语义与 db/repositories 对齐，S3 换数据层时按 key 迁移。
 */

/** ---- 设置（原 repositories/settings 语义：JSON 泛型读写） ---- */
const SETTING_PREFIX = "tzp.setting.";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = localStorage.getItem(SETTING_PREFIX + key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  localStorage.setItem(SETTING_PREFIX + key, JSON.stringify(value));
}

/** ---- 草稿会话（invalid / 中止落盘，AC-16/AC-18 界面层凭据） ---- */
const DRAFT_KEY = "tzp.drafts.v1";
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

export function listDrafts(): DraftRecord[] {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "[]") as DraftRecord[];
  } catch {
    return [];
  }
}

export async function saveDraft(
  rec: Omit<DraftRecord, "id" | "savedAt">,
): Promise<DraftRecord> {
  const full: DraftRecord = {
    ...rec,
    id: `draft_${Date.now()}`,
    savedAt: Date.now(),
  };
  const list = [full, ...listDrafts()].slice(0, DRAFT_CAP);
  localStorage.setItem(DRAFT_KEY, JSON.stringify(list));
  return full;
}
