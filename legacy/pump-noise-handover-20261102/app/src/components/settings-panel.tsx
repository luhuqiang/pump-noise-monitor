import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Download,
  Fan,
  History,
  KeyRound,
  Play,
  RotateCcw,
  Save,
  Trash2,
  Tornado,
  Wrench,
  Zap,
} from "lucide-react";
import { downloadCsv, engine } from "@/lib/audio/engine";
import {
  conditionOf,
  estimateCurrent,
  poleDefaultRpm,
  syncRpm,
  targetDbFor,
} from "@/lib/audio/condition";
import { activateLicense, groupMachine, inspectLicense, type LicenseState } from "@/lib/license";
import {
  PUMP_TYPES,
  getPumpType,
  getScenario,
  scenariosFor,
  type PumpScenario,
} from "@/lib/audio/scenarios";
import { MIC_DIRS, useSettings, type GridHz, type MicDir, type Pole, type Weighting } from "@/lib/settings";
import { cn, fmtHz, clamp } from "@/lib/utils";
import { Panel, controlClass, controlOn } from "@/components/panel";
import { MachineQr } from "@/components/machine-qr";
import { QrScan } from "@/components/qr-scan";

const PUMP_ICONS = { centrifugal: Fan, vortex: Tornado };

const WEIGHTS: Weighting[] = ["A", "C", "Z"];

const SEVERITY: Record<PumpScenario["severity"], string> = {
  健康: "border-signal/60 text-signal",
  注意: "border-line text-muted",
  警告: "border-amber/70 text-amber",
  危险: "border-alarm/70 text-alarm",
};

