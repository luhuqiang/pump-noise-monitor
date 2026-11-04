/**
 * S8 交接包导出：.tzcase 格式 = 纯 zip（STORE 方式，不压缩）。
 * 必需条目（验收卡 §3.2）：manifest.json、report.pdf、evidence/index.csv。
 * 缺字段一律标 "unknown"，禁止伪造默认值（验收卡 §8 禁止事项）。
 *
 * 本模块手写最小 zip writer（STORE / 无压缩），不依赖第三方库，
 * 保证 Node 内置 fs 即可生成可被 `jar tf` / PowerShell / 任何 zip 阅读器正确识别的包。
 */
import { createHash } from "node:crypto";

/** 交接包必需条目路径（验收卡 §3.2）。 */
export const REQUIRED_ENTRIES = [
  "manifest.json",
  "report.pdf",
  "evidence/index.csv",
] as const;

/** 交接条目。 */
export type HandoverEntry = {
  /** zip 内部路径（正斜杠） */
  path: string;
  /** 原始字节 */
  data: Uint8Array;
};

/** 交接 manifest 顶层键。 */
export type HandoverManifest = Record<string, unknown>;

/** 默认值常量——缺字段时用此常量（验收卡 §8）。 */
export const UNKNOWN = "unknown";

// ---------- CRC32（zip 要求） ----------
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32Impl(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 对外 CRC32（用于测试与 zip 写入）。 */
export const crc32 = crc32Impl;

// ---------- ZIP writer (STORE, 无压缩) ----------

function u16(v: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, v, true);
  return b;
}
function u32(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v >>> 0, true);
  return b;
}

/** DOS 时间戳：当前时间戳。 */
function dosTime(date = new Date()): { time: number; date: number } {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() / 2) & 0x1f);
  const d =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { time, date: d };
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * 生成 zip 文件字节。
 * 严格 STORE 方法（compression=0），无压缩，无 data descriptor。
 */
export function buildZip(entries: HandoverEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const { time, date } = dosTime();

  for (const e of entries) {
    const nameBytes = new TextEncoder().encode(e.path);
    const crc = crc32(e.data);
    const size = e.data.length;

    // 32 位 offset 足够本包
    const localHeader = concat([
      u32(0x04034b50),            // Local file header signature
      u16(20),                     // version needed to extract
      u16(0),                      // general purpose bit flag
      u16(0),                      // compression method (STORE)
      u16(time),
      u16(date),
      u32(crc),
      u32(size),                   // compressed size
      u32(size),                   // uncompressed size
      u16(nameBytes.length),
      u16(0),                      // extra field length
      nameBytes,
    ]);

    localParts.push(localHeader, e.data);

    const centralHeader = concat([
      u32(0x02014b50),            // Central directory signature
      u16(20),                     // version made by
      u16(20),                     // version needed to extract
      u16(0),                      // flags
      u16(0),                      // compression (STORE)
      u16(time),
      u16(date),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),                      // extra length
      u16(0),                      // comment length
      u16(0),                      // disk number start
      u16(0),                      // internal attributes
      u32(0),                      // external attributes
      u32(offset),                 // relative offset of local header
      nameBytes,
    ]);

    centralParts.push(centralHeader);
    offset += localHeader.length + e.data.length;
  }

  const localBlob = concat(localParts);
  const centralBlob = concat(centralParts);

  const end = concat([
    u32(0x06054b50),              // End of central dir signature
    u16(0),                       // disk number
    u16(0),                       // disk with central dir
    u16(entries.length),          // total entries on disk
    u16(entries.length),          // total entries
    u32(centralBlob.length),      // size of central dir
    u32(localBlob.length),        // offset of central dir
    u16(0),                       // comment length
  ]);

  return concat([localBlob, centralBlob, end]);
}

// ---------- 高层导出 ----------

type HandoverExportInput = {
  manifest: HandoverManifest;
  reportPdf: Uint8Array;
  /** evidence/index.csv 行 */
  evidenceRows: string[];
};

/** 构造缺失字段的安全回填。见验收卡 §8：禁止伪造默认值，只能标 unknown。 */
function sanitizeManifest(input: HandoverManifest): HandoverManifest {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null || v === "") out[k] = UNKNOWN;
    else out[k] = v;
  }
  return out;
}

/**
 * 生成 .tzcase 文件字节。
 * 返回一个 zip 字节数组，包含 manifest.json / report.pdf / evidence/index.csv。
 */
export function buildHandoverZip(input: HandoverExportInput): Uint8Array {
  const manifestBytes = new TextEncoder().encode(
    JSON.stringify(sanitizeManifest(input.manifest), null, 2),
  );
  const csvBytes = new TextEncoder().encode(
    ["id,delta_db,result,geometry_ok,condition_ok,timestamp", ...input.evidenceRows].join(
      "\n",
    ) + "\n",
  );

  const entries: HandoverEntry[] = [
    { path: "manifest.json", data: manifestBytes },
    { path: "report.pdf", data: input.reportPdf },
    { path: "evidence/index.csv", data: csvBytes },
  ];

  return buildZip(entries);
}

/** 校验 zip 中是否包含必需的 3 个条目（路径子串匹配）。 */
export function validateTzcaseEntries(entries: string[]): boolean {
  for (const req of REQUIRED_ENTRIES) {
    const hit = entries.some((e) => e.includes(req));
    if (!hit) return false;
  }
  return true;
}

/** 简单 SHA-256 供 manifest 使用。 */
export function sha256Hex(bytes: Uint8Array): string {
  const h = createHash("sha256");
  h.update(bytes);
  return h.digest("hex");
}
