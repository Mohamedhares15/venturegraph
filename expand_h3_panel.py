"""
VentureGraph — H3 Panel Expansion
==================================
Goal: Increase H3 statistical power WITHOUT changing the algorithm or p-value threshold.

Three free interventions (NO new VC data needed):
  1. Switch from quarterly → monthly granularity (3× more observations)
  2. Add 8 additional sector ETFs via yfinance (free, no API key)
  3. Use combined_* augmented data from EDGAR pipeline

Output: expanded_sms_alpha_correlation.csv with updated n_obs and p-values.

Run:  python expand_h3_panel.py
"""

import warnings
warnings.filterwarnings("ignore")

from pathlib import Path
import json
import numpy as np
import pandas as pd
from scipy import stats

PROJECT_ROOT = Path(__file__).parent.resolve()
DATA_AUG     = PROJECT_ROOT / "data_augmented"
OUT_DIR      = DATA_AUG          # write to data_augmented/

# ── 1. Define expanded ETF universe ───────────────────────────────────────────

# Existing sectors in sector_alphas.csv
EXISTING_ETFS = ["FDN", "ICLN", "IGV", "SOXX", "XBI", "XLF"]

# New ETFs to add via yfinance (free, no API key)
NEW_ETFS = {
    "IPAY":  "Fintech / Payments",
    "ARKW":  "Cloud / Next-Gen Software",
    "WCLD":  "SaaS",
    "IBB":   "Biotech (broader)",
    "SMH":   "Semiconductors (broader)",
    "HACK":  "Cybersecurity",
    "QCLN":  "Clean Tech",
    "KWEB":  "China Internet",
}

# Crunchbase category → ETF mapping (expanded)
CATEGORY_TO_ETF = {
    # SaaS / Cloud
    "software": "WCLD", "saas": "WCLD", "cloud_computing": "WCLD",
    "enterprise": "WCLD", "crm": "WCLD", "erp": "WCLD",
    "productivity": "WCLD", "collaboration": "WCLD", "analytics": "WCLD",
    # Cybersecurity
    "security": "HACK",
    # Semiconductors / Hardware
    "semiconductor": "SMH", "hardware": "SMH", "chip": "SMH",
    "networking": "SMH", "embedded": "SMH",
    # Biotech / Healthcare
    "biotech": "IBB", "health": "IBB", "medical": "IBB",
    "pharmaceutical": "IBB", "healthcare": "IBB", "diagnostics": "IBB",
    "genomics": "IBB", "life sciences": "IBB",
    # Internet / Consumer Web
    "web": "FDN", "internet": "FDN", "mobile": "FDN",
    "ecommerce": "FDN", "marketplace": "FDN", "advertising": "FDN",
    "social": "FDN", "media": "FDN", "search": "FDN",
    "games_video": "FDN", "network_hosting": "FDN",
    # Fintech / Payments
    "finance": "IPAY", "fintech": "IPAY", "payments": "IPAY",
    "insurance": "IPAY",
    # Clean Energy
    "cleantech": "QCLN", "energy": "QCLN", "greentech": "QCLN",
    # AI / Next-gen
    "ai": "ARKW", "artificial_intelligence": "ARKW",
    # Default
    "other": "IGV", "unknown": "IGV",
}


def cat_to_etf(cat: str) -> str:
    if not cat or pd.isna(cat):
        return "IGV"
    c = str(cat).lower().strip()
    if c in CATEGORY_TO_ETF:
        return CATEGORY_TO_ETF[c]
    for k, v in CATEGORY_TO_ETF.items():
        if k in c:
            return v
    return "IGV"


# ── 2. Fetch new ETFs from yfinance ───────────────────────────────────────────

