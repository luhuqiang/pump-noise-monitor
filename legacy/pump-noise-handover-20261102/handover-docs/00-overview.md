# 泵噪监测台 · 交接总览（先读我）

交接日期：2026-11-02
交接对象：本地电脑接手人
当前交付件：Build 4 / versionName 1.3（内测包，已在飞书同步）
代码位置：/workspace/pump-noise-monitor

## 一、这个项目是什么

泵噪监测台是一个「手机麦克风 + 浏览器」的泵类设备声学监测工具：采集现场噪声，做 A/C 计权与第三倍频程分析，给出「偏离程度、频带证据、可能方向」三件事，不直接命名具体故障。支持演示声源与真实麦克风两种模式，支持正常指纹基线、包络谱/轴承阶次、冲击事件轨、轴频跟踪与报告导出。

交付形态有两种：

1. 网页端：TanStack Start SSR + Vite 构建，可在浏览器直接打开，也可作为嵌入式预览。
2. 安卓 APK：把同一份前端资源装进 WebView 壳，包名 com.luhuqiang.pumpnoise，用于现场离线使用。

## 二、交付件事实卡（唯一事实来源）

| 项目 | 值 |
| --- | --- |
| APK 路径 | /workspace/泵噪监测台.apk |
| 备份路径 | /workspace/.apkwork/build4-signed.apk |
| 包名 | com.luhuqiang.pumpnoise |
| versionCode | 4 |
| versionName | 1.3 |
| 文件大小 | 599601 字节（约 585.5 KB） |
| APK SHA-256 | 4780e7b8cdb0ca1c426b61a5307aec0e816eafe518569c180edc54314f5b0348 |
| 内容指纹 contentSha256 | 89b35f68457e82c2d050e917a7dd774e9dd97b0df5b0a9576f6d8b81585d9c8f |
| 签名方案 | v1=false，v2=true，v3=true |
| 证书 SHA-256 | 4fdb4a8a58ff3e29a97595859e6752baa71bb2c6e5b72131220152f100fd0a1f |
| minSdk / targetSdk | 24 / 35 |
| 自检结果 | check:apk 通过（index / js / css / manifest / brokenRefs / 版本 / v2+v3 全绿） |

同证书、v2/v3 均有效，可直接覆盖升级，不需要卸载。卸载会清掉应用私有数据（基线、事件轨历史、设置），现场会被误判成「数据丢了」。

上一版备份：/workspace/.apkwork/pump-v1.2-build3.apk（Build 3 / v1.2，575219 字节）。

## 三、五分钟跑起来

```bash
cd /workspace/pump-noise-monitor
npm ci
npm run typecheck
npm run dev
# 浏览器打开 http://127.0.0.1:8080
```

如果只想拉起已配置好的沙箱服务：

```bash
sh /workspace/startup.sh
```

该脚本会先停掉 8081 预览进程，若 8080 已在监听则直接退出，否则用 setsid 后台启动 `npm run dev`，日志写到 /tmp/app-startup.log。

构建与预览：

```bash
npm run build          # 产物在 .vercel/output/static
npm run preview:restart  # 预览 127.0.0.1:8081，用于抓 SSR 首屏
```

## 四、迁移到本地电脑的清单

按顺序做，不要跳步：

1. 拷贝代码：复制 /workspace/pump-noise-monitor，排除 node_modules、.vercel、.tanstack、.tmp-check.mjs 等生成物。
2. 安装 Node：建议 Node 22 LTS 或 24.x（沙箱实测 24.1.0）。项目未写 engines 字段，Node 18 以下不要用。
3. 安装依赖：在项目根目录执行 `npm ci`。必须保留 package-lock.json，不要用 `npm install` 改写锁文件。
4. 拷贝敏感文件：/workspace/android/pump-release.jks 与 /workspace/pump-noise-monitor/license/（private.pem、public.pem）。见《04 密钥与敏感文件交底》。
5. 拷贝打包工具：/workspace/.apkwork/tools/ 下有 apktool 2.9.3 与 android-14 build-tools（aapt2、zipalign、apksigner）。本地若已装 Android SDK，可直接用 SDK 里的同名工具，不必拷贝。
6. 拷贝 APK 工作区：/workspace/.apkwork/monitor/ 是 apktool 反编译目录，含 AndroidManifest.xml、assets/www、apktool.yml。第一次本地打包建议以它为模板。
7. 建版本库：当前目录不是 git 仓库，只有 .github_repo 写着 luhuqiang/pump-noise-monitor。接手后第一件事是 `git init` 并首提交，否则后续无法追溯「哪个包对应哪次改动」。
8. 跑验收：typecheck、音频测试、build、check:apk 四条命令全过，再开始改代码。

