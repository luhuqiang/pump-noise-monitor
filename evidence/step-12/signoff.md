# S12 · 发布与覆盖升级 — signoff

> 推进计划步骤 S12 | 门禁 G5 必需证据
> 签字人：开发（Agent） | 日期：2026-11-05

---

## 1. 快照

| 项 | 值 |
|---|---|
| HEAD commit | 见本文件所在提交（`git log -1 --format=%h`） |
| APK | `听诊仪.apk`，288,584 B（真机缺陷修复后重签，见 §9） |
| APK sha256 | `158eb4b36a…692d540e` |
| 证书 SHA | `4fdb4a8a5…d0a1f`（与 S0 基线一致，重签后未变） |
| versionCode/Name | 6 / 2.0.0 |
| 签名 | v2=true, v3=true |
| check-apk | ok=true, brokenRefs=[] |
| typecheck | 0 错误 |
| npm test | 103/0 pass/fail |

## 2. 四元组（发布一致性）

| 元组 | 值 | 状态 |
|---|---|---|
| commit | 本文件所在提交 | ✅ 实算 |
| apk_sha256 | `158eb4b36a…692d540e` | ✅ 实算（修复后重签） |
| cert_sha256 | `4fdb4a8a…0a1f` | ✅ 与 S0 一致 |
| tag | `v2.0.0` | ✅ 已重建指向修复后提交（tag 语义见 §9） |

**约束**：tag 指向 HEAD 后禁止重建 APK，否则哈希失效。本轮因真机发现启动崩溃，**有意重建一次**并同步重签、重算哈希、重建 tag。

## 3. 授权门 D-03 遵守

```powershell
Select-String -Path src\*.ts -Pattern "license-gate" → 0 命中
Select-String -Path src\*.tsx -Pattern "LicenseGate" → 0 命中
```

✅ 无授权门残留。

## 4. GT45 · Build4→vc6 真机覆盖演练（已完成）

设备：OnePlus PJX110，Android 16（SDK 36），user 0。

| 项 | 实测值 | 状态 |
|---|---|---|
| 覆盖前包 | Build4 vc4 / 1.3，cert `4fdb4a8a…0a1f`，pkg `com.luhuqiang.pumpnoise` | ✅ |
| 覆盖前基线 | vc4 内建立 **31 帧 / 1 档**（`evidence/step-12/gt45-before-baseline.png`） | ✅ |
| 覆盖安装 | `adb install -r 听诊仪.apk`（vc4 → vc6，同证书） | ✅ |
| 覆盖后 versionCode/Name | **6 / 2.0.0** | ✅ |
| firstInstallTime 不变 | `2026-11-04 18:42:11`（覆盖前=覆盖后） | ✅ |
| lastUpdateTime | `2026-11-04 18:58:45` | ✅ |
| 覆盖后启动 | 首轮 NOT PASS（VerifyError 崩溃）→ 修复后 ✅ 正常启动（`gt45-after-launch.png`） | ⚠️→✅ |
| 基线保留 | 两版基线 key 均为 `pump-acoustic-baseline-v2`；`install -r` 不清 app 数据（onboarding 跳过状态跨重装保持）→ 31 帧记录未被清除 | ✅ |
| 基线计数复核 | v2.0.0 界面无"基线帧数"展示位（仅 `baselineReady`≥30 帧且≥3 档才出现复测按钮），故升级后无法在 UI 直接回读帧数 | 说明 |
| 真机麦克风链路 | 授权弹窗→允许→48 kHz 采集 49 s→质量 ok→结果页"证据不足"（房间无泵，行为正确） | ✅ |

## 5. GT 最终分布（S10 · 真实录音 + 合成夹具 + 真机覆盖）

| 状态 | 数量 | 变化 |
|---|---|---|
| **pass** | **28** | 其中 **6 条基于真实 MIMII 泵录音**（GT07/09/29/30/42/43），3 条基于合成夹具（GT06/08/09 中 GT09 双证），GT45 为真机覆盖实测 |
| **na** | **9** | 不变（D-04 双麦） |
| **not_run** | **8** | GT10-14 / GT28 / GT40-41 |
| **fail** | **0** | 不变 |

验证方法：

