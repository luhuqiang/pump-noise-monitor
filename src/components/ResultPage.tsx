import { useUi, type TriState } from "../store/ui";
import { engine, type Diagnosis } from "../audio/engine.ts";
import { buildReport, toJson, toHtml, download } from "../report/index.ts";
import { saveDraft } from "../db/local.ts";
import { ALGORITHM_VERSION } from "../audio/diagnose.ts";
import { BackIcon, CheckIcon, HalfIcon, SlashIcon } from "./icons";

const STATE_CONFIG: Record<
  TriState,
  { label: string; color: string; glyph: string; Icon: React.FC<{ size?: number }> }
> = {
  ok: { label: "有把握", color: "var(--ok)", glyph: "●", Icon: CheckIcon },
  low: { label: "证据不足", color: "var(--low)", glyph: "◐", Icon: HalfIcon },
  invalid: { label: "本次不作结论", color: "var(--bad)", glyph: "／", Icon: SlashIcon },
};

/**
 * 结果页三态（P3/P4/P5，D2）：
 * - ok：主「生成报告」+ 次「复测对比 / 生成交接包」
 * - low：主「补测一次」（回 idle）+ 次「生成草稿报告」
 * - invalid：主「重采」（回 idle）+ 次「结束并存草稿」；机制区整块移除（AC-09）
 */
