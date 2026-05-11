"use client";
import { useMemo } from "react";
import {
  BarChart, Bar, Cell, ScatterChart, Scatter,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ZAxis,
} from "@/components/ui/Charts";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import { useMultiData } from "@/lib/useData";
import { fmt, fmtInt, groupBy } from "@/lib/utils";

function mean(arr: number[]): number {
  const a = arr.filter(Number.isFinite);
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
}
function median(arr: number[]): number {
  const a = arr.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

const PALETTE = [
  "#8a6a14","#0e7a3f","#1a4f8b","#7c3aed","#d04444",
  "#a35a00","#0891b2","#065f46","#7e22ce","#be123c",
  "#0369a1","#854d0e","#166534","#1e3a5f","#6b21a8",
  "#b45309","#0f766e","#9f1239","#1d4ed8","#4a044e",
];

interface CommunityRow { community_id: number; size?: number; top_sectors?: string; top_investors?: string; [k: string]: unknown; }
interface PartitionRow { investor: string; community_id: number; [k: string]: unknown; }
interface CentralityRow { investor: string; tps?: number; [k: string]: unknown; }

export default function CommunityExplorerPage() {
  const m = moduleBySlug("community-explorer")!;
  const { data, loading } = useMultiData<{
    communities: CommunityRow[];
    partition: PartitionRow[];
    centrality: CentralityRow[];
  }>(["communities", "partition", "centrality"]);

  const communities = (data.communities ?? []) as CommunityRow[];
  const partition = (data.partition ?? []) as PartitionRow[];
  const centrality = (data.centrality ?? []) as CentralityRow[];

  const { commStats, top20, scatterData, nComms, totalNodes, sizesArr, largestComm, highestTpsComm } = useMemo(() => {
    const tpsLookup = new Map(centrality.map((r) => [String(r.investor), Number(r.tps) || 0]));
    const partByComm = groupBy(partition, (r) => Number(r.community_id));
    const commStats = [...partByComm.entries()]
      .map(([id, members]) => {
        const tpsVals = members.map((m) => tpsLookup.get(String(m.investor)) ?? 0).filter((v) => v > 0);
        const summaryRow = communities.find((c) => Number(c.community_id) === id);
        return {
          id,
          size: members.length,
          mean_tps: tpsVals.length ? mean(tpsVals) : 0,
          max_tps: tpsVals.length ? Math.max(...tpsVals) : 0,
          top_sectors: String(summaryRow?.top_sectors ?? "—"),
          top_investors: String(summaryRow?.top_investors ?? "—"),
        };
      })
      .sort((a, b) => b.size - a.size);

    const nComms = commStats.length;
    const totalNodes = partition.length;
    const sizesArr = commStats.map((c) => c.size);
    const largestComm = commStats[0];
    const highestTpsComm = [...commStats].sort((a, b) => b.mean_tps - a.mean_tps)[0];
    const top20 = commStats.slice(0, 20).map((c) => ({
      community: `C${c.id}`,
      size: c.size,
      mean_tps: c.mean_tps,
      color: PALETTE[c.id % PALETTE.length],
    }));
    const scatterData = commStats.map((c) => ({ size: c.size, mean_tps: c.mean_tps, cid: c.id }));
    return { commStats, top20, scatterData, nComms, totalNodes, sizesArr, largestComm, highestTpsComm };
  }, [communities, partition, centrality]);

  if (loading) return <div className="sov-fade-up p-12 text-center text-ink-500">Loading community data…</div>;

  return (
    <div className="sov-fade-up">
      <ModuleHero
        num={m.num}
        floor="FLOOR 02 · DEEP ANALYSIS"
        title={m.title}
        tagline={m.tagline}
        actions={
          <>
            <StatusPill variant="ok">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />
              Live
            </StatusPill>
            <StatusPill variant="ink">Part C · Community Detection</StatusPill>
            <StatusPill>{fmtInt(nComms)} communities</StatusPill>
          </>
        }
      >
        Community detection was performed using the Louvain algorithm on the
        undirected co-investment graph. Modularity maximisation assigns each investor to the
        community that best explains the observed clustering of co-investments.
      </ModuleHero>

      <Section label="Part C · Community detection" title="Louvain algorithm results"
        description="Modularity-maximising community assignment on the undirected co-investment graph.">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          <MetricCard label="Communities found" value={fmtInt(nComms)} sub="Louvain algorithm" accent="violet" />
          <MetricCard label="Total nodes" value={fmtInt(totalNodes)} sub="investors partitioned" accent="gold" />
          <MetricCard label="Largest community" value={`C${largestComm?.id}`} sub={`${fmtInt(largestComm?.size)} members`} accent="info" />
          <MetricCard label="Median community size" value={fmtInt(median(sizesArr))} sub={`mean = ${fmt(mean(sizesArr), { digits: 1 })}`} accent="ink" />
          <MetricCard label="Highest-TPS community" value={`C${highestTpsComm?.id}`} sub={`μTPS = ${fmt(highestTpsComm?.mean_tps, { digits: 3 })}`} accent="ok" />
        </div>

        <Card>
          <CardLabel>Community sizes — top 20 (colour = unique community ID)</CardLabel>
          <p className="text-[0.84rem] text-ink-500 mt-1 mb-3">
            Louvain partitions the {fmtInt(totalNodes)}-investor graph into {fmtInt(nComms)} communities.
            The distribution is heavy-tailed — a few large clusters surround the core hubs.
          </p>
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top20} margin={{ top: 4, right: 20, left: 4, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="community" tick={{ fontSize: 11 }}
                  label={{ value: "Community ID", position: "insideBottom", offset: -12, fontSize: 11 }} />
                <YAxis label={{ value: "Members", angle: -90, position: "insideLeft", fontSize: 11 }} />
                <Tooltip formatter={(v: unknown, n: unknown) =>
                  n === "size" ? [String(v), "Members"] : [Number(v).toFixed(3), "Mean TPS"]} />
                <Bar dataKey="size" radius={[3, 3, 0, 0]}>
                  {top20.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {top20.slice(0, 12).map((c) => (
              <span key={c.community} className="flex items-center gap-1.5 text-[0.72rem] text-ink-600">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: c.color }} />
                {c.community} ({c.size})
              </span>
            ))}
          </div>
        </Card>
      </Section>

      <Section label="Community quality" title="Size vs mean TPS — do larger communities have higher prescience?">
        <Card>
          <p className="text-[0.84rem] text-ink-500 mb-3">
            Each bubble is a community. The absence of a strong size–TPS correlation confirms
            that prescience clustering is not a size artefact.
          </p>
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 24, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="size" name="Community size" type="number"
                  label={{ value: "Community size", position: "insideBottom", offset: -5, fontSize: 11 }} />
                <YAxis dataKey="mean_tps" name="Mean TPS" type="number"
                  tickFormatter={(v) => Number(v).toFixed(3)}
                  label={{ value: "Mean TPS", angle: -90, position: "insideLeft", fontSize: 11 }} />
                <ZAxis range={[40, 180]} />
                <Tooltip formatter={(v: unknown, n: unknown) => [Number(v).toFixed(4), String(n)]}
                  cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={scatterData} fill="#7c3aed" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </Section>

      <Section label="Community profiles" title="All communities with sector and member signatures">
        <Card>
          <div className="overflow-auto max-h-[560px]">
            <table className="sov-table">
              <thead>
                <tr><th>Comm.</th><th>Members</th><th>Mean TPS</th><th>Max TPS</th><th>Top sectors</th><th>Key investors</th></tr>
              </thead>
              <tbody>
                {commStats.map((c, i) => (
                  <tr key={i}>
                    <td>
                      <span className="inline-flex items-center gap-2 font-mono font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
                          style={{ background: PALETTE[c.id % PALETTE.length] }} />
                        C{c.id}
                      </span>
                    </td>
                    <td className="num">{c.size}</td>
                    <td className={`num font-semibold ${c.mean_tps > 0.4 ? "text-ok-700" : "text-ink-700"}`}>
                      {c.mean_tps.toFixed(4)}
                    </td>
                    <td className="num text-gold-700">{c.max_tps.toFixed(4)}</td>
                    <td className="text-[0.78rem] text-ink-600 !max-w-[200px] truncate">
                      {c.top_sectors === "—" ? "—" : c.top_sectors.split(/[|,;]/).slice(0, 3).join(", ")}
                    </td>
                    <td className="text-[0.78rem] text-ink-600 !max-w-[200px] truncate">
                      {c.top_investors === "—" ? "—" : c.top_investors.split(/[|,;]/).slice(0, 2).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>
    </div>
  );
}
