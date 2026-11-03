# S3 IndexedDB 持久化 · 分步验收卡

> 依据：`推进计划.md` §5 S3、D-01；06 §5（16 store）；`步骤验收卡-模板.md`。
> 本卡只执行已有编号：`M10`、`GT25`、`GT26`、`GT44`。PGlite 一律视为不通过。

---

## 1. 步骤信息

| 字段 | 填写 |
|---|---|
| 步骤编号 | `S3` |
| 步骤名称 | IndexedDB 16 store + 5 repository 重写 |
| 对应编号 | `M10`；`GT25`、`GT26`、`GT44`；`D-01` |
| 计划人日 | 7–9 |
| 版本 | `versionCode=6`、`versionName=2.0.0` |
| 证据目录 | `evidence/step-3/` |
| 执行人 | 执行人（自检） |
| 执行日期 | 执行当日填写 |
| 构建产物 | `听诊仪.apk`，SHA-256 见 `apk-sha256.txt` |

---

## 2. 前置条件（任一为否，停止）

| # | 前置 | 判定命令/文件 | 判定结果 |
|---|---|---|---|
| 1 | G2 前置（S2 已过） | `evidence/step-2/signoff.md` 结论=通过 | 是／否 |
| 2 | S2 真实读写面已定型 | `src/components/ResultPage.tsx` 已渲染结果；`src/App.tsx` 走 P0–P8 | 是／否 |
| 3 | 16 store 字段表可读 | 06 §5.2 已冻结 | 是／否 |
| 4 | 工作区代码干净 | `git status --porcelain -- src scripts package.json` 为空 | 是／否 |
| 5 | 证书基线可读 | `Test-Path .\evidence\step-0\cert-sha256.txt` | 是／否 |
| 6 | 5 个 repository 现状已留档 | `src/db/repositories/` 下 5 个文件已提交 | 是／否 |
| 7 | 样本与评审 | 本步不涉及，填 `N/A`（S10 / S11 处理） | N/A |

---

## 3. 产出物清单

| # | 产出 | 实际路径 | 状态 |
|---|---|---|---|
| 1 | 原生 IndexedDB 封装 | `src/db/idb.ts` | 待创建 |
| 2 | 16 store 定义 | `src/db/schema.ts` | 待创建 |
| 3 | 只读迁移（localStorage） | `src/db/migrate.ts` | 待创建 |
| 4 | 5 个 repository 重写 | `src/db/repositories/sessions.ts`、`segments.ts`、`evidence.ts`、`baselines.ts`、`settings.ts` | 现有，待重写 |
| 5 | 删除 PGlite 实现 | `src/db/pglite.ts` | 现有，待删除 |
| 6 | 删除依赖 | `package.json` 中 `@electric-sql/pglite` | 现有，待删除 |
| 7 | 重启读回日志 | `evidence/step-3/db-roundtrip.log` | 待生成 |
| 8 | 包内条目证明 | `evidence/step-3/apk-entries.txt` | 待生成 |
| 9 | GT 证据 | `evidence/step-3/gt/GT25.json`、`GT26.json`、`GT44.json` | 待生成 |
| 10 | 签名 APK | `听诊仪.apk` | 待生成 |

### 3.1 16 store 固定清单

`meta`、`sites`、`assets`、`points`、`sessions`、`captures`、`evidence`、`baselines`、`gates`、`events`、`cases`、`reports`、`handovers`、`clips`、`settings`、`migrations`。

### 3.2 `db-roundtrip.log` 固定格式

```text
stores=16/16
write=sessions:1,segments:1
restart=kill_process
readback=100
migration=localStorage:1
```

`readback=100` 表示写 1 session + 1 segment 后杀进程重启，读回率 100%。

---

## 4. 自动验收命令块（PowerShell 5，复制即跑）

