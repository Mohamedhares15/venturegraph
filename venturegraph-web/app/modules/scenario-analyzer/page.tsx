"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import { fmtInt } from "@/lib/utils";
import { GitBranch, Play, Shield } from "lucide-react";

interface TpsRow { investor: string; tps: number; portfolio_size: number; }

const SCENARIOS = [
  { id: "tech-winter", name: "Tech Winter", desc: "Valuations halve, funding dries up for 18 months", multipliers: { tps: 0.55, sms: 1.4, alpha: -0.12 } },
  { id: "esg-tilt", name: "ESG Tilt", desc: "ESG-focused funds gain 30% AUM; carbon-heavy sectors penalised", multipliers: { tps: 0.85, sms: 1.1, alpha: 0.04 } },
  { id: "mena-expansion", name: "MENA Expansion", desc: "GCC sovereign wealth funds double venture allocation", multipliers: { tps: 1.3, sms: 0.7, alpha: 0.09 } },
  { id: "ai-supercycle", name: "AI Super-Cycle", desc: "Generative AI drives massive reallocation to tech infrastructure", multipliers: { tps: 1.5, sms: 0.6, alpha: 0.18 } },
  { id: "liquidity-crunch", name: "Liquidity Crunch", desc: "Central banks raise rates 200bp; LP distributions freeze", multipliers: { tps: 0.4, sms: 1.8, alpha: -0.22 } },
];

function sha256(text: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
    .then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""));
}

export default function ScenarioAnalyzerPage() {
  const m = moduleBySlug("scenario-analyzer")!;
  const [tps, setTps] = useState<TpsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(SCENARIOS[0].id);
  const [receipt, setReceipt] = useState("");

  useEffect(() => {
    fetch("/api/data?name=tps").then((r) => r.json())
      .then((d) => { setTps(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const scenario = SCENARIOS.find((s) => s.id === selected) ?? SCENARIOS[0];

  const stressedPortfolio = useMemo(() => {
    return tps
      .map((r) => ({
        investor: r.investor,
        baseTps: Number(r.tps) || 0,
        stressedTps: (Number(r.tps) || 0) * scenario.multipliers.tps,
        portfolioSize: Number(r.portfolio_size) || 0,
        impact: ((scenario.multipliers.tps - 1) * 100),
      }))
      .sort((a, b) => b.stressedTps - a.stressedTps)
      .slice(0, 25);
  }, [tps, scenario]);

  const avgImpact = stressedPortfolio.length
    ? stressedPortfolio.reduce((s, r) => s + r.stressedTps - r.baseTps, 0) / stressedPortfolio.length
    : 0;

  const runScenario = useCallback(async () => {
    const payload = { scenario: scenario.id, timestamp: new Date().toISOString(), nInvestors: tps.length };
    const hash = await sha256(JSON.stringify(payload));
    setReceipt(hash);
  }, [scenario, tps.length]);

  if (loading) return <div className="p-12 text-center text-ink-500">Loading scenario data…</div>;

  return (
    <div className="sov-fade-up">
      <ModuleHero num={m.num} floor="FLOOR 03 · SIGNAL ENGINE" title={m.title} tagline={m.tagline}
        actions={<><StatusPill variant="ok"><span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />Live</StatusPill><StatusPill>{m.id}</StatusPill></>}>
        {m.description}
      </ModuleHero>

      <Section label="Select scenario" title="Macro stress-test configurations">
        <div className="grid md:grid-cols-5 gap-3 mb-4">
          {SCENARIOS.map((s) => (
            <button key={s.id} onClick={() => { setSelected(s.id); setReceipt(""); }}
              className={`text-left p-4 rounded-lg border-2 transition-all ${selected === s.id
                ? "border-gold-500 bg-gold-50"
                : "border-ink-100 bg-paper-100 hover:border-ink-200"}`}>
              <div className="font-semibold text-[0.88rem] text-ink-900">{s.name}</div>
              <p className="text-[0.75rem] text-ink-500 mt-1 leading-snug">{s.desc}</p>
              <div className="flex gap-2 mt-2 text-[0.68rem] font-mono">
                <span className={`${s.multipliers.tps >= 1 ? "text-ok-700" : "text-warn-700"}`}>TPS ×{s.multipliers.tps}</span>
                <span className={`${s.multipliers.alpha >= 0 ? "text-ok-700" : "text-warn-700"}`}>α {s.multipliers.alpha >= 0 ? "+" : ""}{(s.multipliers.alpha * 100).toFixed(0)}%</span>
              </div>
            </button>
          ))}
        </div>
      </Section>

      <Section label="Stress results" title={`Impact of "${scenario.name}" on top investors`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <MetricCard label="TPS multiplier" value={`×${scenario.multipliers.tps.toFixed(2)}`} accent={scenario.multipliers.tps >= 1 ? "ok" : "warn"} />
          <MetricCard label="SMS stress" value={`×${scenario.multipliers.sms.toFixed(2)}`} accent={scenario.multipliers.sms <= 1 ? "ok" : "warn"} />
          <MetricCard label="Alpha shift" value={`${scenario.multipliers.alpha >= 0 ? "+" : ""}${(scenario.multipliers.alpha * 100).toFixed(1)}%`} accent={scenario.multipliers.alpha >= 0 ? "ok" : "warn"} />
          <MetricCard label="Avg TPS Δ" value={avgImpact >= 0 ? `+${avgImpact.toFixed(4)}` : avgImpact.toFixed(4)} accent={avgImpact >= 0 ? "ok" : "warn"} />
        </div>
        <Card>
          <div className="overflow-auto max-h-[500px]">
            <table className="sov-table">
              <thead className="sticky top-0 bg-paper-50 z-10">
                <tr>
                  <th>#</th>
                  <th>Investor</th>
                  <th>Base TPS</th>
                  <th>Stressed TPS</th>
                  <th>Δ</th>
                  <th>Portfolio</th>
                </tr>
              </thead>
              <tbody>
                {stressedPortfolio.map((r, i) => (
                  <tr key={i}>
                    <td className="num">{i + 1}</td>
                    <td className="font-medium text-ink-900">{r.investor}</td>
                    <td className="num">{r.baseTps.toFixed(4)}</td>
                    <td className="num font-semibold">{r.stressedTps.toFixed(4)}</td>
                    <td className={`num font-semibold ${r.stressedTps >= r.baseTps ? "text-ok-700" : "text-warn-700"}`}>
                      {r.stressedTps >= r.baseTps ? "+" : ""}{(r.stressedTps - r.baseTps).toFixed(4)}
                    </td>
                    <td className="num">{r.portfolioSize}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="mt-4 flex items-center gap-3">
          <button className="sov-btn sov-btn--primary" onClick={runScenario}>
            <Play size={14} /> Run & seal receipt
          </button>
          {receipt && (
            <div className="font-mono text-[0.72rem] text-ok-700 break-all">
              <Shield size={12} className="inline mr-1" /> {receipt.slice(0, 32)}…
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
