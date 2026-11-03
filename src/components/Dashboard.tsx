import { useUi, type ModuleId } from "../store/ui";
import WaveModule from "./modules/WaveModule";
import SpectrumModule from "./modules/SpectrumModule";
import QualityModule from "./modules/QualityModule";
import OrderModule from "./modules/OrderModule";
import TrendModule from "./modules/TrendModule";
import EventRailModule from "./modules/EventRailModule";

const MODULE_LABELS: Record<ModuleId, string> = {
  wave: "波形",
  spectrum: "频谱",
  quality: "质量灯",
  order: "阶次",
  trend: "趋势",
  event: "事件轨",
};

const MODULE_COMPONENTS: Record<ModuleId, React.FC> = {
  wave: WaveModule,
  spectrum: SpectrumModule,
  quality: QualityModule,
  order: OrderModule,
  trend: TrendModule,
  event: EventRailModule,
};

/**
 * 仪表台：默认 3 个模块（波形、频谱、质量灯），其余按需切换。
 * 模块切换状态写入本地存储，冷启动保持。
 */
export default function Dashboard() {
  const { modules, setModules } = useUi();

  const toggleModule = (id: ModuleId) => {
    if (modules.includes(id)) {
      // 至少保留 1 个
      if (modules.length > 1) {
        setModules(modules.filter((m) => m !== id));
      }
    } else {
      // 最多 3 个
      if (modules.length < 3) {
        setModules([...modules, id]);
      } else {
        // 替换最后一个
        setModules([...modules.slice(0, 2), id]);
      }
    }
  };

  return (
    <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* 模块 tab 栏 */}
      <div
        style={{
          display: "flex",
          gap: "var(--s2)",
          padding: "var(--s2) 0",
          borderBottom: "var(--hair) solid var(--line)",
          flexWrap: "wrap",
        }}
      >
        {(Object.keys(MODULE_LABELS) as ModuleId[]).map((id) => {
          const active = modules.includes(id);
          return (
            <button
              key={id}
              className="chip"
              onClick={() => toggleModule(id)}
              style={{
                color: active ? "var(--ink)" : "var(--mist)",
                borderColor: active ? "var(--ink)" : "var(--line)",
                fontWeight: active ? 500 : 400,
              }}
            >
              {MODULE_LABELS[id]}
            </button>
          );
        })}
      </div>

      {/* 模块内容区 */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--s3) 0",
          display: "flex",
          flexDirection: "column",
          gap: "var(--s3)",
        }}
      >
        {modules.map((id) => {
          const Comp = MODULE_COMPONENTS[id];
          return <Comp key={id} />;
        })}
      </div>
    </div>
  );
}
