/**
 * MIMII 真实泵录音准备脚本
 *
 * 数据源：Kaggle 公开数据集（MIMII 泵，8 声道 16 kHz 10 s，381 正常 / 138 异常）
 *   https://www.kaggle.com/api/v1/datasets/download/giacomoveneri1/mimii-dataset-sound-data-for-malfunctioning-pump
 * 许可：MIMII 原始数据为 CC BY-SA 4.0（Hitachi 提供）
 *
 * 作用：从 Kaggle zip 中抽取若干条录音，取 channel 0 转单声道 WAV，
 *       落盘到 samples/mimii/，并写 manifest（含来源与 sha256，便于复核）。
 *
 * 用法：
 *   curl -sL -o samples/_dl/kaggle_pump.zip "<上面的 URL>"
 *   node --experimental-strip-types scripts/prepare-mimii.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ZIP = resolve(ROOT, "samples/_dl/kaggle_pump.zip");
const OUT = resolve(ROOT, "samples/mimii");

if (!existsSync(ZIP)) {
  console.error(`缺少 ${ZIP}\n请先执行：\n  curl -sL -o samples/_dl/kaggle_pump.zip "https://www.kaggle.com/api/v1/datasets/download/giacomoveneri1/mimii-dataset-sound-data-for-malfunctioning-pump"`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

// ---------- 最小 ZIP 读取（中央目录 + inflateRaw） ----------
function listZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("找不到 ZIP 中央目录结束标记");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("中央目录损坏");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.push({ name, method, compSize, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf, entry) {
  const p = entry.localOff;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error(`本地头损坏：${entry.name}`);
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compSize);
  return entry.method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
}

// ---------- WAV：取 channel 0 转单声道 16 bit ----------
function wavToMono(buf) {
  let i = 12, fmt = null, dataOff = 0, dataLen = 0;
  while (i + 8 <= buf.length) {
    const cid = buf.toString("ascii", i, i + 4);
    const sz = buf.readUInt32LE(i + 4);
    if (cid === "fmt ") {
      fmt = {
        channels: buf.readUInt16LE(i + 10),
        sampleRate: buf.readUInt32LE(i + 12),
        bits: buf.readUInt16LE(i + 22),
      };
    } else if (cid === "data") {
      dataOff = i + 8;
      dataLen = Math.min(sz, buf.length - dataOff);
      break;
    }
    i += 8 + sz;
  }
  if (!fmt || fmt.bits !== 16) throw new Error("仅支持 16 bit WAV");
  const frames = Math.floor(dataLen / (2 * fmt.channels));
  const pcm = Buffer.alloc(frames * 2);
  for (let k = 0; k < frames; k++) {
    pcm.writeInt16LE(buf.readInt16LE(dataOff + k * 2 * fmt.channels), k * 2);
  }
  const hdr = Buffer.alloc(44);
  hdr.write("RIFF", 0, "ascii");
  hdr.writeUInt32LE(36 + pcm.length, 4);
  hdr.write("WAVE", 8, "ascii");
  hdr.write("fmt ", 12, "ascii");
  hdr.writeUInt32LE(16, 16);
  hdr.writeUInt16LE(1, 20);
  hdr.writeUInt16LE(1, 22);
  hdr.writeUInt32LE(fmt.sampleRate, 24);
  hdr.writeUInt32LE(fmt.sampleRate * 2, 28);
  hdr.writeUInt16LE(2, 32);
  hdr.writeUInt16LE(16, 34);
  hdr.write("data", 36, "ascii");
  hdr.writeUInt32LE(pcm.length, 40);
  return { wav: Buffer.concat([hdr, pcm]), meta: { ...fmt, channelsOut: 1, frames } };
}

// ---------- 抽取清单 ----------
// MIMII 把连续录音切成 10 s 段：相邻编号 = 同泵、同会话、同工况（可做"同点复测"）
// normal 取 30 段（30×29≈870 帧，够 GT28 的 200 帧场景）；abnormal 取 10 段作异常对照
const PICKS = [];
for (let i = 0; i < 30; i++) {
  const n = String(i).padStart(8, "0");
  PICKS.push([`normal/${n}.wav`, `pump_normal_${n}.wav`, `正常·第${i + 1}段`]);
}
for (let i = 0; i < 10; i++) {
  const n = String(i).padStart(8, "0");
  PICKS.push([`abnormal/${n}.wav`, `pump_abnormal_${n}.wav`, `异常工况·第${i + 1}段`]);
}

const zipBuf = readFileSync(ZIP);
const entries = listZip(zipBuf);
const byName = new Map(entries.map((e) => [e.name, e]));
const manifest = [];

for (const [src, dst, note] of PICKS) {
  const entry = byName.get(src);
  if (!entry) { console.warn(`跳过（zip 内无此文件）：${src}`); continue; }
  const raw = readEntry(zipBuf, entry);
  const { wav, meta } = wavToMono(raw);
  const outPath = resolve(OUT, dst);
  writeFileSync(outPath, wav);
  manifest.push({
    file: dst,
    source: `MIMII/kaggle:pump/${src}`,
    note,
    sourceSampleRate: meta.sampleRate,
    sourceChannels: meta.channels,
    outputSampleRate: meta.sampleRate,
    frames: meta.frames,
    durationSec: meta.frames / meta.sampleRate,
    sha256: createHash("sha256").update(wav).digest("hex"),
    bytes: wav.length,
  });
  console.log(`✅ ${dst.padEnd(26)} ${meta.frames} 帧 @ ${meta.sampleRate}Hz  (${(meta.frames / meta.sampleRate).toFixed(1)}s)  ← ${src}`);
}

writeFileSync(resolve(OUT, "manifest.json"), JSON.stringify({
  dataset: "MIMII pump",
  license: "CC BY-SA 4.0",
  upstream: "https://www.kaggle.com/datasets/giacomoveneri1/mimii-dataset-sound-data-for-malfunctioning-pump",
  original: "MIMII Dataset (Purohit et al., 2019), Hitachi Ltd.",
  extractedAt: new Date().toISOString(),
  note: "原始录音 8 声道，本脚本只取 channel 0 转单声道；不做任何滤波/增益/重采样改写",
  files: manifest,
}, null, 2), "utf8");
console.log(`\n✅ manifest.json → ${OUT}`);
