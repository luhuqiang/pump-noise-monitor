# S1 签署页 · 可复现构建与 release-card（M00）

> 步骤：**S1**　门禁：**G1**（技术负责人 + 质量）
> 执行人：执行人（自检 · Trae）　执行日期：2026-11-04
> 证据目录：`evidence/step-1/`　验收卡：`evidence/step-1/验收卡.md`
> 自动项结论：**VERDICT: PASS**（26 Pass / 4 N/A / **0 Fail**；N/A 不计为通过）
> 步骤结论：**通过（执行人自检）**；**G1 尚未放行**（技术负责人、质量双签未完成）

---

## 1. 产出

| 产出 | 状态 | 说明 |
|---|---|---|
| `scripts/build-apk.mjs` | 已改 | 去掉硬编码 SDK 绝对路径与硬编码版本/证书打印 |
| `scripts/sign-apk.mjs` | 已改 | 口令只读 `PUMP_KS_PASS`/`PUMP_KEY_PASS`；`PUMP_KEYSTORE` 可覆盖密钥路径 |
| `scripts/check-apk.mjs` | 已改 | 去掉硬编码 SDK 绝对路径 |
| `scripts/release-card.mjs` | 新建 | 生成并自校验 release-card（schema 1.1，21 键 / 19 门禁字段） |
| `package.json` | 已改 | `1.4.0` → `2.0.0` |
| `apkwork/monitor/apktool.yml` | 已改 | `versionCode 5→6`、`versionName 1.4→2.0.0` |
| `evidence/step-1/*` | 已建 | `verify.json` 由卡面脚本直出，未手改 |

## 2. 验收命令（逐条）

| 命令 | 结果 | 实测 |
|---|---|---|
| `npm ci` | exit 0 | `added 117 packages in 10s`（先清空 node_modules） |
| `npm run typecheck` | exit 0 | 0 错误 |
| `npm test` | exit 0 | `# pass 30` / `# fail 0` |
| `npm run build` | exit 0 | `dist/index.html` 存在 |
| `npm run apk` | exit 0 | apktool 2.9.3 → zipalign → v2+v3 签名 → 自查 ok |
| `npm run check:apk -- .\听诊仪.apk` | exit 0 | `ok:true`、`brokenRefs:[]` |
| `node scripts/release-card.mjs --step S1 --out …` | exit 0 | `✅ release-card 校验通过` |
| `Select-String scripts\*.mjs 'D:\Users'` | **0 命中** | — |

## 3. 数字阈值

| 阈值 | 要求 | 实测 | 判定 |
|---|---|---|---|
| 版本 | vc6 / 2.0.0 | 6 / 2.0.0 | Pass |
| 包名 | `com.luhuqiang.pumpnoise` | 同 | Pass |
| APK 体积 | 120–200 KB | 139778 B = 136.5 KB | Pass |
| 签名 | v2 / v3 均 true | v2=true、v3=true | Pass |
| release-card 门禁字段 | 19/19 非空 | 19/19（`tag=step-1`） | Pass |
| release-card 结构 | 21/21 键存在 | 21/21（含 `waivers`、`evidence_dir`） | Pass |
| release-card 哈希 | 与实算一致 | apk/cert 均一致 | Pass |
| 证书 SHA | 与 S0 完全一致 | `4fdb4a8a…0a1f` 两侧一致 | Pass |
| 测试 | ≥30，0 fail | 30 / 0 | Pass |
| 包内禁止条目 | `.jks`/`.pem`/`stethoscope-keys/` = 0 | 0/0/0 | Pass |
| 包内必需条目 | 3/3 | 3/3 | Pass |
| 代码路径干净 | 为空 | dirty=0 | Pass |

工具链：Node v22.14.0、build-tools 35.0.0、apktool 2.9.3；
证书主体 `CN=luhuqiang, OU=pumpnoise, O=pumpnoise, L=Shanghai, C=CN`。

## 4. 禁止事项核对

- 未手工 `apksigner` 补签；口令未进脚本/仓库/日志（运行期注入进程环境）；未跳过 `check-apk`；
- 主包为 `听诊仪.apk`（vc6/2.0.0），未用授权包冒充；未改 release-card 数字、未手填哈希；
- 未删除测试换绿（30/30 原样）；`gt/ac/f/samples/reviews` 如实记 `not_run` / GT31–39 记 `na`。

## 5. 人工验收（§6 对照）

