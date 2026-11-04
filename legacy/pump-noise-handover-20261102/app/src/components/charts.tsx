import { useEffect, useRef, useState } from "react";
import { THIRD_OCTAVE } from "@/lib/audio/bands";
import { drawSpectrum, drawTrend, drawWaterfall } from "@/lib/audio/draw";
import { engine } from "@/lib/audio/engine";
import { getPumpType } from "@/lib/audio/scenarios";
import { useSettings } from "@/lib/settings";
import { clamp, cn, fmtDb, fmtHz } from "@/lib/utils";
import { Panel, controlClass, controlOn } from "@/components/panel";
import { useFrame } from "@/components/use-frame";

export function SpectrumView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frac = useRef<number | null>(null);
  const hoverText = useRef("指向频谱查看频率");
  const [hover, setHover] = useState<string>("指向频谱查看频率");
  const peakHold = useSettings((s) => s.peakHold);
  const update = useSettings((s) => s.update);
  const rpm = useSettings((s) => s.rpm);
  const blades = useSettings((s) => s.blades);
  const pumpType = useSettings((s) => s.pumpType);
  const bpfLabel = getPumpType(pumpType).bpfLabel;

  useEffect(() => {
    let id = 0;
    const loop = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const hit = drawSpectrum(
          canvas,
          engine.displayDb,
          peakHold ? engine.peakDb : null,
          engine.sampleRate,
          engine.fftSize,
          0,
          rpm,
          blades,
          frac.current,
          bpfLabel,
        );
        if (hit && frac.current !== null) {
          const label = `${fmtHz(hit.hz)} · ${fmtDb(hit.db)} dBFS`;
          if (hoverText.current !== label) {
            hoverText.current = label;
            setHover(label);
          }
        }
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [peakHold, rpm, blades, bpfLabel]);

  return (
    <Panel
      title="频谱"
      hint="对数频率 · 实线为实时 · 黄线为峰值保持"
      action={
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={peakHold}
            className={cn(controlClass, "px-3", peakHold && controlOn)}
            onClick={() => update({ peakHold: !peakHold })}
          >
            峰值保持
          </button>
          <button type="button" className={controlClass} onClick={() => engine.resetPeak()}>
            清除
          </button>
        </div>
      }
    >
      <div className="px-2 pb-2">
        <canvas
          ref={canvasRef}
          className="block h-52 w-full cursor-crosshair rounded-lg bg-bg"
          aria-label="频谱"
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            frac.current = (event.clientX - rect.left) / Math.max(1, rect.width);
          }}
          onPointerLeave={() => {
            frac.current = null;
            hoverText.current = "指向频谱查看频率";
            setHover("指向频谱查看频率");
          }}
        />
        <p className="mt-2 font-mono text-xs text-muted">{hover}</p>
      </div>
    </Panel>
  );
}

export function WaterfallView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let id = 0;
    const loop = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        drawWaterfall(
          canvas,
          engine.waterfall,
          engine.waterfallCols,
          engine.waterfallRows,
          engine.waterfallHead,
          0,
          engine.readout.running,
        );
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <Panel title="瀑布图" hint="最新在上方 · 横轴 20 Hz 到 20 kHz · 颜色越亮相对声级越高">
      <div className="px-2 pb-2">
        <canvas ref={canvasRef} className="block h-44 w-full rounded-lg bg-bg" aria-label="瀑布图" />
        <div className="mt-1 flex justify-between px-1 font-mono text-xs text-muted">
          <span>20 Hz</span>
          <span>1 kHz</span>
          <span>20 kHz</span>
        </div>
      </div>
    </Panel>
  );
}

export function OctaveView() {
  const tick = useFrame(100);
  void tick;
  const splAt0 = useSettings((s) => s.splAt0);
  const warn = useSettings((s) => s.warn);
  const danger = useSettings((s) => s.danger);
  const floor = -100;
  const warnDbfs = warn - splAt0;
  const dangerDbfs = danger - splAt0;

  return (
    <Panel title="三分之一倍频程" hint="按 IEC 61260 标称中心频率合成 · 相对声级 dBFS">
      <div className="px-2 pb-2">
        <div className="flex h-40 items-end gap-px rounded-lg bg-bg px-2 pt-3">
          {THIRD_OCTAVE.map((band, index) => {
            const db = engine.octaveDb[index] ?? Number.NaN;
            const pct = Number.isFinite(db) ? clamp(((db - floor) / 100) * 100, 0, 100) : 0;
            const color = db >= dangerDbfs ? "bg-alarm" : db >= warnDbfs ? "bg-amber" : "bg-signal";
            return (
              <div
                key={band.fc}
                className="flex h-full min-w-0 flex-1 items-end"
                title={`${band.label} · ${fmtDb(db)} dBFS`}
              >
                <div className={cn("w-full rounded-sm", color)} style={{ height: `${pct}%` }} />
              </div>
            );
          })}
        </div>
        <div className="relative mt-1 h-4 font-mono text-xs text-muted">
          {THIRD_OCTAVE.map((band, index) =>
            band.tick ? (
              <span
                key={band.fc}
                className="absolute -translate-x-1/2"
                style={{ left: `${((index + 0.5) / THIRD_OCTAVE.length) * 100}%` }}
              >
                {band.label}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </Panel>
  );
}

export function TrendView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const splAt0 = useSettings((s) => s.splAt0);
  const warn = useSettings((s) => s.warn);
  const danger = useSettings((s) => s.danger);
  const weighting = useSettings((s) => s.weighting);

  useEffect(() => {
    let id = 0;
    const loop = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        drawTrend(canvas, engine.trend, engine.trendHead, engine.trendCount, 0, warn - splAt0, danger - splAt0);
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [splAt0, warn, danger]);

  const name = weighting === "A" ? "LAF" : weighting === "C" ? "LCF" : "LZF";
  return (
    <Panel title="六十秒趋势" hint={`${name} dBFS · 虚线为警告和危险`}>
      <div className="px-2 pb-2">
        <canvas ref={canvasRef} className="block h-32 w-full rounded-lg bg-bg" aria-label="相对声级趋势" />
      </div>
    </Panel>
  );
}