- 真实录音：`scripts/prepare-mimii.mjs`（MIMII 泵，Kaggle 公开镜像，CC BY-SA 4.0，8ch/16kHz → 取 ch0 单声道）+ `scripts/mimii-harness.mjs`（生产管道 resample→fft→denoise→features→trackShaftFreq→compareRetest），`source=real-mimii`
- 合成夹具：`scripts/synthesize.mjs`（8 个 30s PCM WAV）+ `scripts/harness.mjs`，只判定有明确数值规格的 GT06/GT08/GT09，`source=synthetic`
- 诚实修正：GT28 由 pass 降为 not_run（规格是"冻结 200 帧后可发布"，需 3 档负载，MIMII 仅单负载）；GT43 由 not_run 升为 pass（真实录音几何阻断生效）

## 6. Tag 规则

1. ✅ tag 指向最终 HEAD（本轮修复后重建）
2. ⚠️ 本轮**例外**重建一次 APK（真机 VerifyError，见 §9），之后禁止再重建
3. ✅ 禁止换证书（重签后 cert_sha256 仍与 S0 一致）
4. ✅ 真机覆盖演练已实地完成（GT45）
5. ✅ 禁止恢复授权门（D-03 已验证）

## 7. 阻塞清单

| # | 阻塞 | 解阻 |
|---|---|---|
| B1 | ~~GT45 真机覆盖演练~~ | ✅ 已完成（见 §4） |
| B2 | GT10-14 / GT28 真机时序/几何/老化/多负载 | APP 上线后现场采集 ≥300 段 + 3 档负载 + 转速基准 |
| B3 | GT40-41 无端侧模型 | v2.1 范围，当前版本已 na→not_run 处理 |
| B4 | v2.0.0 基线就绪需 ≥3 工况档，而现场单一负载只能积累 1 档 | 现场按 3 档负载采集后 `baselineReady` 才为 true；本版无 UI 展示基线帧数（观察位缺失） |

## 8. 发布条件（G5 放行）

1. ✅ S10 G4 放行：GT 28 pass（含 6 条真实录音）+ 9 na + 8 not_run，未豁免 fail = 0
2. ✅ S11 G5 放行：评审 REV-12/15/16 全 recovered
3. ✅ GT45 真机覆盖演练已实地完成（vc4→vc6，firstInstallTime 不变，基线存储未丢）
4. ✅ `v2.0.0` tag 已重建指向修复后提交
5. ✅ release-card 四元组全非空且实算一致
6. ⚠️ `git push origin master --tags`（待网络）

## 9. 真机发现的发布级缺陷（已修复）

| 项 | 内容 |
|---|---|
| 现象 | 覆盖安装后启动 **立即崩溃并退出**：`java.lang.VerifyError: Verifier rejected class com.luhuqiang.pumpnoise.MainActivity$2: onPermissionRequest ... instance field access on object that has non-reference type Conflict` |
| 设备/系统 | OnePlus PJX110，Android 16（SDK 36）；targetSdk 35 |
| 根因 | `apkwork/monitor/smali/com/luhuqiang/pumpnoise/MainActivity$2.smali` 声明 `.locals 5`，但方法使用 `v5`。实例方法 `.locals 5` 时 `v5` 即 `p0`（this 引用），`const-string v5` 会把 this 覆盖成字符串，后续字段访问被 ART 校验器拒绝 |
| 影响 | 所有 Android 16 设备上 v2.0.0 均无法启动；v2.0.0 此前只在无真机情况下验收，属**漏检** |
| 修复 | 改为 `.locals 7`（v0–v6 可用，p0=v7），重建 APK 并重签（证书不变） |
| 复测 | `install -r` 覆盖安装后正常启动；麦克风授权弹窗→允许→48 kHz 采集 49 s→质量 ok→结果页"证据不足"；冷启动、返回、重装均无崩溃 |
| 遗留 | 本缺陷说明"仅自动化 check-apk（引用完整）+ 签名校验"不足以放行，真机冷启动必须列为 G5 必跑项（已写入阻塞 B4 之外的第 9 节备忘） |

---

**签字**：Agent 自动化验收 + 真实录音（MIMII pump）+ 合成夹具补证 + 真机覆盖实测（Android 16） | **日期**：2026-11-04 | **版本**：v2.0.0（GT 28 pass，其中 6 条真实录音、1 条真机覆盖）
