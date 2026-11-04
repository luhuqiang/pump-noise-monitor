/**
 * 事件轨：85 ms 短帧并行路径（评审 15 §2.3 / 16 §2.2 / 17 §2、§3）。
 *
 * 0.68 s 长积分把早期冲击（轴承损伤、叶轮碰擦、联轴器松动）的短时峰值
 * 平均成了正常，等到冲击能量在长窗里显形往往已经到晚期。
 * 这条独立的短帧路径专门抓冲击类事件：
 *   - 每片 4096 样点（~85 ms @48k）算一次 kurtosis / crest；
 *     2048 点估四阶矩方差太大，4096 仍能覆盖轴承冲击
 *   - crest 一律是片内 peak/RMS 自归一化比值，与输入增益无关
 *   - 门限用 median/MAD 鲁棒 z 分数，不用 P95（少数大冲击会污染 P95）
 *   - 门限在调试/验收期冻结，写进 baseline 版本；运行期只记录、不再更新，
 *     否则泵慢慢劣化时分布整体抬高，门限跟着爬升，越来越不敏感
 *   - 未冻结门限（历史不足或未做验收）时只记录、不报警
 *   - kurtosis 判据在削顶态下屏蔽（削顶会人为制造高峰度）
 *   - 结果作为独立事件轨输出，不与趋势轨合并
 */

export type CrestGate = {
  /** 验收期冻结的 crest 中位数 */
  median: number;
  /** 基于 MAD 的鲁棒尺度（已乘 1.4826，近似 σ） */
  scale: number;
  /** crest 专用鲁棒 z 门限（与事件轨峰度门限 EVENT_KURTOSIS_THRESHOLD 分开命名） */
  crestGateZ: number;
  /** 旧版本存档字段，仅用于兼容读取，不再写入 */
  zLimit?: number;
  /** 冻结时间（ISO） */
  frozenAt: string;
  /** 冻结时对应的基线版本号 */
  version: number;
};

export type ShortEvent = {
  /** 累计冲击事件数 */
  eventCount: number;
  /** 最近一次事件的时间戳（ms） */
  lastEventAtMs: number;
  /** 最近一次事件的峰度 */
  lastKurtosis: number;
  /** 最近一次事件的峰值因子（片内 peak/RMS） */
  lastCrest: number;
  /** 短窗 kurtosis 滑动平均（10 帧） */
  meanKurtosis: number;
  /** 短窗 crest 滑动平均（10 帧） */
  meanCrest: number;
  /** 每秒钟事件触发频率（事件轨的"活度"） */
  eventsPerSec: number;
  /** 冻结后的 crest 报警门限（median + crestGateZ×scale）；未冻结时 null */
  crestGate: number | null;
  /** 冻结门限使用的 crest z 阈值；未冻结时 null */
  crestGateZ: number | null;
  /** 当前帧 crest 的鲁棒 z 值；未冻结时 null */
  currentCrestZ: number | null;
  /** 冻结门限的中位数 */
  crestMedian: number | null;
  /** 冻结门限的鲁棒尺度 */
  crestScale: number | null;
  /** 门限是否已冻结；false 时只记录不报警 */
  gateFrozen: boolean;
  /** 冻结门限对应的基线版本号 */
  gateVersion: number;
  /** 历史样本是否已足够（≥200 帧）可以冻结门限 */
  historyReady: boolean;
  /** 当前帧是否被削顶屏蔽 */
  clipped: boolean;
};

export const EVENT_KURTOSIS_THRESHOLD = 5;
/** crest 冻结门限的鲁棒 z 阈值：3.5σ（对重尾分布比 3σ 更稳；不要和峰度门限混用） */
export const CREST_GATE_Z = 3.5;
export const EVENT_HISTORY_MIN_FRAMES = 200;
export const EVENT_HISTORY_MAX = 600;
/** 单片 4096 样点 ≈ 85 ms，仍能覆盖轴承冲击（评审 17 §3） */
export const EVENT_FRAME_SAMPLES = 4096;
export const EVENT_FRAME_SEC = EVENT_FRAME_SAMPLES / 48000;
export const EVENT_COOLDOWN_MS = 100;
const EVENT_RATE_WINDOW_SEC = 2;
const HISTORY_KEY = "pump-crest-history-v2";

type HistoryStore = Record<string, number[]>;

function readHistory(): HistoryStore {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as HistoryStore) : {};
  } catch {
    return {};
  }
}

