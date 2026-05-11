"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function HashPill({
  hash,
  variant = "ok",
  truncate = 0,
  copyable = true,
  label,
  className,
}: {
  hash: string;
  variant?: "ok" | "gold" | "ink";
  truncate?: number;
  copyable?: boolean;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const display = truncate > 0 && hash.length > truncate ? hash.slice(0, truncate) + "…" : hash;

  const onCopy = async () => {
    if (!copyable) return;
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <span className="inline-flex items-baseline gap-2">
      {label && (
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-gold-700 font-semibold">
          {label}
        </span>
      )}
      <span
        onClick={onCopy}
        className={cn(
          "sov-hash",
          variant === "gold" && "sov-hash--gold",
          variant === "ink" && "sov-hash--ink",
          copyable && "cursor-pointer hover:brightness-95",
          className,
        )}
        title={copyable ? "Click to copy" : undefined}
      >
        {display}
        {copyable && (
          <span className="ml-1 flex items-center">
            {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={10} strokeWidth={2} />}
          </span>
        )}
      </span>
    </span>
  );
}
