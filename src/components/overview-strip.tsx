import type { ReactNode } from "react";
import { Activity, ClipboardList, Gauge, Waves } from "lucide-react";
import { currentCondition, engine } from "../audio/engine";
import { healthLabel, healthScore } from "../audio/health";
import { getPumpType } from "../audio/scenarios";
import { useSettings } from "../lib/settings";
import { cn, fmtHz } from "../lib/utils";
import { useFrame } from "./use-frame";

export function OverviewStrip() {
  const tick = useFrame(250);
  void tick;
  const pumpType = useSettings((s) => s.pumpType);
  const model = useSettings((s) => s.model);
  const flow = useSettings((s) => s.flow);
  const actualFlow = useSettings((s) => s.actualFlow);
  const head = useSettings((s) => s.head);
  const npsh = useSettings((s) => s.npsh);
  const clearance = useSettings((s) => s.clearance);
  const distance = useSettings((s) => s.distance);
  const rpm = useSettings((s) => s.rpm);
  const blades = useSettings((s) => s.blades);
  const pole = useSettings((s) => s.pole);
  const gridHz = useSettings((s) => s.gridHz);
  const ratedCurrent = useSettings((s) => s.ratedCurrent);
  const actualCurrent = useSettings((s) => s.actualCurrent);
  const warn = useSettings((s) => s.warn);
  const danger = useSettings((s) => s.danger);
  const splAt0 = useSettings((s) => s.splAt0);
  const meta = getPumpType(pumpType);
  const cond = currentCondition();

  const running = engine.readout.running;
  const diagnosis = running ? engine.readout.diagnosis : null;
  const penalty = cond.overCurrent ? 6 : cond.underLoad ? 3 : 0;
  const raw = diagnosis ? healthScore(diagnosis, engine.readout.fast, warn - splAt0, danger - splAt0) : null;
  const score = raw === null ? null : Math.max(0, raw - penalty);
  const tone =
    score === null ? "text-muted" : score >= 85 ? "text-signal" : score >= 48 ? "text-amber" : "text-alarm";
  const bar =
    score === null ? "bg-muted" : score >= 85 ? "bg-signal" : score >= 48 ? "bg-amber" : "bg-alarm";

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card icon={ClipboardList} title="设备档案" hint="铭牌与测点">
        <Row label="泵型" value={meta.name} />
        <Row label="型号 / 位号" value={model || "未填写"} mono />
        <Row label="额定点" value={`${flow} m³/h · ${head} m`} />
        <Row label="电机" value={`${pole} 极 · ${gridHz} Hz`} mono />
        <Row label="额定电流" value={`${ratedCurrent.toFixed(1)} A · ${distance} m`} mono />
      </Card>
      <Card icon={Gauge} title="运行工况" hint="电流与流量联动">
        <Row label="运行转速" value={`${rpm} r/min`} mono />
        <Row label="同步 / 滑差" value={`${cond.syncRpm.toFixed(0)} · ${cond.slipPct.toFixed(1)}%`} mono />
        <Row label="实际 / 额定流量" value={`${actualFlow.toFixed(1)} / ${flow} m³/h`} mono />
        <Row
          label="实际 / 额定电流"
          value={`${actualCurrent.toFixed(1)} / ${ratedCurrent.toFixed(1)} A`}
          mono
        />
        <Row
          label="NPSH / 间隙"
          value={`${npsh.toFixed(1)} m · ${clearance.toFixed(2)} mm`}
          mono
        />
        <Row label={meta.bladeLabel} value={`${blades} · ${meta.bpfLabel} ${fmtHz(cond.bpf)}`} mono />
      </Card>
      <Card icon={Waves} title="派生工况" hint="按泵与电机特性估算">
        <Row
          label="负载率"
          value={`${(cond.loadRatio * 100).toFixed(0)}%`}
          mono
          tone={cond.overCurrent ? "text-alarm" : cond.underLoad ? "text-amber" : undefined}
        />
        <Row label="轴功率 / 输入" value={`${cond.shaftKw.toFixed(2)} / ${cond.inputKw.toFixed(2)} kW`} mono />
        <Row label="泵效 / 电机效" value={`${(cond.pumpEff * 100).toFixed(0)} / ${(cond.motorEff * 100).toFixed(0)}%`} mono />
        <Row label="估算温升" value={`${cond.tempRise.toFixed(0)} K`} mono />
        <Row label="1× / 2×工频" value={`${fmtHz(cond.f0)} · ${cond.line2x} Hz`} mono />
        <Row label="实际扬程" value={`${cond.headActual.toFixed(1)} m`} mono />
      </Card>
      <section className="min-w-0 rounded-2xl bg-surface p-3 shadow-panel">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-fg">健康评估</h2>
          <Activity className="size-4 text-muted" aria-hidden="true" />
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          <p className={cn("font-mono text-4xl font-medium tabular-nums", tone)}>{score ?? "—"}</p>
          <span className="text-sm text-muted">/ 100</span>
          <span className={cn("ml-auto text-sm", tone)}>
            {score === null ? (running ? "等待诊断" : "待采样") : healthLabel(score)}
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-bg">
          <div className={cn("h-full rounded-full transition-[width]", bar)} style={{ width: `${score ?? 0}%` }} />
        </div>
        <p className="mt-2 min-h-5 truncate text-sm text-fg" data-testid="health-note">
          {diagnosis ? diagnosis.title : running ? "正在积累频谱特征…" : "开始观测后给出健康指数。"}
        </p>
        <p className="mt-1 min-h-8 text-xs text-muted" data-testid="condition-note">
          {cond.notes[0] ?? "工况参数在设置页修改后，这里的派生数据会立即联动。"}
        </p>
        {penalty > 0 ? (
          <p className="mt-1 text-xs text-amber">电流偏离额定，健康分已扣 {penalty} 分。</p>
        ) : null}
      </section>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Gauge;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl bg-surface p-3 shadow-panel">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-fg">{title}</h2>
          <p className="text-xs text-muted">{hint}</p>
        </div>
        <Icon className="size-4 text-muted" aria-hidden="true" />
      </div>
      <div className="mt-2 grid gap-1">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="shrink-0 text-xs text-muted">{label}</span>
      <span className={cn("min-w-0 truncate text-fg", mono && "font-mono tabular-nums", tone)}>{value}</span>
    </div>
  );
}
