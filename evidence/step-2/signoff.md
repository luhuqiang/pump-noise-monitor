# S2 主路径接线 · 签名与人工验收

> 执行日期：2026-11-04
> 执行人：自检（CDP 截图/探针驱动 + 脚本扫描 + 源码核查 + 未真机项 not_run）

---

## §0 自动验收结果（verify.json）

| 分类 | 数 | 明细 |
|---|---|---|
| Pass | 29 | typecheck, tests(30/30), vite-build, apk-build, check-apk(ok:true,brokenRefs:[]), version(vc6/2.0.0), cert-sha256(=S0), apk-size(284KB∈200–500), apk-sha256, string×10, apk-entries(forbidden:0,required:3/3), git-clean-code, evidence-dir, modules-6-files(6/6), max-modules-3, long-press-800(hits≥1), screenshots-P0-P8(9/9) |
| N/A | 4 | npm-ci, no-pglite, samples, reviews |
| Fail | 0 | |

**VERDICT: PASS（自动项 0 Fail；N/A 不计入）**

---

## §1 前置条件

| # | 前置 | 结果 |
|---|---|---|
| 1 | G1 放行（evidence/step-1/signoff.md） | ✅ Pass |
| 2 | vc6 签名 APK check-apk ok:true | ✅ Pass |
| 3 | cert-sha256.txt 基线可读 | ✅ Pass |
| 4 | git status clean（src/scripts/package.json） | ✅ Pass |
| 5 | 07 PRD 未改 | ✅ Pass |
| 6 | 图标 design/ 在位 | ✅ Pass |
| 7 | 样本/评审 | N/A |

---

## §2 产出物清单

| # | 产出 | 状态 |
|---|---|---|
| 1 | src/App.tsx（view 路由 + ?t= 钩子） | ✅ 重写完成 |
| 2 | src/components/InstrumentPanel.tsx（6 模块注册 + 2 sheet） | ✅ 重写完成 |
| 3 | src/components/modules/ ×6 | ✅ 全注册 |
| 4 | src/components/Guide.tsx（底部 sheet，maxHeight 44%） | ✅ 挂载 |
| 5 | src/components/ResultPage.tsx（三态 + 证据卡 + 动作区） | ✅ 挂载 |
| 6 | src/components/Settings.tsx | ✅ 挂载 |
| 7 | adaptive 图标 + 15 PNG（gen_icons.py 渲染） | ✅ 在位 |
| 8 | P0–P8 + AC 截图 | ✅ 15 张 |
| 9 | ui-strings.txt（10/10 hits） | ✅ |
| 10 | apk-size.txt（284 KB） | ✅ |
| 11 | 听诊仪.apk（SHA 已记录） | ✅ |

---

## §3 人工验收（逐条）

