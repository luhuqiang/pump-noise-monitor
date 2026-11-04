/**
 * S5 报告 2.0 测试 —— ReportManifest 8 键 + 哈希链 + 门禁。
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

// ------ 全局 mock localStorage（fingerprint.ts 的 learnBaseline/loadBaseline 依赖）------
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

// Node 22 需要 crypto.subtle
before(() => {
  if (!globalThis.crypto) {
    require("node:crypto").webcrypto;
  }
});
after(() => {
  localStorage.clear();
});

import {
  buildManifest,
  sha256Hex,
  validateManifestInput,
  verifyManifest,
  type ReportManifest,
} from "../report/manifest.ts";

const SAMPLE_REPORT = JSON.stringify(
  {
    app: "听诊仪",
    version: "2.0.0",
    generatedAt: "2026-11-04T12:00:00Z",
    asset: { id: "A-001", name: "主给水泵" },
    diagnosis: { status: "ok", directions: [], fixList: [], nextStep: "none" },
  },
  null,
  2,
);

const BASE_INPUT = {
  reportJson: SAMPLE_REPORT,
  geometry: {
    distanceM: 0.3,
    sensorPosition: "inlet",
    baselineVersion: 1,
    baselineKey: "dev-A|bg0",
    bucket: "常用负载",
  },
  sampleRate: 48000,
  sampleRateOk: true,
  micDirection: "inlet",
};

// ============================================================
// MT01：sha256Hex 确定性 + 长度
// ============================================================
describe("MT01：sha256Hex", () => {
  it("固定输入 → 固定 64 字符小写 hex", async () => {
    const h = await sha256Hex("hello world");
    assert.equal(h.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(h));
    assert.equal(h, await sha256Hex("hello world"));
    assert.notEqual(h, await sha256Hex("HELLO WORLD"));
  });

  it("SHA-256 标准向量：空字符串", async () => {
    const h = await sha256Hex("");
    assert.equal(
      h,
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

// ============================================================
// MT02：validateManifestInput — 门禁缺键检查
// ============================================================
describe("MT02：validateManifestInput 门禁", () => {
  it("BASE_INPUT 无缺键", () => {
    const missing = validateManifestInput(BASE_INPUT);
    assert.deepEqual(missing, []);
  });

  it("缺 reportJson → 报缺键", () => {
    const missing = validateManifestInput({ ...BASE_INPUT, reportJson: "" });
    assert.ok(missing.includes("reportJson"));
  });

  it("缺 geometry → 报缺键", () => {
    const missing = validateManifestInput({ ...BASE_INPUT, geometry: null as any });
    assert.ok(missing.includes("geometry"));
  });

  it("sampleRate=0 → 报缺键", () => {
    const missing = validateManifestInput({ ...BASE_INPUT, sampleRate: 0 });
    assert.ok(missing.includes("sampleRate"));
  });

  it("sampleRate=-1 → 报缺键", () => {
    const missing = validateManifestInput({ ...BASE_INPUT, sampleRate: -1 });
    assert.ok(missing.includes("sampleRate"));
  });
});

// ============================================================
// MT03：buildManifest — 8 键齐全
// ============================================================
describe("MT03：buildManifest 8 键齐全", () => {
  let manifest: ReportManifest;

  before(async () => {
    manifest = await buildManifest(BASE_INPUT);
  });

  it("8 个顶层键 + manifestVersion=1.0", () => {
    const topKeys = Object.keys(manifest).sort();
    assert.deepEqual(topKeys, [
      "algorithmVersion",
      "condition",
      "generatedAt",
      "geometry",
      "manifestVersion",
      "micDirection",
      "reportSha256",
      "sampleRate",
    ]);
    assert.equal(manifest.manifestVersion, "1.0");
  });

  it("geometry 2 键齐全：distanceM + sensorPosition", () => {
    assert.ok(manifest.geometry);
    assert.equal(manifest.geometry.distanceM, 0.3);
    assert.equal(manifest.geometry.sensorPosition, "inlet");
  });

  it("condition 3 键齐全：bucket + baselineVersion + baselineKey", () => {
    assert.equal(manifest.condition.bucket, "常用负载");
    assert.equal(manifest.condition.baselineVersion, 1);
    assert.equal(manifest.condition.baselineKey, "dev-A|bg0");
  });

  it("sampleRate 2 键：value + ok", () => {
    assert.equal(manifest.sampleRate.value, 48000);
    assert.equal(manifest.sampleRate.ok, true);
  });

  it("algorithmVersion 非空", () => {
    assert.ok(typeof manifest.algorithmVersion === "string" && manifest.algorithmVersion.length > 0);
  });

  it("reportSha256 — 64 字符小写 hex", () => {
    assert.equal(manifest.reportSha256.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(manifest.reportSha256));
  });

  it("generatedAt — ISO 8601 字符串", () => {
    assert.ok(!Number.isNaN(Date.parse(manifest.generatedAt)));
  });
});

// ============================================================
// MT04：哈希链 — verifyManifest 对正确/篡改 report 的行为
// ============================================================
describe("MT04：verifyManifest 哈希链", () => {
  let manifest: ReportManifest;

  before(async () => {
    manifest = await buildManifest(BASE_INPUT);
  });

  it("正确 report → 返回 true", async () => {
    assert.equal(await verifyManifest(manifest, SAMPLE_REPORT), true);
  });

  it("篡改 report 内容 → 返回 false", async () => {
    const tampered = SAMPLE_REPORT.replace("ok", "fault");
    assert.equal(await verifyManifest(manifest, tampered), false);
  });

  it("manifest 自身的 reportSha256 与实算一致", async () => {
    const actual = await sha256Hex(SAMPLE_REPORT);
    assert.equal(manifest.reportSha256, actual);
  });
});

// ============================================================
// MT05：边界 — geometry 字段 null 时 manifest 仍能构建
// ============================================================
describe("MT05：边界 — null 字段处理", () => {
  it("geometry 全 null → manifest 可构建", async () => {
    const manifest = await buildManifest({
      ...BASE_INPUT,
      geometry: {
        distanceM: null,
        sensorPosition: null,
        baselineVersion: null,
        baselineKey: null,
        bucket: null,
      },
    });
    assert.equal(manifest.geometry.distanceM, null);
    assert.equal(manifest.geometry.sensorPosition, null);
    assert.equal(manifest.condition.baselineVersion, null);
    assert.equal(manifest.condition.baselineKey, null);
    assert.equal(manifest.condition.bucket, null);
  });
});

// ============================================================
// MT06：篡改 manifest 的 reportSha256 → verifyManifest 失败
// ============================================================
describe("MT06：manifest 哈希链自身被篡改", () => {
  it("manifest.reportSha256 被改 → verify 返回 false", async () => {
    const manifest = await buildManifest(BASE_INPUT);
    const tampered = { ...manifest, reportSha256: "0".repeat(64) };
    assert.equal(await verifyManifest(tampered as ReportManifest, SAMPLE_REPORT), false);
  });
});
