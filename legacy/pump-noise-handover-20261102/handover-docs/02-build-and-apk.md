# 泵噪监测台 · 构建、打包与签名（APK）

## 一、前置工具

| 工具 | 版本 / 路径 | 用途 |
| --- | --- | --- |
| Node.js | 22 LTS 或 24.x（沙箱 24.1.0） | 构建与测试 |
| npm | 11.x（随 Node） | 依赖安装 |
| Java | JRE 17 及以上 | apktool / apksigner |
| unzip | 系统自带 | check-apk 读取包内容 |
| apktool | 2.9.3，/workspace/.apkwork/tools/apktool/apktool.jar | 反编译/回编译 APK |
| Android build-tools | android-14 目录，aapt2 2.19，apksigner 0.9 | 对齐、签名、版本核对 |
| zipalign | /workspace/.apkwork/tools/android-14/zipalign | 4 字节对齐 |

本地电脑若已装 Android SDK，可直接用 `$ANDROID_HOME/build-tools/<版本>/` 下的 aapt2、zipalign、apksigner，不必拷贝沙箱工具。check-apk 会依次查找环境变量 AAPT2/APKSIGNER、/workspace/.apkwork/tools/android-14、/workspace/android/tools。

## 二、网页端构建

```bash
cd <项目根目录>
npm ci
npm run typecheck
npm run build
```

要点：

1. `npm run build` 实际执行 `vite build` 后再跑 `npm run db:migrate`。
2. 没有 DATABASE_URL 时 migrate 打印 skipped 并退出 0，这是正常行为，不会失败。
3. 产物在 .vercel/output/static，包含 assets、__grok、favicon.svg、og.jpg，但没有 index.html。
4. 没有 index.html 是设计使然：首页由 TanStack Start SSR 在请求时生成。直接拷贝 static 目录进 APK 会白屏，必须从预览抓真实首屏。
5. 构建前确保 .grok/app-env.json 存在；当前内容为 VITE_AUTH_ENABLED=false，deploy.database=false。

预览（用于抓 index.html 与 manifest）：

```bash
npm run preview:restart
curl -s http://127.0.0.1:8081/ -o /tmp/index.html
curl -s http://127.0.0.1:8081/__grok/manifest.webmanifest -o /tmp/manifest.webmanifest
```

scripts/preview.mjs 会先杀掉 8081 的占用进程再启动，避免端口冲突和「预览还是上一版」的假象。

## 三、APK 结构说明

APK 不是 Capacitor/Cordova，而是一个极简 WebView 壳：

- AndroidManifest.xml：minSdk 24、targetSdk 35，权限 RECORD_AUDIO、MODIFY_AUDIO_SETTINGS、CAMERA。
- MainActivity：注册 NativeBridge（提供 getMachineCode、shareText），启用 WebView。
- 加载地址固定为 `https://appassets.local/`，由 shouldInterceptRequest 映射到 assets/www：
  - `/` → `www/index.html`
  - `/assets/...` → `www/assets/...`
  - `/__grok/...` → `www/__grok/...`
  - 其它路径 → `www` + path
- 因此 index.html 里的绝对路径 `/assets/...` 能正常解析，这是壳的设计，不是 bug。
- 前端资源全部在 assets/www；class.dex 只有约 9 KB，不含业务逻辑。

index.html 还引用了 `https://grok.com/grok-app-builder/extensions.js`（defer）。离线时该脚本加载失败不影响主界面，但会在控制台留一条网络错误。若要完全离线，可在打包前移除该 script 标签，属于可选项。

## 四、从零打一个 APK

以下命令以 Build 5 为例。把 N 换成实际 build 号。

