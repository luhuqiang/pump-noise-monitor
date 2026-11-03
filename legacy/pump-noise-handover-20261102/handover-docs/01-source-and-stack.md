# 泵噪监测台 · 源码结构与技术栈

## 一、技术栈总览

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 运行时 | Node.js 22 LTS / 24.x | 沙箱实测 24.1.0；项目未声明 engines |
| 语言 | TypeScript 5.7，strict | `npm run typecheck` = tsc --noEmit |
| 前端框架 | React 19.2 | 函数组件 + hooks |
| 应用框架 | TanStack Start 1.168 / Router 1.170 | SSR + 文件路由；实际只有单页 |
| 构建 | Vite 8.2 + Nitro 3 beta | 产物 .vercel/output/static |
| 状态 | zustand 5 | 设置、预设；localStorage 持久化 |
| 样式 | Tailwind CSS 4.3 + tw-animate-css | @tailwindcss/vite |
| 组件库 | Radix UI 全家桶 + shadcn 风格封装 | 无整包 UI 框架 |
| 图表 | Recharts 2.13 + 自绘 Canvas | 频谱/瀑布图以 canvas 为主 |
| 表单 | react-hook-form 7 + zod 4 | |
| 数据库 | pg 8 + PGlite 0.5（WASM 兜底） | 仅 auth 用；当前 auth 关闭 |
| 认证 | better-auth 1.6（可选） | .grok/app-env.json 里 VITE_AUTH_ENABLED=false |
| 授权码 | jose 6 ES256（P-256） | 公钥内嵌，私钥本地签发 |
| 测试 | node:test + tsx strip-types | 音频算法单测；Playwright 可选用 |
| 打包 | apktool 2.9.3 + Android build-tools 34 | WebView 壳 + assets/www |

关键依赖版本可直接看 package.json 与 package-lock.json。锁文件必须保留。

## 二、运行架构

```text
浏览器 / WebView
  ├─ React UI（src/routes/index.tsx → src/components/instrument.tsx）
  ├─ AudioContext（48 kHz）
  │    ├─ AudioWorklet: meter（A/C 计权 biquad + Leq 积分）
  │    ├─ AudioWorklet: capture（原始块送入主线程）
  │    └─ AudioWorklet: pump-dsp（演示声源合成）
  ├─ 主线程 Engine（src/lib/audio/engine.ts）
  │    ├─ 精细谱 0.68 s 窗 → features → diagnose → status-priority
  │    ├─ 包络谱 → 轴承阶次
  │    ├─ 事件轨 85 ms 片 → crest/kurtosis → 鲁棒 z
  │    ├─ 轴频跟踪 → 谐波回归 + 4 s 多窗 + 不确定度
  │    └─ 基线指纹 → 马氏距离 + 工况分档 + 老化
  └─ localStorage（设置 / 基线 / 事件历史 / 背景谱 / 授权）
```

结论链路刻意分层：

1. 采集与有效性（validity.ts）先判「数据能不能信」。
2. 特征与统计（features.ts / fft.ts / envelope.ts）只出证据。
3. 诊断（diagnose.ts）出概率、方向、严重度，不命名具体故障。
4. 标题裁决（status-priority.ts）自上而下取第一条，保证标题、摘要、配色不互相矛盾。

## 三、源码地图

### 3.1 入口与页面

| 文件 | 职责 |
| --- | --- |
| src/routes/__root.tsx | SSR 根路由、meta、AuthProvider、PWA 桥 |
| src/routes/index.tsx | 首页：LicenseGate + Instrument |
| src/router.tsx | 路由实例 |
| src/routeTree.gen.ts | TanStack 自动生成，不要手改 |
| src/styles.css | Tailwind 入口与主题变量 |

### 3.2 组件（src/components）

| 文件 | 职责 |
| --- | --- |
| instrument.tsx | 主仪表盘外壳：布局、模式切换、启动/停止、设置联动 |
| clean-spectrum.tsx | 原始谱/降噪谱对比、包络谱视图（含峰锁定与读数） |
| meter-card.tsx | 声级表：Fast/Slow/Leq/Peak |
| overview-strip.tsx | 顶部概览：状态、健康分、关键读数 |
| result-card.tsx | 结论卡：标题、摘要、方向、置信度 |
| diagnosis-card.tsx | 诊断证据与建议展开 |
| quality-strip.tsx | 信号质量：削顶、AGC、掉帧、采样率、SNR |
| report-panel.tsx | 报告预览与导出（txt / 摘要 / JSON） |
| settings-panel.tsx | 泵型、转速、叶片数、工况、校准等设置 |
| toolbar.tsx | 顶部工具条 |
| charts.tsx | 小型图表封装 |
| license-gate.tsx | 未授权/过期的全屏门禁 |
| machine-qr.tsx / qr-scan.tsx | 机器码二维码生成与扫码 |
| preview-host-bridge.tsx | 嵌入式预览宿主通信 |
| use-frame.ts | 按帧订阅 Engine 读数的 hook |
| panel.tsx | 通用面板容器 |

