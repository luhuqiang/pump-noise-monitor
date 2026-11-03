/**
 * 主界面容器 —— 按 PRD 07 与 prototype/index.html 权威布局
 *
 *  header 行1：Mark 22 +「3号泵 · P-03」+ 设置 56
 *  header 行2：测点按钮（开 P8）+ 只读 chips「单麦 · 48k」「离线 · 模板 v1.0」
 *  仪表台：模块 tab 行（开 P7）+ 质量灯 qlamp + ＋32
 *  下一步：Agent 单行
 *  采集中：cap 布局（计时/chips/提示/测点信息 + 中止文字链）
 *  底部：CaptureBar（开始听诊 / 长按结束 800ms）
 */
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  useUi,
  MODULE_ORDER,
  MODULE_META,
  type ModuleId,
} from "../store/ui";
import { engine } from "../audio/engine.ts";
import { useReadoutSelector } from "../hooks/useReadout.ts";
import { saveDraft } from "../db/local.ts";
import WaveModule from "./modules/WaveModule.tsx";
import SpectrumModule from "./modules/SpectrumModule.tsx";
import QualityModule from "./modules/QualityModule.tsx";
import OrderModule from "./modules/OrderModule.tsx";
import TrendModule from "./modules/TrendModule.tsx";
import EventRailModule from "./modules/EventRailModule.tsx";
import CaptureBar from "./CaptureBar.tsx";
import { MarkIcon, SettingsIcon, PlusIcon } from "./icons";

/** 仪表台同时显示上限（PRD §0.2：默认 3 个，最多 3 个） */
const MAX_MODULES = 3;

const MODULES: Record<ModuleId, ComponentType> = {
  wave: WaveModule,
  spectrum: SpectrumModule,
  quality: QualityModule,
  order: OrderModule,
  trend: TrendModule,
  event: EventRailModule,
};

