import { useEffect } from "react";
import { useUi, MODULE_ORDER, type ModuleId, type TriState } from "@/store/ui";
import { engine, type Diagnosis } from "@/audio/engine.ts";
import { InstrumentPanel } from "@/components/InstrumentPanel";
import Guide from "@/components/Guide";
import ResultPage from "@/components/ResultPage";
import Settings from "@/components/Settings";

/* ---------- 截图/走查钩子用的合成数据（仅 ?t= 触发，正常入口不触碰） ---------- */

function synthWaveform(): Float32Array {
  const n = 4096;
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / 48000;
    w[i] =
      0.52 * Math.sin(2 * Math.PI * 46.1 * t) +
      0.16 * Math.sin(2 * Math.PI * 92.2 * t + 0.8) +
      0.09 * Math.sin(2 * Math.PI * 138.3 * t + 2.1) +
      0.05 * Math.sin(2 * Math.PI * 431 * t + 0.4) +
      0.028 * Math.sin(2 * Math.PI * 997 * t + 1.2);
  }
  return w;
}

function synthBands(): number[] {
  const centers = [31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500,
    630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000];
  return centers.map((f, i) => {
    let v = -62 + 4 * Math.sin(i * 1.7);
    if (f >= 40 && f <= 63) v += 16;
    if (f >= 80 && f <= 125) v += 6;
    if (f >= 150 && f <= 250) v += 2;
    if (f > 800) v += (i - 14) * 1.3;
    return v;
  });
}

function injectCapture() {
  Object.assign(engine.readout, {
    running: true,
    state: "capturing",
    sampleRate: 48000,
    aDb: -18.4,
    cDb: -15.1,
    zDb: -20.2,
    fast: -18.9,
    elapsed: 12,
    snrDb: 28,
    bands: synthBands(),
    waveform: synthWaveform(),
    bandDb: [-38.2, -41.5, -44.0, -47.3, -50.1, -52.6, -55.9, -58.4],
    quality: { sampleRateOk: true, snr: 28, clip: false, agc: false, status: "ok" },
    micStatus: "ok",
    phase: "steady",
  });
}

function synthDiagnosis(status: TriState): Diagnosis {
  const base = {
    status,
    evidence: {
      spectrum: "1× 轴频 46.1 Hz · 线 SNR 24 dB",
      order: "1× 幅值比 2.4× · 400 Hz 带 +3.1 dB",
      placement: "摆位指纹 4–8k / 1–2k · 0.87 与建档一致",
    },
    excluded: [],
  };
  if (status === "ok") {
    return {
      ...base,
      directions: [
        { id: "cavitation", title: "汽蚀相关机制（家族级，未区分）", note: "" },
        { id: "blockage", title: "高次谐波轻度（2× 1.4 倍，未成族）", note: "" },
      ],
      fixList: [],
      nextStep: "复测：同点同工况再采 30s，1/3oct 差 ≤1.5dB 才可比。",
      severity: "正常",
      severityLabel: "健康",
      anomaly: 0,
      title: "1× 偏高，2× 轻微",
      confidence: 95,
      summary: "本次可判读。1× 相关机制可疑，建议同点同工况复测确认；不下故障结论。",
    };
  }
  if (status === "low") {
    return {
      ...base,
      directions: [
        { id: "cavitation", title: "1× 相关机制（未区分）", note: "无基线，不能判断“变坏”" },
        { id: "wideband_hf", title: "高频宽带（流致 / 汽蚀 / 阀门，未区分）", note: "需补背景声" },
      ],
      fixList: [],
      nextStep: "补证据：降转速 10%，稳定 10s 后采 30s；1× 随转速动→机械，100Hz 不动→电磁。",
      severity: "警告",
      severityLabel: "存疑",
      anomaly: 35,
      title: "1× 偏高，但无基线",
      confidence: 55,
      summary: "证据不足，只能给方向：1× 相对偏高；需补一次基线或降速复测。",
    };
  }
  return {
    ...base,
    evidence: { spectrum: "", order: "", placement: "" },
    directions: [],
    fixList: ["退到 0.50m，降低输入增益", "关闭系统麦克风增强 / AGC", "确认采样率真值 = 48 000 Hz"],
    nextStep: "重采：退到 0.50m，正对泵壳，30s。",
    severity: "危险",
    severityLabel: "无效",
    anomaly: 70,
    title: "削顶：连续 3 点 ≥0.95",
    confidence: 10,
    summary: "本次数据不可用。不作任何方向判断，也不说“已排除”。",
  };
}

