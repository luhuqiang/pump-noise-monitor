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

## 5. GT 最终分布（S10 · 真实录音 + 合成夹具）

| 状态 | 数量 | 变化 |
|---|---|---|
| **pass** | **28** | 其中 **6 条基于真实 MIMII 泵录音**（GT07/09/29/30/42/43），3 条基于合成夹具（GT06/08/09 中 GT09 双证） |
| **na** | **9** | 不变（D-04 双麦） |
| **not_run** | **8** | GT10-14 / GT28 / GT40-41 |
| **fail** | **0** | 不变 |

验证方法：

- 真实录音：`scripts/prepare-mimii.mjs`（MIMII 泵，Kaggle 公开镜像，CC BY-SA 4.0，8ch/16kHz → 取 ch0 单声道）+ `scripts/mimii-harness.mjs`（生产管道 resample→fft→denoise→features→trackShaftFreq→compareRetest），`source=real-mimii`
- 合成夹具：`scripts/synthesize.mjs`（8 个 30s PCM WAV）+ `scripts/harness.mjs`，只判定有明确数值规格的 GT06/GT08/GT09，`source=synthetic`
- 诚实修正：GT28 由 pass 降为 not_run（规格是"冻结 200 帧后可发布"，需 3 档负载，MIMII 仅单负载）；GT43 由 not_run 升为 pass（真实录音几何阻断生效）

## 6. Tag 规则

1. ✅ tag 必须指向当前 HEAD（44b058f）
2. ✅ tag 后禁止重建 APK（否则 apk_sha256 失效）
3. ✅ 禁止换证书（cert_sha256 与 S0 一致）
4. ⚠️ 真机覆盖演练实地执行（GT45 自动化条件已 pass；音频真实录音已验证，但"覆盖安装"仍需 Android 设备）
5. ✅ 禁止恢复授权门（D-03 已验证）

## 7. 阻塞清单

| # | 阻塞 | 解阻 |
|---|---|---|
| B1 | GT45 真机覆盖演练 | 需 Android 设备 + Build4 基线包（音频真实录音已完成，不阻塞此项） |
| B2 | GT10-14 / GT28 真机时序/几何/老化/多负载 | APP 上线后现场采集 ≥300 段 + 3 档负载 + 转速基准 |
| B3 | GT40-41 无端侧模型 | v2.1 范围，当前版本已 na→not_run 处理 |

## 8. 发布条件（G5 放行）

1. ✅ S10 G4 放行：GT 28 pass（含 6 条真实录音）+ 9 na + 8 not_run，未豁免 fail = 0
2. ✅ S11 G5 放行：评审 REV-12/15/16 全 recovered
3. ⚠️ GT45 真机覆盖演练实地执行（自动化条件 ✅）
4. ✅ `v2.0.0` tag 创建并指向最终 HEAD
5. ✅ release-card 四元组全非空且实算一致
6. ⚠️ `git push origin master --tags`（待网络）

---

**签字**：Agent 自动化验收 + 真实录音（MIMII pump）+ 合成夹具补证 | **日期**：2026-11-04 | **版本**：v2.0.0（GT 28 pass，其中 6 条真实录音）
