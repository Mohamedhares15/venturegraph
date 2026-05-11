"use client";
import { useEffect, useState, useMemo } from "react";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import { fmtInt } from "@/lib/utils";

interface EventRow {
  sector: string;
  eval_date: string;
  sms_score: number;
  ssi?: number;
  ssi_norm?: number;
  alpha_k12?: number;
  signal_dir?: string;
  [k: string]: unknown;
}

const SEVERITY_COLORS: Record<string, string> = {
  bearish: "text-red-600 bg-red-50 border-red-200",
  bullish: "text-emerald-700 bg-emerald-50 border-emerald-200",
  neutral: "text-ink-600 bg-paper-100 border-ink-200",
};

export default function IntelligenceFeedPage() {
  const m = moduleBySlug("intelligence-feed")!;
  const [events, setEvents] = useState<EventRow[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/data?name=event_panel")
      .then((r) => r.json())
      .then((d) => { setEvents(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const sectors = useMemo(() => [...new Set(events.map((e) => e.sector))].sort(), [events]);

  const filtered = useMemo(() => {
    let rows = events;
    if (filter !== "all") rows = rows.filter((e) => e.signal_dir === filter);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((e) => e.sector.toLowerCase().includes(q) || e.eval_date?.includes(q));
    }
    return rows.sort((a, b) => (b.eval_date ?? "").localeCompare(a.eval_date ?? "")).slice(0, 200);
  }, [events, filter, search]);

  const bearishCount = events.filter((e) => e.signal_dir === "bearish").length;
  const bullishCount = events.filter((e) => e.signal_dir === "bullish").length;

  if (loading) return <div className="p-12 text-center text-ink-500">Loading intelligence feed…</div>;

  return (
    <div className="sov-fade-up">
      <ModuleHero num={m.num} floor="FLOOR 01 · WORKFLOW" title={m.title} tagline={m.tagline}
        actions={<><StatusPill variant="ok"><span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />Live</StatusPill><StatusPill>{m.id}</StatusPill></>}>
        {m.description}
      </ModuleHero>

      <Section label="Feed overview" title="Signal event summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Total events" value={fmtInt(events.length)} accent="ink" />
          <MetricCard label="Bearish signals" value={fmtInt(bearishCount)} accent="warn" />
          <MetricCard label="Bullish signals" value={fmtInt(bullishCount)} accent="ok" />
          <MetricCard label="Sectors tracked" value={fmtInt(sectors.length)} accent="info" />
        </div>
      </Section>

      <Section label="Event stream" title="Severity-ranked SMS / SSI / α events">
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            type="text" placeholder="Search sector or date…"
            className="sov-input flex-1 min-w-[200px]" value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {["all", "bearish", "bullish"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`sov-btn ${filter === f ? "sov-btn--primary" : "sov-btn--ghost"} !text-[0.8rem] capitalize`}>
              {f}
            </button>
          ))}
        </div>
        <Card>
          <div className="overflow-auto max-h-[600px]">
            <table className="sov-table">
              <thead className="sticky top-0 bg-paper-50 z-10">
                <tr>
                  <th>Date</th>
                  <th>Sector</th>
                  <th>SMS score</th>
                  <th>SSI</th>
                  <th>Alpha (k=12)</th>
                  <th>Direction</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => {
                  const dir = e.signal_dir ?? "neutral";
                  return (
                    <tr key={i}>
                      <td className="font-mono text-[0.8rem]">{e.eval_date}</td>
                      <td className="font-medium text-ink-900">{e.sector}</td>
                      <td className="num font-semibold">{Number(e.sms_score).toFixed(4)}</td>
                      <td className="num">{e.ssi != null ? Number(e.ssi).toFixed(3) : "—"}</td>
                      <td className="num">{e.alpha_k12 != null ? Number(e.alpha_k12).toFixed(4) : "—"}</td>
                      <td>
                        <span className={`inline-block px-2 py-0.5 rounded text-[0.75rem] font-semibold border ${SEVERITY_COLORS[dir] ?? SEVERITY_COLORS.neutral}`}>
                          {dir}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[0.72rem] text-ink-400 mt-2">Showing top {filtered.length} of {events.length} events</p>
        </Card>
      </Section>
    </div>
  );
}
