import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyStatusPriority, crestEventHit } from "./status-priority.ts";
import type { Diagnosis } from "./diagnose.ts";
import type { ShaftTrack } from "./shaft-tracker.ts";
import type { ShortEvent } from "./event-rail.ts";
import type { PlacementCheck } from "./fingerprint.ts";

function base(overrides: Partial<Diagnosis> = {}): Diagnosis {
  return {
    status: "ok",
    priority: "normal",
    title: "运行平稳",
    summary: "未见异常。",
    confidence: "中",
    confidencePct: 70,
    severity: "正常",
    evidence: [],
    excluded: [],
    action: "继续观察",
    directions: [{ id: "healthy", title: "谱形平稳", probability: 80, note: "" }],
    anomaly: 10,
    ...overrides,
  };
}

function shaft(overrides: Partial<ShaftTrack> = {}): ShaftTrack {
  return {
    trackedF0: 46.7,
    trackedF0UncertaintyHz: 0.2,
    ratedF0: 46.7,
    rpmDeltaPct: 0,
    rpmDeltaPctUncertainty: 0.4,
    reliable: true,
    mismatch: false,
    combScore: 0.9,
    ambiguous: false,
    subharmonic: false,
    subharmonicRatio: 0,
    lineSnrDb: 20,
    insufficientSnr: false,
    windowCount: 4,
    spanSec: 3,
    ...overrides,
  };
}

function event(overrides: Partial<ShortEvent> = {}): ShortEvent {
  return {
    eventCount: 0,
    lastEventAtMs: 0,
    lastKurtosis: 3,
    lastCrest: 3,
    meanKurtosis: 3,
    meanCrest: 3,
    eventsPerSec: 0,
    crestGate: 4,
    crestGateZ: 3.5,
    currentCrestZ: 0,
    crestMedian: 3,
    crestScale: 0.3,
    gateFrozen: true,
    gateVersion: 1,
    historyReady: true,
    clipped: false,
    ...overrides,
  };
}

function placement(overrides: Partial<PlacementCheck> = {}): PlacementCheck {
  return { state: "ok", delta: 0, streak: 0, ...overrides };
}

function ctx(overrides: Partial<Parameters<typeof applyStatusPriority>[1]> = {}) {
  return {
    valid: true,
    phase: "steady" as const,
    shaft: shaft(),
    placement: placement(),
    event: event(),
    ratedRpm: 2800,
    ...overrides,
  };
}

describe("P1-1：标题优先级矩阵", () => {
  it("invalid 排在最前，且不改写任何内容", () => {
    const src = base({ status: "invalid", title: "采集链路不可信", summary: "原始" });
    const out = applyStatusPriority(
      src,
      ctx({ valid: false, shaft: shaft({ ambiguous: true }), placement: placement({ state: "moved" }), event: event({ eventsPerSec: 2 }) }),
    );
    assert.equal(out.priority, "invalid");
    assert.equal(out.title, "采集链路不可信");
    assert.deepEqual(out.summary, "原始");
  });

  it("非 steady 只标 warming，不参与转速/冲击裁决", () => {
    const out = applyStatusPriority(
      base(),
      ctx({ phase: "starting", shaft: shaft({ mismatch: true }), event: event({ eventsPerSec: 3 }) }),
    );
    assert.equal(out.priority, "warming");
    assert.equal(out.directions.length, 1);
  });

  it("转速不确定优先于冲击与摆位，并清空方向列表", () => {
    const out = applyStatusPriority(
      base(),
      ctx({
        shaft: shaft({ ambiguous: true, insufficientSnr: true, lineSnrDb: 4 }),
        event: event({ eventsPerSec: 2 }),
        placement: placement({ state: "moved", delta: 0.6, streak: 2 }),
      }),
    );
    assert.equal(out.priority, "shaft_ambiguous");
    assert.equal(out.title, "转速不确定 · 阶次结论已禁用");
    assert.match(out.summary, /SNR 不足/);
    assert.equal(out.directions.length, 0);
    assert.ok(out.confidencePct <= 30);
    assert.equal(out.status, "low_confidence");
  });

  it("转速不符要求误差棒，并优先于冲击", () => {
    const out = applyStatusPriority(
      base(),
      ctx({
        shaft: shaft({ mismatch: true, trackedF0: 40, rpmDeltaPct: -14, rpmDeltaPctUncertainty: 1.2 }),
        event: event({ eventsPerSec: 5 }),
      }),
    );
    assert.equal(out.priority, "shaft_mismatch");
    assert.match(out.summary, /2400 ±/);
    assert.match(out.summary, /14.0% ± 1.2%/);
  });

  it("crest 命中升标题与严重度，但保留方向列表", () => {
    const out = applyStatusPriority(
      base({ severity: "正常" }),
      ctx({ event: event({ eventsPerSec: 1, currentCrestZ: 5 }) }),
    );
    assert.equal(out.priority, "crest_event");
    assert.equal(out.title, "冲击超门限 · 需复核");
    assert.equal(out.severity, "警告");
    assert.equal(out.directions.length, 1);
  });

  it("crest 与摆位同时命中时，crest 保住标题（自上而下取第一条）", () => {
    const out = applyStatusPriority(
      base(),
      ctx({
        event: event({ eventsPerSec: 2 }),
        placement: placement({ state: "moved", delta: 0.7, streak: 3 }),
      }),
    );
    assert.equal(out.priority, "crest_event");
    assert.doesNotMatch(out.summary, /^疑似移动设备/);
    assert.ok(out.evidence.some((line) => line.includes("摆位指纹偏移")));
  });

  it("摆位单独命中时才改写标题与摘要", () => {
    const out = applyStatusPriority(
      base({ summary: "谱形平稳。" }),
      ctx({ event: event(), placement: placement({ state: "moved", delta: 0.5, streak: 2 }) }),
    );
    assert.equal(out.priority, "placement_moved");
    assert.match(out.summary, /^疑似移动设备，建议重新标定。/);
  });

  it("recalibration_suggested / device_changed 只补证据，不改标题", () => {
    for (const state of ["recalibration_suggested", "device_changed"] as const) {
      const out = applyStatusPriority(base(), ctx({ placement: placement({ state }) }));
      assert.equal(out.priority, "normal");
      assert.ok(out.evidence.length > 0);
    }
  });

  it("门限未冻结时 crest 不命中", () => {
    assert.equal(crestEventHit(event({ gateFrozen: false, currentCrestZ: 9 })), false);
    assert.equal(crestEventHit(event({ currentCrestZ: 5 })), true);
    assert.equal(crestEventHit(event({ eventsPerSec: 1 })), true);
    assert.equal(crestEventHit(null), false);
  });

  it("全部落空时按状态归到 low_confidence / normal", () => {
    assert.equal(applyStatusPriority(base({ status: "low_confidence" }), ctx()).priority, "low_confidence");
    assert.equal(applyStatusPriority(base(), ctx()).priority, "normal");
  });
});
