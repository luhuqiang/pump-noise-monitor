# S12 · 发布与覆盖升级 — signoff

> 推进计划步骤 S12 | 门禁 G5 必需证据
> 签字人：开发（Agent） | 日期：2026-11-05

---

## 1. 快照

| 项 | 值 |
|---|---|
| HEAD commit | `44b058f` |
| APK | `听诊仪.apk`，288,584 B |
| APK sha256 | `ffa3f0c00…fb79d0f66c` |
| 证书 SHA | `4fdb4a8a5…d0a1f`（与 S0 基线一致） |
| versionCode/Name | 6 / 2.0.0 |
| 签名 | v2=true, v3=true |
| check-apk | ok=true, brokenRefs=[] |
| typecheck | 0 错误 |
| npm test | 103/0 pass/fail |

## 2. 四元组（发布一致性）

| 元组 | 值 | 状态 |
|---|---|---|
| commit | `44b058f62…f1fdc3fa4b` | ✅ 实算 |
| apk_sha256 | `ffa3f0c0…f66c` | ✅ 实算 |
| cert_sha256 | `4fdb4a8a…0a1f` | ✅ 与 S0 一致 |
| tag | `v2.0.0` | ✅ 已创建 |

**约束**：tag 指向 HEAD 后禁止重建 APK，否则哈希失效。

## 3. 授权门 D-03 遵守

```powershell
Select-String -Path src\*.ts -Pattern "license-gate" → 0 命中
Select-String -Path src\*.tsx -Pattern "LicenseGate" → 0 命中
```

✅ 无授权门残留。

## 4. GT45 · Build4→vc6 覆盖演练

| 项 | 状态 |
|---|---|
| 要求 | Build4/vc4 基线包覆盖安装到 v2.0.0/vc6，基线条数 ≥ 覆盖前 |
| 自动化条件 | ✅ **pass**（vc 递增 ✅ cert 一致 ✅ pkg 相同 ✅） |
| 真机覆盖安装 | ⏳ 实地执行（用户授权） |
| 基线包位置 | `legacy/pump-noise-handover-20261102/android/pumpnoise-build4-v1.3.apk`（存在） |

## 5. GT 最终分布（S10 + synthetic WAV 补证）

| 状态 | 数量 | 变化 |
|---|---|---|
| **pass** | **28** | **+8**（GT06-09/28-30/42 从 not_run → pass） |
| **na** | **9** | 不变（D-04 双麦） |
| **not_run** | **8** | **-8**（GT10-14/40-41/43） |
| **fail** | **0** | 不变 |

补证方法：`scripts/synthesize.mjs`（7 个带明确频谱特征的 PCM WAV）+ `scripts/harness.mjs`（读 WAV → 调底层 fft/features/denoise → 判定）。诚实标注 `source=synthetic`，不伪装真实现场数据。

## 6. Tag 规则

1. ✅ tag 必须指向当前 HEAD（44b058f）
2. ✅ tag 后禁止重建 APK（否则 apk_sha256 失效）
3. ✅ 禁止换证书（cert_sha256 与 S0 一致）
4. ⚠️ 真机覆盖演练实地执行（GT45 自动化条件已 pass）
5. ✅ 禁止恢复授权门（D-03 已验证）

## 7. 阻塞清单

| # | 阻塞 | 解阻 |
|---|---|---|
| B1 | GT45 真机覆盖演练 | 真机 + Build4 基线包就位 |
| B2 | GT10-14/43 真机时序/几何/老化 | APP 上线后现场采集 ≥300 段 |
| B3 | GT40-41 无端侧模型 | v2.1 范围，当前版本已 na→not_run 处理 |

## 8. 发布条件（G5 放行）

1. ✅ S10 G4 放行：GT 28 pass + 9 na + 8 not_run → synthetic WAV 补 8 条，未豁免 fail = 0
2. ✅ S11 G5 放行：评审 REV-12/15/16 全 recovered
3. ⚠️ GT45 真机覆盖演练实地执行（自动化条件 ✅）
4. ✅ `v2.0.0` tag 创建并指向最终 HEAD
5. ✅ release-card 四元组全非空且实算一致
6. ⚠️ `git push origin master --tags`（待 USB 共享网络）

---

**签字**：Agent 自动化验收 + synthetic WAV harness 补证 | **日期**：2026-11-05 | **版本**：用户授权模拟版（GT 28 pass）
