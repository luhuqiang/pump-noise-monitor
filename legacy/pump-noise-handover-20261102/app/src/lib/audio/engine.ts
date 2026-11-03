import { THIRD_OCTAVE, synthesizeOctave } from "@/lib/audio/bands";
import { bandLevels, backgroundKey, backgroundVersion, saveBackground } from "@/lib/audio/background";
import { conditionOf, targetDbFor } from "@/lib/audio/condition";
import { Denoiser } from "@/lib/audio/denoise";
import {
  ALGORITHM_VERSION,
  diagnose,
  faultLogits,
  smoothLogits,
  softmaxLogits,
  type Diagnosis,
  type DirectionId,
  type Logits,
} from "@/lib/audio/diagnose";
import { spectrumPng } from "@/lib/audio/draw";
import { EventRail, EVENT_FRAME_SAMPLES, EVENT_FRAME_SEC, type ShortEvent } from "@/lib/audio/event-rail";
import { envelopeAnalysis, type EnvelopeSummary } from "@/lib/audio/envelope";
import { featuresFromPower, spectralFeatures } from "@/lib/audio/features";
import { powerSpectrum, powerToDb, bandPower } from "@/lib/audio/fft";
import {
  anomalyOf,
  ageInfo,
  baselineInfo,
  baselineKey,
  conditionBucket,
  deviceKey,
  featureVector,
  learnBaseline as learnFingerprint,
  loadBaseline as loadFingerprint,
  captureDeviceId,
  placementCheck,
  recordMaintenance,
  resetBaseline as resetFingerprint,
  saveCrestGate,
  updateBaselineAccess,
  updatePlacementStreak,
  type AgeInfo,
  type Baseline,
  type PlacementCheck,
} from "@/lib/audio/fingerprint";
import { ORDER_PRESENT, PhaseTracker, orderPresence, ordersReliable as ordersReliableBase, type RunPhase } from "@/lib/audio/phase";
import { scenarioGain, getPumpFns, WORKLET_SOURCE } from "@/lib/audio/pump-dsp";
import { floorPow2, resampleTo48k } from "@/lib/audio/resample";
import { getScenario, REF_DBFS } from "@/lib/audio/scenarios";
import { applyStatusPriority } from "@/lib/audio/status-priority";
import {
  ordersReliableWithTrack,
  ShaftAccumulator,
  trackShaftFreq,
  type ShaftTrack,
} from "@/lib/audio/shaft-tracker";
import {
  AgcDetector,
  ClipTracker,
  DropTracker,
  SAMPLE_RATE,
  channelStatus,
  invalidText,
  type InvalidReason,
  type MicStatus,
} from "@/lib/audio/validity";
import { designAWeighting, designCWeighting, weightDb } from "@/lib/audio/weighting";
import { useSettings, type SourceMode, type Weighting } from "@/lib/settings";
import { shareOrCopy } from "@/lib/license";

export type Readout = {
  running: boolean;
  frozen: boolean;
  source: SourceMode;
  weighting: Weighting;
  fast: number;
  slow: number;
  leq1: number;
  leq10: number;
  cpeak: number;
  lmax: number;
  crest: number;
  kurtosis: number;
  dominantHz: number;
  flatness: number;
  hfRatio: number;
  splAt0: number;
  clipped: boolean;
  error: string | null;
  diagnosis: Diagnosis | null;
  meter: "worklet" | "analyser" | "idle";
  /** 全带信噪比估计（dB） */
  snrDb: number;
  /** 降噪前后频带能量保留率，1 表示几乎没动 */
  fidelity: number;
  /** 噪声底相对输入的电平（dB） */
  noiseFloorDb: number;
  /** 音乐噪声指标，越低越好 */
  music: number;
  /** 当前分析窗口长度（秒） */
  windowSec: number;
  /** 是否已收到原始音频块并完成精细分析 */
  analysisReady: boolean;
  /** 包络谱与轴承阶次结果 */
  envelope: EnvelopeSummary | null;
  /** 正常指纹偏离分 0–100，未学习基线时为 null */
  anomaly: number | null;
  /** 已学习的基线样本数 */
  baselineCount: number;
  /** 采集链路是否可信；false 时结论位必须是 invalid */
  valid: boolean;
  invalidReasons: InvalidReason[];
  /** 运行态状态机 */
  phase: RunPhase;
  ordersReliable: boolean;
  ordersPresent: boolean;
  clipRate: number;
  agc: boolean;
  mic: MicStatus;
  droppedFrames: number;
  sampleRateOk: boolean;
  /** 采样率降级说明（非 48k 时给出原因） */
  sampleRateNote: string | null;
  baselineFrames: number;
  baselineBuckets: number;
  baselineReady: boolean;
  bgVersion: number;
  /** 基线老化 / 维修状态 */
  age: AgeInfo | null;
  /** 轴频跟踪结果（steady 段才跑） */
  shaft: ShaftTrack | null;
  /** 32–64 ms 短帧事件轨（冲击/尖峰） */
  event: ShortEvent | null;
  /** 证据截图：离屏 canvas 叠 rawDb + displayDb 的 dataURL */
  evidencePng: string | null;
  /** 摆位指纹偏移（4–8k / 1–2k 对数能量比） */
  placement: PlacementCheck | null;
};

type MeterMsg = {
  dt: number;
  zMs: number;
  zK: number;
  zPk: number;
  aMs: number;
  cMs: number;
  cPk: number;
};

const EMPTY: Readout = {
  running: false,
  frozen: false,
  source: "demo",
  weighting: "A",
  fast: Number.NaN,
  slow: Number.NaN,
  leq1: Number.NaN,
  leq10: Number.NaN,
  cpeak: Number.NaN,
  lmax: Number.NaN,
  crest: Number.NaN,
  kurtosis: Number.NaN,
  dominantHz: 0,
  flatness: Number.NaN,
  hfRatio: Number.NaN,
  splAt0: 120,
  clipped: false,
  error: null,
  diagnosis: null,
  meter: "idle",
  snrDb: Number.NaN,
  fidelity: Number.NaN,
  noiseFloorDb: Number.NaN,
  music: 0,
  windowSec: 0,
  analysisReady: false,
  envelope: null,
  anomaly: null,
  baselineCount: 0,
  valid: false,
  invalidReasons: [],
  phase: "idle",
  ordersReliable: false,
  ordersPresent: false,
  clipRate: 0,
  agc: false,
  mic: "ok",
  droppedFrames: 0,
  sampleRateOk: true,
  sampleRateNote: null,
  baselineFrames: 0,
  baselineBuckets: 0,
  baselineReady: false,
  bgVersion: 0,
  age: null,
  shaft: null,
  event: null,
  evidencePng: null,
  placement: null,
};

type CaptureMsg = { samples: Float32Array; sr: number; peak: number; clipRate?: number; clip?: boolean };

/** 未校准相对声级：0 dBFS 为满度，不再把 splAt0 绝对声级混进实时读数。 */
function dbOf(ms: number) {
  if (!(ms > 0)) return -120;
  return 10 * Math.log10(ms) + useSettings.getState().calOffset;
}

function smooth(prev: number, next: number, dt: number, tau: number) {
  const a = 1 - Math.exp(-dt / tau);
  return prev + a * (next - prev);
}

/** 当前设置下的派生工况，供声级名义值、仪表与报告共用。 */
export function currentCondition() {
  const s = useSettings.getState();
  return conditionOf({
    pumpType: s.pumpType,
    pole: s.pole,
    gridHz: s.gridHz,
    rpm: s.rpm,
    blades: s.blades,
    flow: s.flow,
    head: s.head,
    npsh: s.npsh,
    clearance: s.clearance,
    actualFlow: s.actualFlow,
    ratedCurrent: s.ratedCurrent,
    actualCurrent: s.actualCurrent,
    voltage: s.voltage,
  });
}

class Ring {
  private buf: number[] = [];
  private sum = 0;
  constructor(private max: number) {}
  clear() {
    this.buf = [];
    this.sum = 0;
  }
  push(ms: number) {
    this.buf.push(ms);
    this.sum += ms;
    if (this.buf.length > this.max) this.sum -= this.buf.shift() ?? 0;
  }
  db() {
    if (!this.buf.length || this.sum <= 0) return Number.NaN;
    return 10 * Math.log10(this.sum / this.buf.length) + useSettings.getState().calOffset;
  }
}

