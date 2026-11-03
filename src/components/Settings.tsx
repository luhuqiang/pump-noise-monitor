import { useEffect, useState } from "react";
import { useUi } from "../store/ui";
import { engine } from "../audio/engine.ts";
import { getSetting, setSetting } from "../db/repositories/settings.ts";
import { ALGORITHM_VERSION } from "../audio/diagnose.ts";
import { BackIcon } from "./icons";

type DeviceSettings = {
  pumpType: "centrifugal" | "vortex";
  ratedRpm: number;
  blades: number;
  targetSec: number;
};

const DEFAULTS: DeviceSettings = {
  pumpType: "centrifugal",
  ratedRpm: 2900,
  blades: 6,
  targetSec: 30,
};

/**
 * 设置页：5 组（设备、采集、模型、数据、关于）。
 * 设备参数写入 PGlite 并同步到 engine 配置。
 */
export default function Settings() {
  const { setView, theme, toggleTheme, setGuideDone } = useUi();
  const [dev, setDev] = useState<DeviceSettings>(DEFAULTS);

  useEffect(() => {
    (async () => {
      const pumpType = await getSetting<DeviceSettings["pumpType"]>("pump.type", DEFAULTS.pumpType);
      const ratedRpm = await getSetting<number>("pump.ratedRpm", DEFAULTS.ratedRpm);
      const blades = await getSetting<number>("pump.blades", DEFAULTS.blades);
      const targetSec = await getSetting<number>("capture.targetSec", DEFAULTS.targetSec);
      const cfg = { pumpType, ratedRpm, blades, targetSec };
      setDev(cfg);
      engine.setConfig(cfg);
    })();
  }, []);

  const update = async <K extends keyof DeviceSettings>(key: K, value: DeviceSettings[K]) => {
    const next = { ...dev, [key]: value };
    setDev(next);
    engine.setConfig(next);
    const dbKey =
      key === "pumpType"
        ? "pump.type"
        : key === "ratedRpm"
          ? "pump.ratedRpm"
          : key === "blades"
            ? "pump.blades"
            : "capture.targetSec";
    await setSetting(dbKey, value);
  };

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: `0 var(--page-x)`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--s2)",
          padding: "var(--s3) 0",
          borderBottom: "var(--hair) solid var(--line)",
        }}
      >
        <button className="tap" onClick={() => setView("idle")} aria-label="返回">
          <BackIcon size={20} />
        </button>
        <span style={{ fontSize: "var(--fs-h2)", fontWeight: 500 }}>设置</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "var(--s3) 0" }}>
        {/* 设备 */}
        <Section title="设备">
          <Field label="泵型">
            <select
              value={dev.pumpType}
              onChange={(e) => update("pumpType", e.target.value as DeviceSettings["pumpType"])}
              style={inputStyle}
            >
              <option value="centrifugal">离心泵</option>
              <option value="vortex">旋涡泵</option>
            </select>
          </Field>
          <Field label="额定转速 (r/min)">
            <input
              type="number"
              value={dev.ratedRpm}
              onChange={(e) => update("ratedRpm", Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="叶片数">
            <input
              type="number"
              value={dev.blades}
              onChange={(e) => update("blades", Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
        </Section>

        {/* 采集 */}
        <Section title="采集">
          <Field label="采样率">
            <span className="mono" style={{ color: "var(--mist)" }}>48000 Hz（固定）</span>
          </Field>
          <Field label="目标时长 (s)">
            <input
              type="number"
              value={dev.targetSec}
              onChange={(e) => update("targetSec", Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
        </Section>

        {/* 模型 */}
        <Section title="模型">
          <Field label="算法版本">
            <span className="mono" style={{ color: "var(--mist)" }}>{ALGORITHM_VERSION}</span>
          </Field>
        </Section>

        {/* 关于 */}
        <Section title="关于">
          <Field label="版本">
            <span className="mono">v1.4 (Build 5)</span>
          </Field>
          <Field label="联系">
            <span style={{ color: "var(--mist)" }}>luhuqiang@foxmail.com</span>
          </Field>
          <button
            onClick={() => {
              localStorage.removeItem("tzp.guide.v1");
              setGuideDone();
            }}
            style={rowBtnStyle}
          >
            重看引导
          </button>
          <button onClick={toggleTheme} style={rowBtnStyle}>
            {theme === "light" ? "切换深色" : "切换浅色"}
          </button>
        </Section>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "50%",
  textAlign: "right",
  fontSize: "var(--fs-sm)",
  fontFamily: "ui-monospace, monospace",
  border: "none",
  background: "transparent",
  color: "var(--ink)",
  outline: "none",
};

const rowBtnStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "var(--s3) var(--s4)",
  borderBottom: "var(--hair) solid var(--line)",
  fontSize: "var(--fs-body)",
  background: "transparent",
  color: "var(--ink)",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "var(--s4)" }}>
      <div style={sectionTitleStyle}>{title}</div>
      <div className="panel">{children}</div>
    </div>
  );
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "var(--fs-h2)",
  fontWeight: 500,
  marginBottom: "var(--s2)",
  color: "var(--mist)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "var(--s3) var(--s4)",
        borderBottom: "var(--hair) solid var(--line)",
        fontSize: "var(--fs-sm)",
      }}
    >
      <span style={{ color: "var(--ink)" }}>{label}</span>
      {children}
    </div>
  );
}
