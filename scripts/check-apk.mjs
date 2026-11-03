#!/usr/bin/env node
/**
 * 安装包自检：入口文件 + 前端资源引用 + 版本事实 + v2/v3 签名。
 * 用法：node scripts/check-apk.mjs <apk 路径>
 * 退出码 0 = 通过；1 = 缺文件 / 引用断裂 / 未签名 / 校验失败。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const apk = process.argv[2];
if (!apk) {
  console.error("用法：node scripts/check-apk.mjs <apk 路径>");
  process.exit(1);
}
const file = resolve(apk);
if (!existsSync(file)) {
  console.error(`找不到安装包：${file}`);
  process.exit(1);
}

// 查找 Android SDK build-tools 目录
function findSdkBuildTools() {
  const candidates = [
    join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk", "build-tools"),
    join(process.env.ANDROID_HOME ?? "", "build-tools"),
    join(process.env.ANDROID_SDK_ROOT ?? "", "build-tools"),
    "D:\\Users\\Documents\\Trae-CN\\default\\android-sdk\\build-tools",
  ].filter((p) => p && existsSync(p));
  for (const base of candidates) {
    const dirs = readdirSync(base).filter((d) => /^\d/.test(d)).sort().reverse();
    for (const d of dirs) {
      const bt = join(base, d);
      if (existsSync(join(bt, "aapt2.exe")) || existsSync(join(bt, "aapt2"))) return bt;
    }
  }
  return null;
}
const SDK_BT = findSdkBuildTools();
const aapt2 = SDK_BT
  ? (existsSync(join(SDK_BT, "aapt2.exe")) ? join(SDK_BT, "aapt2.exe") : join(SDK_BT, "aapt2"))
  : null;
// 优先用 java -jar apksigner.jar（Windows 上 .bat 无法被 execFileSync 直接 spawn）
const apksignerJar = SDK_BT ? join(SDK_BT, "lib", "apksigner.jar") : null;
const apksignerCmd = apksignerJar && existsSync(apksignerJar) ? "java" : null;
const apksignerArgs = apksignerJar ? ["-jar", apksignerJar] : [];

// 优先用 unzip，回退到 jar（JDK 自带，APK 即 ZIP）
const hasUnzip = (() => {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const zipList = () => {
  if (hasUnzip) {
    return execFileSync("unzip", ["-Z1", file], { encoding: "utf8" })
      .split("\n").map((l) => l.trim()).filter(Boolean);
  }
  // jar tf 列出条目
  return execFileSync("jar", ["tf", file], { encoding: "utf8" })
    .split("\n").map((l) => l.trim()).filter(Boolean);
};

const zipRead = (entry) => {
  if (hasUnzip) {
    return execFileSync("unzip", ["-p", file, entry], { encoding: "utf8" });
  }
  // jar xf 提取到临时目录再读
  const tmp = join(tmpdir(), `apk-check-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  execFileSync("jar", ["xf", file, entry], { cwd: tmp });
  const content = readFileSync(join(tmp, entry), "utf8");
  rmSync(tmp, { recursive: true, force: true });
  return content;
};

const entries = zipList();
const hasIndex = entries.includes("assets/www/index.html");
const js = entries.filter((name) => /^assets\/www\/assets\/index-[^/]+\.js$/.test(name));
const css = entries.filter((name) => /^assets\/www\/assets\/[^/]+\.css$/.test(name));
const manifest = entries.includes("assets/www/__grok/manifest.webmanifest");

// 版本事实：优先读 aapt2 badging，读不到就留空，不猜。
const version = { package: null, versionCode: null, versionName: null };
if (aapt2) {
  try {
    const out = execFileSync(aapt2, ["dump", "badging", file], { encoding: "utf8" });
    version.package = out.match(/package: name='([^']+)'/)?.[1] ?? null;
    version.versionCode = Number(out.match(/versionCode='([^']+)'/)?.[1] ?? "") || null;
    version.versionName = out.match(/versionName='([^']+)'/)?.[1] ?? null;
  } catch {
    /* badging 失败不影响签名校验，但版本事实会缺项 */
  }
}

// index.html 里引用的 assets 必须真实存在，防 ERR_CACHE_MISS / 路径大小写问题。
let referenced = [];
let brokenRefs = [];
if (hasIndex) {
  const html = zipRead("assets/www/index.html");
  referenced = Array.from(
    new Set(
      Array.from(html.matchAll(/(?:src|href)="(?:\.\/|\/)?(assets\/[^"]+)"/g), (m) => m[1])
        .filter((name) => name && !name.startsWith("assets/www/")),
    ),
  );
  const expected = referenced.map((name) => `assets/www/${name}`);
  brokenRefs = expected.filter((name) => !entries.includes(name));
}

// 前端内容指纹：index + 入口 js + css 的联合 SHA-256，便于和构建产物对账。
const contentSha256 = createHash("sha256");
for (const entry of ["assets/www/index.html", ...js, ...css].sort()) {
  if (!entries.includes(entry)) continue;
  contentSha256.update(entry);
  contentSha256.update(zipRead(entry));
}

let schemes = null;
let certSha256 = null;
let signError = null;
if (apksignerCmd) {
  try {
    const out = execFileSync(apksignerCmd, [...apksignerArgs, "verify", "-v", "--print-certs", file], { encoding: "utf8" });
    schemes = {
      v1: /Verified using v1 scheme.*: true/.test(out),
      v2: /Verified using v2 scheme.*: true/.test(out),
      v3: /Verified using v3 scheme.*: true/.test(out),
    };
    certSha256 = out.match(/Signer #1 certificate SHA-256 digest: ([0-9a-f]+)/i)?.[1] ?? null;
  } catch (err) {
    signError = err instanceof Error ? err.message : String(err);
  }
} else {
  signError = "未找到 apksigner";
}

const buffer = readFileSync(file);
const result = {
  apk: file,
  checkedAt: new Date().toISOString(),
  size: statSync(file).size,
  sha256: createHash("sha256").update(buffer).digest("hex"),
  build: { ...version, contentSha256: contentSha256.digest("hex") },
  entries: {
    index: hasIndex,
    js,
    css,
    manifest,
    referenced,
    brokenRefs,
  },
  signature: { tool: apksignerJar ?? null, schemes, certSha256, error: signError },
};

const ok =
  hasIndex &&
  js.length > 0 &&
  css.length > 0 &&
  brokenRefs.length === 0 &&
  version.versionCode !== null &&
  !signError &&
  schemes?.v2 === true &&
  schemes?.v3 === true;
console.log(JSON.stringify({ ok, ...result }, null, 2));
process.exit(ok ? 0 : 1);
