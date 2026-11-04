/**
 * S4 基线学习模块
 *
 * 基线学习 / 偏离分 / 老化 / 维修事件 的薄封装，内部实现由 fingerprint.ts 承担。
 * 本文件是 S4 验收门禁要求的模块边界，便于未来替换实现。
 */
export {
  MIN_BASELINE_BUCKETS,
  MIN_BASELINE_FRAMES,
  BASELINE_AGE_DAYS,
  BASELINE_RUN_HOURS,
  BASELINE_ABNORMAL_DAYS,
  BASELINE_ANOMALY_THRESHOLD,
  deviceKey,
  baselineKey,
  conditionBucket,
  loadBaseline,
  resetBaseline,
  baselineInfo,
  learnBaseline,
  updateBaselineAccess,
  anomalyOf,
  recordMaintenance,
  type Baseline,
  type BaselineBucket,
  type BaselineInfo,
  type AgeInfo,
  type ConditionBucket,
} from "./fingerprint.ts";