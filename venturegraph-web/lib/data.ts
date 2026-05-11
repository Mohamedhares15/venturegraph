// Server-side CSV loader.
// Reads from the parent SNA project directory. All cached in-process.
import "server-only";
import path from "node:path";
import fs from "node:fs/promises";
import Papa from "papaparse";

// Resolve the SNA project root (where the CSVs live) robustly.
// process.cwd() changes between dev and production in Next.js, so we try
// multiple candidates and pick the first that contains tps_scores.csv.
function findDataRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), ".."),          // dev: cwd = venturegraph-web/
    path.resolve(process.cwd()),                 // fallback: cwd = project root
    path.resolve(__dirname, "../../.."),         // prod turbopack: .next/server/chunks/
    path.resolve(__dirname, "../.."),            // prod webpack: .next/server/
    path.resolve(__dirname, ".."),               // prod: .next/
    "C:\\Users\\Administrator\\Desktop\\SNA project", // absolute fallback
  ];
  for (const candidate of candidates) {
    try {
      // Synchronous check — runs once at module load time
      const { existsSync } = require("fs");
      if (existsSync(path.join(candidate, "tps_scores.csv"))) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }
  // Last resort — return cwd parent and let readCsv handle missing files gracefully
  return path.resolve(process.cwd(), "..");
}

const DATA_ROOT = findDataRoot();

// Also check for augmented data directory
function findAugmentedRoot(): string | null {
  const candidates = [
    path.join(DATA_ROOT, "data_augmented"),
    path.resolve(process.cwd(), "..", "data_augmented"),
    "C:\\Users\\Administrator\\Desktop\\SNA project\\data_augmented",
  ];
  for (const candidate of candidates) {
    try {
      const { existsSync } = require("fs");
      if (existsSync(path.join(candidate, "pipeline_report.json"))) {
        return candidate;
      }
    } catch { /* ignore */ }
  }
  return null;
}

const AUGMENTED_ROOT = findAugmentedRoot();

// ── Row shapes — mirror the Python pipeline outputs ─────────────────────────
export interface TpsRow {
  investor: string;
  tps: number;
  portfolio_size: number;
  out_degree?: number;
  top_tier_targets?: number;
  [k: string]: string | number | boolean | undefined;
}

export interface TpsPanelRow {
  investor: string;
  eval_date: string;
  tps: number;
  in_top_tier?: boolean;
  [k: string]: string | number | boolean | undefined;
}

export interface SmsRow {
  sector: string;
  eval_date: string;
  sms_score: number;
  n_expected?: number;
  n_silent?: number;
  sms_intensity?: number;
  top_silenced_investors?: string;
  [k: string]: string | number | boolean | undefined;
}

export interface EventPanelRow extends SmsRow {
  ssi?: number;
  ssi_norm?: number;
  alpha_k12?: number;
  n_entrants?: number;
  swarm_investors?: string;
  [k: string]: string | number | boolean | undefined;
}

export interface CommunityRow {
  community_id: number;
  size?: number;
  mean_tps?: number;
  top_investors?: string;
  top_sectors?: string;
  top_countries?: string;
  pct_series_a?: number;
  [k: string]: string | number | boolean | undefined;
}

export interface PartitionRow {
  investor: string;
  community_id: number;
}

export interface CentralityRow {
  investor: string;
  deg_in?: number;
  deg_out?: number;
  betweenness?: number;
  eigenvector?: number;
  out_deg_wt?: number;
  tps?: number;
  [k: string]: string | number | boolean | undefined;
}

export interface EdgeRow {
  source: string;
  target: string;
  company?: string;
  weight: number;
  [k: string]: string | number | boolean | undefined;
}

export interface InvPanelRow {
  investor_name?: string;
  funded_object_id?: string;
  company_name?: string;
  funded_at?: string;
  funding_round_type?: string;
  sector_name?: string;
  etf_primary?: string;
  [k: string]: string | number | boolean | undefined;
}

export interface AlphaRow {
  date: string;
  etf: string;
  alpha: number;
  sector: string;
  [k: string]: string | number | boolean | undefined;
}

export interface AcquisitionRow {
  acquired_object_id?: string;
  acquiring_object_id?: string;
  acquired_at?: string;
  price_amount?: number;
  price_currency_code?: string;
  term_code?: string;
  [k: string]: string | number | boolean | undefined;
}

