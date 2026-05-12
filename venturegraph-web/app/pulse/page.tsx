import type { Metadata } from "next";
import Link from "next/link";
import {
  fetchLiveSmsScores,
  fetchActiveSignals,
  fetchTrackRecord,
  fetchRecentEvents,
  fetchAllSignalsWithOutcomes,
  sectorLabel,
  signalColor,
} from "@/lib/pulse";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Card, CardLabel } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { HashPill } from "@/components/ui/HashPill";
import { PulseEntitySearch } from "./PulseEntitySearch";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Live Pulse · VentureGraph Sovereign",
};

const DEVIATION_LABEL: Record<string, { label: string; cls: string }> = {
  red:     { label: "SIGNAL · NEGATIVE ALPHA",  cls: "text-red-700 bg-red-50 border border-red-200" },
  amber:   { label: "WATCH",                     cls: "text-amber-700 bg-amber-50 border border-amber-200" },
  green:   { label: "POSITIVE DIVERGENCE",       cls: "text-ok-700 bg-ok-50 border border-ok-100" },
  neutral: { label: "NORMAL",                    cls: "text-ink-400 bg-paper-200 border border-ink-100" },
};

function pct(n: number | null | undefined, decimals = 1): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
}

function fmtReturn(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(2)}%`;
}

export default async function PulsePage() {
  const configured = isSupabaseConfigured();

  const [smsScores, activeSignals, trackRecord, recentEvents, allSignals] =
    await Promise.all([
      fetchLiveSmsScores(),
      fetchActiveSignals(10),
      fetchTrackRecord(),
      fetchRecentEvents(20),
      fetchAllSignalsWithOutcomes(30),
    ]);

  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  return (
    <div className="sov-fade-up">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="sov-seal !w-10 !h-10 !text-[0.5rem]">LP</div>
          <div>
            <div className="font-mono text-[0.6rem] tracking-[0.25em] text-ink-300 uppercase mb-0.5">
              FLOOR 00 · LIVE ENGINE
            </div>
            <h1 className="font-sans font-bold text-ink-900 text-2xl tracking-tight">
              Live Pulse
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <StatusPill variant="ok">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />
              {configured ? "LIVE" : "OFFLINE — configure Supabase"}
            </StatusPill>
            <span className="font-mono text-[0.65rem] text-ink-300">{now}</span>
          </div>
        </div>
        <p className="text-ink-500 text-sm max-w-2xl">
          Continuous early-warning engine. Live deal-flow ingestion every 5 minutes.
          Signal detection every 2 hours. Market benchmarking daily.
          Every signal is SHA-256 sealed and publicly verifiable.
        </p>
      </div>

      {/* ── Setup guide if Supabase not configured ──────────────────────── */}
      {!configured && (
        <Card variant="warn" className="mb-8">
          <CardLabel className="!text-amber-700">Supabase not configured</CardLabel>
          <p className="text-sm mt-2 text-ink-600">
            To activate live data, create a free Supabase project and add{" "}
            <code className="font-mono text-xs bg-paper-300 px-1 rounded">
              NEXT_PUBLIC_SUPABASE_URL
            </code>{" "}
            and{" "}
            <code className="font-mono text-xs bg-paper-300 px-1 rounded">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>{" "}
            to{" "}
            <code className="font-mono text-xs bg-paper-300 px-1 rounded">
              venturegraph-web/.env.local
            </code>
            .{" "}
            Then run{" "}
            <code className="font-mono text-xs bg-paper-300 px-1 rounded">
              supabase_schema.sql
            </code>{" "}
            in the Supabase SQL Editor. Full instructions in{" "}
            <code className="font-mono text-xs bg-paper-300 px-1 rounded">SETUP.md</code>.
          </p>
        </Card>
      )}

      {/* ── Track-record summary ─────────────────────────────────────────── */}
      <Section label="Track record" title="Signal performance summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
          <MetricCard
            label="Total signals issued"
            value={String(trackRecord?.total_signals ?? allSignals.length)}
            sub="since engine start"
            accent="gold"
          />
          <MetricCard
            label="Hit rate · k=90 days"
            value={pct(trackRecord?.hit_rate_k90)}
            sub="direction correct"
            accent="ok"
          />
          <MetricCard
            label="Mean excess alpha · k=90"
            value={fmtReturn(trackRecord?.mean_excess_alpha_k90)}
            sub="vs SPY benchmark"
            accent="info"
          />
          <MetricCard
            label="Mean lead time"
            value={
              trackRecord?.mean_lead_time_days
                ? `${Math.round(trackRecord.mean_lead_time_days)} days`
                : "—"
            }
            sub="signal before market move"
            accent="ink"
          />
        </div>
        <p className="text-[0.72rem] text-ink-300 font-mono">
          Every signal above was sealed before its market outcome existed.
          Verify any receipt at{" "}
          <Link href="/verify" className="underline">
            /verify/[receipt_hash]
          </Link>
          .
        </p>
      </Section>

      {/* ── Live sector grid ─────────────────────────────────────────────── */}
      <Section label="Sector state" title="Smart Money Silence by sector — today">
        {smsScores.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-400 py-4 text-center">
              No SMS scores yet — run the signal engine:{" "}
              <code className="font-mono text-xs bg-paper-300 px-1 rounded">
                python live/run_all.py --loop signal
              </code>
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {smsScores.map((s) => {
              const col = signalColor(s.deviation_sigma ?? 0);
              const lbl = DEVIATION_LABEL[col];
              const hasSignal = activeSignals.some((sig) => sig.sector === s.sector);
              return (
                <Card key={s.sector} className="relative">
                  {hasSignal && (
                    <div className="absolute top-3 right-3">
                      <span className="flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                      </span>
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-mono text-[0.62rem] text-ink-300 tracking-[0.2em] uppercase">
                        {s.sector}
                      </div>
                      <div className="font-sans font-semibold text-ink-800 text-[0.95rem]">
                        {sectorLabel(s.sector)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-end gap-4 mb-3">
                    <div>
                      <div className="font-mono text-2xl font-bold text-ink-900">
                        {s.sms_score.toFixed(3)}
                      </div>
                      <div className="text-[0.7rem] text-ink-400 mt-0.5">SMS score</div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`font-mono text-xl font-bold ${
                          (s.deviation_sigma ?? 0) >= 2
                            ? "text-red-600"
                            : (s.deviation_sigma ?? 0) <= -1.5
                            ? "text-ok-600"
                            : "text-ink-700"
                        }`}
                      >
                        {(s.deviation_sigma ?? 0) >= 0 ? "+" : ""}
                        {(s.deviation_sigma ?? 0).toFixed(2)}σ
                      </div>
                      <div className="text-[0.7rem] text-ink-400 mt-0.5">vs baseline</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[0.62rem] font-mono tracking-[0.15em] px-2 py-0.5 rounded ${lbl.cls}`}
                    >
                      {lbl.label}
                    </span>
                    <span className="text-[0.65rem] text-ink-300 font-mono">
                      n={s.n_expected ?? "—"}
                    </span>
                  </div>
                  {hasSignal && (
                    <div className="mt-3 pt-3 border-t border-ink-100">
                      {activeSignals
                        .filter((sig) => sig.sector === s.sector)
                        .slice(0, 1)
                        .map((sig) => (
                          <Link
                            key={sig.id}
                            href={`/verify/${sig.receipt_sha256}`}
                            className="flex items-center gap-2 group"
                          >
                            <HashPill hash={sig.receipt_sha256} />
                            <span className="text-[0.65rem] text-ink-400 group-hover:text-gold-700">
                              view receipt →
                            </span>
                          </Link>
                        ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── Entity search ────────────────────────────────────────────────── */}
      <Section label="Entity intelligence" title="Search any company or investor in the world">
        <PulseEntitySearch />
      </Section>

      {/* ── Active signals ───────────────────────────────────────────────── */}
      {activeSignals.length > 0 && (
        <Section label="Active signals" title="Open signals — sealed before market move">
          <div className="space-y-3">
            {activeSignals.map((sig) => (
              <Card key={sig.id} className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-mono text-[0.62rem] text-red-500 tracking-[0.2em] uppercase font-semibold">
                    {sig.direction.replace("_", " ")} · {sig.sector}
                  </div>
                  <div className="text-sm text-ink-600 mt-0.5">
                    {sectorLabel(sig.sector)} · SMS={sig.sms_value.toFixed(3)} ·{" "}
                    dev=+{sig.deviation_sigma.toFixed(2)}σ
                  </div>
                  <div className="text-[0.65rem] text-ink-300 font-mono mt-0.5">
                    Issued {new Date(sig.issued_at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
                  </div>
                </div>
                <div>
                  <Link href={`/verify/${sig.receipt_sha256}`}>
                    <HashPill hash={sig.receipt_sha256} />
                  </Link>
                </div>
                <div>
                  <Link
                    href={`/pulse/track-record`}
                    className="text-[0.72rem] text-gold-700 hover:underline font-mono"
                  >
                    view outcomes →
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {/* ── Recent ingested events ───────────────────────────────────────── */}
      <Section label="Live feed" title="Latest funding events ingested">
        {recentEvents.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-400 py-4 text-center">
              No events yet — run:{" "}
              <code className="font-mono text-xs bg-paper-300 px-1 rounded">
                python live/run_all.py --loop ingest
              </code>
            </p>
          </Card>
        ) : (
          <Card>
            <div className="divide-y divide-ink-100">
              {recentEvents.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-3 py-2.5 hover:bg-paper-100 px-2 rounded"
                >
                  <span className="font-mono text-[0.62rem] text-ink-300 w-16 flex-shrink-0 uppercase">
                    {e.sector ?? "—"}
                  </span>
                  <span className="font-mono text-[0.62rem] text-ok-600 w-20 flex-shrink-0 uppercase">
                    {e.round_type ?? "—"}
                  </span>
                  <span className="flex-1 text-sm text-ink-700 truncate font-medium">
                    {e.company_name ?? "Unknown"}
                  </span>
                  <span className="text-[0.65rem] text-ink-300 font-mono flex-shrink-0">
                    {e.source}
                  </span>
                  {e.source_url && (
                    <a
                      href={e.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[0.65rem] text-gold-600 hover:underline flex-shrink-0"
                    >
                      source →
                    </a>
                  )}
                  <span className="text-[0.6rem] text-ink-200 font-mono flex-shrink-0 hidden lg:block">
                    {new Date(e.ingested_at).toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "UTC",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </Section>

      {/* ── Bottom nav ──────────────────────────────────────────────────── */}
      <div className="flex gap-4 mt-6">
        <Link
          href="/pulse/track-record"
          className="sov-btn text-sm px-4 py-2"
        >
          Full Track Record →
        </Link>
        <Link
          href="/verify"
          className="text-sm text-gold-700 hover:underline font-mono"
        >
          Verify a receipt →
        </Link>
      </div>
    </div>
  );
}