本地不需要的东西：

- 不需要数据库。默认无 DATABASE_URL 时走 PGLite（WASM），构建时 migrate 会打印跳过。
- 不需要飞书凭证。飞书只用于文档协作，不参与应用运行。
- 不需要 Playwright Chromium 才能打包 APK；只有浏览器冒烟测试需要。

## 五、目录速查

| 路径 | 作用 |
| --- | --- |
| src/routes/ | 只有 __root.tsx 与 index.tsx，单页入口 |
| src/components/ | 仪表盘 UI：instrument、clean-spectrum、result-card、diagnosis-card 等 |
| src/lib/audio/ | 全部声学算法：采集、FFT、计权、诊断、基线、事件轨、轴频、包络 |
| src/lib/settings.ts | zustand 设置与预设持久化 |
| src/lib/license.ts | ES256 授权码校验与机器码 |
| src/lib/report.ts | 文本报告 / 摘要 / JSON 导出 |
| scripts/ | 构建包装、预览、PWA 注入、APK 自检、迁移 |
| license/ | 授权码签名密钥对（私钥敏感） |
| tools/license-gen.mjs | 本机授权码生成/校验工具，不分发 |
| .grok/app-env.json | 构建期 VITE_ 变量：VITE_AUTH_ENABLED=false |
| .apkwork/ | 打包工作区与工具（不在项目仓库内） |
| /workspace/android/ | 安卓签名 keystore |

## 六、交接验收清单

接手人完成以下项后，才算真正接住：

☐ `npm ci` 成功，无 lockfile 冲突。
☐ `npm run typecheck` 零错误。
☐ `node --experimental-strip-types --test src/lib/audio/*.test.ts` 全部通过（当前 30 项）。
☐ `npm run build` 成功，.vercel/output/static 有 assets 与 __grok。
☐ `npm run preview:restart` 后 127.0.0.1:8081 能打开首页且无 JS 报错。
☐ `npm run check:apk -- /workspace/泵噪监测台.apk` 输出 ok=true。
☐ 用同一 keystore 重签一个测试包，能覆盖安装到 Build 4 之上且数据保留。
☐ 授权码工具 `node tools/license-gen.mjs verify <机器码> <授权码>` 可验证现有码。

## 七、已知限制与红项

这些不是本轮改动引入的，但会影响接手判断，务必先知道：

1. `npm test` 中 scripts 下的平台 PWA 测试有 7 条失败（grok-pwa 注入相关），属历史既有，和泵噪业务无关。音频测试单独跑是全绿的。
2. `npm run lint` 有历史错误未清理，当前不作为门禁。
3. Playwright 的 Chromium 未安装（用户此前拒绝 `npx playwright install`），因此浏览器冒烟测试没有跑过。UI 改动目前靠 typecheck + 构建 + 手动打开验证。
4. 没有 git 历史，无法知道每个算法版本对应哪次提交。建议立即初始化仓库并把当前状态作为基线提交。
5. `.vercel/output/static` 里没有 index.html，首屏由 SSR 运行时生成。打包 APK 时必须从 8081 预览抓 index.html，不能直接拷 static 目录了事。
6. APK 关闭了 v1 签名，Android 7.0 以下无法安装；minSdk 24 也正好卡在 7.0，属于预期行为。
7. 授权码私钥在项目目录里，任何拿到代码的人都可签发授权。交付时务必按敏感文件处理。
8. 真机六项回归（44.1 kHz、48 kHz、削顶、掉帧、麦克风切走、AGC）尚未在真机执行，目前只有单元测试与代码路径覆盖。

## 八、文档地图

- 《01 源码结构与技术栈》：代码怎么组织、数据怎么流、改判据改哪里。
- 《02 构建、打包与签名（APK）》：从 npm build 到可安装 APK 的完整命令。
- 《03 路线图与未完成项（Build 4 之后）》：P0/P1/P2 事实状态与验收标准。
- 《04 密钥与敏感文件交底》：keystore、授权密钥、证书指纹、备份与泄露处置。

## 九、接手后第一周建议

1. 先补齐 git 基线，再动代码。
2. 先做「发布事实卡」自动化：把 check:apk 的 JSON 直接贴进每次发布说明，解决包体不可追溯。
3. 真机六项回归优先于新功能，尤其是 44.1 kHz 与削顶，这两项会直接让结论变成 invalid。
4. 基线导出/导入是覆盖升级的数据保命符，优先级应高于任何界面美化。
