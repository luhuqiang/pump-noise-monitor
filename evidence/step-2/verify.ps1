# ===== S2 自动验收（PowerShell 5）=====
$ErrorActionPreference = "Continue"

# ===== 本步参数 =====
$Step                = "S2"
$Apk                 = ".\听诊仪.apk"
$ExpectVC            = 6
$ExpectVN            = "2.0.0"
$MinTests            = 30
$MinKB               = 200
$MaxKB               = 500
$RequiredStrings     = @("开始听诊", "长按结束", "引导", "设置", "波形", "频谱", "阶次", "趋势", "事件轨", "质量")
$ForbiddenEntries    = @("postgres.wasm")
$RequiredEntries     = @("AndroidManifest.xml", "classes.dex", "assets/www/index.html")
$MinSamples          = 0              # N/A：样本在 S10
$RequireReviews      = @()            # N/A：评审在 S11
$RequireBaselineCert = $true
$SkipPgliteCheck     = $true          # N/A：PGlite 移除属 S3
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

# ===== 11. dist JS 字符串 =====
$jsFiles = @(Get-ChildItem ".\dist\assets\*.js" -File -ErrorAction SilentlyContinue)
$stringLines = @()
foreach ($s in $RequiredStrings) {
  $hits = 0
  # 等价修正：卡面原写法 -SimpleMatch 在本机 PS 5.1.26100 下 MatchInfo.Matches 恒为空
  # （最小复现：SimpleMatch 无论是否 -AllMatches，Matches.Count=0；正则+AllMatches 正常）。
  # 改用 [regex]::Escape 字面转义后走正则引擎，匹配语义与 SimpleMatch 完全等价，Matches 计数正常。
  $pat = [regex]::Escape($s)
  foreach ($f in $jsFiles) {
    $ms = @(Select-String -Path $f.FullName -Pattern $pat -AllMatches -ErrorAction SilentlyContinue)
    foreach ($m in $ms) { $hits += @($m.Matches).Count }
  }
  $stringLines += "$s=$hits"
  if ($hits -ge 1) { Add-Result "string:$s" "Pass" "hits=$hits" } else { Add-Result "string:$s" "Fail" "hits=0" }
}
$stringLines | Set-Content -Path (Join-Path $EvidenceDir "ui-strings.txt") -Encoding UTF8

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

# ===== 13. PGlite（N/A） =====
Add-Result "no-pglite" "N/A" "S2 不换数据层；PGlite 移除属 S3"

# ===== 14. 样本（N/A） =====
Add-Result "samples" "N/A" "样本验收在 S10"

# ===== 15. 评审（N/A） =====
Add-Result "reviews" "N/A" "评审 12/15/16 在 S11"

# ===== 16. 代码路径干净 =====
$dirty = @(git status --porcelain -- src scripts package.json 2>$null)
if ($dirty.Count -eq 0) { Add-Result "git-clean-code" "Pass" "dirty=0" } else { Add-Result "git-clean-code" "Fail" "dirty=$($dirty.Count)" }

# ===== 17. 证据目录 =====
if (Test-Path $EvidenceDir) { Add-Result "evidence-dir" "Pass" $EvidenceDir } else { Add-Result "evidence-dir" "Fail" $EvidenceDir }

# ===== 18. S2 专属：6 个模块组件 =====
$expectedModules = @("WaveModule.tsx", "SpectrumModule.tsx", "OrderModule.tsx", "TrendModule.tsx", "EventRailModule.tsx", "QualityModule.tsx")
$modFiles = 0
foreach ($m in $expectedModules) {
  if (Test-Path (Join-Path ".\src\components\modules" $m)) { $modFiles++ }
}
if ($modFiles -eq 6) { Add-Result "modules-6-files" "Pass" "6/6" } else { Add-Result "modules-6-files" "Fail" "$modFiles/6" }

# ===== 19. S2 专属：模块显示上限 3 =====
$panelPath = ".\src\components\InstrumentPanel.tsx"
$capLine = ""
if (Test-Path $panelPath) {
  $capMatch = Select-String -Path $panelPath -Pattern "MAX_MODULES" -SimpleMatch | Select-Object -First 1
  if ($capMatch) { $capLine = $capMatch.Line }
}
if (($capLine.Length -gt 0) -and ($capLine -match "3")) {
  Add-Result "max-modules-3" "Pass" $capLine.Trim()
} else {
  Add-Result "max-modules-3" "Fail" "未在 InstrumentPanel.tsx 读到 MAX_MODULES = 3"
}

# ===== 20. S2 专属：长按 800ms 源码线索 =====
$compFiles = @(Get-ChildItem ".\src\components" -Filter *.tsx -File -ErrorAction SilentlyContinue)
$longPressHits = 0
if ($compFiles.Count -gt 0) {
  $longPressHits = @(Select-String -Path $compFiles.FullName -Pattern "800" -SimpleMatch -ErrorAction SilentlyContinue).Count
}
if ($longPressHits -ge 1) { Add-Result "long-press-800" "Pass" "source hits=$longPressHits；行为由 AC-16 人工判定" } else { Add-Result "long-press-800" "Fail" "源码未命中 800" }

# ===== 21. S2 专属：P0–P8 截图 9 张 =====
$shotDir = ".\evidence\step-2\screenshots"
$shotCount = 0
if (Test-Path $shotDir) {
  for ($i = 0; $i -le 8; $i++) {
    if (Test-Path (Join-Path $shotDir ("P" + $i + ".png"))) { $shotCount++ }
  }
}
if ($shotCount -eq 9) { Add-Result "screenshots-P0-P8" "Pass" "9/9" } else { Add-Result "screenshots-P0-P8" "Fail" "$shotCount/9" }

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
