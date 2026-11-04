/**
 * S8 测试：复测 Δ 边界 / GT42 片段过期清理 / GT43 二次确认阻断 / .tzcase zip / clips_enabled 默认关闭。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareRetest, RETEST_THRESHOLD_DB } from "./compare.ts";
import {
  CLIP_ERROR,
  CLIPS_ENABLED_DEFAULT,
  cleanupExpiredClips,
  computeExpiresAt,
  guardClipExport,
  isClipsEnabled,
  isClipExpired,
  type ClipRecord,
} from "../clips/manage.ts";
import { buildZip, buildHandoverZip, REQUIRED_ENTRIES, validateTzcaseEntries, crc32 } from "../handover/export.ts";

// ------ 复测 Δ 边界 ------

test("S8 复测 Δ=1.4 → comparable（必须）", () => {
  const r = compareRetest({
    baselineDb: 70.0,
    retestDb: 71.4,
    geometryComparable: true,
    conditionComparable: true,
  });
  assert.equal(r.delta_db, 1.4);
  assert.equal(r.result, "comparable");
  assert.equal(r.threshold_db, 1.5);
});

test("S8 复测 Δ=1.6 → not_comparable（必须）", () => {
  const r = compareRetest({
    baselineDb: 70.0,
    retestDb: 71.6,
    geometryComparable: true,
    conditionComparable: true,
  });
  assert.equal(r.delta_db, 1.6);
  assert.equal(r.result, "not_comparable");
});

test("S8 复测 Δ=1.5 → comparable（阈值边界冻结）", () => {
  const r = compareRetest({
    baselineDb: 70.0,
    retestDb: 71.5,
    geometryComparable: true,
    conditionComparable: true,
  });
  assert.equal(r.delta_db, 1.5);
  assert.equal(r.result, "comparable");
});

test("S8 复测 Δ=0.0 → comparable", () => {
  const r = compareRetest({
    baselineDb: 72.3,
    retestDb: 72.3,
    geometryComparable: true,
    conditionComparable: true,
  });
  assert.equal(r.delta_db, 0.0);
  assert.equal(r.result, "comparable");
});

test("S8 复测 几何/工况任一 false → not_comparable（哪怕 Δ 很小）", () => {
  const r1 = compareRetest({
    baselineDb: 70, retestDb: 70.01,
    geometryComparable: false, conditionComparable: true,
  });
  assert.equal(r1.result, "not_comparable");

  const r2 = compareRetest({
    baselineDb: 70, retestDb: 70.01,
    geometryComparable: true, conditionComparable: false,
  });
  assert.equal(r2.result, "not_comparable");
});

test("S8 复测 RETEST_THRESHOLD_DB 冻结为 1.5", () => {
  assert.equal(RETEST_THRESHOLD_DB, 1.5);
});

// ------ GT42：片段过期清理 ------

test("GT42：过期片段 → 清理后 removed 正确，仍有效保留", () => {
  const now = 1_000_000;
  const expired: ClipRecord[] = [
    { id: "c1", session_id: "s1", start_ms: 0, length_ms: 1000, created_at: 0, expires_at: now - 1 },
    { id: "c2", session_id: "s1", start_ms: 0, length_ms: 1000, created_at: 0, expires_at: now - 100 },
  ];
  const active: ClipRecord[] = [
    { id: "c3", session_id: "s1", start_ms: 0, length_ms: 1000, created_at: 0, expires_at: now + 1000 },
  ];
  const res = cleanupExpiredClips([...expired, ...active], now);
  assert.equal(res.removed, 2);
  assert.equal(res.kept, 1);
  assert.deepEqual(res.expiredIds.sort(), ["c1", "c2"]);
});

test("GT42：过期 guardClipExport → E_CLIP_EXPIRED", () => {
  const now = 5_000_000;
  const clip: ClipRecord = {
    id: "c-expired",
    session_id: "s1",
    start_ms: 0, length_ms: 5000,
    created_at: now - 10_000,
    expires_at: now - 100,
  };
  const err = guardClipExport(true, true, clip, now);
  assert.ok(err);
  assert.equal(err!.name, CLIP_ERROR.E_CLIP_EXPIRED);
});

// ------ GT43：二次确认阻断 ------

test("GT43：未确认直接导出 → E_CLIP_CONFIRM_REQUIRED", () => {
  const clip: ClipRecord = {
    id: "c-ok", session_id: "s1",
    start_ms: 0, length_ms: 5000,
    created_at: 0, expires_at: Number.MAX_SAFE_INTEGER,
  };
  const err = guardClipExport(false, true, clip);
  assert.ok(err);
  assert.equal(err!.name, CLIP_ERROR.E_CLIP_CONFIRM_REQUIRED);
});

test("GT43：已确认 + 片段有效 + clips_enabled=true → null（通过）", () => {
  const clip: ClipRecord = {
    id: "c-ok", session_id: "s1",
    start_ms: 0, length_ms: 5000,
    created_at: 0, expires_at: Number.MAX_SAFE_INTEGER,
  };
  const err = guardClipExport(true, true, clip);
  assert.equal(err, null);
});

// ------ clips_enabled 默认 false ------

test("S8 clips_enabled 默认 false（CLIPS_ENABLED_DEFAULT）", () => {
  assert.equal(CLIPS_ENABLED_DEFAULT, false);
});

test("S8 isClipsEnabled(undefined) → false", () => {
  assert.equal(isClipsEnabled(undefined), false);
  assert.equal(isClipsEnabled(null), false);
  assert.equal(isClipsEnabled(false), false);
  assert.equal(isClipsEnabled(true), true);
});

test("S8 clips_enabled=false 时 guardClipExport → E_CLIPS_DISABLED", () => {
  const clip: ClipRecord = {
    id: "c-any", session_id: "s1",
    start_ms: 0, length_ms: 5000,
    created_at: 0, expires_at: Number.MAX_SAFE_INTEGER,
  };
  const err = guardClipExport(true, false, clip);
  assert.ok(err);
  assert.equal(err!.name, CLIP_ERROR.E_CLIPS_DISABLED);
});

// ------ 过期辅助 ------

test("S8 isClipExpired 边界：expires_at ≤ now → true；> now → false", () => {
  const clip: ClipRecord = {
    id: "x", session_id: "s",
    start_ms: 0, length_ms: 0, created_at: 0,
    expires_at: 100,
  };
  assert.equal(isClipExpired(clip, 100), true);
  assert.equal(isClipExpired(clip, 99), false);
  assert.equal(isClipExpired(clip, 101), true);
});

test("S8 computeExpiresAt = created + ttl", () => {
  assert.equal(computeExpiresAt(1000, 500), 1500);
});

// ------ .tzcase / zip ------

test("S8 buildZip 生成 STORE zip（CRC32 自检）", () => {
  const hello = new TextEncoder().encode("hello world");
  const crc = crc32(hello);
  assert.equal(crc, 0x0d4a1185); // 标准 CRC32 向量
});

test("S8 buildZip 生成字节非空", () => {
  const bytes = buildZip([
    { path: "manifest.json", data: new TextEncoder().encode("{\"ok\":true}") },
    { path: "report.pdf", data: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }, // %PDF
    { path: "evidence/index.csv", data: new TextEncoder().encode("id\n1\n") },
  ]);
  assert.ok(bytes.length > 0);
  // zip magic
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
});

test("S8 buildHandoverZip 含必需 3 条目", () => {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const zip = buildHandoverZip({
    manifest: { geometry: "unknown", algorithm_version: "unknown" },
    reportPdf: pdfBytes,
    evidenceRows: ["r1,1.2,comparable,true,true,2026-11-04T00:00:00Z"],
  });
  assert.ok(zip.length > 0);
  // zip magic
  assert.equal(zip[0], 0x50);
  assert.equal(zip[1], 0x4b);
});

test("S8 validateTzcaseEntries 对 3 必需条目 → true", () => {
  assert.equal(REQUIRED_ENTRIES.length, 3);
  assert.ok(validateTzcaseEntries([
    "manifest.json",
    "report.pdf",
    "evidence/index.csv",
  ]));
  assert.equal(validateTzcaseEntries(["manifest.json", "report.pdf"]), false);
});
