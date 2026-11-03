import { create } from "zustand";
import {
  PUMP_TYPES,
  defaultScenarioFor,
  getPumpType,
  getScenario,
  type PumpTypeId,
  type ScenarioId,
} from "@/lib/audio/scenarios";
import {
  clampNum,
  estimateCurrent,
  poleDefaultRpm,
  syncRpm,
  targetDbFor,
} from "@/lib/audio/condition";

export type Weighting = "A" | "C" | "Z";
export type SourceMode = "demo" | "mic" | "ref";
export type FlowUnit = "m3h" | "lmin";
export type MicDir = "正对泵体" | "侧向45°" | "贴轴承座";
export const MIC_DIRS: MicDir[] = ["正对泵体", "侧向45°", "贴轴承座"];
export type ViewMode = "simple" | "expert";
export type Pole = 2 | 4;
export type GridHz = 50 | 60;
export type LogLevel = "info" | "warn" | "alarm";

export type Alarm = { at: string; db: number; note: string };
export type LogEntry = { at: string; level: LogLevel; tag: string; text: string };

export type Data = {
  source: SourceMode;
  pumpType: PumpTypeId;
  model: string;
  scenario: ScenarioId;
  pole: Pole;
  gridHz: GridHz;
  rpm: number;
  /** 转速是否跟随极数/频率自动计算；手动改转速后置 false */
  rpmAuto: boolean;
  blades: number;
  flow: number;
  flowUnit: FlowUnit;
  actualFlow: number;
  head: number;
  npsh: number;
  clearance: number;
  distance: number;
  micDir: MicDir;
  ratedPower: number;
  voltage: number;
  ratedCurrent: number;
  actualCurrent: number;
  weighting: Weighting;
  mode: ViewMode;
  splAt0: number;
  calOffset: number;
  warn: number;
  danger: number;
  peakHold: boolean;
  monitor: boolean;
  alarms: Alarm[];
  logs: LogEntry[];
};

export type PresetData = Omit<Data, "alarms" | "source" | "logs">;
export type Preset = {
  id: string;
  name: string;
  savedAt: string;
  data: PresetData;
};

type Settings = Data & {
  loaded: boolean;
  presets: Preset[];
  load: () => void;
  update: (partial: Partial<Data>) => void;
  selectPumpType: (id: PumpTypeId) => void;
  selectScenario: (id: ScenarioId) => void;
  setPole: (pole: Pole) => void;
  setGrid: (gridHz: GridHz) => void;
  setActualCurrent: (amps: number) => void;
  setActualFlow: (m3h: number) => void;
  estimateRatedCurrent: () => void;
  pushAlarm: (alarm: Alarm) => void;
  clearAlarms: () => void;
  addLog: (entry: Omit<LogEntry, "at">) => void;
  clearLogs: () => void;
  savePreset: (name: string) => string;
  applyPreset: (id: string) => void;
  deletePreset: (id: string) => void;
};

const KEY = "pump-acoustic-settings-v2";
const PRESET_KEY = "pump-acoustic-presets-v1";

const DEFAULTS: Data = {
  source: "demo",
  pumpType: "centrifugal",
  model: "CDL 32-30",
  scenario: "healthy",
  pole: 2,
  gridHz: 50,
  rpm: 2800,
  rpmAuto: true,
  blades: 6,
  flow: 30,
  flowUnit: "m3h",
  actualFlow: 30,
  head: 30,
  npsh: 2.5,
  clearance: 0.15,
  distance: 0.5,
  micDir: "正对泵体",
  ratedPower: 4,
  voltage: 380,
  ratedCurrent: 8.1,
  actualCurrent: 8.1,
  weighting: "A",
  mode: "simple",
  splAt0: 120,
  calOffset: 0,
  warn: 85,
  danger: 95,
  peakHold: true,
  monitor: true,
  alarms: [],
  logs: [],
};

const PARAM_SPECS: Partial<Record<keyof Data, { label: string; unit?: string; digits?: number }>> = {
  rpm: { label: "运行转速", unit: " r/min", digits: 0 },
  blades: { label: "叶片 / 齿数", digits: 0 },
  flow: { label: "额定流量", unit: " m³/h", digits: 2 },
  actualFlow: { label: "实际流量", unit: " m³/h", digits: 2 },
  head: { label: "额定扬程", unit: " m", digits: 1 },
  npsh: { label: "NPSH 余量", unit: " m", digits: 2 },
  clearance: { label: "叶轮间隙", unit: " mm", digits: 2 },
  distance: { label: "测点距离", unit: " m", digits: 2 },
  ratedPower: { label: "额定功率", unit: " kW", digits: 2 },
  voltage: { label: "额定电压", unit: " V", digits: 0 },
  ratedCurrent: { label: "额定电流", unit: " A", digits: 1 },
  actualCurrent: { label: "实际电流", unit: " A", digits: 1 },
  splAt0: { label: "0 dBFS 校准值（仅校准用）", unit: " dB", digits: 0 },
  calOffset: { label: "校准修正", unit: " dB", digits: 1 },
  warn: { label: "警告阈值", unit: " dB", digits: 0 },
  danger: { label: "危险阈值", unit: " dB", digits: 0 },
  model: { label: "设备型号 / 位号" },
};