/** 采集计时 4Hz（250ms 节流）—— PRD §5.3 */
function useElapsed() {
  const [tick, setTick] = useState(0);
  const state = useReadoutSelector((r) => r.state);
  const elapsed = useReadoutSelector((r) => Math.floor(r.elapsed));
  const lastRef = useRef(0);

  useEffect(() => {
    if (state !== "capturing") return;
    const id = window.setInterval(() => {
      const now = Math.floor(engine.readout.elapsed);
      if (now !== lastRef.current) {
        lastRef.current = now;
        setTick((t) => t + 1);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [state]);

  void tick;
  return elapsed;
}

const fmtTime = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function InstrumentPanel() {
  const {
    modules,
    setView,
    setSheet,
    points,
    currentPoint,
    toast,
  } = useUi();
  const state = useReadoutSelector((r) => r.state);
  const qStatus = useReadoutSelector((r) => r.quality.status);
  const elapsed = useElapsed();

  const point = points.find((p) => p.id === currentPoint) ?? points[0];

  // 首帧后淡入（200ms，PRD §2.6）—— 仅挂载一次；view 变化不取消
  const [enter, setEnter] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setEnter(true), 30);
    return () => window.clearTimeout(id);
  }, []);

  const capturing = state === "capturing";

  const qlampDot =
    state === "idle"
      ? "var(--mist)"
      : capturing
        ? "var(--brass)"
        : qStatus === "ok"
          ? "var(--ok)"
          : qStatus === "warn"
            ? "var(--low)"
            : "var(--bad)";
  const qlampText =
    state === "idle" ? "待采集" : capturing ? "采集中" : qStatus === "ok" ? "质量 ok" : qStatus === "warn" ? "不足" : "不可用";

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--paper)",
        color: "var(--ink)",
        transition: "transform 200ms var(--ease), opacity 200ms var(--ease)",
        transform: enter ? "translateY(0)" : "translateY(8px)",
        opacity: enter ? 1 : 0,
      }}
    >
      {/* === header 行1：品牌 + 设备 + 设置 === */}
      <header style={{ borderBottom: "var(--hair) solid var(--line)", padding: "6px var(--page-x) 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 56 }}>
          <MarkIcon size={22} />
          <b style={{ fontSize: 16, fontWeight: 600, letterSpacing: "0.02em" }}>3号泵 · P-03</b>
          <span style={{ flex: 1 }} />
          <button
            aria-label="设置"
            onClick={() => setView("settings")}
            style={{
              width: 56,
              height: 56,
              marginRight: -16,
              display: "grid",
              placeItems: "center",
              color: "var(--ink)",
              borderRadius: "var(--r-chip)",
            }}
          >
            <SettingsIcon size={20} />
          </button>
        </div>
        {/* === header 行2：测点 + 只读 chips === */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2, minHeight: 24 }}>
          <button
            aria-label="切换测点"
            onClick={() => setSheet("points")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--mist)",
              maxWidth: "56%",
              whiteSpace: "nowrap",
              minHeight: 44,
            }}
          >
            <i style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ink)", flex: "none" }} />
            <b style={{ color: "var(--ink)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
              {point?.name ?? "未设测点"}
            </b>
            <span>›</span>
          </button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flex: "none" }}>
            <span className="chip">单麦 · 48k</span>
            <span className="chip">离线 · 模板 v1.0</span>
          </div>
        </div>
      </header>

      {/* === main === */}
      <main style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        {!capturing ? (
          <>
            {/* 仪表台面板 */}
            <div className="panel" style={{ borderLeft: 0, borderRight: 0, borderTop: 0 }}>
              {/* 模块 tab 行 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  height: 44,
                  padding: "0 var(--page-x)",
                  borderBottom: "var(--hair) solid var(--line)",
                }}
              >
                <div role="tablist" aria-label="仪表台模块" style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0, overflow: "hidden" }}>
                  {modules.map((m, i) => (
                    <button
                      key={m}
                      role="tab"
                      aria-selected={i === 0}
                      onClick={() => setSheet("mods")}
                      style={{
                        position: "relative",
                        fontSize: 12,
                        letterSpacing: "0.03em",
                        color: i === 0 ? "var(--ink)" : "var(--mist)",
                        padding: "13px 0",
                        whiteSpace: "nowrap",
                        flex: "none",
                      }}
                    >
                      {MODULE_META[m].name}
                      {i === 0 && (
                        <span style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 2, background: "var(--ink)" }} />
                      )}
                    </button>
                  ))}
                </div>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
                  <button
                    aria-label="质量状态"
                    onClick={() => setSheet("mods")}
                    style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--mist)", padding: "10px 0", minHeight: 44 }}
                  >
                    <i
                      className="dot"
                      style={{
                        width: 7,
                        height: 7,
                        background: qlampDot,
                        animation: capturing ? "breath 2.4s ease-in-out infinite" : "none",
                      }}
                    />
                    <span>{qlampText}</span>
                  </button>
                  <button
                    aria-label="切换模块"
                    onClick={() => setSheet("mods")}
                    style={{
                      width: 44,
                      height: 44,
                      color: "var(--mist)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        border: "var(--hair) solid var(--line)",
                        borderRadius: "var(--r-chip)",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <PlusIcon size={14} />
                    </span>
                  </button>
                </div>
              </div>
              {/* 模块体 */}
              <div style={{ padding: "0 var(--page-x)" }}>
                {modules.slice(0, MAX_MODULES).map((modId) => {
                  const Comp = MODULES[modId];
                  if (!Comp) return null;
                  return (
                    <div
                      key={modId}
                      data-module={modId}
                      style={{
                        animation: "fadeIn 160ms var(--ease)",
                        borderBottom: "var(--hair) solid var(--line)",
                        paddingBottom: "var(--s3)",
                        marginBottom: "var(--s3)",
                      }}
                    >
                      <Comp />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 下一步 */}
            <div style={{ display: "flex", gap: 11, padding: "15px var(--page-x)", alignItems: "flex-start" }}>
              <i className="dot" style={{ width: 10, height: 10, background: "var(--ink)", marginTop: 5, flex: "none" }} />
              <div>
                <div style={{ fontSize: 10.5, color: "var(--mist)", letterSpacing: "0.16em" }}>下一步</div>
                <p style={{ fontSize: 14, lineHeight: 1.6, margin: "3px 0 0" }}>
                  把手机贴到{point?.name ?? "测点"}，稳定 3 秒后开始。
                </p>
                <div style={{ fontSize: 11.5, color: "var(--mist)", marginTop: 4, lineHeight: 1.6 }}>
                  先看质量灯，再看波形；灯不绿就别读结论。
                </div>
              </div>
            </div>
          </>
        ) : (
          /* === 采集中 cap 布局（P2） === */
          <div style={{ padding: "18px var(--page-x) 0" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
              <div className="mono" style={{ fontSize: "var(--fs-display)", lineHeight: 1.05, letterSpacing: "0.02em" }}>
                {fmtTime(elapsed)}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--mist)", display: "flex", alignItems: "center", gap: 6, paddingBottom: 5 }}>
                <i className="dot" style={{ width: 7, height: 7, background: "var(--brass)", animation: "breath 2.4s ease-in-out infinite" }} />
                采集中 · 48k 单通道
              </div>
            </div>
            <div data-module="wave" style={{ marginTop: 12 }}>
              <WaveModule />
            </div>
            <CaptureChips />
            <p style={{ marginTop: 14, fontSize: 13, color: "var(--mist)", lineHeight: 1.7 }}>
              保持不动。手机距泵壳 0.30m，不贴壳、不挡麦克风。
            </p>
            <div style={{ marginTop: 14, borderTop: "var(--hair) solid var(--line)", paddingTop: 12, fontSize: 12, color: "var(--mist)", lineHeight: 1.6 }}>
              <b style={{ color: "var(--ink)", fontWeight: 500 }}>{qlampText === "采集中" ? "质量 ok" : qlampText}</b>
              {" · 本次可判读；结束前请保持工况稳定。"}
            </div>
            <div style={{ marginTop: 16, borderTop: "var(--hair) solid var(--line)" }}>
              {[
                ["工况", "稳态 · 2900 rpm"],
                ["测点", point?.name ?? "—"],
                ["留存", "本地 · 每工况 10 s"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "10px 0", borderBottom: "var(--hair) solid var(--line)", fontSize: 12 }}>
                  <span style={{ color: "var(--mist)", flex: "none" }}>{k}</span>
                  <b className="mono" style={{ marginLeft: "auto", fontWeight: 400, fontSize: 11.5, textAlign: "right" }}>{v}</b>
                </div>
              ))}
            </div>
            {/* 次级动作：中止（文字链，二次确认） */}
            <div style={{ textAlign: "center", padding: "var(--s3) 0" }}>
              <button
                onClick={() => setSheet("abort")}
                style={{ fontSize: "var(--fs-sm)", color: "var(--mist)", padding: "var(--s2) var(--s3)", minHeight: 44 }}
              >
                中止
              </button>
            </div>
          </div>
        )}
      </main>

      {/* === 底部主操作（拇指区） === */}
      <footer style={{ padding: "10px var(--page-x) var(--dock-gap)" }}>
        <CaptureBar />
        <div style={{ marginTop: 9, fontSize: 10.5, color: "var(--mist)", letterSpacing: "0.04em", display: "flex", justifyContent: "space-between" }}>
          <span>{capturing ? "长按 0.8 秒结束 · 松手取消" : "单手持机 · 拇指区内"}</span>
          <span className="mono">{capturing ? "录音中" : "10–120 s"}</span>
        </div>
      </footer>

      <Sheets />
      <Toast msg={toast} />

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes breath {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}

/** 采集中实时指标 chips（10Hz 读数上限，PRD §5.3） */
function CaptureChips() {
  const snr = useReadoutSelector((r) => Math.round(r.snrDb));
  const clip = useReadoutSelector((r) => r.quality.clip);
  const agc = useReadoutSelector((r) => r.quality.agc);
  const sr = useReadoutSelector((r) => r.sampleRate);
  const items: [string, string][] = [
    ["SNR", `${snr} dB`],
    ["削顶", clip ? "削顶" : "0"],
    ["AGC", agc ? "介入" : "未检出"],
    ["采样率", String(sr)],
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
      {items.map(([k, v]) => (
        <span key={k} style={{ fontSize: 11, border: "var(--hair) solid var(--line)", borderRadius: "var(--r-chip)", padding: "3px 7px", color: "var(--mist)" }}>
          {k} <b className="mono" style={{ fontWeight: 500, color: "var(--ink)" }}>{v}</b>
        </span>
      ))}
    </div>
  );
}

/** toast —— 1.5s 自动消失 */
function Toast({ msg }: { msg: string }) {
  const { showToast } = useUi();
  useEffect(() => {
    if (!msg) return;
    const id = window.setTimeout(() => showToast(""), 1500);
    return () => window.clearTimeout(id);
  }, [msg, showToast]);
  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 96,
        transform: `translateX(-50%)`,
        background: "var(--ink)",
        color: "var(--paper)",
        fontSize: 12,
        padding: "8px 12px",
        borderRadius: "var(--r-chip)",
        opacity: msg ? 1 : 0,
        pointerEvents: "none",
        transition: "opacity 160ms",
        zIndex: 60,
        whiteSpace: "nowrap",
      }}
    >
      {msg}
    </div>
  );
}

