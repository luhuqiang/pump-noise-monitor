import { AudioWaveform, BadgeCheck, Layers, ShieldCheck, TriangleAlert } from "lucide-react";
import { engine } from "@/lib/audio/engine";
import { invalidText } from "@/lib/audio/validity";
import { phaseText } from "@/lib/audio/phase";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/panel";
import { useFrame } from "@/components/use-frame";

function tone(v: number, good: number, fair: number, higher = true) {
  if (!Number.isFinite(v)) return "text-muted";
  if (higher) return v >= good ? "text-signal" : v >= fair ? "text-amber" : "text-alarm";
  return v <= good ? "text-signal" : v <= fair ? "text-amber" : "text-alarm";
}

export function QualityStrip() {
  const tick = useFrame(200);
  void tick;
  const r = engine.readout;
  const live = r.running && r.analysisReady;
  const snr = r.snrDb;
  const fidelity = r.fidelity;
  const music = r.music;
  const clipped = r.clipped;

  return (
    <Panel
      title="信号质量"
      hint={r.analysisReady ? `精细分析 · ${r.windowSec.toFixed(2)} s 窗口 · ${r.meter === "worklet" ? "Worklet" : "Analyser"}` : "等待原始音频块"}
      action={
        r.running && !r.analysisReady ? (
          <span className="rounded-md bg-bg px-2 py-1 text-xs text-amber">粗谱降级</span>
        ) : live ? (
          <span className="rounded-md bg-bg px-2 py-1 text-xs text-signal">在线</span>
        ) : null
      }
    >
      <div className="grid grid-cols-2 gap-2 px-2 pb-2 sm:grid-cols-4">
        <Cell
          icon={AudioWaveform}
          label="信噪比"
          value={Number.isFinite(snr) ? `${snr.toFixed(0)} dB` : "—"}
          tone={tone(snr, 15, 8)}
          hint={Number.isFinite(snr) ? (snr >= 15 ? "谱线清楚" : snr >= 8 ? "可作参考" : "噪声偏大") : "开始观测后更新"}
        />
        <Cell
          icon={Layers}
          label="噪声底"
          value={Number.isFinite(r.noiseFloorDb) ? `${r.noiseFloorDb.toFixed(0)} dB` : "—"}
          tone="text-fg"
          hint={Number.isFinite(r.noiseFloorDb) ? "相对输入满度" : "最小值统计跟踪"}
        />
        <Cell
          icon={ShieldCheck}
          label="降噪保留"
          value={Number.isFinite(fidelity) ? `${(fidelity * 100).toFixed(0)}%` : "—"}
          tone={tone(fidelity, 0.75, 0.5, false)}
          hint={Number.isFinite(fidelity) ? "越高越不伤谱形" : "判决始终用原始谱"}
        />
        <Cell
          icon={BadgeCheck}
          label="谱峰残留"
          value={Number.isFinite(music) ? `${(music * 100).toFixed(0)}%` : "—"}
          tone={tone(music, 0.16, 0.32, false)}
          hint="孤立谱峰占比，越低越干净"
        />
      </div>
      <div className="mx-2 mb-2 rounded-lg bg-bg px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px]">
          <span className="text-xs not-italic text-muted">
            事件轨 <span className="text-[10px]">（独立短帧，不与趋势合成）</span>
          </span>
          <span className="text-fg">冲击 {r.event ? r.event.eventCount : 0} 次</span>
          <span className="text-muted">
            活度 {r.event ? `${r.event.eventsPerSec.toFixed(1)} 次/秒` : "—"}
          </span>
          <span className="text-muted">
            crest 门限 {r.event?.crestGate != null ? r.event.crestGate.toFixed(2) : "未冻结"}
          </span>
          {r.event?.gateFrozen && r.event.currentCrestZ != null ? (
            <span className="text-fg">当前 z {r.event.currentCrestZ.toFixed(2)}</span>
          ) : null}
          <span
            className={
              !r.event
                ? "text-muted"
                : r.event.clipped
                  ? "text-alarm"
                  : r.event.gateFrozen
                    ? "text-signal"
                    : "text-amber"
            }
          >
            {!r.event
              ? "待采样"
              : r.event.clipped
                ? "削顶已屏蔽峰度判据"
                : r.event.gateFrozen
                  ? `冻结门限 · 基线 v${r.event.gateVersion}`
                  : r.event.historyReady
                    ? "门限未冻结，仅记录不报警"
                    : "历史不足，仅记录"}
          </span>
          <button
            type="button"
            disabled={!r.baselineReady || !r.event?.historyReady || r.event.gateFrozen}
            title={r.baselineReady ? "冻结后随基线版本固化；重建基线后需重新冻结一次" : "先建基线（≥30 帧）再冻结"}
            className={cn(
              "rounded-md px-2 py-1 text-[11px]",
              r.baselineReady && r.event?.historyReady && !r.event.gateFrozen
                ? "bg-amber text-ink"
                : "bg-bg text-muted opacity-60",
            )}
            onClick={() => engine.freezeCrestGate()}
          >
            {r.event?.gateFrozen ? "门限已冻结" : "冻结门限"}
          </button>
        </div>
      </div>
      <div className="mx-2 mb-2 flex flex-wrap gap-1.5 font-mono text-[11px] text-muted">
        <span className="rounded-md bg-bg px-2 py-1">运行态 {phaseText(r.phase)}</span>
        <span className={r.sampleRateOk ? "rounded-md bg-bg px-2 py-1" : "rounded-md bg-alarm/15 px-2 py-1 text-alarm"}>
          采样率 {engine.sampleRate} Hz
        </span>
        <span className="rounded-md bg-bg px-2 py-1">削顶率 {(r.clipRate * 100).toFixed(2)}%</span>
        <span className={r.agc ? "rounded-md bg-amber/15 px-2 py-1 text-amber" : "rounded-md bg-bg px-2 py-1"}>
          AGC {r.agc ? "可疑" : "未检出"}
        </span>
        <span className={r.droppedFrames > 2 ? "rounded-md bg-alarm/15 px-2 py-1 text-alarm" : "rounded-md bg-bg px-2 py-1"}>
          掉帧 {r.droppedFrames}
        </span>
        <span className={r.mic !== "ok" ? "rounded-md bg-alarm/15 px-2 py-1 text-alarm" : "rounded-md bg-bg px-2 py-1"}>
          麦克风 {r.mic}
        </span>
        <span className="rounded-md bg-bg px-2 py-1">阶次 {r.ordersReliable ? "可用" : "禁用"}</span>
      </div>
      {r.invalidReasons.length ? (
        <p className="mx-2 mb-2 flex items-start gap-2 rounded-lg border-l-4 border-alarm bg-bg px-3 py-2 text-xs text-fg">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-alarm" aria-hidden="true" />
          当前数据不可用于判读：{r.invalidReasons.map(invalidText).join("；")}。请先修复采集条件。
        </p>
      ) : clipped ? (
        <p className="mx-2 mb-2 flex items-center gap-2 rounded-lg border-l-4 border-alarm bg-bg px-3 py-2 text-xs text-fg">
          <TriangleAlert className="size-4 text-alarm" aria-hidden="true" />
          输入削顶，声级与判读都不可信。把手机移远或减小演示增益。
        </p>
      ) : null}
    </Panel>
  );
}

function Cell({
  icon: Icon,
  label,
  value,
  tone: color,
  hint,
}: {
  icon: typeof AudioWaveform;
  label: string;
  value: string;
  tone: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg bg-bg px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <dt className="text-xs text-muted">{label}</dt>
        <Icon className="size-3.5 text-muted" aria-hidden="true" />
      </div>
      <dd className={cn("mt-1 font-mono text-xl font-medium tabular-nums", color)}>{value}</dd>
      <p className="mt-0.5 truncate text-[11px] text-muted">{hint}</p>
    </div>
  );
}