function makeLog(level: LogLevel, tag: string, text: string): LogEntry {
  return { at: new Date().toISOString(), level, tag, text };
}

function prependLog(logs: LogEntry[], entry: LogEntry) {
  return [entry, ...logs].slice(0, 80);
}

function fmtValue(key: keyof Data, value: unknown) {
  if (typeof value === "string") return value || "未填写";
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value);
  const spec = PARAM_SPECS[key];
  const digits = spec?.digits ?? 2;
  return `${value.toFixed(digits)}${spec?.unit ?? ""}`;
}

function persist(data: Data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode */
  }
}

function snapshot(s: Settings): Data {
  return {
    source: s.source,
    pumpType: s.pumpType,
    model: s.model,
    scenario: s.scenario,
    pole: s.pole,
    gridHz: s.gridHz,
    rpm: s.rpm,
    rpmAuto: s.rpmAuto,
    blades: s.blades,
    flow: s.flow,
    flowUnit: s.flowUnit,
    actualFlow: s.actualFlow,
    head: s.head,
    npsh: s.npsh,
    clearance: s.clearance,
    distance: s.distance,
    micDir: s.micDir,
    ratedPower: s.ratedPower,
    voltage: s.voltage,
    ratedCurrent: s.ratedCurrent,
    actualCurrent: s.actualCurrent,
    weighting: s.weighting,
    mode: s.mode,
    splAt0: s.splAt0,
    calOffset: s.calOffset,
    warn: s.warn,
    danger: s.danger,
    peakHold: s.peakHold,
    monitor: s.monitor,
    alarms: s.alarms,
    logs: s.logs,
  };
}

function sanitizeLogs(input: unknown): LogEntry[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item): item is Partial<LogEntry> => Boolean(item) && typeof item === "object")
    .map((item): LogEntry => ({
      at: typeof item.at === "string" ? item.at : new Date().toISOString(),
      level: item.level === "alarm" ? "alarm" : item.level === "warn" ? "warn" : "info",
      tag: typeof item.tag === "string" ? item.tag.slice(0, 8) : "系统",
      text: typeof item.text === "string" ? item.text.slice(0, 160) : "",
    }))
    .filter((item) => item.text)
    .slice(0, 80);
}

function sanitize(input: Partial<Data>): Data {
  const next = { ...DEFAULTS, ...input };
  if (next.pumpType !== "centrifugal" && next.pumpType !== "vortex") {
    next.pumpType = "centrifugal";
  }
  const scenario = getScenario(next.scenario);
  if (scenario.pump !== next.pumpType) next.scenario = defaultScenarioFor(next.pumpType).id;
  for (const key of [
    "rpm",
    "blades",
    "flow",
    "actualFlow",
    "head",
    "npsh",
    "clearance",
    "distance",
    "ratedPower",
    "voltage",
    "ratedCurrent",
    "actualCurrent",
    "splAt0",
    "calOffset",
    "warn",
    "danger",
  ] as const) {
    if (!Number.isFinite(next[key])) next[key] = DEFAULTS[key];
  }
  if (next.pole !== 2 && next.pole !== 4) next.pole = DEFAULTS.pole;
  if (next.gridHz !== 50 && next.gridHz !== 60) next.gridHz = DEFAULTS.gridHz;
  if (next.rpm < 100) next.rpm = poleDefaultRpm(next.pole, next.gridHz);
  if (typeof next.rpmAuto !== "boolean") next.rpmAuto = true;
  // 自动模式下以极数/频率为准，顺便修正旧版本存下的 1400 等过期转速
  if (next.rpmAuto) next.rpm = poleDefaultRpm(next.pole, next.gridHz);
  if (next.flow < 0) next.flow = DEFAULTS.flow;
  if (next.actualFlow < 0) next.actualFlow = 0;
  if (next.ratedCurrent <= 0) next.ratedCurrent = DEFAULTS.ratedCurrent;
  if (next.actualCurrent < 0) next.actualCurrent = 0;
  if (next.voltage < 100) next.voltage = DEFAULTS.voltage;
  if (next.flowUnit !== "m3h" && next.flowUnit !== "lmin") next.flowUnit = "m3h";
  if (!MIC_DIRS.includes(next.micDir)) next.micDir = DEFAULTS.micDir;
  if (next.mode !== "simple" && next.mode !== "expert") next.mode = "simple";
  if (!Array.isArray(next.alarms)) next.alarms = [];
  if (!Array.isArray(next.logs)) next.logs = [];
  next.logs = sanitizeLogs(next.logs);
  if (next.warn >= next.danger) next.danger = next.warn + 1;
  return next;
}

