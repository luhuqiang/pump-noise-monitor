/**
 * S8 复测对比（同工况同几何可比）。
 * 冻结规则（见 06 GT29/GT30 / S8 验收卡 §2 前置 2）：
 *   Δ ≤ 1.5 dB  →  comparable = true
 *   Δ > 1.5 dB  →  comparable = false
 * 边界 1.4/1.6：1.4 必须可比，1.6 必须不可比。
 */

/** 复测输入：两个样本的 dB 值 + 几何/工况可比标记。 */
export type RetestInput = {
  /** 基线 dB 总声压级 */
  baselineDb: number;
  /** 复测 dB 总声压级 */
  retestDb: number;
  /** 几何可比（同摆位、同距离、同传感器位置） */
  geometryComparable: boolean;
  /** 工况可比（同负载档、同转速、同介质） */
  conditionComparable: boolean;
};

/** 复测输出。 */
export type RetestResult = {
  /** |复测 - 基线|，保留 2 位（验收卡 §11 遗留 3） */
  delta_db: number;
  /** 输入原样回传（便于证据落盘） */
  geometry_comparable: boolean;
  condition_comparable: boolean;
  /** 综合可比 = Δ≤1.5 且几何/工况均可比 */
  result: "comparable" | "not_comparable";
  /** 冻结的阈值（dB） */
  threshold_db: 1.5;
};

/** 核心阈值：Δ≤此值判可比。 */
export const RETEST_THRESHOLD_DB = 1.5;

/**
 * 计算复测 Δ 并判定可比。
 * 先判 Δ，再叠加几何/工况门禁。
 */
export function compareRetest(input: RetestInput): RetestResult {
  const rawDelta = Math.abs(input.retestDb - input.baselineDb);
  const delta_db = Math.round(rawDelta * 100) / 100;

  const deltaOk = delta_db <= RETEST_THRESHOLD_DB;
  const geometricOk = Boolean(input.geometryComparable);
  const conditionOk = Boolean(input.conditionComparable);

  const comparable = deltaOk && geometricOk && conditionOk;

  return {
    delta_db,
    geometry_comparable: geometricOk,
    condition_comparable: conditionOk,
    result: comparable ? "comparable" : "not_comparable",
    threshold_db: RETEST_THRESHOLD_DB,
  };
}