function writeHistory(store: HistoryStore) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(store));
  } catch {
    /* 隐私模式忽略 */
  }
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export class EventRail {
  private count = 0;
  private lastAtMs = 0;
  private lastKurt = 0;
  private lastCrest = 0;
  private kurtWindow: number[] = [];
  private crestWindow: number[] = [];
  private eventAtMs: number[] = [];
  private cooldownUntilMs = 0;
  /** 该设备验收期采集的 crest 样本（只用于冻结门限，不参与运行期判定） */
  private crestHistory: number[] = [];
  private device = "";
  private clippedFrame = false;
  private lastPersistAt = 0;
  /** 冻结门限：由 baseline 版本携带，运行期只读 */
  private gate: CrestGate | null = null;
  /** 当前帧 crest 的鲁棒 z 值（未冻结时 null） */
  private currentCrestZ: number | null = null;

  /** 切换设备/测点时加载对应的验收期 crest 分布，并清掉未冻结门限。 */
  setDevice(device: string) {
    if (device === this.device) return;
    this.device = device;
    const store = readHistory();
    this.crestHistory = (store[device] ?? []).slice(-EVENT_HISTORY_MAX);
  }

  /** 由 baseline 携带的冻结门限；传 null 表示尚未冻结（只记录不报警）。 */
  setGate(gate: CrestGate | null) {
    this.gate = gate
      ? { ...gate, crestGateZ: gate.crestGateZ ?? gate.zLimit ?? CREST_GATE_Z }
      : null;
    this.currentCrestZ = null;
  }

  get gateFrozen() {
    return this.gate !== null;
  }

  get historyReady() {
    return this.crestHistory.length >= EVENT_HISTORY_MIN_FRAMES;
  }

  /**
   * 把验收期历史冻结成门限（评审 17 §2）。
   * 只有 historyReady 时才允许冻结；返回 null 表示样本还不够。
   */
  commissionGate(version: number): CrestGate | null {
    if (!this.historyReady) return null;
    const med = median(this.crestHistory);
    const mad = median(this.crestHistory.map((v) => Math.abs(v - med)));
    // MAD 为 0 时（纯正弦）用中位数的 5% 兜底，避免除零放大
    const scale = Math.max(mad * 1.4826, med * 0.05, 0.05);
    return {
      median: med,
      scale,
      crestGateZ: CREST_GATE_Z,
      frozenAt: new Date().toISOString(),
      version,
    };
  }

  /**
   * 喂一片短窗原始样本。
   * @param samples 原始 PCM 样点（Float32），长度 ~4096
   * @param sr 采样率
   * @param ctxMs 时钟戳（ms）
   * @param clipped 当前是否削顶；削顶时屏蔽 kurtosis 判据且不记录历史
   */
  push(samples: Float32Array, sr: number, ctxMs: number, clipped = false) {
    const n = samples.length;
    if (n < 128) return;
    let s2 = 0;
    let s4 = 0;
    let pk = 0;
    for (let i = 0; i < n; i++) {
      const x = samples[i] ?? 0;
      const x2 = x * x;
      s2 += x2;
      s4 += x2 * x2;
      const ax = x < 0 ? -x : x;
      if (ax > pk) pk = ax;
    }
    const ms = s2 / n;
    const kurt = ms > 0 ? s4 / n / (ms * ms) : 3;
    // crest 永远是片内 peak/RMS 自归一化比值，与输入增益无关
    const crest = ms > 0 ? pk / Math.sqrt(ms) : 0;
    this.clippedFrame = clipped;

    this.kurtWindow.push(kurt);
    this.crestWindow.push(crest);
    if (this.kurtWindow.length > 10) this.kurtWindow.shift();
    if (this.crestWindow.length > 10) this.crestWindow.shift();

    // 只在未削顶、且有实际声信号时积累验收期历史（只记录，不据此实时改门限）
    if (!clipped && ms > 1e-10) this.recordCrest(crest);

    const gate = this.gate;
    const crestZ = gate ? (crest - gate.median) / gate.scale : 0;
    this.currentCrestZ = gate ? crestZ : null;
    // 门限未冻结 → 只记录不报警；削顶 → 判据整体屏蔽
    const hit =
      !clipped &&
      gate !== null &&
      (crestZ >= gate.crestGateZ || kurt >= EVENT_KURTOSIS_THRESHOLD);
    if (ctxMs >= this.cooldownUntilMs && hit) {
      this.count++;
      this.lastAtMs = ctxMs;
      this.lastKurt = kurt;
      this.lastCrest = crest;
      this.cooldownUntilMs = ctxMs + EVENT_COOLDOWN_MS;
      this.eventAtMs.push(ctxMs);
    }
    const cutoff = ctxMs - EVENT_RATE_WINDOW_SEC * 1000;
    while (this.eventAtMs.length && this.eventAtMs[0]! < cutoff) this.eventAtMs.shift();
  }

  private recordCrest(crest: number) {
    this.crestHistory.push(Number(crest.toFixed(2)));
    if (this.crestHistory.length > EVENT_HISTORY_MAX) this.crestHistory.shift();
    if (!this.device) return;
    // 约 12 次/秒，落盘节流到每 5 秒一次
    const now = Date.now();
    if (now - this.lastPersistAt < 5000) return;
    this.lastPersistAt = now;
    const store = readHistory();
    store[this.device] = this.crestHistory;
    writeHistory(store);
  }

  get short(): ShortEvent {
    const mk = this.kurtWindow.reduce((a, b) => a + b, 0) / Math.max(1, this.kurtWindow.length);
    const mc = this.crestWindow.reduce((a, b) => a + b, 0) / Math.max(1, this.crestWindow.length);
    const rate = this.eventAtMs.length / EVENT_RATE_WINDOW_SEC;
    const gate = this.gate;
    return {
      eventCount: this.count,
      lastEventAtMs: this.lastAtMs,
      lastKurtosis: this.lastKurt,
      lastCrest: this.lastCrest,
      meanKurtosis: mk,
      meanCrest: mc,
      eventsPerSec: rate,
      crestGate: gate ? gate.median + gate.crestGateZ * gate.scale : null,
      crestGateZ: gate ? gate.crestGateZ : null,
      currentCrestZ: this.currentCrestZ,
      crestMedian: gate ? gate.median : null,
      crestScale: gate ? gate.scale : null,
      gateFrozen: gate !== null,
      gateVersion: gate?.version ?? 0,
      historyReady: this.historyReady,
      clipped: this.clippedFrame,
    };
  }

  /** 运行中重置计数，但保留设备验收期 crest 历史与冻结门限。 */
  reset() {
    this.count = 0;
    this.lastAtMs = 0;
    this.lastKurt = 0;
    this.lastCrest = 0;
    this.kurtWindow = [];
    this.crestWindow = [];
    this.eventAtMs = [];
    this.cooldownUntilMs = 0;
    this.clippedFrame = false;
    this.currentCrestZ = null;
  }
}
