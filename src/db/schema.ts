/**
 * IndexedDB schema：16 store（原 PGlite 16 表一一映射，见 src/db/pglite.ts 历史版本）。
 * D-01 裁决：砍 PGlite，改原生 IndexedDB；postgres.wasm 不进包。
 */

export const DB_NAME = "stethoscope";
export const DB_VERSION = 1;

/** IndexedDB ObjectStore 定义：keyPath + 索引。 */
export type StoreDef = {
  name: string;
  keyPath?: string | string[];
  autoIncrement?: boolean;
  indexes?: { name: string; keyPath: string | string[]; unique?: boolean; multiEntry?: boolean }[];
};

export const STORES: StoreDef[] = [
  // ---- 台账/测点 ----
  {
    name: "assets",
    keyPath: "id",
    indexes: [{ name: "by_updated", keyPath: "updated_at" }],
  },
  {
    name: "points",
    keyPath: "id",
    indexes: [{ name: "by_asset", keyPath: "asset_id" }],
  },

  // ---- 采集会话 ----
  {
    name: "sessions",
    keyPath: "id",
    indexes: [
      { name: "by_asset", keyPath: "asset_id" },
      { name: "by_point", keyPath: "point_id" },
      { name: "by_started", keyPath: "started_at" },
    ],
  },

  // ---- 特征片段 ----
  {
    name: "segments",
    keyPath: "id",
    indexes: [
      { name: "by_session", keyPath: "session_id" },
      { name: "by_offset", keyPath: ["session_id", "offset_ms"] },
    ],
  },

  // ---- 证据卡 ----
  {
    name: "evidence",
    keyPath: "id",
    indexes: [
      { name: "by_session", keyPath: "session_id" },
      { name: "by_created", keyPath: "created_at" },
    ],
  },

  // ---- 基线 ----
  {
    name: "baselines",
    keyPath: "id",
    indexes: [
      { name: "by_asset", keyPath: "asset_id" },
      { name: "by_point", keyPath: "point_id" },
      { name: "by_active", keyPath: "is_active" },
    ],
  },

  // ---- 背景噪声 ----
  {
    name: "backgrounds",
    keyPath: "id",
    indexes: [
      { name: "by_asset", keyPath: "asset_id" },
      { name: "by_point", keyPath: "point_id" },
    ],
  },

  // ---- 事件轨 ----
  {
    name: "events",
    keyPath: "id",
    indexes: [
      { name: "by_session", keyPath: "session_id" },
      { name: "by_offset", keyPath: ["session_id", "offset_ms"] },
    ],
  },

  // ---- 阶次 ----
  {
    name: "orders",
    keyPath: "id",
    indexes: [{ name: "by_session", keyPath: "session_id" }],
  },

  // ---- 质量指标 ----
  {
    name: "quality",
    keyPath: "id",
    indexes: [{ name: "by_session", keyPath: "session_id" }],
  },

  // ---- 设置 ----
  {
    name: "settings",
    keyPath: "key",
  },

  // ---- 授权 ----
  {
    name: "licenses",
    keyPath: "id",
    indexes: [
      { name: "by_code", keyPath: "code" },
      { name: "by_machine", keyPath: "machine_id" },
    ],
  },

  // ---- 报告 ----
  {
    name: "reports",
    keyPath: "id",
    indexes: [
      { name: "by_session", keyPath: "session_id" },
      { name: "by_created", keyPath: "created_at" },
    ],
  },

  // ---- 导出记录 ----
  {
    name: "exports",
    keyPath: "id",
    indexes: [
      { name: "by_session", keyPath: "session_id" },
      { name: "by_created", keyPath: "created_at" },
    ],
  },

  // ---- 案例库 ----
  {
    name: "cases",
    keyPath: "id",
    indexes: [
      { name: "by_asset", keyPath: "asset_id" },
      { name: "by_point", keyPath: "point_id" },
    ],
  },

  // ---- 系统元数据 ----
  {
    name: "system",
    keyPath: "key",
  },
];

export const STORE_NAMES = STORES.map((s) => s.name);

/** 断言 IndexedDB 管理器已就绪（S3 门禁）。 */
export function assertSchema() {
  const seen = new Set<string>();
  for (const s of STORES) {
    if (seen.has(s.name)) throw new Error(`S3 schema: duplicate store ${s.name}`);
    seen.add(s.name);
  }
  if (STORES.length !== 16) throw new Error(`S3 schema: expected 16 stores, got ${STORES.length}`);
}