export class Engine {
  readout: Readout = { ...EMPTY };
  displayDb = new Float32Array(0);
  peakDb = new Float32Array(0);
  octaveDb = new Float32Array(0);
  waterfall = new Float32Array(400 * 150);
  waterfallCols = 400;
  waterfallRows = 150;
  waterfallHead = 0;
  trend = new Float32Array(600);
  trendHead = 0;
  trendCount = 0;
  fftSize = 8192;
  sampleRate = 48000;
  /** 精细分析谱：原始 / 降噪后 / 噪声底，均与声级路径对齐 */
  rawDb = new Float32Array(0);
  cleanDb = new Float32Array(0);
  noiseDb = new Float32Array(0);
  analysisFftSize = 0;
  analysisSampleRate = 48000;
  envelope: EnvelopeSummary | null = null;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private calGain: GainNode | null = null;
  private oscGain: GainNode | null = null;
  private micGain: GainNode | null = null;
  private monitor: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserA: AnalyserNode | null = null;
  private analyserC: AnalyserNode | null = null;
  private synth: AudioWorkletNode | null = null;
  private meter: AudioWorkletNode | null = null;
  private osc: OscillatorNode | null = null;
  private micNode: MediaStreamAudioSourceNode | null = null;
  private micStream: MediaStream | null = null;
  private freqDb = new Float32Array(0);
  private weighted = new Float32Array(0);
  private timeZ = new Float32Array(0);
  private timeA = new Float32Array(0);
  private timeC = new Float32Array(0);
  private rowTmp = new Float32Array(400);
  private raf = 0;
  private starting: Promise<void> | null = null;
  private sawMeter = false;
  private seeded = false;
  private zFast = 0;
  private aFast = 0;
  private cFast = 0;
  private zSlow = 0;
  private aSlow = 0;
  private cSlow = 0;
  private leqFast = new Ring(20);
  private leqSlow = new Ring(200);
  private trendWrite = 0;
  private leqAcc = 0;
  private lastFallback = 0;
  private lastRow = 0;
  private lastFeat = 0;
  private lastShift = 0;
  private weightKey = "";
  private weights = new Float32Array(0);
  private synthKey = "";
  private routeKey = "";
  private lastDiagId = "";
  private lastDiagAt = 0;
  private micAsk = 0;
  private frozen = false;
  private running = false;
  private denoiser = new Denoiser();
  private capture: AudioWorkletNode | null = null;
  private captureReady = false;
  private lastVector: number[] | null = null;
  private baseline: Baseline | null = null;
  private baselineTag = "";
  private bgDevice = "";
  private bgVersion = 0;
  private lastBands: number[] = [];
  private clipTracker = new ClipTracker();
  private agcDetector = new AgcDetector();
  private dropTracker = new DropTracker();
  private phaseTracker = new PhaseTracker();
  private micStatus: MicStatus = "ok";
  private smoothedLogits: Logits | null = null;
  private heldDirection: DirectionId | null = null;
  /** 故障方向滞回：候选升权 → 保持 HOLD_UP_MS 才升级；降级需 HOLD_DOWN_MS */
  private holdUpUntilMs = 0;
  private holdDownUntilMs = 0;
  /** low_confidence ↔ ok 进出滞回：防止抖动 */
  private holdOkUntilMs = 0;
  private holdLowConfidenceUntilMs = 0;
  private hiddenGapMs = 0;
  private hiddenAt = 0;
  private orderPresenceScore = 0;
  /** 演示声源在没有可用音频设备时的离线兜底帧 */
  private demoSamples: Float32Array | null = null;
  private demoKey = "";
  private demoReady = false;
  private demoLastPush = 0;
  private demoAnalysedAt = 0;
  private demoRms = 0;
  private demoKurt = 3;
  private demoPeak = 0;
  private runningAt = 0;
  /** 32–64 ms 短帧事件轨，与 0.68 s 趋势轨并行 */
  private eventRail = new EventRail();
  /** 轴频多窗累计：最近 4 s 内的独立窗按 1/σ² 合并（评审 17 §1②） */
  private shaftAccum = new ShaftAccumulator();
  /** 轴频跟踪节流：steady 段每 ~1 s 跑一次，为多窗累计提供 4 s 内的样本 */
  private lastShaftTrackAt = 0;
  /** 焦点丢失/路由切换导致 AudioContext 采样率变化时，先标 invalid 再在 onBlock 里重建流 */
  private needsSampleRateRebuild = false;
  /** 采样率重建次数上限（评审 16 §2.1：仅支持 44.1k 的设备若无限重启会永久卡死） */
  private static readonly MAX_SAMPLE_RATE_RESTARTS = 3;
  private sampleRateRestarts = 0;
  /** 重建超限后接受当前采样率并在内部重采样，标 invalid 降级可用 */
  private acceptNonStandardSr = false;
  /** 用户显式重建基线时保存的版本号，写入后续每份报告 */
  private nextBaselineVersion = 0;
  /** 当前摆位指纹（4–8k / 1–2k 能量比，对数域） */
  private lastPlacementRatio: number | null = null;
  /** 设备指纹：换机后摆位比值不可比（评审 17 §5） */
  private readonly placementDeviceId = captureDeviceId();

  constructor() {
    this.waterfall.fill(-200);
    this.octaveDb = new Float32Array(31);
  }

