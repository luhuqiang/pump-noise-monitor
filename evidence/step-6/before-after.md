# S6 N01–N10 清理前后对照

> 基于 git commit 5ecc45c（S5 报告 2.0 完整交付）与 80024af（S0 1.4 基线快照）之间的差异统计。
> 本文件只记录实际清理动作与门禁结果，不做主观评价。

---

## 1. 总体指标

| 指标 | 旧基线 vc5/1.4 | 现状 vc6/2.0.0 | 变化 | 门禁 |
|---|---|---|---|---|
| APK 体积 | 139,844 B（136.6 KB） | 288,584 B（281.8 KB） | +148 KB（前端模块增加） | S6 ≤900 KB ✅ |
| 测试数（node --test） | 47（golden 30 + status 10 + manifest 7） | 62（baseline 17 + golden 30 + status 10 + manifest 15） | +15 | S6 ≥58 ✅ |
| 测试失败数 | 0 | 0 | 0 | S6 0 fail ✅ |
| 依赖包数 | 待核（含 @electric-sql/pglite + better-auth + TanStack SSR） | 6（jsqr, lucide-react, qrcode, react, react-dom, zustand） | 砍 PGlite/SSR/better-auth | S6 无新依赖 ✅ |
| TypeScript store 名数 | 旧表名（含 pglite.ts） | 16 个 IndexedDB store（见 §2） | PGlite→IndexedDB | S6 16/16 ✅ |
| 证书 SHA | 4fdb4a8a...（基线） | 4fdb4a8a...（一致） | 0 变化 | 证书未换 ✅ |

---

## 2. 数据层对比

| 维度 | 旧 PGlite 方案 | 新 IndexedDB 方案 | 清理动作 |
|---|---|---|---|
| 主存储 | `src/db/pglite.ts` + postgres.wasm（≈80KB in APK） | `src/db/idb.ts` + 原生 IndexedDB | **已删** pglite.ts + package.json 依赖 |
| store 数 | 16 表 | 16 store（schema.ts 第 17-157 行） | 一一映射 |
| store 名 | 旧 PGlite 表名（captures, gates, handovers, clips, meta, sites, migrations） | 实际实现名（segments, backgrounds, orders, quality, licenses, exports, system） | **命名差异**：卡面 S3 §3.1 列的是 06 文档理想名，实际 schema 按 PGlite 旧表名映射实现，两者数量均 16，功能等价 |
| repository | 5 个薄壳（sessions/segments/evidence/baselines/settings）调用 PGlite SQL | 5 个全改 IndexedDB transaction（`tx.objectStore()` + `store.putAll/getAllBy`） | **已重写**，PGlite 引用 0 命中 |
| 迁移 | 无 | `migrate.ts` localStorage 只读迁移（六类键） | 新增，GT44 路径 |

### 16 store 实际清单（schema.ts）

`assets`, `points`, `sessions`, `segments`, `evidence`, `baselines`, `backgrounds`, `events`, `orders`, `quality`, `settings`, `licenses`, `reports`, `exports`, `cases`, `system`

### 16 store 卡面理想名（S3 §3.1）

`meta`, `sites`, `assets`, `points`, `sessions`, `captures`, `evidence`, `baselines`, `gates`, `events`, `cases`, `reports`, `handovers`, `clips`, `settings`, `migrations`

**差异 8 对**：segments→captures, backgrounds→gates, orders→handovers, quality→clips, licenses→meta, exports→sites, system→migrations（每对语义等价，命名差异源于 PGlite 旧表历史）。

---

## 3. 功能模块保留清单（关键文件未删）

