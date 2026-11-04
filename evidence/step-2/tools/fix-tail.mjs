import fs from "node:fs";
const p = "evidence/step-2/verify.ps1";
let s = fs.readFileSync(p, "utf8");
// 去掉 BOM 前缀便于匹配，写完再补回（PS5 需要 BOM 才按 UTF-8 读）
const bom = s.charCodeAt(0) === 0xFEFF ? "\uFEFF" : "";
if (bom) s = s.slice(1);
const tail = `Write-Host "\`n===== VERDICT: PASS（自动项无 Fail；N/A 不计为通过，人工项另判）=====" -ForegroundColor Green
} else {
  Write-Host "\`n===== VERDICT: FAIL ($($failed.Count)) =====" -ForegroundColor Red
  $failed | ForEach-Object { Write-Host ("- " + $_.Check + " :: " + $_.Detail) -ForegroundColor Red }
  exit 1
}
`;
if (!/Write-Host "\s*$/.test(s)) throw new Error("anchor not found");
s = s.replace(/Write-Host "\s*$/, tail);
fs.writeFileSync(p, bom + s);
console.log("tail fixed, lines:", s.split("\n").length);
