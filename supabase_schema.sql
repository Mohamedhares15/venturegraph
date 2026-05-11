-- ============================================================
-- VentureGraph Sovereign · Live Pulse · Supabase Schema
-- Run this once in the Supabase SQL Editor after creating
-- your free project at https://supabase.com
-- ============================================================

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Protocol versions (public, immutable) ────────────────
CREATE TABLE IF NOT EXISTS protocol_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version       TEXT NOT NULL UNIQUE,          -- e.g. "v1.0"
  sha256        TEXT NOT NULL,                 -- SHA-256 of preregistration.py
  description   TEXT,
  deposited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  osf_doi       TEXT,
  zenodo_doi    TEXT,
  arxiv_id      TEXT,
  ssrn_id       TEXT,
  github_release TEXT
);

-- ── 2. Live funding events ────────────────────────────────────
CREATE TABLE IF NOT EXISTS funding_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name     TEXT,
  company_id       TEXT,           -- matched graph node id if known
  investor_name    TEXT,
  investor_id      TEXT,           -- matched graph node id if known
  round_type       TEXT,           -- series-a, series-b, seed, etc.
  amount_usd       BIGINT,
  sector           TEXT,           -- ETF ticker (IGV, SOXX, XBI…)
  country          TEXT,
  source           TEXT,           -- edgar, techcrunch, wamda, etc.
  source_url       TEXT,
  announced_at     TIMESTAMPTZ,
  ingested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_funding_event
  ON funding_events (company_name, investor_name, round_type, announced_at)
  WHERE company_name IS NOT NULL AND investor_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_funding_events_sector ON funding_events (sector);
CREATE INDEX IF NOT EXISTS ix_funding_events_date   ON funding_events (announced_at DESC);
CREATE INDEX IF NOT EXISTS ix_funding_events_round  ON funding_events (round_type);

-- ── 3. Silence events ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS silence_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_name        TEXT NOT NULL,
  investor_id          TEXT,
  company_name         TEXT NOT NULL,
  company_id           TEXT,
  sector               TEXT NOT NULL,
  series_a_date        TIMESTAMPTZ NOT NULL,
  series_b_expected_by TIMESTAMPTZ,    -- series_a_date + 540 days
  series_b_occurred    BOOLEAN DEFAULT FALSE,
  series_b_date        TIMESTAMPTZ,
  is_silent            BOOLEAN NOT NULL,
  detected_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_silence_sector ON silence_events (sector);
CREATE INDEX IF NOT EXISTS ix_silence_date   ON silence_events (series_a_date DESC);

