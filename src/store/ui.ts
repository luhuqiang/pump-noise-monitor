import { create } from "zustand";

/** 仪表台模块 ID */
export type ModuleId =
  | "wave"
  | "spectrum"
  | "quality"
  | "order"
  | "trend"
  | "event";

/** 三态 */
export type TriState = "ok" | "low" | "invalid";

/** 页面视图 */
export type View = "guide" | "idle" | "capturing" | "result" | "settings";

/** 底部 sheet 类型 */
export type SheetId = "mods" | "points" | "abort" | null;

/** 测点 */
export type PointInfo = {
  id: string;
  name: string;
  desc: string;
  /** 摆位指纹（4–8k / 1–2k 能量比） */
  fp: string;
};

const DEFAULT_POINTS: PointInfo[] = [
  { id: "p1", name: "泵壳正前 0.30m", desc: "水平正对，距壳 0.30m", fp: "4–8k / 1–2k · 0.87" },
  { id: "p2", name: "联轴器侧 0.35m", desc: "护罩外侧，避开旋转部件", fp: "4–8k / 1–2k · 0.74" },
  { id: "p3", name: "出口阀后 0.50m", desc: "管路近场，背景噪声偏高", fp: "4–8k / 1–2k · 0.61" },
];

interface UiState {
  /** 当前视图 */
  view: View;
  /** 是否完成首次引导 */
  guideDone: boolean;
  /** 深浅主题 */
  theme: "light" | "dark";
  /** 仪表台模块顺序（最多 3 个） */
  modules: ModuleId[];
  /** 当前三态结果 */
  state: TriState;
  /** 测点列表（最近 3 个 + 新建） */
  points: PointInfo[];
  /** 当前测点 id */
  currentPoint: string;
  /** 当前打开的底部 sheet */
  sheet: SheetId;
  /** toast 文案（空串=隐藏） */
  toast: string;
  setView: (v: View) => void;
  setGuideDone: () => void;
  /** 设置页「重看引导」：清标记并进入引导 */
  replayGuide: () => void;
  toggleTheme: () => void;
  setTheme: (t: "light" | "dark") => void;
  setModules: (m: ModuleId[]) => void;
  setState: (s: TriState) => void;
  setPoint: (id: string) => void;
  addPoint: (p: PointInfo) => void;
  setSheet: (s: SheetId) => void;
  showToast: (msg: string) => void;
}

const GUIDE_KEY = "tzp.guide.v1";
const THEME_KEY = "tzp.theme.v1";
const MODULES_KEY = "tzp.modules.v1";
const POINTS_KEY = "tzp.points.v1";
const POINT_KEY = "tzp.point.v1";

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** 模块固定顺序（切换 sheet 按此排序） */
export const MODULE_ORDER: ModuleId[] = ["wave", "spectrum", "quality", "order", "trend", "event"];

export const MODULE_META: Record<ModuleId, { name: string; src: string; rate: string }> = {
  wave: { name: "波形", src: "capture.acquire · 48k mono", rate: "60fps 绘制 / 30Hz 数据" },
  spectrum: { name: "频谱", src: "spectrum.compute · FFT 32768", rate: "≤30fps" },
  quality: { name: "质量灯", src: "quality.evaluate", rate: "2Hz" },
  order: { name: "阶次", src: "orders.track · 1×–5×", rate: "10Hz" },
  trend: { name: "趋势", src: "baseline.compare · ready 才显示", rate: "1Hz" },
  event: { name: "事件轨", src: "events.detect · 4096 点帧", rate: "8Hz" },
};

export const useUi = create<UiState>((set) => ({
  view: load(GUIDE_KEY, false) ? "idle" : "guide",
  guideDone: load(GUIDE_KEY, false),
  theme: load(THEME_KEY, "light"),
  modules: load<ModuleId[]>(MODULES_KEY, ["wave", "spectrum", "quality"]),
  state: "ok",
  points: load<PointInfo[]>(POINTS_KEY, DEFAULT_POINTS),
  currentPoint: load<string>(POINT_KEY, "p1"),
  sheet: null,
  toast: "",
  setView: (v) => set({ view: v }),
  setGuideDone: () => {
    localStorage.setItem(GUIDE_KEY, JSON.stringify(true));
    set({ guideDone: true, view: "idle" });
  },
  replayGuide: () => {
    localStorage.removeItem(GUIDE_KEY);
    set({ guideDone: false, view: "guide" });
  },
  toggleTheme: () =>
    set((s) => {
      const theme = s.theme === "light" ? "dark" : "light";
      localStorage.setItem(THEME_KEY, JSON.stringify(theme));
      return { theme };
    }),
  setModules: (m) => {
    const sorted = [...m].sort(
      (a, b) => MODULE_ORDER.indexOf(a) - MODULE_ORDER.indexOf(b),
    );
    localStorage.setItem(MODULES_KEY, JSON.stringify(sorted));
    set({ modules: sorted });
  },
  setTheme: (t) => {
    localStorage.setItem(THEME_KEY, JSON.stringify(t));
    set({ theme: t });
  },
  setState: (s) => set({ state: s }),
  setPoint: (id) => {
    localStorage.setItem(POINT_KEY, JSON.stringify(id));
    set({ currentPoint: id });
  },
  addPoint: (p) => {
    set((s) => {
      const points = [...s.points, p];
      localStorage.setItem(POINTS_KEY, JSON.stringify(points));
      localStorage.setItem(POINT_KEY, JSON.stringify(p.id));
      return { points, currentPoint: p.id };
    });
  },
  setSheet: (sheet) => set({ sheet }),
  showToast: (msg) => set({ toast: msg }),
}));
