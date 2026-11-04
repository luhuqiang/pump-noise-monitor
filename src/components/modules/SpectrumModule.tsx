/**
 * 频谱模块 —— 1/3oct 25 带（31.5 Hz–8 kHz）竖条。
 *
 * PRD 5.2 Canvas 分层：
 *   L3（静态）= 坐标轴 + 频率刻度 → resize 时建 OffscreenCanvas
 *   L2（动态）= 25 条竖条 → 30fps 绘制（脏标记可优化差异区域）
 *
 * PRD 5.1：频谱 dBFS 映射 −85…−30 dBFS。
 * PRD 5.2：单帧 ≤ 6ms；visibilitychange 停 rAF。
 */
import { useEffect, useRef } from "react";
import { engine } from "../../audio/engine.ts";
import { useUi } from "../../store/ui";
import { getColors, setupCanvas, StaticLayerManager } from "./canvas-util.ts";

const BAND_LABELS = ["31.5", "63", "125", "250", "500", "1k", "2k", "4k", "8k"];
// PRD 5.1: 频谱条颜色映射
const DB_LO = -85;
const DB_HI = -30;

export default function SpectrumModule() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<StaticLayerManager | null>(null);

  // theme 变化时重建 L3 静态层
  const theme = useUi((s) => s.theme);
  useEffect(() => {
    layerRef.current?.markDirty();
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    let running = true;
    let last = 0;

    // 只在 rAF 开始时量一次尺寸，避免每帧 getBoundingClientRect
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      return { w: rect.width, h: rect.height };
    };

    const { w: initW, h: initH } = measure();

    const paintStatic = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const c = getColors();
      // 频率刻度（底部）
      ctx.fillStyle = c.mist;
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const bands = engine.readout.bands.length || 25;
      const gap = 2;
      const barW = (w - gap * (bands - 1)) / bands;
      const labelStep = Math.ceil(bands / BAND_LABELS.length);
      for (let i = 0; i < BAND_LABELS.length; i++) {
        const idx = i * labelStep;
        if (idx >= bands) break;
        const x = idx * (barW + gap) + barW / 2;
        ctx.fillText(BAND_LABELS[i]!, x, h - 2);
      }
      // dBFS 标尺（左侧）
      ctx.fillStyle = c.mist;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const dbTicks = [-30, -50, -70];
      for (const db of dbTicks) {
        const y = h * (1 - (db - DB_LO) / (DB_HI - DB_LO));
        ctx.fillText(`${db}`, 2, y);
        // 水平参考线
        ctx.strokeStyle = c.line;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };

    layerRef.current = new StaticLayerManager(initW, initH, paintStatic);

    const draw = (t: number) => {
      if (!running) return;
      // 30fps 节流（PRD 5.1: 绘制 ≤30fps）
      if (t - last < 33) {
        raf = requestAnimationFrame(draw);
        return;
      }
      last = t;

      const { w, h } = measure();
      const ctx = setupCanvas(canvas, w, h);

      // L3 静态层
      layerRef.current!.blit(ctx);

      // L2 动态频谱条
      const c = getColors();
      const bands = engine.readout.bands;
      const n = bands.length || 25;
      const gap = 2;
      const barW = (w - gap * (n - 1)) / n;

      for (let i = 0; i < n; i++) {
        const db = bands[i] ?? -120;
        const clamped = Math.max(DB_LO, Math.min(DB_HI, db));
        const norm = (clamped - DB_LO) / (DB_HI - DB_LO);
        const barH = norm * (h - 16); // 留底部标签空间
        const x = i * (barW + gap);
        const y = h - barH - 14; // 底部 ~14px 标签
        ctx.fillStyle = c.ink;
        ctx.fillRect(x, y, barW, barH);
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        running = false;
        cancelAnimationFrame(raf);
      } else {
        running = true;
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="panel" style={{ padding: "var(--s3)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--s2)",
        }}
      >
        <span style={{ fontSize: "var(--fs-h2)", fontWeight: 500 }}>频谱</span>
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--mist)" }}>
          31.5 Hz – 8 kHz
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: 120,
          border: "var(--hair) solid var(--line)",
          display: "block",
        }}
      />
    </div>
  );
}