-- ── 4. Live SMS scores per sector per day ─────────────────────
CREATE TABLE IF NOT EXISTS sms_scores_live (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector           TEXT NOT NULL,
  score_date       DATE NOT NULL,
  sms_score        FLOAT NOT NULL,
  n_expected       INTEGER,
  n_silent         INTEGER,
  baseline_mean    FLOAT,
  baseline_sigma   FLOAT,
  deviation_sigma  FLOAT,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_sms_live ON sms_scores_live (sector, score_date);

-- ── 5. Signals (issued when SMS deviation > 2σ) ────────────────
CREATE TABLE IF NOT EXISTS signals (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector                  TEXT NOT NULL,
  direction               TEXT NOT NULL DEFAULT 'NEGATIVE_ALPHA',
  sms_value               FLOAT NOT NULL,
  baseline_mean           FLOAT,
  baseline_sigma          FLOAT,
  deviation_sigma         FLOAT,
  n_silence_events        INTEGER,
  contributing_investors  JSONB,      -- top 5 silent investors
  protocol_version        TEXT NOT NULL DEFAULT 'v1.0',
  protocol_sha256         TEXT NOT NULL,
  input_sha256            TEXT NOT NULL,
  output_sha256           TEXT NOT NULL,
  receipt_sha256          TEXT NOT NULL,
  issued_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status                  TEXT NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS ix_signals_sector ON signals (sector);
CREATE INDEX IF NOT EXISTS ix_signals_date   ON signals (issued_at DESC);

-- ── 6. Receipts (sealed snapshots for any entity or signal) ───
CREATE TABLE IF NOT EXISTS receipts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_type      TEXT NOT NULL,     -- signal | entity_snapshot | custom
  entity_id         TEXT,
  entity_name       TEXT,
  entity_type       TEXT,              -- investor | company
  signal_id         UUID REFERENCES signals(id),
  payload           JSONB NOT NULL,
  protocol_version  TEXT NOT NULL DEFAULT 'v1.0',
  protocol_sha256   TEXT NOT NULL,
  input_sha256      TEXT NOT NULL,
  output_sha256     TEXT NOT NULL,
  receipt_sha256    TEXT NOT NULL,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verifiable_at_url TEXT
);

CREATE INDEX IF NOT EXISTS ix_receipts_date       ON receipts (issued_at DESC);
CREATE INDEX IF NOT EXISTS ix_receipts_entity     ON receipts (entity_name);
CREATE INDEX IF NOT EXISTS ix_receipts_receipt_h  ON receipts (receipt_sha256);

-- ── 7. Market outcomes per signal ─────────────────────────────
CREATE TABLE IF NOT EXISTS signal_outcomes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id         UUID NOT NULL REFERENCES signals(id),
  sector            TEXT NOT NULL,
  etf_ticker        TEXT NOT NULL,
  observed_at       DATE NOT NULL,
  horizon_days      INTEGER NOT NULL,     -- 30 | 60 | 90 | 180 | 360
  etf_return        FLOAT,
  spy_return        FLOAT,
  excess_return     FLOAT,
  direction_correct BOOLEAN,
  ff5_alpha         FLOAT,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_outcome ON signal_outcomes (signal_id, horizon_days);

-- ── 8. Track record (aggregate, refreshed daily) ──────────────
CREATE TABLE IF NOT EXISTS track_record (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  computed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_signals            INTEGER,
  signals_with_k30         INTEGER,
  signals_with_k90         INTEGER,
  hit_rate_k30             FLOAT,
  hit_rate_k60             FLOAT,
  hit_rate_k90             FLOAT,
  hit_rate_k180            FLOAT,
  mean_excess_alpha_k90    FLOAT,
  mean_excess_alpha_k180   FLOAT,
  mean_lead_time_days      FLOAT,
  median_lead_time_days    FLOAT
);

-- ── 9. Row-level security (public read, service-role write) ───
ALTER TABLE protocol_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE silence_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_scores_live     ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_outcomes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_record        ENABLE ROW LEVEL SECURITY;

-- Public read (anon key)
CREATE POLICY "public read protocol_versions"  ON protocol_versions  FOR SELECT USING (true);
CREATE POLICY "public read funding_events"      ON funding_events      FOR SELECT USING (true);
CREATE POLICY "public read silence_events"      ON silence_events      FOR SELECT USING (true);
CREATE POLICY "public read sms_scores_live"     ON sms_scores_live     FOR SELECT USING (true);
CREATE POLICY "public read signals"             ON signals             FOR SELECT USING (true);
CREATE POLICY "public read receipts"            ON receipts            FOR SELECT USING (true);
CREATE POLICY "public read signal_outcomes"     ON signal_outcomes     FOR SELECT USING (true);
CREATE POLICY "public read track_record"        ON track_record        FOR SELECT USING (true);

-- Service role write (Python engine uses the service key)
-- No insert/update/delete policies for anon → only service key can write.

-- ── 10. Seed protocol version v1.0 (placeholder — update after OSF deposit) ──
INSERT INTO protocol_versions (version, sha256, description)
VALUES ('v1.0', 'baf38a3d8788a23bef1ec0b27a42da1c4920bab27effce0ebe82b865a1ca58a9', 'Initial sealed protocol — VentureGraph 2.0')
ON CONFLICT (version) DO NOTHING;
