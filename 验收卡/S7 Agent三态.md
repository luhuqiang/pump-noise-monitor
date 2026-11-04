# S7 Agent 三态 · 分步验收卡

> 依据：`推进计划.md` §5 S7；03 T11–T15；07 AC-08/09/10；`步骤验收卡-模板.md`。
> 本卡只执行已有编号：`M07`、`GT15`–`GT19`、`GT22`–`GT23`、`AC-08`–`AC-10`、`F03`/`F04`/`F08`/`F10`。

---

## 1. 步骤信息

| 字段 | 填写 |
|---|---|
| 步骤编号 | `S7` |
| 步骤名称 | Agent 三态与拒答 |
| 对应编号 | `M07`；`GT15`–`GT19`、`GT22`–`GT23`；`AC-08`–`AC-10`；`F03`、`F04`、`F08`、`F10` |
| 计划人日 | 6–8 |
| 版本 | `versionCode=6`、`versionName=2.0.0` |
| 证据目录 | `evidence/step-7/` |
| 执行人 | 执行人（自检） |
| 执行日期 | 执行当日填写 |
| 构建产物 | `听诊仪.apk`，SHA-256 见 `apk-sha256.txt` |

---

## 2. 前置条件（任一为否，停止）

| # | 前置 | 判定命令/文件 | 判定结果 |
|---|---|---|---|
| 1 | S6 已放行 | `evidence/step-6/signoff.md` 结论=通过 | 是／否 |
| 2 | 三态数据结构已冻结 | `src/audio/engine.ts` 输出 `ok` / `low_confidence` / `invalid` | 是／否 |
| 3 | 工具白名单可读 | 03 T11–T15 已冻结 | 是／否 |
| 4 | 工作区代码干净 | `git status --porcelain -- src scripts package.json` 为空 | 是／否 |
| 5 | 证书基线可读 | `Test-Path .\evidence\step-0\cert-sha256.txt` | 是／否 |
| 6 | 20 条固定夹具已准备 | `evidence/step-7/fixtures-20.json` 可读 | 是／否 |
| 7 | 样本与评审 | 本步不涉及，填 `N/A`（S10 / S11 处理） | N/A |

---

## 3. 产出物清单

| # | 产出 | 实际路径 | 状态 |
|---|---|---|---|
| 1 | Agent 状态机 | `src/agent/machine.ts` | 待创建 |
| 2 | 工具白名单 | `src/agent/tools.ts` | 待创建 |
| 3 | 提示词模板（仅措辞） | `src/agent/prompt.ts` | 待创建 |
| 4 | 三态渲染 | `src/components/TriState.tsx` | 待创建 |
| 5 | 三态矩阵 | `evidence/step-7/tri-state-matrix.csv` | 待生成 |
| 6 | 20 条夹具 | `evidence/step-7/fixtures-20.json` | 待生成 |
| 7 | 低置信输出文本 | `evidence/step-7/low-confidence-output.txt` | 待生成 |
| 8 | GT 证据 7 份 | `evidence/step-7/gt/GT15.json` … `GT23.json` | 待生成 |
| 9 | 签名 APK | `听诊仪.apk` | 待生成 |

### 3.1 三态矩阵固定口径

`tri-state-matrix.csv` 列：`state,source,verdict`。

- `state` 三值：`ok`、`low_confidence`、`invalid`，每值 3 行，共 9 行。
- `source` 三值：`audio`、`baseline`、`agent`。
- `verdict` 非空，取 `pass` / `fail` / `na`。

---

## 4. 自动验收命令块（PowerShell 5，复制即跑）

