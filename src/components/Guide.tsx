import { useState } from "react";
import { useUi } from "../store/ui";
import { MarkIcon } from "./icons";

const STEPS = [
  {
    title: "把手机贴上去",
    desc: "用手机背部麦克风贴住泵体测点。不是对着空气录，是贴住金属面。",
  },
  {
    title: "按开始，等 30 秒",
    desc: "采集期间不要移动手机。质量灯变绿说明信号可信，变黄说明噪声偏大。",
  },
  {
    title: "看三态结论",
    desc: "有把握 = 汽蚀或堵塞；证据不足 = 需补测；不作结论 = 信号不合格，重采。",
  },
  {
    title: "生成报告或复测",
    desc: "报告含证据卡，可导出交接。同测点可复测对比趋势。",
  },
];

/**
 * 4 步引导，可跳过，仅首次出现。
 * 引导面板高度 ≤44%，仪表台仍可见。
 */
export default function Guide() {
  const [step, setStep] = useState(0);
  const { setGuideDone } = useUi();
  const isLast = step === STEPS.length - 1;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "var(--s7) var(--s5)",
      }}
    >
      {/* 品牌标记 */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--s3)" }}>
        <MarkIcon size={64} />
        <span style={{ fontSize: "var(--fs-h1)", fontWeight: 600 }}>听诊仪</span>
      </div>

      {/* 引导面板（≤44% 高度） */}
      <div
        className="panel"
        style={{
          width: "100%",
          maxHeight: "44%",
          padding: "var(--s4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--s3)",
        }}
      >
        <div style={{ display: "flex", gap: "var(--s2)" }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 2,
                background: i <= step ? "var(--ink)" : "var(--line)",
              }}
            />
          ))}
        </div>
        <h2 style={{ fontSize: "var(--fs-h1)", fontWeight: 600, margin: 0 }}>
          {STEPS[step].title}
        </h2>
        <p style={{ fontSize: "var(--fs-body)", color: "var(--mist)", margin: 0, lineHeight: "var(--lh-body)" }}>
          {STEPS[step].desc}
        </p>
      </div>

      {/* 操作 */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "var(--s2)" }}>
        <button
          className="primary-btn"
          onClick={() => (isLast ? setGuideDone() : setStep((s) => s + 1))}
        >
          <span>{isLast ? "开始使用" : "下一步"}</span>
          <span className="dot" style={{ background: "var(--paper)", width: 12, height: 12 }} />
        </button>
        {!isLast && (
          <button
            onClick={setGuideDone}
            style={{ fontSize: "var(--fs-sm)", color: "var(--mist)", padding: "var(--s2)" }}
          >
            跳过
          </button>
        )}
      </div>
    </div>
  );
}