### 3.3 声学算法（src/lib/audio）

| 文件 | 职责 | 关键点 |
| --- | --- | --- |
| engine.ts | 采集、调度、状态集成 | 唯一对外 Readout；所有模块在此拼装 |
| fft.ts | Radix-2 FFT、功率谱、频带功率、median | 纯函数，无浏览器依赖 |
| bands.ts | IEC 61260 第三倍频程中心频率 | 25 Hz–10 kHz |
| weighting.ts | IEC 61672 A/C 计权 | 显示用解析幅值，仪表用 biquad |
| resample.ts | 44.1 kHz → 48 kHz 带限重采样 | Hann 窗 sinc 16 抽头；非 48k 仍标 invalid |
| validity.ts | 静默失效源判定 | 削顶、AGC、采样率、Worklet 掉帧、麦克风丢失、静音 |
| denoise.ts | 单麦克风降噪 | 最小值统计噪声底 + 判决引导 + Wiener/MMSE |
| features.ts | 谱特征 | 主导频率、平坦度、HF 比、1×/2×/BPF、半阶、谐波数、8 频带 |
| diagnose.ts | 结论层 | 逻辑回归 logits → softmax → 平滑 → 滞回；ALGORITHM_VERSION=v1.0-2026.11 |
| status-priority.ts | 标题/状态唯一优先级矩阵 | invalid → warming → 转速歧义 → 转速不符 → crest → 摆位 → 低置信 → 正常 |
| phase.ts | 运行态状态机 | idle → starting → steady → stopping |
| fingerprint.ts | 正常指纹基线 | 对角协方差马氏距离；≥30 帧且 ≥3 工况档；设备+位置进 key；90 天/500 h 老化；维修作废 |
| background.ts | 背景谱 | 24 个对数带，40–10000 Hz；重采背景版本 +1 使旧基线失效 |
| event-rail.ts | 85 ms 短帧事件轨 | 4096 样点/片；crest 自归一化；median/MAD 鲁棒 z；门限验收期冻结 |
| shaft-tracker.ts | 轴频跟踪 | 1×–5× 谐波抛物线插值 + 梳状回归；4 s 多窗 1/σ² 合并；±95% 不确定度；防倍频锁定 |
| envelope.ts | 包络谱 | 带通 → 解析信号 → 包络 → 低频 FFT；BPFO/BPFI/BSF/FTF |
| draw.ts | Canvas 绘制 | 谱线、瀑布、包络；光标吸附峰与理论频率标注 |
| tween.ts | 显示插值 | 140 ms 收敛；帧差突变直接吸附；告警/截图取原始帧 |
| health.ts | 健康分 | 只看状态、严重度、基线偏离 |
| self-check.ts | 自检 | 合成信号跑通诊断链 |
| pump-dsp.ts | 演示声源 DSP | Worklet 源码字符串，禁止闭包/TS 语法 |
| scenarios.ts | 演示场景与泵型元数据 | 离心泵/旋涡泵默认参数 |
| condition.ts | 派生工况 | 电机极数、电网频率、流量、扬程、NPSH、间隙等实时计算 |

新增的两个测试文件：

- golden.test.ts：20 条黄金用例，覆盖 FFT、特征、降噪、有效性、状态机、基线、重采样、事件轨、轴频。
- status-priority.test.ts：10 条，覆盖优先级矩阵与 crest 命中。

### 3.4 其它业务模块

