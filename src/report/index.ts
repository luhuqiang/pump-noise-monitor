/**
 * 报告生成（M08）：从 engine.readout + 配置生成结构化报告，
 * 支持 JSON / HTML / TXT 三种导出格式。
 *
 * D4：原始音频不留存，报告只含特征、证据与元数据。
 */
import { ALGORITHM_VERSION } from "../audio/diagnose.ts";
import type { Readout } from "../audio/engine.ts";
import type { PumpTypeId } from "../audio/scenarios.ts";

export type ReportContext = {
  assetId: string;
  assetName: string;
  pointId: string | null;
  pointName: string | null;
  pumpType: PumpTypeId;
  ratedRpm: number;
  blades: number;
};

export type Report = {
  app: string;
  version: string;
  generatedAt: string;
  asset: { id: string; name: string };
  point: { id: string | null; name: string | null };
  pump: { type: PumpTypeId; ratedRpm: number; blades: number };
  capture: {
    startedAt: string;
    durationSec: number;
    sampleRate: number;
    micStatus: string;
    phase: string;
  };
  quality: {
    sampleRateOk: boolean;
    snrDb: number;
    clip: boolean;
    agc: boolean;
    status: string;
  };
  diagnosis: {
    status: string;
    directions: { id: string; title: string; note: string }[];
    evidence: { spectrum: string; order: string; placement: string };
    fixList: string[];
    nextStep: string;
  };
  features: {
    orders: {
      reliable: boolean;
      oneX: number;
      twoX: number;
      bpf: number;
      half: number;
      oneXSnr: number;
    };
    bandDb: number[];
    levels: { aDb: number; cDb: number; zDb: number };
  };
};

const BAND_LABELS = ["40–80", "80–160", "160–315", "315–630", "630–1.25k", "1.25–2.5k", "2.5–5k", "5–10k"];

export function buildReport(readout: Readout, ctx: ReportContext): Report {
  const diag = readout.diagnosis;
  return {
    app: "听诊仪",
    version: ALGORITHM_VERSION,
    generatedAt: new Date().toISOString(),
    asset: { id: ctx.assetId, name: ctx.assetName },
    point: { id: ctx.pointId, name: ctx.pointName },
    pump: { type: ctx.pumpType, ratedRpm: ctx.ratedRpm, blades: ctx.blades },
    capture: {
      startedAt: new Date(Date.now() - readout.elapsed * 1000).toISOString(),
      durationSec: Math.round(readout.elapsed * 10) / 10,
      sampleRate: readout.sampleRate || 48000,
      micStatus: readout.micStatus,
      phase: readout.phase,
    },
    quality: {
      sampleRateOk: readout.quality.sampleRateOk,
      snrDb: Math.round(readout.quality.snr * 10) / 10,
      clip: readout.quality.clip,
      agc: readout.quality.agc,
      status: readout.quality.status,
    },
    diagnosis: diag
      ? {
          status: diag.status,
          directions: diag.directions.map((d) => ({ id: d.id, title: d.title, note: d.note })),
          evidence: { ...diag.evidence },
          fixList: [...diag.fixList],
          nextStep: diag.nextStep,
        }
      : {
          status: "low",
          directions: [],
          evidence: { spectrum: "无", order: "无", placement: "无" },
          fixList: [],
          nextStep: "retest",
        },
    features: {
      orders: { ...readout.orders },
      bandDb: readout.bandDb.map((v) => Math.round(v * 10) / 10),
      levels: {
        aDb: Math.round(readout.aDb * 10) / 10,
        cDb: Math.round(readout.cDb * 10) / 10,
        zDb: Math.round(readout.zDb * 10) / 10,
      },
    },
  };
}

/** JSON 格式 */
export function toJson(report: Report): string {
  return JSON.stringify(report, null, 2);
}

