import { useState } from "react";
import { useUi } from "../store/ui";

/**
 * 4 步引导（P0）—— 底部 sheet，max-height ≤44%（AC-05：仪表台仍可见）。
 * 可跳过，仅首次出现（tzp.guide.v1）。
 */
const STEPS: { t: string; b: string; art: React.ReactNode }[] = [
  {
    t: "贴上去",
    b: "手机距泵壳 0.30m，正对泵壳，不要贴壳。距离一变，1kHz 以上就不可比。",
    art: (
      <svg viewBox="0 0 76 76" fill="none" stroke="currentColor" strokeWidth="1.6" width={76} height={76}>
        <circle cx="22" cy="38" r="11" />
        <rect x="52" y="14" width="10" height="48" rx="2" />
        <path d="M33 38h13" strokeDasharray="4 4" />
        <circle cx="46" cy="38" r="1.8" fill="currentColor" />
        <path d="M8 62h60" strokeWidth="1" strokeDasharray="2 4" />
      </svg>
    ),
  },
  {
    t: "等三秒",
    b: "等工况稳定，再看质量灯。灯不绿，数据只记录、不判读。",
    art: (
      <svg viewBox="0 0 76 76" fill="none" stroke="currentColor" strokeWidth="1.6" width={76} height={76}>
        <circle cx="38" cy="38" r="18" />
        <circle cx="38" cy="38" r="7" fill="currentColor" stroke="none" />
        <path d="M38 12v8M38 56v8M12 38h8M56 38h8" strokeWidth="1.2" />
        <path d="M62 20v10h-10" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    t: "看结论",
    b: "有把握 / 证据不足 / 本次不作结论——三种都写在屏幕上，从不说“正常”。",
    art: (
      <svg viewBox="0 0 76 76" fill="none" stroke="currentColor" strokeWidth="1.6" width={76} height={76}>
        <circle cx="20" cy="24" r="7" fill="currentColor" stroke="none" />
        <path d="M42 16a8 8 0 0 1 0 16" strokeDasharray="3 3" />
        <path d="M42 24a8 8 0 0 0 0 8" />
        <path d="M12 52h16" />
        <path d="M44 44l16 16" strokeWidth="2" />
      </svg>
    ),
  },
  {
    t: "只在本机",
    b: "音频默认不上传；报告与案例都在本地，可导出 .tzcase 交接。",
    art: (
      <svg viewBox="0 0 76 76" fill="none" stroke="currentColor" strokeWidth="1.6" width={76} height={76}>
        <rect x="22" y="12" width="32" height="52" rx="3" />
        <path d="M33 58h10" />
        <path d="M34 32h8M30 40h16" strokeWidth="1.2" />
        <path d="M14 66h48" strokeDasharray="3 4" strokeWidth="1" />
      </svg>
    ),
  },
];

export default function Guide() {
  const [step, setStep] = useState(0);
  const { setGuideDone } = useUi();
  const isLast = step === STEPS.length - 1;
  const s = STEPS[step]!;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        zIndex: 40,
      }}
    >
      {/* 遮罩：点击不关闭（防误触跳过） */}
      <div style={{ position: "absolute", inset: 0 }} />
      <div
        data-gsheet
        style={{
          position: "relative",
          background: "var(--paper)",
          borderTop: "2px solid var(--ink)",
          padding: "4px var(--page-x) 16px",
          maxHeight: "44%",
          display: "flex",
          flexDirection: "column",
          animation: "guideUp 240ms var(--ease)",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0 4px" }}>
          <span style={{ fontSize: 10.5, letterSpacing: "0.16em", color: "var(--mist)" }}>
            首次使用 · {step + 1} / {STEPS.length}
          </span>
          <button onClick={setGuideDone} style={{ fontSize: 12, color: "var(--mist)", padding: "7px 0", minWidth: 44, minHeight: 44 }}>
            跳过
          </button>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "6px 0 2px", minHeight: 116 }}>
          <div
            style={{
              width: 104,
              height: 104,
              flex: "none",
              border: "var(--hair) solid var(--line)",
              borderRadius: "var(--r-chip)",
              display: "grid",
              placeItems: "center",
              color: "var(--ink)",
            }}
          >
            {s.art}
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, letterSpacing: "0.04em", margin: "0 0 5px" }}>{s.t}</h2>
            <p style={{ fontSize: 12.5, color: "var(--mist)", lineHeight: 1.65, margin: 0 }}>{s.b}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6 }}>
          <div style={{ display: "flex", gap: 5 }}>
            {STEPS.map((_, i) => (
              <i
                key={i}
                className="dot"
                style={{ width: 6, height: 6, background: i === step ? "var(--ink)" : "var(--line)" }}
              />
            ))}
          </div>
          <button
            onClick={() => (isLast ? setGuideDone() : setStep((v) => v + 1))}
            style={{
              marginLeft: "auto",
              height: 46,
              padding: "0 18px",
              background: "var(--ink)",
              color: "var(--paper)",
              borderRadius: "var(--r-chip)",
              fontSize: 13,
              letterSpacing: "0.08em",
            }}
          >
            {isLast ? "开始" : "下一步"}
          </button>
        </div>
      </div>
      <style>{`@keyframes guideUp { from { transform: translateY(14px); } to { transform: none; } }`}</style>
    </div>
  );
}
