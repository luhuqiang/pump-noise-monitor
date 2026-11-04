# S10 样本与全量 GT · 分步验收卡

> 依据：`推进计划.md` §5 S10；06 §12、§10.4；03 T14；`步骤验收卡-模板.md`。
> 本卡只执行已有编号：`GT01`–`GT45`、`F01`–`F12`。样本必须为现场采集，禁止合成替代。

---

## 1. 步骤信息

| 字段 | 填写 |
|---|---|
| 步骤编号 | `S10` |
| 步骤名称 | 样本采集与全量 GT/F 执行 |
| 对应编号 | 全模块（06 `M00`–`M11`）；`GT01`–`GT45`；`F01`–`F12`；`C31`（样本 ≥300 段） |
| 计划人日 | 10–15（含现场采集） |
| 版本 | `versionCode=6`、`versionName=2.0.0` |
| 证据目录 | `evidence/step-10/` |
| 执行人 | 执行人（自检） |
| 执行日期 | 执行当日填写 |
| 构建产物 | `听诊仪.apk`，SHA-256 见 `apk-sha256.txt` |

---

## 2. 前置条件（任一为否，停止）

| # | 前置 | 判定命令/文件 | 判定结果 |
|---|---|---|---|
| 1 | S9 已放行 | `evidence/step-9/signoff.md` 结论=通过 | 是／否 |
| 2 | 现场设备与测点可进入 | 具备 3 类故障泵 + 正常泵，且可复测 | 是／否 |
| 3 | 采样表 14 字段已冻结 | `evidence/step-0/sample-request.md` 14/14 | 是／否 |
| 4 | 工作区代码干净 | `git status --porcelain -- src scripts package.json` 为空 | 是／否 |
| 5 | 证书基线可读 | `Test-Path .\evidence\step-0\cert-sha256.txt` | 是／否 |
| 6 | 现场安全许可 | 停机/挂牌/测点许可已签 | 是／否 |
| 7 | 评审 | 本步不涉及，填 `N/A`（评审在 S11） | N/A |

---

## 3. 产出物清单

| # | 产出 | 实际路径 | 状态 |
|---|---|---|---|
| 1 | 现场样本 ≥300 段 | `samples/` 原始音频 | 待采集 |
| 2 | 样本索引 | `samples/index.csv` | 待生成 |
| 3 | 全量 GT 结果 | `evidence/step-10/gt-results.csv` | 待生成 |
| 4 | 全量 F 结果 | `evidence/step-10/f-results.csv` | 待生成 |
| 5 | GT45 覆盖记录 | `evidence/step-10/gt45-coverage.md` | 待生成 |
| 6 | 现场签署 | `evidence/step-10/signoff.md` | 待创建 |
| 7 | 签名 APK | `听诊仪.apk` | 待生成 |

### 3.1 `samples/index.csv` 固定 14 字段

`sample_id`、`asset_id`、`point_id`、`sensor_position`、`rpm`、`load_pct`、`background_dba`、`distance_m`、`temperature_c`、`device_model`、`sample_rate`、`recorded_at`、`fault_label`、`label_reviewer`。

附加列：`source`（只允许 `field` / `field_retest`；禁止 `synthetic` / `合成`）。

### 3.2 样本配额

| 类别 | 最少 |
|---|---|
| 汽蚀 | 100 |
| 堵塞 | 100 |
| 不平衡松动 | 100 |
| 正常 | 30 |
| 合计 | ≥300 |

### 3.3 GT / F 结果口径

- `gt-results.csv`：45 行；`status` ∈ `pass` / `na` / `not_run` / `fail`；`pass=34`、`na=9`、`not_run=2`、`fail=0`。
- `GT31`–`GT39` 必须 `na`；`GT40`–`GT41` 必须 `not_run` 且有 waiver；`GT45` 必须有行。
- `f-results.csv`：12 行；`F01`–`F12` 均有行；`status=pass` 或 `waived`；`fail=0`。

---

## 4. 自动验收命令块（PowerShell 5，复制即跑）

