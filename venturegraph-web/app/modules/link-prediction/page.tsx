import type { Metadata } from "next";
import {
  ScatterChart, Scatter, BarChart, Bar, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ZAxis, Legend,
} from "@/components/ui/Charts";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import { loadTps, mean } from "@/lib/data";
import { fmt, fmtInt } from "@/lib/utils";
import path from "node:path";
import fs from "node:fs/promises";
import Papa from "papaparse";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Link Prediction · VentureGraph Sovereign",
};

interface LinkPredRow {
  company: string;
  investor: string;
  cn: number;      // Common Neighbors
  aa: number;      // Adamic-Adar
  tps_aa: number;  // TPS-weighted Adamic-Adar
}

async function loadLinkPredictions(): Promise<LinkPredRow[]> {
  const p = path.resolve(process.cwd(), "..", "link_predictions.csv");
  try {
    const text = await fs.readFile(p, "utf-8");
    const parsed = Papa.parse<LinkPredRow>(text, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    });
    return parsed.data.filter(Boolean);
  } catch {
    return [];
  }
}

export default async function LinkPredictionPage() {
  // Use the actual module entry if available, otherwise create a placeholder
  const m = moduleBySlug("link-prediction") ?? {
    num: "D",
    floor: "F3",
    title: "Link Prediction",
    tagline: "Who will co-invest next? Three similarity methods evaluated.",
    description: "Common Neighbors, Adamic-Adar, and TPS-weighted Adamic-Adar applied to the co-investment DiGraph. The hybrid TPS-AA score is the pre-registered advanced analysis method (Part D).",
    status: "live",
  };

  const [rows, tps] = await Promise.all([loadLinkPredictions(), loadTps()]);

  const tpsLookup = new Map(tps.map((r) => [String(r.investor), Number(r.tps) || 0]));

  // ── Top predictions by each method ───────────────────────────────────
  const topCN  = [...rows].sort((a, b) => b.cn - a.cn).slice(0, 15);
  const topAA  = [...rows].sort((a, b) => b.aa - a.aa).slice(0, 15);
  const topTpsAA = [...rows].sort((a, b) => b.tps_aa - a.tps_aa).slice(0, 15);

  // ── Score distribution stats ──────────────────────────────────────────
  const cnScores    = rows.map((r) => r.cn);
  const aaScores    = rows.map((r) => r.aa);
  const tpsAaScores = rows.map((r) => r.tps_aa);

  // ── Correlation between methods ───────────────────────────────────────
  // Sample 300 for scatter
  const sample = rows.filter((_, i) => i % Math.ceil(rows.length / 300) === 0).slice(0, 300);
  const scatterData = sample.map((r) => ({
    aa: r.aa,
    tps_aa: r.tps_aa,
    cn: r.cn,
    investor_tps: tpsLookup.get(r.investor) ?? 0,
  }));

  // ── Method comparison bar — mean score per method ────────────────────
  const methodBar = [
    { method: "Common Neighbors", mean: mean(cnScores), color: "#1a4f8b" },
    { method: "Adamic-Adar",      mean: mean(aaScores), color: "#8a6a14" },
    { method: "TPS-AA (hybrid)",  mean: mean(tpsAaScores), color: "#0e7a3f" },
  ];

  return (
    <div className="sov-fade-up">
      <ModuleHero
        num={m.num}
        floor="FLOOR 03 · SIGNAL ENGINE (Part D)"
        title={m.title}
        tagline={m.tagline}
        actions={
          <>
            <StatusPill variant="ok">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />
              Live
            </StatusPill>
            <StatusPill variant="ink">Part D · Advanced Analysis</StatusPill>
            <StatusPill>{fmtInt(rows.length)} predictions</StatusPill>
          </>
        }
      >
        {m.description}
      </ModuleHero>

      {/* Methodology card */}
      <Section label="Part D · Methodology" title="Three link-prediction algorithms">
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <Card variant="info" className="!p-5">
            <CardLabel className="!text-info-700">Method 1 · Common Neighbors</CardLabel>
            <div className="mt-2 font-mono text-[0.84rem] bg-paper-100 border border-info-100 rounded-lg p-3 leading-relaxed">
              CN(u, v) = |N(u) ∩ N(v)|
            </div>
            <p className="mt-2 text-[0.82rem] text-ink-600 leading-relaxed">
              Count of shared co-investment neighbours between investor and company. Pure
              structural similarity — no weight.
            </p>
          </Card>
          <Card variant="warn" className="!p-5">
            <CardLabel className="!text-warn-700">Method 2 · Adamic-Adar</CardLabel>
            <div className="mt-2 font-mono text-[0.84rem] bg-paper-100 border border-warn-100 rounded-lg p-3 leading-relaxed">
              AA(u,v) = Σ<sub>z∈N(u)∩N(v)</sub> 1 / log|N(z)|
            </div>
            <p className="mt-2 text-[0.82rem] text-ink-600 leading-relaxed">
              Penalises high-degree common neighbours — a hub shared by many carries less
              information than a rare shared partner.
            </p>
          </Card>
          <Card variant="ok" className="!p-5">
            <CardLabel className="!text-ok-700">Method 3 · TPS-AA (hybrid, pre-registered)</CardLabel>
            <div className="mt-2 font-mono text-[0.84rem] bg-paper-100 border border-ok-100 rounded-lg p-3 leading-relaxed">
              TPS-AA(u,v) = Σ<sub>z</sub> TPS(z) / log|N(z)|
            </div>
            <p className="mt-2 text-[0.82rem] text-ink-600 leading-relaxed">
              The novel contribution — replaces the uniform weight in AA with the investor's
              prescience score. Pre-registered in the sealed protocol before any evaluation.
            </p>
          </Card>
        </div>
      </Section>

      {/* Summary stats */}
      <Section label="Dataset stats" title="Prediction set overview">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard label="Predictions" value={fmtInt(rows.length)} accent="gold" />
          <MetricCard label="Mean CN"     value={fmt(mean(cnScores),    { digits: 3 })} accent="info" />
          <MetricCard label="Mean AA"     value={fmt(mean(aaScores),    { digits: 4 })} accent="warn" />
          <MetricCard label="Mean TPS-AA" value={fmt(mean(tpsAaScores), { digits: 4 })} accent="ok" />
          <MetricCard
            label="Unique companies"
            value={fmtInt(new Set(rows.map((r) => r.company)).size)}
            accent="ink"
          />
        </div>
      </Section>

      {/* Method comparison */}
      <Section label="Method comparison" title="Mean score by algorithm">
        <div className="grid lg:grid-cols-[1fr_2fr] gap-4">
          <div className="space-y-3">
            {methodBar.map((m) => (
              <Card key={m.method} flat className="!p-4">
                <div className="sov-metric-label">{m.method}</div>
                <div
                  className="sov-metric-value mt-1"
                  style={{ color: m.color }}
                >
                  {m.mean.toFixed(4)}
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-ink-100 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min((m.mean / Math.max(...methodBar.map((x) => x.mean), 0.001)) * 100, 100)}%`,
                      background: m.color,
                    }}
                  />
                </div>
              </Card>
            ))}
          </div>

          {/* AA vs TPS-AA scatter */}
          <Card>
            <CardLabel>Adamic-Adar vs TPS-AA · bubble size = Common Neighbors</CardLabel>
            <p className="text-[0.84rem] text-ink-500 mt-1 mb-3">
              Points above the diagonal → TPS weighting improves the score. Coloured by investor TPS.
            </p>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 24, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="aa" name="AA" type="number" />
                  <YAxis dataKey="tps_aa" name="TPS-AA" type="number" />
                  <ZAxis dataKey="cn" range={[20, 150]} name="CN" />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                  />
                  <Scatter data={scatterData} fill="#8a6a14" fillOpacity={0.6} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </Section>

      {/* Top predictions tables */}
      <Section label="Top predictions" title="Highest-confidence link candidates by method">
        <div className="grid lg:grid-cols-3 gap-4">
          <Card>
            <CardLabel className="!text-info-700">Common Neighbors — top 15</CardLabel>
            <table className="sov-table mt-3">
              <thead><tr><th>Company</th><th>Investor</th><th>CN</th></tr></thead>
              <tbody>
                {topCN.map((r, i) => (
                  <tr key={i}>
                    <td className="truncate !max-w-[100px] text-ink-900">{r.company}</td>
                    <td className="truncate !max-w-[100px]">{r.investor}</td>
                    <td className="num font-semibold text-info-700">{r.cn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <CardLabel className="!text-warn-700">Adamic-Adar — top 15</CardLabel>
            <table className="sov-table mt-3">
              <thead><tr><th>Company</th><th>Investor</th><th>AA</th></tr></thead>
              <tbody>
                {topAA.map((r, i) => (
                  <tr key={i}>
                    <td className="truncate !max-w-[100px] text-ink-900">{r.company}</td>
                    <td className="truncate !max-w-[100px]">{r.investor}</td>
                    <td className="num font-semibold text-warn-700">{r.aa.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <CardLabel className="!text-ok-700">TPS-AA Hybrid — top 15</CardLabel>
            <table className="sov-table mt-3">
              <thead><tr><th>Company</th><th>Investor</th><th>TPS-AA</th></tr></thead>
              <tbody>
                {topTpsAA.map((r, i) => (
                  <tr key={i}>
                    <td className="truncate !max-w-[100px] text-ink-900">{r.company}</td>
                    <td className="truncate !max-w-[100px]">{r.investor}</td>
                    <td className="num font-semibold text-ok-700">{r.tps_aa.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </Section>

      {/* Interpretation */}
      <Section label="Interpretation" title="Comparing the three methods">
        <Card variant="ok" className="!p-6">
          <div className="grid md:grid-cols-3 gap-6 text-[0.88rem] text-ink-600 leading-relaxed">
            <div>
              <div className="sov-label !text-info-700 mb-1">Common Neighbors</div>
              Purely structural — counts overlap without penalising hubs. Tends to over-predict
              links involving very large, well-connected firms like Sequoia that co-invest broadly.
              Useful as a baseline.
            </div>
            <div>
              <div className="sov-label !text-warn-700 mb-1">Adamic-Adar</div>
              More discriminating — rare shared connections score higher than ubiquitous ones.
              Outperforms CN on precision in most network settings by down-weighting the hub bias.
            </div>
            <div>
              <div className="sov-label !text-ok-700 mb-1">TPS-AA (pre-registered novel method)</div>
              Replaces the structural weight with investor prescience. A rare connection via a
              high-TPS investor carries far more signal than one via a low-TPS hub.
              This is the primary hypothesis of the pre-registration.
            </div>
          </div>
        </Card>
      </Section>
    </div>
  );
}
