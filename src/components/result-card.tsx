import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleHelp, Fingerprint, RotateCcw, Save, Waves } from "lucide-react";
import type { Severity } from "../audio/diagnose";
import { engine } from "../audio/engine";
import { cn } from "../lib/utils";
import { controlClass } from "./panel";
import { useFrame } from "./use-frame";

const TONE: Record<Severity, { text: string; bar: string; border: string; badge: string }> = {
  正常: { text: "text-signal", bar: "bg-signal", border: "border-signal/50", badge: "bg-signal/15 text-signal" },
  健康: { text: "text-signal", bar: "bg-signal", border: "border-signal/50", badge: "bg-signal/15 text-signal" },
  注意: { text: "text-amber", bar: "bg-amber", border: "border-amber/50", badge: "bg-amber/15 text-amber" },
  警告: { text: "text-amber", bar: "bg-amber", border: "border-amber/50", badge: "bg-amber/15 text-amber" },
  危险: { text: "text-alarm", bar: "bg-alarm", border: "border-alarm/60", badge: "bg-alarm/20 text-alarm" },
  严重: { text: "text-alarm", bar: "bg-alarm", border: "border-alarm/60", badge: "bg-alarm/20 text-alarm" },
};

function IconOf({ severity }: { severity: Severity }) {
  if (severity === "正常" || severity === "健康") return CheckCircle2;
  if (severity === "警告" || severity === "注意") return AlertTriangle;
  return CircleHelp;
}

