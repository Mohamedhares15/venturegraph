"use server";
// Portfolio X-Ray — server action: fuzzy-match + aggregate + receipt
import path from "node:path";
import {
  loadTps,
  loadInvPanel,
  loadPartition,
  loadCommunities,
  loadAcquisitions,
  loadIpos,
  loadInvestorUniverse,
  median,
  mean,
  quantile,
} from "@/lib/data";
import { parsePortfolio, matchInvestors, type MatchResult } from "@/lib/fuzzy";
import { sha256File, sha256Obj, buildReceipt } from "@/lib/crypto";

export interface SectorExposure {
  sector: string;
  deals: number;
  unique_companies: number;
  unique_gps: number;
}

export interface CommunityExposure {
  community_id: number;
  my_gps: number;
  community_size?: number;
  top_sectors?: string;
}

export interface XRayResult {
  ok: true;
  inputCount: number;
  matched: MatchResult[];
  matchedNames: string[];
  unmatched: string[];
  summary: {
    n_matched: number;
    universe_mean: number;
    universe_median: number;
    universe_p90: number;
    portfolio_mean: number;
    portfolio_median: number;
    portfolio_max: number;
    portfolio_min: number;
    portfolio_std: number;
    n_above_universe: number;
    n_top_decile: number;
    n_below_median: number;
    total_portfolio_size: number;
    alpha_vs_universe: number;
  };
  sectorExposure: SectorExposure[];
  communityExposure: CommunityExposure[];
  exits: {
    n_acq: number;
    n_ipo: number;
    n_companies: number;
    exit_rate: number;
  };
  receipt: {
    receiptHash: string;
    protocolHash: string;
    inputHash: string;
    outputHash: string;
    sealedAtUtc: string;
  };
}
export interface XRayError { ok: false; error: string }
export type XRayResponse = XRayResult | XRayError;