```bash
# 0) 变量
export APP=/workspace/pump-noise-monitor
export WORK=/workspace/.apkwork
export APK=$WORK/monitor
export BT=$WORK/tools/android-14

# 1) 构建前端
cd $APP
npm run build

# 2) 清空旧前端资源，避免残留旧 hash 文件
rm -rf $APK/assets/www
mkdir -p $APK/assets/www

# 3) 拷静态资源（不含 index.html）
cp -a $APP/.vercel/output/static/. $APK/assets/www/

# 4) 抓 SSR 首屏与 manifest
npm run preview:restart
curl -sf http://127.0.0.1:8081/ -o $APK/assets/www/index.html
mkdir -p $APK/assets/www/__grok
curl -sf http://127.0.0.1:8081/__grok/manifest.webmanifest -o $APK/assets/www/__grok/manifest.webmanifest

# 5) 改版本号（apktool.yml 的 versionInfo）
#    versionCode: '5'
#    versionName: '1.4'
#    同时改 apkFileName 如需

# 6) 回编译
java -jar $WORK/tools/apktool/apktool.jar b $APK -o $WORK/build5-unaligned.apk

# 7) 4 字节对齐
$BT/zipalign -f 4 $WORK/build5-unaligned.apk $WORK/build5-aligned.apk

# 8) 签名（v1 关闭，v2/v3 开启）
$BT/apksigner sign \
  --ks /workspace/android/pump-release.jks \
  --ks-key-alias pump \
  --ks-pass pass:pumpnoise2026 \
  --key-pass pass:pumpnoise2026 \
  --v1-signing-enabled false \
  --v2-signing-enabled true \
  --v3-signing-enabled true \
  --out $WORK/build5-signed.apk \
  $WORK/build5-aligned.apk

# 9) 自检
cd $APP
npm run check:apk -- $WORK/build5-signed.apk

# 10) 发布命名
cp $WORK/build5-signed.apk /workspace/泵噪监测台.apk
```

注意：

- 第 3 步必须用 `cp -a .../.` 保留目录结构；不要漏掉 `__grok/install` 与 `icon-180.png`。
- 第 4 步的 index.html 必须是 8081 实时返回的，不能复用上一版。
- 每次构建前先 `rm -rf assets/www`；否则 assets 目录会累积多个 hash 版本，包体越来越大。
- apktool 回编译使用 apktool.yml 的 doNotCompress 列表，index.html/dex/arsc 不压缩，属于预期。

## 五、版本号规则

| 位置 | 字段 | 规则 |
| --- | --- | --- |
| .apkwork/monitor/apktool.yml | versionInfo.versionCode | 每次发布 +1，整数，不允许回退 |
| 同上 | versionInfo.versionName | 语义版本，如 1.3 → 1.4 |
| src/lib/audio/diagnose.ts | ALGORITHM_VERSION | 判据/算法变更时更新，如 v1.0-2026.11 |
| 发布说明 | Build 号 + APK SHA-256 + 证书 SHA-256 | 四元组必须与包对应 |

versionCode 只能递增。降级安装会被 Android 拒绝；同一 versionCode 重签可以覆盖安装，但发布记录会混乱，不建议。

## 六、签名与覆盖升级

| 事实 | 值 |
| --- | --- |
| keystore | /workspace/android/pump-release.jks |
| 类型 | PKCS12 |
| 别名 | pump |
| storepass | pumpnoise2026 |
| keypass | pumpnoise2026 |
| 证书 SHA-256 | 4fdb4a8a58ff3e29a97595859e6752baa71bb2c6e5b72131220152f100fd0a1f |
| 证书 SHA-1 | CE:4D:91:52:6A:F7:2A:B5:EB:EF:08:EB:84:7A:2B:A5:2A:4D:9D:F0 |
| 密钥算法 | RSA 2048 / SHA384withRSA |
| 有效期 | 2026-10-31 至 2054-03-18 |

Build 3 与 Build 4 使用同一张证书，所以可以直接覆盖升级，应用私有数据（基线、事件历史、设置、授权）保留。只有换证书才必须卸载；换证书还会导致老用户无法覆盖安装。

签名命令中 `--v1-signing-enabled false` 是有意为之：minSdk 24（Android 7.0）已经支持 v2，v1 只会增大包体并留下 Janus 类攻击面。不要为了兼容 Android 5/6 打开 v1，那会把 minSdk 往下调，超出当前支持范围。

验证签名：

```bash
$BT/apksigner verify -v --print-certs /workspace/泵噪监测台.apk
```

## 七、check:apk 自检覆盖范围