def fetch_new_etfs_monthly() -> pd.DataFrame:
    """Returns a long DataFrame with columns: date, etf, monthly_return."""
    import yfinance as yf
    rows = []
    print("\n[1/6] Fetching new sector ETFs from yfinance ...")
    for ticker, label in NEW_ETFS.items():
        try:
            t = yf.Ticker(ticker)
            hist = t.history(period="max", interval="1mo", auto_adjust=True)
            if hist.empty:
                print(f"   {ticker:6s} (no data)")
                continue
            hist = hist.reset_index()
            # Use month-end timestamp
            hist["date"] = pd.to_datetime(hist["Date"]).dt.tz_localize(None).dt.to_period("M").dt.to_timestamp("M")
            hist["ret"]  = hist["Close"].pct_change()
            sub = hist[["date", "ret"]].dropna()
            for _, r in sub.iterrows():
                rows.append({"date": r["date"], "etf": ticker, "monthly_return": float(r["ret"])})
            print(f"   {ticker:6s} {label:30s} {len(sub):4d} months "
                  f"({sub['date'].min().date()} → {sub['date'].max().date()})")
        except Exception as e:
            print(f"   {ticker:6s} ERROR: {e}")
    return pd.DataFrame(rows)


# ── 3. Build forward "alpha" proxy at k = 6, 12, 18, 24, 36 ───────────────────

def build_monthly_panel_alphas() -> pd.DataFrame:
    """
    Builds a wide monthly panel: (sector, eval_date) → alpha_k6, alpha_k12, etc.
    Uses existing sector_alphas.csv (FF5 alphas) for FDN, ICLN, IGV, SOXX, XBI, XLF
    PLUS new ETFs as forward excess return over market (simplified alpha).
    """
    # Existing FF5 alphas (long form: date, etf, alpha, sector)
    existing = pd.read_csv(PROJECT_ROOT / "sector_alphas.csv", parse_dates=["date"])
    existing["sector"] = existing["etf"]
    existing = existing.rename(columns={"alpha": "monthly_alpha"})
    existing["date"] = existing["date"] + pd.offsets.MonthEnd(0)
    print(f"   Existing FF5 alphas:  {len(existing):,} rows × "
          f"{existing['etf'].nunique()} ETFs")

    # New ETFs — use raw monthly returns minus SPY market return as a simple proxy
    new_etfs_df = fetch_new_etfs_monthly()
    if new_etfs_df.empty:
        new_alphas = pd.DataFrame(columns=["date", "etf", "monthly_alpha", "sector"])
    else:
        # Fetch SPY market return for the same period
        import yfinance as yf
        spy = yf.Ticker("SPY").history(period="max", interval="1mo", auto_adjust=True).reset_index()
        spy["date"] = pd.to_datetime(spy["Date"]).dt.tz_localize(None).dt.to_period("M").dt.to_timestamp("M")
        spy["market_return"] = spy["Close"].pct_change()
        spy = spy[["date", "market_return"]].dropna()
        new_etfs_df = new_etfs_df.merge(spy, on="date", how="inner")
        new_etfs_df["monthly_alpha"] = new_etfs_df["monthly_return"] - new_etfs_df["market_return"]
        new_etfs_df["sector"] = new_etfs_df["etf"]
        new_alphas = new_etfs_df[["date", "etf", "monthly_alpha", "sector"]]
        print(f"   New ETF alphas:       {len(new_alphas):,} rows × "
              f"{new_alphas['etf'].nunique()} ETFs")

    combined = pd.concat([existing, new_alphas], ignore_index=True)
    combined = combined.sort_values(["sector", "date"]).reset_index(drop=True)

    # Build forward alpha at k = 6, 12, 18, 24, 36 months
    print(f"\n[2/6] Building forward alphas at k = 6, 12, 18, 24, 36 months ...")
    panel_rows = []
    for sector, sub in combined.groupby("sector"):
        sub = sub.set_index("date").sort_index()
        # Cumulative forward return is more interpretable; we sum monthly alphas
        # (small-return approximation: sum ≈ compound)
        for eval_date, row in sub.iterrows():
            entry = {"eval_date": eval_date, "sector": sector}
            for k in (6, 12, 18, 24, 36):
                horizon_end = eval_date + pd.DateOffset(months=k)
                horizon_end = horizon_end + pd.offsets.MonthEnd(0)
                window = sub.loc[(sub.index > eval_date) & (sub.index <= horizon_end), "monthly_alpha"]
                if len(window) >= max(1, int(k * 0.5)):   # require ≥50% coverage
                    entry[f"alpha_k{k}"] = float(window.sum())
                else:
                    entry[f"alpha_k{k}"] = np.nan
            panel_rows.append(entry)
    panel = pd.DataFrame(panel_rows)
    print(f"   Monthly panel rows:   {len(panel):,} "
          f"({panel['sector'].nunique()} sectors)")
    return panel


