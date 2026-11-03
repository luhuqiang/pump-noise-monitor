import { AudioLines, Fan, Mic, Tornado } from "lucide-react";
import { engine } from "../audio/engine";
import { PUMP_TYPES, getPumpType, getScenario, scenariosFor } from "../audio/scenarios";
import { useSettings } from "../lib/settings";
import { cn } from "../lib/utils";
import { controlClass, controlOn } from "./panel";

const PUMP_ICONS = { centrifugal: Fan, vortex: Tornado };

export function Toolbar() {
  const source = useSettings((s) => s.source);
  const pumpType = useSettings((s) => s.pumpType);
  const scenario = useSettings((s) => s.scenario);
  const selectScenario = useSettings((s) => s.selectScenario);
  const selectPumpType = useSettings((s) => s.selectPumpType);
  const update = useSettings((s) => s.update);
  const meta = getPumpType(pumpType);
  const current = getScenario(scenario);
  const faults = scenariosFor(pumpType);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-surface p-1 shadow-panel" role="group" aria-label="泵型">
          {PUMP_TYPES.map((item) => {
            const Icon = PUMP_ICONS[item.id];
            const on = pumpType === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={on}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm",
                  on ? "bg-amber text-ink" : "text-muted",
                )}
                onClick={() => {
                  if (on) return;
                  selectPumpType(item.id);
                  void engine.start();
                }}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.name}
              </button>
            );
          })}
        </div>
        <span className="h-px w-px" />
        {faults.map((item) => {
          const on = source === "demo" && scenario === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              className={cn(controlClass, on && controlOn)}
              onClick={() => {
                selectScenario(item.id);
                void engine.start();
              }}
            >
              {item.name.replace(`${meta.name} · `, "")}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={source === "mic"}
          className={cn(controlClass, source === "mic" && controlOn)}
          onClick={() => {
            update({ source: "mic" });
            void engine.start();
          }}
        >
          <Mic className="size-4" aria-hidden="true" />
          麦克风
        </button>
        <button
          type="button"
          aria-pressed={source === "ref"}
          className={cn(controlClass, source === "ref" && controlOn)}
          onClick={() => {
            update({ source: "ref" });
            void engine.start();
          }}
        >
          <AudioLines className="size-4" aria-hidden="true" />
          1 kHz 自检
        </button>
      </div>
      <p className="mt-2 text-sm text-muted">
        {source === "mic"
          ? "已请求关闭回声消除、降噪和自动增益。手机增益仍会改变读数；读数以未校准 dBFS 呈现，校准值只作换算小字说明。"
          : source === "ref"
            ? "1 kHz 正弦，RMS 为 −36 dBFS。A、C、Z 在这个频率上应几乎重合。"
            : current.blurb}
      </p>
    </div>
  );
}