`npm run check:apk -- <apk 路径>` 输出 JSON，退出码 0 表示通过。检查项：

1. assets/www/index.html 是否存在。
2. assets/www/assets 下是否有 index-*.js 与 *.css。
3. __grok/manifest.webmanifest 是否存在。
4. index.html 里引用的 assets 是否在包内真实存在（brokenRefs 必须为空）。
5. aapt2 badging 读取 package、versionCode、versionName。
6. apksigner 验证 v1/v2/v3 与证书 SHA-256。
7. 计算整包 SHA-256 与 index+js+css 的内容指纹 contentSha256。

Build 4 实测输出（可用于对照）：

```json
{
  "ok": true,
  "size": 599601,
  "sha256": "4780e7b8cdb0ca1c426b61a5307aec0e816eafe518569c180edc54314f5b0348",
  "build": {
    "package": "com.luhuqiang.pumpnoise",
    "versionCode": 4,
    "versionName": "1.3",
    "contentSha256": "89b35f68457e82c2d050e917a7dd774e9dd97b0df5b0a9576f6d8b81585d9c8f"
  },
  "entries": {
    "index": true,
    "js": ["assets/www/assets/index-C4kuLIni.js"],
    "css": ["assets/www/assets/styles-G2O6abtE.css"],
    "manifest": true,
    "brokenRefs": []
  },
  "signature": {
    "schemes": { "v1": false, "v2": true, "v3": true },
    "certSha256": "4fdb4a8a58ff3e29a97595859e6752baa71bb2c6e5b72131220152f100fd0a1f",
    "error": null
  }
}
```

check:apk 尚未覆盖的两项（已知缺口）：

- 没有 assets 清单与上一版构建的 diff。
- 没有 WebView 首屏加载后的 JS 错误冒烟。

补这两项属于路线图 P1 的第 5 条。

## 八、常见故障排查

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 安装后白屏 / ERR_CACHE_MISS | index.html 没进包，或引用的 js/css 不存在 | 看 check:apk 的 index 与 brokenRefs；重抓 8081 首屏 |
| 改了代码但界面没变 | 复用了旧 index.html 或旧 assets | rm -rf assets/www 后重新拷贝；`npm run preview:restart` |
| 覆盖安装失败 INSTALL_FAILED_UPDATE_INCOMPATIBLE | 证书换了，或版本号回退 | 用同一 keystore；确认 versionCode 递增 |
| 安装包无法安装（解析失败） | 未 zipalign 或签名损坏 | 重新 zipalign + apksigner，再 check:apk |
| 8081 起不来 | 上一轮预览进程残留 | `npm run preview:restart` 会自动杀占用者 |
| 构建后 static 里没有 index.html | 正常，SSR 运行时生成 | 从 8081 抓，不要直接拷 static |
| apksigner 报 Java 警告 | JDK 新版对 native access 警告 | 警告不影响签名；可用 JDK 17 消除 |

## 九、发布事实卡模板

每次发版复制下面模板，填完再发：

```text
版本：Build N / vX.Y
包名：com.luhuqiang.pumpnoise
APK SHA-256：<整包 sha256>
内容指纹：<contentSha256>
证书 SHA-256：4fdb4a8a58ff3e29a97595859e6752baa71bb2c6e5b72131220152f100fd0a1f
签名：v2=true v3=true（同证书，可覆盖升级）
自检：check:apk ok=true
构建时间：<ISO 时间>
代码状态：<git commit 或「无 git，以目录快照为准」>
变更摘要：<本版改了什么>
未验证项：<真机项、浏览器冒烟等>
```

## 十、当前工作区残留

- /workspace/.apkwork/build4-unaligned.apk、build4-aligned.apk、build4-signed.apk 是 Build 4 的中间产物。
- /workspace/.apkwork/pump-v1.2-build3.apk 是上一版备份，不要删。
- /workspace/.apkwork/monitor 是 apktool 工作目录，保留可用于下一次回编译。
- /workspace/.apkwork/index.html 是抓取的首屏副本，可作为格式参考，但重新打包必须重新抓。
- 8081 预览进程可能仍在运行，迁移到本地后无意义，可忽略或停掉。
