import { THIRD_OCTAVE } from "@/lib/audio/bands";
import { conditionOf, syncRpm } from "@/lib/audio/condition";
import { ALGORITHM_VERSION } from "@/lib/audio/diagnose";
import { engine } from "@/lib/audio/engine";
import { getPumpType } from "@/lib/audio/scenarios";
import { ageInfo, loadBaseline } from "@/lib/audio/fingerprint";
import { groupMachine } from "@/lib/license";
import { useSettings } from "@/lib/settings";

function n(value: number, digits = 1, unit = "") {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${unit}` : "—";
}

function snapshot() {
  const s = useSettings.getState();
  const r = engine.readout;
  const meta = getPumpType(s.pumpType);
  const cond = conditionOf({
    pumpType: s.pumpType,
    pole: s.pole,
    gridHz: s.gridHz,
    rpm: s.rpm,
    blades: s.blades,
    flow: s.flow,
    head: s.head,
    npsh: s.npsh,
    clearance: s.clearance,
    actualFlow: s.actualFlow,
    ratedCurrent: s.ratedCurrent,
    actualCurrent: s.actualCurrent,
    voltage: s.voltage,
  });
  const sourceLabel = s.source === "mic" ? "麦克风（现场声）" : s.source === "ref" ? "1 kHz 自检" : "演示声源";
  const stamp = new Date();
  return { s, r, meta, cond, sourceLabel, stamp };
}

export function buildReport(machine: string) {
  const { s, r, meta, cond, sourceLabel, stamp } = snapshot();
  const scenarioName = r.running ? "现场采样" : "最近一次采样";
  const flowText = (value: number) =>
    s.flowUnit === "lmin"
      ? `${n(value * 16.6667, 0, " L/min")}（${n(value, 2, " m³/h")}）`
      : `${n(value, 2, " m³/h")}（${n(value * 16.6667, 0, " L/min")}）`;
  const date = stamp.toLocaleString("zh-CN", { hour12: false });
  const fileName = `泵噪监测报告-${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}-${String(stamp.getHours()).padStart(2, "0")}${String(stamp.getMinutes()).padStart(2, "0")}.txt`;

  const bands = THIRD_OCTAVE.map((band, index) => `${band.fc}:${n(engine.octaveDb[index] ?? Number.NaN, 1)}`).join(" | ");

  // 轴频跟踪行（信号质量节）：数值一律带 95% 不确定度（评审 17 §1）
  const shaftTrackLine = (() => {
    const st = r.shaft;
    if (!st) return "  轴频跟踪：未运行（启动段或谱线弱）";
    if (st.ambiguous) {
      return st.insufficientSnr
        ? `  轴频跟踪：转速不确定（主梳 SNR ${st.lineSnrDb.toFixed(1)} dB < 10 dB，无法判断亚谐波有无），阶次结论已禁用，不给数值`
        : `  轴频跟踪：转速不确定（1/2× 与 1/3× 亚谐波同时成立，分数阶谱线占比 ${(st.subharmonicRatio * 100).toFixed(0)}%），阶次结论已禁用，不给数值`;
    }
    const err = `± ${(st.trackedF0UncertaintyHz * 60).toFixed(0)} r/min / ± ${st.trackedF0UncertaintyHz.toFixed(2)} Hz`;
    const flag = st.mismatch
      ? `⚠ 偏差 ${st.rpmDeltaPct.toFixed(1)}% ± ${st.rpmDeltaPctUncertainty.toFixed(1)}%（>5% 且超出 3σ），阶次结论已禁用`
      : `偏差 ${st.rpmDeltaPct.toFixed(1)}% ± ${st.rpmDeltaPctUncertainty.toFixed(1)}%，合规`;
    return `  轴频跟踪：实测 ${(st.trackedF0 * 60).toFixed(0)} r/min（${st.trackedF0.toFixed(2)} ${err}） vs 铭牌 ${(st.ratedF0 * 60).toFixed(0)} r/min（${st.ratedF0.toFixed(2)} Hz）；${flag}；${st.windowCount} 窗 / ${st.spanSec.toFixed(1)} s，谐波梳强度 ${st.combScore.toFixed(2)}`;
  })();

  // 事件轨行（信号质量节）
  const eventRailLine = (() => {
    const ev = r.event;
    if (!ev) return "  事件轨：暂无短帧数据";
    const gate =
      ev.gateFrozen && ev.crestGate !== null
        ? `crest 冻结门限 ${ev.crestGate.toFixed(2)}（中位 ${ev.crestMedian?.toFixed(2)} + 3.5σ×${ev.crestScale?.toFixed(2)}，基线 v${ev.gateVersion}）`
        : ev.historyReady
          ? "门限未冻结（历史已够，但运行期不自动更新），仅记录不报警"
          : "设备历史不足 200 帧且门限未冻结，仅记录不报警";
    const clip = ev.clipped ? "当前削顶，峭度判据已屏蔽" : "未削顶";
    return `  事件轨：累计冲击 ${ev.eventCount} 次，近期 ${ev.eventsPerSec.toFixed(1)} 次/秒，平均峭度 ${ev.meanKurtosis.toFixed(1)} · 波峰 ${ev.meanCrest.toFixed(2)}；${gate}；${clip}`;
  })();

  // 摆位指纹行（信号质量节）：只同设备可比，换机按"需重新标定"处理
  const placementLine = (() => {
    const p = r.placement;
    if (!p) return "  摆位指纹：暂无（未学习基线或尚未采集到有效谱）";
    const state =
      p.state === "moved"
        ? "⚠ 疑似移动设备，建议重新标定（连续 ≥2 次超限）"
        : p.state === "device_changed"
          ? "检测设备已更换，需重新标定（本次不告警）"
          : p.state === "uncalibrated"
            ? "尚未标定，下次建基线时记录"
            : "稳定";
    return `  摆位指纹（4–8 kHz / 1–2 kHz 对数能量比）：较基线偏移 ${p.delta.toFixed(2)}（${state}）`;
  })();

  // 基线元数据行（单独一节）
  const baselineMetaLine = (() => {
    // 尝试拿完整 Baseline 对象
    let version = 0;
    let createdAt = "";
    let runHours = 0;
    let shaftBaseline = "";
    const device = `${s.pumpType}|${(s.model || "未填写").slice(0, 24)}|${s.distance.toFixed(2)}m|${s.micDir}`;
    const key = `${device}|bg${r.bgVersion}`;
    try {
      const b = loadBaseline(key);
      if (b) {
        version = b.version;
        createdAt = b.createdAt;
        runHours = b.runMinutes / 60;
        // 轴频基准连同 95% 不确定度一起固化（评审 17 §1）
        if (b.shaftHz !== null) {
          const sigma = b.shaftHzSigma ?? Number.NaN;
          shaftBaseline = `轴频基准 ${b.shaftHz.toFixed(2)} ± ${sigma.toFixed(2)} Hz`;
        }
      }
    } catch { /* localStorage 可能不可用 */ }
    const age = r.age;
    const parts = [
      `基线 ${r.baselineFrames} 帧 / ${r.baselineBuckets} 档`,
      `版本 ${version || 1}`,
      createdAt ? `建立时间 ${createdAt.slice(0, 10)}` : "",
      age ? `已建立 ${age.daysSinceCreated} 天` : "",
      runHours > 0 ? `累计运行 ${runHours.toFixed(0)} 小时` : "",
      `背景谱版本 ${r.bgVersion}`,
      shaftBaseline,
      age?.maintenanceBlocked ? "⚠ 维修事件已作废旧基线" : "",
      age?.needsResample ? "⚠ 建议重新采集" : "",
    ].filter(Boolean);
    return `  ${parts.join(" · ")}`;
  })();

  const alarmLines = s.alarms.length
    ? s.alarms.map((alarm) => `  ${new Date(alarm.at).toLocaleString("zh-CN", { hour12: false })}  ${alarm.db.toFixed(1)} dB  ${alarm.note}`).join("\n")
    : "  无";

  const probabilityLines = r.diagnosis?.directions?.length
    ? r.diagnosis.directions.map((item) => `  ${item.title}：${item.probability.toFixed(1)}%  ${item.note}`).join("\n")
    : "  无";

  const lines = [
    "泵噪监测台 · 现场检测报告",
    "==============================",
    `生成时间：${date}`,
    `机器码：${groupMachine(machine)}`,
    "",
    "一、设备与工况",
    `  泵型：${meta.name}`,
    `  型号 / 位号：${s.model || "未填写"}`,
    `  工况：${scenarioName}`,
    `  电机极数：${s.pole} 极    电网频率：${s.gridHz} Hz（同步转速 ${syncRpm(s.pole, s.gridHz).toFixed(0)} r/min）`,
    `  运行转速：${s.rpm} r/min（1× = ${(s.rpm / 60).toFixed(1)} Hz，滑差 ${cond.slipPct.toFixed(1)}%）`,
    `  ${meta.bladeLabel}：${s.blades}（${meta.bpfLabel} = ${cond.bpf.toFixed(1)} Hz）`,
    `  额定流量：${flowText(s.flow)}`,
    `  实际流量：${flowText(s.actualFlow)}（流量比 ${(cond.flowRatio * 100).toFixed(0)}%）`,
    `  额定扬程：${n(s.head, 1, " m")}    实际扬程：${n(cond.headActual, 1, " m")}`,
    `  NPSH 余量：${n(s.npsh, 2, " m")}`,
    `  叶轮间隙：${n(s.clearance, 2, " mm")}    测点距离：${n(s.distance, 2, " m")}    麦克风朝向：${s.micDir}`,
    "",
    "二、电机与电流",
    `  额定功率：${n(s.ratedPower, 1, " kW")}    额定电压：${n(s.voltage, 0, " V")}`,
    `  额定电流：${n(s.ratedCurrent, 1, " A")}    实际电流：${n(s.actualCurrent, 1, " A")}（偏离 ${cond.currentDevPct >= 0 ? "+" : ""}${cond.currentDevPct.toFixed(1)}%）`,
    `  负载率：${(cond.loadRatio * 100).toFixed(1)}%${cond.overCurrent ? "（过电流）" : cond.underLoad ? "（低负载）" : ""}`,
    `  水力功率：${n(cond.hydraulicKw, 2, " kW")}    轴功率：${n(cond.shaftKw, 2, " kW")}    输入功率：${n(cond.inputKw, 2, " kW")}`,
    `  泵效：${(cond.pumpEff * 100).toFixed(0)}%    电机效率：${(cond.motorEff * 100).toFixed(0)}%    估算温升：${cond.tempRise.toFixed(0)} K`,
    `  参考频率：1× ${cond.f0.toFixed(1)} Hz    0.5× ${cond.halfOrder.toFixed(1)} Hz    BPF/TPF ${cond.bpf.toFixed(1)} Hz    2×工频 ${cond.line2x} Hz`,
    cond.notes.length ? `  工况提示：${cond.notes.join("；")}` : "",
    "",
    "三、测量设置与结果",
    `  声源：${sourceLabel}`,
    `  频率计权：${s.weighting}`,
    `  读数口径：未校准相对声级 dBFS（满度 0 dBFS）`,
    `  快挡：${n(r.fast, 1, " dBFS")}`,
    `  慢挡：${n(r.slow, 1, " dBFS")}`,
    `  相对 Leq(1 s)：${n(r.leq1, 1, " dBFS")}`,
    `  相对 Leq(10 s)：${n(r.leq10, 1, " dBFS")}`,
    `  C 计权峰值：${n(r.cpeak, 1, " dBFS")}`,
    `  本次最大：${n(r.lmax, 1, " dBFS")}`,
    `  主频：${n(r.dominantHz, 0, " Hz")}`,
    `  峭度：${n(r.kurtosis, 1)}    波峰因数：${n(r.crest, 2)}`,
    `  高频比：${n(r.hfRatio, 2)}    频谱平坦度：${n(r.flatness, 2)}`,
    "",
    "四、信号质量与降噪",
    `  全带信噪比：${n(r.snrDb, 0, " dB")}`,
    `  噪声底：${n(r.noiseFloorDb, 0, " dB")}    谱峰残留（musical noise）：${(r.music * 100).toFixed(0)}%`,
    `  降噪频带保留：${n(r.fidelity * 100, 0, "%")}（判决始终使用原始谱）`,
    `  分析窗口：${r.analysisReady ? `${r.windowSec.toFixed(2)} s · ${engine.analysisFftSize} 点 FFT` : "粗谱降级路径"}`,
    `  采样率真值：${engine.sampleRate} Hz（${r.sampleRateOk ? "合规" : r.sampleRateNote ?? "不是 48 kHz，结论已失效"}）`,
    `  运行态：${r.phase}    阶次结论：${r.ordersReliable ? "可用" : "已禁用（窗内转数不足或低转速）"}`,
    `  输入削顶：${r.clipped ? "是（读数不可信）" : "否"}    削顶率：${(r.clipRate * 100).toFixed(3)}%`,
    `  AGC：${r.agc ? "检出全频带同步平移，读数不可信" : "未检出"}    掉帧：${r.droppedFrames} 块    麦克风：${r.mic}`,
    `  算法版本：${ALGORITHM_VERSION}`,
    shaftTrackLine,
    eventRailLine,
    placementLine,
    "",
    "五、基线与老化",
    baselineMetaLine,
    ...(r.age?.notes.length ? [`  基线提示：${r.age.notes.join("；")}`] : []),
    "",
    "六、工况判读",
    `  ${r.diagnosis?.title ?? "尚未生成判读"}`,
    `  严重度：${r.diagnosis?.severity ?? "—"}    把握：${r.diagnosis?.confidence ?? "—"}（${r.diagnosis?.confidencePct ?? "—"}%）`,
    `  ${r.diagnosis?.summary ?? "请先开始观测，待读数稳定后再生成报告。"}`,
    r.diagnosis?.evidence?.length ? `  依据：${r.diagnosis.evidence.join("  ")}` : "",
    r.diagnosis?.excluded?.length ? `  已排除：${r.diagnosis.excluded.join("  ")}` : "",
    `  建议：${r.diagnosis?.action ?? "—"}`,
    `  正常指纹偏离：${r.anomaly === null ? "基线未满足门槛" : `${r.anomaly.toFixed(0)}/100`}`,
    "  可能方向（仅排查提示，不是故障结论）：",
    probabilityLines,
    "",
    "七、报警记录",
    alarmLines,
    "",
    "八、三分之一倍频程声级（Hz:dB）",
    `  ${bands}`,
    "",
    "九、参考标准与数据来源",
    "  声级计：IEC 61672-1（A/C 计权、快/慢时间计权）。",
    "  电机：IEC 60034-1（额定值与温升限值）。",
    "  振动/噪声评价：ISO 10816-3 / ISO 20816-3；管道泵噪声：API 610。",
    "  泵性能：HI 9.6.7（泵效率与比转速换算）。",
    "  轴承特征阶次：通用 9 球近似（BPFO 3.58× / BPFI 5.42× / BSF 2.36× / FTF 0.398×）。",
    "  演示数据：参考 MIMII / DCASE 工业声学公开数据集与常见工程故障谱。",
    "",
    "十、声明",
    "  本报告由手机声学前端本地生成，未经计量检定。",
    `  实时读数为未校准的相对声级 dBFS，任何位置都不展示绝对 dB SPL。设备校准值 ${s.splAt0} dB 仅作 0 dBFS 换算小字说明${s.calOffset ? `，当前校准修正 ${s.calOffset.toFixed(1)} dB` : ""}。`,
    "  判断结论为声学线索，不能替代振动检测与拆检。",
    "",
    `  泵噪监测台 · 作者: luhuqiang · luhuqiang@foxmail.com`,
  ];

  return { text: lines.join("\n"), fileName };
}

/** 便于转发到聊天/工单的短摘要。 */
export function buildSummary(machine: string) {
  const { s, r, meta, cond, stamp } = snapshot();
  const d = r.diagnosis;
  const lines = [
    `【泵噪快报】${meta.name} · ${s.model || "未填写型号"}`,
    `时间：${stamp.toLocaleString("zh-CN", { hour12: false })}`,
    `工况：${s.rpm} r/min · ${s.actualFlow.toFixed(1)} m³/h · 负载 ${(cond.loadRatio * 100).toFixed(0)}%`,
    d ? `结论：${d.title}（${d.severity}，把握 ${d.confidencePct}%）` : "结论：尚未生成判读",
    d ? `建议：${d.action}` : "",
    `信号：SNR ${Number.isFinite(r.snrDb) ? `${r.snrDb.toFixed(0)} dB` : "—"} · 保真 ${Number.isFinite(r.fidelity) ? `${(r.fidelity * 100).toFixed(0)}%` : "—"} · 基线 ${r.baselineFrames} 帧 / ${r.baselineBuckets} 档`,
    d?.directions?.length
      ? `方向：${d.directions.slice(0, 3).map((item) => `${item.title} ${item.probability.toFixed(0)}%`).join(" / ")}`
      : "",
    `机器码：${groupMachine(machine)}`,
    "（声学线索，不能代替振动检测）",
  ];
  return lines.filter(Boolean).join("\n");
}

/** 结构化导出，便于二次分析或接入工单系统。 */
export function buildJson(machine: string) {
  const { s, r, meta, cond, sourceLabel, stamp } = snapshot();
  const data = {
    app: "pump-noise-monitor",
    version: 3,
    algorithmVersion: ALGORITHM_VERSION,
    generatedAt: stamp.toISOString(),
    machine: groupMachine(machine),
    device: {
      pumpType: s.pumpType,
      pumpName: meta.name,
      model: s.model,
      bladeLabel: meta.bladeLabel,
      blades: s.blades,
      bpfLabel: meta.bpfLabel,
    },
    condition: {
      source: sourceLabel,
      pole: s.pole,
      gridHz: s.gridHz,
      syncRpm: Number(syncRpm(s.pole, s.gridHz).toFixed(1)),
      rpm: s.rpm,
      slipPct: Number(cond.slipPct.toFixed(2)),
      ratedFlow: s.flow,
      actualFlow: s.actualFlow,
      flowRatio: Number(cond.flowRatio.toFixed(3)),
      head: s.head,
      headActual: Number(cond.headActual.toFixed(2)),
      npsh: s.npsh,
      clearance: s.clearance,
      distance: s.distance,
      ratedPower: s.ratedPower,
      voltage: s.voltage,
      ratedCurrent: s.ratedCurrent,
      actualCurrent: s.actualCurrent,
      loadRatio: Number(cond.loadRatio.toFixed(3)),
      f0: Number(cond.f0.toFixed(2)),
      bpf: Number(cond.bpf.toFixed(2)),
      line2x: cond.line2x,
      notes: cond.notes,
    },
    levels: {
      weighting: s.weighting,
      splAt0Calibration: s.splAt0,
      calOffset: s.calOffset,
      fast: r.fast,
      slow: r.slow,
      leq1: r.leq1,
      leq10: r.leq10,
      cpeak: r.cpeak,
      lmax: r.lmax,
      dominantHz: r.dominantHz,
      kurtosis: r.kurtosis,
      crest: r.crest,
      hfRatio: r.hfRatio,
      flatness: r.flatness,
    },
    quality: {
      analysisReady: r.analysisReady,
      windowSec: r.windowSec,
      fftSize: engine.analysisFftSize,
      analysisSampleRate: engine.analysisSampleRate,
      snrDb: r.snrDb,
      noiseFloorDb: r.noiseFloorDb,
      fidelity: r.fidelity,
      music: r.music,
      clipped: r.clipped,
      clipRate: r.clipRate,
      agc: r.agc,
      mic: r.mic,
      sampleRate: engine.sampleRate,
      sampleRateOk: r.sampleRateOk,
      sampleRateNote: r.sampleRateNote,
      droppedFrames: r.droppedFrames,
      phase: r.phase,
      ordersReliable: r.ordersReliable,
      levelUnit: "dBFS",
    },
    baseline: {
      frames: r.baselineFrames,
      buckets: r.baselineBuckets,
      ready: r.baselineReady,
      backgroundVersion: r.bgVersion,
      anomaly: r.anomaly,
      age: r.age
        ? {
            daysSinceCreated: r.age.daysSinceCreated,
            runHours: Number(r.age.runHours.toFixed(1)),
            needsResample: r.age.needsResample,
            maintenanceBlocked: r.age.maintenanceBlocked,
            notes: r.age.notes,
          }
        : null,
    },
    shaftTrack: r.shaft
      ? {
          trackedF0Hz: Number(r.shaft.trackedF0.toFixed(3)),
          trackedF0UncertaintyHz: Number.isFinite(r.shaft.trackedF0UncertaintyHz)
            ? Number(r.shaft.trackedF0UncertaintyHz.toFixed(3))
            : null,
          ratedF0Hz: Number(r.shaft.ratedF0.toFixed(3)),
          rpmDeltaPct: Number.isFinite(r.shaft.rpmDeltaPct)
            ? Number(r.shaft.rpmDeltaPct.toFixed(2))
            : null,
          rpmDeltaPctUncertainty: Number.isFinite(r.shaft.rpmDeltaPctUncertainty)
            ? Number(r.shaft.rpmDeltaPctUncertainty.toFixed(2))
            : null,
          reliable: r.shaft.reliable,
          mismatch: r.shaft.mismatch,
          combScore: Number(r.shaft.combScore.toFixed(2)),
          ambiguous: r.shaft.ambiguous,
          subharmonic: r.shaft.subharmonic,
          subharmonicRatio: Number(r.shaft.subharmonicRatio.toFixed(2)),
          lineSnrDb: Number(r.shaft.lineSnrDb.toFixed(1)),
          insufficientSnr: r.shaft.insufficientSnr,
          windowCount: r.shaft.windowCount,
          spanSec: Number(r.shaft.spanSec.toFixed(1)),
        }
      : null,
    eventRail: r.event
      ? {
          eventCount: r.event.eventCount,
          eventsPerSec: Number(r.event.eventsPerSec.toFixed(1)),
          meanKurtosis: Number(r.event.meanKurtosis.toFixed(2)),
          meanCrest: Number(r.event.meanCrest.toFixed(2)),
          lastKurtosis: Number(r.event.lastKurtosis.toFixed(2)),
          lastCrest: Number(r.event.lastCrest.toFixed(2)),
          lastEventAtMs: r.event.lastEventAtMs,
          crestGate: r.event.crestGate === null ? null : Number(r.event.crestGate.toFixed(2)),
          crestMedian: r.event.crestMedian === null ? null : Number(r.event.crestMedian.toFixed(2)),
          crestScale: r.event.crestScale === null ? null : Number(r.event.crestScale.toFixed(2)),
          gateFrozen: r.event.gateFrozen,
          gateVersion: r.event.gateVersion,
          historyReady: r.event.historyReady,
          clipped: r.event.clipped,
        }
      : null,
    placement: r.placement
      ? { delta: Number(r.placement.delta.toFixed(3)), state: r.placement.state, streak: r.placement.streak }
      : null,
    evidencePng: r.evidencePng ?? null,
    diagnosis: r.diagnosis
      ? {
          status: r.diagnosis.status,
          title: r.diagnosis.title,
          severity: r.diagnosis.severity,
          confidence: r.diagnosis.confidence,
          confidencePct: r.diagnosis.confidencePct,
          summary: r.diagnosis.summary,
          action: r.diagnosis.action,
          evidence: r.diagnosis.evidence,
          excluded: r.diagnosis.excluded,
          directions: r.diagnosis.directions,
        }
      : null,
    envelope: r.envelope
      ? {
          band: r.envelope.band,
          strongest: r.envelope.strongest,
          repHz: r.envelope.repHz,
          repOrder: r.envelope.repOrder,
          bearingScore: r.envelope.bearingScore,
          burstScore: r.envelope.burstScore,
          envKurtosis: r.envelope.envKurtosis,
          matches: r.envelope.matches,
        }
      : null,
    octaveThird: THIRD_OCTAVE.map((band, index) => ({
      fc: band.fc,
      db: engine.octaveDb[index] ?? null,
    })),
    alarms: s.alarms,
  };
  return { text: JSON.stringify(data, null, 2), fileName: "泵噪监测数据.json" };
}
