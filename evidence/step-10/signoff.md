# S10 · GT/F 全量证据链 — signoff

> 推进计划步骤 S10 | 门禁 G4 必需证据
> 签字人：开发（Agent） | 日期：2026-11-04（真实录音补证版）

---

## 1. 快照

| 项 | 值 |
|---|---|
| HEAD commit | `44b058f`（本文件所在提交见 git log） |
| APK | `听诊仪.apk`，288,584 B，sha256 `ffa3f0c0…f66c` |
| check-apk | ok=true，v2+v3=true，brokenRefs=[] |
| 证书 SHA | 4fdb4a8a…0a1f（与 S0 基线一致） |
| versionCode/Name | 6 / 2.0.0 |
| typecheck | 0 错误 |
| npm test | 103/0 pass/fail |
| Build4 vc4 | 599,601 B, vc4/1.3, cert 一致 ✅ |

## 2. GT 45 条分布

| 状态 | 数量 | 说明 |
|---|---|---|
| **pass** | **28** | 其中 6 条由**真实 MIMII 泵录音**验证，3 条由合成夹具验证，其余为单元测试/逻辑层 |
| **na** | **9** | D-04 双麦未实装，禁止写 pass |
| **not_run** | **8** | GT10-14 / GT28 / GT40-41：需真实时序、多负载工况或端侧模型 |
| **fail** | **0** | 诚实：无应过未过 |

### 关键变化（相对上一版）

| GT | 上版 | 本版 | 原因 |
|---|---|---|---|
| GT06 | pass（阈值已放宽到 ≤1.0Hz） | **pass（≤0.3Hz 硬阈值）** | 加对数域抛物线插值后误差 0.13Hz |
| GT28 | pass | **not_run** | 上版把规格误读成"复测 200 帧"；实际是"冻结 200 帧后**可发布**"，而可发布要求 3 个负载档，MIMII 仅单负载 |
| GT43 | not_run | **pass** | 真实录音下 geometryComparable=false 阻断生效 |
| GT07/GT09/GT29/GT30/GT42 | synthetic | **真实录音** | 全部改用 MIMII 真实泵录音 |

## 3. 真实录音验证（source=real-mimii）

### 3.1 数据来源

| 项 | 值 |
|---|---|
| 数据集 | MIMII pump（日立制作所，CC BY-SA 4.0） |
| 获取路径 | Kaggle 公开镜像 `giacomoveneri1/mimii-dataset-sound-data-for-malfunctioning-pump` |
| 原始规格 | 8 声道 / 16 kHz / 16 bit / 每段 10 s；381 正常 + 138 异常 |
| 本仓库取用 | 30 条 normal + 10 条 abnormal，**只取 channel 0 转单声道**，不做滤波/增益 |
| 落盘 | `samples/mimii/`（gitignore，含 `manifest.json` 记录 sha256 与来源） |
| 复现 | `scripts/prepare-mimii.mjs`（Node 内置 zlib 解 zip，无新依赖） |

> 说明：`zenodo.org` 在当前网络返回 0.0.0.0（DNS 黑名单），故改走 Kaggle 公开镜像；数据本体一致。

### 3.2 验证方式

全部走生产代码，不另写算法：

```
resampleTo48k（生产重采样，16k→48k）
  → powerSpectrum（Hann, 32768 点, df=1.46Hz）
  → Denoiser
  → featuresFromPower(rpm, blades=6)
  → trackShaftFreq（轴频梳状谱锁定）
  → learnBaseline / baselineInfo / anomalyOf
  → compareRetest（复测阈值判定）
```

localStorage 用内存桩（Node 无浏览器环境，只替换存储层）。

### 3.3 实测结果（`scripts/mimii-harness.mjs` → `samples/mimii/real-verdict.json`）

| GT | 结果 | 实测证据 |
|---|---|---|
| GT07 | ✅ | 30 条真实泵：`subharmonic=true` **0/30**（半阶次未误判为基频）；`reliable=false` 30/30（宽带流噪声下主动拒答、不给假转速）；mismatch 标记 7 条 |
| GT09 | ✅ | Denoiser 估计 SNR 均值 **6.6 dB**（区间 5.4–9.1），与 8 dB 规格偏差 1.4 dB < 4 dB |
| GT29 | ✅ | 正常↔异常工况复测 Δ=**5.71 dB** > 1.5 dB → `not_comparable` |
| GT30 | ✅ | 同泵同会话相邻段复测 Δ=**0.03 dB** ≤ 1.5 dB → `comparable` |
| GT42 | ✅ | 同上，Δ≤1.5 dB 分支命中 |
| GT43 | ✅ | Δ=0.03 dB 很小但 `geometryComparable=false` → `not_comparable`（门禁优先级正确） |
| GT28 | ⏳ not_run | 真实录音喂入 200 帧达标，但 buckets=1（要求 ≥3 档负载）→ 需现场多负载采集 |
| GT06 | ⏳ not_run | MIMII 无汽蚀标注 → 真实汽蚀主频无法判定 |
| GT08 | ⏳ not_run | MIMII 泵无转速计，且宽带泵流噪声下轴频锁定 0/30 → 需现场 1500 rpm 基准 |

