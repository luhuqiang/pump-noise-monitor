/**
 * S5：报告 PDF 生成器（最小降级，D-02 路线）。
 * 验收卡禁止 HTML 改名当 PDF — 本文件用纯 PDF 1.4 二进制直写，
 * 字体用 PDF 内置 Helvetica（无中文，但报告核心字段为 ASCII）。
 * 中文/换行留待真机 Android WebView 环境用 jsPDF + 中文字体。
 */
import type { Report } from "./index.ts";

const PDF_MAGIC = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
const NEWLINE = 0x0a;

function b(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// ------- PDF 构造器 -------
class PdfWriter {
  private objects: Uint8Array[] = [];
  private offsets: number[] = [];

  /** 追加对象，返回对象号（从 1 开始）。 */
  addObject(content: string | Uint8Array): number {
    const bytes = typeof content === "string" ? b(content) : content;
    this.objects.push(bytes);
    return this.objects.length;
  }

  /** 追加 stream 对象，返回对象号。 */
  addStreamObject(stream: string): number {
    const streamBytes = b(stream);
    const header = `<< /Length ${streamBytes.length} >>\nstream\n`;
    const footer = "\nendstream";
    const full = new Uint8Array(header.length + streamBytes.length + footer.length);
    full.set(b(header), 0);
    full.set(streamBytes, header.length);
    full.set(b(footer), header.length + streamBytes.length);
    return this.addObject(full);
  }

  /** 输出完整 PDF 二进制。 */
  toBytes(): Uint8Array {
    const out: number[] = [];
    let cursor = 0;
    // header
    for (const m of PDF_MAGIC) out.push(m);
    out.push(NEWLINE);
    cursor = out.length;
    // body objects
    for (let i = 0; i < this.objects.length; i++) {
      this.offsets.push(cursor);
      const objHeader = b(`${i + 1} 0 obj\n`);
      out.push(...objHeader);
      cursor += objHeader.length;
      out.push(...this.objects[i]);
      cursor += this.objects[i].length;
      out.push(NEWLINE);
      out.push(...b("endobj\n"));
      cursor += 7; // "endobj\n"
    }
    // xref
    const xrefOffset = cursor;
    out.push(...b("xref\n"));
    cursor += 5;
    out.push(...b(`0 ${this.objects.length + 1}\n`));
    cursor += 8;
    out.push(...b("0000000000 65535 f \n"));
    cursor += 20;
    for (const off of this.offsets) {
      const line = String(off).padStart(10, "0") + " 00000 n \n";
      out.push(...b(line));
      cursor += line.length;
    }
    // trailer
    out.push(...b(`trailer\n<< /Size ${this.objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
    return new Uint8Array(out);
  }
}

/** 把字符串转成 PDF text string（括号包裹 + 转义）。 */
function pdfString(s: string): string {
  return "(" + s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)") + ")";
}

/** 把诊断方向数组转成 PDF 友好的 ASCII 摘要。 */
function summaryText(report: Report): string {
  const parts: string[] = [];
  parts.push(`App: ${report.app ?? "听诊仪"} v${report.version ?? "?"}`);
  parts.push(`Asset: ${report.asset?.name ?? "?"} (${report.asset?.id ?? "?"})`);
  parts.push(`Point: ${report.point?.name ?? "?"} (${report.point?.id ?? "?"})`);
  parts.push(`Generated: ${report.generatedAt ?? new Date().toISOString()}`);
  parts.push(`Status: ${report.diagnosis?.status ?? "unknown"}`);
  const dirs = report.diagnosis?.directions ?? [];
  if (dirs.length) parts.push(`Directions: ${dirs.join(", ")}`);
  const fixs = report.diagnosis?.fixList ?? [];
  if (fixs.length) parts.push(`Fixes: ${fixs.join("; ")}`);
  parts.push(`Next step: ${report.diagnosis?.nextStep ?? "none"}`);
  return parts.join("\n");
}

/** 单行文本 stream 片段。 */
function textOp(x: number, y: number, text: string): string {
  return `BT\n/F1 12 Tf\n${x} ${y} Td\n${pdfString(text)}\nTj\nET\n`;
}

/** 生成 PDF：最小 1 页报告摘要。 */
export function generatePdf(report: Report): Uint8Array {
  const lines = summaryText(report).split("\n");
  const writer = new PdfWriter();
  // page content stream（ASCII 摘要逐行）
  let content = `/CS1 cs\n`; // 色空间
  let y = 780;
  for (const line of lines) {
    content += textOp(50, y, line);
    y -= 22;
  }
  const contentObjId = writer.addStreamObject(content);
  // font
  writer.addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  // font resource
  writer.addObject("<< /F1 2 0 R >>");
  // page
  const pageObjId = writer.addObject(
    `<< /Type /Page /Parent 4 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjId} 0 R >>`,
  );
  // pages tree
  const pagesObjId = writer.addObject(
    `<< /Type /Pages /Kids [${pageObjId} 0 R] /Count 1 >>`,
  );
  // catalog root
  writer.addObject(`<< /Type /Catalog /Pages ${pagesObjId} 0 R >>`);
  return writer.toBytes();
}

/** 把字节下载为 PDF（浏览器环境）。 */
export function downloadPdf(filename: string, bytes: Uint8Array) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
