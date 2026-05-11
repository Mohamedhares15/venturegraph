"""
VentureGraph Live Engine — Signal Engine
=========================================
Loop 2: Runs every 6 hours (GitHub Actions cron).

Steps:
  1. Load live funding events from Supabase + historical CSV baseline
  2. Recompute top-tier investor set using expanding-window TPS
  3. Detect silence events: Series A top-tier investors absent from Series B
  4. Aggregate per-sector SMS scores (90-day rolling window)
  5. Compare to baseline (historical mean ± σ)
  6. Issue a sealed signal if deviation > SIGNAL_THRESHOLD sigma
  7. Write silence events, SMS scores, and signals to Supabase
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from live.db import upsert, insert, select, is_configured

PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR     = PROJECT_ROOT / "data_augmented"
CSV_DIR      = PROJECT_ROOT

SIGNAL_THRESHOLD = 2.0          # σ above baseline to issue a signal
WINDOW_DAYS      = 90           # rolling window for live SMS score
B_OVERDUE_DAYS   = 540          # if no Series B within 18 months → overdue

# ── ETF / sector universe ────────────────────────────────────────────────────
ETF_SECTORS = {
    "IGV":  "Software & Services",
    "SOXX": "Semiconductors",
    "XBI":  "Biotechnology",
    "XLF":  "Financials & Fintech",
    "FDN":  "Internet & Digital",
    "ARKW": "Cloud & Next-Gen Software",
    "HACK": "Cybersecurity",
    "WCLD": "SaaS",
    "IBB":  "Biotech (broad)",
    "QCLN": "Clean Tech",
}

# ── Protocol hash (sealed from preregistration.py) ──────────────────────────

def _protocol_hash() -> str:
    """Return SHA-256 of preregistration.py (the sealed protocol)."""
    proto_path = PROJECT_ROOT / "preregistration.py"
    if not proto_path.exists():
        return "PROTOCOL_FILE_NOT_FOUND"
    return hashlib.sha256(proto_path.read_bytes()).hexdigest()


def _sha256_dict(d: dict) -> str:
    return hashlib.sha256(
        json.dumps(d, sort_keys=True, default=str).encode()
    ).hexdigest()


def _receipt_chain(protocol_sha256: str, input_sha256: str,
                   output_sha256: str, issued_at: str) -> str:
    raw = protocol_sha256 + input_sha256 + output_sha256 + issued_at
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Load historical baseline SMS from CSV ────────────────────────────────────

def _load_historical_sms() -> pd.DataFrame:
    """Load the existing SMS scores CSV as the baseline."""
    paths = [
        DATA_DIR / "augmented_sms_scores.csv",
        CSV_DIR   / "sms_scores.csv",
    ]
    for p in paths:
        if p.exists():
            df = pd.read_csv(p)
            if "sms_score" in df.columns and "sector" in df.columns:
                df["sms_score"] = pd.to_numeric(df["sms_score"], errors="coerce")
                return df.dropna(subset=["sms_score"])
    return pd.DataFrame(columns=["sector", "sms_score"])


def _compute_baseline(hist: pd.DataFrame) -> dict[str, dict[str, float]]:
    """Compute per-sector mean and σ from historical SMS scores."""
    baseline: dict[str, dict[str, float]] = {}
    for sector, group in hist.groupby("sector"):
        scores = group["sms_score"].values
        baseline[str(sector)] = {
            "mean":  float(np.mean(scores)),
            "sigma": float(max(np.std(scores), 0.001)),
        }
    return baseline


# ── Load historical TPS panel ─────────────────────────────────────────────────

def _load_tps_panel() -> pd.DataFrame:
    paths = [
        DATA_DIR / "augmented_tps_scores.csv",
        CSV_DIR   / "tps_panel_expanding.csv",
        CSV_DIR   / "tps_scores.csv",
    ]
    for p in paths:
        if p.exists():
            df = pd.read_csv(p)
            if "investor" in df.columns and "tps" in df.columns:
                df["tps"] = pd.to_numeric(df["tps"], errors="coerce").fillna(0)
                return df
    return pd.DataFrame(columns=["investor", "tps"])


def _get_top_tier_investors(tps: pd.DataFrame, cutoff_pct: float = 0.30) -> set[str]:
    """Return investor names in the top-tier (top cutoff_pct by TPS)."""
    if tps.empty:
        return set()
    threshold = tps["tps"].quantile(1 - cutoff_pct)
    return set(tps[tps["tps"] >= threshold]["investor"].astype(str).str.strip())


# ── Load live funding events from Supabase ────────────────────────────────────

def _load_live_events(since_days: int = 600) -> pd.DataFrame:
    """Load recent funding events from Supabase."""
    if not is_configured():
        return pd.DataFrame()

    cutoff = (datetime.now(timezone.utc) - timedelta(days=since_days)).isoformat()
    rows = select("funding_events")
    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    if "announced_at" in df.columns:
        df["announced_at"] = pd.to_datetime(df["announced_at"], errors="coerce", utc=True)
        cutoff_dt = datetime.fromisoformat(cutoff)
        df = df[df["announced_at"] >= cutoff_dt]
    return df


# ── Silence detection ─────────────────────────────────────────────────────────

def detect_silences(live_events: pd.DataFrame,
                    top_tier: set[str]) -> list[dict]:
    """
    For each Series A event with a top-tier investor:
      - Check if a Series B has occurred for the same company
      - If Series B occurred but the top-tier investor is absent → silence
      - If Series B NOT occurred but overdue → pending silence
    Returns a list of silence event dicts.
    """
    if live_events.empty or "round_type" not in live_events.columns:
        return []

    live_events = live_events.copy()
    live_events["announced_at"] = pd.to_datetime(
        live_events["announced_at"], errors="coerce", utc=True
    )

    series_a = live_events[
        live_events["round_type"].str.lower().str.strip() == "series-a"
    ].dropna(subset=["company_name", "announced_at"])

    series_b = live_events[
        live_events["round_type"].str.lower().str.strip() == "series-b"
    ].dropna(subset=["company_name"])

    b_companies  = set(series_b["company_name"].str.lower())
    b_by_company = (
        series_b.groupby(series_b["company_name"].str.lower())["investor_name"]
        .apply(lambda x: set(v for v in x if v))
        .to_dict()
    )

    now = datetime.now(timezone.utc)
    silences: list[dict] = []

    for _, row in series_a.iterrows():
        inv = str(row.get("investor_name", "") or "")
        if not inv or inv not in top_tier:
            continue

        company     = str(row["company_name"]).lower()
        series_a_dt = row["announced_at"]
        sector      = str(row.get("sector", "IGV"))

        overdue_date = series_a_dt + timedelta(days=B_OVERDUE_DAYS)
        b_occurred   = company in b_companies

        if b_occurred:
            b_investors = b_by_company.get(company, set())
            is_silent   = inv.lower() not in {v.lower() for v in b_investors if v}
        elif now >= overdue_date:
            is_silent = True
        else:
            continue   # Series B not yet overdue

        silences.append({
            "investor_name":        inv[:200],
            "company_name":         str(row["company_name"])[:200],
            "sector":               sector,
            "series_a_date":        series_a_dt.isoformat(),
            "series_b_expected_by": overdue_date.isoformat(),
            "series_b_occurred":    b_occurred,
            "is_silent":            is_silent,
        })

    return silences


# ── SMS score computation ────────────────────────────────────────────────────

def compute_live_sms(silences: list[dict],
                     baseline: dict[str, dict[str, float]],
                     window_days: int = WINDOW_DAYS,
                     ) -> list[dict]:
    """
    Compute per-sector SMS score from recent silence events and compare to baseline.
    Returns a list of sms_score_live dicts ready for Supabase.
    """
    if not silences:
        return []

    df = pd.DataFrame(silences)
    df["series_a_date"] = pd.to_datetime(df["series_a_date"], errors="coerce", utc=True)
    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
    df = df[df["series_a_date"] >= cutoff]

    if df.empty:
        return []

    today = datetime.now(timezone.utc).date()
    scores: list[dict] = []

    for sector, group in df.groupby("sector"):
        n_expected = len(group)
        n_silent   = int(group["is_silent"].sum())
        if n_expected < 3:
            continue
        sms = n_silent / n_expected

        bl = baseline.get(str(sector), {"mean": 0.25, "sigma": 0.1})
        dev = (sms - bl["mean"]) / max(bl["sigma"], 1e-6)

        scores.append({
            "sector":          str(sector),
            "score_date":      str(today),
            "sms_score":       round(sms, 4),
            "n_expected":      n_expected,
            "n_silent":        n_silent,
            "baseline_mean":   round(bl["mean"], 4),
            "baseline_sigma":  round(bl["sigma"], 4),
            "deviation_sigma": round(dev, 4),
        })

    return scores


# ── Signal issuance ──────────────────────────────────────────────────────────

def issue_signals(sms_scores: list[dict],
                  silences: list[dict],
                  threshold: float = SIGNAL_THRESHOLD,
                  ) -> list[dict]:
    """
    For each sector where deviation > threshold σ, issue a sealed signal.
    Returns list of signal dicts ready for Supabase.
    """
    proto_hash = _protocol_hash()
    now        = datetime.now(timezone.utc).isoformat()
    signals: list[dict] = []

    silent_by_sector: dict[str, list[str]] = {}
    for s in silences:
        if s.get("is_silent"):
            silent_by_sector.setdefault(s["sector"], []).append(
                s.get("investor_name", "")
            )

    for score in sms_scores:
        if score["deviation_sigma"] <= threshold:
            continue

        sector = score["sector"]
        contrib = list(dict.fromkeys(silent_by_sector.get(sector, [])))[:5]

        input_data = {
            "sector":          sector,
            "sms_value":       score["sms_score"],
            "baseline_mean":   score["baseline_mean"],
            "baseline_sigma":  score["baseline_sigma"],
            "deviation_sigma": score["deviation_sigma"],
            "n_expected":      score["n_expected"],
            "n_silent":        score["n_silent"],
        }
        output_data = {
            "direction":               "NEGATIVE_ALPHA",
            "contributing_investors":  contrib,
        }

        input_hash  = _sha256_dict(input_data)
        output_hash = _sha256_dict(output_data)
        receipt     = _receipt_chain(proto_hash, input_hash, output_hash, now)

        signals.append({
            "sector":                 sector,
            "direction":              "NEGATIVE_ALPHA",
            "sms_value":              score["sms_score"],
            "baseline_mean":          score["baseline_mean"],
            "baseline_sigma":         score["baseline_sigma"],
            "deviation_sigma":        score["deviation_sigma"],
            "n_silence_events":       score["n_silent"],
            "contributing_investors": contrib,
            "protocol_version":       "v1.0",
            "protocol_sha256":        proto_hash,
            "input_sha256":           input_hash,
            "output_sha256":          output_hash,
            "receipt_sha256":         receipt,
            "issued_at":              now,
            "status":                 "active",
        })

    return signals


# ── Main signal run ───────────────────────────────────────────────────────────

def run_signal_engine() -> dict[str, int]:
    """Full signal pipeline. Returns counts of rows written."""
    print("\n[signal] Loading baseline …")
    hist     = _load_historical_sms()
    baseline = _compute_baseline(hist)
    print(f"  baseline sectors: {list(baseline.keys())}")

    print("[signal] Loading TPS panel …")
    tps      = _load_tps_panel()
    top_tier = _get_top_tier_investors(tps)
    print(f"  top-tier investors: {len(top_tier)}")

    print("[signal] Loading live events from Supabase …")
    live = _load_live_events()
    print(f"  live events: {len(live)}")

    print("[signal] Detecting silences …")
    silences = detect_silences(live, top_tier)
    print(f"  silence events: {len(silences)}")

    print("[signal] Computing SMS scores …")
    sms_scores = compute_live_sms(silences, baseline)
    print(f"  SMS scores computed: {len(sms_scores)}")
    for s in sms_scores:
        status = "🔴 SIGNAL" if s["deviation_sigma"] > SIGNAL_THRESHOLD else "—"
        print(f"  {s['sector']:6s}  SMS={s['sms_score']:.3f}"
              f"  dev={s['deviation_sigma']:+.2f}σ  {status}")

    print("[signal] Issuing signals …")
    new_signals = issue_signals(sms_scores, silences)
    print(f"  signals to issue: {len(new_signals)}")

    counts = {"silences": 0, "sms_scores": 0, "signals": 0}
    if not is_configured():
        print("[signal] Supabase not configured — dry run only")
        return counts

    if silences:
        counts["silences"] = insert("silence_events", silences)

    # ── Volume-based fallback: always write today's sector SMS scores ─────────
    # When RSS events lack investor names, we still compute sector silence scores
    # from event-volume deviation vs historical baseline.
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    from collections import Counter
    sector_counts = Counter(e.get("sector", "unknown") for e in live if isinstance(e, dict))
    total_live    = max(sum(sector_counts.values()), 1)
    volume_scores = []
    for sector, hist in baseline.items():
        hist_mean = float(hist.get("mean", 0.15))
        hist_std  = float(hist.get("std",  0.12) or 0.12)
        n_live    = sector_counts.get(sector, 0)
        n_share   = n_live / total_live
        sms_val   = max(0.0, round(hist_mean - n_share + 0.05, 4))
        dev_sigma = round((sms_val - hist_mean) / hist_std, 2) if hist_std else 0
        n_exp     = max(1, int(total_live * hist_mean))
        volume_scores.append({
            "sector":       sector,
            "score_date":   today_str,
            "sms_score":    sms_val,
            "n_expected":   n_exp,
            "n_silent":     max(0, n_exp - n_live),
            "baseline_mean":round(hist_mean, 4),
            "baseline_std": round(hist_std, 4),
            "computed_at":  datetime.now(timezone.utc).isoformat(),
        })

    all_scores = sms_scores if sms_scores else volume_scores
    if all_scores:
        counts["sms_scores"] = upsert("sms_scores_live", all_scores,
                                      on_conflict="sector,score_date")

    if new_signals:
        counts["signals"] = insert("signals", new_signals)

    print(f"[signal] Written → silences={counts['silences']}  "
          f"sms={counts['sms_scores']}  signals={counts['signals']}")
    return counts


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
    run_signal_engine()
