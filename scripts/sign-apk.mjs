#!/usr/bin/env node
/**
 * APK 签名辅助脚本：从密钥交底文档中读取口令，
 * 通过环境变量传给 apksigner（口令不出现在命令行 / 日志中）。
 *
 * 用法：node scripts/sign-apk.mjs <aligned.apk> <signed.apk>
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, readdirSync } from "node:fs";
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

// 1) 从密钥交底文档提取口令（keystore 口令 / key 口令）
const handoverDir = join(ROOT, "stethoscope-keys", "听诊仪-密钥包-20261103");
const handoverFile = join(handoverDir, "secrets", "04_密钥与敏感文件交底（限内部）.md");
if (!existsSync(handoverFile)) {
  console.error(`找不到密钥交底文档：${handoverFile}`);
  process.exit(1);
}
const doc = readFileSync(handoverFile, "utf8");

// 匹配形如：--ks-pass pass:xxx / --key-pass pass:xxx / -storepass xxx / -keypass xxx
const ksMatch =
  doc.match(/--ks-pass\s+pass:(\S+)/i) ??
  doc.match(/-storepass\s+(\S+)/i);
const keyMatch =
  doc.match(/--key-pass\s+pass:(\S+)/i) ??
  doc.match(/-keypass\s+(\S+)/i);

const ksPass = ksMatch?.[1];
const keyPass = keyMatch?.[1] ?? ksPass;

if (!ksPass) {
  console.error("无法从交底文档中解析 keystore 口令。");
  process.exit(1);
}

// 2) 查找 Android SDK build-tools
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

const jks = join(handoverDir, "secrets", "android", "pump-release.jks");
if (!existsSync(jks)) {
  console.error(`找不到签名密钥：${jks}`);
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
