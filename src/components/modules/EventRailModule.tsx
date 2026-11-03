/** 事件轨模块 —— 85ms 短帧冲击事件，门限冻结 ≥200 帧 */
import { useReadoutSelector } from "../../hooks/useReadout.ts";

type EventView = {
  count: number;
  perSec: number;
  gateFrozen: boolean;
  state: "idle" | "capturing" | "ended";
};

const selector = (r: any): EventView => ({
  count: r.event?.count ?? 0,
  perSec: r.event?.perSec ?? 0,
  gateFrozen: r.event?.gateFrozen ?? false,
  state: r.state,
});

const isEqual = (a: EventView, b: EventView) =>
  a.count === b.count &&
  a.gateFrozen === b.gateFrozen &&
  a.state === b.state &&
  Math.abs(a.perSec - b.perSec) < 0.1;

export default function EventRailModule() {
  const e = useReadoutSelector(selector, isEqual);
  const idle = e.state === "idle";

  const rows = [
    { label: "冲击事件", value: idle ? "—" : `${e.count}` },
    { label: "事件率", value: idle ? "—" : `${e.perSec.toFixed(1)}/s` },
    { label: "门限", value: e.gateFrozen ? "已冻结" : "未冻结" },
  ];

  const note = e.gateFrozen
    ? "冻结门限已加载，可报警"
    : "门限未冻结 · 只记录不报警（需验收 ≥200 帧）";

  return (
    <div className="panel" style={{ padding: "var(--s3)" }}>
      <div style={{ fontSize: "var(--fs-h2)", fontWeight: 500, marginBottom: "var(--s2)" }}>
        事件轨
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s2)" }}>
        {rows.map((r) => (
          <div
            key={r.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "var(--fs-sm)",
            }}
          >
            <span style={{ color: "var(--mist)" }}>{r.label}</span>
            <span className="mono">{r.value}</span>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: "var(--s2)",
          fontSize: "var(--fs-xs)",
          color: "var(--mist)",
          borderTop: "var(--hair) solid var(--line)",
          paddingTop: "var(--s2)",
        }}
      >
        {note}
      </div>
    </div>
  );
}
