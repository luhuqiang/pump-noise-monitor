import { useUi } from "../store/ui";
import { AssetIcon, SingleMicIcon, OfflineIcon, SettingsIcon, PointIcon } from "./icons";

/**
 * Header：设备/测点上下文 · 单麦 · 离线状态 · 设置
 * 顶部区域只放"可读不可点"的信息；唯一顶部可点项是设置（56×56）
 */
export default function Header() {
  const { setView } = useUi();

  return (
    <header
      style={{
        paddingTop: "var(--s3)",
        paddingBottom: "var(--s2)",
        borderBottom: "var(--hair) solid var(--line)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--s2)",
        }}
      >
        {/* 左：设备 + 测点 */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
          <AssetIcon size={16} />
          <span style={{ fontSize: "var(--fs-sm)", fontWeight: 500 }}>3号泵 · P-03</span>
          <PointIcon size={14} />
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--mist)" }}>入口法兰</span>
        </div>

        {/* 右：状态 chips + 设置 */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
          <span className="chip" style={{ display: "flex", alignItems: "center", gap: "var(--s1)" }}>
            <SingleMicIcon size={12} />
            单麦 · 48k
          </span>
          <span className="chip" style={{ display: "flex", alignItems: "center", gap: "var(--s1)" }}>
            <OfflineIcon size={12} />
            离线 · 模板 v1.0
          </span>
          <button
            className="tap"
            onClick={() => setView("settings")}
            aria-label="设置"
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <SettingsIcon size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
