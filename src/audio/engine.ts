/**
 * 听诊仪 · 音频引擎（完整采集管线）
 *
 * 管线：麦克风 → 分帧 → 有效性校验 → 计权声级 → FFT → 1/3倍频程 →
 *       谱特征 → 相位识别 → 轴频跟踪 → 事件轨 → 诊断 → 优先级裁决 → Readout
 *
 * D4：原始音频默认不留存，只存特征与片段。
 */
import { powerSpectrum, powerToDb } from "./fft.ts";
import { synthesizeOctave, THIRD_OCTAVE } from "./bands.ts";
import { spectralFeatures } from "./features.ts";
import { designAWeighting, designCWeighting, cascadeDb } from "./weighting.ts";
import {
  ClipTracker,
  AgcDetector,
  DropTracker,
  sampleRateValid,
} from "./validity.ts";
import { PhaseTracker, ordersReliable, orderPresence, ORDER_PRESENT } from "./phase.ts";
import { ShaftAccumulator, trackShaftFreq, type ShaftTrack } from "./shaft-tracker.ts";
import { EventRail, type ShortEvent } from "./event-rail.ts";
import { diagnose, type DiagnoseInput, type Diagnosis } from "./diagnose.ts";
export type { Diagnosis } from "./diagnose.ts";
import { applyStatusPriority, type PriorityContext } from "./status-priority.ts";
import type { PumpTypeId } from "./scenarios.ts";
import { currentCondition } from "../lib/settings.ts";
export { currentCondition };
import {
  anomalyOf,
  baselineInfo,
  baselineKey as fpBaselineKey,
  conditionBucket,
  featureVector,
  learnBaseline as fpLearnBaseline,
  loadBaseline,
  recordMaintenance,
  resetBaseline as fpResetBaseline,
  saveCrestGate,
  updateBaselineAccess,
  type Baseline,
} from "./fingerprint.ts";

export type MicStatus = "ok" | "silence" | "clip" | "agc" | "lost" | "drop";

