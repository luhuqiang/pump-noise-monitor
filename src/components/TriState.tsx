/**
 * TriState — Agent 三态渲染组件
 *
 * ok              = 绿色（可判读）
 * low_confidence  = 黄色（低置信）
 * invalid         = 红色（拒答）+ 不渲染任何机制条目
 */
import { AlertTriangle, CheckCircle2, CircleX } from "lucide-react";
import { cn } from "../lib/utils";
import type { AgentDecision } from "../agent/machine.ts";
import { renderDecision } from "../agent/prompt.ts";

// ---------- 色板（与现有 result-card 中 severity 色一致） ----------

const TONE: Record<AgentDecision["state"], {
  text: string;
  bar: string;
  border: string;
  badge: string;
  label: string;
  Icon: typeof CheckCircle2;
}> = {
  accept: {
    text: "text-signal",
    bar: "bg-signal",
    border: "border-signal/50",
    badge: "bg-signal/15 text-signal",
    label: "可判读",
    Icon: CheckCircle2,
  },
  ask: {
    text: "text-amber",
    bar: "bg-amber",
    border: "border-amber/50",
    badge: "bg-amber/15 text-amber",
    label: "低置信",
    Icon: AlertTriangle,
  },
  refuse: {
    text: "text-alarm",
    bar: "bg-alarm",
    border: "border-alarm/60",
    badge: "bg-alarm/20 text-alarm",
    label: "拒答",
    Icon: CircleX,
  },
};

export interface TriStateProps {
  /** Agent 裁决结果（必填） */
  decision: AgentDecision;
  /** 机制条目列表（仅 accept / ask 态会渲染） */
  mechanisms?: ReadonlyArray<{ title: string; detail?: string }>;
  /** 下一步建议文字 */
  nextStep?: string;
  /** 自定义额外类名 */
  className?: string;
}

export function TriState({ decision, mechanisms = [], nextStep, className }: TriStateProps) {
  const tone = TONE[decision.state];
  const Icon = tone.Icon;
  const text = renderDecision(decision, {
    directions: mechanisms.map((m) => m.title),
    nextStep,
  });

  // AC-09: invalid 态不渲染任何机制条目
  const showMechanisms = decision.state !== "refuse" && mechanisms.length > 0;

  return (
    <section
      data-testid="tri-state"
      data-state={decision.state}
      data-has-mechanisms={showMechanisms ? "true" : "false"}
      className={cn(
        "overflow-hidden rounded-2xl border bg-surface shadow-panel",
        tone.border,
        className,
      )}
    >
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <Icon className={cn("mt-1 size-9 shrink-0", tone.text)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", tone.badge)}>
            {tone.label}
          </span>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-fg">{text}</p>
        </div>
      </div>

      {showMechanisms ? (
        <div className="border-t border-border px-4 py-3 sm:px-5" data-testid="tri-state-mechanisms">
          <ul className="space-y-1.5">
            {mechanisms.map((m, i) => (
              <li key={i} className="rounded-md bg-bg px-2 py-1.5 text-xs">
                <span className={cn("font-medium", tone.text)}>{m.title}</span>
                {m.detail ? <span className="ml-1 text-muted">· {m.detail}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
