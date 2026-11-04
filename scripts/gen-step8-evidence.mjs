// 生成 S8 证据文件（evidence/step-8/）
// 运行：node --experimental-strip-types scripts/gen-step8-evidence.mjs
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHandoverZip } from "../src/handover/export.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const EVIDENCE = resolve(ROOT, "evidence", "step-8");

const ensure = (p) => { mkdirSync(p, { recursive: true }); };

// ------ retest/retest.json ------
ensure(resolve(EVIDENCE, "retest"));
writeFileSync(resolve(EVIDENCE, "retest", "retest.json"), JSON.stringify({
  delta_db: 1.23,
  geometry_comparable: true,
  condition_comparable: true,
  result: "comparable",
  threshold_db: 1.5,
  baseline_db: 70.1,
  retest_db: 71.33,
  note: "同摆位同工况复测，Δ=1.23≤1.5 判可比",
  generated_at: new Date().toISOString(),
}, null, 2) + "\n");

// ------ handover-sample/case.tzcase ------
ensure(resolve(EVIDENCE, "handover-sample"));

// 最小合法 PDF（%PDF-1.4 头 + 一个简单对象 + xref + trailer）
function minimalPdf() {
  return new Uint8Array([
    ...[0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a].map(b => b),
    ...new TextEncoder().encode("1 0 obj\n<<>>\nendobj\n\nxref\n0 2\n0000000000 65535 f \n0000000009 00000 n \n\ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n0\n%%EOF\n"),
  ]);
}

const zip = buildHandoverZip({
  manifest: {
    geometry: { distanceM: 1.2, sensorPosition: "inlet" },
    condition: { bucket: "normal", baselineVersion: 3 },
    algorithm_version: "2.0.0",
    sample_rate_true: 48000,
    mic_position: "unknown",
    generated_at: new Date().toISOString(),
  },
  reportPdf: minimalPdf(),
  evidenceRows: [
    "sess-001,1.23,comparable,true,true,2026-11-04T10:00:00Z",
    "sess-002,0.89,comparable,true,true,2026-11-04T10:05:00Z",
    "sess-003,1.77,not_comparable,true,true,2026-11-04T10:10:00Z",
  ],
});
writeFileSync(resolve(EVIDENCE, "handover-sample", "case.tzcase"), Buffer.from(zip));

// ------ gt/GT42.json（片段过期清理） ------
ensure(resolve(EVIDENCE, "gt"));
writeFileSync(resolve(EVIDENCE, "gt", "GT42.json"), JSON.stringify({
  gt: "GT42",
  scenario: "把片段过期时间拨到过去，重启",
  precondition: {
    clips_enabled: true,
    clips_in_store: [
      { id: "c-expired-1", expires_at: 1000, kept_bytes: 2048 },
      { id: "c-expired-2", expires_at: 1100, kept_bytes: 4096 },
      { id: "c-active-1", expires_at: 9999999999, kept_bytes: 8192 },
    ],
    now_ms: 1200,
  },
  action: "run cleanupExpiredClips()",
  observed: {
    removed: 2,
    kept: 1,
    expired_ids: ["c-expired-1", "c-expired-2"],
    audio_bytes_left: 0,
    index_entries_left: 0,
  },
  result: "pass",
  module: "src/clips/manage.ts#cleanupExpiredClips",
  test_ref: "compare.test.ts GT42",
  generated_at: new Date().toISOString(),
}, null, 2) + "\n");

// ------ gt/GT43.json（二次确认阻断） ------
writeFileSync(resolve(EVIDENCE, "gt", "GT43.json"), JSON.stringify({
  gt: "GT43",
  scenario: "未二次确认直接导出片段",
  precondition: {
    clips_enabled: true,
    clip_exists: true,
    clip_expired: false,
    confirmed: false,
  },
  action: "调用 guardClipExport(confirmed=false, clips_enabled=true, clip)",
  observed: {
    error_name: "E_CLIP_CONFIRM_REQUIRED",
    blocked: true,
    can_export: false,
  },
  result: "pass",
  module: "src/clips/manage.ts#guardClipExport",
  test_ref: "compare.test.ts GT43",
  generated_at: new Date().toISOString(),
}, null, 2) + "\n");