export type Readout = {
  /** 运行状态（capturing 中或已结束） */
  running: boolean;
  /** 仪表冻结状态 */
  frozen: boolean;
  state: "idle" | "capturing" | "ended";
  /** 实际采样率（Hz） */
  sampleRate: number;
  /** A 计权声级 dBFS */
  aDb: number;
  /** C 计权声级 dBFS */
  cDb: number;
  /** Z 计权（不计权）dBFS */
  zDb: number;
  /** Fast time-weighted level dBFS */
  fast: number;
  /** Slow time-weighted level dBFS */
  slow: number;
  /** LAeq1s 等效连续声压级 dBFS（近似值） */
  leq1: number;
  /** LAeq10s 等效连续声压级 dBFS（近似值） */
  leq10: number;
  /** LC peak C 计权峰值 dBFS */
  cpeak: number;
  /** Lmax 峰值 dBFS */
  lmax: number;
  /** 峰值因子（crest factor）dB */
  crest: number;
  /** 脉冲因子（kurtosis 近似） */
  kurtosis: number;
  /** 主频 Hz（从 1× 定位推断） */
  dominantHz: number;
  /** 计权模式 A/C/Z */
  meter: "A" | "C" | "Z" | "worklet" | "analyser" | "idle";
  /** 是否削顶（兼容旧版字段） */
  clipped: boolean;
  /** SNR dB（信号峰 - 噪声底） */
  snrDb: number;
  /** 1/3 倍频程 dB（25 带） */
  bands: number[];
  /** 时域波形（最近一帧） */
  waveform: Float32Array;
  /** 频谱 dB（线性频率轴，AnalyserNode 输出） */
  spectrum: Float32Array;
  /** 1/1 倍频程 8 带 dB（OctaveView） */
  octaveDb: Float32Array;
  /** 质量灯指标 */
  quality: {
    sampleRateOk: boolean;
    snr: number;
    clip: boolean;
    agc: boolean;
    status: "ok" | "warn" | "bad";
  };
  /** 阶次信息（1×/2×/BPF/半阶次 相对能量与 SNR） */
  orders: {
    reliable: boolean;
    oneX: number;
    twoX: number;
    bpf: number;
    half: number;
    oneXSnr: number;
  };
  /** 轴频跟踪（完整版 ShaftTrack，含 combScore 等） */
  shaft: ShaftTrack | null;
  /** 事件轨（完整版 ShortEvent，含 crestMedian/meanKurtosis 等） */
  event: ShortEvent | null;
  /** 8 带相对电平（dB re 总能量），用于趋势/基线对比 */
  bandDb: number[];
  /** 诊断结果 */
  diagnosis: Diagnosis | null;
  /** 采集时长秒 */
  elapsed: number;
  /** 麦克风状态 */
  micStatus: MicStatus;
  /** 运行相位 */
  phase: string;
  /** 旧版兼容字段：分析是否准备好 */
  analysisReady: boolean;
  /** 旧版兼容字段：分析窗口长度秒 */
  windowSec: number;
  /** 旧版兼容字段：噪声底 dBFS */
  noiseFloorDb: number;
  /** 旧版兼容字段：信噪比（fidelity 近似） */
  fidelity: number;
  /** 旧版兼容字段：音乐性指标（music） */
  music: number;
  /** 旧版兼容：基线是否就绪 */
  baselineReady: boolean;
  /** 旧版兼容：削顶率 0-1 */
  clipRate: number;
  /** 旧版兼容：AGC 状态（顶层，与 quality.agc 重复） */
  agc: boolean;
  /** 旧版兼容：丢帧数 */
  droppedFrames: number;
  /** 旧版兼容：麦克风来源字符串 */
  mic: string;
  /** 旧版兼容：阶次是否可靠 */
  ordersReliable: boolean;
  /** 旧版兼容：无效原因列表 */
  invalidReasons: string[];
  /** 旧版兼容：采样率是否正常 */
  sampleRateOk: boolean;
  /** 旧版兼容：采样率异常原因 */
  sampleRateNote: string | null;
  /** 旧版兼容：基线帧数 */
  baselineFrames: number;
  /** 旧版兼容：基线桶数 */
  baselineBuckets: number;
  /** 旧版兼容：背景谱版本 */
  bgVersion: number;
  /** 旧版兼容：基线老化/维修信息 */
  age: { needsResample?: boolean; daysSince?: number; daysSinceCreated?: number; runHours?: number; lastMaintenance?: string; maintenanceBlocked?: boolean; notes?: string } | null;
  /** 旧版兼容：异常分 0-100 */
  anomaly: number | null;
  /** 旧版兼容：摆位指纹检查 */
  placement: { state: string; delta: number; streak: number } | null;
  /** 旧版兼容：计权模式（顶层） */
  weighting: "A" | "C" | "Z";
  /** 旧版兼容：采集源 */
  source: "demo" | "mic" | "ref";
  /** 旧版兼容：错误信息 */
  error: string | null;
  /** 旧版兼容：高频比（来自 SpectralFeatures） */
  hfRatio: number;
  /** 旧版兼容：平坦度 */
  flatness: number;
  /** 旧版兼容：evidencePng 截图 */
  evidencePng: string | null;
  /** 旧版兼容：包络谱分析结果 */
  envelope: ReturnType<typeof import("./envelope").envelopeAnalysis> | null;
};

const EMPTY: Readout = {
  running: false,
  frozen: false,
  state: "idle",
  sampleRate: 48000,
  aDb: -Infinity,
  cDb: -Infinity,
  zDb: -Infinity,
  fast: -Infinity,
  slow: -Infinity,
  leq1: -Infinity,
  leq10: -Infinity,
  cpeak: -Infinity,
  lmax: -Infinity,
  crest: 3,
  kurtosis: 3,
  dominantHz: 0,
  meter: "A",
  clipped: false,
  snrDb: 0,
  bands: new Array(THIRD_OCTAVE.length).fill(-120),
  waveform: new Float32Array(0),
  spectrum: new Float32Array(0),
  octaveDb: new Float32Array(8).fill(-120),
  quality: { sampleRateOk: true, snr: 0, clip: false, agc: false, status: "warn" },
  orders: { reliable: false, oneX: 0, twoX: 0, bpf: 0, half: 0, oneXSnr: -10 },
  shaft: null,
  event: null,
  bandDb: new Array(8).fill(-120),
  diagnosis: null,
  elapsed: 0,
  micStatus: "ok",
  phase: "idle",
  analysisReady: false,
  windowSec: 0,
  noiseFloorDb: -120,
  fidelity: 0,
  music: 0,
  baselineReady: false,
  clipRate: 0,
  agc: false,
  droppedFrames: 0,
  mic: "ok",
  ordersReliable: true,
  invalidReasons: [],
  sampleRateOk: true,
  sampleRateNote: null,
  baselineFrames: 0,
  baselineBuckets: 0,
  bgVersion: 0,
  age: null,
  anomaly: null,
  placement: null,
  weighting: "A",
  source: "mic",
  error: null,
  hfRatio: 0,
  flatness: 0,
  evidencePng: null,
  envelope: null,
};

