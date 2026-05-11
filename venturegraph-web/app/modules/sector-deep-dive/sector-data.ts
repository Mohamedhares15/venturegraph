import "server-only";
import {
  loadInvPanel, loadEventPanel, loadAlphas, loadAcquisitions,
  loadIpos, loadSms, loadTps, ETF_SECTOR,
} from "@/lib/data";

export interface SectorSnapshot {
  sector: string;
  sector_name: string;
  n_deals: number;
  n_companies: number;
  n_investors: number;
  earliest?: string;
  latest?: string;
  latest_sms?: { date: string; score: number };
  latest_alpha?: { date: string; alpha: number };
  mean_alpha?: number;
  alpha_observations: number;
}

export interface SectorTopInvestor { investor: string; deals: number; companies: number; tps: number }
export interface SectorTimeseries {
  sms: { date: string; sms_score: number; ssi?: number; ssi_norm?: number; alpha_k12?: number }[];
  alpha: { date: string; alpha: number }[];
  flow: { quarter: string; deals: number; unique_companies: number }[];
  stages: { stage: string; deals: number }[];
}

export interface SectorExits {
  acquisitions: { acquired_at: string; price_amount?: number }[];
  ipos: { public_at: string; valuation_amount?: number; stock_symbol?: string }[];
  rate: number;
}

export async function getSectorSnapshot(sector: string): Promise<SectorSnapshot> {
  const [invPanel, eventPanel, alphas] = await Promise.all([
    loadInvPanel(),
    loadEventPanel(),
    loadAlphas(),
  ]);
  const sub = invPanel.filter((r) => r.sector_name === sector || r.etf_primary === sector);
  const dates = sub
    .map((r) => String(r.funded_at ?? ""))
    .filter((d) => /^\d{4}/.test(d))
    .sort();
  const n_companies = new Set(
    sub.filter((r) => r.funded_object_id).map((r) => String(r.funded_object_id)),
  ).size;
  const n_investors = new Set(
    sub.filter((r) => r.investor_name).map((r) => String(r.investor_name)),
  ).size;

  const sectorPanel = eventPanel
    .filter((r) => r.sector === sector && r.sms_score !== undefined && r.eval_date)
    .sort((a, b) => String(a.eval_date).localeCompare(String(b.eval_date)));
  const lastSms = sectorPanel[sectorPanel.length - 1];

  const sectorAlpha = alphas
    .filter((r) => r.sector === sector || r.etf === sector)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const lastAlpha = sectorAlpha[sectorAlpha.length - 1];
  const meanAlpha = sectorAlpha.length
    ? sectorAlpha.reduce((s, r) => s + (Number(r.alpha) || 0), 0) / sectorAlpha.length
    : undefined;

  return {
    sector,
    sector_name: ETF_SECTOR[sector] ?? sector,
    n_deals: sub.length,
    n_companies,
    n_investors,
    earliest: dates[0]?.slice(0, 10),
    latest: dates[dates.length - 1]?.slice(0, 10),
    latest_sms: lastSms
      ? { date: String(lastSms.eval_date).slice(0, 10), score: Number(lastSms.sms_score) || 0 }
      : undefined,
    latest_alpha: lastAlpha
      ? { date: String(lastAlpha.date).slice(0, 10), alpha: Number(lastAlpha.alpha) || 0 }
      : undefined,
    mean_alpha: meanAlpha,
    alpha_observations: sectorAlpha.length,
  };
}

export async function getSectorTopInvestors(sector: string, n = 15): Promise<SectorTopInvestor[]> {
  const [invPanel, tps] = await Promise.all([loadInvPanel(), loadTps()]);
  const tpsLookup = new Map<string, number>();
  tps.forEach((r) => r.investor && tpsLookup.set(r.investor, Number(r.tps) || 0));
  const map = new Map<string, { deals: number; cos: Set<string> }>();
  invPanel.forEach((r) => {
    if (r.sector_name !== sector && r.etf_primary !== sector) return;
    const inv = r.investor_name as string | undefined;
    if (!inv) return;
    let b = map.get(inv);
    if (!b) {
      b = { deals: 0, cos: new Set() };
      map.set(inv, b);
    }
    b.deals += 1;
    if (r.company_name) b.cos.add(String(r.company_name));
  });
  return Array.from(map.entries())
    .map(([investor, b]) => ({
      investor,
      deals: b.deals,
      companies: b.cos.size,
      tps: tpsLookup.get(investor) ?? 0,
    }))
    .sort((a, z) => z.deals - a.deals)
    .slice(0, n);
}

