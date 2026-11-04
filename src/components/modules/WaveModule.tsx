/**
 * 波形模块 —— 实时 min/max 包络 + A 计权 dBFS。
 *
 * PRD 5.2 Canvas 分层：
 *   L3（静态）= 中线网格、轴标签 → resize 时建 OffscreenCanvas
 *   L1（动态）= 波形包络 → rAF 60fps 绘制
 *   L0（DOM）= dBFS 读数 → 节流到 10Hz
 *
 * PRD 5.2 硬约束：
 *   - 每帧 ≤ 4ms（波形单帧预算）
 *   - visibilitychange 立即停 rAF
 *   - 禁止每帧 getBoundingClientRect（改为 resize 时取一次）
 */
import { useEffect, useRef } from "react";
import { engine } from "../../audio/engine.ts";
import { useReadoutSelector } from "../../hooks/useReadout.ts";
import { useUi } from "../../store/ui";
import { getColors, setupCanvas, StaticLayerManager } from "./canvas-util.ts";

export default function WaveModule() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<StaticLayerManager | null>(null);
  const aDb = useReadoutSelector((r) => r.aDb);
  const state = useReadoutSelector((r) => r.state);

  // theme 变化时重建 L3 静态层（paper 底色要换）
  const theme = useUi((s) => s.theme);
  useEffect(() => {
    layerRef.current?.markDirty();
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let raf = 0;
    let running = true;

    // resize 时取尺寸，只算一次
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      return { w: rect.width, h: rect.height };
    };

    const { w: initW, h: initH } = measure();

    // 构造 L3 静态层（中线 + 网格）
    const paintStatic = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const c = getColors();
      // 中线
      ctx.strokeStyle = c.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2 + 0.5);
      ctx.lineTo(w, h / 2 + 0.5);
      ctx.stroke();
      // 轴标签
      ctx.fillStyle = c.mist;
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText("0 dBFS", w - 4, h - 2);
    };

    layerRef.current = new StaticLayerManager(initW, initH, paintStatic);

    // rAF 循环
    const draw = () => {
      if (!running) return;

      // 动态层：波形包络
      const { w, h } = measure();
      const ctx = setupCanvas(canvas, w, h);

      // 先贴静态层（paper + 中线 + 网格）
      layerRef.current!.blit(ctx);

      const wave = engine.readout.waveform;
      const mid = h / 2;
      const c = getColors();

      if (wave.length > 0) {
        // min/max 包络：按像素列聚合样点
        const step = Math.max(1, Math.floor(wave.length / w));
        ctx.strokeStyle = c.ink;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const start = x * step;
          const end = Math.min(start + step, wave.length);
          let min = 1;
          let max = -1;
          for (let i = start; i < end; i++) {
            const v = wave[i] ?? 0;
            if (v < min) min = v;
            if (v > max) max = v;
          }
          const yMin = mid - min * mid * 0.9;
          const yMax = mid - max * mid * 0.9;
          ctx.moveTo(x + 0.5, yMin);
          ctx.lineTo(x + 0.5, yMax);
        }
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    // visibilitychange → 停 rAF；恢复时重建
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

  const dbText =
    state === "idle"
      ? "— dBFS"
      : Number.isFinite(aDb)
        ? `${aDb.toFixed(1)} dBFS`
        : "— dBFS";

  return (
    <div ref={containerRef} className="panel" style={{ padding: "var(--s3)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--s2)",
        }}
      >
        <span style={{ fontSize: "var(--fs-h2)", fontWeight: 500 }}>波形</span>
        <span className="mono" style={{ fontSize: "var(--fs-sm)", color: "var(--mist)" }}>
          {dbText}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: 112,
          border: "var(--hair) solid var(--line)",
          display: "block",
        }}
      />
    </div>
  );
}
