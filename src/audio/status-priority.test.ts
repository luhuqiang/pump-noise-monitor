import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyStatusPriority, crestEventHit } from "./status-priority.ts";
import type { Diagnosis } from "./diagnose.ts";
import type { ShaftTrack } from "./shaft-tracker.ts";
import type { ShortEvent } from "./event-rail.ts";
import type { PlacementCheck } from "./fingerprint.ts";

function base(overrides: Partial<Diagnosis> = {}): Diagnosis {
  const merged: Diagnosis = {
    status: "ok",
    directions: [],
    evidence: { spectrum: "2.5–5k 3 dB", order: "1× 1.2", placement: "SNR 22 dB" },
    fixList: [],
    nextStep: "report",
    severity: "正常",
    severityLabel: "健康",
    anomaly: 0,
    title: "正常",
    confidence: 95,
    summary: "—",
    excluded: [],
    ...overrides,
  };
  return merged;
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

describe("P1-1：优先级矩阵", () => {
  it("invalid 排在最前，不被任何条件降级", () => {
    const src = base({ status: "invalid", fixList: ["削顶"] });
    const out = applyStatusPriority(src, ctx({ phase: "starting" }));
    assert.equal(out.status, "invalid");
    assert.equal(out.fixList.length, 1);
  });

  it("非稳态降为 low", () => {
    const src = base({ status: "ok" });
    const out = applyStatusPriority(src, ctx({ phase: "starting" }));
    assert.equal(out.status, "low");
    assert.equal(out.nextStep, "wait_steady");
  });

  it("转速歧义降为 low，清空方向", () => {
    const src = base({ status: "ok", directions: [{ id: "cavitation", title: "汽蚀", note: "" }] });
    const out = applyStatusPriority(src, ctx({ shaft: shaft({ ambiguous: true, insufficientSnr: true, lineSnrDb: 5 }) }));
    assert.equal(out.status, "low");
    assert.equal(out.directions.length, 0);
    assert.match(out.evidence.order, /SNR 不足/);
  });

  it("转速不符降为 low，清空方向", () => {
    const src = base({ status: "ok", directions: [{ id: "blockage", title: "堵塞", note: "" }] });
    const out = applyStatusPriority(src, ctx({ shaft: shaft({ mismatch: true, rpmDeltaPct: 8 }) }));
    assert.equal(out.status, "low");
    assert.equal(out.directions.length, 0);
    assert.match(out.evidence.order, /转速不符/);
  });

  it("crest 命中只补证据，不改状态和方向", () => {
    const src = base({ status: "ok", directions: [{ id: "cavitation", title: "汽蚀", note: "" }] });
    const out = applyStatusPriority(src, ctx({ event: event({ eventsPerSec: 3 }) }));
    assert.equal(out.status, "ok");
    assert.equal(out.directions.length, 1);
    assert.match(out.evidence.placement, /冲击/);
  });

  it("摆位移动只补证据", () => {
    const src = base({ status: "ok" });
    const out = applyStatusPriority(src, ctx({ placement: placement({ state: "moved", delta: 0.4 }) }));
    assert.equal(out.status, "ok");
    assert.match(out.evidence.placement, /摆位偏移/);
  });

  it("valid=false 强制 invalid", () => {
    const src = base({ status: "ok" });
    const out = applyStatusPriority(src, ctx({ valid: false }));
    assert.equal(out.status, "invalid");
  });

  it("正常 ok 维持不变", () => {
    const src = base({ status: "ok", directions: [{ id: "cavitation", title: "汽蚀", note: "" }] });
    const out = applyStatusPriority(src, ctx());
    assert.equal(out.status, "ok");
    assert.equal(out.directions.length, 1);
    assert.equal(out.directions[0]!.id, "cavitation");
  });

  it("low 维持 low", () => {
    const src = base({ status: "low", directions: [] });
    const out = applyStatusPriority(src, ctx());
    assert.equal(out.status, "low");
  });

  it("crest 门限未冻结时不命中", () => {
    assert.equal(crestEventHit(event({ gateFrozen: false, eventsPerSec: 5 })), false);
  });
});