/** AC 探针：把关键测量写进 <pre id="probe">，供 headless dump-dom 读取 */
function installProbe() {
  const write = () => {
    const btn = document.querySelector(".primary-btn");
    const sheet = document.querySelector("[data-gsheet]");
    const taps = Array.from(
      document.querySelectorAll<HTMLElement>("button, [role='button'], [role='tab'], [role='checkbox'], [role='radio'], [role='switch']"),
    ).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 12) || el.tagName,
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
    const data = {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      primaryBtn: btn
        ? (() => {
            const r = btn.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.top), bottomGap: Math.round(window.innerHeight - r.bottom) };
          })()
        : null,
      guideSheetRatio: sheet
        ? +(sheet.getBoundingClientRect().height / window.innerHeight).toFixed(3)
        : null,
      modulesVisible: Array.from(document.querySelectorAll("[data-module]")).map(
        (el) => el.getAttribute("data-module"),
      ),
      tapTargets: taps,
    };
    let pre = document.getElementById("probe");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "probe";
      pre.style.display = "none";
      document.body.appendChild(pre);
    }
    pre.textContent = JSON.stringify(data);
  };
  requestAnimationFrame(() => requestAnimationFrame(write));
}

export default function App() {
  const { view, theme, setView, setTheme, setSheet, setModules, replayGuide, showToast } = useUi();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // 验收钩子：?t=guide|idle|capture|result|settings|sheet-mods|sheet-points|guide-done|mods-pick|mark
  // &s=ok|low|invalid&theme=dark&probe=1 —— 仅用于截图/走查，不影响正常交互入口
  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const t = qs.get("t");
    if (qs.get("theme") === "dark") setTheme("dark");
    if (!t) {
      if (qs.get("probe") === "1") installProbe();
      return;
    }
    if (t === "guide") {
      localStorage.removeItem("tzp.guide.v1");
      replayGuide();
    } else if (t === "guide-done") {
      localStorage.setItem("tzp.guide.v1", "1");
      setView("idle");
    } else if (t === "capture") {
      injectCapture();
      setView("capturing");
    } else if (t === "result") {
      const s = (qs.get("s") ?? "ok") as TriState;
      injectCapture();
      engine.readout.state = "ended";
      engine.readout.diagnosis = synthDiagnosis(s);
      setView("result");
    } else if (t === "settings") {
      setView("settings");
    } else if (t === "sheet-mods") {
      setView("idle");
      setSheet("mods");
    } else if (t === "sheet-points") {
      setView("idle");
      setSheet("points");
    } else if (t === "mods-pick") {
      // 与 ModuleSheet 勾选同一条代码路径：满 3 替换最旧，随后「应用」持久化
      const pick = qs.get("pick") as ModuleId | null;
      const cur = useUi.getState().modules;
      if (pick && MODULE_ORDER.includes(pick) && !cur.includes(pick)) {
        const next = cur.length >= 3 ? [...cur.slice(1), pick] : [...cur, pick];
        setModules(next);
        showToast(`已加入「${pick}」并记住`);
      }
      setView("idle");
    }
    if (qs.get("probe") === "1") installProbe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {view === "settings" ? (
        <div style={{ height: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
          <Settings />
        </div>
      ) : view === "result" ? (
        <div style={{ height: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
          <ResultPage />
        </div>
      ) : (
        <InstrumentPanel />
      )}
      {view === "guide" && <Guide />}
    </>
  );
}
