import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ModuleHero({
  num,
  floor,
  title,
  tagline,
  children,
  actions,
  className,
}: {
  num: string;
  floor: string;
  title: string;
  tagline?: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative bg-paper-200 border border-ink-100 rounded-xl shadow-sm overflow-hidden mb-6",
        className,
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-1 bg-ink-900" />
      <div className="absolute bottom-0 left-0 right-0 sov-hero-rule" />
      <div className="px-7 pt-6 pb-7 flex items-start justify-between gap-6">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[0.66rem] uppercase tracking-[0.2em] text-gold-700 font-semibold mb-2">
            MODULE {num} · {floor}
          </div>
          <h1 className="sov-display">{title}</h1>
          {tagline && (
            <p className="font-serif italic text-[1.1rem] text-gold-700 mt-1.5 leading-snug">
              {tagline}
            </p>
          )}
          {children && <div className="mt-3 text-[0.92rem] text-ink-600 leading-relaxed max-w-3xl">{children}</div>}
        </div>
        {actions && <div className="flex flex-col gap-2 items-end">{actions}</div>}
      </div>
    </header>
  );
}