```powershell
# ===== S3 自动验收（PowerShell 5）=====
$ErrorActionPreference = "Continue"

# ===== 本步参数 =====
$Step                = "S3"
$Apk                 = ".\听诊仪.apk"
$ExpectVC            = 6
$ExpectVN            = "2.0.0"
$MinTests            = 36
$MinKB               = 200
$MaxKB               = 500
$RequiredStrings     = @()            # N/A：S3 无 UI 字符串门禁
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
"N/A: S3 无 UI 字符串门禁" | Set-Content -Path (Join-Path $EvidenceDir "ui-strings.txt") -Encoding UTF8
Add-Result "ui-strings" "N/A" "S3 无 UI 字符串门禁"

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

# ===== 18. S3 专属：16 store 定义 =====
$storeNames = @("meta", "sites", "assets", "points", "sessions", "captures", "evidence", "baselines", "gates", "events", "cases", "reports", "handovers", "clips", "settings", "migrations")
$schemaPath = ".\src\db\schema.ts"
$storeHits = 0
if (Test-Path $schemaPath) {
  foreach ($s in $storeNames) {
    if (Select-String -Path $schemaPath -Pattern $s -SimpleMatch -Quiet) { $storeHits++ }
  }
}
if ($storeHits -eq 16) { Add-Result "stores-16" "Pass" "16/16" } else { Add-Result "stores-16" "Fail" "$storeHits/16" }

# ===== 19. S3 专属：5 个 repository 重写且无 PGlite =====
$repoNames = @("sessions.ts", "segments.ts", "evidence.ts", "baselines.ts", "settings.ts")
$repoHit = 0
$repoPg = 0
foreach ($r in $repoNames) {
  $rp = Join-Path ".\src\db\repositories" $r
  if (Test-Path $rp) {
    $repoHit++
    if (Select-String -Path $rp -Pattern @("PGlite", "idb://") -SimpleMatch -Quiet) { $repoPg++ }
  }
}
if (($repoHit -eq 5) -and ($repoPg -eq 0)) { Add-Result "repositories-5" "Pass" "5/5，PGlite 引用 0" } else { Add-Result "repositories-5" "Fail" "files=$repoHit/5 pgliteRefs=$repoPg" }

# ===== 20. S3 专属：pglite.ts 已删除 =====
if (-not (Test-Path ".\src\db\pglite.ts")) { Add-Result "pglite-removed" "Pass" "src/db/pglite.ts 不存在" } else { Add-Result "pglite-removed" "Fail" "src/db/pglite.ts 仍存在" }

# ===== 21. S3 专属：依赖已移除 =====
$depHit = $false
if (Test-Path ".\package.json") {
  $pkg = Get-Content ".\package.json" -Raw -Encoding UTF8 | ConvertFrom-Json
  $depHit = @($pkg.dependencies.PSObject.Properties.Name) -contains "@electric-sql/pglite"
}
if (-not $depHit) { Add-Result "pglite-dependency" "Pass" "@electric-sql/pglite 不在 dependencies" } else { Add-Result "pglite-dependency" "Fail" "依赖仍存在" }

# ===== 22. S3 专属：GT25 / GT26 / GT44 证据 =====
foreach ($gt in @("GT25", "GT26", "GT44")) {
  $gtPath = ".\evidence\step-3\gt\$gt.json"
  $gtOk = $false
  if (Test-Path $gtPath) {
    try {
      $gj = Get-Content $gtPath -Raw -Encoding UTF8 | ConvertFrom-Json
      $gtOk = ($null -ne $gj.gt) -and ($null -ne $gj.result)
    } catch { $gtOk = $false }
  }
  if ($gtOk) { Add-Result "gt:$gt" "Pass" "$gtPath" } else { Add-Result "gt:$gt" "Fail" "缺 $gtPath 或字段 gt/result" }
}

# ===== 23. S3 专属：重启读回 100% =====
$drPath = ".\evidence\step-3\db-roundtrip.log"
$drOk = $false
if (Test-Path $drPath) {
  $drText = Get-Content $drPath -Raw -Encoding UTF8
  $drOk = ($drText -match "readback\s*=\s*100") -and ($drText -match "stores\s*=\s*16/16")
}
if ($drOk) { Add-Result "db-roundtrip" "Pass" "stores=16/16 readback=100" } else { Add-Result "db-roundtrip" "Fail" "缺 readback=100 或 stores=16/16" }

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
| UI 字符串 | N/A | S3 无界面交付 |
| 样本 | N/A | 样本验收在 S10 |
| 评审 12/15/16 | N/A | 评审回填在 S11 |

---

## 5. 通过条件（逐条为真/假）

| # | 条件 | 阈值 | 结果 | 实际值 | 证据 |
|---|---|---|---|---|---|
| 1 | `npm run typecheck` | 0 错误 | 真／假 | exit= | `verify.log` |
| 2 | `npm test` | ≥36 pass，0 fail | 真／假 | pass= / fail= | `verify.log` |
| 3 | `npm run build` | `dist/index.html` 存在 | 真／假 | | `verify.log` |
| 4 | `npm run apk` | 退出码 0 | 真／假 | | `verify.log` |
| 5 | `check-apk` | `ok:true`，`brokenRefs:[]` | 真／假 | | `check-apk.json` |
| 6 | 版本 | vc6 / 2.0.0 | 真／假 | | `check-apk.json` |
| 7 | 证书 | 与 S0 一致 | 真／假 | | `cert-sha256.txt` |
| 8 | APK 体积 | 200–500 KB | 真／假 | KB | `apk-size.txt` |
| 9 | 包内 `postgres.wasm` | 0 命中 | 真／假 | | `apk-entries.txt` |
| 10 | 16 store | 16/16 定义可读 | 真／假 | | `schema.ts` |
| 11 | 5 repository | 5/5 存在且 PGlite 引用 0 | 真／假 | | `verify.json` |
| 12 | `src/db/pglite.ts` | 不存在 | 真／假 | | `verify.json` |
| 13 | `@electric-sql/pglite` | 不在 dependencies | 真／假 | | `package.json` |
| 14 | `idb://` / `new PGlite` | 0 命中 | 真／假 | | `verify.json` |
| 15 | GT25 / GT26 / GT44 | 3/3 有 `gt` 与 `result` | 真／假 | | `evidence/step-3/gt/` |
| 16 | 重启读回 | `stores=16/16`、`readback=100` | 真／假 | | `db-roundtrip.log` |
| 17 | UI 字符串 | N/A | N/A | | 本卡 §4.1 |
| 18 | 样本 | N/A | N/A | | 本卡 §4.1 |
| 19 | 评审 | N/A | N/A | | 本卡 §4.1 |
| 20 | 代码路径干净 | 为空 | 真／假 | | `verify.json` |