/* ================= 底部 sheet：P7 模块 / P8 测点 / 中止确认 ================= */

function SheetShell({
  title,
  meta,
  foot,
  onClose,
  children,
}: {
  title: string;
  meta?: string;
  foot?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 45 }}>
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(20,24,22,.34)" }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background: "var(--paper)",
          borderTop: "2px solid var(--ink)",
          padding: "8px var(--page-x) 18px",
          maxHeight: "80%",
          overflowY: "auto",
          animation: "fadeIn 200ms var(--ease)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 0 9px", borderBottom: "var(--hair) solid var(--line)" }}>
          <b style={{ fontSize: 13, fontWeight: 500, letterSpacing: "0.06em" }}>{title}</b>
          {meta && <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--mist)" }}>{meta}</span>}
        </div>
        {children}
        {foot && <div style={{ marginTop: 12, fontSize: 11, color: "var(--mist)", lineHeight: 1.6 }}>{foot}</div>}
      </div>
    </div>
  );
}

function Sheets() {
  const sheet = useUi((s) => s.sheet);
  if (sheet === "mods") return <ModuleSheet />;
  if (sheet === "points") return <PointSheet />;
  if (sheet === "abort") return <AbortSheet />;
  return null;
}

/** P7 模块切换 sheet：最多 3 个，满 3 替换最旧，至少留 1，应用才持久化 */
function ModuleSheet() {
  const { modules, setModules, setSheet, showToast } = useUi();
  const [temp, setTemp] = useState<ModuleId[]>(modules);
  const close = () => setSheet(null);

  const toggle = (k: ModuleId) => {
    const i = temp.indexOf(k);
    let next: ModuleId[];
    if (i > -1) {
      if (temp.length <= 1) {
        showToast("至少保留 1 个模块");
        return;
      }
      next = temp.filter((m) => m !== k);
    } else if (temp.length >= MAX_MODULES) {
      const dropped = temp[0]!;
      next = [...temp.slice(1), k];
      showToast(`已用「${MODULE_META[k].name}」替换「${MODULE_META[dropped].name}」`);
    } else {
      next = [...temp, k];
      showToast(`已加入「${MODULE_META[k].name}」`);
    }
    setTemp([...next].sort((a, b) => MODULE_ORDER.indexOf(a) - MODULE_ORDER.indexOf(b)));
  };

  return (
    <SheetShell
      title="切换仪表台模块"
      meta={`已选 ${temp.length} / ${MAX_MODULES}`}
      foot="默认波形 + 频谱 + 质量灯；最多 3 个，按固定顺序排列。已满时再加入，会替换最早选入的一个。"
      onClose={close}
    >
      {MODULE_ORDER.map((k) => {
        const on = temp.includes(k);
        return (
          <button
            key={k}
            role="checkbox"
            aria-checked={on}
            onClick={() => toggle(k)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "13px 0",
              borderBottom: "var(--hair) solid var(--line)",
              minHeight: 56,
              width: "100%",
              textAlign: "left",
            }}
          >
            <i
              style={{
                width: 18,
                height: 18,
                border: "var(--hair) solid var(--line)",
                borderRadius: "var(--r-chip)",
                display: "grid",
                placeItems: "center",
                fontSize: 11,
                fontStyle: "normal",
                flex: "none",
                ...(on ? { borderColor: "var(--ink)", background: "var(--ink)", color: "var(--paper)" } : {}),
              }}
            >
              {on ? "✓" : ""}
            </i>
            <span style={{ minWidth: 0 }}>
              <b style={{ fontSize: 13, fontWeight: 500, display: "block" }}>{MODULE_META[k].name}</b>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--mist)", display: "block", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {MODULE_META[k].src} · {MODULE_META[k].rate}
              </span>
            </span>
          </button>
        );
      })}
      <button
        className="primary-btn"
        style={{ marginTop: 12, height: 52 }}
        onClick={() => {
          setModules(temp);
          showToast("模块已更新并记住");
          close();
        }}
      >
        <span>应用</span>
        <span className="dot" style={{ background: "var(--paper)", width: 12, height: 12 }} />
      </button>
      <div style={{ textAlign: "center" }}>
        <button onClick={close} style={{ fontSize: "var(--fs-sm)", color: "var(--mist)", padding: "var(--s3)", minHeight: 44 }}>
          取消
        </button>
      </div>
    </SheetShell>
  );
}

