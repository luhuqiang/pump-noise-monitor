import { useUi, type TriState } from "../store/ui";
import { engine, type Diagnosis } from "../audio/engine.ts";
import { buildReport, toJson, toHtml, download } from "../report/index.ts";
import { createSession, endSession } from "../db/repositories/sessions.ts";
import { ALGORITHM_VERSION } from "../audio/diagnose.ts";
import { BackIcon, CheckIcon, HalfIcon, SlashIcon } from "./icons";

const STATE_CONFIG: Record<
  TriState,
  { label: string; color: string; Icon: React.FC<{ size?: number }>; sub: string }
> = {
  ok: { label: "有把握", color: "var(--ok)", Icon: CheckIcon, sub: "可生成报告" },
  low: { label: "证据不足", color: "var(--low)", Icon: HalfIcon, sub: "需补测确认" },
  invalid: { label: "本次不作结论", color: "var(--bad)", Icon: SlashIcon, sub: "信号质量不合格" },
};

/**
 * 结果页三态（D2）：
 * - ok：单一方向（汽蚀/堵塞）+ 3 张证据卡
 * - low：可能方向无序号、无百分比、无"正常"
 * - invalid：机制区整块移除，只给修复清单
 */
export default function ResultPage() {
  const { setView } = useUi();
  const diag = engine.readout.diagnosis as Diagnosis | null;
  const state: TriState = diag?.status ?? "low";
  const cfg = STATE_CONFIG[state];
  const { Icon } = cfg;

  const directions = diag?.directions ?? [];
  const evidence = diag?.evidence;
  const fixList = diag?.fixList ?? [];

  const handleGenerateReport = async (d: Diagnosis | null) => {
    const readout = engine.readout;
    const cfg = engine.getConfig();
    const report = buildReport(readout, {
      assetId: "default",
      assetName: "默认设备",
      pointId: null,
      pointName: null,
      pumpType: cfg.pumpType,
      ratedRpm: cfg.ratedRpm,
      blades: cfg.blades,
    });

    // 持久化会话
    const sessionId = `sess_${Date.now()}`;
    try {
      await createSession({
        id: sessionId,
        asset_id: "default",
        point_id: null,
        started_at: Date.now() - readout.elapsed * 1000,
        sample_rate: readout.sampleRate || 48000,
        phase: readout.phase,
        rpm: readout.shaft?.trackedF0 ? readout.shaft.trackedF0 * 60 : null,
        mic_status: readout.micStatus,
        algorithm_version: ALGORITHM_VERSION,
      });
      await endSession(sessionId, d?.status ?? "low", JSON.stringify(d));
    } catch {
      // 本地存储失败不阻塞报告导出
    }

    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    download(`stethoscope-${ts}.html`, toHtml(report), "text/html");
    download(`stethoscope-${ts}.json`, toJson(report), "application/json");
    setView("idle");
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
      {/* header */}
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
        <span style={{ fontSize: "var(--fs-h2)", fontWeight: 500 }}>诊断结果</span>
      </div>

      {/* 结论区 */}
      <div
        style={{
          padding: "var(--s4) 0",
          borderBottom: "var(--hair) solid var(--line)",
          display: "flex",
          alignItems: "center",
          gap: "var(--s3)",
        }}
      >
        <div style={{ width: 4, height: 56, background: cfg.color, borderRadius: 0 }} />
        <Icon size={32} />
        <div>
          <div style={{ fontSize: "var(--fs-h1)", fontWeight: 600, color: cfg.color }}>
            {cfg.label}
          </div>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--mist)" }}>{cfg.sub}</div>
        </div>
      </div>

      {/* 机制区（invalid 时整块移除） */}
      {state !== "invalid" && directions.length > 0 && (
        <div style={{ padding: "var(--s3) 0", borderBottom: "var(--hair) solid var(--line)" }}>
          <div style={{ fontSize: "var(--fs-h2)", fontWeight: 500, marginBottom: "var(--s2)" }}>
            关注机制
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s2)" }}>
            {directions.map((d) => (
              <div key={d.id} className="panel" style={{ padding: "var(--s3)" }}>
                <span style={{ fontSize: "var(--fs-body)", fontWeight: 500 }}>{d.title}</span>
                {state === "low" && d.note && (
                  <div style={{ fontSize: "var(--fs-sm)", color: "var(--mist)", marginTop: "var(--s1)" }}>
                    {d.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* invalid 修复清单 */}
      {state === "invalid" && fixList.length > 0 && (
        <div style={{ padding: "var(--s3) 0", borderBottom: "var(--hair) solid var(--line)" }}>
          <div style={{ fontSize: "var(--fs-h2)", fontWeight: 500, marginBottom: "var(--s2)" }}>
            请按以下修复
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s2)" }}>
            {fixList.map((f, i) => (
              <div
                key={i}
                className="panel"
                style={{ padding: "var(--s3)", fontSize: "var(--fs-body)" }}
              >
                {i + 1}. {f}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 证据卡 */}
      {evidence && (
        <div style={{ flex: 1, overflowY: "auto", padding: "var(--s3) 0" }}>
          <div style={{ fontSize: "var(--fs-h2)", fontWeight: 500, marginBottom: "var(--s2)" }}>
            证据
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s2)" }}>
            <div className="panel" style={{ padding: "var(--s3)" }}>
              <div style={{ fontSize: "var(--fs-sm)", color: "var(--mist)" }}>频谱带</div>
              <div style={{ fontSize: "var(--fs-body)", marginTop: "var(--s1)" }}>
                {evidence.spectrum}
              </div>
            </div>
            <div className="panel" style={{ padding: "var(--s3)" }}>
              <div style={{ fontSize: "var(--fs-sm)", color: "var(--mist)" }}>阶次</div>
              <div style={{ fontSize: "var(--fs-body)", marginTop: "var(--s1)" }}>
                {evidence.order}
              </div>
            </div>
            <div className="panel" style={{ padding: "var(--s3)" }}>
              <div style={{ fontSize: "var(--fs-sm)", color: "var(--mist)" }}>摆位/质量</div>
              <div style={{ fontSize: "var(--fs-body)", marginTop: "var(--s1)" }}>
                {evidence.placement}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 底部操作 */}
      <div
        style={{
          padding: "var(--s3) 0 var(--dock-gap)",
          borderTop: "var(--hair) solid var(--line)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--s2)",
        }}
      >
        <button
          className="primary-btn"
          onClick={() => handleGenerateReport(diag)}
          disabled={state !== "ok"}
          style={state !== "ok" ? { opacity: 0.4 } : undefined}
        >
          <span>生成报告</span>
          <span className="dot" style={{ background: "var(--paper)", width: 12, height: 12 }} />
        </button>
        <div style={{ display: "flex", gap: "var(--s3)", justifyContent: "center" }}>
          <button
            style={{ fontSize: "var(--fs-sm)", color: "var(--mist)" }}
            onClick={() => setView("idle")}
          >
            复测
          </button>
        </div>
      </div>
    </div>
  );
}
