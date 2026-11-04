import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { powerSpectrum } from "./fft.ts";
import { featuresFromPower } from "./features.ts";
import { Denoiser } from "./denoise.ts";
import { ClipTracker, AgcDetector, DropTracker, channelStatus, sampleRateValid, CLIP_LEVEL, CLIP_RUN_SAMPLES } from "./validity.ts";
import { ordersReliable, orderPresence, PhaseTracker } from "./phase.ts";
import { anomalyOf, MIN_BASELINE_FRAMES, MIN_BASELINE_BUCKETS } from "./fingerprint.ts";
import { resampleTo48k, floorPow2, RESAMPLE_TARGET } from "./resample.ts";
import { EventRail, EVENT_FRAME_SAMPLES, EVENT_HISTORY_MIN_FRAMES } from "./event-rail.ts";
import { ShaftAccumulator, trackShaftFreq } from "./shaft-tracker.ts";

const SR = 48000;

function frameOf(n: number, fill: (i: number) => number) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fill(i);
  return out;
}

function peaksOf(power: Float64Array) {
  let maxI = 1;
  for (let i = 2; i < power.length - 1; i++) if (power[i]! > power[maxI]!) maxI = i;
  return maxI;
}

function lcg(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("golden：频响、SNR、削顶与阶次", () => {
  it("1 kHz 正弦的 FFT 峰值落在 1 kHz ±1 bin", () => {
    const n = 4096;
    const frame = frameOf(n, (i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / SR));
    const spec = powerSpectrum(frame, SR);
    const peak = peaksOf(spec.power);
    const hz = peak * spec.df;
    assert.ok(Math.abs(hz - 1000) <= spec.df, `峰值 ${hz.toFixed(1)} Hz 偏离 1 kHz`);
    // 谱峰远高于远端频带，说明标定没有把能量散掉。
    const far = spec.power[Math.round((8000 * n) / SR)] ?? 0;
    assert.ok(spec.power[peak]! > far * 1000);
  });

  it("泵声谱线叠加白噪后 SNR 落在合理区间且谱线保留", () => {
    const n = 4096;
    const rand = lcg(20261102);
    const noiseAmp = 0.01732; // 均匀分布，标准差约 0.01
    const noise = () => (rand() - 0.5) * 2 * noiseAmp;
    const denoiser = new Denoiser();

    // 先喂 10 帧纯噪声，让最小值统计的噪声底收敛。
    for (let k = 0; k < 10; k++) {
      denoiser.update(powerSpectrum(frameOf(n, noise), SR).power, SR, n);
    }

    const toneHz = 1200;
    const toneAmp = 0.5;
    const toneFrame = frameOf(n, (i) => toneAmp * Math.sin((2 * Math.PI * toneHz * i) / SR) + noise());
    const raw = powerSpectrum(toneFrame, SR);
    const out = denoiser.update(raw.power, SR, n);

    // 理论 SNR = 10lg((0.5²/2) / 0.01²) ≈ 31 dB。
    assert.ok(out.snrDb > 22 && out.snrDb < 40, `snrDb=${out.snrDb.toFixed(1)}`);
    const peak = peaksOf(raw.power);
    assert.ok(out.cleanPower[peak]! > raw.power[peak]! * 0.5, "谱线被降噪吞掉");
  });

  it("削顶：连续 2 点不触发、第 3 点触发；采样率与麦克风失效可判", () => {
    const n = 4096;
    const tracker = new ClipTracker();

    const two = frameOf(n, () => 0);
    two[0] = CLIP_LEVEL + 0.01;
    two[1] = -(CLIP_LEVEL + 0.01);
    assert.equal(tracker.update(two), false, "连续 2 点不应判削顶");
    assert.equal(tracker.clipped, false);

    const three = frameOf(n, () => 0);
    three[0] = CLIP_LEVEL + 0.01;
    three[1] = CLIP_LEVEL + 0.01;
    three[2] = CLIP_LEVEL + 0.01;
    assert.equal(tracker.update(three), true, "连续 3 点应判削顶");
    assert.equal(tracker.clipped, true);

    assert.equal(sampleRateValid(48000), true);
    assert.equal(sampleRateValid(44100), false);

    const lost = channelStatus({
      clip: false,
      clipRate: 0,
      agc: false,
      sampleRate: 44100,
      mic: "ended",
      droppedFrames: 0,
      levelDbfs: -30,
    });
    assert.deepEqual(lost.reasons, ["sample_rate", "mic_lost"]);
    assert.equal(lost.valid, false);

    const healthy = channelStatus({
      clip: false,
      clipRate: 0,
      agc: false,
      sampleRate: 48000,
      mic: "ok",
      droppedFrames: 0,
      levelDbfs: -30,
    });
    assert.equal(healthy.valid, true);
  });

  it("已知转速的合成泵声可定位 1×，低转速禁用阶次结论", () => {
    const n = 65536;
    const rpm = 1800;
    const f0 = rpm / 60; // 30 Hz
    const blades = 6;
    const frame = frameOf(n, (i) => {
      const t = i / SR;
      return (
        0.6 * Math.sin(2 * Math.PI * f0 * t) +
        0.25 * Math.sin(2 * Math.PI * f0 * 2 * t + 0.5) +
        0.2 * Math.sin(2 * Math.PI * f0 * blades * t + 1.1)
      );
    });
    const spec = powerSpectrum(frame, SR);
    const features = featuresFromPower(spec.power, null, SR, n, rpm, blades);
    const windowSec = n / SR;

    assert.ok(Math.abs(features.dominantHz - f0) <= 2 * spec.df, `主导 ${features.dominantHz.toFixed(1)} Hz，期望 ${f0} Hz`);
    assert.ok(features.orderSnr.oneX > 12, `1× SNR ${features.orderSnr.oneX.toFixed(1)} dB`);
    assert.equal(ordersReliable(rpm, windowSec), true);
    assert.ok(orderPresence(features, rpm, windowSec) > 0.5);

    // 低转速（< 900 r/min）与过短窗口都不得输出阶次结论。
    assert.equal(ordersReliable(300, windowSec), false);
    assert.equal(ordersReliable(rpm, 0.3), false);
    assert.equal(orderPresence(features, 300, windowSec), 0);
  });

  it("运行态状态机：启动 5 s 保持后才稳定，停机 3 s 后回 idle", () => {
    const phase = new PhaseTracker();
    assert.equal(phase.update(0, false, false), "idle");
    assert.equal(phase.update(1000, true, true), "starting");
    assert.equal(phase.update(3000, true, true), "starting", "启动 5 s 内不得进入 steady");
    assert.equal(phase.update(6001, true, true), "steady");
    assert.equal(phase.update(7000, false, true), "steady");
    assert.equal(phase.update(10001, false, true), "stopping");
    assert.equal(phase.update(13002, false, true), "idle");
  });
});

describe("golden 补充：边界与负向用例（评审第 4 节）", () => {
  it("负向 #4：单样点 0.94 不触发削顶（防止单点毛刺误报）", () => {
    const n = 4096;
    const tracker = new ClipTracker();
    // 先喂一块全 0 初始化
    const clear = frameOf(n, () => 0);
    tracker.update(clear);
    // 只改第一个点到 0.94（低于 CLIP_LEVEL 0.95）
    clear[0] = 0.94;
    tracker.update(clear);
    assert.equal(tracker.clipped, false, "单样点低于 0.95 不得触发削顶");
    // 连续 3 样点 0.94 仍不够，因为门限是 ≥0.95
    const three = frameOf(n, () => 0);
    three[0] = 0.94; three[1] = 0.94; three[2] = 0.94;
    tracker.update(three);
    assert.equal(tracker.clipped, false, "连续 3 样点 0.94 仍不得触发");
    assert.equal(CLIP_RUN_SAMPLES, 3, "门限钉死为 3 样点");
  });

  it("正向 #5：连续 4 样点 0.9499 仍不触发，但 ≥0.95 连续 3 点必触发（边界邻域）", () => {
    const n = 4096;
    const tracker = new ClipTracker();
    // 略低于门限，Float32 精度下也低于
    const below = frameOf(n, () => 0);
    below[0] = CLIP_LEVEL - 0.001;
    below[1] = CLIP_LEVEL - 0.001;
    below[2] = CLIP_LEVEL - 0.001;
    below[3] = CLIP_LEVEL - 0.001;
    tracker.update(below);
    assert.equal(tracker.clipped, false, "0.949 连续 4 点仍不触发");

    tracker.reset();
    // 略高于门限，确保 Float32 下也满足 >= CLIP_LEVEL
    const hit = frameOf(n, () => 0);
    const above = CLIP_LEVEL + 0.001;
    hit[0] = above; hit[1] = above; hit[2] = above;
    tracker.update(hit);
    assert.equal(tracker.clipped, true, "略高于 0.95 连续 3 点必触发");
  });

  it("正向 #6：采样率真值 44.1k 判 invalid，不输出故障方向", () => {
    assert.equal(sampleRateValid(44100), false);
    const s = channelStatus({
      clip: false, clipRate: 0, agc: false,
      sampleRate: 44100, mic: "ok", droppedFrames: 0, levelDbfs: -30,
    });
    assert.equal(s.valid, false);
    assert.ok(s.reasons.includes("sample_rate"));
  });

  it("正向 #7：丢帧 3 块 → 标断流，窗口作废", () => {
    const drop = new DropTracker();
    drop.block(0);
    // 只 block 一次，跳过后续 3 块的 block 调用，check 自动按 gap 算累积掉帧
    drop.check(4201);
    assert.ok(drop.count >= 3, `掉帧计数应 ≥3，实际 ${drop.count}`);
    assert.ok(drop.count > 2, "应触发失效");
    const s = channelStatus({
      clip: false, clipRate: 0, agc: false,
      sampleRate: 48000, mic: "ok", droppedFrames: 3, levelDbfs: -30,
    });
    assert.ok(s.reasons.includes("worklet_drop"));
  });

  it("负向 #8：启动后第 4 秒不得进入 steady，不得输出结论", () => {
    const phase = new PhaseTracker();
    // 起始 idle；since=1000 是进入 starting 的时间戳
    phase.update(0, false, false);
    phase.update(1000, true, true);
    // 4000 ms 相对 since 差 3000 < 5000 → 仍在 starting
    assert.equal(phase.update(4000, true, true), "starting", "启动第 4 秒应仍在 starting");
    assert.equal(phase.update(5999, true, true), "starting", "差 4999 ms 仍未满 5000");
    assert.equal(phase.update(6001, true, true), "steady", "差 5001 ms 进入 steady");
  });

  it("负向 #9：基线仅 20 帧 → anomalyOf.score 为 null，engine 输出 invalid/low_confidence", () => {
    const baseline20 = {
      buckets: { "常用负载": { mean: new Array(20).fill(-40), variance: new Array(20).fill(0.01), n: 20 } },
      frames: 20, version: 1, createdAt: new Date().toISOString(),
      lastRunAt: Date.now(), runMinutes: 0, lastAnomalyAt: 0, consecutiveAbnormalDays: 0,
      placementRatio: null, placementLogStd: 0.12, placementDeviceId: null,
      placementDriftStreak: 0, crestGate: null, shaftHz: null, shaftHzSigma: null,
      shaftCapturedAt: null,
    } as import("./fingerprint.ts").Baseline;
    assert.ok(MIN_BASELINE_FRAMES >= 30, "门槛 ≥30 帧");
    const r = anomalyOf(new Array(20).fill(-40), baseline20, "常用负载");
    assert.equal(r.score, null, "帧不足时 score 必须为 null");
    assert.equal(r.ready, false);
  });

  it("正向 #10：仅 1 个工况档 → invalid（不满足 ≥3 档门槛）", () => {
    const baseline1Bucket = {
      buckets: { "常用负载": { mean: new Array(10).fill(-40), variance: new Array(10).fill(0.01), n: 40 } },
      frames: 60, version: 1, createdAt: new Date().toISOString(),
      lastRunAt: Date.now(), runMinutes: 0, lastAnomalyAt: 0, consecutiveAbnormalDays: 0,
      placementRatio: null, placementLogStd: 0.12, placementDeviceId: null,
      placementDriftStreak: 0, crestGate: null, shaftHz: null, shaftHzSigma: null,
      shaftCapturedAt: null,
    } as import("./fingerprint.ts").Baseline;
    assert.ok(MIN_BASELINE_BUCKETS >= 3);
    const r = anomalyOf(new Array(10).fill(-40), baseline1Bucket, "常用负载");
    assert.equal(r.buckets, 1);
    assert.equal(r.ready, false, "仅 1 档不得判 ready");
  });

  it("负向 #11：全频带同步 +6 dB 判 AGC（增益未变更时必触发）", () => {
    const det = new AgcDetector();
    const base = new Array(24).fill(-40);
    det.update(base, 0);
    const up = base.map((v) => v + 6);
    det.update(up, 100);
    assert.equal(det.agc, true, "全带同步平移应触发 AGC");
  });

  it("实现细节：增益变更后 5 秒内跳过 AGC 判定", () => {
    const det = new AgcDetector();
    const base = new Array(24).fill(-40);
    det.update(base, 0);
    det.update(base.map((v) => v + 6), 100);
    assert.equal(det.agc, true, "先建立 AGC 态");
    det.noteGainChanged(200);
    det.update(base.map((v) => v + 6), 300);
    assert.equal(det.agc, false, "增益变更后近 5 秒内应跳过判定");
    // 5 秒后恢复正常判定
    det.update(base, 5200);
    det.update(base.map((v) => v + 6), 5300);
    assert.equal(det.agc, true, "5 秒后恢复");
  });

  it("负向 #12：仅单频带 +6 dB 不判 AGC（边界对 #11）", () => {
    const det = new AgcDetector();
    const base = new Array(24).fill(-40);
    det.update(base, 0);
    // 只把索引 6 那档抬 +6 dB，其余不变
    const single = base.slice();
    single[6] = single[6]! + 6;
    det.update(single, 100);
    assert.equal(det.agc, false, "单频带偏移 spread 远大于 0.7，不得判 AGC");
  });
});

describe("golden 17：4096 事件轨冻结门限、谐波拟合不确定度、亚谐波双族", () => {
  it("44.1 kHz 正弦重采样到 48 kHz 后频率与幅度不劣化", () => {
    const sr44 = 44100;
    const n = 4096;
    const input = frameOf(n, (i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / sr44));
    const out = resampleTo48k(input, sr44);
    assert.equal(RESAMPLE_TARGET, 48000);
    // 重采样后长度按比例变长，FFT 仍要求 2 的幂 → 截断到 floorPow2
    const fftLen = floorPow2(out.length);
    assert.equal(fftLen, 4096, "重采样后应能截断到 4096 点");
    const frame = out.subarray(0, fftLen);
    const spec = powerSpectrum(frame, 48000);
    const peak = peaksOf(spec.power);
    const hz = peak * spec.df;
    assert.ok(Math.abs(hz - 1000) <= spec.df, `重采样后峰值 ${hz.toFixed(1)} Hz 偏离 1 kHz`);
    // 幅度：RMS 与原始 0.5/√2 相差 <2%，保证频响没有整体衰减
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += (frame[i] ?? 0) ** 2;
    const rms = Math.sqrt(sum / frame.length);
    const expect = 0.5 / Math.SQRT2;
    assert.ok(Math.abs(rms / expect - 1) < 0.02, `重采样 RMS ${rms.toFixed(3)} 偏离 ${expect.toFixed(3)} 超过 2%`);
  });

  it("事件轨：4096 片长；历史不足只记录，冻结后才报警；冻结门限不随运行更新", () => {
    const rail = new EventRail();
    const sine = frameOf(EVENT_FRAME_SAMPLES, (i) => 0.3 * Math.sin((2 * Math.PI * 2000 * i) / SR));
    const impulse = () => {
      const f = new Float32Array(EVENT_FRAME_SAMPLES);
      f[2000] = 0.9;
      return f;
    };
    // 只攒 50 帧 → 历史不足，且没有冻结门限 → 冲击帧不得计数
    for (let k = 0; k < 50; k++) rail.push(sine, SR, k * 85);
    rail.push(impulse(), SR, 50 * 85);
    assert.equal(rail.short.eventCount, 0, "历史不足时只能记录，不得报警");
    assert.equal(rail.short.historyReady, false);
    assert.equal(rail.short.gateFrozen, false, "未冻结时不得有门限");

    // 攒够 → 历史就绪，但运行期仍不自动冻结
    for (let k = 50; k < EVENT_HISTORY_MIN_FRAMES + 50; k++) rail.push(sine, SR, k * 85);
    assert.equal(rail.short.historyReady, true, "≥200 帧后历史应就绪");
    assert.equal(rail.short.gateFrozen, false, "历史足够后也不自动更新门限");
    assert.equal(rail.short.eventCount, 0, "门限未冻结时只记录不报警");

    // 验收期冻结：median/MAD，不是 P95
    const gate = rail.commissionGate(3);
    assert.ok(gate, "历史就绪后应能冻结门限");
    assert.ok(gate.scale > 0, "MAD 尺度必须为正");
    assert.ok(gate.median > 1 && gate.median < 3, `中位数 ${gate.median} 应接近正弦 crest≈1.41`);
    assert.ok(gate.median + gate.crestGateZ * gate.scale < 6, "冻结门限不得写死 6");
    rail.setGate(gate);
    assert.equal(rail.short.gateFrozen, true);
    assert.equal(rail.short.gateVersion, 3);

    // 运行期再喂大量帧，门限不得跟着漂移
    for (let k = 0; k < 300; k++) rail.push(sine, SR, 600 * 85 + k * 85);
    assert.equal(rail.short.crestMedian, gate.median, "运行期门限只读，不随分布更新");

    // 削顶帧：判据屏蔽，即使脉冲很大也不计数
    const before = rail.short.eventCount;
    rail.push(impulse(), SR, 400 * 85, true);
    assert.equal(rail.short.eventCount, before, "削顶态不得报冲击");
    assert.equal(rail.short.clipped, true);
  });

  it("谐波梳：1/2× 与 1/3× 同时存在 → 报转速不确定、不给数值、禁用阶次", () => {
    const sr = 48000;
    const fftSize = 8192;
    const df = sr / fftSize;
    const f0 = 60;
    const powerDb = new Array(fftSize / 2).fill(-80);
    const bin = (hz: number) => Math.round(hz / df);
    // 主梳：60/120/180/240/300 Hz 强峰
    for (let h = 1; h <= 5; h++) powerDb[bin(f0 * h)] = -40;
    // 1/2× 亚梳：30/90/150 Hz（60、120 与主梳共用，不计）
    for (const hz of [f0 / 2, f0 * 1.5, f0 * 2.5]) powerDb[bin(hz)] = -56;
    // 1/3× 亚梳：20/40/80/100/140/160 Hz（120 与主梳共用，不计）
    for (const hz of [20, 40, 80, 100, 140, 160]) powerDb[bin(hz)] = -56;

    const track = trackShaftFreq(powerDb, sr, fftSize, f0 * 60);
    assert.ok(track.subharmonicRatio >= 0.55, `亚谐波比值 ${track.subharmonicRatio.toFixed(2)} 应 ≥0.55`);
    assert.equal(track.subharmonic, true, "两族同时成立才判亚谐波");
    assert.equal(track.ambiguous, true, "亚谐波成立应报转速不确定");
    assert.equal(track.trackedF0, 0, "歧义时不给转速数值");
    assert.equal(track.reliable, false, "歧义时阶次结论必须禁用");
    assert.ok(Number.isNaN(track.rpmDeltaPct));

    // 只有 1/2× 单族 → 不得判亚谐波（评审 17 §4 双族条件）
    const onlyHalf = new Array(fftSize / 2).fill(-80);
    for (let h = 1; h <= 5; h++) onlyHalf[bin(f0 * h)] = -40;
    for (const hz of [f0 / 2, f0 * 1.5, f0 * 2.5]) onlyHalf[bin(hz)] = -56;
    const half = trackShaftFreq(onlyHalf, sr, fftSize, f0 * 60);
    assert.equal(half.subharmonic, false, "只有 1/2× 不得判亚谐波");

    // 对照：只有主梳时不应误报歧义
    const clean = new Array(fftSize / 2).fill(-80);
    for (let h = 1; h <= 5; h++) clean[bin(f0 * h)] = -40;
    const ok = trackShaftFreq(clean, sr, fftSize, f0 * 60);
    assert.equal(ok.ambiguous, false);
    assert.equal(ok.reliable, true);
    assert.ok(Math.abs(ok.trackedF0 - f0) <= 1, `干净梳应锁在 ${f0} Hz 附近，实际 ${ok.trackedF0.toFixed(2)}`);
  });

  it("谐波联合拟合给出不确定度；偏差超出 3σ 才判 mismatch", () => {
    const sr = 48000;
    const fftSize = 8192;
    const df = sr / fftSize;
    const bin = (hz: number) => Math.round(hz / df);
    const spectrum = (f0: number) => {
      const powerDb = new Array(fftSize / 2).fill(-80);
      for (let h = 1; h <= 5; h++) powerDb[bin(f0 * h)] = -40;
      return powerDb;
    };

    // 额定 60 Hz，实测 61.2 Hz（+2%）：在 5% 内，不得判 mismatch
    const near = trackShaftFreq(spectrum(61.2), sr, fftSize, 60 * 60);
    assert.ok(Number.isFinite(near.trackedF0UncertaintyHz), "必须给出 ±Hz 误差棒");
    assert.ok(near.trackedF0UncertaintyHz > 0, "误差棒必须为正");
    assert.ok(Number.isFinite(near.rpmDeltaPctUncertainty), "必须给出 ±% 误差棒");
    assert.equal(near.mismatch, false, "2% 偏差不得判不符");
    assert.ok(Math.abs(near.trackedF0 - 61.2) < 0.5, `拟合应接近 61.2 Hz，实际 ${near.trackedF0.toFixed(2)}`);

    // 额定 60 Hz，实测 64.8 Hz（+8%，超出 3σ）→ mismatch
    const off = trackShaftFreq(spectrum(64.8), sr, fftSize, 60 * 60);
    assert.equal(off.mismatch, true, "8% 且超出 3σ 必须判不符");
    assert.equal(off.reliable, false, "不符时阶次结论必须禁用");
    assert.ok(off.rpmDeltaPct > 5);
  });

  it("多窗累计：1/σ² 合并后不确定度下降、偏差与 mismatch 重算", () => {
    const sr = 48000;
    const fftSize = 8192;
    const bin = (hz: number) => Math.round(hz / (sr / fftSize));
    const spectrum = (f0: number) => {
      const powerDb = new Array(fftSize / 2).fill(-80);
      for (let h = 1; h <= 5; h++) powerDb[bin(f0 * h)] = -40;
      return powerDb;
    };
    const accum = new ShaftAccumulator();
    const base = trackShaftFreq(spectrum(61.2), sr, fftSize, 60 * 60);
    const one = accum.push(base, 0);
    assert.equal(one.windowCount, 1);
    assert.equal(one.spanSec, 0);

    let last = one;
    for (let k = 1; k <= 3; k++) last = accum.push(trackShaftFreq(spectrum(61.2), sr, fftSize, 60 * 60), k * 1000);
    assert.equal(last.windowCount, 4, "4 s 内应累计 4 窗");
    assert.ok(last.spanSec >= 3, `跨度应 ≥3 s，实际 ${last.spanSec}`);
    assert.ok(last.trackedF0UncertaintyHz <= one.trackedF0UncertaintyHz, "累计后不确定度不得变大");
    assert.ok(Math.abs(last.trackedF0 - 61.2) < 0.5);

    // 超出 4 s 的旧窗被剔除
    const far = accum.push(trackShaftFreq(spectrum(61.2), sr, fftSize, 60 * 60), 9000);
    assert.ok(far.windowCount < 4, "4 s 之前的窗应被剔除");
    accum.reset();
    assert.equal(accum.push(base, 10000).windowCount, 1, "reset 后重新开始累计");
  });
});