```powershell
# ===== S10 自动验收（PowerShell 5）=====
$ErrorActionPreference = "Continue"

# ===== 本步参数 =====
$Step                = "S10"
$Apk                 = ".\听诊仪.apk"
$ExpectVC            = 6
$ExpectVN            = "2.0.0"
$MinTests            = 70
$MinKB               = 300            # 继承 S5–S9 包体基线；S10 未单列新阈值
$MaxKB               = 900
$RequiredStrings     = @()            # N/A：S10 无新增 UI 字符串门禁
$ForbiddenEntries    = @("postgres.wasm", ".gguf")
$RequiredEntries     = @("AndroidManifest.xml", "classes.dex", "assets/www/index.html")
$MinSamples          = 300
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
"N/A: S10 无新增 UI 字符串门禁" | Set-Content -Path (Join-Path $EvidenceDir "ui-strings.txt") -Encoding UTF8
Add-Result "ui-strings" "N/A" "S10 无新增 UI 字符串门禁"

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

# ===== 14. 评审（N/A） =====
Add-Result "reviews" "N/A" "评审 12/15/16 在 S11"

# ===== 15. 代码路径干净 =====
$dirty = @(git status --porcelain -- src scripts package.json 2>$null)
if ($dirty.Count -eq 0) { Add-Result "git-clean-code" "Pass" "dirty=0" } else { Add-Result "git-clean-code" "Fail" "dirty=$($dirty.Count)" }

# ===== 16. 证据目录 =====
if (Test-Path $EvidenceDir) { Add-Result "evidence-dir" "Pass" $EvidenceDir } else { Add-Result "evidence-dir" "Fail" $EvidenceDir }

# ===== 17. S10 专属：样本 ≥300 =====
$samplePath = ".\samples\index.csv"
$sampleRows = @()
if (Test-Path $samplePath) { $sampleRows = @(Import-Csv $samplePath -Encoding UTF8) }
$sampleCount = $sampleRows.Count
if ($sampleCount -ge $MinSamples) { Add-Result "samples-count" "Pass" "$sampleCount 段" } else { Add-Result "samples-count" "Fail" "$sampleCount 段 (need >=$MinSamples)" }

# ===== 18. S10 专属：14 字段全非空 =====
$metaFields = @("sample_id", "asset_id", "point_id", "sensor_position", "rpm", "load_pct", "background_dba", "distance_m", "temperature_c", "device_model", "sample_rate", "recorded_at", "fault_label", "label_reviewer")
$header = @()
if ($sampleCount -gt 0) { $header = @($sampleRows[0].PSObject.Properties.Name) }
$headerMissing = 0
foreach ($f in $metaFields) { if ($header -notcontains $f) { $headerMissing++ } }
$emptyCells = 0
foreach ($r in $sampleRows) {
  foreach ($f in $metaFields) {
    if ([string]::IsNullOrWhiteSpace([string]$r.$f)) { $emptyCells++ }
  }
}
if (($headerMissing -eq 0) -and ($emptyCells -eq 0)) {
  Add-Result "samples-14-fields" "Pass" "14/14 非空"
} else {
  Add-Result "samples-14-fields" "Fail" "headerMissing=$headerMissing emptyCells=$emptyCells"
}

# ===== 19. S10 专属：3 类 ×100 + 正常 30 =====
$cav = @($sampleRows | Where-Object { [string]$_.fault_label -eq "汽蚀" }).Count
$blk = @($sampleRows | Where-Object { [string]$_.fault_label -eq "堵塞" }).Count
$mis = @($sampleRows | Where-Object { [string]$_.fault_label -eq "不平衡松动" }).Count
$nor = @($sampleRows | Where-Object { [string]$_.fault_label -eq "正常" }).Count
if (($cav -ge 100) -and ($blk -ge 100) -and ($mis -ge 100) -and ($nor -ge 30)) {
  Add-Result "samples-quota" "Pass" "汽蚀=$cav 堵塞=$blk 松动=$mis 正常=$nor"
} else {
  Add-Result "samples-quota" "Fail" "汽蚀=$cav 堵塞=$blk 松动=$mis 正常=$nor"
}

# ===== 20. S10 专属：无合成替代 =====
$synth = @($sampleRows | Where-Object { ([string]$_.source).ToLower() -eq "synthetic" -or [string]$_.source -eq "合成" }).Count
if (($sampleCount -gt 0) -and ($synth -eq 0)) {
  Add-Result "samples-field-only" "Pass" "synthetic=0"
} else {
  Add-Result "samples-field-only" "Fail" "synthetic=$synth"
}

# ===== 21. S10 专属：GT 45 行与 34+9+2 =====
$gtPath = ".\evidence\step-10\gt-results.csv"
$gtRows = @()
if (Test-Path $gtPath) { $gtRows = @(Import-Csv $gtPath -Encoding UTF8) }
$gtPass = @($gtRows | Where-Object { ([string]$_.status).ToLower() -eq "pass" }).Count
$gtNa = @($gtRows | Where-Object { ([string]$_.status).ToLower() -eq "na" }).Count
$gtNr = @($gtRows | Where-Object { ([string]$_.status).ToLower() -eq "not_run" }).Count
$gtFail = @($gtRows | Where-Object { ([string]$_.status).ToLower() -eq "fail" }).Count
$gtIds = @()
for ($i = 1; $i -le 45; $i++) { $gtIds += "GT" + $i.ToString("00") }
$gtMissing = 0
foreach ($id in $gtIds) {
  if (@($gtRows | Where-Object { [string]$_.gt -eq $id }).Count -lt 1) { $gtMissing++ }
}
if (($gtRows.Count -eq 45) -and ($gtMissing -eq 0) -and ($gtPass -eq 34) -and ($gtNa -eq 9) -and ($gtNr -eq 2) -and ($gtFail -eq 0)) {
  Add-Result "gt45" "Pass" "45 行；pass=34 na=9 not_run=2 fail=0"
} else {
  Add-Result "gt45" "Fail" "rows=$($gtRows.Count) missing=$gtMissing pass=$gtPass na=$gtNa not_run=$gtNr fail=$gtFail"
}

# ===== 22. S10 专属：GT31–39 全 na =====
$gtNaWrong = 0
for ($i = 31; $i -le 39; $i++) {
  $id = "GT" + $i.ToString()
  $row = @($gtRows | Where-Object { [string]$_.gt -eq $id })
  if (($row.Count -ne 1) -or (([string]$row[0].status).ToLower() -ne "na")) { $gtNaWrong++ }
}
if ($gtNaWrong -eq 0) { Add-Result "gt31-39-na" "Pass" "9/9 na" } else { Add-Result "gt31-39-na" "Fail" "wrong=$gtNaWrong" }

# ===== 23. S10 专属：GT40–41 not_run 且有 waiver =====
$gtNrWrong = 0
foreach ($id in @("GT40", "GT41")) {
  $row = @($gtRows | Where-Object { [string]$_.gt -eq $id })
  $ok = ($row.Count -eq 1) -and (([string]$row[0].status).ToLower() -eq "not_run") -and (-not [string]::IsNullOrWhiteSpace([string]$row[0].waiver))
  if (-not $ok) { $gtNrWrong++ }
}
if ($gtNrWrong -eq 0) { Add-Result "gt40-41-not-run" "Pass" "2/2 not_run + waiver" } else { Add-Result "gt40-41-not-run" "Fail" "wrong=$gtNrWrong" }

# ===== 24. S10 专属：GT45 行存在 =====
$gt45 = @($gtRows | Where-Object { [string]$_.gt -eq "GT45" })
if ($gt45.Count -eq 1) { Add-Result "gt45-row" "Pass" "GT45 存在，status=$($gt45[0].status)" } else { Add-Result "gt45-row" "Fail" "GT45 行缺失或重复" }

# ===== 25. S10 专属：F 12 行、无 fail =====
$fPath = ".\evidence\step-10\f-results.csv"
$fRows = @()
if (Test-Path $fPath) { $fRows = @(Import-Csv $fPath -Encoding UTF8) }
$fIds = @()
for ($i = 1; $i -le 12; $i++) { $fIds += "F" + $i.ToString("00") }
$fMissing = 0
foreach ($id in $fIds) {
  if (@($fRows | Where-Object { [string]$_.f -eq $id }).Count -lt 1) { $fMissing++ }
}
$fBad = @($fRows | Where-Object { $st = ([string]$_.status).ToLower(); ($st -ne "pass") -and ($st -ne "waived") }).Count
if (($fRows.Count -eq 12) -and ($fMissing -eq 0) -and ($fBad -eq 0)) {
  Add-Result "f12" "Pass" "12/12 非 fail"
} else {
  Add-Result "f12" "Fail" "rows=$($fRows.Count) missing=$fMissing bad=$fBad"
}

# ===== 26. S10 专属：GT45 覆盖记录 =====
$covPath = ".\evidence\step-10\gt45-coverage.md"
$covOk = $false
if (Test-Path $covPath) {
  $ct = Get-Content $covPath -Raw -Encoding UTF8
  $covOk = ($ct -match "GT45") -and ($ct -match "before") -and ($ct -match "after")
}
if ($covOk) { Add-Result "gt45-coverage" "Pass" $covPath } else { Add-Result "gt45-coverage" "Fail" "缺 gt45-coverage.md 或 before/after" }

# ===== 27. S10 专属：现场签署 =====
$soPath = ".\evidence\step-10\signoff.md"
if (Test-Path $soPath) { Add-Result "signoff" "Pass" $soPath } else { Add-Result "signoff" "Fail" "缺 signoff.md" }

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
| UI 字符串 | N/A | S10 无新增界面文案 |
| 评审 12/15/16 | N/A | 评审回填在 S11 |

---

## 5. 通过条件（逐条为真/假）

| # | 条件 | 阈值 | 结果 | 实际值 | 证据 |
|---|---|---|---|---|---|
| 1 | `npm run typecheck` | 0 错误 | 真／假 | | `verify.log` |
| 2 | `npm test` | ≥70 pass，0 fail | 真／假 | | `verify.log` |
| 3 | `npm run build` | `dist/index.html` 存在 | 真／假 | | `verify.log` |
| 4 | `npm run apk` | 退出码 0 | 真／假 | | `verify.log` |
| 5 | `check-apk` | `ok:true`，`brokenRefs:[]` | 真／假 | | `check-apk.json` |
| 6 | 版本 | vc6 / 2.0.0 | 真／假 | | `check-apk.json` |
| 7 | 证书 | 与 S0 一致 | 真／假 | | `cert-sha256.txt` |
| 8 | APK 体积 | 300–900 KB（继承基线） | 真／假 | | `apk-size.txt` |
| 9 | `postgres.wasm` / `.gguf` | 0 | 真／假 | | `apk-entries.txt` |
| 10 | 样本总数 | ≥300 | 真／假 | | `samples/index.csv` |
| 11 | 14 字段 | 表头 14/14，空值 0 | 真／假 | | `samples/index.csv` |
| 12 | 3 类 ×100 + 正常 30 | 达标 | 真／假 | | `samples/index.csv` |
| 13 | 无合成替代 | `synthetic` / `合成` = 0 | 真／假 | | `samples/index.csv` |
| 14 | GT 总行数 | 45 | 真／假 | | `gt-results.csv` |
| 15 | GT 分布 | 34 pass + 9 na + 2 not_run + 0 fail | 真／假 | | `gt-results.csv` |
| 16 | GT31–39 | 9/9 `na` | 真／假 | | `gt-results.csv` |
| 17 | GT40–41 | 2/2 `not_run` + waiver | 真／假 | | `gt-results.csv` |
| 18 | GT45 | 行存在 | 真／假 | | `gt-results.csv` |
| 19 | F01–F12 | 12/12 非 fail | 真／假 | | `f-results.csv` |
| 20 | GT45 覆盖记录 | before/after 存在 | 真／假 | | `gt45-coverage.md` |
| 21 | 现场签署 | 1/1 | 真／假 | | `signoff.md` |
| 22 | 评审 | N/A | N/A | | 本卡 §4.1 |
| 23 | 代码路径干净 | 为空 | 真／假 | | `verify.json` |

---

## 6. 人工验收

| # | 编号 | 操作 | 期望 | 实测 | 结论 | 证据 |
|---|---|---|---|---|---|---|
| 1 | `GT01`–`GT05` | 逐条跑采样异常 | 5/5 `invalid`；不产阶次 | 待填 | 真／假 | `gt-results.csv` |
| 2 | `GT06`–`GT14` | 逐条跑基线与门控 | 9/9 符合；GT06 ≤0.3Hz；GT08 ≥17 转 | 待填 | 真／假 | `gt-results.csv` |
| 3 | `GT15`–`GT19` | 逐条跑 Agent | 5/5 拒答/失败/冲突处理正确 | 待填 | 真／假 | `gt-results.csv` |
| 4 | `GT20`–`GT24` | 逐条跑报告与主路径 | 5/5 符合 | 待填 | 真／假 | `gt-results.csv` |
| 5 | `GT25`–`GT27` | 逐条跑持久化/报告 | 3/3 符合 | 待填 | 真／假 | `gt-results.csv` |
| 6 | `GT28`–`GT30` | 逐条跑冻结与复测 | GT28 可发布；GT29 1.6dB 不可比；GT30 1.4dB 可比 | 待填 | 真／假 | `gt-results.csv` |
| 7 | `GT31`–`GT39` | 逐条核对范围 | 9/9 `na`，原因写明双麦未实装 | 待填 | N/A | `gt-results.csv` |
| 8 | `GT40`–`GT41` | 核对 waiver | 2/2 `not_run` 且有 waiver | 待填 | N/A | `gt-results.csv` |
| 9 | `GT42`–`GT43` | 片段到期与二次确认 | 2/2 符合 | 待填 | 真／假 | `gt-results.csv` |
| 10 | `GT44` | 旧 localStorage 迁移 | 100% 迁移；旧键未改 | 待填 | 真／假 | `gt-results.csv` |
| 11 | `GT45` | vc4 → v2.0.0 覆盖安装 | 基线/案例/报告保留 | 待填 | 真／假 | `gt45-coverage.md` |
| 12 | `F01`–`F03` | 建档、复测、结果解释 | 3/3 符合 | 待填 | 真／假 | `f-results.csv` |
| 13 | `F04`–`F06` | 趋势、交接、片段 | 3/3 符合 | 待填 | 真／假 | `f-results.csv` |
| 14 | `F07`–`F09` | 单麦、交接完整、44.1k 设备 | 3/3 符合 | 待填 | 真／假 | `f-results.csv` |
| 15 | `F10`–`F12` | 低置信、离线、单手 | 3/3 符合 | 待填 | 真／假 | `f-results.csv` |
| 16 | 样本抽检 | 随机抽 10 段回听并核对 14 字段 | 10/10 真实可回放；无合成 | 待填 | 真／假 | `sample-audit.csv` |

> 本表 `GT31`–`GT39` 只能 N/A；`GT40`–`GT41` 只能 not_run。F 项可用 `waived`，但必须写明理由；不得用 `pass` 掩盖未跑。

---

## 7. 证据留存位置

```text
evidence/step-10/
├─ 验收卡.md
├─ gt-results.csv          # 45 行；34+9+2+0
├─ f-results.csv           # 12 行
├─ gt45-coverage.md
├─ sample-audit.csv
├─ signoff.md
├─ samples-raw/            # 原始音频哈希清单（音频本体在 samples/）
├─ check-apk.json
├─ apk-sha256.txt
├─ cert-sha256.txt
├─ apk-size.txt
├─ ui-strings.txt          # 本步写 N/A 说明
├─ apk-entries.txt
├─ verify.log
└─ verify.json
```

---

## 8. 禁止事项（命中任一 = 不通过）

- 禁止合成音频、复制样本、预置种子冒充现场样本。
- 禁止把 `GT31`–`GT39` 写 `pass`。
- 禁止 `GT40`–`GT41` 无 waiver 就 `not_run`。
- 禁止把 `not_run` / `na` 写成 `pass`。
- 禁止凑数：同一录音切片充当多条样本。
- 禁止删除测试、改断言换绿；测试数只能增。
- 禁止伪造评审、手填 release-card、改 tag 后重建、恢复授权门。
- 禁止在线 LLM 或网络权限。
- 禁止把 `.gguf` 或 `postgres.wasm` 打进包。

---

## 9. 失败与回退

| 情形 | 判定 | 回退动作 |
|---|---|---|
| 样本少于 300 | 本步不通过 | 继续采集；不得合成补齐 |
| 某类少于 100 / 正常少于 30 | 本步不通过 | 补采；不得改配额 |
| GT 分布不等于 34+9+2 | 本步不通过 | 重跑缺项；不得改行数 |
| GT31–39 有 pass | 本步不通过 | 改 `na`，重生成 |
| F 有 fail | 本步不通过 | 修复后重跑；不得 waived 掩盖 |
| 发现样本合成 | 本步不通过 | 删除合成样本，重新采集 |
| 包体超 900 KB | 本步不通过 | 查资源与残留 |

```powershell
git status --porcelain
git stash push -m "S10-wip"
git checkout step-9
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
| 现场负责人 | 现场负责人 | 通过／有条件通过／不通过 | |

**最终结论**：通过／有条件通过／不通过

**一句话理由**：用数字说明，例如「样本 330 段（100/100/100/30）、GT45=34pass+9na+2not_run+0fail、F12 12/12、GT29 1.6 不可比、GT30 1.4 可比、APK 438 KB」。

---

## 11. 遗留问题（只写真实未闭环项）

| # | 问题 | 影响编号 | 严重度 | 责任人与期限 | 是否已进 release-card.waivers |
|---|---|---|---|---|---|
| 1 | 双麦 9 条仅 `na`，未执行 | GT31–GT39 | 高 | 产品／v2.1 | 是（na 记录） |
| 2 | 双麦 2 条 `not_run`，无真实双麦样本 | GT40–GT41 | 高 | 产品／v2.1 | 是 |
| 3 | vc4 基线包若仍未取得，GT45 覆盖只能单侧 | GT45 | 高 | 发布负责人／S12 前 | 是（GT45 风险） |
| 4 | 样本标注复核只有单人，未做双人一致性 | F01–F12 | 高 | 质量／S12 前 | 否 |
| 5 | 评审 12/15/16 缺失 | G5 | 高 | 质量／S11 前 | 否 |