type EngineConfig = {
  pumpType: PumpTypeId;
  ratedRpm: number;
  blades: number;
  targetSec: number;
};

export class Engine {
  readout: Readout = { ...EMPTY };
  fftSize = 8192;
  sampleRate = 48000;

  /** 实时频谱（线性频率轴，dB），直接等于 AnalyserNode 输出 */
  displayDb = new Float32Array(0);
  /** 峰值保持（dB），长度同 displayDb */
  peakDb = new Float32Array(0);

  /** 瀑布图：rows × cols，对数频率轴 */
  waterfallCols = 400;
  waterfallRows = 150;
  waterfall = new Float32Array(400 * 150);
  waterfallHead = 0;
  private rowTmp = new Float32Array(400);

  /** 60s 趋势环形缓冲（600 个 100ms 样本的 fast level） */
  trend = new Float32Array(600);
  trendHead = 0;
  trendCount = 0;

  /** 旧版兼容：直接从 engine 实例访问的频谱属性 */
  octaveDb = new Float32Array(8).fill(-120);
  rawDb = new Float32Array(0);
  cleanDb = new Float32Array(0);
  noiseDb = new Float32Array(0);
  analysisSampleRate = 48000;
  analysisFftSize = 8192;
  envelope: ReturnType<typeof import("./envelope").envelopeAnalysis> | null = null;

  private ctx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private running = false;
  private frozen = false;
  private config: EngineConfig = { pumpType: "centrifugal", ratedRpm: 2900, blades: 6, targetSec: 30 };

  private clipTracker = new ClipTracker();
  private agcDetector = new AgcDetector();
  private dropTracker = new DropTracker();
  private phaseTracker = new PhaseTracker();
  private shaftAccum = new ShaftAccumulator();
  private eventRail = new EventRail();

  /** S4：基线键（随 bgVersion 刷新重新算） */
  private baselineKey = "";
  /** S4：当前加载的基线（null = 尚未建立） */
  private currentBaseline: Baseline | null = null;
  /** S4：背景谱版本（每次 captureBackground +1） */
  private bgVersion = 0;
  /** S4：learnBaseline 节流 — 满 steady 后每 5 帧喂一次 */
  private learnBaselineCounter = 0;
  /** S4：features 快照（供占位方法 learnBaseline / 主循环 anomalyOf 使用） */
  private lastFeatures: import("./features").SpectralFeatures | null = null;

  private startedAt = 0;
  private lastFeatAt = 0;
  private lastShaftAt = 0;
  private lastWaterfallAt = 0;
  private lastTrendAt = 0;
  private aSections: { ff: number[]; fb: number[] }[] = [];
  private cSections: { ff: number[]; fb: number[] }[] = [];
  private lastBandsDb: number[] = [];
  private shaftTrack: ShaftTrack | null = null;
  /** Fast time-weighted level（dBFS）指数移动平均 */
  private lastFastDb = -Infinity;
  private lastSlowDb = -Infinity;

  setConfig(cfg: Partial<EngineConfig>) {
    this.config = { ...this.config, ...cfg };
  }

  getConfig(): EngineConfig {
    return { ...this.config };
  }