/** TXT 格式（纯文本，便于打印/粘贴） */
export function toTxt(report: Report): string {
  const lines: string[] = [];
  lines.push("=== 听诊仪 诊断报告 ===");
  lines.push(`版本：${report.version}`);
  lines.push(`生成时间：${report.generatedAt}`);
  lines.push("");
  lines.push(`设备：${report.asset.name}（${report.asset.id}）`);
  if (report.point.name) lines.push(`测点：${report.point.name}`);
  lines.push(`泵型：${report.pump.type}  额定转速：${report.pump.ratedRpm} r/min  叶片数：${report.pump.blades}`);
  lines.push("");
  lines.push("--- 采集 ---");
  lines.push(`时长：${report.capture.durationSec} s  采样率：${report.capture.sampleRate} Hz`);
  lines.push(`麦克风：${report.capture.micStatus}  运行态：${report.capture.phase}`);
  lines.push("");
  lines.push("--- 质量灯 ---");
  lines.push(
    `采样率：${report.quality.sampleRateOk ? "正常" : "异常"}  SNR：${report.quality.snrDb} dB  削顶：${
      report.quality.clip ? "是" : "否"
    }  AGC：${report.quality.agc ? "介入" : "关闭"}  状态：${report.quality.status}`,
  );
  lines.push("");
  lines.push("--- 诊断结论 ---");
  const statusLabel: Record<string, string> = { ok: "有把握", low: "证据不足", invalid: "本次不作结论" };
  lines.push(`状态：${statusLabel[report.diagnosis.status] ?? report.diagnosis.status}`);
  if (report.diagnosis.directions.length) {
    lines.push("关注机制：");
    for (const d of report.diagnosis.directions) lines.push(`  - ${d.title}${d.note ? `：${d.note}` : ""}`);
  }
  if (report.diagnosis.fixList.length) {
    lines.push("修复清单：");
    report.diagnosis.fixList.forEach((f, i) => lines.push(`  ${i + 1}. ${f}`));
  }
  lines.push("");
  lines.push("--- 证据 ---");
  lines.push(`频谱带：${report.diagnosis.evidence.spectrum}`);
  lines.push(`阶次：${report.diagnosis.evidence.order}`);
  lines.push(`摆位/质量：${report.diagnosis.evidence.placement}`);
  lines.push("");
  lines.push("--- 阶次特征 ---");
  const o = report.features.orders;
  lines.push(
    `可用：${o.reliable ? "是" : "否"}  1×：${o.oneX.toFixed(2)}  2×：${o.twoX.toFixed(2)}  BPF：${o.bpf.toFixed(2)}  半阶次：${o.half.toFixed(2)}  1× SNR：${o.oneXSnr.toFixed(1)} dB`,
  );
  lines.push("");
  lines.push("--- 8 带电平（dB re 总能量）---");
  const bandStr = report.features.bandDb
    .map((v, i) => `${BAND_LABELS[i]}:${v.toFixed(1)}`)
    .join("  ");
  lines.push(bandStr);
  lines.push("");
  lines.push("--- 声级 ---");
  lines.push(
    `A：${report.features.levels.aDb.toFixed(1)} dBFS  C：${report.features.levels.cDb.toFixed(1)} dBFS  Z：${report.features.levels.zDb.toFixed(1)} dBFS`,
  );
  return lines.join("\n");
}

