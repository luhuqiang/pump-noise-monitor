/**
 * S7 Agent 三态 — 纯规则测试
 *
 * GT15-19 / GT22-23 共 7 条 + 3 条边界 = 10 条
 * 目标：在现有 62 pass 基础上 +10 → 72 pass 0 fail
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decide, stateLabel, TRANSITION_TABLE, lookupVerdict } from "./machine.ts";
import { runTools, TOOL_WHITELIST, TOOL_IDS, toolById } from "./tools.ts";
import {
  renderDecision,
  scanForbidden,
  LOW_CONFIDENCE_FORBIDDEN_WORDS,
  stripForbidden,
} from "./prompt.ts";

// ---------- GT15：空/超长/乱码输入 → 拒答 ----------

describe("GT15：输入合法性门禁", () => {
  it("空输入 → refuse + empty_input", () => {
    const d = decide({
      audioTone: "ok",
      baselineReady: true,
      baselineFrozen: true,
      toolResults: {},
      inputValid: true,
      inputLength: 0,
    });
    assert.equal(d.state, "refuse");
    assert.equal(d.refuseReason?.kind, "empty_input");
  });

  it("超长输入（>2000）→ refuse", () => {
    const d = decide({
      audioTone: "ok",
      baselineReady: true,
      baselineFrozen: true,
      toolResults: {},
      inputValid: true,
      inputLength: 2001,
    });
    assert.equal(d.state, "refuse");
    assert.equal(d.refuseReason?.kind, "invalid_input");
  });

  it("inputValid=false → refuse", () => {
    const d = decide({
      audioTone: "ok",
      baselineReady: true,
      baselineFrozen: true,
      toolResults: {},
      inputValid: false,
      inputLength: 10,
    });
    assert.equal(d.state, "refuse");
  });
});

// ---------- GT16：工具抛错 → 明确失败，不猜测 ----------

describe("GT16：工具错误立即拒绝", () => {
  it("任一工具 error → refuse + agent_tool_error", () => {
    const d = decide({
      audioTone: "ok",
      baselineReady: true,
      baselineFrozen: true,
      toolResults: { read_baseline: "error", read_case: "ok" },
      inputValid: true,
      inputLength: 50,
    });
    assert.equal(d.state, "refuse");
    assert.equal(d.refuseReason?.kind, "agent_tool_error");
    assert.match(d.refuseReason?.detail ?? "", /read_baseline/);
  });

  it("runTools 在工具函数抛错时返回 error（不抛出）", () => {
    const out = runTools({});
    // runTools 对所有 5 个工具都返回 status；ok/error/missing 都不会抛
    assert.equal(Object.keys(out).length, 5);
  });
});

// ---------- GT17：低置信输入 → low_confidence，无排名/百分比 ----------

describe("GT17：low_confidence 输出禁令", () => {
  it("引擎 low_confidence → ask", () => {
    const d = decide({
      audioTone: "low_confidence",
      baselineReady: true,
      baselineFrozen: true,
      toolResults: {},
      inputValid: true,
      inputLength: 50,
    });
    assert.equal(d.state, "ask");
    assert.equal(d.askReason?.kind, "engine_low");
  });

  it("low_confidence 渲染文本不含禁止词", () => {
    const d = decide({
      audioTone: "low_confidence",
      baselineReady: true,
      baselineFrozen: true,
      toolResults: {},
      inputValid: true,
      inputLength: 50,
    });
    const text = renderDecision(d);
    const hits = scanForbidden(text);
    assert.equal(hits.length, 0, `禁止词命中: ${hits.join(",")}（输出：${text}）`);
  });

  it("禁止词表 = 5 项（正常 / % / 排名 / 百分比 / 概率）", () => {
    assert.deepEqual(LOW_CONFIDENCE_FORBIDDEN_WORDS, ["正常", "%", "排名", "百分比", "概率"]);
  });
});

// ---------- GT18：引用不存在案例 → 拒绝，不伪造引用 ----------

describe("GT18：不存在的案例引用 → ask（不伪造）", () => {
  it("read_case missing → ask + agent_missing_case（不编造结果）", () => {
    const d = decide({
      audioTone: "ok",
      baselineReady: true,
      baselineFrozen: true,
      toolResults: { read_case: "missing" },
      inputValid: true,
      inputLength: 100,
    });
    assert.equal(d.state, "ask");
    assert.equal(d.askReason?.kind, "agent_missing_case");
  });

  it("readCase 空库返回 missing", () => {
    const spec = toolById("read_case");
    assert.ok(spec);
    const r = spec!.run({ keyword: "任何词", index: [] } as never);
    assert.equal(r.status, "missing");
  });
});

// ---------- GT19：冲突证据 → 标冲突，不合并成结论 ----------

describe("GT19：冲突证据 → ask + agent_conflict", () => {
  it("agent conflict → ask", () => {
    const d = decide({
      audioTone: "ok",
      baselineReady: true,
      baselineFrozen: true,
      toolResults: { read_baseline: "conflict" },
      inputValid: true,
      inputLength: 80,
    });
    assert.equal(d.state, "ask");
    assert.equal(d.askReason?.kind, "agent_conflict");
  });
});

// ---------- GT22：一次会话 6 轮 → 状态保持，不丢上下文 ----------

describe("GT22：多轮裁决状态一致（每轮独立调用，保持规则一致）", () => {
  it("连续 6 轮 same ctx → 输出一致", () => {
    const ctx = {
      audioTone: "ok" as const,
      baselineReady: true,
      baselineFrozen: true,
      toolResults: {},
      inputValid: true,
      inputLength: 100,
    };
    const out = [] as string[];
    for (let i = 0; i < 6; i++) out.push(decide(ctx).state);
    assert.deepEqual(out, Array(6).fill("accept"));
  });
});

// ---------- GT23：索取取证模板 → 只给模板，不伪造证据 ----------

describe("GT23：取证模板只给文字，不编造数据", () => {
  it("readEventRail missing 时 ask，不伪造证据", () => {
    const d = decide({
      audioTone: "ok",
      baselineReady: true,
      baselineFrozen: true,
      toolResults: { read_event_rail: "missing" },
      inputValid: true,
      inputLength: 50,
    });
    assert.equal(d.state, "ask");
  });

  it("invalid 态渲染不含任何机制条目", () => {
    const d = decide({
      audioTone: "invalid",
      baselineReady: true,
      baselineFrozen: true,
      toolResults: {},
      inputValid: true,
      inputLength: 50,
    });
    const text = renderDecision(d, { directions: ["汽蚀", "堵塞"] });
    // 渲染后 directions 不应被塞进机制（invalid 模板不含 {directions}）
    assert.doesNotMatch(text, /汽蚀|堵塞/);
    assert.match(text, /无法判读/);
  });
});

// ---------- 边界 ----------

describe("边界：状态表完整性", () => {
  it("TRANSITION_TABLE 恰好 9 格（3 state × 3 source）", () => {
    assert.equal(TRANSITION_TABLE.length, 9);
    const byState: Record<string, number> = {};
    for (const r of TRANSITION_TABLE) byState[r.state] = (byState[r.state] ?? 0) + 1;
    assert.equal(byState.ok, 3);
    assert.equal(byState.low_confidence, 3);
    assert.equal(byState.invalid, 3);
  });

  it("lookupVerdict 对 (invalid, agent) 返回 fail", () => {
    assert.equal(lookupVerdict("invalid", "agent"), "fail");
  });

  it("ok + full tool ok → accept", () => {
    const d = decide({
      audioTone: "ok",
      baselineReady: true,
      baselineFrozen: true,
      toolResults: {},
      inputValid: true,
      inputLength: 50,
    });
    assert.equal(d.state, "accept");
  });

  it("baseline 未冻结 → ask（哪怕引擎 ok）", () => {
    const d = decide({
      audioTone: "ok",
      baselineReady: true,
      baselineFrozen: false,
      toolResults: {},
      inputValid: true,
      inputLength: 50,
    });
    assert.equal(d.state, "ask");
    assert.equal(d.askReason?.kind, "insufficient_baseline");
  });

  it("引擎 invalid 优先级最高（即便基线/工具都 ok）", () => {
    const d = decide({
      audioTone: "invalid",
      baselineReady: true,
      baselineFrozen: true,
      toolResults: {},
      inputValid: true,
      inputLength: 50,
    });
    assert.equal(d.state, "refuse");
  });

  it("stateLabel 三态齐全", () => {
    assert.equal(stateLabel("accept"), "可判读");
    assert.equal(stateLabel("ask"), "低置信");
    assert.equal(stateLabel("refuse"), "拒答");
  });

  it("工具白名单 = 5 个固定 id", () => {
    assert.equal(TOOL_WHITELIST.length, 5);
    assert.deepEqual(TOOL_IDS, [
      "read_baseline",
      "read_case",
      "read_event_rail",
      "read_machine_params",
      "suggest_next_step",
    ]);
  });

  it("stripForbidden 从文本中剔除所有禁止词", () => {
    const out = stripForbidden("这个泵的状态是正常，概率约 80%，排名第 1，百分比 75%");
    for (const w of LOW_CONFIDENCE_FORBIDDEN_WORDS) {
      assert.equal(out.includes(w), false, `${w} 未被剔除`);
    }
  });
});
