/**
 * Agent 提示词模板（仅措辞）
 *
 * 三态：ok / low_confidence / invalid
 * - 模板中 **绝对禁止** low_confidence 输出出现：
 *     「正常」 / 百分号 / 排名 / 百分比 / 概率
 * - ok 态可以给出明确方向但不得编造数值
 * - invalid 态只说信号无效，不给任何机制条目
 *
 * 提示词由 Agent 内部使用，不直接发给任何在线模型。
 */

import type { AgentDecision, AskReason, RefuseReason } from "./machine.ts";

// ---------- 禁止词表（导出，供扫描） ----------

export const LOW_CONFIDENCE_FORBIDDEN_WORDS: readonly string[] = [
  "正常",
  "%",
  "排名",
  "百分比",
  "概率",
];

/** 扫描 low_confidence 输出，返回命中数；0 则通过。 */
export function scanForbidden(text: string): string[] {
  const hits: string[] = [];
  for (const w of LOW_CONFIDENCE_FORBIDDEN_WORDS) {
    if (text.includes(w)) hits.push(w);
  }
  return hits;
}

// ---------- ok 模板 ----------

export const OK_TEMPLATE = `
信号判读意见：

- 判读结论：可判读
- 依据：来自本地声学与基线比较
- 可能方向：{directions}
- 下一步建议：{next_step}

注：声学线索不是故障结论，不能代替振动检测与拆检。
`.trim();

// ---------- low_confidence 模板 ----------

/** 通用 low_confidence 模板：严禁百分比、排名、「正常」。 */
export const LOW_CONFIDENCE_TEMPLATE = `
信号判读意见：

- 当前状态：低置信，尚不能下结论
- 不确定原因：{reason}
- 下一步建议：{next_step}

注：已记录本次观测，请按建议复测或补做基线冻结。
`.trim();

// ---------- invalid 模板 ----------

/** invalid 模板：**不**列出任何机制条目。 */
export const INVALID_TEMPLATE = `
信号判读意见：

- 当前状态：无法判读
- 原因：{reason}
- 处理建议：{next_step}

注：请确认摆位、麦克风、以及泵是否在稳定运转后再复测。
`.trim();

// ---------- 根据 decision 渲染最终措辞 ----------

export function renderDecision(
  decision: AgentDecision,
  extras: { directions?: string[]; nextStep?: string } = {},
): string {
  const { state } = decision;

  if (state === "accept") {
    return OK_TEMPLATE
      .replace("{directions}", (extras.directions ?? ["未识别明确方向"]).join("、"))
      .replace("{next_step}", extras.nextStep ?? "输出报告");
  }

  if (state === "ask") {
    const reason = reasonText(decision.askReason);
    const body = LOW_CONFIDENCE_TEMPLATE
      .replace("{reason}", reason)
      .replace("{next_step}", extras.nextStep ?? "冻结基线后复测");
    // 二次保险：渲染后再次扫描并剔除
    const hits = scanForbidden(body);
    if (hits.length > 0) {
      return stripForbidden(body);
    }
    return body;
  }

  // refuse
  const reason = reasonText(undefined, decision.refuseReason);
  return INVALID_TEMPLATE
    .replace("{reason}", reason)
    .replace("{next_step}", extras.nextStep ?? "重新确认输入后重试");
}

// ---------- 辅助 ----------

function reasonText(ask?: AskReason, refuse?: RefuseReason): string {
  if (refuse) {
    switch (refuse.kind) {
      case "engine_invalid":
        return "引擎判定信号无效，可能是摆位、削顶或采样率问题";
      case "baseline_missing":
        return "缺少基线，无法比较";
      case "agent_tool_error":
        return `工具返回错误（${refuse.detail ?? "未知"}）`;
      case "agent_conflict":
        return "多处证据相互矛盾";
      case "empty_input":
        return "输入为空";
      case "invalid_input":
        return "输入内容不合法";
    }
  }
  if (ask) {
    switch (ask.kind) {
      case "engine_low":
        return "引擎判定置信不足，转速或谱线不稳";
      case "insufficient_baseline":
        return "基线未就绪或未冻结";
      case "agent_conflict":
        return "现有证据存在冲突";
      case "agent_missing_case":
        return "本地案例库未命中匹配项";
      case "agent_tool_error":
        return "部分工具返回可疑结果";
    }
  }
  return "原因未明";
}

/** 从文本中剔除所有禁止词（替换为空白）。 */
export function stripForbidden(text: string): string {
  let out = text;
  for (const w of LOW_CONFIDENCE_FORBIDDEN_WORDS) {
    out = out.split(w).join("");
  }
  return out;
}