export async function getSectorTimeseries(sector: string): Promise<SectorTimeseries> {
  const [eventPanel, alphas, invPanel, sms] = await Promise.all([
    loadEventPanel(),
    loadAlphas(),
    loadInvPanel(),
    loadSms(),
  ]);

  // SMS / SSI panel
  const smsRows = eventPanel.filter((r) => r.sector === sector && r.eval_date)
    .sort((a, b) => String(a.eval_date).localeCompare(String(b.eval_date)));
  const fallbackSms = smsRows.length === 0
    ? sms.filter((r) => r.sector === sector).sort((a, b) => String(a.eval_date).localeCompare(String(b.eval_date)))
    : [];
  const smsSeries = (smsRows.length ? smsRows : fallbackSms).map((r) => ({
    date: String(r.eval_date).slice(0, 10),
    sms_score: Number(r.sms_score) || 0,
    ssi: r.ssi !== undefined ? Number(r.ssi) : undefined,
    ssi_norm: r.ssi_norm !== undefined ? Number(r.ssi_norm) : undefined,
    alpha_k12: r.alpha_k12 !== undefined ? Number(r.alpha_k12) : undefined,
  }));

  // Alpha panel — quarterly mean for visual smoothing
  const sectorAlpha = alphas
    .filter((r) => r.sector === sector || r.etf === sector)
    .map((r) => ({ date: String(r.date), alpha: Number(r.alpha) || 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
  // resample monthly → quarterly
  const quartile = new Map<string, { sum: number; n: number }>();
  sectorAlpha.forEach((p) => {
    const d = new Date(p.date);
    if (Number.isNaN(d.valueOf())) return;
    const q = `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    let b = quartile.get(q);
    if (!b) {
      b = { sum: 0, n: 0 };
      quartile.set(q, b);
    }
    b.sum += p.alpha;
    b.n += 1;
  });
  const alphaSeries = Array.from(quartile.entries())
    .map(([q, v]) => {
      const [y, qq] = q.split("-Q");
      const month = (Number(qq) - 1) * 3;
      return { date: `${y}-${String(month + 1).padStart(2, "0")}-01`, alpha: v.sum / v.n };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // Quarterly deal flow
  const flowMap = new Map<string, { deals: number; cos: Set<string> }>();
  invPanel.forEach((r) => {
    if (r.sector_name !== sector && r.etf_primary !== sector) return;
    const d = String(r.funded_at ?? "");
    if (!/^\d{4}/.test(d)) return;
    const dt = new Date(d);
    if (Number.isNaN(dt.valueOf())) return;
    const q = `${dt.getUTCFullYear()}Q${Math.floor(dt.getUTCMonth() / 3) + 1}`;
    let b = flowMap.get(q);
    if (!b) {
      b = { deals: 0, cos: new Set() };
      flowMap.set(q, b);
    }
    b.deals += 1;
    if (r.funded_object_id) b.cos.add(String(r.funded_object_id));
  });
  const flow = Array.from(flowMap.entries())
    .map(([quarter, v]) => ({ quarter, deals: v.deals, unique_companies: v.cos.size }))
    .sort((a, z) => a.quarter.localeCompare(z.quarter));

  // Stage distribution
  const stageMap = new Map<string, number>();
  invPanel.forEach((r) => {
    if (r.sector_name !== sector && r.etf_primary !== sector) return;
    const stage = String(r.funding_round_type ?? "unknown");
    stageMap.set(stage, (stageMap.get(stage) ?? 0) + 1);
  });
  const stages = Array.from(stageMap.entries())
    .map(([stage, deals]) => ({ stage, deals }))
    .sort((a, z) => z.deals - a.deals);

  return { sms: smsSeries, alpha: alphaSeries, flow, stages };
}

export async function getSectorExits(sector: string): Promise<SectorExits> {
  const [invPanel, acq, ipos] = await Promise.all([
    loadInvPanel(),
    loadAcquisitions(),
    loadIpos(),
  ]);
  const sectorCompanyIds = new Set<string>();
  invPanel.forEach((r) => {
    if ((r.sector_name === sector || r.etf_primary === sector) && r.funded_object_id)
      sectorCompanyIds.add(String(r.funded_object_id));
  });

  const acquisitions = acq
    .filter((a) => a.acquired_object_id && sectorCompanyIds.has(String(a.acquired_object_id)))
    .map((a) => ({
      acquired_at: String(a.acquired_at ?? ""),
      price_amount: a.price_amount !== undefined ? Number(a.price_amount) : undefined,
    }));
  const iposed = ipos
    .filter((i) => i.object_id && sectorCompanyIds.has(String(i.object_id)))
    .map((i) => ({
      public_at: String(i.public_at ?? ""),
      valuation_amount: i.valuation_amount !== undefined ? Number(i.valuation_amount) : undefined,
      stock_symbol: i.stock_symbol as string | undefined,
    }));

  const rate = sectorCompanyIds.size
    ? ((acquisitions.length + iposed.length) / sectorCompanyIds.size) * 100
    : 0;

  return { acquisitions, ipos: iposed, rate };
}
