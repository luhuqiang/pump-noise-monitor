import { useEffect, useState } from "react";
import { AudioLines, Pause, Play, Settings } from "lucide-react";
import { CleanSpectrumView, EnvelopeView } from "./clean-spectrum";
import { DiagnosisCard } from "./diagnosis-card";
import { MeterCard } from "./meter-card";
import { OctaveView, SpectrumView, TrendView, WaterfallView } from "./charts";
import { OverviewStrip } from "./overview-strip";
import { QualityStrip } from "./quality-strip";
import { ReportPanel } from "./report-panel";
import { ResultCard } from "./result-card";
import { controlClass, controlOn } from "./panel";
import { SettingsPanel } from "./settings-panel";
import { Toolbar } from "./toolbar";
import { engine } from "../audio/engine";
import { getPumpType } from "../audio/scenarios";
import { useSettings } from "../lib/settings";
import { cn } from "../lib/utils";
import { useFrame } from "./use-frame";

export function Instrument() {
  const load = useSettings((s) => s.load);
  const source = useSettings((s) => s.source);
  const pumpType = useSettings((s) => s.pumpType);
  const model = useSettings((s) => s.model);
  const scenario = useSettings((s) => s.scenario);
  const rpm = useSettings((s) => s.rpm);
  const blades = useSettings((s) => s.blades);
  const monitor = useSettings((s) => s.monitor);
  const pole = useSettings((s) => s.pole);
  const gridHz = useSettings((s) => s.gridHz);
  const ratedCurrent = useSettings((s) => s.ratedCurrent);
  const actualCurrent = useSettings((s) => s.actualCurrent);
  const mode = useSettings((s) => s.mode);
  const update = useSettings((s) => s.update);
  const tick = useFrame(250);
  void tick;
  const running = engine.readout.running;
  const frozen = engine.readout.frozen;
  const error = engine.readout.error;
  const [spoken, setSpoken] = useState("尚未开始采样");
  const [view, setView] = useState<"monitor" | "settings">("monitor");
  const meta = getPumpType(pumpType);
  const age = engine.readout.age;
  const baselineFrames = engine.readout.baselineFrames;
  const needsResample = !!(age && age.needsResample && baselineFrames > 0);
  const placementState = engine.readout.placement?.state ?? null;
  const note = engine.readout.sampleRateNote;

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void engine.sync();
    }, 140);
    return () => window.clearTimeout(id);
  }, [source, pumpType, scenario, rpm, blades, monitor, pole, gridHz, ratedCurrent, actualCurrent]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const level = engine.readout;
      if (!level.running || !Number.isFinite(level.fast)) {
        setSpoken("尚未开始采样");
        return;
      }
      setSpoken(
        `当前${level.weighting}计权快挡 ${level.fast.toFixed(0)} 分贝，主频 ${level.dominantHz.toFixed(0)} 赫兹`,
      );
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  const sourceLabel = source === "mic" ? "麦克风" : source === "ref" ? "1 kHz 自检" : "演示";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 py-4 sm:px-5 sm:py-6">
      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-lg bg-amber text-ink">
            <AudioLines className="size-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs text-muted">PUMP ACOUSTIC MONITOR</p>
            <h1 className="text-xl font-semibold text-fg">泵噪监测台</h1>
            <p className="text-xs text-muted">
              {meta.name} · {model || "未填写型号"} · {pole} 极 / {gridHz} Hz
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-surface p-1 shadow-panel" role="group" aria-label="界面模式">
            {(["simple", "expert"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={mode === item}
                className={cn(
                  "h-9 rounded-md px-3 text-sm",
                  mode === item ? "bg-amber text-ink" : "text-muted",
                )}
                onClick={() => update({ mode: item })}
              >
                {item === "simple" ? "简版" : "专家"}
              </button>
            ))}
          </div>
          <span className="inline-flex h-11 items-center gap-2 rounded-lg bg-surface px-3 text-sm text-fg shadow-panel">
            <span className={cn("size-2 rounded-full", running && !frozen ? "bg-signal live-dot" : "bg-muted")} />
            {frozen ? "已冻结" : running ? "采样中" : "待命"} · {sourceLabel}
          </span>
          <button
            type="button"
            className={cn(controlClass, !running && controlOn)}
            onClick={() => {
              if (running) engine.stop();
              else void engine.start();
            }}
          >
            {running ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
            {running ? "停止" : "开始观测"}
          </button>
          <button type="button" className={controlClass} disabled={!running} onClick={() => engine.toggleFreeze()}>
            {frozen ? "继续" : "冻结"}
          </button>
          <button
            type="button"
            aria-pressed={view === "settings"}
            className={cn(controlClass, view === "settings" && controlOn)}
            onClick={() => setView(view === "settings" ? "monitor" : "settings")}
          >
            <Settings className="size-4" aria-hidden="true" />
            {view === "settings" ? "监测台" : "设置"}
          </button>
        </div>
      </header>
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface px-3 py-2 text-xs shadow-panel",
          needsResample || note ? "border-l-4 border-amber" : "border-l-4 border-signal/40",
        )}
      >
        <span className="text-muted">基线</span>
        <span className="font-mono text-fg">
          {baselineFrames && age ? `${age.daysSinceCreated} 天` : "未建立"}
        </span>
        <span className="font-mono text-muted">
          累计 {baselineFrames && age ? `${(age.runHours ?? 0).toFixed(1)} 小时` : "—"}
        </span>
        <span
          className={
            needsResample ? "font-medium text-amber" : baselineFrames ? "text-signal" : "text-muted"
          }
        >
          {needsResample ? "需复测" : baselineFrames ? "有效" : "待采集"}
        </span>
        {placementState === "moved" ? (
          <span className="text-amber">疑似移动设备，建议重新标定</span>
        ) : placementState === "recalibration_suggested" ? (
          <span className="text-muted">设备指纹变化，其余一致性正常，建议复标定</span>
        ) : placementState === "device_changed" ? (
          <span className="text-muted">设备已更换，需重新标定</span>
        ) : null}
        {baselineFrames && age && engine.readout.event?.historyReady && !engine.readout.event.gateFrozen ? (
          <span className={(age.daysSinceCreated ?? 0) >= 7 ? "text-amber" : "text-muted"}>
            冲击门限未冻结
            {(age.daysSinceCreated ?? 0) >= 7
              ? `（基线已 ${age.daysSinceCreated ?? 0} 天，长期只记录不报警）`
              : "（历史已够，可冻结）"}
          </span>
        ) : null}
        {note ? <span className="text-alarm">{note}</span> : null}
      </div>
      {error ? (
        <p className="rounded-lg border-l-4 border-alarm bg-surface px-3 py-2 text-sm text-fg" role="alert">
          {error}
        </p>
      ) : null}
      {view === "settings" ? (
        <>
          <SettingsPanel onBack={() => setView("monitor")} />
          <p className="text-xs text-muted">不能代替经检定的声级计或现场振动诊断。</p>
        </>
      ) : (
        <>
          <Toolbar />
          {mode === "simple" ? (
            <>
              <ResultCard />
              <div className="grid gap-3 lg:grid-cols-3">
                <MeterCard />
                <div className="min-w-0 lg:col-span-2">
                  <CleanSpectrumView />
                </div>
              </div>
              <QualityStrip />
              <TrendView />
              <ReportPanel />
            </>
          ) : (
            <>
              <OverviewStrip />
              <div className="grid gap-3 lg:grid-cols-3">
                <MeterCard />
                <div className="min-w-0 lg:col-span-2">
                  <SpectrumView />
                </div>
              </div>
              <QualityStrip />
              <div className="grid gap-3 lg:grid-cols-2">
                <CleanSpectrumView />
                <EnvelopeView />
              </div>
              <WaterfallView />
              <div className="grid gap-3 lg:grid-cols-2">
                <OctaveView />
                <div className="grid min-w-0 gap-3">
                  <TrendView />
                  <DiagnosisCard />
                </div>
              </div>
              <ReportPanel />
            </>
          )}
          <p className="text-xs text-muted">
            不能代替经检定的声级计或现场振动诊断。设置页包含两种泵型的故障特征库与运行参数。
          </p>
        </>
      )}
      <footer className="mt-1 border-t border-white/10 pt-3 text-xs text-muted">
        泵噪监测台 · 作者: luhuqiang
      </footer>
    </main>
  );
}
