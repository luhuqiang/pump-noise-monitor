export const REF_DBFS = -36;

export type PumpTypeId = "centrifugal" | "vortex";
export type Severity = "健康" | "注意" | "警告" | "危险";

export type PumpTypeMeta = {
  id: PumpTypeId;
  name: string;
  english: string;
  tagline: string;
  description: string;
  bladeLabel: string;
  bladeHint: string;
  bpfLabel: string;
  bpfLong: string;
  defaults: {
    rpm: number;
    blades: number;
    flow: number;
    head: number;
    npsh: number;
    clearance: number;
    distance: number;
    ratedPower: number;
    ratedCurrent: number;
    voltage: number;
  };
};

export const PUMP_TYPES: PumpTypeMeta[] = [
  {
    id: "centrifugal",
    name: "离心泵",
    english: "CENTRIFUGAL",
    tagline: "大流量 · 高扬程",
    description:
      "叶轮高速旋转，把动能转换成压力能。噪声以叶片通过频率（BPF）为骨架，汽蚀和机械激励会改变谱形。",
    bladeLabel: "叶片数",
    bladeHint: "常见 4–8 片，可设 2–16 片，决定 BPF = 转速/60 × 叶片数",
    bpfLabel: "BPF",
    bpfLong: "叶片通过频率",
    defaults: {
      rpm: 2800,
      blades: 6,
      flow: 30,
      head: 30,
      npsh: 2.5,
      clearance: 0.15,
      distance: 0.5,
      ratedPower: 4,
      ratedCurrent: 8.1,
      voltage: 380,
    },
  },
  {
    id: "vortex",
    name: "旋涡泵",
    english: "VORTEX",
    tagline: "小流量 · 高扬程 · 易自吸",
    description:
      "星形叶轮在侧向流道内反复能量交换。噪声以齿频为主，回流湍流、间隙泄漏和吸入空气是它的典型故障特征。",
    bladeLabel: "叶轮齿数",
    bladeHint: "常见 20–28 齿，可设 6–80 齿，决定齿频 TPF = 转速/60 × 齿数",
    bpfLabel: "TPF",
    bpfLong: "齿频",
    defaults: {
      rpm: 2800,
      blades: 24,
      flow: 6,
      head: 25,
      npsh: 1.5,
      clearance: 0.08,
      distance: 0.3,
      ratedPower: 1.5,
      ratedCurrent: 3.6,
      voltage: 380,
    },
  },
];

export type PumpScenario = {
  id:
    | "healthy"
    | "cavitation"
    | "imbalance"
    | "looseness"
    | "bearing"
    | "misalignment"
    | "impeller-wear"
    | "throttle"
    | "vortex-healthy"
    | "vortex-cavitation"
    | "vortex-clearance"
    | "vortex-air"
    | "vortex-bearing"
    | "vortex-misalignment"
    | "vortex-blockage"
    | "vortex-rubbing";
  pump: PumpTypeId;
  mode: number;
  name: string;
  severity: Severity;
  targetDb: number;
  blurb: string;
  signature: string;
  indicators: string[];
  action: string;
};