```powershell
# ===== S7 自动验收（PowerShell 5）=====
$ErrorActionPreference = "Continue"

# ===== 本步参数 =====
$Step                = "S7"
$Apk                 = ".\听诊仪.apk"
$ExpectVC            = 6
$ExpectVN            = "2.0.0"
$MinTests            = 66
$MinKB               = 300            # 继承 S5/S6 包体基线；S7 未单列新阈值
$MaxKB               = 900
$RequiredStrings     = @()            # N/A：S7 无新增 UI 字符串门禁
$ForbiddenEntries    = @("postgres.wasm")
$RequiredEntries     = @("AndroidManifest.xml", "classes.dex", "assets/www/index.html")
$MinSamples          = 0              # N/A：样本在 S10
$RequireReviews      = @()            # N/A：评审在 S11
$RequireBaselineCert = $true
$SkipPgliteCheck     = $false
$RunNpmCi            = $false         # N/A：依赖已在 S1 验证
$RunApkBuild         = $true
$EvidenceDir         = "evidence/step-$Step"

# ===== 初始化 =====
$results = @()
New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null
$log = Join-Path $EvidenceDir "verify.log"
"# verify $Step $(Get-Date -Format o)" | Set-Content -Path $log -Encoding UTF8

function Add-Result {
  param([string]$Name, [string]$Status, [string]$Detail)
  $script:results += @{ Check = $Name; Status = $Status; Detail = $Detail }
}
function Write-Log {
  param([string]$Text)
  Write-Host $Text
  Add-Content -Path $script:log -Value $Text -Encoding UTF8
}

# ===== 1. 依赖（N/A） =====
Add-Result "npm-ci" "N/A" "依赖已在 S1 用 npm ci 验证；本步不重装"

# ===== 2. 类型检查 =====
$tcOut = (npm run typecheck 2>&1 | Out-String)
Write-Log $tcOut
$tcExit = $LASTEXITCODE
if ($tcExit -eq 0) { Add-Result "typecheck" "Pass" "exit=0" } else { Add-Result "typecheck" "Fail" "exit=$tcExit" }

# ===== 3. 单元测试 =====
$testOut = (npm test 2>&1 | Out-String)
Write-Log $testOut
$mPass = [regex]::Match($testOut, "# pass (\d+)")
$mFail = [regex]::Match($testOut, "# fail (\d+)")
$passCount = 0
$failCount = 999
if ($mPass.Success) { $passCount = [int]$mPass.Groups[1].Value }
if ($mFail.Success) { $failCount = [int]$mFail.Groups[1].Value }
if (($failCount -eq 0) -and ($passCount -ge $MinTests)) {
  Add-Result "tests" "Pass" "pass=$passCount fail=$failCount need>=$MinTests"
} else {
  Add-Result "tests" "Fail" "pass=$passCount fail=$failCount need>=$MinTests"
}

# ===== 4. 前端构建 =====
$buildOut = (npm run build 2>&1 | Out-String)
Write-Log $buildOut
$buildExit = $LASTEXITCODE
$distOk = Test-Path ".\dist\index.html"
if (($buildExit -eq 0) -and $distOk) {
  Add-Result "vite-build" "Pass" "exit=0 dist/index.html=True"
} else {
  Add-Result "vite-build" "Fail" "exit=$buildExit dist/index.html=$distOk"
}

# ===== 5. 打包 + 签名 =====
$apkOut = (npm run apk 2>&1 | Out-String)
Write-Log $apkOut
$apkExit = $LASTEXITCODE
$apkExists = Test-Path $Apk
if (($apkExit -eq 0) -and $apkExists) {
  Add-Result "apk-build" "Pass" "exit=0 apk=True"
} else {
  Add-Result "apk-build" "Fail" "exit=$apkExit apk=$apkExists"
}

# ===== 6. check-apk =====
$checkOut = (npm run check:apk -- $Apk 2>&1 | Out-String)
Write-Log $checkOut
$checkExit = $LASTEXITCODE
$checkOk = ($checkExit -eq 0) -and ($checkOut -match '"ok"\s*:\s*true') -and ($checkOut -match '"brokenRefs"\s*:\s*\[\s*\]')
if ($checkOk) { Add-Result "check-apk" "Pass" "exit=0 ok=true brokenRefs=[]" } else { Add-Result "check-apk" "Fail" "exit=$checkExit ok=$checkOk" }
$checkOut | Set-Content -Path (Join-Path $EvidenceDir "check-apk.json") -Encoding UTF8

# ===== 7. 版本 =====
$vcM = [regex]::Match($checkOut, '"versionCode"\s*:\s*(\d+)')
$vnM = [regex]::Match($checkOut, '"versionName"\s*:\s*"([^"]+)"')
$vc = if ($vcM.Success) { [int]$vcM.Groups[1].Value } else { 0 }
$vn = if ($vnM.Success) { $vnM.Groups[1].Value } else { "" }
if (($vc -eq $ExpectVC) -and ($vn -eq $ExpectVN)) {
  Add-Result "version" "Pass" "vc=$vc vn=$vn expect=$ExpectVC/$ExpectVN"
} else {
  Add-Result "version" "Fail" "vc=$vc vn=$vn expect=$ExpectVC/$ExpectVN"
}

# ===== 8. 证书 =====
$certM = [regex]::Match($checkOut, '"certSha256"\s*:\s*"([0-9a-fA-F]{64})"')
$cert = if ($certM.Success) { $certM.Groups[1].Value } else { "" }
$cert | Set-Content -Path (Join-Path $EvidenceDir "cert-sha256.txt") -Encoding UTF8
$baselineFile = ".\evidence\step-0\cert-sha256.txt"
$baselineCert = if (Test-Path $baselineFile) { (Get-Content $baselineFile -Raw).Trim() } else { "" }
if (($cert.Length -eq 64) -and ($cert -eq $baselineCert)) {
  Add-Result "cert-sha256" "Pass" "cert=$cert baseline=$baselineCert"
} else {
  Add-Result "cert-sha256" "Fail" "cert=$cert baseline=$baselineCert"
}

# ===== 9. 体积 =====
if (Test-Path $Apk) { $sizeKB = [math]::Round((Get-Item $Apk).Length / 1KB, 1) } else { $sizeKB = 0 }
"APK_SIZE_KB=$sizeKB (need $MinKB-$MaxKB)" | Set-Content -Path (Join-Path $EvidenceDir "apk-size.txt") -Encoding UTF8
if (($sizeKB -ge $MinKB) -and ($sizeKB -le $MaxKB)) {
  Add-Result "apk-size" "Pass" "$sizeKB KB (need $MinKB-$MaxKB)"
} else {
  Add-Result "apk-size" "Fail" "$sizeKB KB (need $MinKB-$MaxKB)"
}

# ===== 10. APK SHA =====
$apkHash = ""
if (Test-Path $Apk) { $apkHash = (Get-FileHash $Apk -Algorithm SHA256).Hash }
$apkHash | Set-Content -Path (Join-Path $EvidenceDir "apk-sha256.txt") -Encoding UTF8
if ($apkHash.Length -eq 64) { Add-Result "apk-sha256" "Pass" $apkHash } else { Add-Result "apk-sha256" "Fail" "hash=$apkHash" }

# ===== 11. UI 字符串（N/A） =====
"N/A: S7 无新增 UI 字符串门禁" | Set-Content -Path (Join-Path $EvidenceDir "ui-strings.txt") -Encoding UTF8
Add-Result "ui-strings" "N/A" "S7 无新增 UI 字符串门禁"

# ===== 12. APK 条目 =====
$entries = $null
if (Test-Path $Apk) {
  if (Get-Command jar -ErrorAction SilentlyContinue) {
    $entries = @(jar tf $Apk 2>$null)
  } elseif (Get-Command unzip -ErrorAction SilentlyContinue) {
    $entries = @(unzip -Z1 $Apk 2>$null)
  }
}
if (($entries -eq $null) -or ($entries.Count -eq 0)) {
  Add-Result "apk-entries" "Fail" "jar/unzip 不可用或包为空"
} else {
  $entries | Set-Content -Path (Join-Path $EvidenceDir "apk-entries.txt") -Encoding UTF8
  foreach ($f in $ForbiddenEntries) {
    $hit = @($entries | Select-String -Pattern $f -SimpleMatch).Count
    if ($hit -eq 0) { Add-Result "forbidden-entry:$f" "Pass" "hits=0" } else { Add-Result "forbidden-entry:$f" "Fail" "hits=$hit" }
  }
  foreach ($f in $RequiredEntries) {
    $hit = @($entries | Select-String -Pattern $f -SimpleMatch).Count
    if ($hit -ge 1) { Add-Result "required-entry:$f" "Pass" "hits=$hit" } else { Add-Result "required-entry:$f" "Fail" "hits=0" }
  }
}

# ===== 13. 源码 PGlite / idb:// =====
$srcFiles = @(Get-ChildItem ".\src" -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in @(".ts", ".tsx") })
$pgHits = 0
if ($srcFiles.Count -gt 0) {
  $pgHits = @(Select-String -Path $srcFiles.FullName -Pattern @("idb://", "new PGlite") -SimpleMatch -ErrorAction SilentlyContinue).Count
}
if ($pgHits -eq 0) { Add-Result "no-pglite" "Pass" "hits=0" } else { Add-Result "no-pglite" "Fail" "hits=$pgHits" }

# ===== 14. 样本（N/A） =====
Add-Result "samples" "N/A" "样本验收在 S10"

# ===== 15. 评审（N/A） =====
Add-Result "reviews" "N/A" "评审 12/15/16 在 S11"

# ===== 16. 代码路径干净 =====
$dirty = @(git status --porcelain -- src scripts package.json 2>$null)
if ($dirty.Count -eq 0) { Add-Result "git-clean-code" "Pass" "dirty=0" } else { Add-Result "git-clean-code" "Fail" "dirty=$($dirty.Count)" }

# ===== 17. 证据目录 =====
if (Test-Path $EvidenceDir) { Add-Result "evidence-dir" "Pass" $EvidenceDir } else { Add-Result "evidence-dir" "Fail" $EvidenceDir }

# ===== 18. S7 专属：Agent 模块存在 =====
foreach ($m in @("machine.ts", "tools.ts", "prompt.ts")) {
  $mp = Join-Path ".\src\agent" $m
  if (Test-Path $mp) { Add-Result "agent-module:$m" "Pass" $mp } else { Add-Result "agent-module:$m" "Fail" "缺 $mp" }
}

# ===== 19. S7 专属：Agent 无网络调用 =====
$netHits = 0
$agentFiles = @(Get-ChildItem ".\src\agent" -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in @(".ts", ".tsx") })
if ($agentFiles.Count -gt 0) {
  $netHits = @(Select-String -Path $agentFiles.FullName -Pattern @("fetch(", "XMLHttpRequest", "WebSocket") -SimpleMatch -ErrorAction SilentlyContinue).Count
}
if ($netHits -eq 0) { Add-Result "agent-offline" "Pass" "fetch/XMLHttpRequest/WebSocket=0" } else { Add-Result "agent-offline" "Fail" "hits=$netHits" }

# ===== 20. S7 专属：三态矩阵 9 格 =====
$matrixPath = ".\evidence\step-7\tri-state-matrix.csv"
$matrixRows = @()
if (Test-Path $matrixPath) { $matrixRows = @(Import-Csv $matrixPath -Encoding UTF8) }
$stateCount = 0
$okC = 0
$lcC = 0
$invC = 0
foreach ($r in $matrixRows) {
  $st = ([string]$r.state).Trim().ToLower()
  if (@("ok", "low_confidence", "invalid") -contains $st) { $stateCount++ }
  if ($st -eq "ok") { $okC++ }
  if ($st -eq "low_confidence") { $lcC++ }
  if ($st -eq "invalid") { $invC++ }
}
if (($matrixRows.Count -eq 9) -and ($stateCount -eq 9) -and ($okC -eq 3) -and ($lcC -eq 3) -and ($invC -eq 3)) {
  Add-Result "tri-state-9" "Pass" "9 格，3×3"
} else {
  Add-Result "tri-state-9" "Fail" "rows=$($matrixRows.Count) ok=$okC lc=$lcC invalid=$invC"
}

# ===== 21. S7 专属：20 条夹具 =====
$fixPath = ".\evidence\step-7\fixtures-20.json"
$fixCount = 0
if (Test-Path $fixPath) {
  try {
    $fx = Get-Content $fixPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $fixCount = @($fx).Count
  } catch { $fixCount = 0 }
}
if ($fixCount -eq 20) { Add-Result "fixtures-20" "Pass" "20/20" } else { Add-Result "fixtures-20" "Fail" "$fixCount/20" }

# ===== 22. S7 专属：低置信输出禁止词 =====
$lcPath = ".\evidence\step-7\low-confidence-output.txt"
$forbiddenWords = @("正常", "%", "排名", "百分比", "概率")
$badWordHits = 0
if (Test-Path $lcPath) {
  foreach ($w in $forbiddenWords) {
    $badWordHits += @(Select-String -Path $lcPath -Pattern $w -SimpleMatch -AllMatches -ErrorAction SilentlyContinue).Count
  }
}
if (($badWordHits -eq 0) -and (Test-Path $lcPath)) {
  Add-Result "low-confidence-clean" "Pass" "禁止词=0"
} else {
  Add-Result "low-confidence-clean" "Fail" "hits=$badWordHits"
}

# ===== 23. S7 专属：GT15–19 / GT22–23 证据 =====
$gtList = @("GT15", "GT16", "GT17", "GT18", "GT19", "GT22", "GT23")
$gtOkCount = 0
foreach ($gt in $gtList) {
  $gtPath = ".\evidence\step-7\gt\$gt.json"
  $gtOk = $false
  if (Test-Path $gtPath) {
    try {
      $gj = Get-Content $gtPath -Raw -Encoding UTF8 | ConvertFrom-Json
      $gtOk = ($null -ne $gj.gt) -and ($null -ne $gj.result)
    } catch { $gtOk = $false }
  }
  if ($gtOk) { $gtOkCount++ } else { Add-Result "gt:$gt" "Fail" "缺 $gtPath 或字段 gt/result" }
}
if ($gtOkCount -eq 7) { Add-Result "gt-7" "Pass" "7/7" } else { Add-Result "gt-7" "Fail" "$gtOkCount/7" }

# ===== 24. S7 专属：AC-08/09/10 证据 =====
foreach ($ac in @("AC-08", "AC-09", "AC-10")) {
  $acPath = ".\evidence\step-7\$ac.png"
  if (Test-Path $acPath) { Add-Result "evidence:$ac" "Pass" $acPath } else { Add-Result "evidence:$ac" "Fail" "缺 $acPath" }
}

# ===== 汇总 =====
$results | ForEach-Object { [pscustomobject]$_ } | ConvertTo-Json -Depth 3 | Set-Content -Path (Join-Path $EvidenceDir "verify.json") -Encoding UTF8
$failed = @($results | Where-Object { $_.Status -eq "Fail" })
if ($failed.Count -eq 0) {
  Write-Host "`n===== VERDICT: PASS（自动项无 Fail；N/A 不计为通过，人工项另判）=====" -ForegroundColor Green
} else {
  Write-Host "`n===== VERDICT: FAIL ($($failed.Count)) =====" -ForegroundColor Red
  $failed | ForEach-Object { Write-Host ("- " + $_.Check + " :: " + $_.Detail) -ForegroundColor Red }
  exit 1
}
```

### 4.1 本步显式 N/A 项（不得写成 pass）

| 检查 | 结论 | 原因 |
|---|---|---|
| `npm ci` | N/A | 依赖已在 S1 验证；本步不重装 |
| UI 字符串 | N/A | S7 无新增文案门禁；AC-10 用专项文本扫描 |
| 样本 | N/A | 样本验收在 S10 |
| 评审 12/15/16 | N/A | 评审回填在 S11 |

---

## 5. 通过条件（逐条为真/假）

| # | 条件 | 阈值 | 结果 | 实际值 | 证据 |
|---|---|---|---|---|---|
| 1 | `npm run typecheck` | 0 错误 | 真／假 | | `verify.log` |
| 2 | `npm test` | ≥66 pass，0 fail | 真／假 | | `verify.log` |
| 3 | `npm run build` | `dist/index.html` 存在 | 真／假 | | `verify.log` |
| 4 | `npm run apk` | 退出码 0 | 真／假 | | `verify.log` |
| 5 | `check-apk` | `ok:true`，`brokenRefs:[]` | 真／假 | | `check-apk.json` |
| 6 | 版本 | vc6 / 2.0.0 | 真／假 | | `check-apk.json` |
| 7 | 证书 | 与 S0 一致 | 真／假 | | `cert-sha256.txt` |
| 8 | APK 体积 | 300–900 KB（继承基线） | 真／假 | | `apk-size.txt` |
| 9 | `postgres.wasm` | 0 | 真／假 | | `apk-entries.txt` |
| 10 | Agent 模块 | `machine.ts` / `tools.ts` / `prompt.ts` 3/3 | 真／假 | | `src/agent/` |
| 11 | 离线 | fetch / XHR / WebSocket 0 | 真／假 | | `verify.json` |
| 12 | 三态矩阵 | 9 格，3×3 | 真／假 | | `tri-state-matrix.csv` |
| 13 | 20 条夹具 | 20/20 | 真／假 | | `fixtures-20.json` |
| 14 | 低置信禁止词 | 「正常」/%/排名/百分比/概率 = 0 | 真／假 | | `low-confidence-output.txt` |
| 15 | GT15–19 / GT22–23 | 7/7 | 真／假 | | `evidence/step-7/gt/` |
| 16 | AC-08/09/10 截图 | 3/3 | 真／假 | | `AC-*.png` |
| 17 | UI 字符串 | N/A | N/A | | 本卡 §4.1 |
| 18 | 样本 | N/A | N/A | | 本卡 §4.1 |
| 19 | 评审 | N/A | N/A | | 本卡 §4.1 |
| 20 | 代码路径干净 | 为空 | 真／假 | | `verify.json` |

---

## 6. 人工验收

| # | 编号 | 操作 | 期望 | 实测 | 结论 | 截图/日志 |
|---|---|---|---|---|---|---|
| 1 | `GT15` | 空/超长/乱码输入 | 拒答或模板；不编造 | 待填 | 真／假 | `gt/GT15.json` |
| 2 | `GT16` | 工具抛错 | 明确失败；不猜测结果 | 待填 | 真／假 | `gt/GT16.json` |
| 3 | `GT17` | 低置信输入 | `low_confidence`；无排名/百分比 | 待填 | 真／假 | `gt/GT17.json` |
| 4 | `GT18` | 引用不存在的案例 | 拒绝；不伪造引用 | 待填 | 真／假 | `gt/GT18.json` |
| 5 | `GT19` | 冲突证据 | 标冲突；不合并成结论 | 待填 | 真／假 | `gt/GT19.json` |
| 6 | `GT22` | 一次会话 6 轮 | 状态保持；不丢上下文 | 待填 | 真／假 | `gt/GT22.json` |
| 7 | `GT23` | 索取取证模板 | 只给模板；不伪造证据 | 待填 | 真／假 | `gt/GT23.json` |
| 8 | `AC-08` | 三态各截图 | 颜色 + 字形 + 文字三通道都在 | 待填 | 真／假 | `AC-08.png` |
| 9 | `AC-09` | `invalid` 时查 DOM | 机制条目数 = 0（不存在） | 待填 | 真／假 | `AC-09.png` |
| 10 | `AC-10` | 扫描 `low_confidence` 文本 | 无序号、无百分比、无「正常」 | 待填 | 真／假 | `AC-10.png` |
| 11 | `F03` | 打开结果页 | 1 条机制 + 1 条下一步 + 3 张证据卡 | 待填 | 真／假 | `F03.png` |
| 12 | `F04` | 无基线/未冻结时看趋势 | 趋势不可见；有明确说明 | 待填 | 真／假 | `F04.png` |
| 13 | `F08` | 导出交接包 | 6 段齐全；缺字段标 `unknown` | 待填 | 真／假 | `F08.json` |
| 14 | `F10` | 低置信结果页文本扫描 | 0 排名、0 百分比、0「正常」 | 待填 | 真／假 | `F10.txt` |

---

## 7. 证据留存位置

```text
evidence/step-7/
├─ 验收卡.md
├─ tri-state-matrix.csv    # 9 格
├─ fixtures-20.json
├─ low-confidence-output.txt
├─ AC-08.png、AC-09.png、AC-10.png
├─ F03.png、F04.png、F08.json、F10.txt
├─ gt/GT15.json … GT23.json（7 份）
├─ check-apk.json
├─ apk-sha256.txt
├─ cert-sha256.txt
├─ apk-size.txt
├─ ui-strings.txt          # 本步写 N/A 说明
├─ verify.log
├─ verify.json
└─ signoff.md
```

---

## 8. 禁止事项（命中任一 = 不通过）

- 禁止 LLM 决定三态；三态必须由规则/证据决定。
- 禁止低置信输出出现排名、百分比、「正常」。
- 禁止 `invalid` 仍渲染机制条目。
- 禁止 Agent 调外网或在线模型。
- 禁止伪造案例引用或证据。
- 禁止删除测试、改断言换绿；测试数只能增。
- 禁止把 `not_run` / `na` 写成 `pass`。
- 禁止 GT31–39 写 `pass`；GT40–41 只能 `not_run`。
- 禁止伪造评审、手填 release-card、改 tag 后重建、恢复授权门。

---

## 9. 失败与回退

| 情形 | 判定 | 回退动作 |
|---|---|---|
| 三态矩阵缺格 | 本步不通过 | 回退 S6；补 3×3 后重跑 |
| 低置信出现百分比/排名 | 本步不通过 | 改文案与模板；重扫 |
| `invalid` 有机制条目 | 本步不通过 | 修渲染分支，重跑 AC-09 |
| Agent 有网络调用 | 本步不通过 | 删网络代码；重跑 |
| 测试少于 66 | 本步不通过 | 补三态/拒答测试，不得删旧测试 |
| 包体超 900 KB | 本步不通过 | 查依赖与资源 |

```powershell
git status --porcelain
git stash push -m "S7-wip"
git checkout step-6
# 修复后：
git stash pop
```

---

## 10. 签署与结论

| 角色 | 姓名 | 结论 | 签字/日期 |
|---|---|---|---|
| 执行人（自检） | 执行人（自检） | 通过／有条件通过／不通过 | |
| 技术负责人 | 技术负责人 | 通过／有条件通过／不通过 | |
| 质量 | 质量 | 通过／有条件通过／不通过 | |
| 产品 | 产品 | 通过／有条件通过／不通过 | |

**最终结论**：通过／有条件通过／不通过

**一句话理由**：用数字说明，例如「66/66、三态 9/9、夹具 20/20、GT15–19/22–23 7/7、AC-08/09/10 全过、禁止词 0、APK 436 KB」。

---

## 11. 遗留问题（只写真实未闭环项）

| # | 问题 | 影响编号 | 严重度 | 责任人与期限 | 是否已进 release-card.waivers |
|---|---|---|---|---|---|
| 1 | 6 轮上下文保持只在夹具验证，长会话未压测 | GT22 | 中 | 技术负责人／S10 前 | 否 |
| 2 | 交接包 6 段的缺字段 `unknown` 策略未在真实工单验证 | F08 | 中 | 产品／S8 前 | 否 |
| 3 | 三态色在深色模式下的对比度需复测 | AC-08 | 中 | 产品／S12 前 | 否 |
| 4 | 真实样本为 0 | GT06–14、GT28–30、GT42–43、GT45、F01–F12 | 高 | 质量／S10 前 | 是（planned not_run） |
| 5 | 评审 12/15/16 缺失 | G5 | 高 | 质量／S11 前 | 否 |
