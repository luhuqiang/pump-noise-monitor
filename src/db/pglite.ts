import { PGlite } from "@electric-sql/pglite";

/**
 * PGlite 本地数据库（纯本地，无云端）。
 * 使用 OPFS 持久化（WebView 内可用时），否则降级内存。
 */
let db: PGlite | null = null;

export async function getDb(): Promise<PGlite> {
  if (db) return db;
  try {
    db = new PGlite("idb://stethoscope");
  } catch {
    db = new PGlite();
  }
  await db.waitReady;
  await runMigrations(db);
  return db;
}

async function runMigrations(db: PGlite) {
  await db.exec(`
    -- 1. assets：设备台账
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pump_type TEXT NOT NULL DEFAULT 'centrifugal',
      rated_rpm INTEGER NOT NULL DEFAULT 2900,
      blades INTEGER NOT NULL DEFAULT 6,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- 2. points：测点
    CREATE TABLE IF NOT EXISTS points (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position TEXT NOT NULL DEFAULT 'inlet_flange',
      created_at INTEGER NOT NULL
    );

    -- 3. sessions：采集会话
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id),
      point_id TEXT REFERENCES points(id),
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      duration_sec REAL,
      sample_rate INTEGER NOT NULL DEFAULT 48000,
      phase TEXT NOT NULL DEFAULT 'steady',
      rpm REAL,
      mic_status TEXT NOT NULL DEFAULT 'ok',
      algorithm_version TEXT NOT NULL DEFAULT 'v2.0-2026.11',
      diagnosis_status TEXT,
      diagnosis_json TEXT
    );

    -- 4. segments：特征片段（不含原始音频）
    CREATE TABLE IF NOT EXISTS segments (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      offset_ms INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      band_db TEXT NOT NULL,
      crest REAL,
      kurtosis REAL,
      snr REAL,
      features_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- 5. evidence：证据卡
    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- 6. baselines：基线
    CREATE TABLE IF NOT EXISTS baselines (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id),
      point_id TEXT REFERENCES points(id),
      version INTEGER NOT NULL DEFAULT 1,
      frames INTEGER NOT NULL DEFAULT 0,
      buckets INTEGER NOT NULL DEFAULT 0,
      fingerprint TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- 7. backgrounds：背景噪声
    CREATE TABLE IF NOT EXISTS backgrounds (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id),
      point_id TEXT REFERENCES points(id),
      band_db TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- 8. events：事件轨
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      offset_ms INTEGER NOT NULL,
      crest_z REAL,
      kurtosis REAL,
      events_per_sec REAL,
      gate_frozen INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    -- 9. orders：阶次
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      tracked_f0 REAL,
      tracked_f0_uncertainty REAL,
      rpm_delta_pct REAL,
      reliable INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    -- 10. quality：质量指标
    CREATE TABLE IF NOT EXISTS quality (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      snr REAL,
      clipped INTEGER NOT NULL DEFAULT 0,
      agc INTEGER NOT NULL DEFAULT 0,
      sample_rate_ok INTEGER NOT NULL DEFAULT 1,
      dropouts INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ok',
      created_at INTEGER NOT NULL
    );

    -- 11. settings：设置
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- 12. licenses：授权
    CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      machine_id TEXT NOT NULL,
      issued_at INTEGER NOT NULL,
      expires_at INTEGER,
      features TEXT NOT NULL,
      signature TEXT NOT NULL
    );

    -- 13. reports：报告
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      format TEXT NOT NULL DEFAULT 'json',
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- 14. exports：导出记录
    CREATE TABLE IF NOT EXISTS exports (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      kind TEXT NOT NULL,
      path TEXT,
      created_at INTEGER NOT NULL
    );

    -- 15. cases：案例库（复测对比）
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id),
      point_id TEXT REFERENCES points(id),
      session_ids TEXT NOT NULL,
      baseline_version INTEGER,
      conclusion TEXT,
      created_at INTEGER NOT NULL
    );

    -- 16. system：系统元数据
    CREATE TABLE IF NOT EXISTS system (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 写入算法版本
  await db.exec(`
    INSERT INTO system (key, value) VALUES ('algorithm_version', 'v2.0-2026.11')
    ON CONFLICT(key) DO NOTHING;
  `);
}
