"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import { fmtInt } from "@/lib/utils";
import { Sliders, RefreshCcw, Shield } from "lucide-react";

interface InvestorSignals {
  investor: string;
  tps: number;
  eigenvector: number;
  betweenness: number;
  community: number;
  composite: number;
}

function sha256(text: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
    .then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""));
}

const DEFAULT_WEIGHTS = { tps: 0.35, eigenvector: 0.25, betweenness: 0.2, community: 0.1, topTier: 0.1 };

export default function SignalComposerPage() {
  const m = moduleBySlug("signal-composer")!;
  const [tpsData, setTpsData] = useState<Record<string, number>>({});
  const [centralityData, setCentralityData] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [receipt, setReceipt] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/data?name=tps").then((r) => r.json()),
      fetch("/api/data?name=centrality").then((r) => r.json()),
    ]).then(([tps, cent]) => {
      const tpsMap: Record<string, number> = {};
      (Array.isArray(tps) ? tps : []).forEach((r: Record<string, unknown>) => { tpsMap[String(r.investor)] = Number(r.tps) || 0; });
      setTpsData(tpsMap);
      setCentralityData(Array.isArray(cent) ? cent : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const scored = useMemo(() => {
    if (!centralityData.length) return [];
    const maxEig = Math.max(...centralityData.map((r) => Number(r.eigenvector) || 0), 0.001);
    const maxBet = Math.max(...centralityData.map((r) => Number(r.betweenness) || 0), 0.001);
    const maxTps = Math.max(...Object.values(tpsData), 0.001);

    return centralityData
      .filter((r) => r.investor)
      .map((r) => {
        const inv = String(r.investor);
        const normTps = (tpsData[inv] ?? 0) / maxTps;
        const normEig = (Number(r.eigenvector) || 0) / maxEig;
        const normBet = (Number(r.betweenness) || 0) / maxBet;
        const normComm = Number(r.community_id) ? 1 : 0;
        const topTier = normTps > 0.7 ? 1 : 0;
        const composite =
          weights.tps * normTps +
          weights.eigenvector * normEig +
          weights.betweenness * normBet +
          weights.community * normComm +
          weights.topTier * topTier;
        return { investor: inv, tps: normTps, eigenvector: normEig, betweenness: normBet, community: normComm, composite };
      })
      .sort((a, b) => b.composite - a.composite)
      .slice(0, 30);
  }, [centralityData, tpsData, weights]);

  const recompute = useCallback(async () => {
    const payload = { weights, timestamp: new Date().toISOString(), top: scored.slice(0, 5).map((s) => s.investor) };
    const hash = await sha256(JSON.stringify(payload));
    setReceipt(hash);
  }, [weights, scored]);

  const updateWeight = (key: keyof typeof weights, val: number) => {
    setWeights((prev) => ({ ...prev, [key]: val }));
    setReceipt("");
  };

  if (loading) return <div className="p-12 text-center text-ink-500">Loading signal primitives…</div>;

  return (
    <div className="sov-fade-up">
      <ModuleHero num={m.num} floor="FLOOR 03 · SIGNAL ENGINE" title={m.title} tagline={m.tagline}
        actions={<><StatusPill variant="ok"><span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />Live</StatusPill><StatusPill>{m.id}</StatusPill></>}>
        {m.description}
      </ModuleHero>

      <Section label="Weight configuration" title="Tune signal weights to compute custom composite scores">
        <Card>
          <div className="grid md:grid-cols-5 gap-6 mb-6">
            {(Object.entries(weights) as [keyof typeof weights, number][]).map(([key, val]) => (
              <div key={key}>
                <label className="sov-label mb-2 block capitalize">{key.replace(/([A-Z])/g, " $1")} — {(val * 100).toFixed(0)}%</label>
                <input type="range" min="0" max="100" value={val * 100}
                  onChange={(e) => updateWeight(key, Number(e.target.value) / 100)}
                  className="w-full accent-gold-600" />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button className="sov-btn sov-btn--primary" onClick={recompute}>
              <RefreshCcw size={14} /> Compute & seal
            </button>
            <button className="sov-btn sov-btn--ghost" onClick={() => { setWeights(DEFAULT_WEIGHTS); setReceipt(""); }}>
              Reset defaults
            </button>
          </div>
          {receipt && (
            <div className="mt-4 p-3 bg-ok-50 border border-ok-200 rounded-md font-mono text-[0.72rem] text-ok-800 break-all">
              <Shield size={12} className="inline mr-1" />
              Receipt SHA-256: {receipt}
            </div>
          )}
        </Card>
      </Section>

      <Section label="Composite leaderboard" title="Top 30 investors by custom composite score">
        <Card>
          <div className="overflow-auto max-h-[600px]">
            <table className="sov-table">
              <thead className="sticky top-0 bg-paper-50 z-10">
                <tr>
                  <th>#</th>
                  <th>Investor</th>
                  <th>Composite</th>
                  <th>TPS (norm)</th>
                  <th>Eigenvector</th>
                  <th>Betweenness</th>
                  <th>Community</th>
                </tr>
              </thead>
              <tbody>
                {scored.map((r, i) => (
                  <tr key={i}>
                    <td className="num">{i + 1}</td>
                    <td className="font-medium text-ink-900">{r.investor}</td>
                    <td className="num font-bold text-gold-700">{r.composite.toFixed(4)}</td>
                    <td className="num">{r.tps.toFixed(3)}</td>
                    <td className="num">{r.eigenvector.toFixed(3)}</td>
                    <td className="num">{r.betweenness.toFixed(3)}</td>
                    <td className="num">{r.community.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      <div className="grid md:grid-cols-3 gap-3 mb-8">
        <MetricCard label="Investors scored" value={fmtInt(centralityData.length)} accent="info" />
        <MetricCard label="TPS universe" value={fmtInt(Object.keys(tpsData).length)} accent="gold" />
        <MetricCard label="Total weight" value={`${(Object.values(weights).reduce((a, b) => a + b, 0) * 100).toFixed(0)}%`} accent={Object.values(weights).reduce((a, b) => a + b, 0) > 1.01 ? "warn" : "ok"} />
      </div>
    </div>
  );
}