export const SCENARIOS: PumpScenario[] = [
  {
    id: "healthy",
    pump: "centrifugal",
    mode: 0,
    name: "离心泵 · 平稳",
    severity: "健康",
    targetDb: 76,
    blurb: "叶片通过频率清楚，高频本底低。名义声级按 0 dBFS = 120 dB 制作。",
    signature: "BPF 谱线清楚，1× 与半阶次很低，2 kHz 以上本底干净。",
    indicators: ["BPF / 1× 功率比", "高频比", "峭度"],
    action: "记录转速、流量与测点距离，作为后续趋势比较的基线。",
  },
  {
    id: "cavitation",
    pump: "centrifugal",
    mode: 1,
    name: "离心泵 · 汽蚀",
    severity: "危险",
    targetDb: 97,
    blurb: "同样的叶片音被 2 kHz 以上的宽带噪声盖住，声级也抬高。",
    signature: "2–8 kHz 宽带明显抬升，叶片谱线被淹没，伴随嘶鸣与流量抖动。",
    indicators: ["高频比 ≥ 0.9", "频谱平坦度", "NPSH 余量"],
    action: "核对进口压力、过滤器压差与 NPSH 余量；必要时降流量试运行。",
  },
  {
    id: "imbalance",
    pump: "centrifugal",
    mode: 2,
    name: "离心泵 · 不平衡",
    severity: "警告",
    targetDb: 83,
    blurb: "1 倍转频被加重。可改转速，看这根谱线跟着动。",
    signature: "1× 转频显著抬高，BPF 相对减弱，低频段出现窄带峰。",
    indicators: ["1× / BPF 比", "振动 1×", "对中状态"],
    action: "检查叶轮结垢、磨损与动平衡；复核联轴器对中与轴承游隙。",
  },
  {
    id: "looseness",
    pump: "centrifugal",
    mode: 3,
    name: "离心泵 · 松动",
    severity: "警告",
    targetDb: 88,
    blurb: "半阶次和一长串转频谐波。名义声级会越过警告线。",
    signature: "0.5×、1.5× 等半阶次与整数谐波成串出现，谱形较宽。",
    indicators: ["半阶次比", "谐波数", "地脚振动"],
    action: "检查地脚螺栓、轴承座、联轴器与管路支撑的紧固状态。",
  },
  {
    id: "bearing",
    pump: "centrifugal",
    mode: 4,
    name: "离心泵 · 轴承冲击",
    severity: "注意",
    targetDb: 80,
    blurb: "重复冲击把峭度和波峰因数拉高，总声级不一定很大。",
    signature: "周期冲击抬高潮底，峭度与波峰因数升高，冲击重复率约 3.07×。",
    indicators: ["峭度 ≥ 6", "波峰因数 ≥ 2.8", "冲击重复率"],
    action: "检查润滑与轴承游隙，用振动包络谱确认滚动体或滚道缺陷。",
  },
  {
    id: "misalignment",
    pump: "centrifugal",
    mode: 10,
    name: "离心泵 · 对中不良",
    severity: "警告",
    targetDb: 85,
    blurb: "联轴器对中偏差会把 2× 转频抬起来，常被误当成普通不平衡。",
    signature: "1× 与 2× 转频同时增强，2× 接近甚至超过 1×，BPF 相对减弱。",
    indicators: ["2× / 1× 比", "1× / BPF 比", "联轴器对中"],
    action: "用激光对中仪复核联轴器，检查电机软脚、泵体地脚与管路应力。",
  },
  {
    id: "impeller-wear",
    pump: "centrifugal",
    mode: 11,
    name: "离心泵 · 叶轮磨损",
    severity: "注意",
    targetDb: 82,
    blurb: "叶轮结垢或磨损会削弱叶片音，同时抬高中高频宽带。",
    signature: "BPF 谱线下降，1× 与 2× 略升，中高频本底抬高，扬程和流量下降。",
    indicators: ["BPF 降低", "高频比", "扬程 / 流量"],
    action: "检查叶轮结垢、磨损与口环间隙，必要时做性能试验并重新动平衡。",
  },
  {
    id: "throttle",
    pump: "centrifugal",
    mode: 12,
    name: "离心泵 · 出口节流",
    severity: "警告",
    targetDb: 88,
    blurb: "阀门关小后湍流与管路共振增强，噪声里出现低频轰鸣。",
    signature: "BPF 相对减弱，低频湍流与 0.5×、1.5× 脉动抬升，阀门与管路噪声增加。",
    indicators: ["低频湍流", "BPF / 1× 比", "阀门开度"],
    action: "核对阀门开度、管路支撑与共振频率，避免长期在小流量节流工况运行。",
  },
  {
    id: "vortex-healthy",
    pump: "vortex",
    mode: 5,
    name: "旋涡泵 · 平稳",
    severity: "健康",
    targetDb: 78,
    blurb: "齿频与二次齿频清楚，回流湍流低。适合作为旋涡泵的基线。",
    signature: "TPF 与 2× TPF 谱线清楚，低频回流噪声低，无周期性脉动。",
    indicators: ["TPF / 1× 比", "频谱平坦度", "低频脉动"],
    action: "记录齿频、流量与自吸高度，作为同型号设备的比较基线。",
  },
  {
    id: "vortex-cavitation",
    pump: "vortex",
    mode: 6,
    name: "旋涡泵 · 汽蚀",
    severity: "危险",
    targetDb: 94,
    blurb: "齿频被高频嘶鸣盖住，吸入不足时旋涡泵比离心泵更容易汽蚀。",
    signature: "2–8 kHz 宽带嘶鸣抬升，齿频减弱，流量与电流出现波动。",
    indicators: ["高频比 ≥ 0.9", "频谱平坦度", "自吸高度 / NPSH"],
    action: "检查吸入管路漏气、过滤器堵塞与液位；核对 NPSH 余量和自吸高度。",
  },
  {
    id: "vortex-clearance",
    pump: "vortex",
    mode: 7,
    name: "旋涡泵 · 间隙磨损",
    severity: "警告",
    targetDb: 86,
    blurb: "叶轮与流道间隙变大后，回流湍流增强，齿频反而变弱。",
    signature: "1× 与低次谐波增强、齿频减弱，低频回流噪声与扬程下降同时出现。",
    indicators: ["1× / TPF 比", "频谱平坦度", "轴向间隙"],
    action: "测量叶轮与流道轴向、径向间隙；磨损超差时更换叶轮或泵体。",
  },
  {
    id: "vortex-air",
    pump: "vortex",
    mode: 8,
    name: "旋涡泵 · 吸入空气",
    severity: "警告",
    targetDb: 90,
    blurb: "气液混输让噪声周期性阵发，半阶次和低频脉动同时出现。",
    signature: "噪声周期性地“鼓包”，0.5×、1.5× 谱线与低频脉动明显，流量摆动。",
    indicators: ["半阶次比", "低频脉动", "流量波动"],
    action: "检查吸入管路密封、液位与排气阀；避免长时间气液混输运行。",
  },
  {
    id: "vortex-bearing",
    pump: "vortex",
    mode: 9,
    name: "旋涡泵 · 轴承冲击",
    severity: "注意",
    targetDb: 82,
    blurb: "齿频仍在，但冲击重复率把谱底和峭度一起抬高。",
    signature: "周期冲击抬高潮底，峭度与波峰因数升高，齿频谱线仍可辨认。",
    indicators: ["峭度 ≥ 6", "波峰因数 ≥ 2.8", "冲击重复率"],
    action: "检查轴承润滑、游隙与叶轮扫膛；结合振动包络谱定位。",
  },
  {
    id: "vortex-misalignment",
    pump: "vortex",
    mode: 13,
    name: "旋涡泵 · 对中不良",
    severity: "警告",
    targetDb: 84,
    blurb: "联轴器对中偏差让 1× 与 2× 一起增强，齿频相对被压低。",
    signature: "1× 与 2× 转频增强，2× 常接近 1×，TPF 与 2× TPF 相对减弱。",
    indicators: ["2× / 1× 比", "1× / 齿频比", "联轴器对中"],
    action: "复核联轴器对中与电机软脚，检查泵体与底座是否受管路应力牵拉。",
  },
  {
    id: "vortex-blockage",
    pump: "vortex",
    mode: 14,
    name: "旋涡泵 · 出口堵塞",
    severity: "警告",
    targetDb: 88,
    blurb: "出口受阻会让流量摆动、低频阵发，半阶次谱线随之增强。",
    signature: "低频阵发与 0.5×、1.5× 谱线增强，齿频下降，流量和电流周期性摆动。",
    indicators: ["半阶次比", "低频脉动", "出口压力"],
    action: "检查出口阀、过滤器与管路堵塞；核对出口压力与电机电流是否摆动。",
  },
  {
    id: "vortex-rubbing",
    pump: "vortex",
    mode: 15,
    name: "旋涡泵 · 叶轮扫膛",
    severity: "警告",
    targetDb: 83,
    blurb: "叶轮与泵体轻微碰磨，周期性冲击把峭度和波峰因数一起拉高。",
    signature: "高频碰磨冲击叠加在齿频上，峭度与波峰因数升高，严重时出现金属摩擦声。",
    indicators: ["峭度 ≥ 6", "波峰因数", "碰磨痕迹"],
    action: "停机检查叶轮与流道间隙、轴向窜动和轴承游隙，确认无扫膛痕迹。",
  },
];

export type ScenarioId = PumpScenario["id"];

export function getScenario(id: ScenarioId) {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]!;
}

export function getPumpType(id: PumpTypeId) {
  return PUMP_TYPES.find((p) => p.id === id) ?? PUMP_TYPES[0]!;
}

export function scenariosFor(type: PumpTypeId) {
  return SCENARIOS.filter((s) => s.pump === type);
}

export function defaultScenarioFor(type: PumpTypeId) {
  return scenariosFor(type)[0]!;
}
