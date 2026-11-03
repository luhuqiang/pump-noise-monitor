/**
 * 构建后处理：给 dist 文本资产加 UTF-8 BOM。
 * 原因：验收脚本用 PowerShell 5 Select-String 读文件（无 BOM 时按系统 ANSI 误判编码），
 * BOM 是标准编码标记，让 UTF-8 中文按真实编码可读；对浏览器/WebView 无副作用。
 */
import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist");
let count = 0;
for (const rel of ["index.html", ...fs.readdirSync(path.join(DIST, "assets")).map((f) => path.join("assets", f))]) {
  const p = path.join(DIST, rel);
  if (!/\.(js|css|html)$/.test(rel)) continue;
  const buf = fs.readFileSync(p);
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) continue;
  fs.writeFileSync(p, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), buf]));
  count++;
}
console.log(`postbuild-bom: ${count} files`);
