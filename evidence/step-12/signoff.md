# S12 · 发布与覆盖升级 — signoff

> 推进计划步骤 S12 | 门禁 G5 必需证据
> 签字人：开发（Agent） | 日期：2026-11-04

---

## 1. 快照

| 项 | 值 |
|---|---|
| HEAD commit | `3cdbec3` |
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
| commit | `3cdbec32…7a9e` | ✅ 实算 |
| apk_sha256 | `ffa3f0c0…f66c` | ✅ 实算 |
| cert_sha256 | `4fdb4a8a…0a1f` | ✅ 与 S0 一致 |
| tag | `v2.0.0` | ⏳ **待创建**（当前 HEAD） |

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
| 当前 | **not_run** |
| 阻塞 | 真机 + Build4 基线包（vc4） |
| 基线包位置 | `legacy/pump-noise-handover-20261102/android/pumpnoise-build4-v1.3.apk`（存在） |

## 5. Tag 规则

1. ✅ tag 必须指向当前 HEAD（3cdbec3）
2. ✅ tag 后禁止重建 APK（否则 apk_sha256 失效）
3. ✅ 禁止换证书（cert_sha256 与 S0 一致）
4. ✅ 禁止跳过 Build4 演练（GT45 硬阻塞）
5. ✅ 禁止恢复授权门（D-03 已验证）

## 6. 阻塞清单

| # | 阻塞 | 解阻 |
|---|---|---|
| B1 | GT45 真机覆盖演练 | 真机 + Build4 基线包就位 |
| B2 | S10 G4 未放行（样本未到位） | 样本 ≥300 段到位后重跑 GT/F |
| B3 | S11 G5 未放行（评审 missing） | 评审人到场补评审 |

## 7. 发布条件（G5 放行）

1. S10 G4 放行：GT 19 pass + 9 na + 17 not_run → 真机样本到位后 15 条变 pass，未豁免 fail = 0
2. S11 G5 放行：评审 12/15/16 状态 ≠ missing，conclusion 非空
3. GT45 真机覆盖演练 pass
4. `v2.0.0` tag 创建并指向最终 HEAD
5. release-card 四元组全非空且实算一致
6. `git push origin master --tags` 完成

---

**签字**：Agent 自动化验收（构建链 + 四元组验证）| **日期**：2026-11-04 | **版本**：骨架（GT45 + S10/S11 重跑待解阻）
