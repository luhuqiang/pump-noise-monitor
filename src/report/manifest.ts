/**
 * S5：ReportManifest — 报告 2.0 的 8 键元数据 + 哈希链。
 * 门禁：缺键/哈希不符 → 拒绝出报告。
 */
import { ALGORITHM_VERSION } from "../audio/diagnose.ts";
import { baselineKey } from "../audio/fingerprint.ts";

/** 报告输入几何：摆位距离 + 传感器位置 + 基线版本 + 算法版本 + 采样率真值 + 麦位。 */
export type ReportGeometry = {
  /** 摆位距离（米），null = 未知 */
  distanceM: number | null;
  /** 传感器位置描述（如 inlet/outlet/casing），null = 未知 */
  sensorPosition: string | null;
  /** 基线版本号，null = 未建立 */
  baselineVersion: number | null;
  /** 基线键（测点 + bgVersion） */
  baselineKey: string | null;
  /** 工况档（常用/过载/轻载） */
  bucket: string | null;
};

export type ManifestInput = {
  /** 完整 report JSON（字符串） */
  reportJson: string;
  /** 几何元数据（6 键） */
  geometry: ReportGeometry;
  /** 算法版本（留空自动用 ALGORITHM_VERSION） */
  algorithmVersion?: string;
  /** 采样率真值 */
  sampleRate: number;
  /** 采样率是否与宣称一致（readout.sampleRateOk） */
  sampleRateOk: boolean;
  /** 麦位：采集时的传感器方向（inlet/outlet/unknown） */
  micDirection?: string;
  /** 生成时间（ISO 8601，留空自动用当前） */
  generatedAt?: string;
};

/** ReportManifest — S5 8 键。 */
export type ReportManifest = {
  /** 几何（摆位距离 + 传感器位置） */
  geometry: {
    distanceM: number | null;
    sensorPosition: string | null;
  };
  /** 工况（负载档 + 基线版本） */
  condition: {
    bucket: string | null;
    baselineVersion: number | null;
    baselineKey: string | null;
  };
  /** 算法版本 */
  algorithmVersion: string;
  /** 采样率真值（Hz）+ 是否 OK */
  sampleRate: { value: number; ok: boolean };
  /** 麦位 */
  micDirection: string | null;
  /** 哈希：report.json 的 SHA-256 hex（小写） */
  reportSha256: string;
  /** 生成时间（ISO 8601） */
  generatedAt: string;
  /** manifest 自身版本（schema v1） */
  manifestVersion: "1.0";
};

/** 断言 ManifestInput 8 键齐全（S5 门禁）。 */
export function validateManifestInput(input: ManifestInput): string[] {
  const missing: string[] = [];
  if (!input.reportJson || !input.reportJson.length) missing.push("reportJson");
  if (!input.geometry) {
    missing.push("geometry");
  } else {
    if (input.geometry.distanceM !== null && !Number.isFinite(input.geometry.distanceM))
      missing.push("geometry.distanceM");
  }
  if (typeof input.sampleRate !== "number" || input.sampleRate <= 0) missing.push("sampleRate");
  return missing;
}

/** 计算 UTF-8 字符串的 SHA-256（Node 22 + 浏览器 crypto.subtle 通用）。 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 构造 ReportManifest。 */
export async function buildManifest(input: ManifestInput): Promise<ReportManifest> {
  const missing = validateManifestInput(input);
  if (missing.length)
    throw new Error(`[S5 Manifest] 缺键: ${missing.join(", ")}`);
  const reportSha256 = await sha256Hex(input.reportJson);
  return {
    geometry: {
      distanceM: input.geometry.distanceM,
      sensorPosition: input.geometry.sensorPosition,
    },
    condition: {
      bucket: input.geometry.bucket,
      baselineVersion: input.geometry.baselineVersion,
      baselineKey: input.geometry.baselineKey,
    },
    algorithmVersion: input.algorithmVersion ?? ALGORITHM_VERSION,
    sampleRate: { value: input.sampleRate, ok: input.sampleRateOk },
    micDirection: input.micDirection ?? "unknown",
    reportSha256,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    manifestVersion: "1.0",
  };
}

/** 校验 manifest 与 report.json 哈希是否匹配（S5 门禁）。 */
export async function verifyManifest(
  manifest: ReportManifest,
  reportJson: string,
): Promise<boolean> {
  const actual = await sha256Hex(reportJson);
  return manifest.reportSha256 === actual;
}

/** 构造 baselineKey 快捷入口（供 engine 复用）。 */
export function makeBaselineKey(
  device: string,
  bgVersion: number,
  baselineVersion: number | null,
): { key: string; version: number | null } {
  const key = baselineKey(device, bgVersion);
  return { key, version: baselineVersion };
}
