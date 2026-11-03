#!/usr/bin/env node
/**
 * APK 签名辅助脚本：口令只从环境变量读取（PUMP_KS_PASS / PUMP_KEY_PASS），
 * 通过 env: 形式传给 apksigner（口令不出现在命令行 / 日志 / 仓库）。
 *
 * 用法：node scripts/sign-apk.mjs <aligned.apk> <signed.apk>
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const aligned = resolve(process.argv[2]);
const signed = resolve(process.argv[3]);
if (!aligned || !signed) {
  console.error("用法：node scripts/sign-apk.mjs <aligned.apk> <signed.apk>");
  process.exit(1);
}
if (!existsSync(aligned)) {
  console.error(`找不到待签名 APK：${aligned}`);
  process.exit(1);
}

// 1) 口令只从环境变量读取（口令不进脚本、不进仓库、不进日志）
const ksPass = process.env.PUMP_KS_PASS;
const keyPass = process.env.PUMP_KEY_PASS ?? ksPass;

if (!ksPass) {
  console.error("缺少环境变量 PUMP_KS_PASS（keystore 口令）；PUMP_KEY_PASS 可选，缺省复用 PUMP_KS_PASS。");
  console.error("示例（PowerShell，口令不落盘）：$env:PUMP_KS_PASS = '<从密钥交底文档读取>'");
  process.exit(1);
}

// 2) 查找 Android SDK build-tools
function findSdkBuildTools() {
  const candidates = [
    join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk", "build-tools"),
    join(process.env.ANDROID_HOME ?? "", "build-tools"),
    join(process.env.ANDROID_SDK_ROOT ?? "", "build-tools"),
  ].filter((p) => p && existsSync(p));
  for (const base of candidates) {
    const dirs = readdirSync(base).filter((d) => /^\d/.test(d)).sort().reverse();
    for (const d of dirs) {
      const bt = join(base, d);
      if (existsSync(join(bt, "lib", "apksigner.jar"))) return bt;
      if (existsSync(join(bt, "apksigner.bat"))) return bt;
      if (existsSync(join(bt, "apksigner"))) return bt;
    }
  }
  return null;
}
const bt = findSdkBuildTools();
// 优先用 java -jar apksigner.jar（跨平台），回退到 bat
const apksignerJar = bt ? join(bt, "lib", "apksigner.jar") : null;
const apksignerBat = bt
  ? (existsSync(join(bt, "apksigner.bat")) ? join(bt, "apksigner.bat") : join(bt, "apksigner"))
  : null;

const jks = process.env.PUMP_KEYSTORE
  ? resolve(process.env.PUMP_KEYSTORE)
  : join(ROOT, "stethoscope-keys", "听诊仪-密钥包-20261103", "secrets", "android", "pump-release.jks");
if (!existsSync(jks)) {
  console.error(`找不到签名密钥：${jks}（可用环境变量 PUMP_KEYSTORE 指定绝对路径）`);
  process.exit(1);
}

if (existsSync(signed)) rmSync(signed);

// 3) 通过环境变量传口令，apksigner 用 env: 形式读取
const env = {
  ...process.env,
  PUMP_KS_PASS: ksPass,
  PUMP_KEY_PASS: keyPass,
};

let cmd, args;
if (apksignerJar && existsSync(apksignerJar)) {
  cmd = "java";
  args = [
    "-jar", apksignerJar,
    "sign",
    "--ks", jks,
    "--ks-key-alias", "pump",
    "--ks-pass", "env:PUMP_KS_PASS",
    "--key-pass", "env:PUMP_KEY_PASS",
    "--v1-signing-enabled", "false",
    "--v2-signing-enabled", "true",
    "--v3-signing-enabled", "true",
    "--out", signed,
    aligned,
  ];
} else if (apksignerBat) {
  cmd = apksignerBat;
  args = [
    "sign",
    "--ks", jks,
    "--ks-key-alias", "pump",
    "--ks-pass", "env:PUMP_KS_PASS",
    "--key-pass", "env:PUMP_KEY_PASS",
    "--v1-signing-enabled", "false",
    "--v2-signing-enabled", "true",
    "--v3-signing-enabled", "true",
    "--out", signed,
    aligned,
  ];
} else {
  // 回退：内置 apksigner.jar
  const jar = join(ROOT, "apkwork", "tools", "lib", "apksigner.jar");
  if (!existsSync(jar)) {
    console.error("未找到 apksigner。请安装 Android SDK build-tools。");
    process.exit(1);
  }
  cmd = "java";
  args = [
    "-jar", jar,
    "sign",
    "--ks", jks,
    "--ks-key-alias", "pump",
    "--ks-pass", "env:PUMP_KS_PASS",
    "--key-pass", "env:PUMP_KEY_PASS",
    "--v1-signing-enabled", "false",
    "--v2-signing-enabled", "true",
    "--v3-signing-enabled", "true",
    "--out", signed,
    aligned,
  ];
}

console.log(`签名中：${aligned} → ${signed}`);
execFileSync(cmd, args, { stdio: "inherit", env });
console.log("✅ 签名完成");
