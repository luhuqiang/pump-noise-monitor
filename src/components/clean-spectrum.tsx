import { useEffect, useRef, useState } from "react";
import { engine } from "../audio/engine";
import { getPumpType } from "../audio/scenarios";
import { useSettings } from "../lib/settings";
import { fmtHz } from "../lib/utils";
import { drawCleanSpectrum, drawEnvelope, envelopeFreqAt, envelopeHit } from "../audio/draw";
import { createSpectrumTween } from "../audio/tween";
import { Panel } from "./panel";
import { useFrame } from "./use-frame";

export function CleanSpectrumView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frac = useRef<number | null>(null);
  const [hover, setHover] = useState("指向频谱查看频率");
  const rpm = useSettings((s) => s.rpm);
  const blades = useSettings((s) => s.blades);
  const pumpType = useSettings((s) => s.pumpType);
  const bpfLabel = getPumpType(pumpType).bpfLabel;
  const tweens = useRef({ raw: createSpectrumTween(), clean: createSpectrumTween(), noise: createSpectrumTween() });
  const sizeRef = useRef<{ width: number; height: number } | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) sizeRef.current = { width: rect.width, height: rect.height };
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let id = 0;
    const loop = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const now = performance.now();
        const raw = tweens.current.raw.step(engine.rawDb, now);
        const clean = tweens.current.clean.step(engine.cleanDb, now);
        const noise = tweens.current.noise.step(engine.noiseDb, now);
        const shaft = engine.readout.shaft;
        const hit = drawCleanSpectrum(
          canvas,
          raw,
          clean,
          noise,
          engine.analysisSampleRate || engine.sampleRate,
          engine.analysisFftSize || engine.fftSize,
          0,
          rpm,
          blades,
          bpfLabel,
          frac.current,
          sizeRef.current,
          shaft?.subharmonic ? { ratio: shaft.subharmonicRatio } : null,
        );
        if (hit && frac.current !== null) {
          setHover(`降噪后 ${fmtHz(hit.hz)} · ${Number.isFinite(hit.db) ? `${hit.db.toFixed(0)} dBFS` : "—"}`);
        }
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [rpm, blades, bpfLabel]);

  return (
    <Panel title="降噪对比谱" hint="灰线原始 · 橙虚线噪声底 · 绿线降噪后（判决仍用原始谱）">
      <div className="px-2 pb-2">
        <canvas
          ref={canvasRef}
          className="block h-56 w-full cursor-crosshair rounded-lg bg-bg"
          aria-label="降噪前后频谱对比"
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            frac.current = (event.clientX - rect.left) / Math.max(1, rect.width);
          }}
          onPointerLeave={() => {
            frac.current = null;
            setHover("指向频谱查看频率");
          }}
        />
        <p className="mt-2 whitespace-pre-wrap font-mono text-xs text-muted">{hover}</p>
      </div>
    </Panel>
  );
}

export function EnvelopeView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tick = useFrame(250);
  void tick;
  const rpm = useSettings((s) => s.rpm);
  const env = engine.envelope;
  const f0 = Math.max(1, rpm) / 60;
  const matches = env ? [...env.matches].sort((a, b) => b.score - a.score) : [];
  const tween = useRef(createSpectrumTween(170));
  const sizeRef = useRef<{ width: number; height: number } | undefined>(undefined);
  const hoverRef = useRef<number | null>(null);
  const pinRef = useRef<number | null>(null);
  const [hoverHz, setHoverHz] = useState<number | null>(null);
  const [pinnedHz, setPinnedHz] = useState<number | null>(null);

  const shownHz = hoverHz ?? pinnedHz;
  const hit = env && shownHz !== null ? envelopeHit(env, f0, shownHz) : null;
  let readout = "指向或点选包络谱，查看峰值对应的轴承阶次";
  if (hit) {
    const peakText = hit.peak
      ? `峰值 ${hit.peak.hz.toFixed(0)} Hz · ${hit.peak.order.toFixed(2)}×`
      : `光标 ${shownHz!.toFixed(0)} Hz`;
    const dev = hit.deviationPct;
    const sign = dev > 0 ? "+" : "";
    const tail = hit.near ? "" : "（偏离 >8%）";
    readout = `${peakText} → ${hit.bearingKey} ${hit.bearingOrder}× · 理论 ${hit.bearingHz.toFixed(0)} Hz · 偏差 ${sign}${dev.toFixed(1)}%${tail}`;
  }
  if (pinnedHz !== null && hoverHz === null) readout = `已锁定 · ${readout}`;

  const hzAt = (clientX: number, el: HTMLCanvasElement) => {
    const rect = el.getBoundingClientRect();
    return envelopeFreqAt(clientX - rect.left, rect.width, f0);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) sizeRef.current = { width: rect.width, height: rect.height };
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let id = 0;
    const loop = () => {
      const canvas = canvasRef.current;
      const current = engine.envelope;
      if (canvas && current) {
        const spectrumDb = tween.current.step(current.spectrumDb, performance.now());
        drawEnvelope(
          canvas,
          { ...current, spectrumDb },
          f0,
          sizeRef.current,
          hoverRef.current ?? pinRef.current,
        );
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [f0]);

  return (
    <Panel
      title="包络谱 / 轴承特征"
      hint={`1.5–6 kHz 带通包络 · 横轴 0–${(f0 * 6.5).toFixed(0)} Hz · 悬停吸附峰值并对照 BPFO/BPFI/BSF/FTF 理论频率`}
      action={
        env ? (
          <span className="rounded-md bg-bg px-2 py-1 font-mono text-xs text-muted">
            轴承分 {(env.bearingScore * 100).toFixed(0)}
          </span>
        ) : null
      }
    >
      <div className="px-2 pb-2">
        <canvas
          ref={canvasRef}
          className="block h-48 w-full cursor-crosshair rounded-lg bg-bg"
          aria-label="包络谱"
          onPointerMove={(event) => {
            const hz = hzAt(event.clientX, event.currentTarget);
            hoverRef.current = hz;
            setHoverHz(hz);
          }}
          onPointerLeave={() => {
            hoverRef.current = null;
            setHoverHz(null);
          }}
          onClick={(event) => {
            const hz = hzAt(event.clientX, event.currentTarget);
            const same = pinRef.current !== null && Math.abs(pinRef.current - hz) < Math.max(2, f0 * 0.15);
            const next = same ? null : hz;
            pinRef.current = next;
            setPinnedHz(next);
          }}
        />
        <p className="mt-2 whitespace-pre-wrap font-mono text-xs text-muted">{readout}</p>
        {env && env.strongest > 0.12 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-md bg-bg px-2 py-1 font-mono text-xs text-fg">
              最强 {env.repHz.toFixed(0)} Hz · {env.repOrder.toFixed(2)}×
            </span>
            {matches
              .filter((item) => item.score >= 0.25)
              .map((item) => (
                <span key={item.key} className="rounded-md bg-bg px-2 py-1 font-mono text-xs text-muted">
                  {item.key} {item.hz.toFixed(0)} Hz · {item.snrDb.toFixed(0)} dB
                </span>
              ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">
            有周期冲击时，包络谱会在轴承特征阶次上出现谱线；冲击越规律，谱线越陡。
          </p>
        )}
      </div>
    </Panel>
  );
}
