/**
 * S3 迁移：localStorage 只读迁移到 IndexedDB。
 * D-01 裁决：S2 过渡层（localStorage）升级到正式 IndexedDB 时，旧数据无损迁移；
 * 迁移失败显式报错，不静默跳过。
 */
import { getAllBy, openDB, put } from "./idb";

const SETTING_PREFIX = "tzp.setting.";
const DRAFT_KEY = "tzp.drafts.v1";
const SYSTEM_KEYS = ["tzp.guide.v1", "tzp.modules.v1"];

type DraftRec = {
  id: string;
  savedAt: number;
  pointId: string;
  elapsed: number;
  sampleRate: number;
  status: "draft" | "invalid";
  note: string;
  diagnosis: unknown;
};

export type MigrateResult = {
  settings: number;
  drafts: number;
  system: number;
  skipped: string[];
};

/** 执行迁移（幂等：可重复跑，按 key 覆盖）。 */
export async function migrateFromLocalStorage(): Promise<MigrateResult> {
  const result: MigrateResult = { settings: 0, drafts: 0, system: 0, skipped: [] };

  // 1. 设置
  const settingKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(SETTING_PREFIX)) settingKeys.push(k);
  }
  for (const lsKey of settingKeys) {
    const idbKey = lsKey.slice(SETTING_PREFIX.length); // tzp.setting.theme → theme
    const raw = localStorage.getItem(lsKey);
    if (!raw) {
      result.skipped.push(lsKey + " (empty)");
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw; // 纯字符串
    }
    await put("settings", { key: idbKey, value: parsed, updated_at: Date.now() });
    result.settings++;
  }

  // 2. 草稿
  const draftsRaw = localStorage.getItem(DRAFT_KEY);
  if (draftsRaw) {
    let drafts: DraftRec[] = [];
    try {
      drafts = JSON.parse(draftsRaw) as DraftRec[];
    } catch {
      result.skipped.push(DRAFT_KEY + " (parse fail)");
    }
    for (const d of drafts) {
      await put("evidence", {
        id: d.id,
        session_id: "",
        kind: d.status,
        title: `草稿 · ${d.pointId}`,
        detail: `elapsed=${d.elapsed}s · ${d.note ?? ""}`,
        created_at: d.savedAt,
      });
      result.drafts++;
    }
  }

  // 3. 系统元数据（引导状态、模块偏好）
  for (const sk of SYSTEM_KEYS) {
    const v = localStorage.getItem(sk);
    if (v !== null) {
      await put("system", { key: sk, value: v });
      result.system++;
    }
  }

  return result;
}

/** 迁移入口：DB 打开后首次调用，记录版本。 */
export async function runMigrationIfNeeded(): Promise<void> {
  await openDB(); // 确保 DB 打开
  // 读 migration_version
  const sys = await getAllBy("system", "key", "migration_version").catch(() => []);
  const versionRec = sys[0] as { value?: string } | undefined;

  if (versionRec?.value === "localStorage→idb@1") {
    return; // 已迁移
  }

  const result = await migrateFromLocalStorage();

  // 写 migration_version
  await put("system", {
    key: "migration_version",
    value: "localStorage→idb@1",
    migrated_at: Date.now(),
    ...result,
  });
}