# ── 4. Recompute SMS at MONTHLY granularity ───────────────────────────────────

def recompute_sms_monthly(panel_etfs: list) -> pd.DataFrame:
    """Re-run the SMS engine using monthly aggregation and the augmented data."""
    print("\n[3/6] Re-computing SMS at monthly granularity ...")

    # Reuse the existing augmented combined CSVs
    fr_path  = DATA_AUG / "combined_funding_rounds.csv"
    inv_path = DATA_AUG / "combined_investments.csv"
    obj_path = DATA_AUG / "combined_objects.csv"
    tps_path = PROJECT_ROOT / "tps_panel_expanding.csv"

    print(f"   Loading combined_funding_rounds.csv ...")
    fr = pd.read_csv(
        fr_path,
        usecols=lambda c: c in ["funding_round_id", "id", "object_id",
                                "funded_at", "funding_round_type"],
        low_memory=False,
    )
    if "id" in fr.columns and "funding_round_id" not in fr.columns:
        fr = fr.rename(columns={"id": "funding_round_id"})
    fr["funding_round_id"]   = fr["funding_round_id"].astype(str).str.strip()
    fr["funding_round_type"] = fr["funding_round_type"].astype(str).str.lower().str.strip()
    fr = fr[fr["funding_round_type"].isin(["series-a", "series-b"])].copy()
    fr["funded_at"] = pd.to_datetime(fr["funded_at"], errors="coerce")
    fr = fr.dropna(subset=["funded_at"])
    # ★ MONTHLY granularity (not quarterly)
    fr["month"] = fr["funded_at"].dt.to_period("M").dt.to_timestamp("M")
    print(f"     Series A: {(fr['funding_round_type']=='series-a').sum():,} | "
          f"Series B: {(fr['funding_round_type']=='series-b').sum():,}")

    print(f"   Loading combined_investments.csv ...")
    inv = pd.read_csv(
        inv_path,
        usecols=lambda c: c in ["funding_round_id", "funded_object_id",
                                "investor_object_id"],
        low_memory=False,
    )
    inv = inv.dropna(subset=["funding_round_id", "investor_object_id"])
    inv["funding_round_id"] = inv["funding_round_id"].astype(str).str.strip()
    print(f"     Investment records: {len(inv):,}")

    print(f"   Loading combined_objects.csv (chunked) ...")
    obj_chunks = []
    for chunk in pd.read_csv(
        obj_path,
        usecols=lambda c: c in ["id", "name", "category_code"],
        dtype=str,
        chunksize=50_000,
        low_memory=False,
    ):
        chunk = chunk.dropna(subset=["id"])
        obj_chunks.append(chunk)
    obj = pd.concat(obj_chunks, ignore_index=True)
    del obj_chunks
    print(f"     Objects loaded: {len(obj):,}")

    print(f"   Loading tps_panel_expanding.csv ...")
    tps = pd.read_csv(
        tps_path,
        usecols=["investor", "eval_date", "tps", "in_top_tier"],
        parse_dates=["eval_date"],
        low_memory=False,
    )
    tps = tps.dropna(subset=["investor", "eval_date"])
    tps = tps.rename(columns={"investor": "investor_name"})
    tps["in_top_tier"] = (
        tps["in_top_tier"].astype(str).str.lower().isin(["true", "1", "yes"])
    )

    # Build lookups
    id_to_name = dict(zip(obj["id"].astype(str), obj["name"].fillna("")))
    id_to_etf  = {
        str(r["id"]): cat_to_etf(r.get("category_code", ""))
        for _, r in obj.iterrows()
    }

    # Join investments → rounds
    df = inv.merge(
        fr[["funding_round_id", "object_id", "funded_at",
            "funding_round_type", "month"]],
        on="funding_round_id", how="inner",
    )
    df["investor_name"] = (
        df["investor_object_id"].astype(str).map(id_to_name)
        .fillna(df["investor_object_id"].astype(str))
    )
    df["sector"] = df["funded_object_id"].astype(str).map(id_to_etf).fillna("IGV")

    series_a = df[df["funding_round_type"] == "series-a"].copy()
    series_b = df[df["funding_round_type"] == "series-b"].copy()

    # Top-tier set per quarter (uses TPS panel)
    tps_q = tps.copy()
    tps_q["q"] = tps_q["eval_date"].dt.to_period("Q").dt.to_timestamp("Q")
    top_tier_by_q = (
        tps_q[tps_q["in_top_tier"]]
        .groupby("q")["investor_name"]
        .apply(set)
        .to_dict()
    )

    def top_tier_at(date):
        qs = [q for q in top_tier_by_q if q <= date]
        return top_tier_by_q[max(qs)] if qs else set()

    # Companies with a Series B
    b_by_company = (
        series_b.groupby("object_id")["investor_name"]
        .apply(set).to_dict()
    )

    print(f"   Detecting silences (monthly bucket) ...")
    records = []
    for company_id, group_a in series_a.groupby("object_id"):
        if company_id not in b_by_company:
            continue
        b_inv_set = b_by_company[company_id]
        for _, row in group_a.iterrows():
            top_tier_names = top_tier_at(row["funded_at"])
            if row["investor_name"] not in top_tier_names:
                continue
            records.append({
                "investor_name": row["investor_name"],
                "company_id":    company_id,
                "sector":        row["sector"],
                "series_a_mo":   row["month"],
                "is_silent":     row["investor_name"] not in b_inv_set,
            })

    if not records:
        print("   No silence records found.")
        return pd.DataFrame()

    silence_df = pd.DataFrame(records)
    n_silent   = silence_df["is_silent"].sum()
    print(f"   Silence events:       {len(silence_df):,}")
    print(f"   Silences:             {n_silent:,} "
          f"({100*n_silent/len(silence_df):.1f}%)")

    # Aggregate per (sector, month) — minimum 3 expected edges for a valid score
    sms = (
        silence_df
        .groupby(["sector", "series_a_mo"])
        .agg(n_expected=("is_silent", "count"),
             n_silent=("is_silent", "sum"))
        .reset_index()
    )
    sms = sms[sms["n_expected"] >= 3].copy()
    sms["sms_score"] = sms["n_silent"] / (sms["n_expected"] + 1e-9)
    sms = sms.rename(columns={"series_a_mo": "eval_date"})
    print(f"   Monthly SMS rows:     {len(sms):,} "
          f"(across {sms['sector'].nunique()} sectors)")
    return sms


