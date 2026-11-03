import { useRef, useState } from "react";
import { useUi } from "../store/ui";
import { engine } from "../audio/engine.ts";
import { useReadoutSelector } from "../hooks/useReadout.ts";

/**
 * 主操作栏：开始听诊 / 长按结束采集。
 * 主按钮高 64，距底 24，位于拇指区（y ≥ 565）。
 * 结束采集需长按 ≥800ms，提前松手取消。
 */
export default function CaptureBar() {
  const { view, setView, setState } = useUi();
  const [holdProgress, setHoldProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const holdRef = useRef<number | null>(null);

  const elapsed = useReadoutSelector((r) => Math.floor(r.elapsed));

  const isCapturing = view === "capturing";

  const handleStart = async () => {
    setError(null);
    try {
      await engine.start();
      setView("capturing");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes("denied") ? "麦克风权限被拒绝，请在系统设置中开启" : msg);
    }
  };

  const handleHoldStart = () => {
    if (!isCapturing) return;
    let p = 0;
    holdRef.current = window.setInterval(() => {
      p += (100 / 800) * 50;
      if (p >= 100) {
        if (holdRef.current) clearInterval(holdRef.current);
        engine.stop();
        const diag = engine.readout.diagnosis;
        setState(diag?.status ?? "low");
        setView("result");
      } else {
        setHoldProgress(p);
      }
    }, 50);
  };

  const handleHoldEnd = () => {
    if (holdRef.current) {
      clearInterval(holdRef.current);
      holdRef.current = null;
    }
    setHoldProgress(0);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div
      style={{
        paddingBottom: "var(--dock-gap)",
        paddingTop: "var(--s3)",
        borderTop: "var(--hair) solid var(--line)",
      }}
    >
      {error && (
        <div
          style={{
            fontSize: "var(--fs-xs)",
            color: "var(--bad)",
            marginBottom: "var(--s2)",
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}
      {isCapturing ? (
        <div style={{ position: "relative" }}>
          <button
            className="primary-btn"
            onPointerDown={handleHoldStart}
            onPointerUp={handleHoldEnd}
            onPointerLeave={handleHoldEnd}
            style={{ position: "relative", overflow: "hidden" }}
          >
            <span className="mono" style={{ fontSize: "var(--fs-mono-lg)" }}>
              {formatTime(elapsed)}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
              长按结束
              <span
                className="dot"
                style={{ background: "var(--brass)", width: 12, height: 12 }}
              />
            </span>
          </button>
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              height: 2,
              width: `${holdProgress}%`,
              background: "var(--brass)",
              transition: "width 50ms linear",
            }}
          />
        </div>
      ) : (
        <button className="primary-btn" onClick={handleStart}>
          <span>开始听诊</span>
          <span className="dot" style={{ background: "var(--paper)", width: 12, height: 12 }} />
        </button>
      )}
    </div>
  );
}
