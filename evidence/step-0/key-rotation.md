# 密钥轮换步骤（D-10）· **未执行**

> 依据：`推进计划.md` §10.2。本文件**只写步骤与判据，不执行**；执行需技术负责人单独排期。
> 风险提示：改口令**不换证书**，签名链保持；`private.pem` 用于授权签名，v2.0 不做授权门，但仍需保留；
> 误删 JKS 不可恢复；共享目录历史版本可能仍含旧包，需确认权限与回收站；
> 轮换后旧口令仍可能存在于终端历史 / CI 日志，需清理。

| 步 | 操作 | 判据 |
|---|---|---|
| 1 | 离线备份现有 `stethoscope-keys/`（两份不同介质），记录 `pump-release.jks` SHA-256 | 两份备份 SHA 一致 |
| 2 | 用 `keytool -storepasswd` 改 storepass；PKCS12 用 `-keypasswd` 改 keypass（JKS 需同时改） | `keytool -list` 用新口令可读 |
| 3 | 更新本地环境变量/CI secret（`KEYSTORE_PASS`、`KEY_PASS`），删除旧明文 | `Select-String -Path scripts\*.mjs -Pattern "<旧口令>"` 0 命中 |
| 4 | 用新口令打包 `听诊仪-密钥包-<新日期>.zip`，AES-256 加密 | 解压校验 4 文件齐全 |
| 5 | 从飞书共享文件夹移除旧密钥包（先确认新包可用） | 共享目录仅新包 |
| 6 | 回归：`npm run apk` + `check:apk`，证书 SHA 与 1.4 基线一致 | 签名 v2/v3 true、证书 SHA 相同 |

状态：**未执行**（S0 仅立项）。当前构建仍使用 `stethoscope-keys/听诊仪-密钥包-20261103/` 内 JKS；
证书基线 SHA-256 见 `cert-sha256.txt`（由本步脚本从实签 APK 写入）。