| 文件 | 职责 |
| --- | --- |
| src/lib/settings.ts | zustand 设置/预设，localStorage 持久化；泵型、极数、电网、流量、校准偏移等 |
| src/lib/report.ts | buildReport / buildSummary / buildJson；报告带轴频不确定度、事件轨、基线版本 |
| src/lib/license.ts | 机器码（原生桥优先，网页退化 UA+屏幕指纹）；ES256 验签；24 h 码窗口；防重复累加 |
| src/lib/db.ts | DATABASE_URL 有则 Neon，无则 PGLite；迁移共用 migration-plan |
| src/lib/auth/* | better-auth 客户端/服务端/门禁；当前构建关闭 |
| src/lib/og/* | 分享卡配置 |
| src/lib/multiplayer/* | 多人协作预留，当前未启用 |

### 3.5 脚本（scripts）

| 文件 | 职责 |
| --- | --- |
| with-app-env.mjs | 把 .grok/app-env.json 的 VITE_ 变量注入 dev/build/preview |
| app-env-plugin.mjs | dev 暴露 /__app-env 供一致性检查 |
| check-auth-invariant.mjs | 校验运行中 dev 与下次构建的 VITE_AUTH_ENABLED 一致 |
| preview.mjs | 管理 8081 预览进程（restart/stop） |
| check-apk.mjs | APK 自检：入口、引用、版本、v2/v3、证书、内容指纹 |
| migrate.mjs | 部署期 SQL 迁移，无 DATABASE_URL 时跳过 |
| migration-plan.mjs | 迁移记账，供 pg 与 PGLite 共用 |
| grok-pwa-plugin.mjs / grok-pwa-shared.mjs | 开发/预览期 PWA head 注入与 manifest |
| browser-smoke.mjs / brand-check.mjs / browser-guard.mjs | 平台浏览器冒烟与品牌门禁（历史既有） |
| preview-thumbnail.mjs | 预览缩略图抓取 |
| license 相关 | 授权码生成在 tools/license-gen.mjs，不在 scripts |

## 四、一次分析的完整数据流

1. `engine.start(source)` 创建 AudioContext，目标 48 kHz；真实麦克风走 getUserMedia，演示模式走 pump-dsp Worklet。
2. capture Worklet 每块回传 samples；meter Worklet 回传 A/C 计权与 Leq 积分值。
3. 主线程把样本写入环形缓冲；每约 0.68 s 取一帧做 8192 点级 FFT（显示谱另有平滑）。
4. 精细谱交给 features 得到谱特征，再交 diagnose 得到 logits。
5. logits 经 softmax、时间平滑、方向滞回，得到 Diagnosis。
6. 同时并行计算：包络谱（轴承阶次）、事件轨（85 ms 片）、轴频（仅 steady 段，每约 1 s）、基线偏离、摆位比值。
7. `applyStatusPriority` 汇总以上上下文，产出唯一标题与优先级。
8. UI 每帧读 Readout 渲染；报告导出时取原始帧，不用插值后的显示值。

## 五、判据参数与修改落点

| 要改什么 | 改哪里 |
| --- | --- |
| 故障方向/概率权重 | diagnose.ts 的 faultLogits |
| 标题优先级顺序 | status-priority.ts 的 applyStatusPriority |
| 削顶/AGC/掉帧阈值 | validity.ts 顶部常量 |
| 基线充分性（帧数/工况档） | fingerprint.ts 的 MIN_BASELINE_FRAMES / MIN_BASELINE_BUCKETS |
| 事件轨片长与 z 门限 | event-rail.ts 的 EVENT_FRAME_SAMPLES / z 相关常量 |
| 轴频搜索范围、SNR 门、3σ | shaft-tracker.ts 顶部常量与 trackShaftFreq |
| 包络带通与轴承阶次 | envelope.ts 的 BEARING_ORDERS 与带通参数 |
| 降噪强度 | denoise.ts |
| A/C 计权 | weighting.ts |
| 报告字段 | report.ts 的 buildReport / buildJson |
| 演示场景 | scenarios.ts |
| 设置项与默认值 | settings.ts |

改判据时必须同步做三件事：

1. 更新 ALGORITHM_VERSION（diagnose.ts），否则新旧基线不可区分。
2. 在 golden.test.ts 或对应测试里加一条能证伪的用例。
3. 若改变阈值含义，在报告里打印实际门限数值，不允许只写结论。

## 六、持久化与数据资产

| localStorage key | 内容 | 丢失后果 |
| --- | --- | --- |
| pump-acoustic-settings-v2 | 全部设置 | 需重新配置泵型/工况 |
| pump-acoustic-presets-v1 | 自定义预设 | 预设丢失 |
| pump-acoustic-baseline-v2 | 正常指纹基线、工况分档、摆位比值、冻结门限 | 需重新建基线，异常分归零 |
| pump-crest-history-v2 | 事件轨历史与门限冻结记录 | 冲击门限需重建 |
| pump-bg-v1 | 背景谱 24 带 | 背景扣除失效，需重采 |
| pump-noise-license-v1 | 授权记录、使用历史 | 需重新输入授权码 |

卸载 APK 会清除应用私有目录，上表全部丢失。同证书覆盖升级不会。

## 七、命令表

| 命令 | 作用 |
| --- | --- |
| npm run dev | 0.0.0.0:8080 开发服务器 |
| npm run build | 构建 + 迁移（无 DATABASE_URL 自动跳过） |
| npm run preview | 预览构建产物 |
| npm run preview:restart | 重启 8081 预览（先杀占用者） |
| npm run preview:stop | 停止 8081 预览 |
| npm run typecheck | TypeScript 全量检查 |
| npm test | scripts 测试 + 音频/认证/数据测试 |
| npm run check:apk -- 路径 | APK 自检 |
| npm run lint | ESLint（当前有历史错误） |
| npm run format | Prettier |

音频测试单独跑：

```bash
node --experimental-strip-types --test src/lib/audio/golden.test.ts src/lib/audio/status-priority.test.ts
```

## 八、代码现状评估

- 优点：算法模块边界清楚，纯函数多，测试可脱离浏览器跑；结论层与采集层解耦；报告字段带不确定度，避免假精确。
- 债务：engine.ts 体量大（采集、调度、状态、降噪、显示都在一个类里），继续加功能前建议先抽「分析调度器」；无 git 历史；lint 未清理；平台 PWA 测试与业务无关但会干扰 npm test 的判读。
- 风险点：所有关键基线都在 localStorage，浏览器清缓存或换机即丢；授权私钥与代码同目录，分发时必须剔除。
