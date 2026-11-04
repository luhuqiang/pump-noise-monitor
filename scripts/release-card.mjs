#!/usr/bin/env node
/**
 * release-card 生成与自校验（schema 1.1，21 键 / 19 门禁字段非空）。
 *
 * 用法：node scripts/release-card.mjs [--step S1] [--tag step-1] [--apk .\听诊仪.apk] [--out evidence\step-1\release-card.json]
 *
 * 口径：
 * - tag 缺省为当步 tag（step-N），发布步用 --tag v2.0.0 覆盖；
 * - gt/f 若 evidence/step-N/gt-results.csv / f-results.csv 存在则读取，否则 fallback 全 not_run；
 * - ac 一律 not_run；GT31–39 为 na（D-04 双麦未实装），禁止把 not_run/na 写成 pass；
 * - 工作区存在已跟踪改动时拒绝生成（commit 与产物必须对应）。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const step = arg("step", "S1");
const stepNum = Number(String(step).replace(/\D/g, ""));
const tag = arg("tag", `step-${stepNum}`);
const apk = resolve(arg("apk", "听诊仪.apk"));
const out = resolve(arg("out", `evidence/step-${stepNum}/release-card.json`));
const evidenceDir = `evidence/step-${stepNum}`;

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", cwd: ROOT }).trim();
const git = (args) => run("git", args);

// ---- 0) 前置：工作区干净（仅跟踪文件，SKIP_DIRTY_CHECK=1 可临时跳过）----
if (process.env.SKIP_DIRTY_CHECK !== "1") {
  const dirty = git(["status", "--porcelain", "--untracked-files=no"]);
  if (dirty) {
    console.error("工作区存在未提交的跟踪文件改动，commit 与产物将不对应：\n" + dirty);
    process.exit(1);
  }
}
if (!existsSync(apk)) {
  console.error(`找不到 APK：${apk}（先 npm run apk）`);
  process.exit(1);
}

// ---- 1) check-apk 事实 ----
const check = JSON.parse(run("node", ["scripts/check-apk.mjs", apk]));
if (!check.ok) {
  console.error("check-apk 未通过，拒绝生成 release-card。");
  process.exit(1);
}

// ---- 2) 证书主体 / 工具链 ----
const bt = resolve(
  process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? "",
  "build-tools"
);
const apksignerJar = (() => {
  for (const d of readdirSync(bt).filter((x) => /^\d/.test(x)).sort().reverse()) {
    const p = resolve(bt, d, "lib", "apksigner.jar");
    if (existsSync(p)) return p;
  }
  return null;
})();
const verifyOut = run("java", ["-jar", apksignerJar, "verify", "-v", "--print-certs", apk]);
const certSubject = verifyOut.match(/Signer #1 certificate DN: (.+)/)?.[1]?.trim() ?? null;
const buildToolsVersion = apksignerJar?.match(/build-tools[\\/](\d+\.\d+\.\d+)/)?.[1] ?? null;
const apktoolVersion = run("java", ["-jar", "apkwork/tools/apktool/apktool.jar", "--version"]);
const nodeVersion = run("node", ["--version"]);

// ---- 3) CSV 解析 + 门禁套件 ----
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    header.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}
function loadGtResults(stepNum) {
  const csvPath = resolve(ROOT, `evidence/step-${stepNum}/gt-results.csv`);
  if (!existsSync(csvPath)) return null;
  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  const map = {};
  const counts = { pass: 0, na: 0, not_run: 0, fail: 0 };
  const waiversRaw = [];
  for (const row of rows) {
    const id = (row.gt ?? "").trim();
    const st = (row.status ?? "").trim();
    const wv = (row.waiver ?? "").trim();
    if (!id) continue;
    map[id] = st;
    if (st in counts) counts[st]++;
    if (wv) waiversRaw.push({ id, status: st, reason: wv });
  }
  return { map, total: rows.length, ...counts, waiversRaw };
}
function loadFResults(stepNum) {
  const csvPath = resolve(ROOT, `evidence/step-${stepNum}/f-results.csv`);
  if (!existsSync(csvPath)) return null;
  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  const map = {};
  const counts = { pass: 0, not_run: 0, waived: 0, fail: 0, other: 0 };
  const waiversRaw = [];
  for (const row of rows) {
    const id = (row.f ?? "").trim();
    const st = (row.status ?? "").trim();
    const wv = (row.waiver ?? "").trim();
    if (!id) continue;
    map[id] = st;
    if (st in counts) counts[st]++; else counts.other++;
    if (wv) waiversRaw.push({ id, status: st, reason: wv });
  }
  return { map, total: rows.length, ...counts, waiversRaw };
}

// 聚合 waiver 条目：按 reason 去重合并 ids
function aggregateWaivers(gtCsv, fCsv) {
  const raw = [];
  if (gtCsv?.waiversRaw) raw.push(...gtCsv.waiversRaw);
  if (fCsv?.waiversRaw) raw.push(...fCsv.waiversRaw);
  const groups = {};
  for (const w of raw) {
    if (!groups[w.reason]) groups[w.reason] = { ids: [], statuses: new Set() };
    groups[w.reason].ids.push(w.id);
    groups[w.reason].statuses.add(w.status);
  }
  return Object.entries(groups).map(([reason, g]) => ({
    id: g.ids.join(", "),
    reason,
    ids: g.ids,
    statuses: Array.from(g.statuses),
    approved_by: null,
    approved_at: null,
  }));
}

const notRun = (ids, naIds = []) =>
  Object.fromEntries(ids.map((id) => [id, naIds.includes(id) ? "na" : "not_run"]));
const gtIds = Array.from({ length: 45 }, (_, i) => `GT${String(i + 1).padStart(2, "0")}`);
const gtNa = Array.from({ length: 9 }, (_, i) => `GT${31 + i}`); // D-04：双麦未实现，GT31–39 为 N/A
const acIds = Array.from({ length: 23 }, (_, i) => `AC-${String(i + 1).padStart(2, "0")}`);
const fIds = Array.from({ length: 12 }, (_, i) => `F${String(i + 1).padStart(2, "0")}`);
const cIds = Array.from({ length: 42 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`);

// 尝试从 CSV 加载，缺失 fallback 到全 notRun / na
const gtCsv = loadGtResults(stepNum);
const fCsv = loadFResults(stepNum);
const gtMap = gtCsv
  ? Object.fromEntries(gtIds.map((id) => [id, gtCsv.map[id] ?? "not_run"]))
  : notRun(gtIds, gtNa);
const fMap = fCsv
  ? Object.fromEntries(fIds.map((id) => [id, fCsv.map[id] ?? "not_run"]))
  : notRun(fIds);

// ---- 4) 组装 21 键 ----
const apkBytes = readFileSync(apk);
const card = {
  schema_version: "1.1",
  step,
  build: {
    contentSha256: check.build.contentSha256,
    size: check.size,
    checkedAt: check.checkedAt,
  },
  commit: git(["rev-parse", "HEAD"]),
  tag,
  versionCode: check.build.versionCode,
  versionName: check.build.versionName,
  package: check.build.package,
  apk_path: "听诊仪.apk",
  apk_sha256: createHash("sha256").update(apkBytes).digest("hex"),
  cert_sha256: check.signature.certSha256,
  cert_subject: certSubject,
  built_at: new Date().toISOString(),
  toolchain: {
    node: nodeVersion,
    build_tools: buildToolsVersion,
    apktool: apktoolVersion,
    apksigner: buildToolsVersion,
  },
  gt: gtMap,
  ac: notRun(acIds),
  f: fMap,
  samples: { total: 0, status: "not_run", note: "样本验收在 S10（≥300 段）" },
  reviews: { "评审12": "not_run", "评审15": "not_run", "评审16": "not_run", note: "评审在 S11" },
  waivers: aggregateWaivers(gtCsv, fCsv),
  evidence_dir: evidenceDir,
  stats: {
    gt: gtCsv
      ? { total: gtCsv.total, pass: gtCsv.pass, na: gtCsv.na, not_run: gtCsv.not_run, fail: gtCsv.fail }
      : { total: 45, pass: 0, na: 9, not_run: 36, fail: 0 },
    ac: { total: 24 },
    f: fCsv
      ? { total: fCsv.total, pass: fCsv.pass, not_run: fCsv.not_run, waived: fCsv.waived, fail: fCsv.fail }
      : { total: 12, pass: 0, not_run: 12, waived: 0, fail: 0 },
  },
};

// ---- 5) 自校验：21 键存在 / 19 门禁非空 / 哈希与实算一致 / 套件计数求和 ----
const KEYS = [
  "schema_version", "step", "build", "commit", "tag", "versionCode", "versionName",
  "package", "apk_path", "apk_sha256", "cert_sha256", "cert_subject", "built_at",
  "toolchain", "gt", "ac", "f", "samples", "reviews", "waivers", "evidence_dir",
];
const GATE19 = KEYS.filter((k) => !["waivers", "evidence_dir"].includes(k));
const errors = [];
for (const k of KEYS) if (!(k in card)) errors.push(`缺键 ${k}`);
for (const k of GATE19) {
  const v = card[k];
  const empty = v === null || v === undefined || v === "" || (typeof v === "object" && Object.keys(v).length === 0);
  if (empty) errors.push(`门禁字段为空 ${k}`);
}
const realApkSha = createHash("sha256").update(readFileSync(apk)).digest("hex");
if (card.apk_sha256 !== realApkSha) errors.push("apk_sha256 与实算不一致");
if (card.cert_sha256 !== check.signature.certSha256) errors.push("cert_sha256 与 check-apk 不一致");
// 四元组求和：gt/ac/f/c 编号总量与台账一致（45/23/12/42）
const sums = { gt: Object.keys(card.gt).length, ac: Object.keys(card.ac).length, f: Object.keys(card.f).length, c: cIds.length };
if (!(sums.gt === 45 && sums.ac === 23 && sums.f === 12 && sums.c === 42)) {
  errors.push(`编号计数异常 gt=${sums.gt} ac=${sums.ac} f=${sums.f} c=${sums.c}`);
}
if (errors.length) {
  console.error("release-card 校验失败：\n" + errors.join("\n"));
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(card, null, 2) + "\n", "utf8");
console.log(`✅ release-card 校验通过：${out}（21 键 / 19 门禁非空 / 哈希实算一致）`);