### 3.4 真实数据暴露的产品风险（记录，不隐藏）

- **轴频锁定在真实小型泵上 0/30 不成立**：MIMII 泵谱以宽带流噪声为主（主导峰在 53–1527 Hz 间跳变），没有干净的 1× 音调。当前实现对这类泵一律 `reliable=false`（行为正确：不发假转速），但意味着**阶次类特征在真实泵上可能长期不可用**，诊断实际依赖 `hfRatio` / `flatness` / `halfRatio` 等无量纲比。
- **`halfRatio` 在真实泵上普遍偏高**（0.46–6.43，堵塞方向门限 0.38）：`strength()` 的 blockage 分支可能对真实泵偏敏感，需现场基线校准后再判定。→ 已列入现场采集核对项，不在本版改阈值。

## 4. 合成夹具验证（source=synthetic）

合成夹具只用于规格有明确数值的场景，8 个样本（30 s / 48 kHz / 16 bit / 单声道）：

| GT | 结果 | 实测证据（`scripts/harness.mjs` → `samples/synthetic/gt-verdict.json`） |
|---|---|---|
| GT06 | ✅ | 汽蚀主频 **46.13 Hz**，误差 **0.13 Hz ≤ 0.3 Hz**；正常样本主峰 48.3 Hz 不误判 |
| GT08 | ✅ | 1500 rpm 夹具（25 Hz，观测 **734 转 ≥17 转**）：`reliable=true`，f0=25.01 Hz → 1500 rpm，误差 **0 rpm**，combScore=1.00 |
| GT09 | ✅ | 8 dB 低 SNR 下 denoiser 保留基频峰（49.8 Hz，peak −25.4 dB） |

> GT07 / GT28-30 / GT42-43 已不由合成夹具判定（合成噪声底同源，不具备说服力），统一交给真实录音。

## 5. 其余 pass 条目

| 分组 | GT | 覆盖方式 |
|---|---|---|
| 基线 learnBaseline | GT01-05 | baseline.test.ts 向量累积 |
| Agent 三态 / 拒答 | GT15-19 / GT22-23 | agent.test.ts |
| 报告 manifest / 时钟漂移 | GT20-21 / GT27 | manifest.test.ts |
| 飞行模式 | GT24 | App 离线启动 |
| IndexedDB | GT25-26 | idb.test.ts |
| localStorage 迁移 | GT44 | migrate.test.ts |
| 覆盖安装 | GT45 | Build4 vc4→v2.0.0 vc6 **真机实测**（Android 16）：vc 递增 + cert 一致 + pkg 相同 + firstInstallTime 不变 + 基线 key 未变（详情见 S12 signoff §4/§9） |

## 6. F 12 条分布

| 状态 | 数量 |
|---|---|
| pass | 3（F07/F11/F12 单元测试） |
| not_run | 8（F01-06/F08/F10 依赖真实样本） |
| waived | 1（F09 D-04） |
| fail | 0 |

## 7. waivers 聚合（6 条，全部非 pass）

| 原因 | 覆盖条目 | 状态 |
|---|---|---|
| 逻辑层 pass 但真数据待现场 | GT10-14 + F01 | not_run |
| 需多负载工况 | GT28 | not_run |
| D-04 双麦未实装 | GT31-39 + F09 | na / waived |
| 无端侧模型 | GT40-41 | not_run |
| 复测逻辑 pass 但真数据待现场 | F02/F05/F06 | not_run |
| Agent 三态 pass 但真数据待现场 | F03/F04/F08/F10 | not_run |

## 8. G4 放行条件

1. ✅ 未豁免 fail = 0
2. ✅ not_run 全部有 waiver 字段
3. ✅ 28 条 pass，其中 **6 条基于真实工业泵录音**（非合成）
4. ⚠️ GT10-14 / GT28 / GT40-41 = 8 条 not_run，需现场采集（≥300 段真 PCM + 3 档负载 + 转速基准）

---

**签字**：Agent 自动化验收 + 真实录音（MIMII）+ 合成夹具补证 | **日期**：2026-11-04