export function ResultCard() {
  const tick = useFrame(150);
  void tick;
  const running = engine.readout.running;
  const result = running ? engine.readout.diagnosis : null;
  const anomaly = running ? engine.readout.anomaly : null;
  const baselineFrames = engine.readout.baselineFrames;
  const baselineBuckets = engine.readout.baselineBuckets;
  const bgVersion = engine.readout.bgVersion;
  const phase = engine.readout.phase;
  const shaft = running ? engine.readout.shaft : null;
  const shaftMismatch = !!shaft && shaft.mismatch;
  const ready = running && engine.readout.analysisReady;
  const [flash, setFlash] = useState("");
  const [open, setOpen] = useState(false);

  if (!result) {
    return (
      <section className="rounded-2xl bg-surface p-5 shadow-panel">
        <div className="flex items-center gap-3">
          <CircleHelp className="size-8 text-muted" aria-hidden="true" />
          <div>
            <h2 className="text-2xl font-semibold text-fg">等待采样</h2>
            <p className="mt-1 text-sm text-muted">
              点“开始观测”后，这里给出偏离程度、频带证据与可能方向。
            </p>
          </div>
        </div>
      </section>
    );
  }

  const tone = TONE[result.severity];
  const Icon = IconOf({ severity: result.severity });
  const top = result.directions[0];
  const ranked = result.directions.filter((item) => (item.probability ?? 0) >= 2);
  const invalid = result.status === "invalid";

  return (
    <section className={cn("overflow-hidden rounded-2xl border bg-surface shadow-panel", tone.border)}>
      <div className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
        <Icon className={cn("mt-1 size-9 shrink-0", tone.text)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", tone.badge)}>
              {result.severity}
            </span>
            <span className="font-mono text-xs text-muted">
              {invalid ? "信号不可信" : result.status === "low" ? "低置信" : "可判读"} · 把握 {result.confidence} ·{" "}
              {result.confidence}%
            </span>
            <span className="rounded-md bg-bg px-2 py-0.5 font-mono text-xs text-muted">运行态 {phase}</span>
          </div>
          <h2 className={cn("mt-1 text-3xl font-semibold leading-tight", tone.text)} data-testid="diagnosis">
            {result.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-fg">{result.summary}</p>
          {shaft?.ambiguous ? (
            <p className="mt-3 rounded-md border-l-4 border-amber bg-bg px-2 py-1.5 text-xs text-amber">
              {shaft.insufficientSnr
                ? `转速不确定：主梳谱线 SNR ${shaft.lineSnrDb.toFixed(1)} dB 不足，无法判断亚谐波有无，已禁用阶次结论。`
                : `转速不确定：1/2×、1/3× 亚谐波同时成立（分数阶占比 ${(shaft.subharmonicRatio * 100).toFixed(0)}%），已禁用阶次结论，不给数值。`}
            </p>
          ) : shaftMismatch && shaft ? (
            <dl className="mt-3 grid gap-1 rounded-md bg-bg px-2 py-1.5 font-mono text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">实测轴频</dt>
                <dd className="text-fg">
                  {Math.round(shaft.trackedF0 * 60)} ± {(shaft.trackedF0UncertaintyHz * 60).toFixed(0)} r/min
                  <span className="ml-1 text-muted">（{shaft.trackedF0.toFixed(2)} ± {shaft.trackedF0UncertaintyHz.toFixed(2)} Hz）</span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">铭牌轴频</dt>
                <dd className="text-fg">
                  {Math.round(shaft.ratedF0 * 60)} r/min
                  <span className="ml-1 text-muted">（{shaft.ratedF0.toFixed(2)} Hz）</span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">偏差</dt>
                <dd className="text-amber">
                  {shaft.rpmDeltaPct.toFixed(1)}% ± {shaft.rpmDeltaPctUncertainty.toFixed(1)}%（超出 3σ）
                  <span className="ml-1 text-muted">· {shaft.windowCount} 窗 / {shaft.spanSec.toFixed(1)} s</span>
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      </div>

      <div className="px-4 pb-4 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">判读把握</span>
          <div className="h-1.5 flex-1 rounded-full bg-bg">
            <div
              className={cn("h-full rounded-full transition-[width]", tone.bar)}
              style={{ width: `${result.confidence}%` }}
            />
          </div>
          <span className="font-mono text-xs text-muted">{result.confidence}%</span>
        </div>

        {ranked.length && !invalid ? (
          <dl className="mt-4 grid gap-2">
            {ranked.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <dt className="w-28 shrink-0 truncate text-sm text-fg sm:w-36">{item.title}</dt>
                <div className="h-1 flex-1 rounded-full bg-bg">
                  <div
                    className={cn("h-full rounded-full", item.id === top?.id ? "bg-amber" : "bg-muted/60")}
                    style={{ width: `${Math.min(100, item.probability ?? 0)}%` }}
                  />
                </div>
                <dd className="w-12 shrink-0 text-right font-mono text-xs text-muted">
                  {(item.probability ?? 0).toFixed(0)}%
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="mt-4 rounded-xl bg-bg px-3 py-2.5">
          <p className="text-xs text-muted">建议动作</p>
          <p className="mt-1 text-sm leading-relaxed text-fg">{result.nextStep}</p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={cn(controlClass, "h-9 px-3 text-xs")}
            disabled={!ready}
            onClick={() => {
              engine.learnBaseline();
              setFlash("已记入正常基线");
            }}
          >
            <Save className="size-3.5" aria-hidden="true" />
            记入正常基线
          </button>
          <button
            type="button"
            className={cn(controlClass, "h-9 px-3 text-xs")}
            disabled={!ready}
            onClick={() => {
              engine.captureBackground();
              setFlash("背景谱已保存；旧基线自动失效");
            }}
          >
            <Waves className="size-3.5" aria-hidden="true" />
            采集背景谱
          </button>
          <button
            type="button"
            className={cn(controlClass, "h-9 px-3 text-xs")}
            disabled={!baselineFrames}
            onClick={() => {
              engine.resetBaseline();
              setFlash("正常基线已重置");
            }}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            重置基线
          </button>
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <Fingerprint className="size-3.5" aria-hidden="true" />
            基线 {baselineFrames} 帧 / {baselineBuckets} 档 · 背景 v{bgVersion} · 偏离{" "}
            <span className="font-mono text-fg">{anomaly === null ? "—" : anomaly.toFixed(0)}</span>
          </span>
        </div>
        {flash ? (
          <p className="mt-2 text-xs text-signal" role="status">
            {flash}
          </p>
        ) : null}

        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1 text-xs text-muted"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
          {open ? "收起依据" : "查看判读依据"}
        </button>
        {open ? (
          <>
            <ul className="mt-2 flex flex-wrap gap-2">
              {[result.evidence.spectrum, result.evidence.order, result.evidence.placement].filter(Boolean).map((item) => (
                <li key={item} className="rounded-md bg-bg px-2 py-1 font-mono text-xs text-muted">
                  {item}
                </li>
              ))}
            </ul>
            {result.excluded.length ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted">已排除</span>
                {result.excluded.map((item) => (
                  <span key={item} className="rounded-md bg-signal/10 px-2 py-1 font-mono text-xs text-signal">
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        <p className="mt-3 text-xs text-muted">声学线索不是故障结论，不能代替振动检测与拆检。</p>
      </div>
    </section>
  );
}
