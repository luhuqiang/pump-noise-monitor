/**
 * Agent 工具白名单 — 5 个，全部纯本地函数（无任何外部网络调用）
 *
 * 设计：工具声明能力（输入/输出 schema），Agent 状态机调用时拿到 ok/error/missing/conflict。
 * 每个工具返回 { status, value? }；抛错由调用方包装成 error。
 */

// ---------- 类型 ----------

export type ToolStatus = "ok" | "error" | "missing" | "conflict";

export interface ToolResult<T = unknown> {
  status: ToolStatus;
  value?: T;
  error?: string;
}

export interface ToolSpec<Args = never, Out = unknown> {
  /** 工具 id（白名单固定 5 个之一） */
  id: ToolId;
  /** 人类可读描述 */
  description: string;
  /** 入参说明（用于提示词） */
  args: string;
  /** 返回说明 */
  returns: string;
  /** 执行函数（纯函数） */
  run: (args: Args) => ToolResult<Out>;
}

/** 工具基类型（列表用，丢失具体泛型） */
type AnyToolSpec = ToolSpec<never, unknown>;

export type ToolId =
  | "read_baseline"
  | "read_case"
  | "read_event_rail"
  | "read_machine_params"
  | "suggest_next_step";

// ---------- 1) read_baseline ----------

export interface BaselineValue {
  ready: boolean;
  frozen: boolean;
  frames: number;
  buckets: number;
  anomaly?: number | null;
}

const readBaseline: ToolSpec<{ baseline?: BaselineValue | null }, BaselineValue> = {
  id: "read_baseline",
  description: "读取当前基线就绪度与偏离度",
  args: "baseline: 当前引擎暴露的基线对象（可空）",
  returns: "{ ready, frozen, frames, buckets, anomaly? }",
  run: ({ baseline }) => {
    if (!baseline) return { status: "missing", error: "baseline unavailable" };
    if (baseline.buckets === 0) return { status: "missing", error: "no buckets" };
    return { status: "ok", value: baseline };
  },
};

// ---------- 2) read_case ----------

export interface CaseRecord {
  id: string;
  title: string;
  source: "manual" | "imported";
  /** 匹配关键词 */
  keywords: string[];
}

const CASE_INDEX: CaseRecord[] = [];

const readCase: ToolSpec<{ keyword: string; index?: CaseRecord[] }, CaseRecord> = {
  id: "read_case",
  description: "按关键词检索本地案例库",
  args: "keyword: 要检索的关键词；index: 可选注入的案例数组（默认空）",
  returns: "命中的案例对象；未命中则 missing",
  run: ({ keyword, index = CASE_INDEX }) => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return { status: "error", error: "empty keyword" };
    const hit = index.find((c) => c.keywords.some((k) => k.toLowerCase().includes(kw)));
    if (!hit) return { status: "missing", error: `no case for "${keyword}"` };
    return { status: "ok", value: hit };
  },
};

// ---------- 3) read_event_rail ----------

export interface EventRailSummary {
  eventCount: number;
  crestGateFrozen: boolean;
  gateVersion: number;
  clipped: boolean;
  dropped: boolean;
}

const readEventRail: ToolSpec<{ rail?: EventRailSummary | null }, EventRailSummary> = {
  id: "read_event_rail",
  description: "读取事件轨摘要（削顶/断流/冻结门限）",
  args: "rail: 当前事件轨对象（可空）",
  returns: "{ eventCount, crestGateFrozen, gateVersion, clipped, dropped }",
  run: ({ rail }) => {
    if (!rail) return { status: "missing", error: "event rail unavailable" };
    return { status: "ok", value: rail };
  },
};

// ---------- 4) read_machine_params ----------

export interface MachineParams {
  ratedRpm?: number | null;
  targetRpm?: number | null;
  actualRpm?: number | null;
  deviceId?: string;
  bgVersion?: number;
}

const readMachineParams: ToolSpec<{ params?: MachineParams | null }, MachineParams> = {
  id: "read_machine_params",
  description: "读取铭牌转速 / 实测转速 / 设备标识 / 背景版本",
  args: "params: 当前机器参数快照（可空）",
  returns: "{ ratedRpm, targetRpm, actualRpm, deviceId, bgVersion }",
  run: ({ params }) => {
    if (!params) return { status: "missing", error: "params unavailable" };
    const hasAny =
      params.ratedRpm != null || params.actualRpm != null || params.deviceId != null || params.bgVersion != null;
    if (!hasAny) return { status: "missing", error: "no useful params" };
    return { status: "ok", value: params };
  },
};

// ---------- 5) suggest_next_step ----------

export type NextStepId =
  | "report"
  | "wait_steady"
  | "freeze_baseline"
  | "reset_baseline"
  | "collect_background"
  | "verify_installation";

export interface NextStepSuggestion {
  step: NextStepId;
  reason: string;
}

const suggestNextStep: ToolSpec<{ audioTone: "ok" | "low_confidence" | "invalid" }, NextStepSuggestion> = {
  id: "suggest_next_step",
  description: "根据引擎三态给出下一步建议",
  args: "audioTone: 当前引擎三态",
  returns: "{ step, reason }",
  run: ({ audioTone }) => {
    switch (audioTone) {
      case "ok":
        return { status: "ok", value: { step: "report", reason: "信号稳定，可输出报告" } };
      case "low_confidence":
        return {
          status: "ok",
          value: { step: "freeze_baseline", reason: "低置信，建议先冻结基线再复测" },
        };
      case "invalid":
        return {
          status: "ok",
          value: { step: "wait_steady", reason: "信号无效，请确认摆位和运转状态" },
        };
      default:
        return { status: "error", error: `unknown tone: ${audioTone}` };
    }
  },
};

// ---------- 白名单集合（导出） ----------

export const TOOL_WHITELIST: readonly AnyToolSpec[] = [
  readBaseline,
  readCase,
  readEventRail,
  readMachineParams,
  suggestNextStep,
] as const;

export const TOOL_IDS: readonly ToolId[] = TOOL_WHITELIST.map((t) => t.id);

export function toolById(id: string): AnyToolSpec | undefined {
  for (const t of TOOL_WHITELIST) if (t.id === id) return t;
  return undefined;
}

/** 批量调用工具；返回 id→status 映射（供状态机裁决）。不抛错。 */
export function runTools(
  inputs: Partial<Record<ToolId, unknown>>,
): Record<ToolId, ToolStatus> {
  const out: Partial<Record<ToolId, ToolStatus>> = {};
  for (const spec of TOOL_WHITELIST) {
    try {
      const args = (inputs as Record<string, unknown>)[spec.id] ?? {};
      const r = spec.run(args as never);
      out[spec.id] = r.status;
    } catch {
      out[spec.id] = "error";
    }
  }
  return out as Record<ToolId, ToolStatus>;
}
