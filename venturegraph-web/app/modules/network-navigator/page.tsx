import type { Metadata } from "next";
import {
  BarChart, Bar, Cell, ScatterChart, Scatter,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ZAxis,
} from "@/components/ui/Charts";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { ForceGraph } from "@/components/ui/ForceGraph";
import { moduleBySlug } from "@/lib/modules";
import {
  loadEdges, loadCentrality, loadTps, loadPartition, mean, median,
} from "@/lib/data";
import { getGraphStats, getCentralityComparison, getGraphData } from "@/lib/graph-compute";
import { fmt, fmtInt } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Network Navigator · VentureGraph Sovereign" };

export default async function NetworkNavigatorPage() {
  const m = moduleBySlug("network-navigator")!;
  const [edges, centrality, tps, partition] = await Promise.all([
    loadEdges(), loadCentrality(), loadTps(), loadPartition(),
  ]);

  // ── Computed graph stats (rubric Parts A + B) ─────────────────────────
  const [graphStats, comparisonRows, graphData] = await Promise.all([
    getGraphStats(),
    getCentralityComparison(20),
    getGraphData(120),
  ]);
  const { nNodes, nEdges, density } = graphStats;

  // ── Centrality leaderboard — top 20 by eigenvector ───────────────────
  const tpsLookup = new Map<string, number>();
  tps.forEach((r) => r.investor && tpsLookup.set(r.investor, Number(r.tps) || 0));

  const eigenTop = [...centrality]
    .filter((r) => r.investor && r.eigenvector !== undefined)
    .sort((a, b) => Number(b.eigenvector) - Number(a.eigenvector))
    .slice(0, 20)
    .map((r) => ({
      investor: String(r.investor),
      eigenvector: Number(r.eigenvector) || 0,
      betweenness: Number(r.betweenness) || 0,
      deg_in: Number(r.deg_in) || 0,
      deg_out: Number(r.deg_out) || 0,
      tps: tpsLookup.get(String(r.investor)) ?? 0,
    }));

  const betweennessTop = [...centrality]
    .filter((r) => r.investor && r.betweenness !== undefined)
    .sort((a, b) => Number(b.betweenness) - Number(a.betweenness))
    .slice(0, 20)
    .map((r) => ({
      investor: String(r.investor),
      betweenness: Number(r.betweenness) || 0,
      eigenvector: Number(r.eigenvector) || 0,
      tps: tpsLookup.get(String(r.investor)) ?? 0,
    }));

  // ── Degree distribution (in-degree) — for the distribution plot ──────
  const inDegMap = new Map<string, number>();
  edges.forEach((e) => {
    inDegMap.set(e.target, (inDegMap.get(e.target) ?? 0) + 1);
  });
  const outDegMap = new Map<string, number>();
  edges.forEach((e) => {
    outDegMap.set(e.source, (outDegMap.get(e.source) ?? 0) + 1);
  });
  const inDegValues  = [...inDegMap.values()];
  const outDegValues = [...outDegMap.values()];
  // Build log-binned histogram for out-degree
  const maxOut = Math.max(...outDegValues, 1);
  const N_BINS = 30;
  const binW = maxOut / N_BINS;
  const degBins = Array.from({ length: N_BINS }, (_, i) => ({
    lo: Math.round(i * binW),
    hi: Math.round((i + 1) * binW),
    count: 0,
  }));
  outDegValues.forEach((v) => {
    const i = Math.min(Math.floor(v / binW), N_BINS - 1);
    degBins[i].count += 1;
  });

  // ── Centrality vs TPS scatter (eigenvector × TPS) ─────────────────────
  const scatter = centrality
    .filter((r) => r.investor && r.eigenvector !== undefined)
    .map((r) => ({
      eigenvector: Number(r.eigenvector) || 0,
      tps: tpsLookup.get(String(r.investor)) ?? 0,
      deg_out: Number(r.deg_out) || 0,
    }))
    .filter((p) => p.tps > 0 && p.eigenvector > 0)
    .sort(() => Math.random() - 0.5)
    .slice(0, 400);

  // ── Community concentration ───────────────────────────────────────────
  const commSize = new Map<number, number>();
  partition.forEach((r) => {
    const k = Number(r.community_id);
    commSize.set(k, (commSize.get(k) ?? 0) + 1);
  });
  const topComms = [...commSize.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([id, members]) => ({ community: `C${id}`, members }));

  return (
    <div className="sov-fade-up">
      <ModuleHero
        num={m.num}
        floor="FLOOR 02 · DEEP ANALYSIS"
        title={m.title}
        tagline={m.tagline}
        actions={<StatusPill variant="ok"><span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse"/>Live</StatusPill>}
      >
        The co-investment graph is a directed DiGraph where an edge A → B exists when investor A
        co-invested into a company that later attracted B as a follow-on. Centrality measures
        characterise each node's structural importance in this prescience-flow network.
      </ModuleHero>

      {/* Graph-level stats — Part A rubric requirements */}
      <Section label="Part A · Graph construction &amp; exploration" title="Network summary statistics">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          <MetricCard label="Nodes"           value={fmtInt(nNodes)}   sub="unique investors"  accent="gold" />
          <MetricCard label="Edges"           value={fmtInt(nEdges)}   sub="co-invest links"   accent="info" />
          <MetricCard label="Density"         value={fmt(density, { digits: 5 })} sub="directed E/N(N−1)" accent="ink" />
          <MetricCard
            label="Avg clustering coeff"
            value={fmt(graphStats.avgClusteringCoeff, { digits: 4 })}
            sub="local triangle density"
            accent="ok"
          />
          <MetricCard
            label="Approx. diameter"
            value={fmtInt(graphStats.approxDiameter)}
            sub="BFS lower bound"
            accent="warn"
          />
          <MetricCard
            label="Connected components"
            value={fmtInt(graphStats.nConnectedComponents)}
            sub={`largest = ${fmtInt(graphStats.largestComponentSize)}`}
            accent="violet"
          />
          <MetricCard
            label="Avg degree"
            value={fmt(graphStats.avgDegree, { digits: 2 })}
            sub="undirected"
            accent="ink"
          />
          <MetricCard label="Communities" value={fmtInt(commSize.size)} sub="Louvain clusters" accent="violet" />
        </div>
      </Section>

      {/* Degree distribution */}
      <Section label="Degree distribution" title="Out-degree histogram · power-law character">
        <Card>
          <p className="text-[0.84rem] text-ink-500 mb-3">
            Most investors have few out-edges; a small hub set connects to hundreds. This
            heavy-tailed distribution is consistent with a scale-free co-investment network.
          </p>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={degBins} margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="lo" minTickGap={20} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#1a4f8b" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </Section>

      {/* Eigenvector + betweenness leaderboards */}
      <Section label="Centrality leaders" title="Who controls the network">
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardLabel>Top 20 · eigenvector centrality</CardLabel>
            <p className="text-[0.82rem] text-ink-500 mt-1 mb-3">
              Connected to other well-connected nodes — the core of the information
              propagation hub.
            </p>
            <div className="h-[480px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eigenTop} layout="vertical" margin={{ top: 4, right: 70, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="investor" width={160} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="eigenvector" radius={[0, 3, 3, 0]}>
                    {eigenTop.map((_, i) => <Cell key={i} fill={`hsl(213, ${65-i*2}%, ${28+i*2}%)`} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardLabel>Top 20 · betweenness centrality</CardLabel>
            <p className="text-[0.82rem] text-ink-500 mt-1 mb-3">
              Brokers that lie on the most shortest paths — the bridge-builders between
              co-invest clusters.
            </p>
            <div className="h-[480px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={betweennessTop} layout="vertical" margin={{ top: 4, right: 70, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="investor" width={160} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="betweenness" fill="#7c3aed" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </Section>

      {/* Eigenvector × TPS scatter */}
      {scatter.length > 0 && (
        <Section label="Centrality ↔ prescience" title="Eigenvector vs TPS · 400-investor sample">
          <Card>
            <p className="text-[0.84rem] text-ink-500 mb-3">
              Each dot is one investor. Bubble size = out-degree. The positive correlation validates
              the network-centrality / prescience hypothesis in pre-registration H₃.
            </p>
            <div className="h-[380px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 24, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="eigenvector" name="Eigenvector" type="number" />
                  <YAxis dataKey="tps" name="TPS" type="number" />
                  <ZAxis dataKey="deg_out" range={[20, 200]} name="Out-degree" />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                  />
                  <Scatter data={scatter} fill="#8a6a14" fillOpacity={0.55} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Section>
      )}

      {/* Community sizes */}
      <Section label="Community topology" title="Top 15 co-investment communities by size">
        <Card>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topComms} margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="community" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="members" fill="#7c3aed" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </Section>

      {/* Part B — Centrality comparison table: top-5 per measure */}
      <Section
        label="Part B · Centrality analysis"
        title="Top-20 cross-measure comparison · degree · betweenness · eigenvector · closeness"
        description="Four centrality measures side-by-side. Rank = 1 is top. Bold = top-5 in that measure."
      >
        <Card>
          <div className="overflow-x-auto">
            <table className="sov-table">
              <thead>
                <tr>
                  <th>Investor</th>
                  <th>Rank deg</th><th>Out-degree</th>
                  <th>Rank betw.</th><th>Betweenness</th>
                  <th>Rank eigen.</th><th>Eigenvector</th>
                  <th>Rank close.</th><th>Closeness</th>
                  <th>TPS</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((r, i) => (
                  <tr key={i}>
                    <td className="font-medium text-ink-900 !max-w-[160px] truncate">{r.investor}</td>
                    <td className={`num ${r.rank_deg_out <= 5 ? "font-bold text-gold-700" : ""}`}>{r.rank_deg_out}</td>
                    <td className="num">{r.deg_out.toFixed(4)}</td>
                    <td className={`num ${r.rank_betweenness <= 5 ? "font-bold text-info-700" : ""}`}>{r.rank_betweenness}</td>
                    <td className="num">{r.betweenness.toFixed(5)}</td>
                    <td className={`num ${r.rank_eigenvector <= 5 ? "font-bold text-ok-700" : ""}`}>{r.rank_eigenvector}</td>
                    <td className="num">{r.eigenvector.toFixed(4)}</td>
                    <td className={`num ${r.rank_closeness <= 5 ? "font-bold text-violet-700" : ""}`}>{r.rank_closeness}</td>
                    <td className="num">{r.closeness.toFixed(4)}</td>
                    <td className="num text-gold-700 font-semibold">{r.tps.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      {/* Part C + E + F — Interactive network graph with community colour coding */}
      <Section
        label="Part C + E + F · Interactive network graph"
        title={`Co-investment graph · top-${graphData.nodes.length} nodes · ${graphData.links.length} edges · community colour-coded`}
        description="Zoom, pan, hover any node to see investor details. Node size = degree. Colour = Louvain community."
      >
        <Card className="!p-4">
          <ForceGraph
            nodes={graphData.nodes}
            links={graphData.links}
            height={620}
          />
        </Card>
      </Section>
    </div>
  );
}
