import { AlertTriangle, Check, CircleHelp, Gauge, MicOff, Ruler, Unplug, Waves, Wind, Wrench } from "lucide-react";
import type { DirectionId } from "../audio/diagnose";
import { engine } from "../audio/engine";
import { getPumpType } from "../audio/scenarios";
import { useSettings } from "../lib/settings";
import { cn } from "../lib/utils";
import { Panel } from "./panel";
import { useFrame } from "./use-frame";

const ICONS: Record<DirectionId, typeof Check> = {
  cavitation: Wind,
  blockage: Gauge,
  healthy: Check,
  repeated_impact: AlertTriangle,
  wideband_hf: Wind,
  one_x: Gauge,
  two_x: Ruler,
  half_orders: Unplug,
  low_harmonics: Wrench,
  lf_pulsation: Waves,
};

const TONE: Record<DirectionId, string> = {
  cavitation: "text-amber",
  blockage: "text-amber",
  healthy: "text-signal",
  repeated_impact: "text-alarm",
  wideband_hf: "text-amber",
  one_x: "text-amber",
  two_x: "text-amber",
  half_orders: "text-amber",
  low_harmonics: "text-amber",
  lf_pulsation: "text-amber",
};

export function DiagnosisCard() {
  const tick = useFrame(200);
  void tick;
  const pumpType = useSettings((s) => s.pumpType);
  const meta = getPumpType(pumpType);
  const result = engine.readout.running ? engine.readout.diagnosis : null;
  const top = result?.directions[0];
  const invalid = result?.status === "invalid";
  const Icon = invalid ? MicOff : top ? ICONS[top.id] : CircleHelp;
  const tone = invalid ? "text-amber" : top ? TONE[top.id] : "text-muted";
  const shaft = result ? engine.readout.shaft : null;
  const shaftMismatch = !!shaft && shaft.mismatch;

  return (
    <Panel
      title="工况线索"
      hint={`按当前${meta.name}的转速与${meta.bladeLabel}核对 1×、${meta.bpfLabel} 与半阶次`}
    >
      <div className="px-2 pb-3">
        {result ? (
          <>
            <div className="flex items-center gap-2">
              <Icon className={cn("size-5", tone)} aria-hidden="true" />
              <h3 className={cn("text-lg font-medium", tone)} data-testid="diagnosis">
                {result.title}
              </h3>
              <span className="font-mono text-xs text-muted">把握 {result.confidence}</span>
            </div>
            <p className="mt-2 text-sm text-fg">{result.summary}</p>
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
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted">铭牌轴频</dt>
                  <dd className="text-fg">{Math.round(shaft.ratedF0 * 60)} r/min</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted">偏差</dt>
                  <dd className="text-amber">
                    {shaft.rpmDeltaPct.toFixed(1)}% ± {shaft.rpmDeltaPctUncertainty.toFixed(1)}%（超出 3σ，阶次坐标已错位）
                    <span className="ml-1 text-muted">· {shaft.windowCount} 窗 / {shaft.spanSec.toFixed(1)} s</span>
                  </dd>
                </div>
              </dl>
            ) : null}
            <ul className="mt-3 flex flex-wrap gap-2">
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
                  <span
                    key={item}
                    className="rounded-md bg-signal/10 px-2 py-1 font-mono text-xs text-signal"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted">
            开始观测后，这里只给出偏离程度、频带证据与可能方向；在可控标注样本集建立前，不会出现具体故障名。
          </p>
        )}
        <p className="mt-3 text-xs text-muted">线索不是故障结论，也不能代替振动检测。</p>
      </div>
    </Panel>
  );
}
