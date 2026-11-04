#!/usr/bin/env node
// 授权码生成工具（作者本机使用，不随 APP 分发）
// 用法：
//   node tools/license-gen.mjs keygen
//   node tools/license-gen.mjs sign <机器码> <7|30|365|3650>
//   node tools/license-gen.mjs verify <机器码> <授权码>
import fs from "node:fs";
import path from "node:path";
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";

const DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "license");
const PRIVATE = path.join(DIR, "private.pem");
const PUBLIC = path.join(DIR, "public.pem");

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function keygen() {
  fs.mkdirSync(DIR, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  fs.writeFileSync(PRIVATE, privateKey.export({ type: "pkcs8", format: "pem" }));
  fs.writeFileSync(PUBLIC, publicKey.export({ type: "spki", format: "pem" }));
  console.log("私钥:", PRIVATE);
  console.log("公钥:", PUBLIC);
  console.log("APP 内嵌 JWK:");
  console.log(JSON.stringify(publicKey.export({ format: "jwk" })));
}

function signCode(machine, days) {
  const mid = String(machine).trim().toUpperCase().replace(/[^0-9A-F]/g, "");
  if (mid.length !== 16) {
    throw new Error(`机器码应为 16 位十六进制，收到: ${machine}`);
  }
  const d = Number(days);
  if (![7, 30, 365, 3650].includes(d)) {
    throw new Error("时长仅支持 7 / 30 / 365 / 3650 天");
  }
  const issued = Math.floor(Date.now() / 1000);
  const payload = `PN1|${mid}|${d}|${issued}`;
  const sig = sign("sha256", Buffer.from(payload, "utf8"), {
    key: createPrivateKey(fs.readFileSync(PRIVATE)),
    dsaEncoding: "ieee-p1363",
  });
  return `${b64url(payload)}.${b64url(sig)}`;
}

function verifyCode(machine, code) {
  const mid = String(machine).trim().toUpperCase().replace(/[^0-9A-F]/g, "");
  const [p, s] = String(code).trim().split(".");
  const payload = Buffer.from(p, "base64url").toString("utf8");
  const ok = verify(
    "sha256",
    Buffer.from(payload, "utf8"),
    { key: createPublicKey(fs.readFileSync(PUBLIC)), dsaEncoding: "ieee-p1363" },
    Buffer.from(s, "base64url"),
  );
  console.log("签名:", ok ? "有效" : "无效");
  console.log("内容:", payload);
  console.log("机器码匹配:", payload.split("|")[1] === mid);
}

const [cmd, a, b] = process.argv.slice(2);
try {
  if (cmd === "keygen") keygen();
  else if (cmd === "sign") console.log(signCode(a, b));
  else if (cmd === "verify") verifyCode(a, b);
  else console.log("用法: keygen | sign <机器码> <天数> | verify <机器码> <授权码>");
} catch (err) {
  console.error("失败:", err.message);
  process.exit(1);
}
