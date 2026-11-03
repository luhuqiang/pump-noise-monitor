#!/usr/bin/env node
/**
 * 听诊仪 APK 一键构建：build → 打包 → 对齐 → 签名 → 自检
 *
 * 密钥路径：stethoscope-keys/听诊仪-密钥包-20261103/secrets/android/pump-release.jks
 * （密钥已由用户提供，不复制进项目）
 */
import { execSync } from "node:child_process";
import { existsSync, rmSync, cpSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const APK_MONITOR = join(ROOT, "apkwork", "monitor");
const WWW = join(APK_MONITOR, "assets", "www");
const KEYS_DIR = join(
  ROOT,
  "stethoscope-keys",
  "听诊仪-密钥包-20261103",
  "secrets"
);
const JKS = join(KEYS_DIR, "android", "pump-release.jks");
const BUILD_DIR = join(ROOT, "apkwork", "build");
const UNALIGNED = join(BUILD_DIR, "app-unaligned.apk");
const ALIGNED = join(BUILD_DIR, "app-aligned.apk");
const SIGNED = join(ROOT, "听诊仪.apk");

const run = (cmd, opts = {}) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts });
};

// 0) 检查密钥
if (!existsSync(JKS)) {
  console.error(`❌ 找不到签名密钥: ${JKS}`);
  console.error("请确认 stethoscope-keys/ 目录已解压。");
  process.exit(1);
}

// 1) 构建前端
console.log("\n=== 1/5 构建前端 ===");
run("npm run build");

// 2) 清空旧资源，拷贝新资源
console.log("\n=== 2/5 拷贝资源到 APK 壳 ===");
rmSync(WWW, { recursive: true, force: true });
mkdirSync(WWW, { recursive: true });
cpSync(DIST, WWW, { recursive: true });
console.log(`已拷贝到 ${WWW}`);

// 3) apktool 回编译
console.log("\n=== 3/5 apktool 回编译 ===");
mkdirSync(BUILD_DIR, { recursive: true });
if (existsSync(UNALIGNED)) rmSync(UNALIGNED);
run(`java -jar ${join(ROOT, "apkwork", "tools", "apktool", "apktool.jar")} b -nc ${APK_MONITOR} -o ${UNALIGNED}`);

// 4) zipalign + 签名
console.log("\n=== 4/5 对齐 + 签名 ===");
// 优先使用 Android SDK 的 Windows 版工具，回退到 apkwork 内置 jar
const SDK_BT = (() => {
  const candidates = [
    join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk", "build-tools"),
    join(process.env.ANDROID_HOME ?? "", "build-tools"),
    join(process.env.ANDROID_SDK_ROOT ?? "", "build-tools"),
  ].filter((p) => p && existsSync(p));
  for (const base of candidates) {
    const dirs = readdirSync(base).filter((d) => /^\d/.test(d)).sort().reverse();
    for (const d of dirs) {
      const bt = join(base, d);
      if (existsSync(join(bt, "zipalign.exe")) && existsSync(join(bt, "apksigner.bat"))) {
        return bt;
      }
    }
  }
  return null;
})();

if (existsSync(ALIGNED)) rmSync(ALIGNED);
if (SDK_BT) {
  console.log(`使用 SDK build-tools: ${SDK_BT}`);
  run(`"${join(SDK_BT, "zipalign.exe")}" -f 4 ${UNALIGNED} ${ALIGNED}`);
} else {
  console.warn("⚠️  未找到 Android SDK zipalign，跳过对齐（v2 签名仍可安装）");
  cpSync(UNALIGNED, ALIGNED);
}

if (existsSync(SIGNED)) rmSync(SIGNED);
// 调用签名辅助脚本：口令只从环境变量读取，经 env: 传给 apksigner
run(`node scripts/sign-apk.mjs "${ALIGNED}" "${SIGNED}"`);

// 5) 自检
console.log("\n=== 5/5 APK 自检 ===");
run(`node scripts/check-apk.mjs ${SIGNED}`);

console.log("\n✅ 构建完成: " + SIGNED);
