import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

export function MetricCard({
  label,
  value,
  sub,
  delta,
  accent,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: number;
  accent?: "gold" | "ink" | "ok" | "info" | "warn" | "risk" | "violet";
  icon?: ReactNode;
  className?: string;
}) {
  const accentBar: Record<string, string> = {
    gold:   "before:bg-gold-500",
    ink:    "before:bg-ink-700",
    ok:     "before:bg-ok-500",
    info:   "before:bg-info-500",
    warn:   "before:bg-warn-500",
    risk:   "before:bg-risk-500",
    violet: "before:bg-violet-500",
  };
  const valColor: Record<string, string> = {
    gold:   "text-ink-900",
    ink:    "text-ink-900",
    ok:     "text-ok-700",
    info:   "text-info-700",
    warn:   "text-warn-700",
    risk:   "text-risk-700",
    violet: "text-violet-700",
  };
  const a = accent ?? "gold";

  return (
    <div
      className={cn(
        "relative bg-paper-200 border border-ink-100 rounded-lg px-5 py-4 shadow-xs",
        "before:content-[''] before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-r",
        accentBar[a],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="sov-metric-label">{label}</div>
        {icon && <span className="text-ink-300">{icon}</span>}
      </div>
      <div className={cn("sov-metric-value mt-1.5", valColor[a])}>{value}</div>
      {sub !== undefined && <div className="sov-metric-sub">{sub}</div>}
      {delta !== undefined && (
        <div
          className={cn(
            "mt-1 inline-flex items-center gap-1 text-[0.78rem] font-mono",
            delta > 0 ? "text-ok-700" : delta < 0 ? "text-risk-700" : "text-ink-400",
          )}
        >
          {delta > 0 ? (
            <TrendingUp size={13} strokeWidth={2} />
          ) : delta < 0 ? (
            <TrendingDown size={13} strokeWidth={2} />
          ) : null}
          {delta > 0 ? "+" : ""}
          {delta.toFixed(3)}
        </div>
      )}
    </div>
  );
}
