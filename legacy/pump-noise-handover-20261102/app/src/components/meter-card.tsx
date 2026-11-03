import { useEffect, useRef } from "react";
import { currentCondition, engine, type Readout } from "@/lib/audio/engine";
import { targetDbFor } from "@/lib/audio/condition";
import { getScenario, REF_DBFS } from "@/lib/audio/scenarios";
import { useSettings, type Weighting } from "@/lib/settings";
import { clamp, cn, fmtDb, fmtHz, fmtNum } from "@/lib/utils";
import { useFrame } from "@/components/use-frame";

const WEIGHTS: { id: Weighting; hint: string }[] = [
  { id: "A", hint: "听感" },
  { id: "C", hint: "峰值" },
  { id: "Z", hint: "线性" },
];

function fastName(w: Weighting) {
  if (w === "A") return "LAF";
  if (w === "C") return "LCF";
  return "LZF";
}

function leqName(w: Weighting) {
  if (w === "A") return "LAeq";
  if (w === "C") return "LCeq";
  return "LZeq";
}

function useReadout(): Readout {
  const tick = useFrame(100);
  void tick;
  return engine.readout;
}

export function MeterCard() {
  const snap = useReadout();
  const weighting = useSettings((s) => s.weighting);
  const update = useSettings((s) => s.update);
  const splAt0 = useSettings((s) => s.splAt0);
  const warn = useSettings((s) => s.warn);
  const danger = useSettings((s) => s.danger);
  const source = useSettings((s) => s.source);
  const scenario = useSettings((s) => s.scenario);
  const pushAlarm = useSettings((s) => s.pushAlarm);
  const armed = useRef(false);
  const scenarioName = getScenario(scenario).name;
  const warnDbfs = warn - splAt0;
  const dangerDbfs = danger - splAt0;

  useEffect(() => {
    if (!snap.running || snap.frozen || !Number.isFinite(snap.fast) || source === "ref") {
      if (source === "ref" || !snap.running) armed.current = snap.fast >= dangerDbfs;
      return;
    }
    if (snap.fast >= dangerDbfs && !armed.current) {
      const cond = currentCondition();
      pushAlarm({
        at: new Date().toISOString(),
        db: snap.fast,
        note: `${source === "mic" ? "麦克风" : scenarioName} · ${snap.dominantHz.toFixed(0)} Hz · 负载 ${(cond.loadRatio * 100).toFixed(0)}%`,
      });
    }
    armed.current = snap.fast >= dangerDbfs;
  }, [snap.fast, snap.running, snap.frozen, dangerDbfs, source, scenarioName, pushAlarm]);

  const cond = currentCondition();
  const nominal =
    source === "ref"
      ? REF_DBFS
      : source === "demo"
        ? targetDbFor(getScenario(scenario).targetDb, cond.f0 * 60, cond.loadRatio) - 120
        : null;
  const showDelta = snap.running && nominal !== null && Number.isFinite(snap.fast);
  const delta = showDelta ? snap.fast - nominal : 0;
  const hot = snap.running && snap.fast >= dangerDbfs;
  const warm = snap.running && snap.fast >= warnDbfs && !hot;
  const tone = hot ? "text-alarm" : warm ? "text-amber" : snap.running ? "text-signal" : "text-muted";
  const bar = hot ? "bg-alarm" : warm ? "bg-amber" : "bg-signal";
  const pct = Number.isFinite(snap.fast) ? clamp((snap.fast + 100) / 100, 0, 1) : 0;
  const warnX = clamp((warnDbfs + 100) / 100, 0, 1) * 100;
  const dangerX = clamp((dangerDbfs + 100) / 100, 0, 1) * 100;

  return (
    <section className="min-w-0 rounded-2xl bg-surface p-4 shadow-panel" data-meter={snap.meter}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-fg">相对声级</h2>
        <p className="font-mono text-xs text-muted">{fastName(weighting)} · 快挡 125 ms</p>
      </div>
      <p
        className={cn("mt-2 font-mono text-6xl font-medium tabular-nums tracking-tight", tone)}
        data-testid="level"
      >
        {fmtDb(snap.fast)}
      </p>
      <p className="text-sm text-muted">dBFS · {weighting} 计权（未校准）</p>
      <div className="relative mt-4 h-2 rounded-full bg-bg">
        <div className={cn("h-full rounded-full", bar)} style={{ width: `${pct * 100}%` }} />
        <span className="absolute top-0 h-full w-px bg-amber" style={{ left: `${warnX}%` }} />
        <span className="absolute top-0 h-full w-px bg-alarm" style={{ left: `${dangerX}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-xs text-muted">
        <span>-100 dBFS</span>
        <span>0 dBFS</span>
      </div>
      <p className="mt-1 font-mono text-[11px] text-muted">0 dBFS 校准值 {splAt0} dB，仅作设备校准说明</p>
      {hot || warm ? (
        <p className={cn("mt-3 rounded-lg border-l-4 bg-bg px-3 py-2 text-sm text-fg", hot ? "border-alarm" : "border-amber")}>
          {hot ? `超过危险阈值（相对 ${dangerDbfs.toFixed(0)} dBFS）` : `超过警告阈值（相对 ${warnDbfs.toFixed(0)} dBFS）`}
        </p>
      ) : null}
      {snap.clipped ? (
        <p className="mt-3 rounded-lg border-l-4 border-alarm bg-bg px-3 py-2 text-sm text-fg">输入削波，读数不再可信。</p>
      ) : null}
      {showDelta ? (
        <p className="mt-3 text-sm text-muted">
          {source === "ref" ? "相对自检目标" : "相对该工况名义声级"}{" "}
          <span className={cn("font-mono tabular-nums", source === "ref" && Math.abs(delta) > 1.5 ? "text-alarm" : "text-fg")}>
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(1)} dB
          </span>
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">刻度是相对满度 dBFS。没有校准器时只作同测点变化量，不能当成绝对声级。</p>
      )}
      <div className="mt-4 grid grid-cols-3 gap-1 rounded-lg bg-bg p-1" role="group" aria-label="频率计权">
        {WEIGHTS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={weighting === item.id}
            onClick={() => update({ weighting: item.id })}
            className={cn(
              "h-11 rounded-md text-sm",
              weighting === item.id ? "bg-amber text-ink" : "text-muted",
            )}
          >
            {item.id}
            <span className="ml-1 text-xs">{item.hint}</span>
          </button>
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="慢挡 1 s" value={fmtDb(snap.slow)} />
        <Stat label={`${leqName(weighting)} 1 秒`} value={fmtDb(snap.leq1)} />
        <Stat label={`${leqName(weighting)} 10 秒`} value={fmtDb(snap.leq10)} />
        <Stat label="LC 峰值" value={fmtDb(snap.cpeak)} />
        <Stat label="本段最大" value={fmtDb(snap.lmax)} />
        <Stat label="主频" value={fmtHz(snap.dominantHz)} />
        <Stat label="峭度" value={fmtNum(snap.kurtosis, 1)} />
        <Stat label="波峰因数" value={fmtNum(snap.crest, 2)} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-base tabular-nums text-fg">{value}</dd>
    </div>
  );
}
