/** 趋势模块 —— 8 带相对电平，基线对比 */
import { useReadoutSelector } from "../../hooks/useReadout.ts";

const BAND_LABELS = ["40–80", "80–160", "160–315", "315–630", "630–1.25k", "1.25–2.5k", "2.5–5k", "5–10k"];

type TrendView = {
  bandDb: number[];
  state: "idle" | "capturing" | "ended";
};

const selector = (r: any): TrendView => ({
  bandDb: r.bandDb,
  state: r.state,
});

const isEqual = (a: TrendView, b: TrendView) => {
  if (a.state !== b.state) return false;
  if (a.bandDb.length !== b.bandDb.length) return false;
  for (let i = 0; i < a.bandDb.length; i++) {
    if (Math.abs((a.bandDb[i] ?? -120) - (b.bandDb[i] ?? -120)) >= 1) return false;
  }
  return true;
};

export default function TrendModule() {
  const t = useReadoutSelector(selector, isEqual);
  const idle = t.state === "idle";

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
        <span style={{ fontSize: "var(--fs-h2)", fontWeight: 500 }}>趋势</span>
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--mist)" }}>无基线 · 只做本次形态</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s1)" }}>
        {BAND_LABELS.map((label, i) => {
          const db = t.bandDb[i] ?? -120;
          const text = idle ? "—" : `${db.toFixed(1)}`;
          const pct = idle ? 0 : Math.max(0, Math.min(1, (db + 60) / 60));
          return (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--s2)",
                fontSize: "var(--fs-xs)",
              }}
            >
              <span style={{ color: "var(--mist)", width: 56, flexShrink: 0 }}>{label}</span>
              <div
                style={{
                  flex: 1,
                  height: 6,
                  background: "var(--line)",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    height: "100%",
                    width: `${pct * 100}%`,
                    background: "var(--ink)",
                  }}
                />
              </div>
              <span className="mono" style={{ width: 48, textAlign: "right" }}>
                {text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