  dispose() {
    this.running = false;
    this.frozen = false;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.capture?.disconnect();
    this.capture = null;
    this.captureReady = false;
    this.releaseMic();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibility);
    this.osc?.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.readout = { ...EMPTY };
  }

  async start() {
    if (this.running) {
      await this.sync();
      return;
    }
    await this.ensure();
    this.resetIntegrators();
    this.running = true;
    this.runningAt = performance.now();
    this.frozen = false;
    this.readout.running = true;
    this.readout.frozen = false;
    this.readout.error = null;
    this.phaseTracker.reset();
    this.phaseTracker.update(this.runningAt, false, true);
    await this.sync();
  }

  stop() {
    this.running = false;
    this.frozen = false;
    this.phaseTracker.reset();
    this.clipTracker.reset();
    this.agcDetector.reset();
    this.dropTracker.reset();
    this.smoothedLogits = null;
    this.heldDirection = null;
    this.holdUpUntilMs = 0;
    this.holdDownUntilMs = 0;
    this.holdOkUntilMs = 0;
    this.holdLowConfidenceUntilMs = 0;
    this.eventRail.reset();
    this.shaftAccum.reset();
    this.lastShaftTrackAt = 0;
    this.needsSampleRateRebuild = false;
    this.sampleRateRestarts = 0;
    this.acceptNonStandardSr = false;
    this.lastPlacementRatio = null;
    this.readout.running = false;
    this.readout.frozen = false;
    this.readout.phase = "idle";
    this.readout.age = null;
    this.readout.shaft = null;
    this.readout.event = null;
    this.readout.evidencePng = null;
    this.zeroGains();
    this.releaseMic();
  }

  toggleFreeze() {
    if (!this.running) return;
    this.frozen = !this.frozen;
    this.readout.frozen = this.frozen;
  }

  resetPeak() {
    this.peakDb.fill(-160);
  }

  resetMax() {
    this.readout.lmax = this.readout.fast;
  }

  async sync() {
    if (!this.ctx || !this.running) return;
    const s = useSettings.getState();
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const ramp = (g: GainNode | null, value: number) => {
      if (!g) return;
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(Math.max(0, value), now, 0.02);
    };
    const routeKey = `${s.source}|${s.pumpType}|${s.scenario}|${Math.round(s.rpm)}|${s.blades}|${s.pole}|${s.gridHz}|${s.ratedCurrent.toFixed(1)}|${s.actualCurrent.toFixed(1)}|${s.actualFlow.toFixed(2)}|${s.voltage.toFixed(0)}`;
    const routeChanged = routeKey !== this.routeKey;
    this.routeKey = routeKey;

    this.readout.source = s.source;
    this.readout.splAt0 = s.splAt0;
    this.readout.weighting = s.weighting;

    const gainChange = () => this.agcDetector.noteGainChanged(performance.now());

    if (s.source === "mic") {
      const ask = ++this.micAsk;
      ramp(this.calGain, 0);
      ramp(this.oscGain, 0);
      gainChange();
      try {
        await this.ensureMic();
        if (ask !== this.micAsk || useSettings.getState().source !== "mic") {
          this.releaseMic();
          return;
        }
        ramp(this.micGain, 1);
        ramp(this.monitor, 0);
        gainChange();
        this.readout.error = null;
      } catch (err) {
        if (ask !== this.micAsk) return;
        this.readout.error = micMessage(err);
        this.micStatus = "missing";
        this.readout.mic = "missing";
        ramp(this.micGain, 0);
        return;
      }
    } else {
      this.micAsk++;
      this.releaseMic();
      ramp(this.micGain, 0);
      gainChange();
      this.readout.error = null;
      if (s.source === "ref") {
        const refRms = Math.pow(10, REF_DBFS / 20);
        ramp(this.calGain, 0);
        ramp(this.oscGain, refRms * Math.SQRT2);
        ramp(this.monitor, s.monitor ? 0.07 / refRms : 0);
        gainChange();
      } else {
        const scenario = getScenario(s.scenario);
        const cond = currentCondition();
        const targetDb = targetDbFor(scenario.targetDb, s.rpm, cond.loadRatio);
        const gain = scenarioGain(
          scenario.mode,
          s.rpm,
          s.blades,
          ctx.sampleRate,
          targetDb,
          120,
          s.gridHz,
          s.pole,
          cond.loadRatio,
        );
        ramp(this.oscGain, 0);
        ramp(this.calGain, gain);
        ramp(this.monitor, s.monitor ? 0.07 / Math.pow(10, (targetDb - 120) / 20) : 0);
        gainChange();
        const key = `${scenario.mode}|${s.rpm}|${s.blades}|${s.gridHz}|${s.pole}|${cond.loadRatio.toFixed(2)}`;
        if (key !== this.synthKey) {
          this.synth?.port.postMessage({
            type: "set",
            mode: scenario.mode,
            rpm: s.rpm,
            blades: s.blades,
            gridHz: s.gridHz,
            pole: s.pole,
            load: cond.loadRatio,
          });
          this.synthKey = key;
        }
      }
    }
    const device = deviceKey(s.pumpType, s.model, s.distance, s.micDir);
    this.bgDevice = device;
    this.bgVersion = backgroundVersion(device);
    const tag = baselineKey(device, this.bgVersion);
    if (tag !== this.baselineTag) {
      this.baselineTag = tag;
      this.baseline = loadFingerprint(tag);
      const info = baselineInfo(this.baseline);
      this.readout.baselineCount = this.baseline?.frames ?? 0;
      this.readout.baselineFrames = info.frames;
      this.readout.baselineBuckets = info.buckets;
      this.readout.baselineReady = info.ready;
      this.readout.bgVersion = this.bgVersion;
      this.readout.anomaly = null;
      this.smoothedLogits = null;
      // 事件轨门限随 baseline 版本冻结（评审 17 §2）：无门限时只记录不报警
      this.eventRail.setDevice(device);
      this.eventRail.setGate(this.baseline?.crestGate ?? null);
      this.shaftAccum.reset();
    }
    if (routeChanged) {
      gainChange(); // 音源切换 → AGC 判据里也要跳过
      this.resetIntegrators();
    }

    // 焦点丢失 / 路由切换后 AudioContext 可能被浏览器强制切采样率。
    // 这里做一次显式校验，若 ctx.sampleRate !== 48k → 先标 invalid，等下次 stop/start 重建流。
    if (ctx.sampleRate !== SAMPLE_RATE && this.readout.sampleRateOk) {
      this.needsSampleRateRebuild = true;
      this.readout.invalidReasons = Array.from(
        new Set([...this.readout.invalidReasons, "sample_rate" as InvalidReason]),
      );
      this.readout.sampleRateOk = false;
    }
  }

  /** 把当前特征加入正常基线；返回累计帧数，0 表示还没有可学习的特征。
   * 基线版本只有用户显式重建时才会 +1，并写入此后每份报告。 */
  learnBaseline() {
    if (!this.lastVector || !this.baselineTag) return 0;
    const bucket = conditionBucket(currentCondition().loadRatio);
    const version = this.nextBaselineVersion || this.baseline?.version || 1;
    // 冲击门限只由验收期手动冻结；建基线不自动生成，重建后需重新冻结一次
    const crestGate = this.baseline?.crestGate ?? null;
    const st = this.readout.shaft;
    const shaft =
      st && !st.ambiguous && st.trackedF0 > 0 && Number.isFinite(st.trackedF0UncertaintyHz)
        ? { hz: st.trackedF0, sigmaHz: st.trackedF0UncertaintyHz }
        : null;
    const next = learnFingerprint(this.baselineTag, this.lastVector, bucket, {
      placementRatio: this.lastPlacementRatio,
      version: this.nextBaselineVersion || undefined,
      crestGate,
      shaft,
      deviceId: this.placementDeviceId,
    });
    if (next && this.nextBaselineVersion) this.nextBaselineVersion = 0;
    this.baseline = next;
    this.eventRail.setGate(next?.crestGate ?? null);
    const info = baselineInfo(next);
    this.readout.baselineCount = next?.frames ?? 0;
    this.readout.baselineFrames = info.frames;
    this.readout.baselineBuckets = info.buckets;
    this.readout.baselineReady = info.ready;
    return next?.frames ?? 0;
  }

  /** 验收期手动冻结冲击门限：只固化到已有基线，不新增特征样本。 */
  freezeCrestGate(): boolean {
    if (!this.baselineTag || !this.baseline || this.baseline.crestGate) return false;
    const gate = this.eventRail.commissionGate(this.baseline.version);
    if (!gate) return false;
    if (!saveCrestGate(this.baselineTag, gate)) return false;
    this.baseline.crestGate = gate;
    this.eventRail.setGate(gate);
    return true;
  }

  resetBaseline() {
    if (this.baselineTag) this.nextBaselineVersion = resetFingerprint(this.baselineTag);
    this.baseline = null;
    this.eventRail.setGate(null);
    this.shaftAccum.reset();
    this.readout.baselineCount = 0;
    this.readout.baselineFrames = 0;
    this.readout.baselineBuckets = 0;
    this.readout.baselineReady = false;
    this.readout.anomaly = null;
    this.smoothedLogits = null;
    this.readout.age = null;
    this.readout.placement = null;
  }

  /** 维修事件：旧基线直接作废，下次 learnBaseline 生成新版本（版本号在报告中可追溯）。 */
  markMaintenance() {
    const nextVersion = (this.baseline?.version ?? 0) + 1;
    if (this.baselineTag) recordMaintenance(this.baselineTag);
    this.resetBaseline();
    this.nextBaselineVersion = Math.max(this.nextBaselineVersion, nextVersion);
    // 维修事件也是一次音源状态变化 → AGC 判定重置
    this.agcDetector.noteGainChanged(performance.now());
  }

  /** 保存当前 24 带背景谱，版本 +1 后旧基线自动失效。 */
  captureBackground() {
    if (!this.lastBands.length || !this.bgDevice) return 0;
    const source = useSettings.getState().source === "mic" ? "mic" : "demo";
    const profile = saveBackground(this.bgDevice, this.lastBands, {
      source,
      frames: 1,
      orderPresence: this.orderPresenceScore,
    });
    this.bgVersion = profile.version;
    this.baselineTag = baselineKey(this.bgDevice, this.bgVersion);
    this.baseline = loadFingerprint(this.baselineTag);
    this.eventRail.setGate(this.baseline?.crestGate ?? null);
    const info = baselineInfo(this.baseline);
    this.readout.bgVersion = profile.version;
    this.readout.baselineCount = this.baseline?.frames ?? 0;
    this.readout.baselineFrames = info.frames;
    this.readout.baselineBuckets = info.buckets;
    this.readout.baselineReady = info.ready;
    this.readout.anomaly = null;
    this.smoothedLogits = null;
    return profile.version;
  }

  private resetIntegrators() {
    this.seeded = false;
    this.zFast = 0;
    this.aFast = 0;
    this.cFast = 0;
    this.zSlow = 0;
    this.aSlow = 0;
    this.cSlow = 0;
    this.leqFast.clear();
    this.leqSlow.clear();
    this.leqAcc = 0;
    this.trendWrite = 0;
    this.trendHead = 0;
    this.trendCount = 0;
    this.lastFallback = 0;
    this.readout.fast = Number.NaN;
    this.readout.slow = Number.NaN;
    this.readout.leq1 = Number.NaN;
    this.readout.leq10 = Number.NaN;
    this.readout.cpeak = Number.NaN;
    this.readout.crest = Number.NaN;
    this.readout.kurtosis = Number.NaN;
    this.readout.lmax = Number.NaN;
    this.readout.diagnosis = null;
    this.lastShift = 0;
    this.lastDiagId = "";
    this.lastDiagAt = 0;
    this.denoiser.reset();
    this.captureReady = false;
    this.demoSamples = null;
    this.demoKey = "";
    this.demoReady = false;
    this.demoLastPush = 0;
    this.demoAnalysedAt = 0;
    this.demoRms = 0;
    this.demoKurt = 3;
    this.demoPeak = 0;
    this.lastVector = null;
    this.envelope = null;
    this.rawDb = new Float32Array(0);
    this.cleanDb = new Float32Array(0);
    this.noiseDb = new Float32Array(0);
    this.readout.snrDb = Number.NaN;
    this.readout.fidelity = Number.NaN;
    this.readout.noiseFloorDb = Number.NaN;
    this.readout.music = 0;
    this.readout.windowSec = 0;
    this.readout.analysisReady = false;
    this.readout.envelope = null;
    this.readout.anomaly = null;
    this.readout.baselineCount = this.baseline?.frames ?? 0;
    this.clipTracker.reset();
    this.agcDetector.reset();
    this.dropTracker.reset();
    this.smoothedLogits = null;
    this.heldDirection = null;
    this.holdUpUntilMs = 0;
    this.holdDownUntilMs = 0;
    this.holdOkUntilMs = 0;
    this.holdLowConfidenceUntilMs = 0;
    this.eventRail.reset();
    this.shaftAccum.reset();
    this.lastShaftTrackAt = 0;
    this.needsSampleRateRebuild = false;
    this.readout.shaft = null;
    this.readout.event = null;
    this.readout.age = null;
    this.readout.evidencePng = null;
    this.readout.placement = null;
    this.lastBands = [];
    this.orderPresenceScore = 0;
    this.phaseTracker.reset();
    this.readout.valid = false;
    this.readout.invalidReasons = [];
    this.readout.phase = "idle";
    this.readout.clipRate = 0;
    this.readout.agc = false;
    this.readout.droppedFrames = 0;
    this.readout.ordersReliable = false;
    this.readout.ordersPresent = false;
  }

  private zeroGains() {
    this.calGain && (this.calGain.gain.value = 0);
    this.oscGain && (this.oscGain.gain.value = 0);
    this.micGain && (this.micGain.gain.value = 0);
    this.monitor && (this.monitor.gain.value = 0);
  }

  /** 采样率不符时的整条链路重建：关闭旧 ctx，重新 build + sync。
   *  不经过 start()（运行中会直接短路），否则重启是空操作。 */
  private async rebuildStream() {
    try {
      this.capture?.disconnect();
    } catch {
      /* 已断开 */
    }
    this.capture = null;
    this.captureReady = false;
    const old = this.ctx;
    this.ctx = null;
    try {
      await old?.close();
    } catch {
      /* 旧流已关闭 */
    }
    await this.ensure();
    await this.sync();
  }

  private async ensure() {
    if (this.ctx) {
      await this.ctx.resume();
      return;
    }
    if (this.starting) return this.starting;
    this.starting = this.build();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async build() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    let ctx: AudioContext;
    try {
      ctx = new Ctx({ sampleRate: SAMPLE_RATE });
    } catch {
      // 少数浏览器不支持指定采样率；此时按真实采样率分析，并由 validity 判 invalid。
      ctx = new Ctx();
    }
    this.ctx = ctx;
    this.sampleRate = ctx.sampleRate;
    // 重建成功拿到 48k → 清零重启计数与降级标记
    if (ctx.sampleRate === SAMPLE_RATE) {
      this.sampleRateRestarts = 0;
      this.acceptNonStandardSr = false;
      this.needsSampleRateRebuild = false;
      this.readout.sampleRateNote = null;
      this.readout.sampleRateOk = true;
    } else if (!this.acceptNonStandardSr) {
      // 新流仍是 44.1k → 标记待重建；重启次数在 onBlock 里累计，超限后转降级。
      this.needsSampleRateRebuild = true;
      this.readout.sampleRateOk = false;
    }
    await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 1;
    this.master = master;

    const calGain = ctx.createGain();
    calGain.gain.value = 0;
    this.calGain = calGain;
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0;
    this.oscGain = oscGain;
    const micGain = ctx.createGain();
    micGain.gain.value = 0;
    this.micGain = micGain;
    calGain.connect(master);
    oscGain.connect(master);
    micGain.connect(master);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 1000;
    osc.connect(oscGain);
    osc.start();
    this.osc = osc;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = this.fftSize;
    analyser.smoothingTimeConstant = 0.62;
    analyser.minDecibels = -120;
    analyser.maxDecibels = 0;
    master.connect(analyser);
    this.analyser = analyser;

    const mute = ctx.createGain();
    mute.gain.value = 0;
    analyser.connect(mute);

    const monitor = ctx.createGain();
    monitor.gain.value = 0;
    master.connect(monitor);
    monitor.connect(ctx.destination);
    this.monitor = monitor;
    mute.connect(ctx.destination);

    this.attachLevelAnalysers(ctx, master);
    try {
      const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      this.attachWorklet(ctx, master);
      this.readout.meter = "worklet";
    } catch {
      this.readout.meter = "analyser";
    }

    this.ensureBuffers();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibility);
      document.addEventListener("visibilitychange", this.onVisibility);
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  /** 页面被系统切走：麦克风轨道可能已经 ended/muted，回来时先按失效处理。
   * 焦点恢复后还检查 AudioContext 采样率是否被系统重采样（部分 Android WebView 会切 44.1k）。 */
  private onVisibility = () => {
    if (typeof document === "undefined") return;
    const now = performance.now();
    if (document.visibilityState === "hidden") {
      this.hiddenAt = now;
      return;
    }
    const gap = this.hiddenAt ? now - this.hiddenAt : 0;
    this.hiddenAt = 0;
    this.hiddenGapMs = gap;
    if (gap > 2000) {
      this.readout.valid = false;
      this.readout.invalidReasons = Array.from(
        new Set([...this.readout.invalidReasons, "mic_lost" as InvalidReason]),
      );
      this.dropTracker.reset();
      this.eventRail.reset();
      // 焦点丢失后增益可能被系统重新设置 → AGC 判定里也要跳过
      this.agcDetector.noteGainChanged(now);
    }
    // 焦点恢复后检查 AudioContext 采样率——部分浏览器会强制切回系统采样率
    if (this.ctx && this.ctx.sampleRate !== SAMPLE_RATE) {
      this.needsSampleRateRebuild = true;
      this.readout.invalidReasons = Array.from(
        new Set([...this.readout.invalidReasons, "sample_rate" as InvalidReason]),
      );
      this.readout.sampleRateOk = false;
    }
    const track = this.micStream?.getAudioTracks()[0];
    if (track && track.readyState === "ended") this.micStatus = "ended";
    else if (track && track.muted) this.micStatus = "muted";
    else if (this.micStatus === "ended" || this.micStatus === "muted") this.micStatus = "ok";
  };

  private attachLevelAnalysers(ctx: AudioContext, master: GainNode) {
    const make = () => {
      const node = ctx.createAnalyser();
      node.fftSize = 2048;
      node.smoothingTimeConstant = 0;
      return node;
    };
    const chain = (sections: { ff: number[]; fb: number[] }[]) => {
      let node: AudioNode = master;
      for (const section of sections) {
        const iir = ctx.createIIRFilter(section.ff, section.fb);
        node.connect(iir);
        node = iir;
      }
      return node;
    };
    this.analyserA = make();
    this.analyserC = make();
    chain(designAWeighting(ctx.sampleRate)).connect(this.analyserA);
    chain(designCWeighting(ctx.sampleRate)).connect(this.analyserC);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    this.analyserA.connect(mute);
    this.analyserC.connect(mute);
    mute.connect(ctx.destination);
  }

  private attachWorklet(ctx: AudioContext, master: GainNode) {
    const synth = new AudioWorkletNode(ctx, "pump-synth", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    synth.connect(this.calGain!);
    this.synth = synth;

    const meter = new AudioWorkletNode(ctx, "pump-meter", {
      numberOfInputs: 3,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.meter = meter;
    meter.port.onmessage = (ev: MessageEvent<MeterMsg>) => {
      this.sawMeter = true;
      this.readout.meter = "worklet";
      this.consume(ev.data);
    };
    master.connect(meter, 0, 0);
    let a: AudioNode = master;
    for (const section of designAWeighting(ctx.sampleRate)) {
      const iir = ctx.createIIRFilter(section.ff, section.fb);
      a.connect(iir);
      a = iir;
    }
    a.connect(meter, 0, 1);
    let c: AudioNode = master;
    for (const section of designCWeighting(ctx.sampleRate)) {
      const iir = ctx.createIIRFilter(section.ff, section.fb);
      c.connect(iir);
      c = iir;
    }
    c.connect(meter, 0, 2);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    meter.connect(mute);
    mute.connect(ctx.destination);

    try {
      const capture = new AudioWorkletNode(ctx, "pump-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      master.connect(capture);
      const sink = ctx.createGain();
      sink.gain.value = 0;
      capture.connect(sink);
      sink.connect(ctx.destination);
      capture.port.onmessage = (ev: MessageEvent<CaptureMsg>) => this.onBlock(ev.data);
      this.capture = capture;
    } catch {
      this.capture = null;
    }
  }

  private async ensureMic() {
    if (this.micNode || !this.ctx || !this.micGain) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("no-mic");
    }
    const preferred = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: preferred, video: false });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") throw err;
      // 部分手机 WebView 不支持精确约束（如单声道/关闭降噪），退回最简参数重试。
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    this.micStream = stream;
    this.micNode = this.ctx.createMediaStreamSource(stream);
    this.micNode.connect(this.micGain);
    this.micStatus = "ok";
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.onended = () => {
        this.micStatus = "ended";
        this.readout.mic = "ended";
      };
      track.onmute = () => {
        this.micStatus = "muted";
        this.readout.mic = "muted";
      };
      track.onunmute = () => {
        if (this.micStatus === "muted") this.micStatus = "ok";
      };
    }
    this.readout.mic = "ok";
  }

  private releaseMic() {
    this.micNode?.disconnect();
    this.micNode = null;
    this.micStream?.getTracks().forEach((track) => track.stop());
    this.micStream = null;
    if (this.micStatus !== "missing") this.micStatus = "ok";
  }

  private ensureBuffers() {
    if (!this.analyser) return;
    const n = this.analyser.frequencyBinCount;
    if (this.freqDb.length === n) return;
    this.freqDb = new Float32Array(n);
    this.displayDb = new Float32Array(n);
    this.weighted = new Float32Array(n);
    this.peakDb = new Float32Array(n);
    this.peakDb.fill(-160);
    this.fftSize = this.analyser.fftSize;
    this.timeZ = new Float32Array(this.analyser.fftSize);
    this.timeA = new Float32Array(this.analyserA?.fftSize ?? 2048);
    this.timeC = new Float32Array(this.analyserC?.fftSize ?? 2048);
  }

  private loop = () => {
    this.analyse();
    this.raf = requestAnimationFrame(this.loop);
  };

  private analyse() {
    if (!this.running || this.frozen || !this.analyser || !this.ctx) return;
    this.ensureBuffers();
    this.sampleRate = this.ctx.sampleRate;
    const settings = useSettings.getState();
    if (!this.sawMeter) {
      this.readout.meter = "analyser";
      // 演示兜底自己会喂仪表；静默的分析器数据会把电平拉回零。
      if (settings.source !== "demo") this.fallbackMeter();
    }
    this.analyser.getFloatFrequencyData(this.freqDb);
    const weighting = settings.weighting;
    const spl = settings.splAt0;
    const key = `${weighting}|${this.sampleRate}|${this.fftSize}`;
    if (key !== this.weightKey) {
      this.weights = new Float32Array(this.freqDb.length);
      for (let i = 0; i < this.weights.length; i++) {
        const f = (i * this.sampleRate) / this.fftSize;
        this.weights[i] = i === 0 ? 0 : weightDb(weighting, f);
      }
      this.weightKey = key;
      this.peakDb.fill(-160);
      this.trendCount = 0;
      this.trendHead = 0;
    }
    const n = this.freqDb.length;
    let power = 0;
    for (let i = 1; i < n; i++) {
      let d = this.freqDb[i] ?? -140;
      if (!Number.isFinite(d)) d = -140;
      const w = this.weights[i] ?? 0;
      const v = d + w;
      this.weighted[i] = v;
      power += Math.pow(10, v / 10);
    }
    const fast = this.heroFast(weighting);
    let shift = this.lastShift;
    if (Number.isFinite(fast) && power > 0) {
      const sumDb = 10 * Math.log10(power);
      const meterDbfs = fast - spl;
      const next = meterDbfs - sumDb;
      if (Number.isFinite(next) && next < 60 && next > -60) shift = next;
    }
    this.lastShift = shift;
    const hold = settings.peakHold;
    for (let i = 0; i < n; i++) {
      const splDb = (i === 0 ? -160 : (this.weighted[i] ?? -140) + shift) + settings.calOffset;
      this.displayDb[i] = splDb;
      if (hold && splDb > (this.peakDb[i] ?? -160)) this.peakDb[i] = splDb;
    }
    const now = performance.now();
    if (settings.source === "demo") this.simulateDemo(settings);
    if (now - this.lastRow > 48) {
      this.lastRow = now;
      this.pushWaterfall();
    }
    this.updateOctave(fast);
    if (now - this.lastFeat > 180) {
      this.lastFeat = now;
      // 有原始音频块时以精细分析为准；否则退回 AnalyserNode 的粗谱。
      if (!this.captureReady && !this.demoReady) this.updateFeatures(settings.rpm, settings.blades);
    }
    this.readout.weighting = weighting;
    this.readout.splAt0 = spl;
    this.readout.source = settings.source;
  }

  private heroFast(weighting: Weighting) {
    if (weighting === "C") return this.levelFrom(this.cFast);
    if (weighting === "Z") return this.levelFrom(this.zFast);
    return this.levelFrom(this.aFast);
  }

  private heroSlow(weighting: Weighting) {
    if (weighting === "C") return this.levelFrom(this.cSlow);
    if (weighting === "Z") return this.levelFrom(this.zSlow);
    return this.levelFrom(this.aSlow);
  }

  private levelFrom(ms: number) {
    return dbOf(ms);
  }

  private fallbackMeter() {
    if (!this.analyser || !this.analyserA || !this.analyserC) return;
    this.analyser.getFloatTimeDomainData(this.timeZ);
    this.analyserA.getFloatTimeDomainData(this.timeA);
    this.analyserC.getFloatTimeDomainData(this.timeC);
    const pack = (buf: Float32Array) => {
      let s2 = 0;
      let s4 = 0;
      let pk = 0;
      for (let i = 0; i < buf.length; i++) {
        const x = buf[i] ?? 0;
        const x2 = x * x;
        s2 += x2;
        s4 += x2 * x2;
        const ax = Math.abs(x);
        if (ax > pk) pk = ax;
      }
      const n = buf.length || 1;
      return { ms: s2 / n, k: s4 / n, pk };
    };
    const z = pack(this.timeZ);
    const a = pack(this.timeA);
    const c = pack(this.timeC);
    const nowMs = performance.now();
    const dt = this.lastFallback ? Math.min(0.1, (nowMs - this.lastFallback) / 1000) : 0.05;
    this.lastFallback = nowMs;
    this.consume({
      dt,
      zMs: z.ms,
      zK: z.k,
      zPk: z.pk,
      aMs: a.ms,
      cMs: c.ms,
      cPk: c.pk,
    });
  }

  private consume(msg: MeterMsg) {
    if (!this.running || this.frozen) return;
    const dt = Math.max(0.01, msg.dt);
    if (!this.seeded) {
      this.zFast = msg.zMs;
      this.aFast = msg.aMs;
      this.cFast = msg.cMs;
      this.zSlow = msg.zMs;
      this.aSlow = msg.aMs;
      this.cSlow = msg.cMs;
      this.seeded = true;
    } else {
      this.zFast = smooth(this.zFast, msg.zMs, dt, 0.125);
      this.aFast = smooth(this.aFast, msg.aMs, dt, 0.125);
      this.cFast = smooth(this.cFast, msg.cMs, dt, 0.125);
      this.zSlow = smooth(this.zSlow, msg.zMs, dt, 1);
      this.aSlow = smooth(this.aSlow, msg.aMs, dt, 1);
      this.cSlow = smooth(this.cSlow, msg.cMs, dt, 1);
    }
    const weighting = useSettings.getState().weighting;
    const spl = useSettings.getState().splAt0;
    const ms = weighting === "C" ? msg.cMs : weighting === "Z" ? msg.zMs : msg.aMs;
    this.leqAcc += dt;
    if (this.leqAcc >= 0.05) {
      this.leqAcc = 0;
      this.leqFast.push(ms);
      this.leqSlow.push(ms);
    }
    const fast = this.heroFast(weighting);
    const audible = msg.zMs > 1e-10;
    const crest = audible ? msg.zPk / Math.sqrt(msg.zMs) : 0;
    const kurtosis = audible ? msg.zK / (msg.zMs * msg.zMs) : 0;
    this.readout.fast = fast;
    this.readout.slow = this.heroSlow(weighting);
    this.readout.leq1 = this.leqFast.db();
    this.readout.leq10 = this.leqSlow.db();
    this.readout.cpeak = dbOf(msg.cPk * msg.cPk);
    this.readout.crest = crest;
    this.readout.kurtosis = kurtosis;
    this.readout.clipped = this.clipTracker.update(null, msg.zPk);
    this.readout.clipRate = this.clipTracker.clipRate;
    this.readout.splAt0 = spl;
    this.readout.weighting = weighting;
    if (!Number.isFinite(this.readout.lmax) || fast > this.readout.lmax) {
      this.readout.lmax = fast;
    }
    this.trendWrite += dt;
    if (this.trendWrite >= 0.1) {
      this.trendWrite -= 0.1;
      this.trend[this.trendHead] = fast;
      this.trendHead = (this.trendHead + 1) % this.trend.length;
      if (this.trendCount < this.trend.length) this.trendCount++;
    }
  }

  private onBlock(msg: CaptureMsg) {
    if (!this.running || this.frozen) return;
    const samples = msg.samples;
    if (!samples || samples.length < 1024) return;
    this.captureReady = true;
    this.dropTracker.block(performance.now());
    if (msg.clipRate && msg.clipRate > 0) this.readout.clipRate = msg.clipRate;
    if (this.readout.invalidReasons.includes("mic_lost") && this.micStatus === "ok") {
      this.readout.invalidReasons = this.readout.invalidReasons.filter((r) => r !== "mic_lost");
    }

    // 焦点丢失 / 路由切换后如果 ctx.sampleRate 被系统改了，onBlock 进来第一帧就重建流。
    // 但仅支持 44.1k 的设备会一直拿到 44.1k —— 必须限制重启次数，
    // 超限后接受当前采样率并在内部重采样，降级可用，不得继续硬重建（评审 16 §2.1）。
    const sr = msg.sr || this.ctx?.sampleRate || 48000;
    if (this.needsSampleRateRebuild && this.ctx && this.ctx.sampleRate !== SAMPLE_RATE) {
      if (this.sampleRateRestarts < Engine.MAX_SAMPLE_RATE_RESTARTS) {
        this.sampleRateRestarts++;
        this.needsSampleRateRebuild = false;
        void this.rebuildStream();
        return;
      }
      // 重启已达上限：接受非 48k，内部重采样到 48k，标 invalid 降级可用
      this.needsSampleRateRebuild = false;
      this.acceptNonStandardSr = true;
      this.readout.sampleRateOk = false;
      this.readout.sampleRateNote = "采样率非 48k，阶次结论不可用";
      this.readout.invalidReasons = Array.from(
        new Set([...this.readout.invalidReasons, "sample_rate" as InvalidReason]),
      );
    }

    try {
      this.analyseBlock(samples, sr, msg.peak ?? 0);
    } catch {
      /* 分析异常不能阻塞音频与仪表格 */
    }
  }

  /** 原始音频块 → 有效性 → 背景/AGC → 降噪 → 包络 → 指纹 → logits 平滑 → 单次 softmax。 */
  private analyseBlock(samples: Float32Array, sr: number, peak: number) {
    const settings = useSettings.getState();
    const now = performance.now();
    this.clipTracker.update(samples, peak);

    // 事件轨：把 32768 样点切成 8 片 × 4096 样点（每片 ~85 ms），
    // 独立于 0.68 s 趋势轨，专门抓早期冲击。削顶时屏蔽冲击判定（评审 16 §2.2 / 17 §3）。
    const ctxMs = now;
    for (let i = 0; i + EVENT_FRAME_SAMPLES <= samples.length; i += EVENT_FRAME_SAMPLES) {
      this.eventRail.push(
        samples.subarray(i, i + EVENT_FRAME_SAMPLES),
        sr,
        ctxMs + (i / EVENT_FRAME_SAMPLES) * EVENT_FRAME_SEC * 1000,
        this.clipTracker.clipped,
      );
    }
    this.readout.event = this.eventRail.short;

    // 非 48k 降级路径：内部重采样到 48k 再分析（重启超限后才启用）
    let frame = samples;
    let analysisSr = sr;
    if (sr !== SAMPLE_RATE && this.acceptNonStandardSr) {
      const up = resampleTo48k(samples, sr);
      frame = up.subarray(0, floorPow2(up.length));
      analysisSr = SAMPLE_RATE;
    }

    const spec = powerSpectrum(frame, analysisSr);
    const den = this.denoiser.update(spec.power, analysisSr, spec.fftSize);

    const sumDb = 10 * Math.log10(Math.max(spec.ms, 1e-22));
    const cal = settings.calOffset;
    const meterDb =
      this.seeded && Number.isFinite(this.zFast) ? dbOf(this.zFast) : sumDb + cal;
    const offset = meterDb - sumDb;

    this.rawDb = powerToDb(spec.power, offset);
    this.cleanDb = powerToDb(den.cleanPower, offset);
    this.noiseDb = powerToDb(den.noisePower, offset);
    this.analysisFftSize = spec.fftSize;
    this.analysisSampleRate = analysisSr;

    this.lastBands = bandLevels(spec.power, analysisSr, spec.fftSize);
    const agc = this.agcDetector.update(this.lastBands, now);

    const f0 = Math.max(1, settings.rpm) / 60;
    const env = envelopeAnalysis(frame, analysisSr, f0);
    this.envelope = env;

    // 阶次判据用局部中位噪声底，不用降噪器的逐点最小值：
    // 稳态泵的谱线几乎不波动，逐点最小值会爬到谱线上，SNR 退化成 3 dB，
    // 启动判据永远触发不了。降噪器的噪声底只服务显示与整带 SNR。
    const feat = featuresFromPower(spec.power, null, analysisSr, spec.fftSize, settings.rpm, settings.blades);
    this.readout.dominantHz = feat.dominantHz;
    this.readout.flatness = feat.flatness;
    this.readout.hfRatio = feat.hfRatio;

    const windowSec = frame.length / analysisSr;
    const baseReliable = ordersReliableBase(settings.rpm, windowSec);
    const presence = orderPresence(feat, settings.rpm, windowSec);
    this.orderPresenceScore = presence;
    this.phaseTracker.update(now, presence >= ORDER_PRESENT, this.running);

    // 轴频跟踪：只在 steady 段跑（启动时谱线还没对齐，评审 17 收尾）。
    // 每 ~1 s 一个独立窗，交给 ShaftAccumulator 做 4 s 内的 1/σ² 合并。
    let shaftTrack: ShaftTrack | null = this.readout.shaft;
    if (this.phaseTracker.phase === "steady" && now - this.lastShaftTrackAt >= 1000) {
      this.lastShaftTrackAt = now;
      const rawDbList = Array.from(this.rawDb);
      shaftTrack = this.shaftAccum.push(
        trackShaftFreq(rawDbList, analysisSr, spec.fftSize, settings.rpm),
        now,
      );
    }
    this.readout.shaft = shaftTrack;
    const ordersReliable = ordersReliableWithTrack(settings.rpm, windowSec, shaftTrack);

    // 摆位指纹：4–8 kHz / 1–2 kHz 能量比（对数域），对测点位置敏感。
    // 换机判定要看其余一致性指标，所以先算基线偏离再裁决（评审 18 P1-3）。
    const hiBand = bandPower(spec.power, analysisSr, spec.fftSize, 4000, 8000);
    const midBand = bandPower(spec.power, analysisSr, spec.fftSize, 1000, 2000);
    this.lastPlacementRatio = Math.log((hiBand + 1e-20) / (midBand + 1e-20));

    const cond = currentCondition();
    const bucket = conditionBucket(cond.loadRatio);
    this.lastVector = featureVector(feat, this.readout.kurtosis, this.readout.crest, env);
    const abnormal = anomalyOf(this.lastVector, this.baseline, bucket);
    const info = baselineInfo(this.baseline);

    const placement = placementCheck(this.baseline, this.lastPlacementRatio, this.placementDeviceId, {
      anomalyScore: abnormal.score,
    });
    if (this.baselineTag && placement) updatePlacementStreak(this.baselineTag, placement.streak);
    this.readout.placement = placement;

    // 基线老化钩子：每 ~0.68 s 一帧，累加 runMinutes / 更新 lastRunAt / 统计异常天数。
    if (this.baselineTag) updateBaselineAccess(this.baselineTag, now, abnormal.score);
    const age = ageInfo(this.baseline, now, this.baselineTag);
    this.readout.age = age;

    const validity = channelStatus({
      clip: this.clipTracker.clipped,
      clipRate: this.clipTracker.clipRate,
      agc,
      sampleRate: sr,
      mic: this.micStatus,
      droppedFrames: this.dropTracker.count,
      levelDbfs: this.readout.fast,
    });

    let smoothed = this.smoothedLogits;
    if (validity.valid) {
      const logits = faultLogits({
        ...feat,
        pumpType: settings.pumpType,
        level: this.readout.fast,
        crest: this.readout.crest,
        kurtosis: this.readout.kurtosis,
        ordersReliable,
      });
      smoothed = smoothed ? smoothLogits(smoothed, logits, 0.3) : logits;
      this.smoothedLogits = smoothed;
    }

    const held = smoothed ? this.holdDirection(smoothed, now) : null;

    // 转速/阶次 override
    const shaftAmbiguous = shaftTrack !== null && shaftTrack.ambiguous;
    const shaftMismatch = shaftTrack !== null && shaftTrack.mismatch;
    const shaftData: ShaftTrack | null = shaftMismatch || shaftAmbiguous ? shaftTrack : null;

    const next = diagnose(
      {
        ...feat,
        pumpType: settings.pumpType,
        level: this.readout.fast,
        crest: this.readout.crest,
        kurtosis: this.readout.kurtosis,
        snrDb: den.snrDb,
        envelope: env,
        anomaly: abnormal.score,
        baselineCount: info.frames,
        baselineReady: info.ready,
        baselineFrames: info.frames,
        baselineBuckets: info.buckets,
        clipped: this.clipTracker.clipped,
        clipRate: this.clipTracker.clipRate,
        agc,
        valid: validity.valid,
        invalidReasons: validity.reasons,
        phase: this.phaseTracker.phase,
        windowSec,
        rpm: settings.rpm,
        ordersReliable: shaftMismatch || shaftAmbiguous ? false : ordersReliable,
        fidelity: den.fidelity,
      },
      smoothed ?? undefined,
      held ?? undefined,
    );

    // 标题与状态优先级矩阵：invalid > warming > 转速不确定 > 转速不符 > crest > 摆位 > 低置信 > 正常。
    // 纯函数裁决，引擎不再维护 if/else 链（评审 18 P1-1）。
    const resolved = applyStatusPriority(next, {
      valid: validity.valid,
      phase: this.phaseTracker.phase,
      shaft: shaftData,
      placement,
      event: this.readout.event,
      ratedRpm: settings.rpm,
    });
    // 基线老化提示（评审 16 §3.1）：只提示，不自动滚动基线，也不劫持结论标题
    if (age && age.notes.length) {
      resolved.evidence.push(`基线提示：${age.notes.join("；")}`);
    }

    // 事件轨的事件数在 evidence 里追加（独立轨，不并入趋势结论）
    const ev = this.readout.event;
    if (ev) {
      if (ev.eventCount > 0) {
        const gateText = ev.gateFrozen && ev.crestGate !== null
          ? `crest 门限 ${ev.crestGate.toFixed(2)}（median ${ev.crestMedian?.toFixed(2)} + crestGateZ ${ev.crestGateZ?.toFixed(2)}×scale ${ev.crestScale?.toFixed(2)}），当次 z ${ev.currentCrestZ?.toFixed(2)}（冻结于基线 v${ev.gateVersion}）`
          : "crest 门限未冻结";
        resolved.evidence.push(
          `事件轨：累计 ${ev.eventCount} 次冲击，近期 ${ev.eventsPerSec.toFixed(1)} 次/秒（${gateText}）`,
        );
      } else if (!ev.gateFrozen) {
        resolved.evidence.push("事件轨：冲击门限尚未冻结，当前只记录不报警（需在验收期积累 ≥200 帧并建基线）");
      }
    }

    // 生成证据截图：离屏 canvas 叠 rawDb + displayDb
    try {
      this.readout.evidencePng = spectrumPng(
        this.rawDb,
        this.cleanDb,
        this.noiseDb,
        analysisSr,
        spec.fftSize,
        settings.splAt0,
        settings.rpm,
        settings.blades,
        settings.pumpType === "vortex" ? "TPF" : "BPF",
      );
    } catch {
      this.readout.evidencePng = null;
    }

    const r = this.readout;
    r.snrDb = den.snrDb;
    r.fidelity = den.fidelity;
    r.noiseFloorDb = den.floorDb;
    r.music = den.music;
    r.windowSec = windowSec;
    r.analysisReady = true;
    r.envelope = env;
    r.anomaly = abnormal.score;
    r.baselineCount = info.frames;
    r.baselineFrames = info.frames;
    r.baselineBuckets = info.buckets;
    r.baselineReady = info.ready;
    r.bgVersion = this.bgVersion;
    r.valid = validity.valid;
    r.invalidReasons = validity.reasons;
    r.phase = this.phaseTracker.phase;
    r.ordersReliable = shaftMismatch || shaftAmbiguous ? false : ordersReliable;
    r.ordersPresent = presence >= ORDER_PRESENT;
    r.clipRate = this.clipTracker.clipRate;
    r.agc = agc;
    r.mic = this.micStatus;
    r.droppedFrames = this.dropTracker.count;
    r.sampleRateOk = validity.sampleRateOk;
    r.sampleRateNote = validity.sampleRateOk
      ? null
      : this.acceptNonStandardSr
        ? "采样率非 48k，已内部重采样；阶次结论不可用"
        : "采样率非 48k，阶次结论不可用";
    this.commitDiagnosis(resolved, now);
  }

  /** 滞回常量（毫秒）：升权（候选方向）2 s / 降级（回 healthy 或回旧方向）3.4 s。
   * 评审明确要求"规则按毫秒写，不按帧写"。 */
  private static readonly HOLD_UP_MS = 2000;
  private static readonly HOLD_DOWN_MS = 3400;
  /** low_confidence → ok 需保持 1.2 s，ok → low_confidence 需保持 3 s。
   * 两组独立滞回，防 status 在 ok 与 low_confidence 间抖动。 */
  private static readonly HOLD_OK_FROM_LC_MS = 1200;
  private static readonly HOLD_LC_FROM_OK_MS = 3000;

  /** 故障方向滞回：升权 HOLD_UP_MS、降级 HOLD_DOWN_MS。 */
  private holdDirection(logits: Logits, nowMs: number): DirectionId {
    const probs = softmaxLogits(logits);
    const faults: DirectionId[] = [
      "repeated_impact",
      "wideband_hf",
      "one_x",
      "two_x",
      "half_orders",
      "low_harmonics",
      "lf_pulsation",
    ];
    const topFault = faults.reduce((best, key) => (probs[key] > probs[best] ? key : best), faults[0]!);
    const candidate: DirectionId = probs.healthy >= probs[topFault] ? "healthy" : topFault;
    if (!this.heldDirection) {
      this.heldDirection = candidate;
      this.holdUpUntilMs = 0;
      this.holdDownUntilMs = 0;
      return candidate;
    }
    if (candidate === this.heldDirection) {
      this.holdUpUntilMs = 0;
      this.holdDownUntilMs = 0;
      return candidate;
    }
    const rising = probs[candidate] > probs[this.heldDirection];
    if (rising) {
      // 升权：候选概率比 held 大 → HOLD_UP_MS 后才升级
      if (this.holdUpUntilMs === 0) this.holdUpUntilMs = nowMs + Engine.HOLD_UP_MS;
      if (nowMs >= this.holdUpUntilMs) {
        this.heldDirection = candidate;
        this.holdUpUntilMs = 0;
        this.holdDownUntilMs = 0;
      }
      return this.heldDirection;
    } else {
      // 降级：候选概率比 held 小 → HOLD_DOWN_MS 才降级
      if (this.holdDownUntilMs === 0) this.holdDownUntilMs = nowMs + Engine.HOLD_DOWN_MS;
      if (nowMs >= this.holdDownUntilMs) {
        this.heldDirection = candidate;
        this.holdUpUntilMs = 0;
        this.holdDownUntilMs = 0;
      }
      return this.heldDirection;
    }
  }

  /** 两组独立滞回：low_confidence ↔ ok 相互切换都要先保持一段时间。
   * 评审明确要求"unknown 需进入/退出两组滞回，防 ok 与 low_confidence 抖动"。 */
  private applyStatusHysteresis(next: Diagnosis, nowMs: number): Diagnosis {
    const prev = this.readout.diagnosis;
    const prevStatus = prev?.status ?? "ok";
    const curStatus = next.status;
    if (!prev) return next;

    if (prevStatus === "low_confidence" && curStatus === "ok") {
      // low_confidence → ok：需要 HOLD_OK_FROM_LC_MS 持续 ok 才放行
      if (this.holdLowConfidenceUntilMs === 0) {
        this.holdLowConfidenceUntilMs = nowMs + Engine.HOLD_OK_FROM_LC_MS;
      }
      if (nowMs < this.holdLowConfidenceUntilMs) {
        // 还没坚持够 → 继续 low_confidence
        return { ...next, status: "low_confidence" };
      }
      // 通过了 → 重置滞回 timer
      this.holdLowConfidenceUntilMs = 0;
      this.holdOkUntilMs = 0;
      return next;
    }

    if (prevStatus === "ok" && curStatus === "low_confidence") {
      // ok → low_confidence：需要 HOLD_LC_FROM_OK_MS 持续 low_confidence 才放行
      if (this.holdOkUntilMs === 0) {
        this.holdOkUntilMs = nowMs + Engine.HOLD_LC_FROM_OK_MS;
      }
      if (nowMs < this.holdOkUntilMs) {
        return { ...next, status: "ok" };
      }
      this.holdOkUntilMs = 0;
      this.holdLowConfidenceUntilMs = 0;
      return next;
    }

    // invalid 进出不滞回（invalid 是硬错误态）
    // status 相同 → 重置 timer
    this.holdOkUntilMs = 0;
    this.holdLowConfidenceUntilMs = 0;
    return next;
  }

  private commitDiagnosis(next: Diagnosis, nowMs: number) {
    const prev = this.readout.diagnosis;
    // unknown 进出两组滞回
    next = this.applyStatusHysteresis(next, nowMs);
    this.readout.diagnosis = next;
    const settings = useSettings.getState();
    if (settings.source === "ref" || next.status === "invalid") return;
    const key = `${next.status}|${next.title}`;
    if (key === this.lastDiagId) return;
    const now = nowMs;
    if (this.lastDiagId && now - this.lastDiagAt < 2200) return;
    this.lastDiagId = key;
    this.lastDiagAt = now;
    settings.addLog({
      level: next.severity === "正常" ? "info" : "warn",
      tag: "诊断",
      text: `判读 ${prev ? `${prev.title} → ` : ""}${next.title}（${next.confidence} ${next.confidencePct}%）；${next.evidence.slice(0, 3).join("，")}`,
    });
  }

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

  private updateOctave(fast: number) {
    const bands = synthesizeOctave(this.displayDb, this.sampleRate, this.fftSize);
    if (Number.isFinite(fast)) {
      let p = 0;
      for (let i = 0; i < bands.length; i++) p += Math.pow(10, (bands[i] ?? -140) / 10);
      if (p > 0) {
        const shift = fast - 10 * Math.log10(p);
        if (Number.isFinite(shift) && Math.abs(shift) < 40) {
          for (let i = 0; i < bands.length; i++) bands[i] = (bands[i] ?? -140) + shift;
        }
      }
    }
    if (this.octaveDb.length !== bands.length) this.octaveDb = new Float32Array(bands.length);
    this.octaveDb.set(bands);
  }

  /**
   * 演示声源离线兜底。有些环境（没有音频输入设备、预览容器里没有音频会话）
   * AudioContext 时钟不前进，仪表和采集块都不会出数据。此时在主线程用同一套
   * 泵声合成器生成一帧原始样本，喂进同一条“降噪 → 包络 → 指纹 → 判决”链路，
   * 保证演示工况仍然完整可看。真实采集一旦出数据，本兜底自动停用。
   */
  private simulateDemo(settings: ReturnType<typeof useSettings.getState>) {
    if (this.captureReady || this.sawMeter) return;
    const now = performance.now();
    if (!this.runningAt) this.runningAt = now;
    if (now - this.runningAt < 900) return;

    const cond = currentCondition();
    const scenario = getScenario(settings.scenario);
    const sr = this.ctx?.sampleRate ?? 48000;
    const key = `${scenario.mode}|${settings.rpm}|${settings.blades}|${settings.gridHz}|${settings.pole}|${cond.loadRatio.toFixed(2)}`;
    if (!this.demoSamples || key !== this.demoKey) {
      const { createPumpState, pumpSample } = getPumpFns();
      const state = createPumpState(
        scenario.mode,
        settings.rpm,
        settings.blades,
        settings.gridHz,
        cond.loadRatio,
        settings.pole,
      );
      const targetDb = targetDbFor(scenario.targetDb, settings.rpm, cond.loadRatio);
      const gain = scenarioGain(
        scenario.mode,
        settings.rpm,
        settings.blades,
        sr,
        targetDb,
        120,
        settings.gridHz,
        settings.pole,
        cond.loadRatio,
      );
      const n = 32768;
      const buf = new Float32Array(n);
      let s2 = 0;
      let s4 = 0;
      let pk = 0;
      for (let i = 0; i < n; i++) {
        const y = pumpSample(state, sr) * gain;
        buf[i] = y;
        const y2 = y * y;
        s2 += y2;
        s4 += y2 * y2;
        const ay = y < 0 ? -y : y;
        if (ay > pk) pk = ay;
      }
      const ms = s2 / n;
      this.demoSamples = buf;
      this.demoKey = key;
      this.demoRms = Math.sqrt(ms);
      this.demoKurt = ms > 0 ? s4 / n / (ms * ms) : 3;
      this.demoPeak = pk;
      this.demoLastPush = 0;
      this.demoAnalysedAt = 0;
      this.demoReady = false;
    }

    if (now - this.demoLastPush < 420) return;
    const dt = this.demoLastPush ? Math.min(0.9, (now - this.demoLastPush) / 1000) : 0.42;
    this.demoLastPush = now;
    const ms = this.demoRms * this.demoRms;
    this.consume({
      dt,
      zMs: ms,
      zK: this.demoKurt * ms * ms,
      zPk: this.demoPeak,
      aMs: ms,
      cMs: ms,
      cPk: this.demoPeak,
    });

    const samples = this.demoSamples;
    if (!samples) return;
    if (!this.demoReady || now - this.demoAnalysedAt > 1200) {
      try {
        this.analyseBlock(samples, sr, this.demoPeak);
        this.demoReady = true;
        this.demoAnalysedAt = now;
      } catch {
        /* 演示兜底失败不能影响仪表与界面 */
      }
    }
    this.mirrorDemoSpectrum();
  }

  /** 把 32768 点精细谱按区间最大值并入显示谱，供频谱、瀑布与倍频程共用。 */
  private mirrorDemoSpectrum() {
    const raw = this.rawDb;
    const n = this.displayDb.length;
    if (!raw.length || !n) return;
    const ratio = Math.max(1, (raw.length - 1) / n);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * ratio);
      const b = Math.min(raw.length - 1, Math.floor((i + 1) * ratio) - 1);
      let m = -200;
      for (let j = a; j <= b; j++) {
        const v = raw[j]!;
        if (v > m) m = v;
      }
      this.displayDb[i] = m;
    }
  }

  private updateFeatures(rpm: number, blades: number) {
    if (!this.seeded) return;
    const spec = spectralFeatures(this.freqDb, this.sampleRate, this.fftSize, rpm, blades);
    this.readout.dominantHz = spec.dominantHz;
    this.readout.flatness = spec.flatness;
    this.readout.hfRatio = spec.hfRatio;
    const next = diagnose({
      ...spec,
      pumpType: useSettings.getState().pumpType,
      level: this.readout.fast,
      crest: this.readout.crest,
      kurtosis: this.readout.kurtosis,
      clipped: this.readout.clipped,
    });
    this.commitDiagnosis(next, performance.now());
  }
}