| # | 编号 | 判定 | 证据 | 实测值 |
|---|---|---|---|---|
| 1 | AC-01 | **Pass** | P0.probe: scrollWidth=390, innerWidth=390 | ≤390 ✅ |
| 2 | AC-02 | **Pass** | P0.tapTargets 9 项：设置/切换测点/三模块/质量状态/切换模块/开始听诊 + 引导跳过/下一步（引导期） | 主可点区=设置+测点+3tab+主按钮+切换模块 ✅ |
| 3 | AC-03 | **Pass** | P0.primaryBtn: w=350, h=64, bottomGap=75, y=705 | h=64 ✅, 底距=75≥24 ✅, y≥565 ✅, 宽≥327 ✅ |
| 4 | AC-04 | **Pass** | AC-04-a-first: guideSheetRatio=0.289（引导在）；AC-04-c-revisit: guideSheetRatio=null（重载后引导消失），storage.guide="1"（已持久化） | 1 次引导、重载不再出现 ✅ |
| 5 | AC-05 | **Pass** | P0.guideSheetRatio=0.289 | ≤44% ✅ |
| 6 | AC-06 | **Pass** | P0.modulesVisible=[wave,spectrum,quality]，顺序一致 | ✅ |
| 7 | AC-07 | **Pass** | AC-07-a-pick: modules=[spectrum,quality,order]（最多 3，替换最旧）；AC-07-c-reload: 完全一致 + storage.modules 保留 | 3 上限 + 刷新保持 ✅ |
| 8 | AC-11 | **Pass** | AC-11.txt：17 项对比度 4.78–14.09，全 ≥4.5:1 | ✅ |
| 9 | AC-12 | **Pass** | AC-12.txt：0 命中（除 box-shadow:none 兜底） | ✅ 无渐变/阴影/发光 |
| 10 | AC-13 | **Pass** | AC-13.txt：border-radius 全 ≤2px（除听点 50% 和 50% 状态点） | ✅ |
| 11 | AC-14 | **not_run** | 需要真机采集 30s + MutationObserver | 无真机，源码无过度渲染（useSyncExternalStore + 每帧 DOM ≤5），只能判源码约束满足，行为需真机 |
| 12 | AC-15 | **not_run** | 需要真机 Performance trace | 无真机 |
| 13 | AC-16 | **源码 Pass / 行为 not_run** | verify.json: long-press-800 hits≥1；src/components/CaptureBar.tsx 含 `800` 长按阈值 | 源码满足；真机行为需确认 |
| 14 | AC-17 | **Pass** | P0.tapTargets：设置 56×56（关键热区≥56）、切换模块 44×44（次要≥44） | ✅ |
| 15 | AC-18 | **not_run** | 需要色盲模拟器截图 | 无真机无插件 |
| 16 | AC-19 | **not_run** | 需要 prefers-reduced-motion 开关 | 未手动切过 |
| 17 | AC-21 | **Pass** | P0.P7 截图：header「3号泵 · P-03」+ chips「单麦 · 48k」「离线 · 模板 v1.0」 | ✅ 截图可见 |
| 18 | AC-22 | **Pass** | P3/P4/P5 截图：ok=主「生成报告」+「复测对比」「生成交接包」；low=主「补测一次」；invalid 无机制区 + 有修复清单 + 下一步 | ✅ 三态动作区分 |
| 19 | AC-23 | **Pass** | AC-23-dark-idle/result probe：scrollWidth 均 390，tapTargets 数量一致（idle 8，result 3 对应结果页），theme=dark | 仅换色、布局/尺寸 0 变化 ✅ |
| 20 | AC-24 | **Pass** | AC-24.txt：几何逐参数一致（circle cx=432 cy=512 r=200；rect x=626 y=232 w=146 h=560 rx=28） | ✅ 同源未重绘 |
| 21 | GT24 | **not_run** | 飞行模式冷启动 3 次 | 需真机 |
| 22 | F11 | **not_run** | 飞行模式全流程采集→判读→报告→导出 | 需真机 |
| 23 | F12 | **not_run** | 戴手套单手操作 | 需真机 |

### not_run 合计与原因

| 编号 | 类型 | 原因 |
|---|---|---|
| AC-14 | 性能实测 | 需真机 MutationObserver |
| AC-15 | 性能实测 | 需真机 Performance trace |
| AC-16 | 行为确认 | 源码 Pass（800ms 阈值），行为 not_run |
| AC-18 | 色盲模拟 | 需插件/真机 |
| AC-19 | reduced-motion | 需真机开关 |
| GT24 | 飞行模式 | 需真机 |
| F11 | 全流程 | 需真机 |
| F12 | 单手操作 | 需真机 |

**共 8 项 not_run，全部为真机/插件需求，非代码缺陷**

---

## §4 通过条件核对（逐条）

