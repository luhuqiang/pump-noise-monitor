泵噪监测台 · 交接包（2026-11-02）
=====================================

这是一个单文件交接包，包含源码、构建与打包工具、签名密钥、APK 和交接文档。

内容结构
--------

pump-noise-handover-20261102/
  app/                      完整项目源码（已排除 node_modules、.vercel、.tanstack）
    src/                    前端与声学算法
    scripts/                构建、预览、PWA、APK 自检脚本
    license/                ES256 授权密钥对（private.pem 敏感）
    public/                 图标、og 图、PWA 资源
    package.json / package-lock.json / tsconfig / vite.config.ts 等
  android/
    pump-release.jks        APK 签名密钥库（极敏感）
    pumpnoise-build4-v1.3.apk   当前交付包
    pumpnoise-build3-v1.2.apk   上一版备份
  apkwork/
    monitor/                apktool 工作目录（AndroidManifest、smali、assets/www、apktool.yml）
    tools/
      apktool.jar           apktool 2.9.3
      aapt2 zipalign apksigner   最小可用签名/对齐工具
      lib/apksigner.jar
      lib64/libc++.so, libconscrypt_openjdk_jni.so
  handover-docs/            00–04 交接文档的 Markdown 副本
  startup-workspace.sh      沙箱启动脚本，本地可参考

快速开始
--------

1. 安装 Node.js 22 LTS 或 24.x、JDK 17、unzip。
2. 进入 app/，执行：

   npm ci
   npm run typecheck
   npm run dev          # http://127.0.0.1:8080

3. 构建与预览：

   npm run build        # 产物 .vercel/output/static（无 index.html，SSR 生成）
   npm run preview:restart   # 127.0.0.1:8081

4. 打包 APK：见 handover-docs/02-build-and-apk.md。
   apkwork/tools 里的路径需要按本地实际位置改写；也可直接用 Android SDK 的 build-tools。

5. 自检：

   npm run check:apk -- /path/to/xxx.apk

当前交付事实
------------

版本：Build 4 / versionName 1.3 / versionCode 4
包名：com.luhuqiang.pumpnoise
APK SHA-256：4780e7b8cdb0ca1c426b61a5307aec0e816eafe518569c180edc54314f5b0348
内容指纹：89b35f68457e82c2d050e917a7dd774e9dd97b0df5b0a9576f6d8b81585d9c8f
证书 SHA-256：4fdb4a8a58ff3e29a97595859e6752baa71bb2c6e5b72131220152f100fd0a1f
签名：v1=false，v2=true，v3=true（同证书，可直接覆盖升级，勿卸载）
自检：check:apk ok=true

签名口令见 handover-docs/04-secrets.md，或直接查看 android/pump-release.jks 的配套说明。
授权私钥在 app/license/private.pem；不要提交到 git、不要打进任何分发包。

已知限制
--------

- 项目目录没有 .git，无提交历史；接手后建议先 git init 并提交当前快照。
- npm test 中 scripts 下的平台 PWA 测试有 7 条历史失败，与业务算法无关。
- npm run lint 有历史错误，当前不作为发布门禁。
- Playwright Chromium 未安装，浏览器冒烟未执行；真机六项回归未执行。
- .vercel/output/static 不含 index.html，打包 APK 必须从 8081 预览抓首屏。
- APK 关闭 v1 签名；minSdk 24（Android 7.0）以下无法安装。

安全警告
--------

本包包含 APK 签名密钥库和授权码私钥，属于高敏感材料。
请通过加密通道传输，落地后 chmod 600，至少做三份离线备份。
不要上传到公开仓库、网盘公开链接或聊天群。详见 handover-docs/04-secrets.md。

文档索引
--------

00 交接总览（先读我）
01 源码结构与技术栈
02 构建、打包与签名（APK）
03 路线图与未完成项（Build 4 之后）
04 密钥与敏感文件交底（限内部）
