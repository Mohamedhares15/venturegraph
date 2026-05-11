// Supabase client for the Next.js app (anon / public key — read-only access).
// Writing is only done by the Python live engine using the service key.
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function _key(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
  );
}

export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = _key();
  if (!url || !key) return null;
  _client = createClient(url, key);
  return _client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && _key());
}

// ── Type mirrors of Supabase tables ──────────────────────────────────────────

export interface LiveSignal {
  id: string;
  sector: string;
  direction: string;
  sms_value: number;
  baseline_mean: number;
  baseline_sigma: number;
  deviation_sigma: number;
  n_silence_events: number;
  contributing_investors: string[];
  protocol_version: string;
  protocol_sha256: string;
  input_sha256: string;
  output_sha256: string;
  receipt_sha256: string;
  issued_at: string;
  status: string;
}

export interface LiveSmsScore {
  id: string;
  sector: string;
  score_date: string;
  sms_score: number;
  n_expected: number;
  n_silent: number;
  baseline_mean: number;
  baseline_sigma: number;
  deviation_sigma: number;
  computed_at: string;
}

export interface SignalOutcome {
  id: string;
  signal_id: string;
  sector: string;
  etf_ticker: string;
  observed_at: string;
  horizon_days: number;
  etf_return: number;
  spy_return: number;
  excess_return: number;
  direction_correct: boolean;
  ff5_alpha: number | null;
}

export interface LiveReceipt {
  id: string;
  receipt_type: string;
  entity_id: string | null;
  entity_name: string | null;
  entity_type: string | null;
  signal_id: string | null;
  payload: Record<string, unknown>;
  protocol_version: string;
  protocol_sha256: string;
  input_sha256: string;
  output_sha256: string;
  receipt_sha256: string;
  issued_at: string;
  verifiable_at_url: string | null;
}

export interface TrackRecord {
  id: string;
  computed_at: string;
  total_signals: number;
  signals_with_k30: number;
  signals_with_k90: number;
  hit_rate_k30: number | null;
  hit_rate_k60: number | null;
  hit_rate_k90: number | null;
  hit_rate_k180: number | null;
  mean_excess_alpha_k90: number | null;
  mean_excess_alpha_k180: number | null;
  mean_lead_time_days: number | null;
  median_lead_time_days: number | null;
}

export interface FundingEvent {
  id: string;
  company_name: string | null;
  investor_name: string | null;
  round_type: string | null;
  amount_usd: number | null;
  sector: string | null;
  country: string | null;
  source: string;
  source_url: string | null;
  announced_at: string;
  ingested_at: string;
}
