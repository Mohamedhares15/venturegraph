import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function StatusPill({
  variant = "default",
  children,
  className,
}: {
  variant?: "default" | "ok" | "info" | "warn" | "ink";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "sov-tag",
        variant === "ok" && "sov-tag--ok",
        variant === "info" && "sov-tag--info",
        variant === "warn" && "sov-tag--warn",
        variant === "ink" && "sov-tag--ink",
        className,
      )}
    >
      {children}
    </span>
  );
}