# ── 5. Merge SMS with monthly alpha panel & re-run H3 correlation ─────────────

def correlate_h3(sms: pd.DataFrame, panel: pd.DataFrame) -> pd.DataFrame:
    print("\n[4/6] Merging SMS with monthly alpha panel ...")
    sms["eval_date"]   = pd.to_datetime(sms["eval_date"])
    panel["eval_date"] = pd.to_datetime(panel["eval_date"])

    merged = panel.merge(
        sms[["sector", "eval_date", "sms_score", "n_expected", "n_silent"]],
        on=["sector", "eval_date"], how="inner",
    )
    print(f"   Merged panel rows:    {len(merged):,}")
    print(f"   Sectors with data:    {merged['sector'].nunique()}")

    if merged.empty:
        return pd.DataFrame(), merged

    print("\n[5/6] Running H3 Pearson correlation (NO p-value adjustment) ...")
    results = []
    for k in (6, 12, 18, 24, 36):
        col = f"alpha_k{k}"
        sub = merged.dropna(subset=["sms_score", col])
        if len(sub) < 5:
            continue
        r, p = stats.pearsonr(sub["sms_score"], sub[col])
        direction = "✓ Works (negative)" if r < 0 else "✗ Counter (positive)"
        is_sig = "✓✓ SIGNIFICANT" if p < 0.05 else "—"
        results.append({
            "horizon":    f"k={k}",
            "alpha_col":  col,
            "pearson_r":  round(r, 4),
            "p_value":    round(p, 4),
            "n_obs":      len(sub),
            "signal_dir": direction,
            "significant": is_sig,
            "dataset":    "expanded_monthly",
        })

    corr_df = pd.DataFrame(results).sort_values("horizon")
    return corr_df, merged


