/**
 * S4 基线门控测试 —— 覆盖 GT01-14/28-30 的核心场景。
 * fingerprint.ts 用 localStorage，Node.js test 环境 mock 一个内存版。
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

// ------ 全局 mock localStorage（fingerprint.ts 的 read/write 依赖）------
const _store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => _store.get(k) ?? null,
  setItem: (k: string, v: string) => { _store.set(k, v); },
  removeItem: (k: string) => _store.delete(k),
  clear: () => _store.clear(),
  get length() { return _store.size; },
  key: (i: number) => Array.from(_store.keys())[i] ?? null,
} as unknown as Storage;

// mock structuredClone（fingerprint.ts 里用）
if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
}

import {
  MIN_BASELINE_BUCKETS,
  MIN_BASELINE_FRAMES,
  learnBaseline,
  anomalyOf,
  loadBaseline,
  saveCrestGate,
  resetBaseline,
  recordMaintenance,
  baselineKey,
  conditionBucket,
  baselineInfo,
  type Baseline,
} from "./fingerprint.ts";
import type { CrestGate } from "./event-rail.ts";

const KEY = "test:s4:engine";

function makeVector(dim: number, center: number): number[] {
  return new Array(dim).fill(center);
}

afterEach(() => {
  localStorage.clear();
});

// ============================================================
// GT01–03：learnBaseline 累积 mean/variance/n（稳态收敛）
// ============================================================
describe("GT01-03：learnBaseline 累积统计", () => {
  it("GT01：首次喂入 → buckets 新建，mean=vector，variance≈0.01，n=1", () => {
    const v = makeVector(20, -42);
    const b = learnBaseline(KEY, v, "常用负载");
    assert.ok(b, "返回 Baseline 对象");
    assert.equal(b.frames, 1);
    assert.equal(b.buckets["常用负载"].n, 1);
    assert.equal(b.buckets["常用负载"].mean.length, 20);
    assert.ok(b.buckets["常用负载"].mean.every((x) => Math.abs(x - (-42)) < 1e-9));
  });

  it("GT02：同向量喂 10 次 → n=10，mean 不变，variance 收敛到 0", () => {
    const v = makeVector(20, -42);
    for (let i = 0; i < 10; i++) {
      const b = learnBaseline(KEY, v, "常用负载");
      assert.equal(b?.frames, i + 1);
    }
    const b = loadBaseline(KEY)!;
    assert.equal(b.buckets["常用负载"].n, 10);
    assert.ok(b.buckets["常用负载"].variance.every((x) => Math.abs(x) < 0.05));
  });

  it("GT03：稍扰动向量喂 30 次 → variance 稳定在扰动量级", () => {
    const rng = (() => {
      let s = 42;
      return () => { s = (s * 9301 + 49297) % 233280; return s / 233280 - 0.5; };
    })();
    for (let i = 0; i < 30; i++) {
      const v = makeVector(20, -42).map((x) => x + rng() * 0.5);
      learnBaseline(KEY, v, "常用负载");
    }
    const b = loadBaseline(KEY)!;
    const avgVar =
      b.buckets["常用负载"].variance.reduce((a, c) => a + c, 0) / 20;
    assert.ok(avgVar > 0.001 && avgVar < 0.1, `variance 异常: ${avgVar}`);
  });
});

// ============================================================
// GT04-05：分桶（常用/过载/轻载独立累积）
// ============================================================
describe("GT04-05：learnBaseline 工况分桶独立", () => {
  it("GT04：三个 bucket 各喂 10 次 → 各自 mean/variance 独立", () => {
    const buckets: string[] = ["常用负载", "过载", "轻载"];
    const centers = [-42, -38, -46];
    for (const [i, bk] of buckets.entries()) {
      const v = makeVector(20, centers[i]);
      for (let j = 0; j < 10; j++) learnBaseline(KEY, v, bk);
    }
    const b = loadBaseline(KEY)!;
    assert.equal(Object.keys(b.buckets).length, 3);
    assert.equal(b.frames, 30);
    for (const [i, bk] of buckets.entries()) {
      const mean = b.buckets[bk].mean.reduce((a, c) => a + c, 0) / 20;
      assert.ok(
        Math.abs(mean - centers[i]) < 1,
        `${bk} mean ${mean} 偏离 ${centers[i]} dB`,
      );
    }
  });

  it("GT05：conditionBucket() 3 档划分（loadRatio 映射到 bucket 名）", () => {
    assert.equal(conditionBucket(1.0), "常用负载");
    assert.equal(conditionBucket(1.5), "高负载");
    assert.equal(conditionBucket(0.4), "低负载");
  });
});

// ============================================================
// GT06-08：anomalyOf 核心逻辑
// ============================================================
describe("GT06-08：anomalyOf 偏离分", () => {
  // 至少 3 个 bucket + 足够帧 → baselineInfo.ready=true → anomalyOf 返回 score
  const base: Baseline = {
    buckets: {
      "常用负载": {
        mean: new Array(20).fill(-42),
        variance: new Array(20).fill(0.04),
        n: 50,
      },
      "高负载": {
        mean: new Array(20).fill(-38),
        variance: new Array(20).fill(0.04),
        n: 50,
      },
      "低负载": {
        mean: new Array(20).fill(-46),
        variance: new Array(20).fill(0.04),
        n: 50,
      },
    },
    frames: 150,
    version: 1,
    createdAt: new Date().toISOString(),
    lastRunAt: Date.now(),
    runMinutes: 0,
    lastAnomalyAt: 0,
    consecutiveAbnormalDays: 0,
    placementRatio: null,
    placementLogStd: 0.12,
    placementDeviceId: null,
    placementDriftStreak: 0,
    crestGate: null,
    shaftHz: null,
    shaftHzSigma: null,
    shaftCapturedAt: null,
  };

  it("GT06：同类向量 → score 接近 0（<1）", () => {
    const r = anomalyOf(makeVector(20, -42), base, "常用负载");
    assert.ok(Number.isFinite(r.score!));
    assert.ok((r.score as number) < 1, `同类向量 score 应 <1，得 ${r.score}`);
  });

  it("GT07：整体偏移 +6 dB → score > 3（显著偏离）", () => {
    const r = anomalyOf(makeVector(20, -36), base, "常用负载");
    assert.ok((r.score as number) > 3, `+6dB 偏移 score 应 >3，得 ${r.score}`);
  });

  it("GT08：跨 bucket 查询 → 返回对象（不崩）", () => {
    const r = anomalyOf(makeVector(20, -42), base, "过载");
    assert.ok(r !== null);
  });
});

// ============================================================
// GT09-11：baselineInfo 就绪门槛
// ============================================================
describe("GT09-11：baselineInfo 就绪状态", () => {
  it("GT09：null baseline → ready=false, frames=0, buckets=0", () => {
    const info = baselineInfo(null);
    assert.equal(info.ready, false);
    assert.equal(info.frames, 0);
    assert.equal(info.buckets, 0);
  });

  it("GT10：帧不足 MIN_BASELINE_FRAMES → ready=false", () => {
    const b: Baseline = {
      buckets: { "常用负载": { mean: makeVector(20, -40), variance: makeVector(20, 0.01), n: 10 } },
      frames: 10,
      version: 1,
      createdAt: new Date().toISOString(),
      lastRunAt: Date.now(),
      runMinutes: 0,
      lastAnomalyAt: 0,
      consecutiveAbnormalDays: 0,
      placementRatio: null,
      placementLogStd: 0.12,
      placementDeviceId: null,
      placementDriftStreak: 0,
      crestGate: null,
      shaftHz: null,
      shaftHzSigma: null,
      shaftCapturedAt: null,
    };
    const info = baselineInfo(b);
    assert.equal(info.ready, false, `10 帧应 not ready（门槛 ${MIN_BASELINE_FRAMES}）`);
  });

  it("GT11：帧够但 bucket 数不足 → ready=false", () => {
    const b: Baseline = {
      buckets: { "常用负载": { mean: makeVector(20, -40), variance: makeVector(20, 0.01), n: 50 } },
      frames: 50,
      version: 1,
      createdAt: new Date().toISOString(),
      lastRunAt: Date.now(),
      runMinutes: 0,
      lastAnomalyAt: 0,
      consecutiveAbnormalDays: 0,
      placementRatio: null,
      placementLogStd: 0.12,
      placementDeviceId: null,
      placementDriftStreak: 0,
      crestGate: null,
      shaftHz: null,
      shaftHzSigma: null,
      shaftCapturedAt: null,
    };
    const info = baselineInfo(b);
    assert.equal(info.ready, false, `1 bucket 应 not ready（门槛 ≥${MIN_BASELINE_BUCKETS}）`);
  });
});

// ============================================================
// GT12-14：摆位指纹 + 换机判定
// ============================================================
describe("GT12-14：摆位指纹 + 换机判定", () => {
  it("GT12：同一 deviceId → placementRatio 持续累积（不中断）", () => {
    const device = "dev-A";
    for (let i = 0; i < 10; i++) {
      learnBaseline(KEY, makeVector(20, -42), "常用负载", {
        placementRatio: 1.0 + i * 0.01,
        deviceId: device,
      });
    }
    const b = loadBaseline(KEY)!;
    assert.equal(b.placementDeviceId, device);
    assert.ok(b.placementRatio !== null, "同设备应保留 placementRatio");
  });

  it("GT13：换 deviceId → placementRatio 重置为 null", () => {
    // 先 learnBaseline 传 dev-A 建立 placementDeviceId
    learnBaseline(KEY, makeVector(20, -42), "常用负载", {
      placementRatio: 1.05,
      deviceId: "dev-A",
    });
    // 再换 device
    learnBaseline(KEY, makeVector(20, -42), "常用负载", {
      placementRatio: 1.01,
      deviceId: "dev-B",
    });
    const b = loadBaseline(KEY)!;
    assert.equal(b.placementDeviceId, "dev-B");
    assert.equal(b.placementRatio, null, "换机后 placementRatio 应重置");
    assert.equal(b.placementDriftStreak, 0);
  });

  it("GT14：baselineKey(device, bgVersion) → 换 bgVersion 生成不同 key", () => {
    const k1 = baselineKey("dev-A", 0);
    const k2 = baselineKey("dev-A", 1);
    assert.notEqual(k1, k2, "换 bgVersion 应生成不同 key");
  });
});

// ============================================================
// GT28-30：saveCrestGate + resetBaseline + recordMaintenance
// ============================================================
describe("GT28-30：crestGate 冻结 / reset / maintenance", () => {
  const testGate: CrestGate = {
    median: 3.5,
    scale: 0.8,
    crestGateZ: 2.6, // median + 3σ
    frozenAt: new Date().toISOString(),
    version: 1,
  };

  it("GT28：saveCrestGate → 写入 crestGate，loadBaseline 能读到", () => {
    learnBaseline(KEY, makeVector(20, -42), "常用负载");
    const ok = saveCrestGate(KEY, testGate);
    assert.equal(ok, true, "saveCrestGate 应返回 true");
    const b = loadBaseline(KEY)!;
    assert.ok(b.crestGate !== null, "crestGate 应被写入");
    assert.equal(b.crestGate.crestGateZ, 2.6);
    assert.equal(b.crestGate.version, 1);
  });

  it("GT29：saveCrestGate 对不存在的 key → 返回 false（不新建空基线）", () => {
    const ok = saveCrestGate("nonexistent:key", testGate);
    assert.equal(ok, false);
  });

  it("GT30：resetBaseline + recordMaintenance → 清理后 loadBaseline 返回 null", () => {
    learnBaseline(KEY, makeVector(20, -42), "常用负载");
    assert.ok(loadBaseline(KEY) !== null, "baseline 应存在");
    recordMaintenance(KEY);
    resetBaseline(KEY);
    assert.equal(loadBaseline(KEY), null, "reset 后应返回 null");
  });
});
