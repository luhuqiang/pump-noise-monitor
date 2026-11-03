/** 阶次模块 —— 1×/2×/BPF/半阶次 相对能量，rpm≥900 且 ≥20 转才可用 */
import { useReadoutSelector } from "../../hooks/useReadout.ts";

type OrderView = {
  reliable: boolean;
  oneX: number;
  twoX: number;
  bpf: number;
  half: number;
  oneXSnr: number;
  state: "idle" | "capturing" | "ended";
  rpmDeltaPct: number;
  shaftReliable: boolean;
};

const selector = (r: any): OrderView => ({
  reliable: r.orders.reliable,
  oneX: r.orders.oneX,
  twoX: r.orders.twoX,
  bpf: r.orders.bpf,
  half: r.orders.half,
  oneXSnr: r.orders.oneXSnr,
  state: r.state,
  rpmDeltaPct: r.shaft?.rpmDeltaPct ?? 0,
  shaftReliable: r.shaft?.reliable ?? false,
});

const isEqual = (a: OrderView, b: OrderView) =>
  a.reliable === b.reliable &&
  a.state === b.state &&
  a.shaftReliable === b.shaftReliable &&
  Math.abs(a.oneX - b.oneX) < 0.02 &&
  Math.abs(a.twoX - b.twoX) < 0.02 &&
  Math.abs(a.bpf - b.bpf) < 0.02 &&
  Math.abs(a.half - b.half) < 0.02 &&
  Math.abs(a.rpmDeltaPct - b.rpmDeltaPct) < 0.5;

const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "—");

export default function OrderModule() {
  const o = useReadoutSelector(selector, isEqual);
  const idle = o.state === "idle";

  const rows = [
    { label: "1×", value: idle ? "—" : fmt(o.oneX) },
    { label: "2×", value: idle ? "—" : fmt(o.twoX) },
    { label: "BPF", value: idle ? "—" : fmt(o.bpf) },
    { label: "半阶次", value: idle ? "—" : fmt(o.half) },
  ];

  const note = idle
    ? "未采集"
    : !o.reliable
      ? "转速不足 900 或 <20 转 → 不做阶次"
      : !o.shaftReliable
        ? "轴频跟踪不确定，阶次仅供参考"
        : `轴频偏差 ${o.rpmDeltaPct.toFixed(1)}%`;

  return (
    <div className="panel" style={{ padding: "var(--s3)" }}>
      <div style={{ fontSize: "var(--fs-h2)", fontWeight: 500, marginBottom: "var(--s2)" }}>
        阶次
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