export async function runPortfolioXRay(rawText: string): Promise<XRayResponse> {
  const inputs = parsePortfolio(rawText);
  if (!inputs.length) return { ok: false, error: "Provide at least one investor name." };

  const [tps, invPanel, partition, communities, acq, ipos, universe] =
    await Promise.all([
      loadTps(),
      loadInvPanel(),
      loadPartition(),
      loadCommunities(),
      loadAcquisitions(),
      loadIpos(),
      loadInvestorUniverse(),
    ]);

  const matches = matchInvestors(inputs, universe);
  const matchedNames = matches.filter((m) => m.matched).map((m) => m.matched!) as string[];
  const unmatched = matches.filter((m) => !m.matched).map((m) => m.input);

  // ── Summary stats over the matched portfolio ───────────────────────────
  const tpsValues = tps.map((r) => Number(r.tps) || 0);
  const universe_mean = mean(tpsValues);
  const universe_median = median(tpsValues);
  const universe_p90 = quantile(tpsValues, 0.9);

  const sub = tps.filter((r) => matchedNames.includes(r.investor));
  const subTps = sub.map((r) => Number(r.tps) || 0);
  const subSizes = sub.map((r) => Number(r.portfolio_size) || 0);

  const portfolio_mean = sub.length ? mean(subTps) : 0;
  const portfolio_median = sub.length ? median(subTps) : 0;
  const portfolio_max = sub.length ? Math.max(...subTps) : 0;
  const portfolio_min = sub.length ? Math.min(...subTps) : 0;
  const portfolio_std = sub.length > 1
    ? Math.sqrt(
        subTps.reduce((s, v) => s + (v - portfolio_mean) ** 2, 0) / (subTps.length - 1),
      )
    : 0;

  // ── Sector exposure ────────────────────────────────────────────────────
  const sectorMap = new Map<string, { deals: number; cos: Set<string>; gps: Set<string> }>();
  invPanel.forEach((r) => {
    const inv = r.investor_name as string | undefined;
    if (!inv || !matchedNames.includes(inv)) return;
    const sec = (r.sector_name ?? r.etf_primary) as string | undefined;
    if (!sec) return;
    let bucket = sectorMap.get(sec);
    if (!bucket) {
      bucket = { deals: 0, cos: new Set(), gps: new Set() };
      sectorMap.set(sec, bucket);
    }
    bucket.deals += 1;
    if (r.company_name) bucket.cos.add(r.company_name as string);
    bucket.gps.add(inv);
  });
  const sectorExposure: SectorExposure[] = Array.from(sectorMap.entries())
    .map(([sector, b]) => ({
      sector,
      deals: b.deals,
      unique_companies: b.cos.size,
      unique_gps: b.gps.size,
    }))
    .sort((a, z) => z.deals - a.deals);

  // ── Community exposure ────────────────────────────────────────────────
  const commById = new Map<number, { size?: number; top_sectors?: string }>();
  communities.forEach((c) => {
    commById.set(Number(c.community_id), {
      size: c.size as number | undefined,
      top_sectors: c.top_sectors as string | undefined,
    });
  });
  const myCommCounts = new Map<number, number>();
  partition.forEach((p) => {
    if (matchedNames.includes(p.investor)) {
      const k = Number(p.community_id);
      myCommCounts.set(k, (myCommCounts.get(k) ?? 0) + 1);
    }
  });
  const communityExposure: CommunityExposure[] = Array.from(myCommCounts.entries())
    .map(([community_id, my_gps]) => ({
      community_id,
      my_gps,
      community_size: commById.get(community_id)?.size,
      top_sectors: commById.get(community_id)?.top_sectors,
    }))
    .sort((a, z) => z.my_gps - a.my_gps)
    .slice(0, 10);

  // ── Exits — companies in matched portfolio that were acquired/IPO'd ──
  const portfolioCompanyIds = new Set<string>();
  invPanel.forEach((r) => {
    const inv = r.investor_name as string | undefined;
    if (inv && matchedNames.includes(inv) && r.funded_object_id)
      portfolioCompanyIds.add(String(r.funded_object_id));
  });
  const n_acq = acq.filter(
    (a) => a.acquired_object_id && portfolioCompanyIds.has(String(a.acquired_object_id)),
  ).length;
  const n_ipo = ipos.filter(
    (i) => i.object_id && portfolioCompanyIds.has(String(i.object_id)),
  ).length;
  const n_companies = portfolioCompanyIds.size;
  const exit_rate = n_companies ? ((n_acq + n_ipo) / n_companies) * 100 : 0;

  const summary = {
    n_matched: sub.length,
    universe_mean,
    universe_median,
    universe_p90,
    portfolio_mean,
    portfolio_median,
    portfolio_max,
    portfolio_min,
    portfolio_std,
    n_above_universe: subTps.filter((v) => v > universe_mean).length,
    n_top_decile: subTps.filter((v) => v >= universe_p90).length,
    n_below_median: subTps.filter((v) => v < universe_median).length,
    total_portfolio_size: subSizes.reduce((s, v) => s + v, 0),
    alpha_vs_universe: portfolio_mean - universe_mean,
  };

  // ── Audit receipt ────────────────────────────────────────────────────
  const protoPath = path.resolve(process.cwd(), "..", "preregistration.py");
  const protocolHash = (await sha256File(protoPath)) ?? "PROTOCOL_FILE_MISSING";
  const inputs_for_seal = { matchedNames: [...matchedNames].sort() };
  const output_for_seal = {
    summary,
    sectorExposureHash: sha256Obj(sectorExposure),
    communityExposureHash: sha256Obj(communityExposure),
    exits: { n_acq, n_ipo, n_companies, exit_rate },
  };
  const receipt = buildReceipt({
    module: "PORTFOLIO_X_RAY",
    inputs: inputs_for_seal,
    output: output_for_seal,
    protocolHash,
  });

  return {
    ok: true,
    inputCount: inputs.length,
    matched: matches,
    matchedNames,
    unmatched,
    summary,
    sectorExposure,
    communityExposure,
    exits: { n_acq, n_ipo, n_companies, exit_rate },
    receipt: {
      receiptHash: receipt.receiptHash,
      protocolHash: receipt.protocolHash,
      inputHash: receipt.inputHash,
      outputHash: receipt.outputHash,
      sealedAtUtc: receipt.sealedAtUtc,
    },
  };
}
