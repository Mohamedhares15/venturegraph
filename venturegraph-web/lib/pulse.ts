// Server-side data fetchers for the Live Pulse feature.
// Reads from Supabase. Falls back to empty/mock data if Supabase is not configured.
import "server-only";
import {
  getSupabase, isSupabaseConfigured,
  type LiveSignal, type LiveSmsScore, type SignalOutcome,
  type TrackRecord, type FundingEvent, type LiveReceipt,
} from "./supabase";

const ETF_LABEL: Record<string, string> = {
  IGV:  "Software & Services",
  SOXX: "Semiconductors",
  XBI:  "Biotechnology",
  XLF:  "Financials & Fintech",
  FDN:  "Internet & Digital",
  ARKW: "Cloud / Next-Gen",
  HACK: "Cybersecurity",
  WCLD: "SaaS",
  IBB:  "Biotech (broad)",
  QCLN: "Clean Tech",
};

export function sectorLabel(etf: string): string {
  return ETF_LABEL[etf] ?? etf;
}

export function signalColor(deviation: number): "red" | "amber" | "green" | "neutral" {
  if (deviation >= 2.0) return "red";
  if (deviation >= 1.5) return "amber";
  if (deviation <= -1.5) return "green";
  return "neutral";
}

// ── Live SMS scores (current sector state) ───────────────────────────────────

export async function fetchLiveSmsScores(): Promise<LiveSmsScore[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from("sms_scores_live")
    .select("*")
    .order("score_date", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[pulse] fetchLiveSmsScores:", error.message);
    return [];
  }

  // Return the most recent score per sector
  const latest = new Map<string, LiveSmsScore>();
  for (const row of (data ?? []) as LiveSmsScore[]) {
    if (!latest.has(row.sector)) latest.set(row.sector, row);
  }
  return Array.from(latest.values()).sort(
    (a, b) => (b.deviation_sigma ?? 0) - (a.deviation_sigma ?? 0)
  );
}

// ── Active signals ────────────────────────────────────────────────────────────

export async function fetchActiveSignals(limit = 20): Promise<LiveSignal[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from("signals")
    .select("*")
    .eq("status", "active")
    .order("issued_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[pulse] fetchActiveSignals:", error.message);
    return [];
  }
  return (data ?? []) as LiveSignal[];
}

// ── Signal outcomes ────────────────────────────────────────────────────────────

export async function fetchSignalOutcomes(signalId: string): Promise<SignalOutcome[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from("signal_outcomes")
    .select("*")
    .eq("signal_id", signalId)
    .order("horizon_days");

  if (error) {
    console.error("[pulse] fetchSignalOutcomes:", error.message);
    return [];
  }
  return (data ?? []) as SignalOutcome[];
}

// ── All signals with their outcomes ──────────────────────────────────────────

export interface SignalWithOutcomes extends LiveSignal {
  outcomes: SignalOutcome[];
}

export async function fetchAllSignalsWithOutcomes(limit = 50): Promise<SignalWithOutcomes[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  if (!sb) return [];

  const { data: signals, error: se } = await sb
    .from("signals")
    .select("*")
    .order("issued_at", { ascending: false })
    .limit(limit);

  if (se || !signals?.length) return [];

  const { data: outcomes, error: oe } = await sb
    .from("signal_outcomes")
    .select("*")
    .in("signal_id", signals.map((s: LiveSignal) => s.id));

  if (oe) {
    console.error("[pulse] fetchAllSignalsWithOutcomes:", oe.message);
    return signals.map((s: LiveSignal) => ({ ...s, outcomes: [] }));
  }

  const outMap = new Map<string, SignalOutcome[]>();
  for (const o of (outcomes ?? []) as SignalOutcome[]) {
    if (!outMap.has(o.signal_id)) outMap.set(o.signal_id, []);
    outMap.get(o.signal_id)!.push(o);
  }

  return (signals as LiveSignal[]).map((s) => ({
    ...s,
    outcomes: (outMap.get(s.id) ?? []).sort((a, b) => a.horizon_days - b.horizon_days),
  }));
}

// ── Track record ──────────────────────────────────────────────────────────────

export async function fetchTrackRecord(): Promise<TrackRecord | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("track_record")
    .select("*")
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[pulse] fetchTrackRecord:", error.message);
    return null;
  }
  return data as TrackRecord | null;
}

// ── Recent funding events ─────────────────────────────────────────────────────

export async function fetchRecentEvents(limit = 30): Promise<FundingEvent[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from("funding_events")
    .select("*")
    .order("ingested_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[pulse] fetchRecentEvents:", error.message);
    return [];
  }
  return (data ?? []) as FundingEvent[];
}

// ── Receipt by hash ───────────────────────────────────────────────────────────

export async function fetchReceiptByHash(hash: string): Promise<LiveReceipt | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("receipts")
    .select("*")
    .eq("receipt_sha256", hash)
    .maybeSingle();

  if (error) {
    console.error("[pulse] fetchReceiptByHash:", error.message);
    return null;
  }
  return data as LiveReceipt | null;
}

// ── Receipt by id ──────────────────────────────────────────────────────────────

export async function fetchReceiptById(id: string): Promise<LiveReceipt | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("receipts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[pulse] fetchReceiptById:", error.message);
    return null;
  }
  return data as LiveReceipt | null;
}
