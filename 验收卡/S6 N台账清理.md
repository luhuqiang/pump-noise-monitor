# S6 N台账清理 · 分步验收卡

> 依据：`推进计划.md` §5 S6、D-02；05 §3 `N01`–`N10`；`步骤验收卡-模板.md`。
> 本卡只清理旧债，不重写已工作的音频链；不新增验收标准。

---

## 1. 步骤信息

| 字段 | 填写 |
|---|---|
| 步骤编号 | `S6` |
| 步骤名称 | N01–N10 分批清理 |
| 对应编号 | 05 `N01`–`N10`、`R01`–`R23`（仅清理）；`D-02` |
| 计划人日 | 6–8 |
| 版本 | `versionCode=6`、`versionName=2.0.0` |
| 证据目录 | `evidence/step-6/` |
| 执行人 | 执行人（自检） |
| 执行日期 | 执行当日填写 |
| 构建产物 | `听诊仪.apk`，SHA-256 见 `apk-sha256.txt` |

---

## 2. 前置条件（任一为否，停止）

| # | 前置 | 判定命令/文件 | 判定结果 |
|---|---|---|---|
| 1 | S5 已放行 | `evidence/step-5/signoff.md` 结论=通过 | 是／否 |
| 2 | 最小闭环稳定 | P0–P8、报告 manifest、16 store 均有证据 | 是／否 |
| 3 | 05 冻结的 N 表可读 | `stethoscope-delivery/听诊仪-交付包/docs/05_现有资产迁移与落地代价.md` 第 82 行起 | 是／否 |
| 4 | 工作区代码干净 | `git status --porcelain -- src scripts package.json` 为空 | 是／否 |
| 5 | 证书基线可读 | `Test-Path .\evidence\step-0\cert-sha256.txt` | 是／否 |
| 6 | 对照基线已留档 | `evidence/step-5/check-apk.json` 与 `apk-sha256.txt` | 是／否 |
| 7 | 样本与评审 | 本步不涉及，填 `N/A`（S10 / S11 处理） | N/A |

---

## 3. 产出物清单

| # | 产出 | 实际路径 | 状态 |
|---|---|---|---|
| 1 | N 台账 10 行 | `evidence/step-6/n-ledger.csv` | 待创建 |
| 2 | 对应代码/文档改动 | `src/`、`docs/` 按 N 项处置 | 待修改 |
| 3 | 测试增量 | `src/**/*.test.ts` | 待创建 |
| 4 | 清理前后对照 | `evidence/step-6/before-after.md` | 待创建 |
| 5 | 签名 APK | `听诊仪.apk` | 待生成 |

### 3.1 `n-ledger.csv` 固定列

`id,current,action,verify,conclusion,status,owner,due`

- `id` 必须覆盖 `N01`–`N10`，共 10 行。
- `status` 取值 `closed` / `kept` / `deferred`；**禁止 `open`**。
- `conclusion` 必须非空；`closed` ≥6 条。

### 3.2 10 项固定名称

| id | 名称 |
|---|---|
| `N01` | 首屏与信息架构 |
| `N02` | 会话流程 |
| `N03` | 持久化 |
| `N04` | 案例/资产/测点模型 |
| `N05` | 报告 2.0 |
| `N06` | 交接包 |
| `N07` | Agent 层 |
| `N08` | 发布与可观测 |
| `N09` | 构建链 |
| `N10` | 在线监护 UI |

---

## 4. 自动验收命令块（PowerShell 5，复制即跑）

