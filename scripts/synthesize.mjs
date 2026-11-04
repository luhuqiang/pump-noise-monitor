/**
 * 合成带明确频谱特征的 PCM WAV
 * source = synthetic — 诚实标注非真实现场数据
 */
import { writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const SR = 48000;
const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "samples/synthetic");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

function writeWav(path, samples, sampleRate = SR) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
}

function lcg(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
}

const SEC = 30;
const N = SR * SEC;

// 纯正弦 + 极低背景噪声（确保谱线清晰可检测）
function synthPure(freqsAndAmps, noiseAmp = 0.005, seed = 20261101) {
  const s = new Float64Array(N);
  for (const [f, a] of freqsAndAmps) {
    for (let i = 0; i < N; i++) s[i] += a * Math.sin((2 * Math.PI * f * i) / SR);
  }
  const rnd = lcg(seed);
  for (let i = 0; i < N; i++) s[i] += rnd() * noiseAmp;
  return s;
}

// 正常泵 2900rpm（48.3Hz）+ 2× + 3× 谐波
function synthNormal() {
  const f0 = 2900 / 60;
  return synthPure([[f0, 0.5], [f0 * 2, 0.25], [f0 * 3, 0.12]], 0.005, 20261101);
}

// 汽蚀：46Hz 边带为主峰（GT06 验证汽蚀主频检测）
function synthCavitation() {
  const fsb = 46;       // 边带 — 主峰
  const f0 = 2900 / 60; // 48.33 — 被压制
  return synthPure([[fsb, 0.50], [f0, 0.10], [f0 * 2, 0.05]], 0.005, 20261102);
}

// 轴承磨损：基频 + 高频冲击脉冲（周期性）
function synthBearingWear() {
  const f0 = 2900 / 60;
  const s = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    s[i] += 0.30 * Math.sin((2 * Math.PI * f0 * i) / SR);
    // 6× rpm 周期性窄带冲击
    const t = i / SR;
    const phase = (t * f0 * 6) % 1;
    if (phase < 0.01) {
      const decay = Math.exp(-phase / 0.002);
      s[i] += 0.6 * decay * Math.sin((2 * Math.PI * 2500 * i) / SR);
    }
  }
  const rnd = lcg(20261103);
  for (let i = 0; i < N; i++) s[i] += rnd() * 0.005;
  return s;
}

// 低 SNR：真 8dB — 0.5 正弦 + 0.5 均匀噪声（理论 SNR ≈ 8dB）
function synthLowSNR() {
  const f0 = 2900 / 60;
  const s = new Float64Array(N);
  for (let i = 0; i < N; i++) s[i] += 0.5 * Math.sin((2 * Math.PI * f0 * i) / SR);
  const rnd = lcg(20261104);
  // 8dB SNR → noise power = signal power / 6.31 ≈ 0.125 / 6.31 ≈ 0.0198
  // uniform amp a: var = a²/12 = 0.0198 → a = 0.488 ≈ 0.5
  for (let i = 0; i < N; i++) s[i] += rnd() * 0.5;
  return s;
}

// 复测基线 A
function synthBaselineA() { return synthNormal(); }

// 复测可比：纯 amplitude 变化（同一噪声底），bandDb 应几乎一致
function synthRetestComp() {
  const base = synthNormal();
  // 1% amplitude 微扰 — 模拟手持位置/距离轻微变化
  return base.map((v) => v * 0.99);
}

// 复测不可比：换 rpm + 高噪声
function synthRetestIncomp() {
  const f0 = 3600 / 60; // 60Hz — 完全不同的泵速
  const s = synthPure([[f0, 0.6], [f0 * 3, 0.3]], 0.15, 20261106);
  return s;
}

// 1500 rpm 夹具（GT08 规格：1500rpm ≥17 转）——30s×25Hz = 750 转，远超 17 转
function synthRpm1500() {
  const f0 = 1500 / 60; // 25Hz
  return synthPure([[f0, 0.40], [f0 * 2, 0.18], [f0 * 3, 0.10], [f0 * 4, 0.06]], 0.005, 20261107);
}

const scenarios = [
  { id: "normal",          fn: synthNormal,           label: "正常泵 2900rpm",         source: "synthetic: 48.3+96.7+145Hz 谐波" },
  { id: "cavitation",      fn: synthCavitation,       label: "汽蚀 46Hz 边带",         source: "synthetic: 46Hz 主峰 + 48.3Hz 弱基频" },
  { id: "bearing_wear",    fn: synthBearingWear,      label: "轴承磨损冲击",           source: "synthetic: 2900rpm 基频 + 6×rpm 周期性冲击" },
  { id: "low_snr",         fn: synthLowSNR,           label: "低 SNR 8dB",             source: "synthetic: 48.3Hz + 0.5 均匀噪声（理论 8dB）" },
  { id: "rpm1500",         fn: synthRpm1500,          label: "1500rpm 梳状谱",         source: "synthetic: 25Hz 基频 + 2/3/4 次谐波（750 转）" },
  { id: "baseline_A",      fn: synthBaselineA,       label: "复测基线 A",             source: "synthetic = normal" },
  { id: "retest_comp",     fn: synthRetestComp,      label: "复测可比",               source: "synthetic: normal × 0.99" },
  { id: "retest_incomp",   fn: synthRetestIncomp,    label: "复测不可比",             source: "synthetic: 60Hz 完全不同 rpm + 噪声" },
];

for (const sc of scenarios) {
  const path = resolve(OUT, `${sc.id}.wav`);
  const sig = sc.fn();
  writeWav(path, sig);
  const sz = statSync(path).size;
  process.stdout.write(`  ${sc.id}.wav → ${(sig.length / SR).toFixed(1)}s, ${sz} B\n`);
}

const manifest = {
  generated_at: new Date().toISOString(),
  sample_rate: SR, bit_depth: 16, channels: 1, duration_sec: SEC,
  source: "synthetic",
  note: "用户授权：现阶段用合成数据模拟，APP 上线后现场采集",
  scenarios: scenarios.map((s) => ({ id: s.id, label: s.label, source: s.source })),
};
writeFileSync(resolve(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
process.stdout.write(`\n✅ 生成 ${scenarios.length} 个合成样本 → ${OUT}\n`);