---

## 6. 人工验收

| # | 编号 | 操作 | 期望 | 实测 | 结论 | 截图/日志 |
|---|---|---|---|---|---|---|
| 1 | `GT25` | 把存储配额写满后继续写新案例 | 不覆盖旧案例；旧案例仍可读 | 待填 | 真／假 | `gt/GT25.json` |
| 2 | `GT26` | 篡改案例 hash 后打开 | 100% 隔离，不猜测、不合并 | 待填 | 真／假 | `gt/GT26.json` |
| 3 | `GT44` | 旧 localStorage 六类键迁移 | 100% 迁移；旧键只读未改；旧基线可见 | 待填 | 真／假 | `gt/GT44.json` |
| 4 | 重启读回 | 写 1 session + 1 segment → 杀进程 → 冷启动 | 读回率 100%，字段完整 | 待填 | 真／假 | `db-roundtrip.log` |
| 5 | 16 store | 逐 store 建库、写 1 条、索引查询、事务回滚 | 16/16 可创建可读写 | 待填 | 真／假 | `db-roundtrip.log` |
| 6 | 迁移失败回滚 | 注入迁移异常 | 回滚到备份，标 `migration_failed`；不清空旧键 | 待填 | 真／假 | `migrate-rollback.log` |
| 7 | 初始化失败 | 模拟 IndexedDB 打开失败 | 显式报错 `E_DB_OPEN`，不静默降内存 | 待填 | 真／假 | `db-open-fail.log` |
| 8 | 5 repository | 逐一调用新增/查询/更新接口 | 5/5 不再依赖 PGlite；接口签名一致 | 待填 | 真／假 | `repositories.txt` |

