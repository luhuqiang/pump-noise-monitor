/** Canvas 2D 渲染 → PNG toBlob（浏览器环境）。
 * Node 22 测试不可用 — 真机 Android WebView 环境正常。 */
import type { Report } from "./index.ts";

const WIDTH = 1080;
const HEIGHT = 1440;

function summaryLines(report: Report): string[] {
  const lines: string[] = [];
  lines.push(`App: ${report.app ?? "听诊仪"} v${report.version ?? "?"}`);
  lines.push(`Asset: ${report.asset?.name ?? "?"} (${report.asset?.id ?? "?"})`);
  lines.push(`Point: ${report.point?.name ?? "?"} (${report.point?.id ?? "?"})`);
  lines.push(`Generated: ${report.generatedAt ?? new Date().toISOString()}`);
  lines.push(`Status: ${report.diagnosis?.status ?? "unknown"}`);
  const dirs = report.diagnosis?.directions ?? [];
  if (dirs.length) lines.push(`Directions: ${dirs.join(", ")}`);
  const fixs = report.diagnosis?.fixList ?? [];
  if (fixs.length) lines.push(`Fixes: ${fixs.join("; ")}`);
  lines.push(`Next step: ${report.diagnosis?.nextStep ?? "none"}`);
  return lines;
}

/** 生成报告 PNG（Canvas 2D 渲染 → toBlob → Uint8Array）。 */
export async function generatePng(report: Report): Promise<Uint8Array> {
  // @ts-expect-error Canvas 在 Node 22 的 canvas 环境
  const canvas: HTMLCanvasElement =
    typeof document !== "undefined"
      ? document.createElement("canvas")
      : {
          width: WIDTH,
          height: HEIGHT,
          getContext: (_type: string) => {
            throw new Error("generatePng 需浏览器 Canvas 环境");
          },
          toBlob: (_cb: any, _opts?: any) => undefined,
        };
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D 不可用");

  // 白底
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 标题
  ctx.fillStyle = "#111111";
  ctx.font = "bold 48px sans-serif";
  ctx.fillText("听诊仪 2.0 报告", 40, 80);

  // 分割线
  ctx.strokeStyle = "#cccccc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 110);
  ctx.lineTo(WIDTH - 40, 110);
  ctx.stroke();

  // 正文
  ctx.fillStyle = "#222222";
  ctx.font = "28px sans-serif";
  const lines = summaryLines(report);
  let y = 170;
  for (const line of lines) {
    ctx.fillText(line, 40, y);
    y += 42;
  }

  // 转换到 PNG
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("toBlob 返回 null"));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          resolve(new Uint8Array(reader.result as ArrayBuffer));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
      },
      "image/png",
    );
  });
}

/** 把 PNG 字节下载为文件（浏览器）。 */
export function downloadPng(filename: string, bytes: Uint8Array) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
