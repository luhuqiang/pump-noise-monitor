/**
 * Agent 状态机 — 纯规则，无网络
 *
 * 三态：accept（ok） / ask（low_confidence） / refuse（invalid）
 * 三来源：audio（引擎输出） / baseline（基线就绪度） / agent（工具返回）
 *
 * 状态迁移表（state × source → verdict）：
 *
 *   ok               audio      pass    —— 引擎 ok 时直接接受
 *   ok               baseline   pass    —— 已冻结基线不影响 ok
 *   ok               agent      pass    —— 工具全部 ok
 *   low_confidence   audio      na      —— 引擎已给 low
 *   low_confidence   baseline   fail    —— 基线不足或未冻结
 *   low_confidence   agent      na      —— 工具部分可疑
 *   invalid          audio      fail    —— 引擎 invalid，必须拒答
 *   invalid          baseline   fail    —— 基线彻底缺失
 *   invalid          agent      fail    —— 工具抛错 / 空 / 冲突
 *
 * 设计要点：
 * - 三态由证据决定，LLM 只负责措辞，无权决定三态
 * - Agent 本身零网络调用
 */

// ---------- 类型 ----------

export type AgentState = "accept" | "ask" | "refuse";

export type EngineTone = "ok" | "low_confidence" | "invalid";

export type EvidenceSource = "audio" | "baseline" | "agent";

export type Verdict = "pass" | "fail" | "na";

/** 状态迁移规则：给定当前 state + 证据 source，给出该来源的判定。 */
export interface TransitionCell {
  state: EngineTone;
  source: EvidenceSource;
  verdict: Verdict;
}

/** 触发 ask（low_confidence）的原因，用于措辞。 */
export interface AskReason {
  kind: "insufficient_baseline" | "engine_low" | "agent_missing_case" | "agent_conflict" | "agent_tool_error";
  detail?: string;
}

/** 触发 refuse（invalid）的原因。 */
export interface RefuseReason {
  kind: "engine_invalid" | "baseline_missing" | "agent_tool_error" | "agent_conflict" | "empty_input" | "invalid_input";
  detail?: string;
}

/** Agent 判定结果（状态机产出）。 */
export interface AgentDecision {
  state: AgentState;
  audioTone: EngineTone;
  source: EvidenceSource;
  verdict: Verdict;
  askReason?: AskReason;
  refuseReason?: RefuseReason;
}

// ---------- 状态迁移表（固定 9 格） ----------

export const TRANSITION_TABLE: readonly TransitionCell[] = [
  { state: "ok", source: "audio", verdict: "pass" },
  { state: "ok", source: "baseline", verdict: "pass" },
  { state: "ok", source: "agent", verdict: "pass" },

  { state: "low_confidence", source: "audio", verdict: "na" },
  { state: "low_confidence", source: "baseline", verdict: "fail" },
  { state: "low_confidence", source: "agent", verdict: "na" },

  { state: "invalid", source: "audio", verdict: "fail" },
  { state: "invalid", source: "baseline", verdict: "fail" },
  { state: "invalid", source: "agent", verdict: "fail" },
];

/** 以 (state, source) 为 key 查表，未命中返回 undefined。 */
export function lookupVerdict(state: EngineTone, source: EvidenceSource): Verdict | undefined {
  for (const row of TRANSITION_TABLE) {
    if (row.state === state && row.source === source) return row.verdict;
  }
  return undefined;
}

// ---------- 输入上下文 ----------

export interface AgentContext {
  /** 引擎原始三态 */
  audioTone: EngineTone;
  /** 基线就绪：frames ≥ MIN_BASELINE_FRAMES 且 buckets ≥ 3 档 */
  baselineReady: boolean;
  /** 基线已冻结（有 crestGate） */
  baselineFrozen: boolean;
  /** 工具返回值：各工具 ok / error */
  toolResults: Record<string, "ok" | "error" | "missing" | "conflict">;
  /** 用户输入是否为空 / 过长 / 乱码 */
  inputValid: boolean;
  inputLength: number;
}