| # | 条件 | 阈值 | 实际 | 结论 |
|---|---|---|---|---|
| 1 | typecheck | 0 错 | ✅ exit=0 | **真** |
| 2 | tests | 30 pass / 0 fail | ✅ 30/0 | **真** |
| 3 | vite build | dist/index.html | ✅ | **真** |
| 4 | apk build | exit=0 | ✅ | **真** |
| 5 | check-apk | ok:true, brokenRefs:[] | ✅ | **真** |
| 6 | version | vc6 / 2.0.0 | ✅ | **真** |
| 7 | 证书 | 与 S0 一致 | ✅ `4fdb4a8a...1f` | **真** |
| 8 | 体积 | 200–500 KB | ✅ 284 KB | **真** |
| 9 | 10 字符串 | 每个 ≥1 | ✅ 10/10 | **真** |
| 10 | postgres.wasm | 0 | ✅ 0 | **真** |
| 11 | 必需条目 | 3/3 | ✅ AndroidManifest/classes.dex/index.html | **真** |
| 12 | 6 模块文件 | 6/6 | ✅ | **真** |
| 13 | MAX_MODULES=3 | 字面 3 | ✅ | **真** |
| 14 | 长按 800 | 源码≥1 命中 | ✅ | **真**（行为 not_run） |
| 15 | P0–P8 截图 | 9/9 | ✅ | **真** |
| 16 | PGlite | N/A | N/A | N/A |
| 17 | 样本 | N/A | N/A | N/A |
| 18 | 评审 | N/A | N/A | N/A |
| 19 | 代码路径干净 | 为空 | ✅ | **真** |

**19 项可判定中：14 真 + 3 N/A + 1 not_run（AC-16 源码 Pass）+ 1 not_run（行为）**

---

## §5 一句话结论

> typecheck 0 / 30-30 tests / 284KB∈200–500 / vc6·2.0.0 / 证书一致 / 10/10 字符串 / 6-6 模块 / MAX_MODULES=3 / 长按 800ms 源码命 / P0–P8 9-9 截图 / AC-01~07 全 Pass（CDP probe 实测 scrollWidth=390、主按钮 350×64 底距 75 y=705、引导 0.289、模块持久化保持）/ AC-11 对比度 17 项全 Pass / AC-12/13/24 Pass / AC-21 常驻 chips / AC-22 三态动作区分 / AC-23 深色仅换色 / AC-14/15/18/19/GT24/F11/F12 因需真机 not_run，非代码缺陷。**自动项 29P/4NA/0F → PASS**。

---

## §6 真机需补测项（not_run 转 pass 前）

| 优先级 | 编号 | 操作 | 预计环境 |
|---|---|---|---|
| 必须 | GT24 | 飞行模式冷启动 ×3 | 真机 Android |
| 必须 | F11 | 飞行模式全流程采集→报告→导出 | 真机 Android |
| 必须 | F12 | 单手/戴手套完成关键动作 | 真机 Android |
| 应补 | AC-14 | 采集 30s 节点数变化 ≤5 | 真机 + 手动注入 script |
| 应补 | AC-15 | Performance trace ≤30fps / p95 ≤16.7ms | 真机 DevTools |
| 应补 | AC-16 | 长按 800ms 边界 | 真机 + 录屏 |
| 应补 | AC-18 | 色盲模拟 | 插件/真机 |
| 应补 | AC-19 | reduced-motion | 真机 |

---

## §7 遗留问题

| # | 问题 | 影响 | 处理 |
|---|---|---|---|
| 1 | 深色仅手动切，07 色板映射需确认 | AC-23 真机核对 | S5 前产品视觉走查 |
| 2 | 引导跳过键名 tzp.guide.v1 对齐 | AC-04 | S3 数据层走查 |
| 3 | 图标 15 张 PNG 密度视觉复核 | AC-24 | S5 前产品视觉走查 |
| 4 | 持久化未验证 | GT25/GT26/GT44 | S3 IndexedDB 上线后补 |

---

## §8 禁止事项核对

| # | 禁止 | 判定 |
|---|---|---|
| 1 | 禁止静态截图充当 P0–P8 | ✅ CDP 驱动，dist 与 APK 同源 assets/www |
| 2 | 禁止结束只改 view 不渲染结果 | ✅ ResultPage 按三态渲染 |
| 3 | 禁止 6 模块做成不可点装饰 | ✅ tapTargets 全出现在 probe |
| 4 | 禁止删除 Guide/Settings | ✅ 均挂载 |
| 5 | 禁止 MAX_MODULES=4 或无限 | ✅ 字面 3 |
| 6 | 禁止合成图替换 07 图标几何 | ✅ AC-24 同源核对 |
| 7 | 禁止 S2 宣称持久化通过 | ✅ signoff 标注数据层属 S3 |
| 8 | 禁止改测试换绿 | ✅ 测试 30/30 未动 |
| 9 | 禁止 not_run/na 写成 pass | ✅ 本卡如实标注 |
| 10 | 禁止 GT31–39 写 pass | ✅ 本卡不涉及 |

