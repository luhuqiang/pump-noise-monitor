/**
 * S2 截图与测量驱动（CDP over Edge headless）。
 * 用法：node evidence/step-2/tools/shoot.mjs
 * 产出：evidence/step-2/screenshots/P*.png、AC-*.png；evidence/step-2/probes/*.json
 * 机制：http 静态服务(dist) + Edge headless CDP；页面为 dist 真实构建产物，状态由 ?t= 钩子驱动。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = path.join(ROOT, "evidence", "step-2");
const SHOTS = path.join(OUT, "screenshots");
const PROBES = path.join(OUT, "probes");
const PORT_HTTP = 8765;
const PORT_CDP = 9223;

fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(PROBES, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHttp(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {}
    await sleep(250);
  }
  throw new Error("timeout waiting " + url);
}

/* ---------- 探针：与 App.tsx 内 installProbe 同口径（外部 CDP 测量，非自证） ---------- */
const PROBE_EXPR = `(() => {
  const btn = document.querySelector(".primary-btn");
  const sheet = document.querySelector("[data-gsheet]");
  const taps = Array.from(document.querySelectorAll("button, [role='button'], [role='tab'], [role='checkbox'], [role='radio'], [role='switch']")).map((el) => {
    const r = el.getBoundingClientRect();
    return { label: (el.getAttribute("aria-label") || (el.textContent||"").trim().slice(0,10) || el.tagName), w: Math.round(r.width), h: Math.round(r.height) };
  });
  return JSON.stringify({
    readyState: document.readyState,
    rootChildren: document.getElementById("root")?.childElementCount ?? -1,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    bodyTextLen: (document.body.innerText || "").length,
    primaryBtn: btn ? (() => { const r = btn.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.top), bottomGap: Math.round(window.innerHeight - r.bottom) }; })() : null,
    guideSheetRatio: sheet ? +(sheet.getBoundingClientRect().height / window.innerHeight).toFixed(3) : null,
    guideBtnVisible: sheet ? (() => { const b = Array.from(sheet.querySelectorAll("button")).map(x => { const r = x.getBoundingClientRect(); return { t: (x.textContent||"").trim(), w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.top) }; }); return b; })() : null,
    modulesVisible: Array.from(document.querySelectorAll("[data-module]")).map((el) => el.getAttribute("data-module")),
    tapTargets: taps,
    theme: document.documentElement.getAttribute("data-theme"),
    storage: { guide: localStorage.getItem("tzp.guide.v1"), modules: localStorage.getItem("tzp.modules.v1") },
  });
})()`;

/* ---------- CDP 客户端 ---------- */
let msgId = 0;
const pending = new Map();
let ws;

function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
}

async function main() {
  // 1) 静态服务
  const srv = spawn("python", ["-m", "http.server", String(PORT_HTTP), "--bind", "127.0.0.1"], {
    cwd: path.join(ROOT, "dist"),
    stdio: "ignore",
  });
  await waitHttp(`http://127.0.0.1:${PORT_HTTP}/index.html`);

  // 2) Edge headless + CDP（每轮全新 profile，避免 localStorage 串场）
  const profile = path.join(OUT, "tmp-cdp-profile");
  fs.rmSync(profile, { recursive: true, force: true });
  const edge = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-sync", "--disable-background-networking",
    `--remote-debugging-port=${PORT_CDP}`,
    `--user-data-dir=${profile}`,
    "--window-size=390,844",
    "about:blank",
  ], { stdio: "ignore" });

  try {
    await waitHttp(`http://127.0.0.1:${PORT_CDP}/json/version`);
    const targets = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json`)).json();
    const page = targets.find((t) => t.type === "page");
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id);
        pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      }
    };

    // 视口 390×844 dpr2（与 AC 口径一致）
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

    const shoot = async (name, query, { probe = true, settle = 1400 } = {}) => {
      await send("Page.navigate", { url: `http://127.0.0.1:${PORT_HTTP}/index.html${query ? "?" + query : ""}` });
      await sleep(settle);
      let data = null;
      if (probe) {
        const r = await send("Runtime.evaluate", { expression: PROBE_EXPR, returnByValue: true });
        data = JSON.parse(r.result.value ?? "{}");
        fs.writeFileSync(path.join(PROBES, `${name}.json`), JSON.stringify(data, null, 2));
      }
      const shot = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(shot.data, "base64"));
      console.log(`${name}: root=${data?.rootChildren} textLen=${data?.bodyTextLen} scrollW=${data?.scrollWidth} btn=${data?.primaryBtn ? data.primaryBtn.h + "@" + data.primaryBtn.bottomGap : "-"} sheet=${data?.guideSheetRatio ?? "-"}`);
      return data;
    };

    // P0–P8
    await shoot("P0", "t=guide");
    await shoot("P1", "t=guide-done");
    await shoot("P2", "t=capture");
    await shoot("P3", "t=result&s=ok");
    await shoot("P4", "t=result&s=low");
    await shoot("P5", "t=result&s=invalid");
    await shoot("P6", "t=settings");
    await shoot("P7", "t=sheet-mods");
    await shoot("P8", "t=sheet-points");

    // AC-23：深色对等（同探针口径对比布局）
    await shoot("AC-23-dark-idle", "t=guide-done&theme=dark");
    await shoot("AC-23-dark-result", "t=result&s=ok&theme=dark");

    // AC-04：同 profile 连续导航 —— 完成后重进不再出现引导
    await shoot("AC-04-a-first", "t=guide&theme=light");            // 首启出现
    await send("Page.navigate", { url: `http://127.0.0.1:${PORT_HTTP}/index.html?t=guide-done&theme=light` }); // 模拟完成
    await sleep(900);
    await shoot("AC-04-c-revisit", "theme=light");                  // 重进：应无引导 sheet

    // AC-07：满 3 加第 4 个 → 替换最旧；刷新保持
    await shoot("AC-07-a-pick", "t=mods-pick&pick=order&theme=light");
    await shoot("AC-07-c-reload", "theme=light");                   // 普通重载，应保持 spectrum/quality/order
  } finally {
    edge.kill();
    srv.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