// ---------- 核心裁决 ----------

const MAX_INPUT_CHARS = 2000;

/**
 * 纯规则裁决：根据引擎三态 + 基线 + 工具返回 + 输入合法性，给出 AgentDecision。
 * 无任何 I/O、无任何网络。
 */
export function decide(ctx: AgentContext): AgentDecision {
  // 0) 输入合法性最优先
  if (!ctx.inputValid || ctx.inputLength === 0) {
    return {
      state: "refuse",
      audioTone: ctx.audioTone,
      source: "agent",
      verdict: "fail",
      refuseReason: {
        kind: ctx.inputLength === 0 ? "empty_input" : "invalid_input",
        detail: `inputLength=${ctx.inputLength}`,
      },
    };
  }
  if (ctx.inputLength > MAX_INPUT_CHARS) {
    return {
      state: "refuse",
      audioTone: ctx.audioTone,
      source: "agent",
      verdict: "fail",
      refuseReason: { kind: "invalid_input", detail: `input too long (${ctx.inputLength})` },
    };
  }

  // 1) 工具错误立即 refuse
  const badTools = Object.entries(ctx.toolResults).filter(([, v]) => v === "error");
  if (badTools.length > 0) {
    return {
      state: "refuse",
      audioTone: ctx.audioTone,
      source: "agent",
      verdict: "fail",
      refuseReason: { kind: "agent_tool_error", detail: badTools.map(([k]) => k).join(",") },
    };
  }

  const missingTools = Object.entries(ctx.toolResults).filter(([, v]) => v === "missing");
  const conflictTools = Object.entries(ctx.toolResults).filter(([, v]) => v === "conflict");

  // 2) 引擎 invalid → refuse
  if (ctx.audioTone === "invalid") {
    return {
      state: "refuse",
      audioTone: "invalid",
      source: "audio",
      verdict: "fail",
      refuseReason: { kind: "engine_invalid" },
    };
  }

  // 3) 引擎 low_confidence → ask
  if (ctx.audioTone === "low_confidence") {
    return {
      state: "ask",
      audioTone: "low_confidence",
      source: "audio",
      verdict: lookupVerdict("low_confidence", "audio") ?? "na",
      askReason: { kind: "engine_low" },
    };
  }

  // 4) 引擎 ok 但基线不足 → ask
  if (ctx.audioTone === "ok" && (!ctx.baselineReady || !ctx.baselineFrozen)) {
    return {
      state: "ask",
      audioTone: "ok",
      source: "baseline",
      verdict: lookupVerdict("ok", "baseline") ?? "na",
      askReason: {
        kind: "insufficient_baseline",
        detail: `ready=${ctx.baselineReady} frozen=${ctx.baselineFrozen}`,
      },
    };
  }

  // 5) 引擎 ok 但工具冲突 → ask
  if (conflictTools.length > 0) {
    return {
      state: "ask",
      audioTone: "ok",
      source: "agent",
      verdict: lookupVerdict("ok", "agent") ?? "na",
      askReason: {
        kind: "agent_conflict",
        detail: conflictTools.map(([k]) => k).join(","),
      },
    };
  }

  // 6) 引擎 ok 但工具缺案例 → ask
  if (missingTools.length > 0) {
    return {
      state: "ask",
      audioTone: "ok",
      source: "agent",
      verdict: lookupVerdict("ok", "agent") ?? "na",
      askReason: {
        kind: "agent_missing_case",
        detail: missingTools.map(([k]) => k).join(","),
      },
    };
  }

  // 7) 全部 ok → accept
  return {
    state: "accept",
    audioTone: "ok",
    source: "audio",
    verdict: "pass",
  };
}

/** Agent 状态 → 人读标签。 */
export function stateLabel(s: AgentState): string {
  switch (s) {
    case "accept":
      return "可判读";
    case "ask":
      return "低置信";
    case "refuse":
      return "拒答";
  }
}