/** P8 测点 sheet：最近 3 点 + 摆位指纹，选中即应用 */
function PointSheet() {
  const { points, currentPoint, setPoint, addPoint, setSheet, showToast } = useUi();
  const close = () => setSheet(null);

  const newPoint = () => {
    const n = points.length + 1;
    const p = {
      id: `p${Date.now()}`,
      name: `自定义测点 ${n}`,
      desc: "现场新建 · 未命名几何",
      fp: "4–8k / 1–2k · —",
    };
    addPoint(p);
    showToast(`已新建并切换到「${p.name}」`);
    close();
  };

  return (
    <SheetShell
      title="切换测点"
      meta={`最近 ${Math.min(points.length, 3)} 个`}
      foot="更换测点会改变 baselineKey；不同几何不可比，复测前请确认。"
      onClose={close}
    >
      {points.map((p) => {
        const on = p.id === currentPoint;
        return (
          <button
            key={p.id}
            role="radio"
            aria-checked={on}
            onClick={() => {
              setPoint(p.id);
              showToast(`已切换到「${p.name}」`);
              close();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "13px 0",
              borderBottom: "var(--hair) solid var(--line)",
              minHeight: 56,
              width: "100%",
              textAlign: "left",
            }}
          >
            <i
              style={{
                width: 18,
                height: 18,
                border: "var(--hair) solid var(--line)",
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                fontSize: 11,
                fontStyle: "normal",
                flex: "none",
                ...(on ? { borderColor: "var(--ink)", background: "var(--ink)", color: "var(--paper)" } : {}),
              }}
            >
              {on ? "✓" : ""}
            </i>
            <span style={{ minWidth: 0 }}>
              <b style={{ fontSize: 13, fontWeight: 500, display: "block" }}>{p.name}</b>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--mist)", display: "block", marginTop: 2 }}>
                {p.desc} · 指纹 {p.fp}
              </span>
            </span>
          </button>
        );
      })}
      <button
        onClick={newPoint}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "13px 0",
          minHeight: 56,
          width: "100%",
          textAlign: "left",
          color: "var(--ink)",
          fontSize: 13,
        }}
      >
        <PlusIcon size={16} />
        新建测点
      </button>
    </SheetShell>
  );
}

/** 采集中「中止」二次确认：继续采集 / 丢弃并存草稿 */
function AbortSheet() {
  const { setSheet, setView, showToast } = useUi();
  const close = () => setSheet(null);

  const discard = async () => {
    engine.stop();
    try {
      await saveDraft({
        pointId: useUi.getState().currentPoint,
        elapsed: engine.readout.elapsed,
        sampleRate: engine.readout.sampleRate || 48000,
        status: "draft",
        note: "采集中中止，丢弃音频存草稿",
        diagnosis: null,
      });
      showToast("已存草稿");
    } catch {
      showToast("草稿保存失败，已丢弃");
    }
    close();
    setView("idle");
  };

  return (
    <SheetShell title="中止采集？" meta="二次确认" onClose={close}>
      <button
        onClick={close}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "15px 0",
          borderBottom: "var(--hair) solid var(--line)",
          minHeight: 56,
          fontSize: 14,
          color: "var(--ink)",
        }}
      >
        继续采集
      </button>
      <button
        onClick={discard}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "15px 0",
          minHeight: 56,
          fontSize: 14,
          color: "var(--bad)",
        }}
      >
        丢弃并存草稿
      </button>
    </SheetShell>
  );
}
