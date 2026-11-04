/**
 * S5：ReportManifest — 报告 2.0 的 8 键元数据 + 哈希链（对齐验收卡 §3.1）。
 * 门禁：缺 geometry 或 algorithm_version → 拒绝出报告；
 *       哈希必须对齐 PDF 实算；raw_available 固定 false；GT27 时 clock_drift 必须非空。
 */
import { ALGORITHM_VERSION } from "../audio/diagnose.ts";

export type ReportGeometry = {
  /** 摆位距离（米），null = 未知 */
  distanceM: number | null;
  /** 传感器位置描述（如 inlet/outlet/casing），null = 未知 */
  sensorPosition: string | null;
};

export type ReportCondition = {
  /** 工况档（常用/过载/轻载） */
  bucket: string | null;
  /** 基线版本号，null = 未建立 */
  baselineVersion: number | null;
  /** 基线键（测点 + bgVersion） */
  baselineKey: string | null;
};

export type ManifestInput = {
  /** 几何（distanceM + sensorPosition） */
  geometry: ReportGeometry;
  /** 工况 */
  condition?: ReportCondition;
  /** 算法版本（缺 → 拒绝出报告，GT21） */
  algorithmVersion?: string | null;
  /** 采样率真值（Hz） */
  sampleRateTrue: number;
  /** 采样率是否 OK */
  sampleRateOk?: boolean;
  /** 麦位 */
  micPosition: string | null;
  /** 报告字节数据（PDF 或 PNG 二进制） */
  reportBytes: Uint8Array;
  /** 生成时间（ISO 8601，留空自动用当前） */
  generatedAt?: string;
  /** 时钟漂移（分钟），GT27 时必须非空；正常情况 null */
  clockDriftMin?: number | null;
};

/** ReportManifest — 卡面 §3.1 8 键 + 2 附加。 */
export type ReportManifest = {
  geometry: ReportGeometry;
  condition: ReportCondition | null;
  baseline_version: number | null;
  algorithm_version: string;
  sample_rate_true: number;
  mic_position: string | null;
  sha256: string;
  generated_at: string;
  /** 附加：默认 false（卡面 §3.2） */
  raw_available: false;
  /** 附加：GT27 用，正常 null */
  clock_drift_min: number | null;
};

/** 断言 ManifestInput 门禁（S5 卡面 §6 GT20/21）。 */
export function validateManifestInput(input: ManifestInput): string[] {
  const missing: string[] = [];
  // GT20：缺 geometry → 拒绝
  if (!input.geometry) missing.push("geometry");
  else {
    if (input.geometry.distanceM !== null && !Number.isFinite(input.geometry.distanceM))
      missing.push("geometry.distanceM");
  }
  // GT21：缺 algorithm_version → 拒绝
  if (!input.algorithmVersion) missing.push("algorithm_version");
  if (!input.sampleRateTrue || input.sampleRateTrue <= 0) missing.push("sample_rate_true");
  if (!input.reportBytes || input.reportBytes.length === 0) missing.push("report_bytes");
  return missing;
}

/** 计算字节的 SHA-256（浏览器 + Node 通用）。 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 构造 ReportManifest（先 validate，再算哈希）。 */
export async function buildManifest(input: ManifestInput): Promise<ReportManifest> {
  const missing = validateManifestInput(input);
  if (missing.length)
    throw new Error(`[S5 Manifest] 门禁拒绝（${missing.length}）：${missing.join(", ")}`);
  const sha256 = await sha256Hex(input.reportBytes);
  const alg = input.algorithmVersion ?? ALGORITHM_VERSION;
  return {
    geometry: input.geometry,
    condition: input.condition ?? null,
    baseline_version: input.condition?.baselineVersion ?? null,
    algorithm_version: alg,
    sample_rate_true: input.sampleRateTrue,
    mic_position: input.micPosition,
    sha256,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    raw_available: false,
    clock_drift_min: input.clockDriftMin ?? null,
  };
}

/** 校验 manifest.sha256 与文件实算是否匹配。 */
export async function verifyManifest(
  manifest: ReportManifest,
  bytes: Uint8Array,
): Promise<boolean> {
  const actual = await sha256Hex(bytes);
  return manifest.sha256.toLowerCase() === actual.toLowerCase();
}
