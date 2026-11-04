/** 质量灯模块 —— 4 指标 + 三态点 */
import { useReadoutSelector } from "../../hooks/useReadout.ts";

type QualityView = {
  sampleRateOk: boolean;
  snr: number;
  clip: boolean;
  agc: boolean;
  status: "ok" | "warn" | "bad";
  state: "idle" | "capturing" | "ended";
};

const selector = (r: any): QualityView => ({
  sampleRateOk: r.quality.sampleRateOk,
  snr: r.quality.snr,
  clip: r.quality.clip,
  agc: r.quality.agc,
  status: r.quality.status,
  state: r.state,
});

const isEqual = (a: QualityView, b: QualityView) =>
  a.sampleRateOk === b.sampleRateOk &&
  a.clip === b.clip &&
  a.agc === b.agc &&
  a.status === b.status &&
  a.state === b.state &&
  Math.abs(a.snr - b.snr) < 0.5;

const DOT_COLOR: Record<QualityView["status"], string> = {
  ok: "var(--ok)",
  warn: "var(--low)",
  bad: "var(--bad)",
};

export default function QualityModule() {
  const q = useReadoutSelector(selector, isEqual);
  const idle = q.state === "idle";

  const metrics = [
    { label: "采样率", value: idle ? "—" : q.sampleRateOk ? "48 kHz" : "异常" },
    { label: "SNR", value: idle ? "—" : `${q.snr.toFixed(0)} dB` },
    { label: "削顶", value: idle ? "—" : q.clip ? "削顶" : "正常" },
    { label: "AGC", value: idle ? "—" : q.agc ? "介入" : "关闭" },
  ];

  return (
    <div className="panel" style={{ padding: "var(--s3)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--s2)",
        }}
      >
        <span style={{ fontSize: "var(--fs-h2)", fontWeight: 500 }}>质量灯</span>
        <span
          className="dot"
          style={{ background: idle ? "var(--mist)" : DOT_COLOR[q.status] }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s2)" }}>
        {metrics.map((m) => (
          <div
            key={m.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "var(--fs-sm)",
            }}
          >
            <span style={{ color: "var(--mist)" }}>{m.label}</span>
            <span className="mono">{m.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
