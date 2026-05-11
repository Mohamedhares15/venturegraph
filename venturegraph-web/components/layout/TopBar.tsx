"use client";
// Top bar: live status pills + tenant indicator. Client component for any future interactivity.
import { Activity, ShieldCheck, Clock } from "lucide-react";

export function TopBar() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="border-b border-ink-100 bg-paper-200/70 backdrop-blur-sm sticky top-0 z-20">
      <div className="px-8 md:px-12 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[0.7rem] font-mono tracking-[0.16em] uppercase text-ink-500">
          <span className="flex items-center gap-1.5">
            <Clock size={12} strokeWidth={1.7} />
            {dateStr}
          </span>
          <span className="text-ink-200">|</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={12} strokeWidth={1.7} className="text-ok-700" />
            Audit-grade · Pre-registered
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="sov-tag sov-tag--ok flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />
            AUDIT LIVE
          </span>
          <span className="sov-tag">TIER · SOVEREIGN</span>
          <span className="hidden md:inline-flex sov-tag sov-tag--ink">
            <Activity size={11} strokeWidth={2} className="mr-1" />
            DEMO TENANT
          </span>
        </div>
      </div>
    </div>
  );
}
