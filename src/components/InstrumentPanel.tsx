/**
 * 主界面容器 —— 按 PRD 07 视觉设计
 *
 * 结构：
 *  ┌──────────────────────────────┐
 *  │ 顶部：状态条 + 质量微灯 + 设置 │  ← 可读不可点，唯一设置在右上角
 *  ├──────────────────────────────┤
 *  │                              │
 *  │ 仪表台模块（wave/spectrum/   │  ← 默认 3 个，可配置
 *  │  quality）按顺序排列          │
 *  │                              │
 *  ├──────────────────────────────┤
 *  │ CaptureBar（主操作按钮 64px） │  ← 拇指区
 *  └──────────────────────────────┘
 *
 * 性能约束：
 *  - Canvas 模块各自 rAF，不触发 React 重渲染
 *  - DOM 模块只在字段变化时重渲染（useReadoutSelector）
 *  - 切换用 160ms cubic-bezier(.2,.7,.2,1) 淡入位移 4px
 */
import { useEffect, useRef, useState, type ComponentType } from "react";
import { useUi } from "../store/ui";
import { engine } from "../audio/engine.ts";
import { useReadoutSelector } from "../hooks/useReadout.ts";
import WaveModule from "./modules/WaveModule.tsx";
import SpectrumModule from "./modules/SpectrumModule.tsx";
import QualityModule from "./modules/QualityModule.tsx";
import CaptureBar from "./CaptureBar.tsx";

const MODULES: Record<string, ComponentType> = {
  wave: WaveModule,
  spectrum: SpectrumModule,
  quality: QualityModule,
};

/** 计时 4Hz（250ms 节流）—— PRD §5.3 */
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

/**
 * 呼吸点 —— 纯 CSS animation（PRD §2.6）
 * 2.4s 循环，opacity 0.55↔1，不改尺寸，零 JS 开销
 */
function BreathDot() {
  return (
    <span
      className="breath-dot"
      aria-hidden="true"
      style={{
        background: "var(--brass)",
        width: 8,
        height: 8,
        borderRadius: "50%",
        animation: "breath 2.4s ease-in-out infinite",
      }}
    />
  );
}

export function InstrumentPanel() {
  const { modules, view, setView, toggleTheme, theme } = useUi();
  const state = useReadoutSelector((r) => r.state);
  const elapsed = useElapsed();

  // 首帧后淡入（结果页进入 200ms —— PRD §2.6）
  const mountedRef = useRef(false);
  const [enter, setEnter] = useState(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      const id = window.setTimeout(() => setEnter(true), 30);
      return () => window.clearTimeout(id);
    }
  }, [view]);

  const showSettings = () => setView("settings");

  const stateLabel = state === "idle" ? "待命" : state === "capturing" ? "采集中" : "已结束";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--paper)",
        color: "var(--ink)",
        transition: "transform 200ms var(--ease), opacity 200ms var(--ease)",
        transform: enter ? "translateY(0)" : "translateY(8px)",
        opacity: enter ? 1 : 0,
      }}
    >
      {/* === 顶部状态条 === */}
      <header
        style={{
          padding: "var(--s4) var(--page-x) var(--s3)",
          borderBottom: "var(--hair) solid var(--line)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
          <BreathDot />
          <span
            style={{
              fontSize: "var(--fs-xs)",
              color: "var(--mist)",
              letterSpacing: "0.1em",
            }}
          >
            听诊仪
          </span>
          <span
            style={{
              fontSize: "var(--fs-xs)",
              color: "var(--mist)",
            }}
          >
            · {stateLabel}
          </span>
        </div>
        <div style={{ display: "flex", gap: "var(--s2)", alignItems: "center" }}>
          <span
            style={{
              fontSize: "var(--fs-xs)",
              color: "var(--mist)",
              border: "var(--hair) solid var(--line)",
              padding: "2px var(--s2)",
              borderRadius: "var(--r-chip)",
              userSelect: "none",
            }}
            onClick={toggleTheme}
            role="button"
            tabIndex={0}
          >
            {theme === "light" ? "暗" : "亮"}
          </span>
          <button
            aria-label="设置"
            onClick={showSettings}
            style={{
              width: 44,
              height: 44,
              border: "var(--hair) solid var(--line)",
              borderRadius: "var(--r-chip)",
              background: "transparent",
              color: "var(--ink)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--fs-h2)",
            }}
          >
            ⚙
          </button>
        </div>
      </header>

      {/* === 仪表台区域 === */}
      <main
        style={{
          flex: 1,
          padding: "var(--s3) var(--page-x)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--s3)",
        }}
      >
        {/* 模块容器，带切换动效 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--s3)",
          }}
        >
          {modules.map((modId) => {
            const Comp = MODULES[modId];
            if (!Comp) return null;
            return (
              <div
                key={modId}
                style={{
                  animation: "fadeIn 160ms var(--ease)",
                }}
              >
                <Comp />
              </div>
            );
          })}
        </div>

        {/* 采集计时（采集中显示在仪表台底部） */}
        {state === "capturing" && (
          <div
            className="mono"
            style={{
              textAlign: "center",
              fontSize: "var(--fs-mono-lg)",
              color: "var(--ink)",
              padding: "var(--s2)",
            }}
          >
            {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
            {String(elapsed % 60).padStart(2, "0")}
          </div>
        )}
      </main>

      {/* === 底部操作栏（拇指区） === */}
      <footer
        style={{
          padding: "var(--s2) var(--page-x) var(--s5)",
          borderTop: "var(--hair) solid var(--line)",
        }}
      >
        <CaptureBar />
      </footer>

      {/* 模块切换 keyframes（只动 opacity + 4px 位移，不动缩放） */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes breath {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
