"use client";
// Sector picker — pill-style switcher that pushes URL
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";

const SECTOR_LABELS: Record<string, { name: string; tone: string }> = {
  IGV:  { name: "Software & Tech",       tone: "info" },
  SOXX: { name: "Semiconductors",        tone: "violet" },
  XBI:  { name: "Biotechnology",         tone: "ok" },
  XLF:  { name: "Financials & Fintech",  tone: "warn" },
  FDN:  { name: "Internet & Digital",    tone: "info" },
};

export function SectorPicker({ sectors, current }: { sectors: string[]; current: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const select = (s: string) => {
    const np = new URLSearchParams(params.toString());
    np.set("sector", s);
    startTransition(() => router.push(`/modules/sector-deep-dive?${np.toString()}`));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-gold-700 font-semibold mr-1">
        SECTOR
      </span>
      {sectors.map((s) => {
        const active = s === current;
        const info = SECTOR_LABELS[s] ?? { name: s, tone: "info" };
        return (
          <button
            key={s}
            onClick={() => select(s)}
            className={[
              "px-3 py-1.5 rounded-md text-[0.86rem] border transition-all flex items-center gap-2",
              active
                ? "bg-ink-900 text-paper-50 border-ink-900 shadow-sm"
                : "bg-paper-200 text-ink-700 border-ink-100 hover:border-gold-300 hover:bg-paper-300",
            ].join(" ")}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-gold-500" : "bg-ink-300"}`} />
            <span className="font-mono font-semibold text-[0.7rem] tracking-wider">{s}</span>
            <span className={active ? "text-paper-50/80" : "text-ink-500"}>{info.name}</span>
          </button>
        );
      })}
      {pending && <Loader2 size={14} className="animate-spin text-ink-300 ml-2" />}
    </div>
  );
}