```powershell
# ===== S6 自动验收（PowerShell 5）=====
$ErrorActionPreference = "Continue"

# ===== 本步参数 =====
$Step                = "S6"
$Apk                 = ".\听诊仪.apk"
$ExpectVC            = 6
$ExpectVN            = "2.0.0"
$MinTests            = 58
$MinKB               = 300
$MaxKB               = 900
$RequiredStrings     = @()            # N/A：S6 无新增 UI 字符串
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
"N/A: S6 无新增 UI 字符串门禁" | Set-Content -Path (Join-Path $EvidenceDir "ui-strings.txt") -Encoding UTF8
Add-Result "ui-strings" "N/A" "S6 无新增 UI 字符串门禁"

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

# ===== 18. S6 专属：N 台账 10 行 =====
$ledgerPath = ".\evidence\step-6\n-ledger.csv"
$ledgerRows = @()
if (Test-Path $ledgerPath) { $ledgerRows = @(Import-Csv $ledgerPath -Encoding UTF8) }
if ($ledgerRows.Count -eq 10) { Add-Result "n-ledger-10" "Pass" "10 行" } else { Add-Result "n-ledger-10" "Fail" "$($ledgerRows.Count) 行" }

# ===== 19. S6 专属：N01–N10 全覆盖 =====
$nIds = @("N01", "N02", "N03", "N04", "N05", "N06", "N07", "N08", "N09", "N10")
$nHit = 0
foreach ($id in $nIds) {
  if (@($ledgerRows | Where-Object { [string]$_.id -eq $id }).Count -ge 1) { $nHit++ }
}
if ($nHit -eq 10) { Add-Result "n-ids-10" "Pass" "10/10" } else { Add-Result "n-ids-10" "Fail" "$nHit/10" }

# ===== 20. S6 专属：open=0、结论非空、closed≥6 =====
$openCount = 0
$emptyConclusion = 0
$closedCount = 0
foreach ($r in $ledgerRows) {
  $st = ([string]$r.status).Trim().ToLower()
  if ($st -eq "open") { $openCount++ }
  if ($st -eq "closed") { $closedCount++ }
  if ([string]::IsNullOrWhiteSpace([string]$r.conclusion)) { $emptyConclusion++ }
}
if ($openCount -eq 0) { Add-Result "n-open-0" "Pass" "open=0" } else { Add-Result "n-open-0" "Fail" "open=$openCount" }
if ($emptyConclusion -eq 0) { Add-Result "n-conclusion" "Pass" "结论非空 10/10" } else { Add-Result "n-conclusion" "Fail" "空结论=$emptyConclusion" }
if ($closedCount -ge 6) { Add-Result "n-closed" "Pass" "closed=$closedCount" } else { Add-Result "n-closed" "Fail" "closed=$closedCount (need >=6)" }

# ===== 21. S6 专属：关键功能文件未被删 =====
$keepFiles = @(".\src\audio\engine.ts", ".\src\report\index.ts", ".\src\components\InstrumentPanel.tsx", ".\src\audio\golden.test.ts", ".\src\audio\status-priority.test.ts")
$keepMissing = 0
foreach ($k in $keepFiles) { if (-not (Test-Path $k)) { $keepMissing++ } }
if ($keepMissing -eq 0) { Add-Result "no-feature-deletion" "Pass" "5/5 关键文件存在" } else { Add-Result "no-feature-deletion" "Fail" "missing=$keepMissing" }

# ===== 22. S6 专属：清理前后对照 =====
$baPath = ".\evidence\step-6\before-after.md"
if (Test-Path $baPath) { Add-Result "before-after" "Pass" $baPath } else { Add-Result "before-after" "Fail" "缺 before-after.md" }

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
| UI 字符串 | N/A | S6 不新增界面文案 |
| 样本 | N/A | 样本验收在 S10 |
| 评审 12/15/16 | N/A | 评审回填在 S11 |

---

## 5. 通过条件（逐条为真/假）

| # | 条件 | 阈值 | 结果 | 实际值 | 证据 |
|---|---|---|---|---|---|
| 1 | `npm run typecheck` | 0 错误 | 真／假 | | `verify.log` |
| 2 | `npm test` | ≥58 pass，0 fail | 真／假 | | `verify.log` |
| 3 | `npm run build` | `dist/index.html` 存在 | 真／假 | | `verify.log` |
| 4 | `npm run apk` | 退出码 0 | 真／假 | | `verify.log` |
| 5 | `check-apk` | `ok:true`，`brokenRefs:[]` | 真／假 | | `check-apk.json` |
| 6 | 版本 | vc6 / 2.0.0 | 真／假 | | `check-apk.json` |
| 7 | 证书 | 与 S0 一致 | 真／假 | | `cert-sha256.txt` |
| 8 | APK 体积 | 300–900 KB | 真／假 | | `apk-size.txt` |
| 9 | `postgres.wasm` | 0 | 真／假 | | `apk-entries.txt` |
| 10 | N 台账行数 | 10 | 真／假 | | `n-ledger.csv` |
| 11 | N01–N10 覆盖 | 10/10 | 真／假 | | `n-ledger.csv` |
| 12 | `status=open` | 0 | 真／假 | | `n-ledger.csv` |
| 13 | `conclusion` 非空 | 10/10 | 真／假 | | `n-ledger.csv` |
| 14 | `closed` | ≥6 | 真／假 | | `n-ledger.csv` |
| 15 | 关键功能文件 | 5/5 存在 | 真／假 | | `verify.json` |
| 16 | 前后对照 | 1/1 | 真／假 | | `before-after.md` |
| 17 | UI 字符串 | N/A | N/A | | 本卡 §4.1 |
| 18 | 样本 | N/A | N/A | | 本卡 §4.1 |
| 19 | 评审 | N/A | N/A | | 本卡 §4.1 |
| 20 | 代码路径干净 | 为空 | 真／假 | | `verify.json` |

---

## 6. 人工验收

| # | 编号 | 操作 | 期望 | 实测 | 结论 | 截图/日志 |
|---|---|---|---|---|---|---|
| 1 | `N01` | 核对首屏与信息架构 | 今日任务/待复测/待交接，不是设备总览 | 待填 | 真／假 | `n-ledger.csv` |
| 2 | `N02` | 核对会话状态机 | 准备→测点→采集→判读→复测→报告→交接可走 | 待填 | 真／假 | 同上 |
| 3 | `N03` | 核对持久化 | IndexedDB 主存储，旧数据只读迁移 | 待填 | 真／假 | 同上 |
| 4 | `N04` | 核对案例/资产/测点模型 | 工单、测点几何、交接实体齐全 | 待填 | 真／假 | 同上 |
| 5 | `N05` | 核对报告 2.0 | 版本、几何、哈希、限制、交接齐全 | 待填 | 真／假 | 同上 |
| 6 | `N06` | 核对交接包 | handover.pack 可导出，含证据索引 | 待填 | 真／假 | 同上 |
| 7 | `N07` | 核对 Agent 层 | 规则优先、可拒答；不留在线依赖 | 待填 | 真／假 | 同上 |
| 8 | `N08` | 核对发布与可观测 | release-card、session trace、check:apk 可用 | 待填 | 真／假 | 同上 |
| 9 | `N09` | 核对构建链 | 静态 Vite；无 SSR/auth/PGLite | 待填 | 真／假 | 同上 |
| 10 | `N10` | 核对在线监护 UI | 已删；保留事件轨与复测对比 | 待填 | 真／假 | 同上 |
| 11 | 前后对照 | 对比 S5 与 S6 的包体、测试数、功能清单 | 功能不减少；测试数不减 | 待填 | 真／假 | `before-after.md` |

> 每条 N 必须有结论；「后续处理」不是结论，`open` 一律不通过。

---

## 7. 证据留存位置

```text
evidence/step-6/
├─ 验收卡.md
├─ n-ledger.csv          # 10 行；open=0；closed>=6
├─ before-after.md
├─ check-apk.json
├─ apk-sha256.txt
├─ cert-sha256.txt
├─ apk-size.txt
├─ ui-strings.txt        # 本步写 N/A 说明
├─ verify.log
├─ verify.json
└─ signoff.md
```

---

## 8. 禁止事项（命中任一 = 不通过）

- 禁止把 N 项标「后续处理」当结论。
- 禁止借清理之名删除功能或测试。
- 禁止一次性重写已工作的音频链。
- 禁止把 `status` 留成 `open`。
- 禁止把 `kept` / `deferred` 写成 `closed`。
- 禁止删除测试、改断言换绿；测试数只能增。
- 禁止把 `not_run` / `na` 写成 `pass`。
- 禁止 GT31–39 写 `pass`；GT40–41 只能 `not_run`。
- 禁止伪造评审、手填 release-card、改 tag 后重建、恢复授权门。
- 禁止在线 LLM 或网络权限。

---

## 9. 失败与回退

| 情形 | 判定 | 回退动作 |
|---|---|---|
| 有 `open` 项 | 本步不通过 | 回退 S5；补结论后重跑 |
| N 台账少于 10 行 | 本步不通过 | 按 05 补齐 N01–N10 |
| `closed` 少于 6 条 | 本步不通过 | 拆批清理，不得虚标 |
| 删除功能/测试 | 本步不通过 | 恢复文件；只回代码不回证据 |
| 测试少于 58 | 本步不通过 | 补测试，不得删旧测试 |
| 包体超 900 KB | 本步不通过 | 查残留依赖与资源 |

```powershell
git status --porcelain
git stash push -m "S6-wip"
git checkout step-5
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

**最终结论**：通过／有条件通过／不通过

**一句话理由**：用数字说明，例如「N 台账 10/10、open=0、closed=7、58/58、功能 5/5 关键文件仍在、APK 418 KB」。

---

## 11. 遗留问题（只写真实未闭环项）

| # | 问题 | 影响编号 | 严重度 | 责任人与期限 | 是否已进 release-card.waivers |
|---|---|---|---|---|---|
| 1 | `kept` / `deferred` 项需在 v2.1 继续跟踪 | N 台账 | 中 | 技术负责人／v2.1 | 否 |
| 2 | 旧 SSR/auth 残留若仍在依赖树，需下一次依赖审计 | N09 | 中 | 技术负责人／S12 前 | 否 |
| 3 | 在线监护 UI 删除后的事件轨回归需在 S7 再验 | N10 | 中 | 产品／S7 | 否 |
| 4 | 真实样本为 0 | GT06–14、GT28–30、GT42–43、GT45、F01–F12 | 高 | 质量／S10 前 | 是（planned not_run） |
| 5 | 评审 12/15/16 缺失 | G5 | 高 | 质量／S11 前 | 否 |