# ── 6. Main ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 72)
    print("  VentureGraph — H3 Panel Expansion (zero-cost fix)")
    print("  Strategy: Monthly granularity + 8 new ETFs (no algorithm change)")
    print("=" * 72)

    # Step 1+2: Build expanded monthly alpha panel
    panel = build_monthly_panel_alphas()
    panel.to_csv(OUT_DIR / "expanded_monthly_panel.csv", index=False)
    print(f"   Saved → expanded_monthly_panel.csv")

    # Step 3: Recompute SMS monthly
    sms = recompute_sms_monthly(panel_etfs=list(panel["sector"].unique()))
    if sms.empty:
        print("\nERROR: No SMS data — cannot proceed.")
        raise SystemExit(1)
    sms.to_csv(OUT_DIR / "expanded_sms_scores_monthly.csv", index=False)
    print(f"   Saved → expanded_sms_scores_monthly.csv")

    # Step 4+5: Correlate
    corr, merged = correlate_h3(sms, panel)
    if corr.empty:
        print("\nERROR: No correlation results.")
        raise SystemExit(1)

    corr.to_csv(OUT_DIR / "expanded_sms_alpha_correlation.csv", index=False)
    merged.to_csv(OUT_DIR / "expanded_event_panel_sms_monthly.csv", index=False)
    print(f"   Saved → expanded_sms_alpha_correlation.csv")
    print(f"   Saved → expanded_event_panel_sms_monthly.csv")

    print("\n[6/6] FINAL RESULTS — H3 CORRELATION (EXPANDED, MONTHLY):")
    print("=" * 72)
    print(corr.to_string(index=False))
    print("=" * 72)

    # Compare with original
    orig_path = PROJECT_ROOT / "sms_alpha_correlation.csv"
    if orig_path.exists():
        orig = pd.read_csv(orig_path)
        print("\n  ORIGINAL (quarterly, 5 sectors, ~73 obs):")
        print("  " + orig.to_string(index=False).replace("\n", "\n  "))

    # Summary verdict
    print("\n  VERDICT:")
    sig_horizons = corr[corr["p_value"] < 0.05]
    if not sig_horizons.empty:
        print(f"  ✓✓ {len(sig_horizons)} horizon(s) now significant at p < 0.05")
        print(f"     → H3 confirmed for: "
              f"{', '.join(sig_horizons['horizon'].tolist())}")
    else:
        print(f"  ★ No horizons significant at p<0.05 yet")
        max_n = corr["n_obs"].max()
        if max_n < 2170:
            needed = 2170 - max_n
            print(f"     n_obs max = {max_n}; need ~{needed:,} more for 80% power")
            print(f"     → Consider adding Fama-French 49 industries next")
        else:
            print(f"     n_obs is sufficient ({max_n}) — the signal genuinely")
            print(f"     does not reach p<0.05 at this effect size.")
            print(f"     This is an honest scientific finding worth reporting.")

    # Save summary JSON
    summary = {
        "n_obs_before": 73,
        "n_obs_after":  int(corr["n_obs"].max()),
        "sectors_before": 5,
        "sectors_after":  int(merged["sector"].nunique()),
        "panel_granularity": "monthly",
        "n_significant_horizons": int((corr["p_value"] < 0.05).sum()),
        "min_p_value": float(corr["p_value"].min()),
        "best_horizon": corr.loc[corr["p_value"].idxmin(), "horizon"],
    }
    with open(OUT_DIR / "expansion_summary.json", "w") as f:
        json.dump(summary, f, indent=2, default=str)
    print(f"\n  Summary → expansion_summary.json")
