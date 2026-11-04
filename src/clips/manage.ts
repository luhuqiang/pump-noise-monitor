/**
 * S8 片段管理。
 * - clips_enabled 默认 false（验收卡 §8：禁止片段默认开启）
 * - 导出前二次确认（GT43：未确认直接导出 → E_CLIP_CONFIRM_REQUIRED）
 * - 过期清理（GT42：到期片段删除，禁止残留音频）
 */

/** 片段默认开启策略 —— 必须为 false（验收卡 §8 禁止事项）。 */
export const CLIPS_ENABLED_DEFAULT = false;

/** 片段保留时长（毫秒），默认 24 小时。 */
export const CLIP_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** 片段错误码。 */
export const CLIP_ERROR = {
  /** GT43：未二次确认直接导出片段。 */
  E_CLIP_CONFIRM_REQUIRED: "E_CLIP_CONFIRM_REQUIRED",
  /** 片段未找到。 */
  E_CLIP_NOT_FOUND: "E_CLIP_NOT_FOUND",
  /** 片段已过期。 */
  E_CLIP_EXPIRED: "E_CLIP_EXPIRED",
  /** clips_enabled = false。 */
  E_CLIPS_DISABLED: "E_CLIPS_DISABLED",
} as const;

export type ClipErrorName = typeof CLIP_ERROR[keyof typeof CLIP_ERROR];

export type ClipError = {
  name: ClipErrorName;
  message: string;
};

export function makeClipError(name: ClipErrorName, detail?: string): ClipError {
  const msgMap: Record<ClipErrorName, string> = {
    E_CLIP_CONFIRM_REQUIRED: "导出片段前必须二次确认（GT43）",
    E_CLIP_NOT_FOUND: "片段不存在",
    E_CLIP_EXPIRED: "片段已过期，不能导出",
    E_CLIPS_DISABLED: "片段功能默认关闭；需显式开启 clips_enabled",
  };
  return { name, message: detail ? `${msgMap[name]}: ${detail}` : msgMap[name] };
}

/** 片段记录（IndexedDB clips store 结构）。 */
export type ClipRecord = {
  id: string;
  session_id: string;
  /** 起始毫秒 */
  start_ms: number;
  /** 长度毫秒 */
  length_ms: number;
  /** 音频字节（可选；浏览器端可能只存引用） */
  audio_bytes?: Uint8Array;
  /** 创建时间戳 */
  created_at: number;
  /** 过期时间戳（毫秒 epoch） */
  expires_at: number;
};

/** 判定 clips 是否开启。 */
export function isClipsEnabled(clipsEnabled?: boolean | null | undefined): boolean {
  // 默认关闭 —— 验收卡 §8：禁止片段默认开启
  return clipsEnabled === true;
}

/** 判定单条片段是否已过期（nowMs 为可选 epoch ms，便于测试）。 */
export function isClipExpired(clip: Pick<ClipRecord, "expires_at">, nowMs?: number): boolean {
  const now = nowMs ?? Date.now();
  return clip.expires_at <= now;
}

/**
 * 清理过期片段。
 * 返回 [已删条数, 仍有效条数]。
 */
export function cleanupExpiredClips(
  clips: ClipRecord[],
  nowMs?: number,
): { removed: number; kept: number; expiredIds: string[] } {
  const now = nowMs ?? Date.now();
  const expiredIds: string[] = [];
  let kept = 0;
  for (const c of clips) {
    if (c.expires_at <= now) expiredIds.push(c.id);
    else kept++;
  }
  return { removed: expiredIds.length, kept, expiredIds };
}

/**
 * 导出片段门禁（GT43）。
 * @param confirmed 调用方是否已二次确认
 * @param clipsEnabled 当前是否开启
 * @param clip 目标片段（可能已过期）
 */
export function guardClipExport(
  confirmed: boolean,
  clipsEnabled: boolean,
  clip?: ClipRecord | null,
  nowMs?: number,
): ClipError | null {
  if (!isClipsEnabled(clipsEnabled)) {
    return makeClipError("E_CLIPS_DISABLED");
  }
  if (!clip) {
    return makeClipError("E_CLIP_NOT_FOUND");
  }
  if (isClipExpired(clip, nowMs)) {
    return makeClipError("E_CLIP_EXPIRED", `clip=${clip.id}`);
  }
  // GT43：未确认直接导出 → 阻断
  if (!confirmed) {
    return makeClipError("E_CLIP_CONFIRM_REQUIRED");
  }
  return null;
}

/** 构造片段的默认过期时间（createdAt + ttlMs）。 */
export function computeExpiresAt(createdAtMs: number, ttlMs: number = CLIP_DEFAULT_TTL_MS): number {
  return createdAtMs + ttlMs;
}
