/**
 * 最终 APK 组装流程：
 * 1. aapt2 compile res + link → 正确版本号(5/1.4)的 Manifest + resources.arsc
 * 2. 原始 APK 的 classes.dex（能跑的 smali）
 * 3. 新 dist 作为 assets/www/
 * 关键文件 STORED，其余 DEFLATE
 */
import { createWriteStream, existsSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const BUILD = join(ROOT, "apkwork", "build");
const MONITOR = join(ROOT, "apkwork", "monitor");
const LEGACY = join(ROOT, "legacy", "pump-noise-handover-20261102", "android", "pumpnoise-build4-v1.3.apk");
const DIST = join(ROOT, "dist");
const SDK_JAR = "D:\\Users\\Documents\\Trae-CN\\default\\android-sdk\\platforms\\android-35\\android.jar";
const AAPT2 = "D:\\Users\\Documents\\Trae-CN\\default\\android-sdk\\build-tools\\35.0.0\\aapt2.exe";
const OUT_UNALIGNED = join(BUILD, "final-unaligned.apk");

const STORED_PREFIXES = ["classes.dex", "resources.arsc", "AndroidManifest.xml", "res/"];
function mustStore(name) {
  for (const p of STORED_PREFIXES) if (name === p || name.startsWith(p)) return true;
  return false;
}
function readStreamToBuffer(rs) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    rs.on("data", (c) => chunks.push(c));
    rs.on("end", () => resolve(Buffer.concat(chunks)));
    rs.on("error", reject);
  });
}

function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT });
  if (r.status !== 0) { console.error(`❌ 退出码 ${r.status}`); process.exit(r.status); }
}

import("yauzl").then(async ({ default: yauzl }) => {
  const yazl = (await import("yazl")).default;

  // === Step 1: aapt2 compile + link ===
  console.log("\n=== 1/3 aapt2 compile + link ===");
  const files = readdirSync(join(MONITOR, "res"), { recursive: true }).filter((f) => {
    const stat = statSync(join(MONITOR, "res", f));
    return stat.isFile();
  }).map((f) => join(MONITOR, "res", f));

  run(AAPT2, ["compile", "-o", join(BUILD, "res-flat.zip"), ...files]);
  run(AAPT2, ["link",
    "--manifest", join(MONITOR, "AndroidManifest.xml"),
    "--min-sdk-version", "24",
    "--target-sdk-version", "35",
    "--version-code", "5",
    "--version-name", "1.4",
    "-o", join(BUILD, "base.apk"),
    "-I", SDK_JAR,
    join(BUILD, "res-flat.zip"),
  ]);

  // === Step 2: 从原始 APK 拿 classes.dex ===
  console.log("\n=== 2/3 提取原始 classes.dex ===");
  const legacyClasses = await new Promise((resolve, reject) => {
    yauzl.open(LEGACY, { lazyEntries: true }, (err, z) => {
      if (err) return reject(err);
      z.readEntry();
      z.on("entry", (entry) => {
        if (entry.fileName === "classes.dex") {
          z.openReadStream(entry, async (err, rs) => {
            if (err) return reject(err);
            resolve(await readStreamToBuffer(rs));
            z.close();
          });
        } else z.readEntry();
      });
      z.on("error", reject);
    });
  });
  console.log(`  classes.dex: ${legacyClasses.length} bytes`);

  // === Step 3: 组装 ===
  console.log("\n=== 3/3 组装 APK ===");
  await new Promise((resolve, reject) => {
    yauzl.open(join(BUILD, "base.apk"), { lazyEntries: true }, async (err, zipfile) => {
      if (err) return reject(err);

      const output = new yazl.ZipFile();
      const outStream = createWriteStream(OUT_UNALIGNED);
      output.outputStream.pipe(outStream).on("close", resolve);
      output.outputStream.on("error", reject);
      outStream.on("error", reject);

      // classes.dex (原始能跑的) — STORED
      output.addBuffer(legacyClasses, "classes.dex", { compressionLevel: 0 });
      console.log("  + STORED classes.dex");

      // dist → assets/www/*
      function addDist(dir, prefix) {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          const stat = statSync(full);
          const ep = prefix ? `${prefix}/${name}` : name;
          if (stat.isDirectory()) addDist(full, ep);
          else { output.addFile(full, `assets/www/${ep}`); console.log(`  + assets/www/${ep}`); }
        }
      }
      addDist(DIST, "");

      // 从 base.apk 复制其余条目 —— STORED (resources.arsc + Manifest) / DEFLATE (res/*.png)
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        if (entry.fileName === "classes.dex" || entry.fileName.startsWith("assets/www/")) {
          zipfile.readEntry();
        } else {
          zipfile.openReadStream(entry, async (err, rs) => {
            if (err) return reject(err);
            const buf = await readStreamToBuffer(rs);
            const cl = mustStore(entry.fileName) ? 0 : 6;
            output.addBuffer(buf, entry.fileName, { compressionLevel: cl });
            const tag = cl === 0 ? "STORED " : "DEFLATE";
            console.log(`  = ${tag} ${entry.fileName}`);
            zipfile.readEntry();
          });
        }
      });
      zipfile.on("end", () => { output.end(); });
      zipfile.on("error", reject);
    });
  });

  console.log(`\n✅ ${OUT_UNALIGNED}`);
});
