import type { PumpTypeId } from "@/lib/audio/scenarios";

/** 电机 + 泵在当前配置下的派生工况。所有量都由设置项实时计算，不做缓存。 */
export type ConditionInput = {
  pumpType: PumpTypeId;
  pole: number;
  gridHz: number;
  rpm: number;
  blades: number;
  flow: number;
  head: number;
  npsh: number;
  clearance: number;
  actualFlow: number;
  ratedCurrent: number;
  actualCurrent: number;
  voltage: number;
};

export type Condition = {
  syncRpm: number;
  slipPct: number;
  f0: number;
  bpf: number;
  halfOrder: number;
  line2x: number;
  loadRatio: number;
  flowRatio: number;
  headActual: number;
  hydraulicKw: number;
  shaftKw: number;
  inputKw: number;
  pumpEff: number;
  motorEff: number;
  tempRise: number;
  currentDevPct: number;
  specificSpeed: number;
  overCurrent: boolean;
  underLoad: boolean;
  cavitationRisk: boolean;
  clearanceRisk: boolean;
  notes: string[];
};

export function clampNum(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** 同步转速 n = 120 f / p。 */
export function syncRpm(pole: number, gridHz: number) {
  return (120 * gridHz) / Math.max(1, pole);
}

/**
 * 2 极按 56×工频、4 极按 28×工频估算运行转速，
 * 即 50 Hz 下 2 极约 2800 r/min、4 极约 1400 r/min，保留约 6.7% 的负载滑差。
 */
export function poleDefaultRpm(pole: number, gridHz: number) {
  return Math.round((pole === 2 ? 56 : 28) * gridHz);
}

/** 按额定功率、电压与极数估算三相异步电机额定电流。 */
export function estimateCurrent(powerKw: number, voltage: number, pole: number) {
  const cosPhi = pole === 2 ? 0.84 : 0.82;
  const motorEff = pole === 2 ? 0.86 : 0.88;
  const v = Math.max(100, voltage);
  const i = (Math.max(0, powerKw) * 1000) / (Math.sqrt(3) * v * cosPhi * motorEff);
  return Math.round(i * 10) / 10;
}

function pumpEffCeiling(specificSpeed: number, pumpType: PumpTypeId) {
  let eff: number;
  if (specificSpeed < 8) eff = 0.4;
  else if (specificSpeed < 15) eff = 0.55;
  else if (specificSpeed < 25) eff = 0.68;
  else if (specificSpeed < 40) eff = 0.78;
  else if (specificSpeed < 70) eff = 0.84;
  else eff = 0.8;
  // 旋涡泵靠多次能量交换，圆盘摩擦损失大，效率明显低于同比转速离心泵。
  return pumpType === "vortex" ? Math.min(eff, 0.48) : eff;
}

/**
 * 名义声级随转速与负载修正：转速按 15 lg(n/n₀)，负载按 12 lg(I/I₀)。
 * 参考点 1450 r/min（4 极 50 Hz 的典型运行转速）。
 */
export function targetDbFor(baseDb: number, rpm: number, loadRatio: number) {
  const speed = 15 * Math.log10(Math.max(300, rpm) / 1450);
  const load = 12 * Math.log10(clampNum(loadRatio, 0.25, 2));
  return baseDb + speed + load;
}

export function conditionOf(input: ConditionInput): Condition {
  const sync = syncRpm(input.pole, input.gridHz);
  const rpm = Math.max(1, input.rpm);
  const slipPct = ((sync - rpm) / sync) * 100;
  const f0 = rpm / 60;
  const bpf = f0 * Math.max(1, input.blades);
  const line2x = 2 * input.gridHz;

  const ratedCurrent = Math.max(0.1, input.ratedCurrent);
  const loadRatio = input.actualCurrent / ratedCurrent;
  const flowRatio = input.flow > 0 ? input.actualFlow / input.flow : 1;

  const headActual = input.head * (1.1 - 0.1 * clampNum(flowRatio, 0, 2.2));
  const hydraulicKw = 0.002725 * Math.max(0, input.actualFlow) * Math.max(0, headActual);
  const qm3s = Math.max(1e-4, input.actualFlow / 3600);
  const specificSpeed = headActual > 0 ? (rpm * Math.sqrt(qm3s)) / Math.pow(headActual, 0.75) : 0;
  const ceiling = pumpEffCeiling(specificSpeed, input.pumpType);
  const offDesign = Math.exp(-1.1 * Math.pow(1 - clampNum(flowRatio, 0, 2.2), 2));
  const pumpEff = clampNum(ceiling * offDesign, 0.05, 0.9);

  const motorBase = input.pole === 2 ? 0.86 : 0.88;
  const motorEff = clampNum(motorBase * (1 - 0.15 * Math.pow(1 - clampNum(loadRatio, 0.2, 1.6), 2)), 0.5, 0.95);

  const shaftKw = hydraulicKw / pumpEff;
  const inputKw = shaftKw / motorEff;
  const tempRise = 20 + 50 * Math.pow(clampNum(loadRatio, 0, 1.6), 2);
  const currentDevPct = ((input.actualCurrent - ratedCurrent) / ratedCurrent) * 100;

  const notes: string[] = [];
  if (slipPct > 5) notes.push(`滑差 ${slipPct.toFixed(1)}%，偏高，核对实际负载、供电电压与转子回路。`);
  if (loadRatio > 1.1) {
    notes.push(
      `实际电流 ${input.actualCurrent.toFixed(1)} A，超额定 ${currentDevPct.toFixed(0)}%，按 IEC 60034-1 关注绕组温升与保护整定。`,
    );
  } else if (loadRatio < 0.6) {
    notes.push(`负载率 ${(loadRatio * 100).toFixed(0)}%，低负荷运行，泵效与温升都偏低，注意最小连续流量。`);
  }
  if (flowRatio > 1.15) notes.push(`实际流量为额定点的 ${(flowRatio * 100).toFixed(0)}%，汽蚀与电机过载风险上升。`);
  if (input.npsh < 0.5) notes.push(`NPSH 余量 ${input.npsh.toFixed(1)} m，汽蚀风险高，优先核对进口压力与过滤器压差。`);
  else if (input.npsh < 1) notes.push(`NPSH 余量 ${input.npsh.toFixed(1)} m，偏紧；大流量工况下先做汽蚀排查。`);
  const clearanceLimit = input.pumpType === "vortex" ? 0.12 : 0.25;
  if (input.clearance > clearanceLimit) {
    notes.push(`叶轮间隙 ${input.clearance.toFixed(2)} mm 超过 ${clearanceLimit} mm，内泄漏与回流噪声会增强。`);
  }
  notes.push(`2×工频 ${line2x} Hz 是电磁噪声参考；振动验收按 ISO 10816-3 / ISO 20816-3，声学读数不能替代振动检测。`);

  return {
    syncRpm: sync,
    slipPct,
    f0,
    bpf,
    halfOrder: f0 / 2,
    line2x,
    loadRatio,
    flowRatio,
    headActual,
    hydraulicKw,
    shaftKw,
    inputKw,
    pumpEff,
    motorEff,
    tempRise,
    currentDevPct,
    specificSpeed,
    overCurrent: loadRatio > 1.1,
    underLoad: loadRatio < 0.6,
    cavitationRisk: input.npsh < 0.5 || (input.npsh < 1 && flowRatio > 0.9),
    clearanceRisk: input.clearance > clearanceLimit,
    notes,
  };
}
