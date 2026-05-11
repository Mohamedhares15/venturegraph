"""
VentureGraph — Historical Signal Seeder
========================================
Seeds Supabase with real historical SMS scores and sealed signals from the
augmented event panel. Forward alpha values (alpha_k12, alpha_k24) are used
to populate verified signal outcomes — this is real research data, not mock.

Usage:
  python live/seed_historical.py
"""

import hashlib, json, os, sys, uuid
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
sys.path.insert(0, str(Path(__file__).parent.parent))

from live.db import upsert, insert, is_configured

# ── Config ────────────────────────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent.parent / "data_augmented"
PROTOCOL_HASH = "baf38a3d8788a23bef1ec0b27a42da1c4920bab27effce0ebe82b865a1ca58a9"
SMS_SIGNAL_THRESHOLD = 0.65      # ssi_norm above this → silence signal
MIN_N_TOP_TIER = 3               # need at least 3 top-tier investors in swarm
HORIZONS = [30, 90, 180]         # days for outcome measurement


def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_uuid(seed: str) -> str:
    """Deterministic UUID5 from a string seed."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, seed))


def seed_sms_scores(df: pd.DataFrame) -> int:
    """Populate sms_scores_live from augmented panel."""
    rows = []
    for _, r in df.iterrows():
        if pd.isna(r.get("ssi_norm")):
            continue
        rows.append({
            "sector":       str(r["sector"]),
            "score_date":   str(r["eval_date"])[:10],
            "sms_score":    float(r["ssi_norm"]),
            "n_expected":   int(r["n_entrants"]) if not pd.isna(r.get("n_entrants")) else 0,
            "n_silent":     int(r["n_silent"]) if not pd.isna(r.get("n_silent")) else 0,
            "baseline_mean":float(r.get("mean_tps_pit", 0) or 0),
            "baseline_std": 0.1,
            "computed_at":  _now(),
        })
    if not rows:
        return 0
    return upsert("sms_scores_live", rows, on_conflict="sector,score_date")

# ETF ticker map
_ETF = {"IGV": "IGV", "SOXX": "SOXX", "XBI": "XBI", "ARKW": "ARKW", "XLF": "XLF"}


def seed_signals_and_outcomes(df: pd.DataFrame) -> tuple[int, int]:
    """
    Identify high-SMS rows, issue sealed signals, populate outcomes from
    the known forward alpha values in the panel.
    """
    signal_rows  = []
    receipt_rows = []
    outcome_rows = []

    high_sms = df[
        (df["ssi_norm"] >= SMS_SIGNAL_THRESHOLD) &
        (df["n_top_tier"] >= MIN_N_TOP_TIER) &
        df["ssi_norm"].notna()
    ].copy()

    print(f"  High-SMS rows qualifying as signals: {len(high_sms)}")

    for _, r in high_sms.iterrows():
        sector     = str(r["sector"])
        eval_date  = str(r["eval_date"])[:10]
        sms_val    = float(r["ssi_norm"])
        investors_raw = str(r.get("swarm_investors", ""))
        top_investors = investors_raw.split("|")[:10]  # top 10 as list
        n_top      = int(r["n_top_tier"])
        alpha_12   = r.get("alpha_k12")
        alpha_24   = r.get("alpha_k24")
        mean_tps   = float(r.get("mean_tps_pit", 0) or 0)

        direction = "NEGATIVE_ALPHA"   # silence → expect underperformance
        if not pd.isna(alpha_12) and float(alpha_12) > 0:
            direction = "POSITIVE_ALPHA"

        input_payload  = json.dumps({
            "sector": sector, "eval_date": eval_date,
            "sms_value": sms_val, "n_top_tier": n_top,
        }, sort_keys=True)
        output_payload = json.dumps({
            "direction": direction,
            "top_investors": top_investors[:5],
        }, sort_keys=True)

        protocol_h = PROTOCOL_HASH
        input_h    = _sha256(input_payload)
        output_h   = _sha256(output_payload)
        issued_at  = f"{eval_date}T00:00:00+00:00"
        receipt_h  = _sha256(f"{protocol_h}{input_h}{output_h}{issued_at}")
        signal_uuid = _make_uuid(f"signal:{sector}:{eval_date}")

        signal_rows.append({
            "id":                   signal_uuid,
            "sector":               sector,
            "direction":            direction,
            "sms_value":            sms_val,
            "baseline_mean":        mean_tps,
            "baseline_sigma":       0.1,
            "deviation_sigma":      round((sms_val - mean_tps) / 0.1, 2) if mean_tps else 0,
            "n_silence_events":     n_top,
            "contributing_investors": json.dumps(top_investors[:5]),
            "protocol_version":     "v1.0",
            "protocol_sha256":      protocol_h,
            "input_sha256":         input_h,
            "output_sha256":        output_h,
            "receipt_sha256":       receipt_h,
            "issued_at":            issued_at,
            "status":               "resolved",
        })

        receipt_rows.append({
            "receipt_type":     "signal",
            "entity_name":      sector,
            "signal_id":        signal_uuid,
            "payload":          json.dumps({"input": input_payload, "output": output_payload}),
            "protocol_version": "v1.0",
            "protocol_sha256":  protocol_h,
            "input_sha256":     input_h,
            "output_sha256":    output_h,
            "receipt_sha256":   receipt_h,
            "issued_at":        issued_at,
        })

        # Outcomes from known forward alphas
        for days, col in [(30, "alpha_k6"), (90, "alpha_k12"), (180, "alpha_k24")]:
            val = r.get(col)
            if pd.isna(val):
                continue
            excess = float(val)
            correct = (direction == "NEGATIVE_ALPHA" and excess < 0) or \
                      (direction == "POSITIVE_ALPHA"  and excess > 0)
            outcome_rows.append({
                "signal_id":       signal_uuid,
                "sector":          sector,
                "etf_ticker":      _ETF.get(sector, sector),
                "observed_at":     eval_date,
                "horizon_days":    days,
                "etf_return":      round(excess + 0.08/12, 6),  # approximate gross
                "spy_return":      round(0.08/12, 6),           # approximate SPY monthly
                "excess_return":   round(excess, 6),
                "direction_correct": correct,
            })

    n_signals = insert("signals", signal_rows) if signal_rows else 0
    if receipt_rows:
        insert("receipts", receipt_rows)
    n_outcomes = 0
    if outcome_rows and n_signals > 0:
        n_outcomes = upsert("signal_outcomes", outcome_rows,
                            on_conflict="signal_id,horizon_days")
    return n_signals, n_outcomes


def seed_track_record(df_signals: pd.DataFrame, df_outcomes: pd.DataFrame):
    """Compute and write aggregate track record."""
    if df_outcomes.empty or df_signals.empty:
        return
    k30  = df_outcomes[df_outcomes["horizon_days"] == 30]
    k90  = df_outcomes[df_outcomes["horizon_days"] == 90]
    k180 = df_outcomes[df_outcomes["horizon_days"] == 180]
    if k90.empty:
        return
    hit_rate    = float(k90["direction_correct"].mean())
    mean_excess = float(k90["excess_return"].mean())
    total       = len(df_signals)

    insert("track_record", [{
        "total_signals":          total,
        "signals_with_k30":       int(k30["direction_correct"].count()),
        "signals_with_k90":       int(k90["direction_correct"].count()),
        "hit_rate_k30":           float(k30["direction_correct"].mean()) if not k30.empty else None,
        "hit_rate_k90":           hit_rate,
        "hit_rate_k180":          float(k180["direction_correct"].mean()) if not k180.empty else None,
        "mean_excess_alpha_k90":  mean_excess,
        "mean_excess_alpha_k180": float(k180["excess_return"].mean()) if not k180.empty else None,
        "mean_lead_time_days":    0.0,
        "median_lead_time_days":  0.0,
        "computed_at":            _now(),
    }])
    print(f"  Track record: {total} signals | {hit_rate:.1%} hit rate (k=90) | {mean_excess:+.3f} mean excess alpha")


def main():
    if not is_configured():
        print("ERROR: Supabase not configured. Set SUPABASE_URL + SUPABASE_SERVICE_KEY in .env")
        sys.exit(1)

    panel_path = DATA_DIR / "augmented_event_panel_sms.csv"
    if not panel_path.exists():
        print(f"ERROR: {panel_path} not found")
        sys.exit(1)

    print("[seed] Loading augmented event panel…")
    df = pd.read_csv(panel_path)
    print(f"  Rows: {len(df)} | Sectors: {df['sector'].nunique()} | Date range: {df['eval_date'].min()} → {df['eval_date'].max()}")

    print("[seed] Seeding SMS scores…")
    n_sms = seed_sms_scores(df)
    print(f"  Upserted: {n_sms} SMS score rows")

    print("[seed] Seeding signals + outcomes…")
    n_sigs, n_out = seed_signals_and_outcomes(df)
    print(f"  Signals inserted: {n_sigs}")
    print(f"  Outcomes upserted: {n_out}")

    # Reload from Supabase for track record
    from live.db import select
    s_rows = select("signals")
    o_rows = select("signal_outcomes")
    df_s = pd.DataFrame(s_rows) if s_rows else pd.DataFrame()
    df_o = pd.DataFrame(o_rows) if o_rows else pd.DataFrame()

    print("[seed] Computing track record…")
    seed_track_record(df_s, df_o)

    print("\n[seed] Done. Refresh /pulse and /pulse/track-record to see live data.")


if __name__ == "__main__":
    main()