export function SettingsPanel({ onBack }: { onBack: () => void }) {
  const pumpType = useSettings((s) => s.pumpType);
  const model = useSettings((s) => s.model);
  const scenario = useSettings((s) => s.scenario);
  const rpm = useSettings((s) => s.rpm);
  const rpmAuto = useSettings((s) => s.rpmAuto);
  const blades = useSettings((s) => s.blades);
  const pole = useSettings((s) => s.pole);
  const gridHz = useSettings((s) => s.gridHz);
  const flow = useSettings((s) => s.flow);
  const flowUnit = useSettings((s) => s.flowUnit);
  const actualFlow = useSettings((s) => s.actualFlow);
  const head = useSettings((s) => s.head);
  const npsh = useSettings((s) => s.npsh);
  const clearance = useSettings((s) => s.clearance);
  const distance = useSettings((s) => s.distance);
  const micDir = useSettings((s) => s.micDir);
  const ratedPower = useSettings((s) => s.ratedPower);
  const voltage = useSettings((s) => s.voltage);
  const ratedCurrent = useSettings((s) => s.ratedCurrent);
  const actualCurrent = useSettings((s) => s.actualCurrent);
  const logs = useSettings((s) => s.logs);
  const weighting = useSettings((s) => s.weighting);
  const splAt0 = useSettings((s) => s.splAt0);
  const calOffset = useSettings((s) => s.calOffset);
  const warn = useSettings((s) => s.warn);
  const danger = useSettings((s) => s.danger);
  const peakHold = useSettings((s) => s.peakHold);
  const monitor = useSettings((s) => s.monitor);
  const alarms = useSettings((s) => s.alarms);
  const presets = useSettings((s) => s.presets);
  const update = useSettings((s) => s.update);
  const selectPumpType = useSettings((s) => s.selectPumpType);
  const selectScenario = useSettings((s) => s.selectScenario);
  const setPole = useSettings((s) => s.setPole);
  const setGrid = useSettings((s) => s.setGrid);
  const setActualCurrent = useSettings((s) => s.setActualCurrent);
  const setActualFlow = useSettings((s) => s.setActualFlow);
  const estimateRatedCurrent = useSettings((s) => s.estimateRatedCurrent);
  const clearAlarms = useSettings((s) => s.clearAlarms);
  const clearLogs = useSettings((s) => s.clearLogs);
  const savePreset = useSettings((s) => s.savePreset);
  const applyPreset = useSettings((s) => s.applyPreset);
  const deletePreset = useSettings((s) => s.deletePreset);
  const [presetName, setPresetName] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!presets.some((item) => item.id === selectedPreset)) {
      setSelectedPreset(presets[0]?.id ?? "");
    }
  }, [presets, selectedPreset]);

  const meta = getPumpType(pumpType);
  const faults = scenariosFor(pumpType);
  const active = getScenario(scenario);
  const cond = conditionOf({
    pumpType,
    pole,
    gridHz,
    rpm,
    blades,
    flow,
    head,
    npsh,
    clearance,
    actualFlow,
    ratedCurrent,
    actualCurrent,
    voltage,
  });
  const f0 = cond.f0;
  const tpf = cond.bpf;
  const flowText = (value: number) =>
    flowUnit === "lmin" ? `${(value * 16.6667).toFixed(1)} L/min` : `${value.toFixed(2)} m³/h`;

  const simulate = (fault: PumpScenario) => {
    selectScenario(fault.id);
    void engine.start();
    onBack();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-fg">设置</h2>
          <p className="text-sm text-muted">泵型、运行参数、故障特征库与报警阈值都保存在这台设备上。</p>
        </div>
        <button type="button" className={controlClass} onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          返回监测台
        </button>
      </div>

      <Panel
        title="泵型与运行参数"
        hint="切换泵型会同步更新叶片/齿数、默认工况和故障特征库"
      >
        <div className="grid gap-3 px-2 pb-2 lg:grid-cols-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {PUMP_TYPES.map((item) => {
              const Icon = PUMP_ICONS[item.id];
              const on = pumpType === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    if (!on) selectPumpType(item.id);
                  }}
                  className={cn(
                    "flex items-start gap-2 rounded-xl border p-3 text-left",
                    on ? "border-amber bg-amber/10" : "border-line bg-bg",
                  )}
                >
                  <Icon className={cn("mt-0.5 size-5 shrink-0", on ? "text-amber" : "text-muted")} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-medium", on ? "text-fg" : "text-fg")}>
                      {item.name}
                    </span>
                    <span className="block text-xs text-muted">{item.tagline}</span>
                  </span>
                </button>
              );
            })}
            <p className="text-xs text-muted sm:col-span-2">{meta.description}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="设备型号 / 位号"
              value={model}
              placeholder={pumpType === "vortex" ? "例如 W 20-25" : "例如 CDL 32-30"}
              onChange={(value) => update({ model: value.slice(0, 24) })}
            />
            <div className="grid gap-1.5">
              <Field
                label="运行转速 r/min（极数 / 频率自动改写）"
                value={rpm}
                min={300}
                max={6000}
                step={10}
                onChange={(value) => update({ rpm: value })}
              />
              <button
                type="button"
                aria-pressed={rpmAuto}
                className={cn(
                  "h-8 rounded-md px-2 text-xs",
                  rpmAuto ? "bg-amber text-ink" : "bg-bg text-muted",
                )}
                onClick={() =>
                  update(
                    rpmAuto
                      ? { rpmAuto: false }
                      : { rpmAuto: true, rpm: poleDefaultRpm(pole, gridHz) },
                  )
                }
              >
                {rpmAuto
                  ? `跟随极数/频率 · 当前 ${poleDefaultRpm(pole, gridHz)} r/min`
                  : `手动转速 · 点此回到 ${poleDefaultRpm(pole, gridHz)} r/min`}
              </button>
            </div>
            <Field
              label={`${meta.bladeLabel}（${meta.bpfLabel} ${fmtHz(tpf)}）`}
              value={blades}
              min={pumpType === "vortex" ? 6 : 2}
              max={pumpType === "vortex" ? 80 : 16}
              step={1}
              onChange={(value) => update({ blades: value })}
            />
            <Field
              label={`额定流量 ${flowUnit === "lmin" ? "L/min" : "m³/h"}`}
              value={flowUnit === "lmin" ? Math.round(flow * 166.667) / 10 : flow}
              min={flowUnit === "lmin" ? 3 : 0.2}
              max={flowUnit === "lmin" ? 8333 : 500}
              step={flowUnit === "lmin" ? 1 : 0.1}
              onChange={(value) =>
                update({ flow: flowUnit === "lmin" ? Math.round((value / 16.6667) * 1000) / 1000 : value })
              }
            />
            <div>
              <span className="text-xs text-muted">流量单位</span>
              <div className="mt-1 flex h-11 rounded-lg bg-bg p-1" role="group" aria-label="流量单位">
                {(["m3h", "lmin"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={flowUnit === id}
                    onClick={() => update({ flowUnit: id })}
                    className={cn(
                      "flex-1 rounded-md px-2 text-sm",
                      flowUnit === id ? "bg-amber text-ink" : "text-muted",
                    )}
                  >
                    {id === "m3h" ? "m³/h" : "L/min"}
                  </button>
                ))}
              </div>
            </div>
            <Field
              label="额定扬程 m"
              value={head}
              min={1}
              max={200}
              step={1}
              onChange={(value) => update({ head: value })}
            />
            <Field
              label="NPSH 余量 m"
              value={npsh}
              min={0}
              max={12}
              step={0.1}
              onChange={(value) => update({ npsh: value })}
            />
            <Field
              label="叶轮间隙 mm"
              value={clearance}
              min={0.02}
              max={1}
              step={0.01}
              onChange={(value) => update({ clearance: value })}
            />
            <Field
              label="测点距离 m"
              value={distance}
              min={0.1}
              max={5}
              step={0.1}
              onChange={(value) => update({ distance: value })}
            />
            <div className="sm:col-span-2">
              <span className="text-xs text-muted">麦克风朝向（进基线键）</span>
              <div className="mt-1 flex h-11 rounded-lg bg-bg p-1" role="group" aria-label="麦克风朝向">
                {MIC_DIRS.map((dir: MicDir) => (
                  <button
                    key={dir}
                    type="button"
                    aria-pressed={micDir === dir}
                    onClick={() => update({ micDir: dir })}
                    className={cn(
                      "flex-1 rounded-md px-1 text-xs",
                      micDir === dir ? "bg-amber text-ink" : "text-muted",
                    )}
                  >
                    {dir}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">距离与朝向变化会显著改变高频衰减，换位置必须重学基线。</p>
            </div>
          </div>
        </div>
        <p className="px-2 pb-2 text-xs text-muted">
          工况提示：NPSH 余量低于 0.5 m 时汽蚀噪声风险明显升高；叶轮间隙超过 0.25 mm 时，
          {pumpType === "vortex" ? "旋涡泵的回流与内泄漏噪声会增强。" : "离心泵的容积效率和噪声都会恶化。"}
        </p>
      </Panel>

      <Panel
        title="电机与电网"
        hint="极数 × 频率决定同步转速；额定 / 实际电流联动负载率、轴功率与案例名义声级"
      >
        <div className="grid gap-3 px-2 pb-2 lg:grid-cols-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="text-xs text-muted">电机极数</span>
              <div className="mt-1 flex h-11 rounded-lg bg-bg p-1" role="group" aria-label="电机极数">
                {([2, 4] as Pole[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={pole === item}
                    onClick={() => setPole(item)}
                    className={cn("flex-1 rounded-md px-2 text-sm", pole === item ? "bg-amber text-ink" : "text-muted")}
                  >
                    {item} 极
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">
                同步 {syncRpm(pole, gridHz).toFixed(0)} r/min · 滑差 {cond.slipPct.toFixed(1)}%
              </p>
            </div>
            <div>
              <span className="text-xs text-muted">电网频率</span>
              <div className="mt-1 flex h-11 rounded-lg bg-bg p-1" role="group" aria-label="电网频率">
                {([50, 60] as GridHz[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={gridHz === item}
                    onClick={() => setGrid(item)}
                    className={cn("flex-1 rounded-md px-2 text-sm", gridHz === item ? "bg-amber text-ink" : "text-muted")}
                  >
                    {item} Hz
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">2×工频 {2 * gridHz} Hz · 全部案例参考频率重算</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="额定功率 kW"
              value={ratedPower}
              min={0.1}
              max={500}
              step={0.1}
              onChange={(value) => update({ ratedPower: value })}
            />
            <Field
              label="额定电压 V"
              value={voltage}
              min={100}
              max={690}
              step={10}
              onChange={(value) => update({ voltage: value })}
            />
            <Field
              label="额定电流 A"
              value={ratedCurrent}
              min={0.1}
              max={1000}
              step={0.1}
              onChange={(value) => update({ ratedCurrent: value })}
            />
            <Field
              label="实际电流 A"
              value={actualCurrent}
              min={0.1}
              max={Math.max(1, Math.round(ratedCurrent * 25) / 10)}
              step={0.1}
              onChange={(value) => setActualCurrent(value)}
            />
            <Field
              label={`实际流量 ${flowUnit === "lmin" ? "L/min" : "m³/h"}`}
              value={flowUnit === "lmin" ? Math.round(actualFlow * 166.667) / 10 : actualFlow}
              min={0}
              max={flowUnit === "lmin" ? Math.round(flow * 41.667 * 1000) / 100 : flow * 2.5}
              step={flowUnit === "lmin" ? 1 : 0.1}
              onChange={(value) => setActualFlow(flowUnit === "lmin" ? value / 16.6667 : value)}
            />
            <div className="flex items-end">
              <button
                type="button"
                className={controlClass}
                onClick={() => estimateRatedCurrent()}
                title="按额定功率、电压与极数估算三相电机额定电流"
              >
                <Zap className="size-4" aria-hidden="true" />
                按功率估算 ≈ {estimateCurrent(ratedPower, voltage, pole).toFixed(1)} A
              </button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 px-2 pb-2 sm:grid-cols-3 xl:grid-cols-6">
          <Stat label="负载率" value={`${(cond.loadRatio * 100).toFixed(1)}%`} />
          <Stat label="轴功率" value={`${cond.shaftKw.toFixed(2)} kW`} />
          <Stat label="泵效" value={`${(cond.pumpEff * 100).toFixed(0)}%`} />
          <Stat label="电机效率" value={`${(cond.motorEff * 100).toFixed(0)}%`} />
          <Stat label="估算温升" value={`${cond.tempRise.toFixed(0)} K`} />
          <Stat label="实际扬程" value={`${cond.headActual.toFixed(1)} m`} />
        </div>
        <div className="px-2 pb-2 text-xs text-muted">
          <p>
            1× {fmtHz(f0)} · {meta.bpfLabel} {fmtHz(tpf)} · 0.5× {fmtHz(cond.halfOrder)} · 2×工频 {cond.line2x} Hz。
            派生量按 ρgQH、比转速效率曲线与电机负载效率估算，仅用于趋势参考。
          </p>
          <p className="mt-1">
            实际流量 {flowText(actualFlow)} / 额定 {flowText(flow)}；{cond.notes[0]}
          </p>
        </div>
      </Panel>

      <Panel
        title="调用设定"
        hint="把常用泵型、工况和阈值存成设定，下次从下拉菜单一键调用"
        action={
          <span className="rounded-md bg-bg px-2 py-1 text-xs text-muted">已保存 {presets.length} 组</span>
        }
      >
        <div className="grid gap-3 px-2 pb-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <label className="block">
              <span className="text-xs text-muted">已保存设定</span>
              <select
                className="mt-1 h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg"
                value={selectedPreset}
                onChange={(event) => setSelectedPreset(event.target.value)}
              >
                {presets.length === 0 ? (
                  <option value="">还没有保存设定</option>
                ) : (
                  presets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.savedAt ? ` · ${formatWhen(item.savedAt)}` : ""}
                    </option>
                  ))
                )}
              </select>
            </label>
            <button
              type="button"
              className={controlClass}
              disabled={!selectedPreset}
              onClick={() => {
                const item = presets.find((preset) => preset.id === selectedPreset);
                applyPreset(selectedPreset);
                setNotice(item ? `已调用“${item.name}”` : "");
              }}
            >
              <Play className="size-4" aria-hidden="true" />
              调用
            </button>
            <button
              type="button"
              className={controlClass}
              disabled={!selectedPreset}
              onClick={() => {
                deletePreset(selectedPreset);
                setNotice("已删除该设定");
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              删除
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm text-fg"
              type="text"
              value={presetName}
              maxLength={24}
              placeholder="设定名称，例如：3号泵 · 夏季工况"
              onChange={(event) => setPresetName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const id = savePreset(presetName);
                  setSelectedPreset(id);
                  setPresetName("");
                  setNotice("已保存当前设定");
                }
              }}
            />
            <button
              type="button"
              className={cn(controlClass, controlOn)}
              onClick={() => {
                const id = savePreset(presetName);
                setSelectedPreset(id);
                setPresetName("");
                setNotice("已保存当前设定");
              }}
            >
              <Save className="size-4" aria-hidden="true" />
              保存当前设定
            </button>
          </div>
          <p className={cn("text-xs", notice ? "text-signal" : "text-muted")} role="status">
            {notice ||
              `当前：${meta.name} · ${model || "未填写型号"} · ${pole} 极 / ${gridHz} Hz · ${active.name}。转速、电流、间隙、阈值与日志都保存在本机，下次打开仍在。`}
          </p>
        </div>
      </Panel>

      <Panel title="授权状态" hint="离线授权与硬件绑定，不需要联网；未授权或过期时只能显示解锁界面">
        <LicensePanel />
      </Panel>

      <Panel
        title={`故障特征库 · ${meta.name}`}
        hint={`按当前 ${pole} 极 / ${gridHz} Hz 实时生成：1× = ${fmtHz(f0)}，${meta.bpfLabel} = ${fmtHz(tpf)}，2×工频 = ${cond.line2x} Hz`}
        action={
          <span className="rounded-md bg-bg px-2 py-1 font-mono text-xs text-muted">
            {active.severity} · {active.name}
          </span>
        }
      >
        <div className="grid gap-2 px-2 pb-2 lg:grid-cols-2">
          {faults.map((fault) => (
            <FaultCard
              key={fault.id}
              fault={fault}
              pumpType={pumpType}
              rpm={rpm}
              blades={blades}
              gridHz={gridHz}
              loadRatio={cond.loadRatio}
              active={scenario === fault.id}
              onSimulate={() => simulate(fault)}
            />
          ))}
        </div>
      </Panel>

      <Panel
        title="阈值、计权与校准"
        hint="实时读数一律为未校准相对声级 dBFS；下面的校准值只用于设备换算小字说明"
      >
        <div className="flex flex-wrap items-end gap-3 px-2 pb-2">
          <Field
            label="0 dBFS 校准值（仅校准用）"
            value={splAt0}
            min={80}
            max={140}
            step={1}
            onChange={(value) => update({ splAt0: value })}
          />
          <Field
            label="校准修正 dB"
            value={calOffset}
            min={-30}
            max={30}
            step={0.1}
            onChange={(value) => update({ calOffset: value })}
          />
          <Field
            label="警告 dB"
            value={warn}
            min={40}
            max={130}
            step={1}
            onChange={(value) => update({ warn: Math.min(value, danger - 1) })}
          />
          <Field
            label="危险 dB"
            value={danger}
            min={45}
            max={140}
            step={1}
            onChange={(value) => update({ danger: Math.max(value, warn + 1) })}
          />
          <div>
            <span className="text-xs text-muted">频率计权</span>
            <div className="mt-1 flex h-11 rounded-lg bg-bg p-1" role="group" aria-label="频率计权">
              {WEIGHTS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={weighting === id}
                  onClick={() => update({ weighting: id })}
                  className={cn(
                    "w-11 rounded-md text-sm",
                    weighting === id ? "bg-amber text-ink" : "text-muted",
                  )}
                >
                  {id}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={monitor}
              className={cn(controlClass, monitor && "bg-amber text-ink")}
              onClick={() => update({ monitor: !monitor })}
            >
              {monitor ? "监听开" : "监听关"}
            </button>
            <button
              type="button"
              aria-pressed={peakHold}
              className={cn(controlClass, peakHold && controlOn)}
              onClick={() => update({ peakHold: !peakHold })}
            >
              峰值保持
            </button>
          </div>
        </div>
        <p className="px-2 pb-2 text-xs text-muted">
          例：声校准器 94 dB，本机读数 90.5 dB，则修正值填 +3.5 dB。该修正只进入校准说明，不改变“读数以 dBFS 呈现”的口径。
        </p>
        <div className="flex flex-wrap gap-2 px-2 pb-2">
          <button type="button" className={controlClass} onClick={() => downloadCsv()}>
            <Download className="size-4" aria-hidden="true" />
            导出频谱与工况
          </button>
          <button type="button" className={controlClass} onClick={() => engine.resetMax()}>
            <RotateCcw className="size-4" aria-hidden="true" />
            清除最大声级
          </button>
          <button type="button" className={controlClass} onClick={() => clearAlarms()} disabled={alarms.length === 0}>
            清除报警记录
          </button>
        </div>
      </Panel>

      <Panel title="报警记录" hint="越过危险阈值时自动记一条，1 kHz 自检不记。">
        <div className="px-2 pb-2">
          {alarms.length === 0 ? (
            <p className="text-sm text-muted">还没有报警记录。演示故障或麦克风监测都可以触发。</p>
          ) : (
            <ul className="divide-y divide-line">
              {alarms.map((alarm, index) => (
                <li key={`${alarm.at}-${index}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-muted">{formatWhen(alarm.at)}</span>
                  <span className="min-w-0 flex-1 truncate">{alarm.note}</span>
                  <span className="font-mono tabular-nums text-alarm">{alarm.db.toFixed(1)} dB</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <Panel
        title="工程日志"
        hint="记录参数变更、设定调用、工况越限与诊断结论切换，便于事后复现现场过程"
        action={
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-bg px-2 py-1 text-xs text-muted">共 {logs.length} 条</span>
            <button
              type="button"
              className={controlClass}
              disabled={logs.length === 0}
              onClick={() => clearLogs()}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              清空
            </button>
          </div>
        }
      >
        <div className="px-2 pb-2">
          {logs.length === 0 ? (
            <p className="text-sm text-muted">
              还没有日志。修改参数、切换泵型 / 极数 / 频率、调用设定或诊断结论变化时都会自动记录。
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-line overflow-y-auto" data-testid="engine-logs">
              {logs.map((log, index) => (
                <li key={`${log.at}-${index}`} className="flex items-start gap-2 py-2 text-sm">
                  <History
                    className={cn(
                      "mt-0.5 size-3.5 shrink-0",
                      log.level === "alarm" ? "text-alarm" : log.level === "warn" ? "text-amber" : "text-muted",
                    )}
                    aria-hidden="true"
                  />
                  <span className="shrink-0 font-mono text-xs text-muted">{formatWhen(log.at)}</span>
                  <span className="shrink-0 rounded bg-bg px-1.5 py-0.5 text-xs text-muted">{log.tag}</span>
                  <span
                    className={cn(
                      "min-w-0 flex-1",
                      log.level === "alarm" ? "text-alarm" : log.level === "warn" ? "text-amber" : "text-fg",
                    )}
                  >
                    {log.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <Panel title="测量方法" hint="浏览器本地处理，不上传音频">
        <div className="space-y-2 px-2 pb-2 text-sm text-muted">
          <p>
            链路与开源网页声级计相同：AudioWorklet 计算快、慢时间计权，IIR 滤波器按 IEC 61672-1
            的 A/C 计权极点做双线性变换，AnalyserNode 做加 Blackman 窗的 FFT。
          </p>
          <p>
            故障特征按泵型分流：离心泵关注 BPF、1×、半阶次与高频宽带；旋涡泵关注齿频 TPF、1×/TPF
            比、低频脉动与间隙泄漏。演示声源是本地合成的，方便没有水泵时核对仪表。
          </p>
        </div>
      </Panel>
    </div>
  );
}

function LicensePanel() {
  const [state, setState] = useState<LicenseState | null>(null);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [noteOk, setNoteOk] = useState(false);

  useEffect(() => {
    let alive = true;
    void inspectLicense().then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (input?: string) => {
    const value = (input ?? code).trim();
    if (!value) return;
    const next = await activateLicense(value);
    setState(next);
    setNote(next.message);
    setNoteOk(next.status === "valid");
    if (next.status === "valid") setCode("");
  };

  const valid = state?.status === "valid";
  return (
    <div className="grid gap-3 px-2 pb-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-bg p-3">
          <p className="text-xs text-muted">本机机器码（硬件绑定）</p>
          <p className="mt-1 break-all font-mono text-lg text-fg" data-testid="settings-machine-code">
            {state ? groupMachine(state.machine) : "读取中…"}
          </p>
          <div className="mt-2 flex justify-center">
            {state ? <MachineQr machine={state.machine} size={150} /> : null}
          </div>
          <p className="mt-2 text-xs text-muted">
            {state?.source === "native" ? "青色实心码：签发器扫码即可生成授权。" : "当前为网页环境，机器码由浏览器指纹生成。"}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-bg p-3">
          <p className="text-xs text-muted">授权状态</p>
          <p className={cn("mt-1 text-lg font-medium", valid ? "text-signal" : state ? "text-alarm" : "text-muted")}>
            {!state ? "读取中…" : valid ? "已授权" : state.status === "expired" ? "已过期" : state.status === "invalid" ? "授权无效" : "未授权"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {valid && state.expiry
              ? `到期 ${new Date(state.expiry).toLocaleString("zh-CN", { hour12: false })} · 剩余 ${state.remainingDays} 天`
              : "授权时长 7 天 / 1 个月 / 1 年 / 10 年，激活窗口 24 小时。"}
          </p>
          <p className="mt-2 text-xs text-muted">
            续期会累加剩余天数；同一份授权码在本机只能使用一次，囤码无意义。
          </p>
        </div>
      </div>
      <QrScan
        kind="auth"
        onText={(text) => {
          setCode(text);
          void submit(text);
        }}
      />
      <label className="block">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <KeyRound className="size-3.5" aria-hidden="true" />
          或手动粘贴授权码（摄像头失灵时）
        </span>
        <textarea
          className="mt-1 min-h-20 w-full resize-y rounded-lg border border-line bg-bg p-3 font-mono text-xs text-fg"
          placeholder="粘贴新的授权码（内容.签名）"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          spellCheck={false}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={cn(controlClass, controlOn)}
          disabled={!code.trim()}
          onClick={() => void submit()}
        >
          激活授权
        </button>
        <a className={controlClass} href="mailto:luhuqiang@foxmail.com?subject=%E6%B3%B4%E5%99%AA%E7%9B%91%E5%88%B5%E5%8F%B0%E6%8E%91%E6%9D%83%E7%94%B3%E8%AF%B7">
          联系作者
        </a>
        {note ? (
          <span className={cn("text-xs", noteOk ? "text-signal" : "text-alarm")} role="status">
            {note}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted">授权与报价请联系 luhuqiang@foxmail.com，把机器码一起发过去即可签发。</p>
    </div>
  );
}

function FaultCard({
  fault,
  pumpType,
  rpm,
  blades,
  gridHz,
  loadRatio,
  active,
  onSimulate,
}: {
  fault: PumpScenario;
  pumpType: "centrifugal" | "vortex";
  rpm: number;
  blades: number;
  gridHz: number;
  loadRatio: number;
  active: boolean;
  onSimulate: () => void;
}) {
  const meta = getPumpType(pumpType);
  const f0 = rpm / 60;
  const tpf = f0 * blades;
  const nominal = targetDbFor(fault.targetDb, rpm, loadRatio);
  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-l-4 bg-bg p-3",
        SEVERITY[fault.severity],
        active && "ring-1 ring-amber",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-fg">{fault.name}</h3>
          <p className="text-xs text-muted">
            {fault.severity} · 基准 {fault.targetDb} dB → 当前 {nominal.toFixed(1)} dB（{(loadRatio * 100).toFixed(0)}% 负载）
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-raised px-2.5 text-xs text-fg shadow-panel"
          onClick={onSimulate}
        >
          <Play className="size-3.5" aria-hidden="true" />
          {active ? "正在模拟" : "模拟"}
        </button>
      </div>
      <p className="text-sm text-fg">{fault.signature}</p>
      <div className="flex flex-wrap gap-1.5 font-mono text-xs text-muted">
        <span className="rounded bg-surface px-1.5 py-0.5">1× {fmtHz(f0)}</span>
        <span className="rounded bg-surface px-1.5 py-0.5">0.5× {fmtHz(f0 / 2)}</span>
        <span className="rounded bg-surface px-1.5 py-0.5">
          {meta.bpfLabel} {fmtHz(tpf)}
        </span>
        <span className="rounded bg-surface px-1.5 py-0.5">2× {fmtHz(f0 * 2)}</span>
        <span className="rounded bg-surface px-1.5 py-0.5">2×工频 {2 * gridHz} Hz</span>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {fault.indicators.map((item) => (
          <li key={item} className="rounded-md bg-surface px-2 py-1 text-xs text-muted">
            {item}
          </li>
        ))}
      </ul>
      <p className="flex items-start gap-1.5 text-xs text-muted">
        <Wrench className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {fault.action}
      </p>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-mono text-sm tabular-nums text-fg">{value}</p>
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input
        className="mt-1 h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg"
        type="text"
        value={value}
        placeholder={placeholder}
        maxLength={24}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Field({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(() => (Number.isFinite(value) ? String(value) : ""));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(Number.isFinite(value) ? String(value) : "");
  }, [value, editing]);

  const commit = () => {
    const trimmed = text.trim();
    const next = Number(trimmed);
    if (!trimmed || !Number.isFinite(next)) {
      setText(Number.isFinite(value) ? String(value) : "");
      return;
    }
    const bounded = clamp(next, min, max);
    setText(String(bounded));
    if (bounded !== value) onChange(bounded);
  };

  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input
        className="mt-1 h-11 w-full rounded-lg border border-line bg-bg px-3 font-mono text-base text-fg"
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        value={text}
        onFocus={() => setEditing(true)}
        onChange={(event) => {
          const raw = event.target.value.replace(/[^\d.-]/g, "");
          setText(raw);
          const next = Number(raw);
          if (raw.trim() && Number.isFinite(next) && next >= min && next <= max) onChange(next);
        }}
        onBlur={() => {
          setEditing(false);
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      <span className="sr-only">
        允许范围 {min} 到 {max}，步进 {step}
      </span>
    </label>
  );
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
