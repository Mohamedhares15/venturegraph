"use client";
// Portfolio X-Ray — client form + animated results
import { useState, useTransition } from "react";
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, LabelList, Cell,
} from "recharts";
import { Crosshair, Download, Loader2, AlertCircle } from "lucide-react";
import { runPortfolioXRay, type XRayResponse, type XRayResult } from "./actions";
import { Card, CardLabel } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { HashPill } from "@/components/ui/HashPill";
import { StatusPill } from "@/components/ui/StatusPill";
import { Section } from "@/components/ui/Section";
import { fmt, fmtInt } from "@/lib/utils";

const DEFAULT_PORTFOLIO = `Sequoia Capital
Andreessen Horowitz
Accel Partners
Kleiner Perkins
Benchmark
Greylock Partners
Bessemer Venture Partners
First Round Capital
SV Angel
Index Ventures`;

export function PortfolioXRayClient() {
  const [text, setText] = useState(DEFAULT_PORTFOLIO);
  const [result, setResult] = useState<XRayResponse | null>(null);
  const [pending, startTransition] = useTransition();

  const onRun = () => {
    startTransition(async () => {
      const r = await runPortfolioXRay(text);
      setResult(r);
    });
  };

  const onExport = () => {
    if (!result || !result.ok) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio_xray_${result.receipt.receiptHash.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ── Input form ──────────────────────────────────────────────────── */}
      <Card className="!p-0 overflow-hidden">
        <div className="grid lg:grid-cols-[1fr_auto] gap-0">
          <div className="p-5">
            <CardLabel>Portfolio · one investor per line</CardLabel>
            <p className="text-[0.85rem] text-ink-500 mt-1 mb-3">
              Newlines, commas, or semicolons accepted. Names fuzzy-matched (≥ 78% similarity)
              against the {/* universe */}<b className="text-ink-900">1,789-investor</b> universe.
            </p>
            <textarea
              className="sov-input font-mono text-[0.86rem] !min-h-[180px] resize-y"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              placeholder="Sequoia Capital&#10;Andreessen Horowitz&#10;..."
            />
          </div>
          <div className="lg:w-[260px] bg-paper-100 border-l border-ink-100 p-5 flex flex-col justify-between">
            <div>
              <CardLabel>What this analyses</CardLabel>
              <ul className="mt-2 space-y-1.5 text-[0.82rem] text-ink-600">
                <li className="flex gap-2"><span className="text-gold-700 mt-0.5">·</span>TPS percentile vs. universe</li>
                <li className="flex gap-2"><span className="text-gold-700 mt-0.5">·</span>Sector exposure (HHI)</li>
                <li className="flex gap-2"><span className="text-gold-700 mt-0.5">·</span>Community concentration</li>
                <li className="flex gap-2"><span className="text-gold-700 mt-0.5">·</span>Realised exits rate</li>
                <li className="flex gap-2"><span className="text-gold-700 mt-0.5">·</span>SHA-256 receipt</li>
              </ul>
            </div>
            <button
              onClick={onRun}
              disabled={pending || !text.trim()}
              className="sov-btn sov-btn--primary mt-4 w-full"
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Crosshair size={15} strokeWidth={2} />}
              {pending ? "Analysing…" : "Run X-Ray"}
            </button>
          </div>
        </div>
      </Card>

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {result && !result.ok && (
        <Card variant="warn">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-warn-700 flex-shrink-0 mt-0.5" size={18} />
            <div>
              <CardLabel className="!text-warn-700">Could not run</CardLabel>
              <p className="text-ink-700 mt-1">{result.error}</p>
            </div>
          </div>
        </Card>
      )}

      {result && result.ok && <ResultsPanel result={result} onExport={onExport} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Results panel
// ════════════════════════════════════════════════════════════════════════
function ResultsPanel({ result, onExport }: { result: XRayResult; onExport: () => void }) {
  const s = result.summary;
  return (
    <div className="space-y-6 sov-fade-up">
      {/* Match summary */}
      <Section
        label="Match summary"
        title={`${result.matchedNames.length} of ${result.inputCount} names matched`}
        actions={
          <>
            <StatusPill variant="ok">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-500" />
              Receipt issued
            </StatusPill>
            <button onClick={onExport} className="sov-btn sov-btn--ghost">
              <Download size={14} strokeWidth={1.7} /> Export JSON
            </button>
          </>
        }
      >
        <div className="grid md:grid-cols-2 gap-3">
          <Card flat className="!p-4">
            <CardLabel>Matches</CardLabel>
            <ul className="mt-2 max-h-[180px] overflow-auto pr-1 divide-y divide-ink-100">
              {result.matched.map((m, i) => (
                <li key={i} className="py-1.5 flex items-center justify-between gap-3 text-[0.84rem]">
                  <span className="truncate flex-1">
                    <span className="text-ink-500">{m.input}</span>
                    {m.matched && m.matched !== m.input && (
                      <>
                        <span className="text-ink-300 mx-1">→</span>
                        <span className="text-ink-900">{m.matched}</span>
                      </>
                    )}
                  </span>
                  {m.matched ? (
                    <span className="font-mono text-[0.7rem] text-ok-700 bg-ok-100 px-2 py-0.5 rounded">
                      {(m.score * 100).toFixed(0)}%
                    </span>
                  ) : (
                    <span className="font-mono text-[0.7rem] text-risk-700 bg-risk-100 px-2 py-0.5 rounded">
                      no match
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <Card flat className="!p-4">
            <CardLabel>Unmatched ({result.unmatched.length})</CardLabel>
            {result.unmatched.length === 0 ? (
              <p className="text-ok-700 text-[0.86rem] mt-2">All inputs matched the universe.</p>
            ) : (
              <ul className="mt-2 text-[0.84rem] text-ink-600 space-y-0.5">
                {result.unmatched.map((u, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-warn-500" /> {u}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </Section>

      {/* Headline metrics */}
      <Section label="Prescience profile" title="How your portfolio scores vs. the universe">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Portfolio mean TPS"
            value={fmt(s.portfolio_mean, { digits: 3 })}
            sub={`universe μ = ${fmt(s.universe_mean, { digits: 3 })}`}
            accent="gold"
          />
          <MetricCard
            label="Alpha vs universe"
            value={fmt(s.alpha_vs_universe, { digits: 3, signed: true })}
            sub={`${s.alpha_vs_universe >= 0 ? "above" : "below"} mean`}
            accent={s.alpha_vs_universe >= 0 ? "ok" : "risk"}
            delta={s.alpha_vs_universe}
          />
          <MetricCard
            label="Top-decile names"
            value={fmtInt(s.n_top_decile)}
            sub={`of ${fmtInt(s.n_matched)} matched · ≥ P90`}
            accent="ok"
          />
          <MetricCard
            label="Below-median names"
            value={fmtInt(s.n_below_median)}
            sub="< universe median"
            accent="warn"
          />
        </div>
      </Section>

      {/* Sector + Community */}
      <Section
        label="Diversification"
        title="Sector exposure & community concentration"
      >
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardLabel>Sector exposure</CardLabel>
            <p className="text-[0.84rem] text-ink-500 mt-1 mb-3">
              Where your portfolio actually deploys capital.
            </p>
            {result.sectorExposure.length === 0 ? (
              <p className="text-ink-400 text-sm">No sector-attributed deals found.</p>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={result.sectorExposure.slice(0, 10)}
                    layout="vertical"
                    margin={{ top: 4, right: 60, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="sector" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip cursor={{ fill: "rgba(180,138,38,0.06)" }} />
                    <Bar dataKey="deals" fill="#8a6a14" radius={[0, 3, 3, 0]}>
                      <LabelList dataKey="deals" position="right" fill="#0b1f3a" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card>
            <CardLabel>Community concentration</CardLabel>
            <p className="text-[0.84rem] text-ink-500 mt-1 mb-3">
              How many of your GPs share a Louvain co-investment community.
            </p>
            {result.communityExposure.length === 0 ? (
              <p className="text-ink-400 text-sm">No community partition data.</p>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={result.communityExposure}
                    layout="vertical"
                    margin={{ top: 4, right: 60, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis
                      type="category"
                      dataKey="community_id"
                      tickFormatter={(v) => `C${v}`}
                      width={50}
                    />
                    <Tooltip cursor={{ fill: "rgba(124,58,237,0.06)" }} />
                    <Bar dataKey="my_gps" radius={[0, 3, 3, 0]}>
                      {result.communityExposure.map((_, i) => (
                        <Cell key={i} fill="#7c3aed" fillOpacity={1 - i * 0.05} />
                      ))}
                      <LabelList dataKey="my_gps" position="right" fill="#0b1f3a" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>
      </Section>

      {/* Exits */}
      <Section
        label="Realised liquidity"
        title="Exit rate on visible portfolio companies"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Acquisitions" value={fmtInt(result.exits.n_acq)} accent="ok" />
          <MetricCard label="IPOs" value={fmtInt(result.exits.n_ipo)} accent="ok" />
          <MetricCard label="Companies tracked" value={fmtInt(result.exits.n_companies)} accent="ink" />
          <MetricCard
            label="Exit rate"
            value={`${result.exits.exit_rate.toFixed(1)}%`}
            sub="acq + IPO / cos"
            accent={result.exits.exit_rate > 15 ? "ok" : "warn"}
          />
        </div>
      </Section>

      {/* Receipt */}
      <Section label="Compliance" title="Cryptographic audit receipt">
        <Card variant="ok">
          <div className="flex items-start gap-4">
            <div className="sov-seal !w-14 !h-14 !text-[0.55rem] flex-shrink-0">
              SHA<br />256
            </div>
            <div className="flex-1 min-w-0">
              <div className="grid md:grid-cols-2 gap-3 text-[0.85rem]">
                <ReceiptRow label="Receipt hash" value={<HashPill hash={result.receipt.receiptHash} truncate={32} variant="ok" />} />
                <ReceiptRow label="Protocol hash" value={<HashPill hash={result.receipt.protocolHash} truncate={32} variant="gold" />} />
                <ReceiptRow label="Input hash" value={<HashPill hash={result.receipt.inputHash} truncate={32} variant="ink" />} />
                <ReceiptRow label="Output hash" value={<HashPill hash={result.receipt.outputHash} truncate={32} variant="ink" />} />
                <ReceiptRow
                  label="Sealed at (UTC)"
                  value={<span className="font-mono text-[0.78rem] text-ink-700">{result.receipt.sealedAtUtc}</span>}
                />
                <ReceiptRow
                  label="Issuer"
                  value={<span className="font-mono text-[0.78rem] text-ink-700">VentureGraph Sovereign · EUI</span>}
                />
              </div>
            </div>
          </div>
        </Card>
      </Section>
    </div>
  );
}

function ReceiptRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-gold-700 font-semibold whitespace-nowrap">
        {label}
      </span>
      <span className="min-w-0 flex-1">{value}</span>
    </div>
  );
}
