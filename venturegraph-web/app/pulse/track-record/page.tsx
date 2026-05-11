import type { Metadata } from "next";
import Link from "next/link";
import { fetchAllSignalsWithOutcomes, fetchTrackRecord, sectorLabel } from "@/lib/pulse";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Card, CardLabel } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { HashPill } from "@/components/ui/HashPill";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lead-Time Track Record · VentureGraph Live Pulse" };

function pct(n: number | null | undefined, d = 1): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(d)}%`;
}

function fmtExcess(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(2)}%`;
}

function outcomeColor(correct: boolean | null | undefined): string {
  if (correct == null) return "text-ink-300";
  return correct ? "text-ok-700" : "text-red-400";
}

export default async function TrackRecordPage() {
  const [allSignals, trackRecord] = await Promise.all([
    fetchAllSignalsWithOutcomes(50),
    fetchTrackRecord(),
  ]);

  const configured = isSupabaseConfigured();
  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  return (
    <div className="sov-fade-up">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Link
            href="/pulse"
            className="text-[0.72rem] font-mono text-ink-400 hover:text-gold-700"
          >
            ← Live Pulse
          </Link>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div>
            <div className="font-mono text-[0.6rem] tracking-[0.25em] text-ink-300 uppercase mb-0.5">
              FLOOR 00 · LIVE ENGINE
            </div>
            <h1 className="font-sans font-bold text-ink-900 text-2xl tracking-tight">
              Lead-Time Track Record
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <StatusPill variant="ok">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />
              {configured ? "LIVE" : "OFFLINE"}
            </StatusPill>
            <span className="font-mono text-[0.65rem] text-ink-300">{now}</span>
          </div>
        </div>
        <p className="text-ink-500 text-sm max-w-2xl">
          Every signal below was SHA-256 sealed and publicly deposited <em>before</em> its
          market outcome existed. Verify any receipt using the hash link — the timestamp
          proves the signal preceded the market move.
        </p>
      </div>

      {/* Aggregate stats */}
      <Section label="Aggregate performance" title="All signals — lifetime statistics">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <MetricCard
            label="Total signals"
            value={String(trackRecord?.total_signals ?? allSignals.length)}
            sub="sealed & deposited"
            accent="gold"
          />
          <MetricCard
            label="k=30 hit rate"
            value={pct(trackRecord?.hit_rate_k30)}
            sub="direction correct"
            accent="ok"
          />
          <MetricCard
            label="k=90 hit rate"
            value={pct(trackRecord?.hit_rate_k90)}
            sub="direction correct"
            accent="ok"
          />
          <MetricCard
            label="k=180 hit rate"
            value={pct(trackRecord?.hit_rate_k180)}
            sub="direction correct"
            accent="ok"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Mean excess α · k=90"
            value={fmtExcess(trackRecord?.mean_excess_alpha_k90)}
            sub="vs SPY benchmark"
            accent="info"
          />
          <MetricCard
            label="Mean excess α · k=180"
            value={fmtExcess(trackRecord?.mean_excess_alpha_k180)}
            sub="vs SPY benchmark"
            accent="info"
          />
          <MetricCard
            label="Mean lead time"
            value={
              trackRecord?.mean_lead_time_days
                ? `${Math.round(trackRecord.mean_lead_time_days)}d`
                : "—"
            }
            sub="signal before market move"
            accent="ink"
          />
          <MetricCard
            label="Median lead time"
            value={
              trackRecord?.median_lead_time_days
                ? `${Math.round(trackRecord.median_lead_time_days)}d`
                : "—"
            }
            sub="signal before market move"
            accent="ink"
          />
        </div>
      </Section>

      {/* Verification guide */}
      <Card className="mb-8 bg-paper-100">
        <CardLabel>How to independently verify any signal</CardLabel>
        <ol className="text-sm text-ink-600 mt-2 space-y-1 list-decimal list-inside">
          <li>
            Click any receipt hash below → opens the public verification page
          </li>
          <li>
            Note the <strong>issued_at</strong> timestamp (sealed before market outcome)
          </li>
          <li>
            Go to Yahoo Finance or any free price source, pull the ETF ticker for the
            date range starting at issued_at
          </li>
          <li>
            Confirm the direction (signal says NEGATIVE_ALPHA → ETF should underperform SPY)
          </li>
          <li>
            The receipt references an OSF DOI — independently verify the protocol version
            has not changed since the signal was issued
          </li>
        </ol>
      </Card>

      {/* Signal table */}
      <Section label="All signals" title="Signal log — newest first">
        {allSignals.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-400 py-6 text-center">
              No signals yet.{" "}
              {!configured
                ? "Configure Supabase to enable the live engine."
                : "Run: python live/run_all.py --loop signal"}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {allSignals.map((sig) => (
              <Card key={sig.id}>
                {/* Signal header */}
                <div className="flex flex-wrap items-start gap-4 mb-3">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[0.62rem] text-red-500 tracking-[0.2em] uppercase font-semibold">
                        {sig.direction.replace("_", " ")}
                      </span>
                      <span className="font-mono text-[0.62rem] text-ink-400 uppercase">
                        · {sig.sector} · {sectorLabel(sig.sector)}
                      </span>
                    </div>
                    <div className="text-[0.72rem] text-ink-500 font-mono">
                      SMS={sig.sms_value.toFixed(3)} · dev=+{sig.deviation_sigma.toFixed(2)}σ
                      · n={sig.n_silence_events}
                    </div>
                    <div className="text-[0.65rem] text-ink-300 font-mono mt-0.5">
                      Issued {new Date(sig.issued_at).toLocaleString("en-GB", {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit", timeZone: "UTC",
                      })} UTC
                    </div>
                  </div>
                  <Link href={`/verify/${sig.receipt_sha256}`}>
                    <HashPill hash={sig.receipt_sha256} />
                  </Link>
                </div>

                {/* Contributing investors */}
                {sig.contributing_investors && (() => {
                  const inv = typeof sig.contributing_investors === "string"
                    ? (() => { try { return JSON.parse(sig.contributing_investors); } catch { return []; } })()
                    : sig.contributing_investors;
                  return Array.isArray(inv) && inv.length > 0 ? (
                    <div className="text-[0.68rem] text-ink-400 mb-3">
                      <span className="font-mono uppercase tracking-wider text-ink-300">Silent:</span>{" "}
                      {inv.slice(0, 5).join(" · ")}
                    </div>
                  ) : null;
                })()}

                {/* Outcomes */}
                {sig.outcomes.length > 0 ? (
                  <div className="border-t border-ink-100 pt-3">
                    <div className="text-[0.62rem] font-mono text-ink-300 uppercase tracking-wider mb-2">
                      Market outcomes (ETF vs SPY excess return)
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {sig.outcomes.map((o) => (
                        <div
                          key={o.horizon_days}
                          className="bg-paper-100 border border-ink-100 rounded px-3 py-2 min-w-[80px]"
                        >
                          <div className="font-mono text-[0.6rem] text-ink-300 uppercase">
                            T+{o.horizon_days}d
                          </div>
                          <div
                            className={`font-mono text-sm font-bold mt-0.5 ${outcomeColor(
                              o.direction_correct
                            )}`}
                          >
                            {fmtExcess(o.excess_return)}
                          </div>
                          <div className="font-mono text-[0.58rem] text-ink-300">
                            {o.direction_correct == null
                              ? "pending"
                              : o.direction_correct
                              ? "✓ correct"
                              : "✗ wrong"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-ink-100 pt-2 text-[0.68rem] text-ink-300 font-mono">
                    Outcomes pending (market loop runs daily after close)
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