export interface IpoRow {
  object_id?: string;
  public_at?: string;
  valuation_amount?: number;
  stock_symbol?: string;
  [k: string]: string | number | boolean | undefined;
}

export interface ObjectRow {
  id: string;
  name?: string;
  category_code?: string;
  country_code?: string;
  state_code?: string;
  city?: string;
  status?: string;
  founded_at?: string;
  [k: string]: string | number | boolean | undefined;
}

export interface SmsCorrRow {
  horizon: number | string;
  alpha_col: string;
  pearson_r: number;
  p_value: number;
  n_obs: number;
  signal_dir: string;
  [k: string]: string | number | boolean | undefined;
}

// ── Generic CSV reader with caching ─────────────────────────────────────────
const cache = new Map<string, unknown[]>();

async function readCsv<T>(filename: string): Promise<T[]> {
  if (cache.has(filename)) return cache.get(filename) as T[];
  const filePath = path.join(DATA_ROOT, filename);
  try {
    const text = await fs.readFile(filePath, "utf-8");
    const parsed = Papa.parse<T>(text, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    const rows = (parsed.data as T[]).filter(Boolean);
    cache.set(filename, rows as unknown[]);
    return rows;
  } catch {
    cache.set(filename, []);
    return [];
  }
}

// Read from augmented directory (data_augmented/) — used for augmented pipeline outputs
async function readAugCsv<T>(filename: string): Promise<T[]> {
  const cacheKey = `aug:${filename}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) as T[];
  if (!AUGMENTED_ROOT) { cache.set(cacheKey, []); return []; }
  const filePath = path.join(AUGMENTED_ROOT, filename);
  try {
    const text = await fs.readFile(filePath, "utf-8");
    const parsed = Papa.parse<T>(text, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    const rows = (parsed.data as T[]).filter(Boolean);
    cache.set(cacheKey, rows as unknown[]);
    return rows;
  } catch {
    cache.set(cacheKey, []);
    return [];
  }
}

// Read augmented JSON
async function readAugJson<T>(filename: string): Promise<T | null> {
  if (!AUGMENTED_ROOT) return null;
  try {
    const text = await fs.readFile(path.join(AUGMENTED_ROOT, filename), "utf-8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ── Public loaders ─────────────────────────────────────────────────────────
export const loadTps           = () => readCsv<TpsRow>("tps_scores.csv");
export const loadTpsPanel      = () => readCsv<TpsPanelRow>("tps_panel_expanding.csv");
export const loadSms           = () => readCsv<SmsRow>("sms_scores.csv");
export const loadEventPanel    = () => readCsv<EventPanelRow>("event_panel_sms.csv");
export const loadCommunities   = () => readCsv<CommunityRow>("community_summary.csv");
export const loadPartition     = () => readCsv<PartitionRow>("community_partition.csv");
export const loadCentrality    = () => readCsv<CentralityRow>("centrality_comparison.csv");
export const loadEdges         = () => readCsv<EdgeRow>("edges.csv");
export const loadInvPanel      = () => readCsv<InvPanelRow>("investment_sector_panel.csv");
export const loadAlphas        = () => readCsv<AlphaRow>("sector_alphas.csv");
export const loadAcquisitions  = () => readCsv<AcquisitionRow>("acquisitions.csv");
export const loadIpos          = () => readCsv<IpoRow>("ipos.csv");
export const loadObjects       = () => readCsv<ObjectRow>("objects.csv");
export const loadSmsCorr       = () => readCsv<SmsCorrRow>("sms_alpha_correlation.csv");

// Augmented data loaders
export const loadAugEdges      = () => readAugCsv<EdgeRow>("augmented_edges.csv");
export const loadAugTps        = () => readAugCsv<TpsRow>("augmented_tps_scores.csv");
export const loadAugSms        = () => readAugCsv<SmsRow>("augmented_sms_scores.csv");
export const loadExpandedSmsCorr = () => readAugCsv<SmsCorrRow>("expanded_sms_alpha_correlation.csv");
export const loadExpandedSmsMo   = () => readAugCsv<SmsRow>("expanded_sms_scores_monthly.csv");

export interface ExpansionSummary {
  n_obs_before: number;
  n_obs_after: number;
  sectors_before: number;
  sectors_after: number;
  panel_granularity: string;
  n_significant_horizons: number;
  min_p_value: number;
  best_horizon: string;
  [k: string]: unknown;
}
export const loadExpansionSummary = () => readAugJson<ExpansionSummary>("expansion_summary.json");

export interface PipelineReport {
  n_objects: number;
  n_rounds: number;
  n_investments: number;
  n_companies: number;
  n_investors: number;
  n_edges: number;
  n_tps: number;
  n_sms: number;
  max_tps: number;
  median_tps: number;
  power_before: number;
  power_after: number;
  [k: string]: unknown;
}
export const loadPipelineReport = () => readAugJson<PipelineReport>("pipeline_report.json");

export interface PowerAnalysis {
  n_before: number;
  n_after: number;
  power_before: number;
  power_after: number;
  n_required_80pct_power: number;
  sufficient_power: boolean;
  [k: string]: unknown;
}
export const loadPowerAnalysis = () => readAugJson<PowerAnalysis>("power_analysis.json");

// ── Sector / ETF dictionary (mirrors sovereign_mode.py) ─────────────────────
export const ETF_SECTOR: Record<string, string> = {
  IGV:  "Software & Services (Tech)",
  SOXX: "Semiconductors",
  XBI:  "Biotechnology",
  XLF:  "Financials & Fintech",
  FDN:  "Internet & Digital",
};

export const SECTORS = Object.keys(ETF_SECTOR);

// ── Universe of investors (sorted, deduplicated) ───────────────────────────
export async function loadInvestorUniverse(): Promise<string[]> {
  const [tps, partition, centrality] = await Promise.all([
    loadTps(),
    loadPartition(),
    loadCentrality(),
  ]);
  const set = new Set<string>();
  tps.forEach((r) => r.investor && set.add(r.investor));
  partition.forEach((r) => r.investor && set.add(r.investor));
  centrality.forEach((r) => r.investor && set.add(r.investor));
  return Array.from(set).sort();
}

// ── High-level snapshot used by the landing page ───────────────────────────
export async function loadSnapshot() {
  const [tps, sms, communities, edges, centrality, alphas, ipos, acq, eventPanel, report] =
    await Promise.all([
      loadTps(),
      loadSms(),
      loadCommunities(),
      loadEdges(),
      loadCentrality(),
      loadAlphas(),
      loadIpos(),
      loadAcquisitions(),
      loadEventPanel(),
      loadPipelineReport(),
    ]);

  // Use augmented pipeline report if available
  const hasAugmented = report !== null;
  return {
    nInvestors: hasAugmented ? report.n_investors : tps.length,
    nCommunities: communities.length,
    nEdges: hasAugmented ? report.n_edges : edges.length,
    nNodes: hasAugmented
      ? report.n_investors
      : new Set([...edges.map((e) => e.source), ...edges.map((e) => e.target)]).size,
    nSmsObservations: hasAugmented ? report.n_sms : sms.length,
    nEventPanel: eventPanel.length,
    nAlphas: alphas.length,
    nIpos: ipos.length,
    nAcquisitions: acq.length,
    nObjects: hasAugmented ? report.n_objects : 472_552,
    nCentrality: centrality.length,
    maxTps: hasAugmented ? report.max_tps : (tps.length ? Math.max(...tps.map((r) => Number(r.tps) || 0)) : 0),
    medianTps: hasAugmented ? report.median_tps : (tps.length ? median(tps.map((r) => Number(r.tps) || 0)) : 0),
    // Augmented-specific
    hasAugmented,
    nCompanies: hasAugmented ? report.n_companies : 0,
    nRounds: hasAugmented ? report.n_rounds : 0,
    nInvestments: hasAugmented ? report.n_investments : 0,
    nTps: hasAugmented ? report.n_tps : tps.length,
    powerBefore: hasAugmented ? report.power_before : 0,
    powerAfter: hasAugmented ? report.power_after : 0,
  };
}

// ── small numeric helpers ──────────────────────────────────────────────────
export function median(arr: number[]): number {
  const a = arr.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

export function mean(arr: number[]): number {
  const a = arr.filter(Number.isFinite);
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
}

export function quantile(arr: number[], q: number): number {
  const a = arr.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return 0;
  const pos = (a.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return a[base + 1] !== undefined ? a[base] + rest * (a[base + 1] - a[base]) : a[base];
}
