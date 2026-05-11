import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Variant = "default" | "ok" | "info" | "warn" | "risk" | "violet";

export function Card({
  children,
  className,
  variant = "default",
  lift = false,
  flat = false,
}: {
  children: ReactNode;
  className?: string;
  variant?: Variant;
  lift?: boolean;
  flat?: boolean;
}) {
  return (
    <div
      className={cn(
        "sov-card",
        variant !== "default" && `sov-card--${variant}`,
        lift && "sov-card--lift",
        flat && "sov-card--flat",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("sov-label", className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-lg font-semibold text-ink-900 mt-1", className)}>
      {children}
    </h3>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[0.92rem] text-ink-700 leading-relaxed mt-2", className)}>
      {children}
    </div>
  );
}
