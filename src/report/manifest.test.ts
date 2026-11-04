/**
 * S5 报告 2.0 测试 —— ReportManifest 8 键 + 哈希链 + 门禁（对齐验收卡 §3.1）。
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

const _store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => _store.get(k) ?? null,
  setItem: (k: string, v: string) => { _store.set(k, v); },
  removeItem: (k: string) => _store.delete(k),
  clear: () => _store.clear(),
  get length() { return _store.size; },
  key: (i: number) => Array.from(_store.keys())[i] ?? null,
} as unknown as Storage;

if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
}

before(() => {
  if (!globalThis.crypto) {
    globalThis.crypto = require("node:crypto").webcrypto;
  }
});
after(() => { localStorage.clear(); });

import {
  buildManifest,
  sha256Hex,
  validateManifestInput,
  verifyManifest,
  type ReportManifest,
} from "../report/manifest.ts";

function bytes(s: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(s);
}

const SAMPLE_PDF = bytes("%PDF-1.4\n% sample pdf body\n%%EOF");
const BASE_INPUT = {
  geometry: { distanceM: 0.3, sensorPosition: "inlet" },
  condition: { bucket: "常用负载", baselineVersion: 1, baselineKey: "dev-A|bg0" },
  algorithmVersion: "2.0.0",
  sampleRateTrue: 48000,
  sampleRateOk: true,
  micPosition: "inlet",
  reportBytes: SAMPLE_PDF as unknown as Uint8Array<ArrayBufferLike>,
};

describe("MT01：sha256Hex", () => {
  it("空字符串 → SHA-256 标准向量", async () => {
    const h = await sha256Hex(bytes(""));
    assert.equal(h, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
  it("固定输入 → 64 字符小写 hex", async () => {
    const h = await sha256Hex(bytes("hello"));
    assert.equal(h.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(h));
    assert.equal(h, await sha256Hex(bytes("hello")));
  });
});

describe("GT20/GT21：validateManifestInput 门禁（验收卡 §6）", () => {
  it("GT20：缺 geometry → 拒绝", () => {
    const missing = validateManifestInput({ ...BASE_INPUT, geometry: null as any });
    assert.ok(missing.includes("geometry"));
  });
  it("GT21：缺 algorithm_version → 拒绝", () => {
    const missing = validateManifestInput({ ...BASE_INPUT, algorithmVersion: null });
    assert.ok(missing.includes("algorithm_version"));
  });
  it("sample_rate_true=0 → 拒绝", () => {
    const missing = validateManifestInput({ ...BASE_INPUT, sampleRateTrue: 0 });
    assert.ok(missing.includes("sample_rate_true"));
  });
  it("BASE_INPUT 无缺键", () => {
    const missing = validateManifestInput(BASE_INPUT);
    assert.deepEqual(missing, []);
  });
});

describe("MT03：buildManifest 8 键齐全（验收卡 §3.1）", () => {
  let m: ReportManifest;
  before(async () => { m = await buildManifest(BASE_INPUT); });

  it("8 顶层键对齐卡面命名", () => {
    const keys = Object.keys(m).sort();
    assert.deepEqual(keys, [
      "algorithm_version", "baseline_version", "clock_drift_min", "condition",
      "generated_at", "geometry", "mic_position", "raw_available",
      "sample_rate_true", "sha256",
    ]);
  });

  it("geometry 2 键 + condition 3 键对齐", () => {
    assert.equal(m.geometry.distanceM, 0.3);
    assert.equal(m.geometry.sensorPosition, "inlet");
    assert.equal(m.condition?.bucket, "常用负载");
    assert.equal(m.condition?.baselineVersion, 1);
    assert.equal(m.condition?.baselineKey, "dev-A|bg0");
  });

  it("algorithm_version / baseline_version / sample_rate_true / mic_position", () => {
    assert.equal(m.algorithm_version, "2.0.0");
    assert.equal(m.baseline_version, 1);
    assert.equal(m.sample_rate_true, 48000);
    assert.equal(m.mic_position, "inlet");
  });

  it("generated_at ISO 8601 + sha256 64 位 + raw_available=false + clock_drift_min=null", () => {
    assert.ok(!Number.isNaN(Date.parse(m.generated_at)));
    assert.ok(m.sha256.length === 64 && /^[0-9a-f]+$/.test(m.sha256));
    assert.equal(m.raw_available, false);
    assert.equal(m.clock_drift_min, null);
  });
});

describe("MT04：verifyManifest 哈希链", () => {
  let m: ReportManifest;
  before(async () => { m = await buildManifest(BASE_INPUT); });

  it("正确 PDF 字节 → true", async () => {
    assert.equal(await verifyManifest(m, SAMPLE_PDF), true);
  });

  it("篡改 PDF → false", async () => {
    const tampered = bytes("%PDF-1.4\n% TAMPERED\n%%EOF");
    assert.equal(await verifyManifest(m, tampered), false);
  });

  it("manifest.sha256 == PDF 实算", async () => {
    assert.equal(m.sha256, await sha256Hex(SAMPLE_PDF));
  });
});

describe("GT27：clock_drift_min 非空", () => {
  it("时钟漂移 10min → manifest.clock_drift_min=10", async () => {
    const m = await buildManifest({ ...BASE_INPUT, clockDriftMin: 10 });
    assert.equal(m.clock_drift_min, 10);
  });
});

describe("MT06：manifest.sha256 被篡改 → verify 失败", () => {
  it("sha256 被改 → verify 返回 false", async () => {
    const m = await buildManifest(BASE_INPUT);
    const tampered = { ...m, sha256: "0".repeat(64) };
    assert.equal(await verifyManifest(tampered as ReportManifest, SAMPLE_PDF), false);
  });
});