function newPresetId() {
  return `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;
}

function toPresetData(data: Data): PresetData {
  return {
    pumpType: data.pumpType,
    model: data.model,
    scenario: data.scenario,
    pole: data.pole,
    gridHz: data.gridHz,
    rpm: data.rpm,
    rpmAuto: data.rpmAuto,
    blades: data.blades,
    flow: data.flow,
    flowUnit: data.flowUnit,
    actualFlow: data.actualFlow,
    head: data.head,
    npsh: data.npsh,
    clearance: data.clearance,
    distance: data.distance,
    micDir: data.micDir,
    ratedPower: data.ratedPower,
    voltage: data.voltage,
    ratedCurrent: data.ratedCurrent,
    actualCurrent: data.actualCurrent,
    weighting: data.weighting,
    mode: data.mode,
    splAt0: data.splAt0,
    calOffset: data.calOffset,
    warn: data.warn,
    danger: data.danger,
    peakHold: data.peakHold,
    monitor: data.monitor,
  };
}

function builtInPresets(): Preset[] {
  return PUMP_TYPES.map((pump) => {
    const healthy = defaultScenarioFor(pump.id);
    const data = toPresetData(
      sanitize({
        ...DEFAULTS,
        pumpType: pump.id,
        model: pump.id === "centrifugal" ? "CDL 32-30" : "W 20-25",
        scenario: healthy.id,
        ...pump.defaults,
        rpm: poleDefaultRpm(DEFAULTS.pole, DEFAULTS.gridHz),
        actualFlow: pump.defaults.flow,
        actualCurrent: pump.defaults.ratedCurrent,
      }),
    );
    return { id: `builtin-${pump.id}`, name: `${pump.name} · 出厂设定`, savedAt: "", data };
  });
}

function sanitizePreset(input: unknown): Preset | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<Preset>;
  if (typeof raw.name !== "string" || !raw.data) return null;
  const data = sanitize(raw.data as Partial<Data>);
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newPresetId(),
    name: raw.name.slice(0, 24),
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : "",
    data: toPresetData(data),
  };
}

function readPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map(sanitizePreset)
          .filter((item): item is Preset => item !== null)
          .slice(0, 20);
      }
    }
  } catch {
    /* 读取失败时回退出厂设定 */
  }
  return builtInPresets();
}

function persistPresets(presets: Preset[]) {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
  } catch {
    /* private mode */
  }
}

export const useSettings = create<Settings>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  presets: [],
  load: () => {
    if (get().loaded) return;
    let next: Data = DEFAULTS;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Data>;
        // 旧版本没有极数/频率字段，统一迁移到 2 极 / 50 Hz 的工程默认转速。
        if (!("pole" in parsed) || !("gridHz" in parsed)) {
          parsed.pole = DEFAULTS.pole;
          parsed.gridHz = DEFAULTS.gridHz;
          parsed.rpm = poleDefaultRpm(DEFAULTS.pole, DEFAULTS.gridHz);
          if (!("actualFlow" in parsed)) parsed.actualFlow = parsed.flow ?? DEFAULTS.flow;
          if (!("ratedCurrent" in parsed)) parsed.ratedCurrent = DEFAULTS.ratedCurrent;
          if (!("actualCurrent" in parsed)) parsed.actualCurrent = parsed.ratedCurrent;
        }
        next = sanitize(parsed);
      }
    } catch {
      next = DEFAULTS;
    }
    if (!next.logs.length) {
      next = {
        ...next,
        logs: [
          makeLog(
            "info",
            "系统",
            `已载入本机配置：${getPumpType(next.pumpType).name}，${next.pole} 极 / ${next.gridHz} Hz，同步转速 ${syncRpm(next.pole, next.gridHz).toFixed(0)} r/min。`,
          ),
        ],
      };
    }
    set({ ...next, loaded: true, presets: readPresets() });
  },
  update: (partial) => {
    // 手动改转速即退出自动跟随；显式传 rpmAuto 时不覆盖
    const changes: Partial<Data> =
      "rpm" in partial && partial.rpmAuto === undefined
        ? { ...partial, rpmAuto: false }
        : partial;
    const before = get();
    set(changes);
    const after = get();
    const entries: LogEntry[] = [];
    for (const key of Object.keys(changes) as (keyof Data)[]) {
      const spec = PARAM_SPECS[key];
      if (!spec || before[key] === after[key]) continue;
      entries.push(makeLog("info", "参数", `${spec.label}：${fmtValue(key, before[key])} → ${fmtValue(key, after[key])}`));
    }
    if (entries.length) {
      set({ logs: [...entries, ...after.logs].slice(0, 80) });
    }
    if (get().loaded) persist(snapshot(get()));
  },
  selectPumpType: (id) => {
    const s = get();
    if (s.pumpType === id) return;
    const profile = getPumpType(id);
    const healthy = defaultScenarioFor(id);
    const rpm = s.rpmAuto ? poleDefaultRpm(s.pole, s.gridHz) : s.rpm;
    const logs = prependLog(
      s.logs,
      makeLog(
        "info",
        "工况",
        `泵型切换为${profile.name}：${s.pole} 极 / ${s.gridHz} Hz，运行转速 ${rpm} r/min，${profile.bladeLabel} ${profile.defaults.blades}，额定电流 ${profile.defaults.ratedCurrent} A。`,
      ),
    );
    set({
      pumpType: id,
      model: id === "centrifugal" ? "CDL 32-30" : "W 20-25",
      scenario: healthy.id,
      source: "demo",
      rpm,
      blades: profile.defaults.blades,
      flow: profile.defaults.flow,
      actualFlow: profile.defaults.flow,
      head: profile.defaults.head,
      npsh: profile.defaults.npsh,
      clearance: profile.defaults.clearance,
      distance: profile.defaults.distance,
      ratedPower: profile.defaults.ratedPower,
      voltage: profile.defaults.voltage,
      ratedCurrent: profile.defaults.ratedCurrent,
      actualCurrent: profile.defaults.ratedCurrent,
      logs,
    });
    if (get().loaded) persist(snapshot(get()));
  },
  selectScenario: (id) => {
    const s = get();
    const scenario = getScenario(id);
    if (scenario.pump !== s.pumpType) return;
    if (s.scenario === id && s.source === "demo") return;
    const f0 = s.rpm / 60;
    const bpf = f0 * Math.max(1, s.blades);
    const nominal = targetDbFor(scenario.targetDb, s.rpm, s.actualCurrent / Math.max(0.1, s.ratedCurrent));
    const logs = prependLog(
      s.logs,
      makeLog(
        "info",
        "工况",
        `切换演示工况“${scenario.name}”（${scenario.severity}）：名义声级 ${nominal.toFixed(1)} dB，1× ${f0.toFixed(1)} Hz，${getPumpType(s.pumpType).bpfLabel} ${bpf.toFixed(1)} Hz，2×工频 ${2 * s.gridHz} Hz。`,
      ),
    );
    set({ source: "demo", scenario: id, logs });
    if (get().loaded) persist(snapshot(get()));
  },
  setPole: (pole) => {
    const s = get();
    if (s.pole === pole) return;
    const rpm = s.rpmAuto ? poleDefaultRpm(pole, s.gridHz) : s.rpm;
    const sync = syncRpm(pole, s.gridHz);
    const logs = prependLog(
      s.logs,
      makeLog(
        "info",
        "工况",
        `电机极数 ${s.pole} → ${pole} 极：同步转速 ${sync.toFixed(0)} r/min，${s.rpmAuto ? `运行转速 ${rpm} r/min` : `运行转速保留手动值 ${rpm} r/min`}，滑差 ${(((sync - rpm) / sync) * 100).toFixed(1)}%，全部案例参考频率已重算。`,
      ),
    );
    set({ pole, rpm, logs });
    if (get().loaded) persist(snapshot(get()));
  },
  setGrid: (gridHz) => {
    const s = get();
    if (s.gridHz === gridHz) return;
    const rpm = s.rpmAuto ? poleDefaultRpm(s.pole, gridHz) : s.rpm;
    const sync = syncRpm(s.pole, gridHz);
    const logs = prependLog(
      s.logs,
      makeLog(
        "info",
        "电网",
        `电网频率 ${s.gridHz} → ${gridHz} Hz：同步转速 ${sync.toFixed(0)} r/min，${s.rpmAuto ? `运行转速 ${rpm} r/min` : `运行转速保留手动值 ${rpm} r/min`}，2×工频 ${2 * gridHz} Hz，案例名义声级随之更新。`,
      ),
    );
    set({ gridHz, rpm, logs });
    if (get().loaded) persist(snapshot(get()));
  },
  setActualCurrent: (amps) => {
    const s = get();
    const rated = Math.max(0.1, s.ratedCurrent);
    const value = clampNum(amps, 0, rated * 2.5);
    const load = value / rated;
    const flow = Math.round(s.flow * load * 100) / 100;
    const logs = prependLog(
      s.logs,
      makeLog(
        "info",
        "工况",
        `实际电流 ${s.actualCurrent.toFixed(1)} → ${value.toFixed(1)} A，负载率 ${(load * 100).toFixed(0)}%，实际流量按泵特性联动为 ${flow.toFixed(2)} m³/h。`,
      ),
    );
    set({ actualCurrent: value, actualFlow: flow, logs });
    if (get().loaded) persist(snapshot(get()));
  },
  setActualFlow: (m3h) => {
    const s = get();
    const ratedFlow = Math.max(0.01, s.flow);
    const value = clampNum(m3h, 0, ratedFlow * 2.5);
    const ratio = value / ratedFlow;
    const current = Math.round(s.ratedCurrent * ratio * 10) / 10;
    const logs = prependLog(
      s.logs,
      makeLog(
        "info",
        "工况",
        `实际流量 ${s.actualFlow.toFixed(2)} → ${value.toFixed(2)} m³/h（额定点的 ${(ratio * 100).toFixed(0)}%），实际电流联动为 ${current.toFixed(1)} A。`,
      ),
    );
    set({ actualFlow: value, actualCurrent: current, logs });
    if (get().loaded) persist(snapshot(get()));
  },
  estimateRatedCurrent: () => {
    const s = get();
    const amps = estimateCurrent(s.ratedPower, s.voltage, s.pole);
    const ratio = s.ratedCurrent > 0 ? s.actualCurrent / s.ratedCurrent : 1;
    const actual = Math.round(amps * clampNum(ratio, 0.2, 2) * 10) / 10;
    const logs = prependLog(
      s.logs,
      makeLog(
        "info",
        "参数",
        `按 ${s.ratedPower.toFixed(1)} kW / ${s.voltage.toFixed(0)} V / ${s.pole} 极估算额定电流 ${s.ratedCurrent.toFixed(1)} → ${amps.toFixed(1)} A，实际电流按原负载率调整为 ${actual.toFixed(1)} A。`,
      ),
    );
    set({ ratedCurrent: amps, actualCurrent: actual, logs });
    if (get().loaded) persist(snapshot(get()));
  },
  pushAlarm: (alarm) => {
    const logs = prependLog(
      get().logs,
      makeLog("alarm", "阈值", `越过危险阈值：${alarm.db.toFixed(1)} dB · ${alarm.note}`),
    );
    set({ alarms: [alarm, ...get().alarms].slice(0, 12), logs });
    if (get().loaded) persist(snapshot(get()));
  },
  clearAlarms: () => {
    set({ alarms: [] });
    if (get().loaded) persist(snapshot(get()));
  },
  addLog: (entry) => {
    const logs = prependLog(get().logs, makeLog(entry.level, entry.tag, entry.text));
    set({ logs });
    if (get().loaded) persist(snapshot(get()));
  },
  clearLogs: () => {
    set({ logs: [] });
    if (get().loaded) persist(snapshot(get()));
  },
  savePreset: (name) => {
    const state = get();
    const label = (name.trim() || `${getPumpType(state.pumpType).name} · ${state.model}`).slice(0, 24);
    const data = toPresetData(snapshot(state));
    const existing = state.presets.find((item) => item.name === label);
    const id = existing ? existing.id : newPresetId();
    const preset: Preset = { id, name: label, savedAt: new Date().toISOString(), data };
    const presets = existing
      ? state.presets.map((item) => (item.id === existing.id ? preset : item))
      : [preset, ...state.presets].slice(0, 20);
    set({ presets });
    persistPresets(presets);
    return id;
  },
  applyPreset: (id) => {
    const preset = get().presets.find((item) => item.id === id);
    if (!preset) return;
    const data = sanitize({ ...preset.data, alarms: [], source: get().source, logs: get().logs });
    set({ ...data });
    if (get().loaded) persist(snapshot(get()));
  },
  deletePreset: (id) => {
    const presets = get().presets.filter((item) => item.id !== id);
    set({ presets });
    persistPresets(presets);
  },
}));