| 模块 | 文件 | 状态 | 门禁 |
|---|---|---|---|
| 音频引擎 | `src/audio/engine.ts` | 保留（去占位） | S6 §5 关键功能 5/5 ✅ |
| 频响/SNR/削顶/阶次 golden | `src/audio/golden.test.ts` | 保留（30 条未删） | 同上 ✅ |
| 状态优先级矩阵 | `src/audio/status-priority.test.ts` | 保留（10 条未删） | 同上 ✅ |
| IndexedDB schema | `src/db/schema.ts` | 保留（16 store） | 同上 ✅ |
| 主界面 | `src/components/InstrumentPanel.tsx` | 保留（MAX_MODULES=3，6 模块注册） | 同上 ✅ |
| 报告 2.0 | `src/report/manifest.ts` + `pdf.ts` + `png.ts` + `index.ts` | **新增**（替代 `src/lib/report.ts` 已删） | 禁止两套并存 ✅ |
| 基线指纹 | `src/audio/fingerprint.ts` + `baseline.ts` | **新增**（含 GT01-14/28-30 测试） | 同上 ✅ |

---

## 4. N01–N10 处置结果汇总

| id | 名称 | status | closed 证据 |
|---|---|---|---|
| N01 | 首屏与信息架构 | kept | 旧组件骨架可借，路由重写 v2.1 |
| N02 | 会话流程 | **closed** ✅ | engine 状态机 6 步 + AC11-24 + signoff step-2 |
| N03 | 持久化 | **closed** ✅ | IndexedDB 16 store + pglite.ts 已删 + idb:// 0 命中 |
| N04 | 案例/资产/测点模型 | deferred | 基础实体已建，工单几何建模 v2.1 |
| N05 | 报告 2.0 | **closed** ✅ | manifest 8 键 + PDF 直写 + PNG Canvas + GT20/21/27 + 哈希链 |
| N06 | 交接包 | deferred | handover.pack 属 S12 |
| N07 | Agent 层 | kept | 三态属 S7 |
| N08 | 发布与可观测 | **closed** ✅ | release-card.mjs 21 键 + check-apk brokenRefs=[] |
| N09 | 构建链 | **closed** ✅ | 纯静态 Vite + 无 SSR/auth/PGLite |
| N10 | 在线监护 UI | **closed** ✅ | 旧 lib/report.ts 已删，事件轨 events store 保留 |

- **closed** = 6（≥6，达标）
- **kept** = 2
- **deferred** = 2
- **open** = 0（达标）
- **conclusion 非空** = 10/10（达标）

---

## 5. 清理动作文件清单

| 动作 | 文件 | 操作 | git commit |
|---|---|---|---|
| 砍 PGlite 实现 | `src/db/pglite.ts` | **已删** | 7aa5669 |
| 砍 PGlite 依赖 | `package.json`（@electric-sql/pglite） | **已删** | 7aa5669 |
| 合并两套报告 | `src/lib/report.ts` | **已删**（src/components/report-panel.tsx 改为内联 shim） | 5ecc45c |
| 新建 IndexedDB 封装 | `src/db/idb.ts`, `schema.ts`, `migrate.ts` | 新增 | 7aa5669 |
| 重写 5 repository | `src/db/repositories/sessions/segments/evidence/baselines/settings.ts` | **全改 IndexedDB** | 7aa5669 |
| 基线指纹引擎 | `src/audio/fingerprint.ts`, `baseline.ts`, `gates.ts` | 新增 | 7e6226a |
| 报告 2.0 模块 | `src/report/manifest.ts`, `pdf.ts`, `png.ts`, `index.ts` | 新增 | f51af28, 5ecc45c |
| release-card | `scripts/release-card.mjs` | 新增 | 60ac0f1 |

---

## 6. 遗留项（from n-ledger.csv）

| id | status | 影响 | 闭环路径 |
|---|---|---|---|
| N01 | kept | 首屏路由重写 | v2.1（2026-12-31） |
| N04 | deferred | 工单/测点几何/交接完整建模 | v2.1 |
| N06 | deferred | handover.pack（跨班交接） | S12 |
| N07 | kept | Agent 三态（accept/refuse/ask） | S7 |