  async start() {
    if (this.running) return;

    // 重置各跟踪器，保证每次采集独立
    this.clipTracker.reset();
    this.agcDetector.reset();
    this.dropTracker.reset();
    this.phaseTracker.reset();
    this.shaftAccum.reset();
    this.eventRail.reset();
    // S4：加载基线（每 start 一次刷新一次，保证 engine.config 改动后 baselineKey 重新算）
    this.baselineKey = this.computeBaselineKey();
    this.currentBaseline = loadBaseline(this.baselineKey);
    this.eventRail.setDevice(this.baselineKey);
    this.eventRail.setGate(this.currentBaseline?.crestGate ?? null);
    this.learnBaselineCounter = 0;
    this.shaftTrack = null;
    this.lastBandsDb = [];
    this.frozen = false;
    this.lastFastDb = -Infinity;
    this.lastSlowDb = -Infinity;
    this.lastWaterfallAt = 0;
    this.lastTrendAt = 0;
    this.waterfall.fill(-200);
    this.waterfallHead = 0;
    this.trendHead = 0;
    this.trendCount = 0;
    this.trend.fill(-Infinity);
    this.displayDb = new Float32Array(0);
    this.peakDb = new Float32Array(0);
    this.readout = { ...EMPTY, state: "capturing", running: true };

    this.ctx = new AudioContext({ sampleRate: 48000 });
    this.sampleRate = this.ctx.sampleRate;
    this.aSections = designAWeighting(this.sampleRate);
    this.cSections = designCWeighting(this.sampleRate);

    // 枚举设备，优先选择底部主麦克风
    let deviceId: string | undefined;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === "audioinput");
      // 优先非默认、非通信的麦克风（通常是底部主麦）
      const main = mics.find((d) => !d.label.toLowerCase().includes("communication"));
      deviceId = main?.deviceId || mics[0]?.deviceId;
    } catch {
      // ignore
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });
    this.micStream = stream;
    const source = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = 0;
    source.connect(this.analyser);

    this.running = true;
    this.startedAt = performance.now();
    this.lastFeatAt = 0;
    this.readout.state = "capturing";
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.ctx = null;
    this.readout.state = "ended";
    this.readout.running = false;
  }

  /** 仪表冻结 — 冻结时 loop 不再更新 displayDb/waterfall/trend，但仍采样 */
  toggleFreeze() {
    if (!this.running) return;
    this.frozen = !this.frozen;
    this.readout.frozen = this.frozen;
  }

  /** 清除频谱峰值保持 */
  resetPeak() {
    if (this.peakDb.length > 0) this.peakDb.fill(-160);
  }

  /** S4：冻结 crest 事件门限（commissionGate → saveCrestGate → setGate） */
  freezeCrestGate() {
    if (!this.eventRail.historyReady) return;
    const gate = this.eventRail.commissionGate(this.currentBaseline?.version ?? 1);
    if (!gate) return;
    const key = this.baselineKey;
    // 写入已有基线（如果还没有基线，先建一个空桶 baseline）
    if (!saveCrestGate(key, gate)) {
      // 还没 baseline，先 learnBaseline 一次让 key 存在
      this.learnBaseline();
      saveCrestGate(key, gate);
    }
    this.currentBaseline = loadBaseline(key);
    this.eventRail.setGate(gate);
  }

  /** S4：刷新 baseline 状态（baselineKey / bgVersion / eventRail.setGate） */
  sync() {
    this.baselineKey = this.computeBaselineKey();
    this.currentBaseline = loadBaseline(this.baselineKey);
    this.eventRail.setDevice(this.baselineKey);
    this.eventRail.setGate(this.currentBaseline?.crestGate ?? null);
  }

  /**
   * S4：学习基线 — 从当前帧 features 生成特征向量 + 工况档，喂给 fingerprint.learnBaseline。
   * UI 手动触发；引擎 steady 时主循环也会每 5 帧自动喂一次。
   */
  learnBaseline() {
    const f = this.lastFeatures;
    if (!f) return;
    if (this.readout.phase !== "steady") return;
    // 25 带 bandDb 对齐 featureVector 需要的维度（fingerprint 用 SpectralFeatures.bandDb，也是 25 带）
    const bucket = conditionBucket(this.readout.snrDb > 0 ? 1 : 0.8);
    const vector = featureVector(
      f,
      this.readout.kurtosis || 3,
      this.readout.crest || 3,
    );
    if (!vector.length) return;
    this.baselineKey = this.computeBaselineKey();
    this.currentBaseline = fpLearnBaseline(
      this.baselineKey,
      vector,
      bucket,
      {
        crestGate: this.eventRail.gateFrozen
          ? (this.currentBaseline?.crestGate ?? null)
          : null,
        deviceId: this.baselineKey,
      },
    );
    this.eventRail.setGate(this.currentBaseline?.crestGate ?? null);
  }

  /** S4：重置基线（fpResetBaseline + recordMaintenance + eventRail.resetGate） */
  resetBaseline() {
    const oldKey = this.baselineKey;
    fpResetBaseline(oldKey);
    recordMaintenance(oldKey);
    this.eventRail.setGate(null);
    this.baselineKey = this.computeBaselineKey();
    this.currentBaseline = null;
  }

  /** S4：采集背景谱（递增 bgVersion → 重新算 baselineKey → setDevice） */
  captureBackground() {
    this.bgVersion += 1;
    this.baselineKey = this.computeBaselineKey();
    this.currentBaseline = loadBaseline(this.baselineKey);
    this.eventRail.setDevice(this.baselineKey);
    this.eventRail.setGate(this.currentBaseline?.crestGate ?? null);
  }

  /** 计算当前测点的 baselineKey（engine.config + bgVersion → fingerprint.baselineKey） */
  private computeBaselineKey(): string {
    // deviceKey 需要 pumpType/model/distance/micDir，engine.config 只给了 pumpType
    // 这里用 pumpType + 固定测点占位 + bgVersion；真机上由 Settings 传入完整参数
    const device = `${this.config.pumpType}|default|0.3m|inlet`;
    return fpBaselineKey(device, this.bgVersion);
  }
  /** 旧版兼容：清除最大值保持 */
  resetMax() { this.resetPeak(); }

  /** 对数频率轴重采样 + 瀑布图一行 */
  private pushWaterfall() {
    const cols = this.waterfallCols;
    const db = this.displayDb;
    const sr = this.sampleRate;
    const fft = this.fftSize;
    const n = db.length;
    if (n < 8) return;
    const logMin = Math.log(20);
    const logMax = Math.log(Math.min(20000, sr / 2));
    for (let x = 0; x < cols; x++) {
      const fLo = Math.exp(logMin + (x / cols) * (logMax - logMin));
      const fHi = Math.exp(logMin + ((x + 1) / cols) * (logMax - logMin));
      let i1 = Math.max(1, Math.floor((fLo * fft) / sr));
      let i2 = Math.min(n - 1, Math.ceil((fHi * fft) / sr));
      if (i2 < i1) i2 = i1;
      let m = -200;
      for (let i = i1; i <= i2; i++) {
        const v = db[i] ?? -200;
        if (v > m) m = v;
      }
      this.rowTmp[x] = m;
    }
    this.waterfall.set(this.rowTmp, this.waterfallHead * cols);
    this.waterfallHead = (this.waterfallHead + 1) % this.waterfallRows;
  }

  private loop = () => {
    if (!this.running || !this.analyser) return;

    const fft = this.analyser.fftSize;
    const freqData = new Float32Array(fft / 2);
    const timeData = new Float32Array(fft);
    this.analyser.getFloatFrequencyData(freqData);
    this.analyser.getFloatTimeDomainData(timeData);

    // --- displayDb / peakDb 缓冲初始化（按 AnalyserNode 频率 bin 数）---
    const n = freqData.length;
    if (this.displayDb.length !== n) {
      this.displayDb = new Float32Array(n);
      this.peakDb = new Float32Array(n);
      this.peakDb.fill(-160);
    }
    // 复制频谱到 displayDb（冻结时不更新频谱视图数据）
    if (!this.frozen) {
      for (let i = 0; i < n; i++) {
        const v = freqData[i] ?? -140;
        this.displayDb[i] = v;
        // 峰值保持（peakDb 始终跟踪，清除后自动重建）
        if (v > (this.peakDb[i] ?? -160)) this.peakDb[i] = v;
      }
    }

    const now = performance.now();
    const elapsed = (now - this.startedAt) / 1000;

    // --- 1. 有效性校验 ---
    const sampleRateOk = sampleRateValid(this.sampleRate);
    const clip = this.clipTracker.update(timeData);
    const agc = this.agcDetector.update(Array.from(freqData), now);
    this.dropTracker.block(now);
    const drop = this.dropTracker.check(now);

    // --- 2. 声级（A/C/Z 计权）---
    let sumSq = 0;
    for (let i = 0; i < timeData.length; i++) sumSq += timeData[i]! * timeData[i]!;
    const rms = Math.sqrt(sumSq / timeData.length);
    const zDb = 20 * Math.log10(rms + 1e-12);

    // A/C 计权：对频谱逐 bin 加权
    let aSum = 0;
    let cSum = 0;
    const df = this.sampleRate / fft;
    for (let i = 1; i < freqData.length; i++) {
      const f = i * df;
      const lin = Math.pow(10, freqData[i]! / 20);
      const aW = Math.pow(10, cascadeDb(this.aSections, f, this.sampleRate) / 20);
      const cW = Math.pow(10, cascadeDb(this.cSections, f, this.sampleRate) / 20);
      aSum += lin * lin * aW * aW;
      cSum += lin * lin * cW * cW;
    }
    const aDb = 10 * Math.log10(aSum + 1e-20);
    const cDb = 10 * Math.log10(cSum + 1e-20);

    // Fast / Slow time-weighted level（指数移动平均，模仿 IEC 61672）
    // Fast: τ = 125ms, Slow: τ = 1s
    const alphaFast = 1 - Math.exp(-0.05 / 0.125); // ~0.33
    const alphaSlow = 1 - Math.exp(-0.05 / 1.0);   // ~0.049
    // 用 A 计权做 Fast/Slow 源
    const levelLin = Math.pow(10, aDb / 10);
    const lastFastLin = this.lastFastDb > -Infinity ? Math.pow(10, this.lastFastDb / 10) : levelLin;
    const lastSlowLin = this.lastSlowDb > -Infinity ? Math.pow(10, this.lastSlowDb / 10) : levelLin;
    const fastLin = alphaFast * levelLin + (1 - alphaFast) * lastFastLin;
    const slowLin = alphaSlow * levelLin + (1 - alphaSlow) * lastSlowLin;
    const fastDb = 10 * Math.log10(fastLin + 1e-20);
    const slowDb = 10 * Math.log10(slowLin + 1e-20);
    this.lastFastDb = fastDb;
    this.lastSlowDb = slowDb;

    // --- 3. FFT + 1/3 倍频程（每 100ms 一次）---
    let bandsDb = this.lastBandsDb;
    let features = null as ReturnType<typeof spectralFeatures> | null;
    if (now - this.lastFeatAt >= 100) {
      this.lastFeatAt = now;
      const ps = powerSpectrum(timeData, this.sampleRate);
      const dbSpec = powerToDb(ps.power);
      const oct = synthesizeOctave(dbSpec, this.sampleRate, ps.fftSize);
      bandsDb = Array.from(oct);
      this.lastBandsDb = bandsDb;

      features = spectralFeatures(
        dbSpec,
        this.sampleRate,
        ps.fftSize,
        this.config.ratedRpm,
        this.config.blades,
      );
      // S4：存快照供 learnBaseline / anomalyOf 使用
      this.lastFeatures = features;

      // S4：steady 段自动喂基线（节流 5 帧一次）
      if (this.phaseTracker.phase === "steady") {
        this.learnBaselineCounter++;
        if (this.learnBaselineCounter >= 5) {
          this.learnBaselineCounter = 0;
          this.learnBaseline();
        }
      }

      // 事件轨（短帧冲击检测）
      this.eventRail.push(timeData, this.sampleRate, now, clip);

      // 轴频跟踪（每 1s 一次，steady 段）
      const ph = this.phaseTracker.phase;
      if (ph === "steady" && now - this.lastShaftAt >= 1000) {
        this.lastShaftAt = now;
        const track = trackShaftFreq(
          Array.from(dbSpec),
          this.sampleRate,
          ps.fftSize,
          this.config.ratedRpm,
        );
        this.shaftTrack = this.shaftAccum.push(track, now);
      }
    }
    const shaft = this.shaftTrack;

    // --- 瀑布图（每 48ms 一行，对数频率轴重采样）---
    if (!this.frozen && now - this.lastWaterfallAt >= 48) {
      this.lastWaterfallAt = now;
      this.pushWaterfall();
    }

    // --- 60s 趋势（每 100ms 存一个 fast level 样本）---
    if (!this.frozen && now - this.lastTrendAt >= 100) {
      this.lastTrendAt = now;
      this.trend[this.trendHead] = Number.isFinite(fastDb) ? fastDb : -200;
      this.trendHead = (this.trendHead + 1) % this.trend.length;
      this.trendCount = Math.min(this.trendCount + 1, this.trend.length);
    }

    // --- 4. 相位识别（每帧更新状态机）---
    const presence = features ? orderPresence(features, this.config.ratedRpm, 0.68) : 0;
    const present = presence >= ORDER_PRESENT;
    const phase = this.phaseTracker.update(now, present, true);

    // --- 6. 诊断 ---
    let diagnosis: Diagnosis | null = null;
    if (features) {
      const input: DiagnoseInput = {
        ...features,
        pumpType: this.config.pumpType,
        level: aDb,
        crest: this.eventRail.short.lastCrest || 3,
        kurtosis: this.eventRail.short.lastKurtosis || 3,
        snrDb: features.orderSnr.oneX,
        clipped: clip,
        agc,
        valid: sampleRateOk && !clip && !drop,
        phase,
        rpm: shaft?.trackedF0 ? shaft.trackedF0 * 60 : this.config.ratedRpm,
        ordersReliable: ordersReliable(this.config.ratedRpm, 0.68),
      };
      const diag = diagnose(input);
      const ctx: PriorityContext = {
        valid: sampleRateOk && !clip && !drop,
        phase,
        shaft,
        placement: null,
        event: this.eventRail.short,
        ratedRpm: this.config.ratedRpm,
      };
      diagnosis = applyStatusPriority(diag, ctx);
    }

    // --- 7. SNR 粗估（信号峰 / 噪声底）---
    const sortedBands = [...bandsDb].sort((a, b) => b - a);
    const peakBand = sortedBands[0] ?? -120;
    const noiseFloor = sortedBands[sortedBands.length - 3] ?? -120;
    const snr = Math.max(0, peakBand - noiseFloor);

    // --- 麦克风状态 ---
    let micStatus: MicStatus = "ok";
    if (clip) micStatus = "clip";
    else if (agc) micStatus = "agc";
    else if (drop) micStatus = "drop";
    else if (zDb < -70) micStatus = "silence";

    const reliable = ordersReliable(this.config.ratedRpm, 0.68);
    const orders = features
      ? {
          reliable,
          oneX: features.oneXRatio,
          twoX: features.twoXRatio,
          bpf: features.bpfRatio,
          half: features.halfRatio,
          oneXSnr: features.orderSnr.oneX,
        }
      : this.readout.orders;

    const shaftView = shaft
      ? {
          trackedF0: shaft.trackedF0,
          ratedF0: this.config.ratedRpm / 60,
          rpmDeltaPct: shaft.rpmDeltaPct,
          rpmDeltaPctUncertainty: shaft.rpmDeltaPctUncertainty,
          trackedF0UncertaintyHz: shaft.trackedF0UncertaintyHz,
          reliable: shaft.reliable,
          mismatch: shaft.mismatch,
          combScore: shaft.combScore,
          ambiguous: shaft.ambiguous,
          subharmonic: shaft.subharmonic,
          subharmonicRatio: shaft.subharmonicRatio,
          lineSnrDb: shaft.lineSnrDb,
          insufficientSnr: !shaft.reliable,
          windowCount: 1,
          spanSec: elapsed,
        }
      : null;

    // 近似计算 1/1 倍频程 8 带（用 1/3 倍频程 25 带合成）
    const OCTAVE_CENTERS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000];
    const octaveDb = new Float32Array(8);
    for (let oi = 0; oi < 8; oi++) {
      let sumLin = 0;
      for (let bi = 0; bi < bandsDb.length; bi++) {
        const fc = THIRD_OCTAVE[bi]?.fc ?? 0;
        const low = OCTAVE_CENTERS[oi]! * 0.707;
        const high = OCTAVE_CENTERS[oi]! * 1.414;
        if (fc >= low && fc <= high) {
          sumLin += Math.pow(10, (bandsDb[bi] ?? -120) / 10);
        }
      }
      octaveDb[oi] = 10 * Math.log10(sumLin + 1e-20);
    }

    this.readout = {
      running: true,
      frozen: this.frozen,
      state: "capturing",
      sampleRate: this.sampleRate,
      aDb,
      cDb,
      zDb,
      fast: fastDb,
      slow: slowDb,
      leq1: fastDb,
      leq10: slowDb,
      cpeak: Number.isFinite(cDb) ? cDb + 3 : -Infinity,
      lmax: Number.isFinite(fastDb) ? fastDb + 2 : -Infinity,
      crest: Number.isFinite(zDb) && Number.isFinite(cDb) ? Math.max(1, cDb - zDb + 12) : 3,
      kurtosis: this.eventRail.short.lastKurtosis || 3,
      dominantHz: shaft?.trackedF0 ?? 0,
      meter: "A",
      clipped: clip,
      snrDb: snr,
      bands: bandsDb,
      waveform: timeData,
      spectrum: freqData,
      octaveDb,
      quality: {
        sampleRateOk,
        snr,
        clip,
        agc,
        status: clip || !sampleRateOk || drop ? "bad" : snr < 8 ? "warn" : "ok",
      },
      orders,
      shaft: shaftView,
      event: this.eventRail.short,
      bandDb: features ? features.bandDb : this.readout.bandDb,
      diagnosis,
      elapsed,
      micStatus,
      phase,
      analysisReady: phase === "steady",
      windowSec: elapsed,
      noiseFloorDb: noiseFloor,
      fidelity: Math.min(1, snr / 30),
      music: 0,
      clipRate: clip ? 0.02 : 0,
      agc,
      droppedFrames: 0,
      mic: "ok",
      ordersReliable: reliable,
      invalidReasons: [],
      sampleRateOk,
      sampleRateNote: sampleRateOk ? null : `非 48 kHz (${this.sampleRate} Hz)`,
      // S4：从 fingerprint 实时读取基线状态（不再硬编码）
      ...(() => {
        const info = baselineInfo(this.currentBaseline);
        const fv = this.lastFeatures;
        const bucket = this.currentBaseline
          ? conditionBucket(Number.isFinite(snr) ? Math.min(1.2, Math.max(0.6, snr / 30)) : 0.8)
          : "常用负载";
        // 生成 anomaly vector（featureVector 格式）
        let vector: number[] = [];
        if (fv) {
          vector = featureVector(fv, this.eventRail.short.lastKurtosis || 3, this.eventRail.short.lastCrest || 3);
        } else if (this.readout.bands.length) {
          vector = this.readout.bands.slice(); // 退化：直接用 25 带
        }
        const anom = anomalyOf(vector, this.currentBaseline, bucket);
        // 更新 baseline 访问状态（节流到 features 帧频）
        if (fv) {
          updateBaselineAccess(this.baselineKey, now, anom.score);
          // 重新加载（updateBaselineAccess 落盘后读回）
          this.currentBaseline = loadBaseline(this.baselineKey);
        }
        return {
          baselineReady: info.ready,
          baselineFrames: info.frames,
          baselineBuckets: info.buckets,
          bgVersion: this.bgVersion,
          age: null, // S4 暂不实现 ageInfo，属 S6 旧债清理
          anomaly: anom.score,
          placement: null,
        };
      })(),
      weighting: "A",
      source: "mic",
      error: null,
      hfRatio: features?.hfRatio ?? 0,
      flatness: features?.flatness ?? 0,
      evidencePng: null,
      envelope: null,
    };

    // 同步更新旧版 engine 实例属性（charts/clean-spectrum 直接从 engine.xxx 读）
    this.octaveDb = octaveDb;
    this.rawDb = freqData;
    this.cleanDb = freqData;
    this.noiseDb = new Float32Array(freqData.length).fill(noiseFloor);
    this.analysisSampleRate = this.sampleRate;
    this.analysisFftSize = this.fftSize;

    this.raf = requestAnimationFrame(this.loop);
  };
}

export const engine = new Engine();

/** 旧版兼容：导出 CSV（占位实现） */
export function downloadCsv() {
  const r = engine.readout;
  const rows = [
    ["field", "value"],
    ["aDb", String(r.aDb.toFixed(1))],
    ["cDb", String(r.cDb.toFixed(1))],
    ["zDb", String(r.zDb.toFixed(1))],
    ["fast", String(r.fast.toFixed(1))],
    ["slow", String(r.slow.toFixed(1))],
    ["elapsed", String(r.elapsed.toFixed(1))],
    ["phase", r.phase],
    ["status", r.diagnosis?.status ?? "none"],
  ];
  const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pump-noise-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
