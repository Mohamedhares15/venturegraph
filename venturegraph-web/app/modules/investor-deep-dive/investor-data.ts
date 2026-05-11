import "server-only";
import {
  loadTps, loadTpsPanel, loadCentrality, loadInvPanel,
  loadEdges, loadPartition, loadCommunities,
  loadAcquisitions, loadIpos,
} from "@/lib/data";
import { quantile } from "@/lib/data";

export interface InvestorProfile {
  name: string;
  tps?: { tps: number; portfolio_size: number; out_degree?: number };
  tpsPanel: { eval_date: string; tps: number; in_top_tier?: boolean }[];
  centrality?: {
    deg_in?: number;
    deg_out?: number;
    betweenness?: number;
    eigenvector?: number;
    out_deg_wt?: number;
    tps?: number;
  };
  community?: { id: number; size?: number; mean_tps?: number; top_sectors?: string };
  sectorPosture: { sector: string; deals: number; companies: number }[];
  coInvestors: { name: string; deals: number; weight: number; their_tps: number }[];
  portfolio: { name: string; first_funded: string; round_type: string; sector: string }[];
  exits: { acquisitions: number; ipos: number };
  percentiles: { tps?: number; betweenness?: number; eigenvector?: number };
}

export async function getInvestorProfile(name: string): Promise<InvestorProfile | null> {
  const target = name.trim();
  if (!target) return null;

  const [tps, tpsPanel, centrality, invPanel, edges, partition, communities, acq, ipos] =
    await Promise.all([
      loadTps(),
      loadTpsPanel(),
      loadCentrality(),
      loadInvPanel(),
      loadEdges(),
      loadPartition(),
      loadCommunities(),
      loadAcquisitions(),
      loadIpos(),
    ]);

  // Case-insensitive exact lookup
  const tpsRow = tps.find((r) => r.investor?.toLowerCase() === target.toLowerCase());
  const cRow = centrality.find((r) => r.investor?.toLowerCase() === target.toLowerCase());
  const partRow = partition.find((r) => r.investor?.toLowerCase() === target.toLowerCase());
  if (!tpsRow && !cRow && !partRow) return null;

  // Resolve canonical name
  const canonical = tpsRow?.investor ?? cRow?.investor ?? partRow?.investor ?? target;

  // ── Time-series ────────────────────────────────────────────────────────
  const ts = tpsPanel
    .filter((r) => r.investor === canonical)
    .map((r) => ({
      eval_date: String(r.eval_date),
      tps: Number(r.tps) || 0,
      in_top_tier: !!r.in_top_tier,
    }))
    .sort((a, b) => a.eval_date.localeCompare(b.eval_date));

  // ── Sector posture ─────────────────────────────────────────────────────
  const sectorMap = new Map<string, { deals: number; cos: Set<string> }>();
  invPanel.forEach((r) => {
    if (r.investor_name !== canonical) return;
    const sec = (r.sector_name ?? r.etf_primary) as string | undefined;
    if (!sec) return;
    let b = sectorMap.get(sec);
    if (!b) {
      b = { deals: 0, cos: new Set() };
      sectorMap.set(sec, b);
    }
    b.deals += 1;
    if (r.company_name) b.cos.add(r.company_name as string);
  });
  const sectorPosture = Array.from(sectorMap.entries())
    .map(([sector, b]) => ({ sector, deals: b.deals, companies: b.cos.size }))
    .sort((a, z) => z.deals - a.deals);

  // ── Co-investors ──────────────────────────────────────────────────────
  const coMap = new Map<string, { deals: number; weight: number }>();
  edges.forEach((e) => {
    let other: string | undefined;
    if (e.source === canonical) other = e.target;
    else if (e.target === canonical) other = e.source;
    if (!other) return;
    let b = coMap.get(other);
    if (!b) {
      b = { deals: 0, weight: 0 };
      coMap.set(other, b);
    }
    b.deals += 1;
    b.weight += Number(e.weight) || 1;
  });
  const tpsLookup = new Map<string, number>();
  tps.forEach((r) => r.investor && tpsLookup.set(r.investor, Number(r.tps) || 0));
  const coInvestors = Array.from(coMap.entries())
    .map(([name, b]) => ({
      name,
      deals: b.deals,
      weight: b.weight,
      their_tps: tpsLookup.get(name) ?? 0,
    }))
    .sort((a, z) => z.deals - a.deals)
    .slice(0, 20);

  // ── Portfolio (top 30 by recency) ─────────────────────────────────────
  const portfolio = invPanel
    .filter((r) => r.investor_name === canonical && r.company_name)
    .map((r) => ({
      name: String(r.company_name),
      first_funded: String(r.funded_at ?? ""),
      round_type: String(r.funding_round_type ?? ""),
      sector: String(r.sector_name ?? r.etf_primary ?? ""),
    }))
    .sort((a, z) => z.first_funded.localeCompare(a.first_funded))
    .slice(0, 30);

  // ── Exits — companies the investor invested in that hit acq/IPO ───────
  const portfolioCompanyIds = new Set<string>();
  invPanel.forEach((r) => {
    if (r.investor_name === canonical && r.funded_object_id)
      portfolioCompanyIds.add(String(r.funded_object_id));
  });
  const n_acq = acq.filter(
    (a) => a.acquired_object_id && portfolioCompanyIds.has(String(a.acquired_object_id)),
  ).length;
  const n_ipo = ipos.filter(
    (i) => i.object_id && portfolioCompanyIds.has(String(i.object_id)),
  ).length;

  // ── Percentile rank ───────────────────────────────────────────────────
  const tpsValues = tps.map((r) => Number(r.tps) || 0);
  const betweenValues = centrality.map((r) => Number(r.betweenness) || 0);
  const eigenValues = centrality.map((r) => Number(r.eigenvector) || 0);

  const pctRank = (val: number | undefined, arr: number[]) => {
    if (val === undefined || !arr.length) return undefined;
    let below = 0;
    for (const v of arr) if (v < val) below++;
    return (below / arr.length) * 100;
  };

  // ── Community ────────────────────────────────────────────────────────
  let community: InvestorProfile["community"] = undefined;
  if (partRow && partRow.community_id !== undefined) {
    const cid = Number(partRow.community_id);
    const cInfo = communities.find((c) => Number(c.community_id) === cid);
    community = {
      id: cid,
      size: cInfo?.size as number | undefined,
      mean_tps: cInfo?.mean_tps as number | undefined,
      top_sectors: cInfo?.top_sectors as string | undefined,
    };
  }

  return {
    name: canonical,
    tps: tpsRow
      ? {
          tps: Number(tpsRow.tps) || 0,
          portfolio_size: Number(tpsRow.portfolio_size) || 0,
          out_degree: Number(tpsRow.out_degree) || undefined,
        }
      : undefined,
    tpsPanel: ts,
    centrality: cRow
      ? {
          deg_in: Number(cRow.deg_in) || undefined,
          deg_out: Number(cRow.deg_out) || undefined,
          betweenness: Number(cRow.betweenness) || undefined,
          eigenvector: Number(cRow.eigenvector) || undefined,
          out_deg_wt: Number(cRow.out_deg_wt) || undefined,
          tps: Number(cRow.tps) || undefined,
        }
      : undefined,
    community,
    sectorPosture,
    coInvestors,
    portfolio,
    exits: { acquisitions: n_acq, ipos: n_ipo },
    percentiles: {
      tps: pctRank(tpsRow?.tps as number | undefined, tpsValues),
      betweenness: pctRank(cRow?.betweenness as number | undefined, betweenValues),
      eigenvector: pctRank(cRow?.eigenvector as number | undefined, eigenValues),
    },
  };
  void quantile; // keep import alive in case callers need it
}