| # | 编号 | 实测 | 结论 | 证据 |
|---|---|---|---|---|
| 1 | M00 | 清空 node_modules 后 `npm ci` 10s（117 包）→ `npm run apk` 一次成功产出 vc6 签名 APK | 真 | `build.log`、`verify.log` |
| 2 | M00 | 两次构建 `contentSha256` 均 `495fdf4c…8ee8`；`apk_sha256` 变化（`b3e0…`→`b0cb…`） | 真（内容级），字节级否 | `repro-runs.txt`、`check-apk.json` |
| 3 | 06 §13.3 | `aapt2 dump badging`：vc6 / 2.0.0 / `com.luhuqiang.pumpnoise` / targetSdk 35 / label 听诊仪；签名 v2+v3 | 真 | `aapt2-badging.txt` |
| 4 | D-08 | `package.json` 2.0.0、`apktool.yml` vc6/2.0.0、`check-apk` vc=6，无 vc5 残留 | 真 | 各源文件 |
| 5 | release-card | 21 键齐全、19 门禁字段非空、`tag=step-1`、哈希实算一致 | 真 | `release-card.json` |
| 6 | 证书 | 本步与 S0 `cert-sha256.txt` 完全一致，未换证书 | 真 | `cert-sha256.txt` ×2 |
| 7 | 脚本卫生 | `D:\Users` 0 命中；密钥只读环境变量，无口令字面量 | 真 | `verify.json`、`scripts/sign-apk.mjs` |
| 8 | 包内卫生 | `.jks`/`.pem`/`stethoscope-keys/` 0 命中 | 真 | `apk-entries.txt` |

> S1 无对应 GT/AC/F：`release-card.json` 内全部为 `not_run`（GT31–39 为 `na`），未填 pass。

## 6. 证据留存

```text
evidence/step-1/
├─ 验收卡.md            # 本卡副本（条款留痕）
├─ build.log / verify.log / verify.json
├─ check-apk.json / release-card.json
├─ apk-sha256.txt / cert-sha256.txt / apk-size.txt / apk-entries.txt
├─ aapt2-badging.txt    # 四元组原始输出
├─ repro-runs.txt       # 两次构建对照
├─ ui-strings.txt       # 本步 N/A 说明
└─ signoff.md           # 本页
```

## 7. 已知偏差

| # | 偏差 | 事实 | 影响 | 处置 |
|---|---|---|---|---|
| 1 | APK 非字节可复现 | 同提交多次构建 `apk_sha256` 各不相同，`contentSha256` 恒为 `495fdf4c…8ee8`（zip 时间戳） | G1「干净环境可重建」按功能可重建满足 | 严格字节复现需「确定性 zip + 重签名」改造，另立项 |
| 2 | `check-apk.json` 的 `signature.tool` 为绝对路径 | 属证据文件，非脚本 | 不影响「scripts 无绝对路径」判据 | 无需改 |

## 8. 签署

| 角色 | 姓名 | 结论 | 签字/日期 |
|---|---|---|---|
| 执行人（自检） | 执行人（自检 · Trae） | 通过（自动项 0 Fail，1 项已知偏差） | 2026-11-04 |
| 技术负责人 | （待签） | — | — |
| 质量 | （待签） | — | — |

**最终结论**：通过（执行人自检）；**G1 = 未放行**（待技术负责人 + 质量双签）

**一句话理由**：`npm ci` 0、typecheck 0、30/30、check-apk ok、vc6/2.0.0、包名正确、v2+v3、
证书与 S0 一致、136.5 KB、release-card 19/19 且哈希实算一致、scripts 绝对路径 0 命中。

## 9. 遗留问题

| # | 问题 | 影响编号 | 严重度 | 责任人与期限 | 进 waivers |
|---|---|---|---|---|---|
| 1 | APK 字节级不可复现（内容哈希稳定） | M00 | 中 | 技术负责人／S12 前 | 否 |
| 2 | G1 技术负责人、质量双签未完成 | G1 | 高 | 技术负责人／质量 · S2 前 | 否 |
| 3 | vc4 基线包未取得，覆盖升级链未证 | GT45 | 高 | 发布负责人／S12 前 | 是（GT45 风险） |
| 4 | 真实样本为 0 | GT06–14、GT28–30、GT42–43、GT45、F01–F12 | 高 | 质量／S10 前 | 是（planned not_run） |
| 5 | 评审 12/15/16 缺失 | G5 | 高 | 质量／S11 前 | 否 |