export default function ResultPage() {
  const { setView, showToast } = useUi();
  const diag = engine.readout.diagnosis as Diagnosis | null;
  const state: TriState = diag?.status ?? "low";
  const cfg = STATE_CONFIG[state];
  const { Icon } = cfg;

  const directions = diag?.directions ?? [];
  const evidence = diag?.evidence;
  const fixList = diag?.fixList ?? [];
  const hasEvidence = state !== "invalid" && evidence && (evidence.spectrum || evidence.order || evidence.placement);

  /** 导出报告/草稿/交接包（同一管线，文件名前缀区分） */
  const exportReport = async (kind: "report" | "draft" | "handover") => {
    const readout = engine.readout;
    const cfgEng = engine.getConfig();
    const report = buildReport(readout, {
      assetId: "default",
      assetName: "3号泵 · P-03",
      pointId: useUi.getState().currentPoint,
      pointName: useUi.getState().points.find((p) => p.id === useUi.getState().currentPoint)?.name ?? null,
      pumpType: cfgEng.pumpType,
      ratedRpm: cfgEng.ratedRpm,
      blades: cfgEng.blades,
    });
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const prefix = kind === "report" ? "stethoscope" : kind === "draft" ? "stethoscope-draft" : "stethoscope-handover";
    download(`${prefix}-${ts}.html`, toHtml(report), "text/html");
    download(`${prefix}-${ts}.json`, toJson(report), "application/json");
  };

  const onGenerateReport = async () => {
    await exportReport("report");
    showToast("报告已生成");
    setView("idle");
  };

  const onHandover = async () => {
    await exportReport("handover");
    showToast("交接包已导出");
  };

  const onDraftReport = async () => {
    await exportReport("draft");
    showToast("草稿报告已生成");
    setView("idle");
  };

  const onSaveDraft = async () => {
    try {
      await saveDraft({
        pointId: useUi.getState().currentPoint,
        elapsed: engine.readout.elapsed,
        sampleRate: engine.readout.sampleRate || 48000,
        status: "invalid",
        note: `invalid 结果存草稿（${ALGORITHM_VERSION}）`,
        diagnosis: diag,
      });
      showToast("已存草稿");
    } catch {
      showToast("草稿保存失败");
    }
    setView("idle");
  };

  const primary =
    state === "ok"
      ? { label: "生成报告", act: onGenerateReport }
      : state === "low"
        ? { label: "补测一次", act: () => setView("idle") }
        : { label: "重采", act: () => setView("idle") };

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "0 var(--page-x)",
        overflowY: "auto",
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--s2)",
          padding: "var(--s3) 0",
          borderBottom: "var(--hair) solid var(--line)",
          flex: "none",
        }}
      >
        <button className="tap" onClick={() => setView("idle")} aria-label="返回">
          <BackIcon size={20} />
        </button>
        <span style={{ fontSize: "var(--fs-h2)", fontWeight: 500 }}>本次结果</span>
      </div>

      <div style={{ flex: 1, paddingBottom: 26 }}>
        {/* 结论区：4px 左竖线 + 字形 + label + head */}
        <div
          role="status"
          aria-live="polite"
          style={{
            display: "flex",
            gap: 13,
            alignItems: "flex-start",
            paddingLeft: 13,
            borderLeft: `4px solid ${cfg.color}`,
            marginTop: "var(--s4)",
          }}
        >
          <span style={{ width: 26, height: 26, flex: "none", display: "grid", placeItems: "center", marginTop: 2, color: cfg.color }}>
            <Icon size={26} />
          </span>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.1em", color: cfg.color }}>{cfg.label}</div>
            <div style={{ fontSize: "var(--fs-h1)", fontWeight: 600, lineHeight: 1.35, marginTop: 2 }}>
              {diag?.title ?? cfg.label}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.7, marginTop: 14 }}>{diag?.summary ?? ""}</p>

        {/* 证据 3 卡（invalid 无证据区） */}
        {hasEvidence && (
          <>
            <SectionHead title="证据" meta="3 条 · 可回溯" />
            <div>
              {[
                ["频谱带", evidence!.spectrum],
                ["阶次", evidence!.order],
                ["摆位/质量", evidence!.placement],
              ].map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    padding: "11px 0",
                    borderBottom: "1px dashed var(--line)",
                    display: "flex",
                    gap: 12,
                    alignItems: "baseline",
                    fontSize: 13,
                  }}
                >
                  <b style={{ fontWeight: 500, flex: "none" }}>{k}</b>
                  <span style={{ color: "var(--mist)", fontSize: 12, lineHeight: 1.5 }}>{v}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 机制假设：无序号、无百分比；invalid 整块不渲染 */}
        {state !== "invalid" && directions.length > 0 && (
          <>
            <SectionHead title="机制假设" meta="家族级 · 不命名故障" />
            <ul style={{ margin: "8px 0 0", padding: 0, display: "grid", gap: 9 }}>
              {directions.map((d) => (
                <li key={d.id} style={{ listStyle: "none", fontSize: 13, lineHeight: 1.6, display: "flex", gap: 8 }}>
                  <i className="dot" style={{ width: 5, height: 5, background: "var(--mist)", flex: "none", marginTop: 7 }} />
                  <span>
                    {d.title}
                    {d.note && <span style={{ display: "block", fontSize: 11, color: "var(--mist)", marginTop: 2 }}>{d.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <div style={{ fontSize: 11, color: "var(--mist)", marginTop: 9, lineHeight: 1.6 }}>
              证据不足时不排序、不显示百分比；只给方向与一个补测动作。
            </div>
          </>
        )}

        {/* invalid：修复清单 */}
        {state === "invalid" && fixList.length > 0 && (
          <>
            <SectionHead title="修复清单" meta={`${fixList.length} 步 · 重采 ≤3 次`} />
            <div style={{ marginTop: 8, display: "grid", gap: 9 }}>
              {fixList.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 9, fontSize: 13, lineHeight: 1.55 }}>
                  <em className="mono" style={{ fontStyle: "normal", fontSize: 11, color: "var(--mist)", flex: "none", width: 16, paddingTop: 2 }}>
                    0{i + 1}
                  </em>
                  <span>{f}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--mist)", marginTop: 9, lineHeight: 1.6 }}>
              invalid 时机制区整块移除，不置灰——置灰仍会锚定。
            </div>
          </>
        )}

        {/* 下一步（AC-22） */}
        <SectionHead title="下一步" meta="一个动作" />
        <p style={{ fontSize: 14, lineHeight: 1.7, marginTop: 10 }}>{diag?.nextStep ?? "—"}</p>

        {/* 动作区 */}
        <div style={{ marginTop: 22, display: "grid", gap: 10 }}>
          <button className="primary-btn" style={{ height: 56 }} onClick={primary.act}>
            <span>{primary.label}</span>
            <span className="dot" style={{ background: "var(--paper)", width: 12, height: 12 }} />
          </button>
          {state === "ok" && (
            <>
              {engine.readout.baselineReady && (
                <GhostBtn label="复测对比" onClick={() => showToast("复测对比（基线就绪）")} />
              )}
              <GhostBtn label="生成交接包" onClick={onHandover} />
            </>
          )}
          {state === "low" && <GhostBtn label="生成草稿报告" onClick={onDraftReport} />}
          {state === "invalid" && <GhostBtn label="结束并存草稿" onClick={onSaveDraft} />}
        </div>
      </div>
    </div>
  );
}

function SectionHead({ title, meta }: { title: string; meta: string }) {
  return (
    <div
      style={{
        marginTop: 24,
        paddingTop: 12,
        borderTop: "var(--hair) solid var(--line)",
        display: "flex",
        alignItems: "baseline",
        gap: 8,
      }}
    >
      <h3 style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: "0.06em", margin: 0 }}>{title}</h3>
      <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--mist)" }}>{meta}</span>
    </div>
  );
}

function GhostBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 48,
        border: "var(--hair) solid var(--line)",
        borderRadius: "var(--r-chip)",
        fontSize: 13,
        color: "var(--mist)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 14px",
        background: "transparent",
      }}
    >
      <b style={{ color: "var(--ink)", fontWeight: 400 }}>{label}</b>
      <span>›</span>
    </button>
  );
}