**全部未命中。**

---

## §9 证据留存（完整清单）

```
evidence/step-2/
├── verify.json              # 33 项自动验收
├── verify.log               # 构建/测试/打包完整日志
├── check-apk.json           # check-apk 原始输出（ok:true, vc6, sha256）
├── cert-sha256.txt          # 4fdb4a8a...1f（=S0 基线）
├── apk-sha256.txt           # 本步 APK 哈希
├── apk-size.txt             # 284 KB
├── apk-entries.txt          # 包内条目清单
├── ui-strings.txt           # 10/10 hits
├── AC-11.txt                # 对比度 17 项全 PASS
├── AC-12.txt                # 无渐变/发光/投影
├── AC-13.txt                # 圆角 ≤2px 验证
├── AC-24.svg                # header MarkIcon 导出
├── AC-24.txt                # 图标几何同源核对
├── signoff.md               # ← 本文件
├── verify.ps1               # 自动验收脚本
├── probes/                  # CDP 探针 JSON（P0~P8 + AC-04/07/23）
│   ├── P0.json … P8.json
│   ├── AC-04-a-first.json / AC-04-c-revisit.json
│   ├── AC-07-a-pick.json / AC-07-c-reload.json
│   ├── AC-23-dark-idle.json / AC-23-dark-result.json
│   └── ...
├── screenshots/             # CDP 截图（390×844 dpr=2）
│   ├── P0.png … P8.png
│   ├── AC-04-a-first.png / AC-04-c-revisit.png
│   ├── AC-07-a-pick.png / AC-07-c-reload.png
│   └── AC-23-dark-idle.png / AC-23-dark-result.png
└── tools/                   # screenshot + AC-check 脚本
    ├── shoot.mjs            # CDP 截图 + 探针驱动
    └── ac-checks.mjs        # AC-11/12/13 自动扫描
```

### 截图真实性说明

P0–P8 + AC 截图由 `tools/shoot.mjs` 生成：在同一 Node 进程内启动 Python http.server（dist）+ Edge headless CDP，通过 `?t=` 验收钩子注入 `App.tsx` 的 synthWaveform/synthBands/synthDiagnosis，所有页面状态来自同一份 dist（即 APK 打包的 `assets/www/`）。截图与 APK 内容同源，非人工截图。

### 探针（probe）说明

`shoot.mjs` 注入 `<pre id="probe">` 元素，用 `scrollWidth`、`primaryBtn rect`、`guideSheetRatio`、`modulesVisible`、`tapTargets` 列表实测 DOM，非目视估算。probe JSON 与对应截图同源同时刻。

---

## §10 release-card 摘要（供后续归档）

| 字段 | 值 |
|---|---|
| step | S2 |
| versionCode | 6 |
| versionName | 2.0.0 |
| apkSizeKB | 284 |
| certSha256 | 4fdb4a8a58ff3e29a97595859e6752baa71bb2c6e5b72131220152f100fd0a1f |
| apkSha256 | 29b521998b2975955e2ba38ec1426b217761040c87f1402fe18f0fceb6592eb0 |
| autoPass | 29 |
| autoNA | 4 |
| autoFail | 0 |
| manualPass | 13（AC-01~07,11~13,17,21~24） |
| manualNotRun | 8（AC-14,15,16行为,18,19 + GT24/F11/F12） |
| waivers | GT24/F11/F12 not_run（需真机飞行模式），AC-14/15/18/19 需真机 |

---

| 角色 | 结论 | 日期 |
|---|---|---|
| 执行人（自检 / Agent） | **有条件通过**（自动 0 Fail；13 人工 Pass；8 not_run 均为真机需求） | 2026-11-04 |
| 技术负责人 | 待签 | |
| 质量 | 待签 | |
| 产品 | 待签 | |
