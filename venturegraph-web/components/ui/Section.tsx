import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({
  label,
  title,
  description,
  children,
  className,
  actions,
}: {
  label?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-8", className)}>
      {(label || title || description || actions) && (
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            {label && <div className="sov-label">{label}</div>}
            {title && <h2 className="text-[1.35rem] font-semibold text-ink-900 mt-1 leading-tight">{title}</h2>}
            {description && <p className="text-[0.9rem] text-ink-500 mt-1 max-w-3xl">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
