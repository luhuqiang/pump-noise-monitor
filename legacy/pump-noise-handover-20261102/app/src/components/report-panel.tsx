import { useEffect, useRef, useState } from "react";
import { ClipboardCopy, FileDown, FileJson, FileText, Image, Share2 } from "lucide-react";
import { Panel, controlClass } from "@/components/panel";
import { useFrame } from "@/components/use-frame";
import { engine, downloadCsv } from "@/lib/audio/engine";
import { envelopePng, spectrumPng } from "@/lib/audio/draw";
import { getPumpType } from "@/lib/audio/scenarios";
import { getMachineId, shareOrCopy } from "@/lib/license";
import { buildJson, buildReport, buildSummary } from "@/lib/report";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

function downloadText(text: string, fileName: string, type: string) {
  const blob = new Blob([type.includes("json") ? text : "\uFEFF" + text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadUrl(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
}

async function shareImage(url: string, fileName: string, title: string, text: string) {
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], fileName, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text });
      return true;
    }
  } catch {
    /* 分享失败时退回下载 */
  }
  return false;
}

export function ReportPanel() {
  const tick = useFrame(300);
  void tick;
  const [machine, setMachine] = useState("");
  const [text, setText] = useState("");
  const [flash, setFlash] = useState("");
  const prevRunning = useRef(false);
  const running = engine.readout.running;
  const pumpType = useSettings((s) => s.pumpType);
  const rpm = useSettings((s) => s.rpm);
  const blades = useSettings((s) => s.blades);
  const bpfLabel = getPumpType(pumpType).bpfLabel;

  useEffect(() => {
    let alive = true;
    void getMachineId().then((result) => alive && setMachine(result.code));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (prevRunning.current && !running && machine) {
      const report = buildReport(machine);
      setText(report.text);
      setFlash("已自动生成最近一次检查报告");
    }
    prevRunning.current = running;
  }, [running, machine]);

  const note = (msg: string) => setFlash(msg);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      note(`${label}已复制到剪贴板`);
    } catch {
      if (!shareOrCopy(value)) note(`复制失败，请长按文字手动复制`);
    }
  };

  const buildText = () => {
    if (!text) {
      const report = buildReport(machine);
      setText(report.text);
      return report;
    }
    return { text, fileName: "泵噪监测报告.txt" };
  };

  const generate = () => {
    const report = buildReport(machine);
    setText(report.text);
    note("报告已生成，可复制、分享或导出");
  };

  const shareReport = () => {
    const report = buildText();
    if (shareOrCopy(report.text)) note("已打开系统分享");
    else void copy(report.text, "报告");
  };

  const shareSummary = () => {
    const summary = buildSummary(machine);
    if (shareOrCopy(summary)) note("已打开系统分享");
    else void copy(summary, "摘要");
  };

  const exportText = () => {
    const report = buildText();
    downloadText(report.text, report.fileName, "text/plain;charset=utf-8");
    note("已导出文本报告；若无反应请用“分享”");
  };

  const exportJson = () => {
    const data = buildJson(machine);
    downloadText(data.text, data.fileName, "application/json;charset=utf-8");
    note("已导出结构化 JSON");
  };

  const exportSpectrum = async () => {
    const url = spectrumPng(
      engine.rawDb,
      engine.cleanDb,
      engine.noiseDb,
      engine.analysisSampleRate || engine.sampleRate,
      engine.analysisFftSize || engine.fftSize,
      0,
      rpm,
      blades,
      bpfLabel,
    );
    if (!url) {
      note("还没有可导出的频谱，先观测几秒");
      return;
    }
    const name = `泵噪频谱-${Date.now()}.png`;
    if (await shareImage(url, name, "泵噪频谱", buildSummary(machine))) note("已分享频谱图");
    else {
      downloadUrl(url, name);
      note("已导出频谱 PNG");
    }
  };

  const exportEnvelope = async () => {
    const env = engine.envelope;
    if (!env) {
      note("还没有可导出的包络谱，先观测几秒");
      return;
    }
    const url = envelopePng(env, Math.max(1, rpm) / 60);
    if (!url) {
      note("包络谱数据不足");
      return;
    }
    const name = `泵噪包络-${Date.now()}.png`;
    if (await shareImage(url, name, "泵噪包络谱", buildSummary(machine))) note("已分享包络图");
    else {
      downloadUrl(url, name);
      note("已导出包络 PNG");
    }
  };

  return (
    <Panel
      title="分享与导出"
      hint="停止观测后自动生成报告；摘要适合发消息，JSON 便于接入工单"
      action={
        <span className="rounded-md bg-bg px-2 py-1 text-xs text-muted">
          {running ? "采样中" : text ? "已有报告" : "待生成"}
        </span>
      }
    >
      <div className="flex flex-wrap gap-2 px-2 pb-2">
        <button type="button" className={cn(controlClass, "bg-amber text-ink")} onClick={generate}>
          <FileText className="size-4" aria-hidden="true" />
          生成报告
        </button>
        <button type="button" className={controlClass} onClick={() => void copy(buildSummary(machine), "摘要")}>
          <ClipboardCopy className="size-4" aria-hidden="true" />
          复制摘要
        </button>
        <button type="button" className={controlClass} onClick={shareSummary}>
          <Share2 className="size-4" aria-hidden="true" />
          分享摘要
        </button>
        <button type="button" className={controlClass} onClick={() => void copy(buildText().text, "全文")}>
          <ClipboardCopy className="size-4" aria-hidden="true" />
          复制全文
        </button>
        <button type="button" className={controlClass} onClick={shareReport}>
          <Share2 className="size-4" aria-hidden="true" />
          分享报告
        </button>
      </div>
      <div className="flex flex-wrap gap-2 px-2 pb-2">
        <button type="button" className={controlClass} onClick={exportText}>
          <FileDown className="size-4" aria-hidden="true" />
          TXT
        </button>
        <button type="button" className={controlClass} onClick={exportJson}>
          <FileJson className="size-4" aria-hidden="true" />
          JSON
        </button>
        <button type="button" className={controlClass} onClick={() => downloadCsv()}>
          <FileDown className="size-4" aria-hidden="true" />
          CSV
        </button>
        <button type="button" className={controlClass} onClick={() => void exportSpectrum()}>
          <Image className="size-4" aria-hidden="true" />
          频谱 PNG
        </button>
        <button type="button" className={controlClass} onClick={() => void exportEnvelope()}>
          <Image className="size-4" aria-hidden="true" />
          包络 PNG
        </button>
      </div>
      {flash ? (
        <p className="px-2 pb-2 text-xs text-signal" role="status">
          {flash}
        </p>
      ) : null}
      {text ? (
        <pre className="mx-2 mb-2 max-h-72 overflow-auto rounded-lg bg-bg p-3 font-mono text-[11px] leading-relaxed text-fg">
          {text}
        </pre>
      ) : (
        <p className="px-2 pb-2 text-xs text-muted">
          报告含设备与工况、电机电流、相对声级 dBFS 与频谱特征、采样率真值与失效源、信噪比与降噪保真、判读结论与可能方向、包络轴承线索、报警记录、三分之一倍频程、算法版本与标准引用。
        </p>
      )}
    </Panel>
  );
}