/** HTML 格式（自包含，可直接浏览器打开） */
export function toHtml(report: Report): string {
  const statusColor: Record<string, string> = {
    ok: "#33584a",
    low: "#7a5c24",
    invalid: "#8a3f32",
  };
  const statusLabel: Record<string, string> = { ok: "有把握", low: "证据不足", invalid: "本次不作结论" };
  const c = report.diagnosis;
  const dirsHtml = c.directions.length
    ? c.directions
        .map(
          (d) =>
            `<div class="dir"><b>${d.title}</b>${d.note ? `<div class="note">${d.note}</div>` : ""}</div>`,
        )
        .join("")
    : '<div class="note">无</div>';
  const fixHtml = c.fixList.length
    ? `<ol>${c.fixList.map((f) => `<li>${f}</li>`).join("")}</ol>`
    : "";
  const bandRows = report.features.bandDb
    .map((v, i) => `<tr><td>${BAND_LABELS[i]}</td><td>${v.toFixed(1)}</td></tr>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>听诊仪诊断报告</title>
<style>
  body { font-family: -apple-system, "PingFang SC", sans-serif; max-width: 640px; margin: 32px auto; color: #1b211e; background: #efece3; padding: 0 16px; }
  h1 { font-size: 20px; border-bottom: 1px solid #d5d0c1; padding-bottom: 8px; }
  h2 { font-size: 15px; margin-top: 20px; }
  .status { font-size: 22px; font-weight: 600; color: ${statusColor[c.status] ?? "#1b211e"}; }
  .section { background: #fff; border: 1px solid #d5d0c1; padding: 12px; margin: 8px 0; }
  .note { color: #5c635c; font-size: 13px; margin-top: 4px; }
  .dir { padding: 6px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  td { padding: 3px 8px; border-bottom: 1px solid #d5d0c1; }
  .meta { color: #5c635c; font-size: 12px; }
</style>
</head>
<body>
<h1>听诊仪 诊断报告</h1>
<div class="meta">版本 ${report.version} · ${report.generatedAt}</div>

<div class="section">
  <div class="status">${statusLabel[c.status] ?? c.status}</div>
  <div class="note">${report.asset.name} · ${report.pump.type} · ${report.pump.ratedRpm} r/min</div>
</div>

<h2>采集</h2>
<div class="section">
  时长 ${report.capture.durationSec} s · 采样率 ${report.capture.sampleRate} Hz · 麦克风 ${report.capture.micStatus} · 运行态 ${report.capture.phase}
</div>

<h2>质量灯</h2>
<div class="section">
  采样率 ${report.quality.sampleRateOk ? "正常" : "异常"} · SNR ${report.quality.snrDb} dB · 削顶 ${report.quality.clip ? "是" : "否"} · AGC ${report.quality.agc ? "介入" : "关闭"}
</div>

${c.status !== "invalid" ? `<h2>关注机制</h2><div class="section">${dirsHtml}</div>` : ""}
${fixHtml ? `<h2>修复清单</h2><div class="section">${fixHtml}</div>` : ""}

<h2>证据</h2>
<div class="section">
  <div><b>频谱带：</b>${c.evidence.spectrum}</div>
  <div><b>阶次：</b>${c.evidence.order}</div>
  <div><b>摆位/质量：</b>${c.evidence.placement}</div>
</div>

<h2>阶次特征</h2>
<div class="section">
  可用 ${report.features.orders.reliable ? "是" : "否"} · 1× ${report.features.orders.oneX.toFixed(2)} · 2× ${report.features.orders.twoX.toFixed(2)} · BPF ${report.features.orders.bpf.toFixed(2)} · 半阶次 ${report.features.orders.half.toFixed(2)}
</div>

<h2>8 带电平</h2>
<div class="section">
  <table><tbody>${bandRows}</tbody></table>
</div>

<h2>声级</h2>
<div class="section">
  A ${report.features.levels.aDb.toFixed(1)} dBFS · C ${report.features.levels.cDb.toFixed(1)} dBFS · Z ${report.features.levels.zDb.toFixed(1)} dBFS
</div>
</body>
</html>`;
}

/** 触发浏览器下载 */
export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============ S5：Report 2.0 + Manifest ============
import { buildManifest, type ManifestInput, type ReportManifest } from "./manifest";
import { put } from "../db/idb";

export type ReportBundle = {
  report: Report;
  reportJson: string;
  manifest: ReportManifest;
};

/** 带 Manifest 的报告构造：同时持久化到 IndexedDB reports store。 */
export async function buildWithManifest(
  readout: Readout,
  ctx: ReportContext,
  manifestInput: Omit<ManifestInput, "reportJson">,
): Promise<ReportBundle> {
  const report = buildReport(readout, ctx);
  const reportJson = toJson(report);
  const manifest = await buildManifest({ ...manifestInput, reportJson });

  // S3：持久化到 IndexedDB reports store（如果 DB 还没初始化，静默跳过——UI 首次使用时 idb.ts 会自动 openDB）
  try {
    await put("reports", {
      id: `rep_${Date.now()}`,
      session_id: manifestInput.geometry.baselineKey ?? "",
      report_json: reportJson,
      manifest_json: JSON.stringify(manifest),
      created_at: new Date().toISOString(),
      sha256: manifest.reportSha256,
    });
  } catch {
    // IndexedDB 不可用时跳过持久化，不阻塞报告生成
  }

  return { report, reportJson, manifest };
}