> S3 的 GT 判定必须在真实 IndexedDB 上完成；内存降级、种子数据、localStorage 主存储一律不通过。

---

## 7. 证据留存位置

```text
evidence/step-3/
├─ 验收卡.md
├─ db-roundtrip.log       # stores=16/16 readback=100
├─ apk-entries.txt        # 证明无 postgres.wasm
├─ check-apk.json
├─ apk-sha256.txt
├─ cert-sha256.txt
├─ apk-size.txt
├─ ui-strings.txt         # 本步写 N/A 说明
├─ verify.log
├─ verify.json
├─ gt/
│  ├─ GT25.json
│  ├─ GT26.json
│  └─ GT44.json
└─ signoff.md
```

---

## 8. 禁止事项（命中任一 = 不通过）

- 禁止 `idb://` 失败后 `new PGlite()` 内存降级。
- 禁止把 localStorage 当主存储。
- 禁止只建表不读写。
- 禁止用种子数据冒充「重启后仍在」。
- 禁止保留 5 个 repository 中任一旧接口薄壳。
- 禁止保留 `postgres.wasm` 或 `@electric-sql/pglite`。
- 禁止删除测试、改断言换绿；测试数只能增。
- 禁止把 `not_run` / `na` 写成 `pass`。
- 禁止 GT31–39 写 `pass`；GT40–41 只能 `not_run`。
- 禁止伪造评审、手填 release-card、改 tag 后重建、恢复授权门。
- 禁止在线 LLM 或网络权限。

---

## 9. 失败与回退

| 情形 | 判定 | 回退动作 |
|---|---|---|
| 任一 store 读回失败 | 本步不通过 | 修 schema/事务；重跑重启读回 |
| 包内仍有 `postgres.wasm` | 本步不通过 | 移除依赖与构建拷贝，重跑 |
| 仍有 `idb://` / `new PGlite` | 本步不通过 | 删旧实现与薄壳，重跑 |
| 测试少于 36 | 本步不通过 | 补真实读写测试，不得删旧测试 |
| 读回率不是 100% | 本步不通过 | 查事务提交/主键；不得用种子数据 |
| 迁移失败未回滚 | 本步不通过 | 补备份与回滚，重跑 |
| 包体超 500 KB | 本步不通过 | 查 wasm/旧依赖残留 |

```powershell
git status --porcelain
git stash push -m "S3-wip"
git checkout step-2
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

**一句话理由**：用数字说明，例如「36/36、16/16 store、5/5 repository、postgres.wasm 0、idb:// 0、重启读回 100%、GT25/26/44 全过、APK 248 KB」。

---

## 11. 遗留问题（只写真实未闭环项）

| # | 问题 | 影响编号 | 严重度 | 责任人与期限 | 是否已进 release-card.waivers |
|---|---|---|---|---|---|
| 1 | 旧 localStorage 六类键的真实样本需现场设备导出验证 | GT44 | 中 | 技术负责人／S10 前 | 否 |
| 2 | 2GB 配额与 80% 导出提醒尚未在真机压测 | GT25 | 中 | 质量／S10 前 | 否 |
| 3 | `clips` store 默认关闭策略需在 S8 再确认 | GT42 | 中 | 产品／S8 | 否 |
| 4 | 真实样本为 0 | GT06–14、GT28–30、GT42–43、GT45、F01–F12 | 高 | 质量／S10 前 | 是（planned not_run） |
| 5 | 评审 12/15/16 缺失 | G5 | 高 | 质量／S11 前 | 否 |
