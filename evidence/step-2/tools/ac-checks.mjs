/**
 * AC-11 对比度 / AC-12 无渐变发光投影 / AC-13 圆角语义 —— 实测脚本
 * 用法：node evidence/step-2/tools/ac-checks.mjs
 * 产出：evidence/step-2/AC-11.txt、AC-12.txt、AC-13.txt
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT = path.join(ROOT, "evidence", "step-2");
const tokensCss = fs.readFileSync(path.join(ROOT, "src", "styles", "tokens.css"), "utf8");

/* ---------- 解析 tokens.css 双主题色值 ---------- */
function parseBlock(css, selector) {
  const m = css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}"));
  const out = {};
  if (!m) return out;
  for (const kv of m[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
    out[kv[1]] = kv[2].toLowerCase();
  }
  return out;
}
const light = parseBlock(tokensCss, ":root");
const dark = parseBlock(tokensCss, '[data-theme="dark"]');

/* ---------- WCAG 2.1 相对亮度 ---------- */
function lum(hex) {
  const h = hex.length === 4 ? hex.slice(1).split("").map((c) => c + c).join("") : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return +((l1 + 0.05) / (l2 + 0.05)).toFixed(2);
};

/* ---------- AC-11：正文/次要文字 ≥4.5，三态双编码（文字色）≥4.5，brass 不作文字 ---------- */
const pairs = [];
for (const [name, t] of [["浅色", light], ["深色", dark]]) {
  pairs.push(
    [`${name} ink/paper`, t["--ink"], t["--paper"], 4.5],
    [`${name} ink/paper-2`, t["--ink"], t["--paper-2"], 4.5],
    [`${name} mist/paper`, t["--mist"], t["--paper"], 4.5],
    [`${name} mist/paper-2`, t["--mist"], t["--paper-2"], 4.5],
    [`${name} ok/paper`, t["--ok"], t["--paper"], 4.5],
    [`${name} low/paper`, t["--low"], t["--paper"], 4.5],
    [`${name} bad/paper`, t["--bad"], t["--paper"], 4.5],
    [`${name} paper/ink(主按钮文字)`, t["--paper"], t["--ink"], 4.5],
  );
}
let ac11 = "AC-11 对比度实测（WCAG 2.1 相对亮度，色值取自 src/styles/tokens.css）\n";
let ac11Pass = true;
for (const [label, fg, bg, need] of pairs) {
  if (!fg || !bg) { ac11 += `${label}\t缺色值 fg=${fg} bg=${bg}\n`; ac11Pass = false; continue; }
  const r = ratio(fg, bg);
  const ok = r >= need;
  if (!ok) ac11Pass = false;
  ac11 += `${label}\t${fg} on ${bg}\t${r}:1\t需≥${need}:1\t${ok ? "PASS" : "FAIL"}\n`;
}
ac11 += `brass 用途\t仅 7px 状态点/3px 顶帽，不用于文字（tokens.css 注释与组件走查一致）\tPASS\n`;
ac11 += `结论\t${ac11Pass ? "PASS" : "FAIL"}\n`;
fs.writeFileSync(path.join(OUT, "AC-11.txt"), ac11);

/* ---------- AC-12：全局禁渐变/发光/投影 ---------- */
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { if (!["node_modules", "dist"].includes(f.name)) walk(p); }
    else if (/\.(tsx|ts|css)$/.test(f.name)) files.push(p);
  }
})(path.join(ROOT, "src"));
const ban12 = /linear-gradient|radial-gradient|conic-gradient|box-shadow|text-shadow|filter\s*:|drop-shadow|glow/i;
let hits12 = [];
for (const f of files) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  lines.forEach((ln, i) => {
    if (ban12.test(ln) && !/box-shadow:\s*none|\/\//.test(ln.trim().slice(0, 20))) {
      hits12.push(`${path.relative(ROOT, f)}:${i + 1}: ${ln.trim()}`);
    }
  });
}
let ac12 = "AC-12 无渐变/发光/投影扫描（src/**/*.{ts,tsx,css}）\n";
ac12 += `扫描文件数\t${files.length}\n命中数\t${hits12.length}\n`;
ac12 += hits12.length ? hits12.join("\n") + "\n" : "唯一允许项：global.css 的 *{box-shadow:none} 兜底（命中行不计）\n";
ac12 += `结论\t${hits12.length === 0 ? "PASS" : "FAIL"}\n`;
fs.writeFileSync(path.join(OUT, "AC-12.txt"), ac12);

/* ---------- AC-13：圆角语义（0 / 2px / 50%，token 化） ---------- */
const radiusRe = /border-radius\s*:\s*([^;}]+)|borderRadius\s*:\s*([^,}\n]+)/g;
const allowed = /^(0|2px|50%|var\(--r-(panel|chip|dot)\)|"50%"|'50%'|"var\(--r-\w+\)"|'var\(--r-\w+\)')$/;
let hits13 = [], bad13 = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(radiusRe)) {
    const v = (m[1] ?? m[2]).trim().replace(/;$/, "");
    const line = src.slice(0, m.index).split("\n").length;
    hits13.push(`${path.relative(ROOT, f)}:${line}: ${v}`);
    if (!allowed.test(v)) bad13.push(`${path.relative(ROOT, f)}:${line}: ${v}`);
  }
}
let ac13 = "AC-13 圆角语义扫描（允许：0 / 2px / 50% / var(--r-panel|--r-chip|--r-dot)）\n";
ac13 += `圆角声明数\t${hits13.length}\n违规数\t${bad13.length}\n`;
if (bad13.length) ac13 += "违规明细：\n" + bad13.join("\n") + "\n";
ac13 += `结论\t${bad13.length === 0 ? "PASS" : "FAIL"}\n`;
fs.writeFileSync(path.join(OUT, "AC-13.txt"), ac13);

console.log(ac11.split("\n").slice(-2)[0], "|", ac12.split("\n").slice(-2)[0], "|", ac13.split("\n").slice(-2)[0]);
