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
  /** 设置视图 */
  setView: (v: View) => void;
  setGuideDone: () => void;
  toggleTheme: () => void;
  setModules: (m: ModuleId[]) => void;
  setState: (s: TriState) => void;
}

const GUIDE_KEY = "tzp.guide.v1";
const THEME_KEY = "tzp.theme.v1";
const MODULES_KEY = "tzp.modules.v1";

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const useUi = create<UiState>((set) => ({
  view: load(GUIDE_KEY, false) ? "idle" : "guide",
  guideDone: load(GUIDE_KEY, false),
  theme: load(THEME_KEY, "light"),
  modules: load<ModuleId[]>(MODULES_KEY, ["wave", "spectrum", "quality"]),
  state: "ok",
  setView: (v) => set({ view: v }),
  setGuideDone: () => {
    localStorage.setItem(GUIDE_KEY, JSON.stringify(true));
    set({ guideDone: true, view: "idle" });
  },
  toggleTheme: () =>
    set((s) => {
      const theme = s.theme === "light" ? "dark" : "light";
      localStorage.setItem(THEME_KEY, JSON.stringify(theme));
      return { theme };
    }),
  setModules: (m) => {
    localStorage.setItem(MODULES_KEY, JSON.stringify(m));
    set({ modules: m });
  },
  setState: (s) => set({ state: s }),
}));