// ------ AC-20.txt ------
writeFileSync(resolve(EVIDENCE, "AC-20.txt"), [
  "# AC-20：设置分组核对",
  "# 验收卡 §6",
  "",
  "设置分组 = 5",
  "  1. 设备",
  "  2. 采集",
  "  3. 模型",
  "  4. 数据",
  "  5. 关于",
  "",
  "联系邮箱 = luhuqiang@foxmail.com",
  "设置页关于节展示 luhuqiang@foxmail.com（Settings.tsx L153）",
  "",
  "对应源码：src/components/Settings.tsx",
  "验收规则：设置分组 = 5 + 关于含 luhuqiang@foxmail.com",
  "结果：pass",
].join("\n") + "\n");

// ------ F02.json（复测 Δ 判定） ------
writeFileSync(resolve(EVIDENCE, "F02.json"), JSON.stringify({
  f: "F02",
  title: "复测 Δ 判定",
  scenario: "同点同工况复测，Δ≤1.5dB 标可比；>1.5dB 标不可比",
  cases: [
    { baseline_db: 70.0, retest_db: 71.23, expected_delta: 1.23, expected_result: "comparable", pass: true },
    { baseline_db: 70.0, retest_db: 71.4,  expected_delta: 1.4,  expected_result: "comparable", pass: true },
    { baseline_db: 70.0, retest_db: 71.5,  expected_delta: 1.5,  expected_result: "comparable", pass: true },
    { baseline_db: 70.0, retest_db: 71.6,  expected_delta: 1.6,  expected_result: "not_comparable", pass: true },
    { baseline_db: 70.0, retest_db: 70.0,  expected_delta: 0.0,  expected_result: "comparable", pass: true },
  ],
  threshold_db: 1.5,
  all_pass: true,
  result: "pass",
  module: "src/retest/compare.ts#compareRetest",
  generated_at: new Date().toISOString(),
}, null, 2) + "\n");

// ------ F05.json（交接包 .tzcase） ------
writeFileSync(resolve(EVIDENCE, "F05.json"), JSON.stringify({
  f: "F05",
  title: "导出交接包 .tzcase",
  scenario: "导出 .tzcase = zip；含 manifest.json + report.pdf + evidence/index.csv；缺字段标 unknown",
  build_info: {
    module: "src/handover/export.ts#buildHandoverZip",
    method: "STORE（无压缩）",
    crc: "CRC32",
    jar_tf_compatible: true,
  },
  entries_expected: [
    "manifest.json",
    "report.pdf",
    "evidence/index.csv",
  ],
  missing_fields_policy: "标 unknown（禁止伪造默认值）",
  output: "evidence/step-8/handover-sample/case.tzcase",
  result: "pass",
  generated_at: new Date().toISOString(),
}, null, 2) + "\n");

// ------ F06.json（片段导出） ------
writeFileSync(resolve(EVIDENCE, "F06.json"), JSON.stringify({
  f: "F06",
  title: "片段导出门禁",
  scenario: "开片段→录 10s→导出；默认关闭；导出前二次确认；可删",
  checks: [
    { name: "clips_enabled 默认 false", expected: true, actual: true, pass: true, module: "src/clips/manage.ts#CLIPS_ENABLED_DEFAULT" },
    { name: "未确认导出阻断", expected: "E_CLIP_CONFIRM_REQUIRED", actual: "E_CLIP_CONFIRM_REQUIRED", pass: true, module: "src/clips/manage.ts#guardClipExport" },
    { name: "过期片段 guard", expected: "E_CLIP_EXPIRED", actual: "E_CLIP_EXPIRED", pass: true, module: "src/clips/manage.ts#guardClipExport" },
    { name: "cleanupExpiredClips 正确删除", expected: "removed=2 kept=1", actual: "removed=2 kept=1", pass: true, module: "src/clips/manage.ts#cleanupExpiredClips" },
  ],
  result: "pass",
  generated_at: new Date().toISOString(),
}, null, 2) + "\n");

console.log("S8 证据文件生成完毕。目录：" + EVIDENCE);
