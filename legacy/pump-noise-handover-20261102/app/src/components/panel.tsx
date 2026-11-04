import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  hint,
  action,
  children,
  className,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-2xl bg-surface p-2 shadow-panel", className)}>
      <div className="flex items-start justify-between gap-3 px-2 py-1.5">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-fg">{title}</h2>
          {hint ? <p className="text-xs text-muted">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export const controlClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-raised px-3 text-sm text-fg shadow-panel disabled:cursor-not-allowed disabled:opacity-40";

export const controlOn = "bg-amber text-ink";
