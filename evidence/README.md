# 听诊仪 v2.0.0 · 证据索引

> 推进计划 §6.2 目录结构 | G0–G5 门禁必需证据

## 步骤证据

| 步 | 说明 | 门禁 | signoff | verify | GT/F |
|---|---|---|---|---|---|
| **S0** | 裁决冻结 + 文档回改 + 三项立项 | G0 ✅ | ✅ | ✅ | — |
| **S1** | 可复现构建 + release-card | G1 ✅ | ✅ | ✅ | — |
| **S2** | 主路径接线 P0–P8 | G2 环节 | ✅ | ✅ | — |
| **S3** | IndexedDB 18 store | G2 环节 | ✅ | ✅ | GT25/26/44 |
| **S4** | 基线/门控 GT01-14/28-30 | G2 环节 | ✅ | ✅ | GT01-14/28-30 + F09 |
| **S5** | 报告 2.0 manifest | G2 ✅ | ✅ | ✅ | GT20/21/27 |
| **S6** | N01-N10 台账清理 | — | ✅ | ✅ | — |
| **S7** | Agent 三态 | G3 环节 | ✅ | ✅ | GT15-19/22-23 |
| **S8** | 复测交接 | G3 ✅ | ✅ | ✅ | GT42-43 |
| **S9** | 双麦接口 | G3 环节 | ✅ | ✅ | GT31-39(na)/40-41(nr) |
| **S10** | GT/F 全量（骨架） | G4 ⚠️ | ✅ | ✅ | GT 19P/9na/17NR/0F · F 3P/8NR/1W/0F |
| **S11** | 评审回填（骨架） | G5 环节 | ✅ | ✅ | 评审 12/15/16 全 missing |
| **S12** | 发布四元组（骨架） | G5 环节 | ✅ | ✅ | GT45 NR |

## 四元组（最终）

| 元组 | 值 | 来源 |
|---|---|---|
| commit | `62cda162…` | `git rev-parse v2.0.0^{commit}` |
| apk_sha256 | `ffa3f0c0…f66c` | `sha256sum 听诊仪.apk` |
| cert_sha256 | `4fdb4a8a…0a1f` | `apksigner verify --print-certs`（与 S0 一致） |
| tag | `v2.0.0` | annotated tag 指向 HEAD |

## 全局门禁（实跑 2026-11-04）

| 门禁 | 结果 | 阈值 |
|---|---|---|
| `npm run typecheck` | **0 错误** | 0 |
| `npm test` | **103 pass / 0 fail / 24 suites** | ≥70 |
| APK | **288,584 B = 281.8 KB** | 200-900 KB |
| check-apk | **ok=true, v2+v3=true, brokenRefs=[]** | — |
| versionCode/Name | 6 / 2.0.0 | 6 / 2.0.0 |
| 证书 SHA | 4fdb4a8a… | 与 S0 一致 |
| license-gate grep | **0 命中** | 0（D-03 遵守） |
| git status | **干净** | 干净 |

## 硬阻塞（当前无法解）

| # | 阻塞 | 影响 | 解阻条件 |
|---|---|---|---|
| B1 | 真实现场样本 ≥300 段 | GT06-14/28-30/42-43/45 + F01-06/F08/F10 | §4 样本任务并行 |
| B2 | 评审人到场 | 评审 12/15/16 全 missing | 评审人补签 |
| B3 | Build4/vc4 → v2.0.0/vc6 真机覆盖 | GT45 | 真机 + vc4 基线包 |
| B4 | 端侧模型 | GT40-41 not_run | v2.1 |
| B5 | 推 GitHub | tag 仅本地 | USB 共享/海外隧道 |

## 规则

每条证据：
- `step` — 所属步骤
- `command` — 产出命令
- `exit_code` — 命令退出码
- `artifact_sha256` — 产物 SHA-256（如有）
- `operator` — 执行人
- `timestamp` — 时间戳

截图必须来自当步 APK，不得复用旧图。