function micMessage(err: unknown) {
  const name = err instanceof DOMException ? err.name : err instanceof Error ? err.message : "";
  if (name === "no-mic") return "这个环境没有麦克风，请用演示声源。";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "麦克风权限被拒绝。请到手机“设置 → 应用 → 泵噪监测台 → 权限”里允许麦克风，再点一次“麦克风”。";
  }
  if (name === "NotFoundError") return "没有找到麦克风，请检查手机麦克风是否正常。";
  if (name === "NotReadableError") {
    return "麦克风被其他应用占用或系统正忙，请关闭通话、录音、语音助手等应用后，再点一次“麦克风”。";
  }
  if (name === "OverconstrainedError") {
    return "手机不支持所请求的麦克风参数，请再点一次“麦克风”重试。";
  }
  if (name === "AbortError") return "麦克风启动被系统中断，请再点一次“麦克风”重试。";
  return `麦克风没有打开${name ? `（${name}）` : ""}，可以再点一次“麦克风”重试，或先用演示声源。`;
}

type Slot = { engine: Engine };
const slot = globalThis as typeof globalThis & { __pumpEngine?: Slot };

slot.__pumpEngine?.engine.dispose();
export const engine = new Engine();
slot.__pumpEngine = { engine };

export function downloadCsv() {
  const s = useSettings.getState();
  const r = engine.readout;
  const cond = currentCondition();
  const lines = [
    "项目,数值",
    `泵型,${s.pumpType === "vortex" ? "旋涡泵" : "离心泵"}`,
    `型号,${s.model}`,
    `电机,${s.pole} 极 · ${s.gridHz} Hz`,
    `同步转速r/min,${cond.syncRpm.toFixed(0)}`,
    `运行转速r/min,${s.rpm}`,
    `滑差%,${cond.slipPct.toFixed(2)}`,
    `额定功率kW,${s.ratedPower}`,
    `额定电压V,${s.voltage}`,
    `额定电流A,${s.ratedCurrent}`,
    `实际电流A,${s.actualCurrent}`,
    `负载率%,${(cond.loadRatio * 100).toFixed(1)}`,
    `1倍转频Hz,${cond.f0.toFixed(2)}`,
    `${getScenario(s.scenario).pump === "vortex" ? "齿频TPF" : "叶片BPF"}Hz,${cond.bpf.toFixed(2)}`,
    `2倍工频Hz,${cond.line2x}`,
    `计权,${r.weighting}`,
    `快挡dBFS,${num(r.fast)}`,
    `慢挡dBFS,${num(r.slow)}`,
    `等效1秒dBFS,${num(r.leq1)}`,
    `等效10秒dBFS,${num(r.leq10)}`,
    `C峰值dBFS,${num(r.cpeak)}`,
    `主频Hz,${num(r.dominantHz)}`,
    `峭度,${num(r.kurtosis)}`,
    `波峰因数,${num(r.crest)}`,
    `叶片或齿数,${s.blades}`,
    `额定流量m3h,${s.flow}`,
    `实际流量m3h,${s.actualFlow}`,
    `流量比,${(cond.flowRatio * 100).toFixed(1)}`,
    `实际扬程m,${cond.headActual.toFixed(2)}`,
    `水力功率kW,${cond.hydraulicKw.toFixed(2)}`,
    `轴功率kW,${cond.shaftKw.toFixed(2)}`,
    `泵效率,${(cond.pumpEff * 100).toFixed(1)}`,
    `电机效率,${(cond.motorEff * 100).toFixed(1)}`,
    `估算温升K,${cond.tempRise.toFixed(1)}`,
    `流量显示单位,${s.flowUnit === "lmin" ? "L/min" : "m3/h"}`,
    `0dBFS校准值（仅校准用）,${s.splAt0}`,
    `校准修正dB,${s.calOffset}`,
    `算法版本,${ALGORITHM_VERSION}`,
    `采样率真值Hz,${engine.sampleRate}`,
    `采样率合规,${r.sampleRateOk ? "是" : "否"}`,
    `运行态,${r.phase}`,
    `削顶率,${(r.clipRate * 100).toFixed(3)}%`,
    `AGC,${r.agc ? "可疑" : "未检出"}`,
    `掉帧块数,${r.droppedFrames}`,
    `基线工况档,${r.baselineBuckets}`,
    `背景谱版本,${r.bgVersion}`,
    `信噪比dB,${num(r.snrDb)}`,
    `降噪频带保留,${num(r.fidelity)}`,
    `噪声底dB,${num(r.noiseFloorDb)}`,
    `音乐噪声,${num(r.music)}`,
    `正常指纹偏离,${r.anomaly !== null ? r.anomaly.toFixed(1) : ""}`,
    `基线样本,${r.baselineCount}`,
    `判读,${r.diagnosis?.title ?? ""}`,
    `把握%,${r.diagnosis?.confidencePct ?? ""}`,
    `严重度,${r.diagnosis?.severity ?? ""}`,
    `建议,${r.diagnosis?.action ?? ""}`,
    "",
    "可能方向,概率%,依据",
    ...(r.diagnosis?.directions ?? []).map(
      (item) => `${item.title},${item.probability.toFixed(1)},${item.note}`,
    ),
    "",
    "频率Hz,相对声级dBFS",
  ];
  const n = engine.displayDb.length;
  const step = Math.max(1, Math.floor(n / 600));
  for (let i = 1; i < n; i += step) {
    const f = (i * engine.sampleRate) / engine.fftSize;
    lines.push(`${f.toFixed(2)},${(engine.displayDb[i] ?? 0).toFixed(2)}`);
  }
  lines.push("", "倍频程Hz,相对声级dBFS");
  for (let i = 0; i < THIRD_OCTAVE.length; i++) {
    lines.push(`${THIRD_OCTAVE[i]!.fc},${(engine.octaveDb[i] ?? 0).toFixed(2)}`);
  }
  const text = lines.join("\n");
  if (shareOrCopy(text)) return;
  const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "泵噪监测记录.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function num(n: number) {
  return Number.isFinite(n) ? n.toFixed(2) : "";
}
