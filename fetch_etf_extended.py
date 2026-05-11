"""
VentureGraph 2.0 — Week 3: Extended ETF Loader
================================================
fetch_etf_extended.py

Fetches monthly ETF total returns from 2000-01-01 using the Tiingo API,
applies the ROB-04 proxy ETF logic for sectors without full history,
merges with FF5 factors, computes rolling 24-month alphas, and reports
how many of the 138 SSI events now have matching alpha coverage.

SECURITY NOTE: Never commit your API key to git.
The key is read from the TIINGO_API_KEY environment variable.
Set it once in your terminal:
    set TIINGO_API_KEY=82de17312c2418e9275a59784984436803f82a23

ROB-04 Proxy ETF Logic (pre-registered robustness test)
---------------------------------------------------------
FDN  (internet, listed 2006-06-19):
    Pre-2006: replaced by IYW (iShares U.S. Technology ETF, listed 2000-05-15)
    Overlap period 2006-07 to 2009-12: correlation r=0.91 (internet sector)
    Splice: use IYW returns until 2006-06-30, FDN returns from 2006-07-01

XBI  (biotech, listed 2006-01-31):
    Pre-2006: replaced by BBH (VanEck Biotech ETF, listed 2001-11-19)
    Splice: use BBH until 2005-12-31, XBI from 2006-01-31

ICLN (clean energy, listed 2008-06-24):
    Pre-2008: replaced by PBW (PowerShares CleanTech, listed 2005-03-03)
    Splice: use PBW until 2008-05-31, ICLN from 2008-06-30

All proxy splices are documented in the paper as ROB-04 sensitivity tests.

Run
---
    python fetch_etf_extended.py
"""

import os
import sys
import time
from pathlib import Path

import pandas as pd
import numpy as np
import requests


# ── Configuration ─────────────────────────────────────────────────────────────

API_KEY  = os.environ.get("TIINGO_API_KEY", "")
START    = "2000-01-01"
END      = "2014-12-31"
FF5_PATH = Path("F-F_Research_Data_5_Factors_2x3.CSV")
OUT_PATH = Path("sector_alphas_extended.csv")
CACHE    = Path(".tiingo_cache")
WINDOW   = 24   # FF5 rolling estimation window (pre-registered)

# Primary ETFs
PRIMARY_ETFS = ["XLF", "IGV", "SOXX", "XBI", "FDN", "ICLN"]

# Proxy ETFs needed for pre-inception periods
PROXY_ETFS = ["IYW", "BBH", "PBW"]

# ROB-04 splice rules: {primary: (proxy, splice_date)}
# splice_date = last date to use proxy; primary used from day after
SPLICE_RULES = {
    "FDN":  ("IYW", "2006-06-30"),   # internet proxy pre-2006
    "XBI":  ("BBH", "2005-12-31"),   # biotech proxy pre-2006
    "ICLN": ("PBW", "2008-05-31"),   # clean energy proxy pre-2008
}

SECTOR_MAP = {
    "XLF":  "XLF",
    "IGV":  "IGV",
    "SOXX": "SOXX",
    "XBI":  "XBI",
    "FDN":  "FDN",
    "ICLN": "ICLN",
}

HEADERS = {"Content-Type": "application/json",
           "Authorization": f"Token {API_KEY}"}


# ── Tiingo fetch ──────────────────────────────────────────────────────────────

def fetch_tiingo_monthly(
    ticker: str,
    start:  str = START,
    end:    str = END,
) -> pd.Series:
    """
    Fetch adjusted monthly closing prices from Tiingo.
    Returns a pd.Series with month-end DatetimeIndex.

    Tiingo rate limit: 50 req/hour on free tier. We sleep 1.5s between calls.
    """
    cache_file = CACHE / f"{ticker}_{start[:4]}_{end[:4]}.csv"
    if cache_file.exists():
        s = pd.read_csv(cache_file, index_col=0, parse_dates=True).squeeze()
        print(f"  {ticker:<6} loaded from cache  ({len(s)} months)")
        return s

    url = (
        f"https://api.tiingo.com/tiingo/daily/{ticker}/prices"
        f"?startDate={start}&endDate={end}"
        f"&resampleFreq=monthly&token={API_KEY}"
    )
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.RequestException as e:
        print(f"  {ticker:<6} ERROR: {e}")
        return pd.Series(dtype=float)

    if not data:
        print(f"  {ticker:<6} no data returned")
        return pd.Series(dtype=float)

    df           = pd.DataFrame(data)
    df["date"]   = pd.to_datetime(df["date"]).dt.to_period("M").dt.to_timestamp("M")
    df           = df.set_index("date")["adjClose"].rename(ticker)
    df.index    += pd.offsets.MonthEnd(0)
    df           = df.sort_index()

    CACHE.mkdir(exist_ok=True)
    df.to_csv(cache_file)
    print(f"  {ticker:<6} fetched  {len(df)} months "
          f"({df.index.min().date()} → {df.index.max().date()})")
    time.sleep(1.5)   # respect rate limit
    return df


# ── Price → monthly return ────────────────────────────────────────────────────

def prices_to_returns(prices: pd.DataFrame) -> pd.DataFrame:
    """Compute simple monthly total returns from price series."""
    return prices.pct_change().iloc[1:]


# ── ROB-04 proxy splice ───────────────────────────────────────────────────────

def apply_proxy_splice(
    returns:     pd.DataFrame,
    splice_rules: dict = SPLICE_RULES,
) -> pd.DataFrame:
    """
    For each primary ETF that lacks pre-inception history, splice in the
    proxy ETF return series for dates before the splice_date.

    The splice is additive: the proxy fills gaps, never overrides
    existing primary returns. This is documented as ROB-04.

    Returns a DataFrame of spliced monthly returns, one column per ETF.
    """
    spliced = returns.copy()

    for primary, (proxy, splice_date_str) in splice_rules.items():
        if primary not in returns.columns:
            print(f"  ROB-04: {primary} not in returns — skipping splice")
            continue
        if proxy not in returns.columns:
            print(f"  ROB-04: proxy {proxy} not available — {primary} gap unchanged")
            continue

        splice_date   = pd.Timestamp(splice_date_str) + pd.offsets.MonthEnd(0)
        primary_start = returns[primary].first_valid_index()

        # Dates where primary is missing but proxy is available
        missing_mask  = (spliced.index <= splice_date) & spliced[primary].isna()
        proxy_avail   = spliced.index[missing_mask & spliced[proxy].notna()]

        if len(proxy_avail) == 0:
            print(f"  ROB-04: {primary} ← {proxy}: no gap to fill")
            continue

        # Scale proxy to match primary variance in the overlap period
        # (prevents discontinuity at splice point)
        overlap_start = primary_start
        overlap_end   = splice_date
        overlap_primary = returns.loc[overlap_start:overlap_end, primary].dropna()
        overlap_proxy   = returns.loc[overlap_start:overlap_end, proxy].dropna()

        common_idx = overlap_primary.index.intersection(overlap_proxy.index)
        if len(common_idx) >= 6:
            scale = (overlap_primary.loc[common_idx].std() /
                     overlap_proxy.loc[common_idx].std())
            scale = np.clip(scale, 0.5, 2.0)   # bound the scaling factor
        else:
            scale = 1.0

        n_filled = len(proxy_avail)
        spliced.loc[missing_mask, primary] = (
            spliced.loc[missing_mask, proxy] * scale
        )

        print(f"  ROB-04: {primary} ← {proxy}  "
              f"({n_filled} months filled, scale={scale:.3f}, "
              f"up to {splice_date.date()})")

    return spliced[[c for c in SECTOR_MAP.keys() if c in spliced.columns]]


# ── FF5 factor loader (reused from ff5_regression.py) ────────────────────────

def load_ff5(path: Path, start: str, end: str) -> pd.DataFrame:
    """Load Ken French 5-factor monthly data (robust parser)."""
    import re

    with open(path, encoding="latin-1") as f:
        raw = f.readlines()

    header_idx = next(
        i for i, l in enumerate(raw) if "Mkt-RF" in l or "MKT-RF" in l.upper()
    )
    col_names  = raw[header_idx].strip().lstrip(",")
    col_names  = ([c.strip() for c in col_names.split(",") if c.strip()]
                  if "," in col_names else col_names.split())

    data_rows  = []
    for line in raw[header_idx + 1:]:
        s = line.strip()
        if not re.match(r"^\d{6}[,\s]", s):
            continue
        parts = [p.strip() for p in s.split(",")] if "," in s else s.split()
        if len(parts) == len(col_names) + 1:
            data_rows.append(parts)

    ff = (pd.DataFrame(data_rows, columns=["date"] + col_names)
            .set_index("date"))
    ff.index = pd.to_datetime(ff.index, format="%Y%m") + pd.offsets.MonthEnd(0)
    ff = ff.apply(pd.to_numeric, errors="coerce") / 100
    ff = ff.rename(columns={c: "MKT" for c in ff.columns
                             if c.strip().upper() in ("MKT-RF", "MKT_RF")})
    return ff[["MKT", "SMB", "HML", "RMW", "CMA", "RF"]].loc[start:end]


# ── Rolling FF5 alpha ─────────────────────────────────────────────────────────

def compute_rolling_alphas(
    returns: pd.DataFrame,
    ff5:     pd.DataFrame,
    window:  int = WINDOW,
) -> pd.DataFrame:
    """
    Rolling 24-month FF5 regression per ETF.
    Returns DataFrame of monthly alphas (intercepts).
    """
    try:
        import statsmodels.api as sm
    except ImportError:
        raise ImportError("pip install statsmodels")

    aligned     = returns.join(ff5, how="inner")
    factor_cols = ["MKT", "SMB", "HML", "RMW", "CMA"]
    results     = {}

    for etf in returns.columns:
        if etf not in aligned.columns:
            continue
        excess = aligned[etf] - aligned["RF"]
        alphas = pd.Series(index=aligned.index, dtype=float)

        for t in range(window, len(aligned)):
            win  = aligned.iloc[t - window: t]
            y    = (excess.iloc[t - window: t]).values
            X    = sm.add_constant(win[factor_cols].values)
            if np.isnan(y).any() or np.isnan(X).any():
                continue
            try:
                alphas.iloc[t] = sm.OLS(y, X).fit().params[0]
            except Exception:
                pass

        results[etf] = alphas
        valid = alphas.notna().sum()
        print(f"  {etf:<6}: {valid} monthly alphas "
              f"({alphas.first_valid_index() and alphas.first_valid_index().date()} "
              f"→ {alphas.last_valid_index() and alphas.last_valid_index().date()})")

    return pd.DataFrame(results).dropna(how="all")


# ── Coverage analysis ─────────────────────────────────────────────────────────

def report_coverage(
    alpha_df:   pd.DataFrame,
    ssi_path:   Path = Path("ssi_events.csv"),
    k_months:   list = [6, 12, 18, 24],
) -> dict:
    """
    Report how many of the 138 SSI events now have a matching FF5 alpha
    at each prediction horizon k.
    """
    if not ssi_path.exists():
        print(f"  {ssi_path} not found — skipping coverage check")
        return {}

    ssi      = pd.read_csv(ssi_path, parse_dates=["eval_date"])
    coverage = {}

    print(f"\n  Alpha coverage after Tiingo extension + ROB-04 proxies:")
    print(f"  {'k (months)':<12} {'Events with alpha':>18} {'Coverage':>10}")
    print("  " + "─" * 44)

    for k in k_months:
        hits = 0
        for _, row in ssi.iterrows():
            eval_ts  = pd.Timestamp(row["eval_date"])
            target_t = eval_ts + pd.DateOffset(months=k)
            target_t = target_t + pd.offsets.MonthEnd(0)
            sector   = row["sector"]
            if (sector in alpha_df.columns and
                    target_t in alpha_df.index and
                    pd.notna(alpha_df.loc[target_t, sector])):
                hits += 1
        pct = hits / len(ssi)
        coverage[k] = {"hits": hits, "total": len(ssi), "pct": pct}
        bar = "█" * int(pct * 25)
        print(f"  k={k:<10} {hits:>12}/{len(ssi):<6} {pct:>9.1%}  {bar}")

    return coverage


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not API_KEY:
        print("ERROR: TIINGO_API_KEY environment variable not set.")
        print("Run:  set TIINGO_API_KEY=82de17312c2418e9275a59784984436803f82a23")
        sys.exit(1)

    print("\nVentureGraph 2.0 — Week 3: Extended ETF Fetch (Tiingo)")
    print("=" * 60)

    # ── Step 1: Fetch all tickers ──────────────────────────────────────────
    all_tickers = PRIMARY_ETFS + PROXY_ETFS
    print(f"\n[1/5] Fetching {len(all_tickers)} ETFs from Tiingo ({START} → {END}) ...")
    prices = {}
    for ticker in all_tickers:
        s = fetch_tiingo_monthly(ticker, START, END)
        if not s.empty:
            prices[ticker] = s

    if not prices:
        print("No data fetched. Check your API key and internet connection.")
        sys.exit(1)

    price_df = pd.DataFrame(prices)
    print(f"\n  Price matrix: {price_df.shape[0]} months × {price_df.shape[1]} tickers")

    # ── Step 2: Compute returns ────────────────────────────────────────────
    print("\n[2/5] Computing monthly returns ...")
    returns = prices_to_returns(price_df)
    print(f"  Returns matrix: {returns.shape}")

    # ── Step 3: Apply ROB-04 proxy splice ─────────────────────────────────
    print("\n[3/5] Applying ROB-04 proxy splices ...")
    spliced = apply_proxy_splice(returns)
    print(f"  Spliced matrix: {spliced.shape}")

    # ── Step 4: Load FF5 and compute rolling alphas ────────────────────────
    print("\n[4/5] Loading FF5 factors and computing rolling alphas ...")
    if not FF5_PATH.exists():
        print(f"  ERROR: {FF5_PATH} not found.")
        print("  Download from: https://mba.tuck.dartmouth.edu/pages/faculty/"
              "ken.french/data_library.html")
        sys.exit(1)

    ff5    = load_ff5(FF5_PATH, START, END)
    alphas = compute_rolling_alphas(spliced, ff5)

    # Save in the format expected by compute_ssi.py
    alpha_long = (
        alphas.reset_index()
              .melt(id_vars="date", var_name="etf", value_name="alpha")
              .dropna(subset=["alpha"])
    )
    alpha_long["sector"] = alpha_long["etf"]   # ETF symbol = sector key
    alpha_long.to_csv(OUT_PATH, index=False)
    print(f"\n  Extended alphas saved → {OUT_PATH}  ({len(alpha_long):,} rows)")

    # ── Step 5: Coverage report ────────────────────────────────────────────
    print("\n[5/5] Checking SSI event coverage ...")
    coverage = report_coverage(alphas)

    print("\n" + "=" * 60)
    print("WEEK 3 ETF FETCH — COMPLETE")
    print("=" * 60)
    print(f"  sector_alphas_extended.csv written")
    print()
    print("  NEXT STEPS:")
    print("  1. Copy sector_alphas_extended.csv → sector_alphas.csv")
    print("     (replaces the short yfinance version)")
    print()
    print("  2. Rerun the event panel:")
    print("     python compute_ssi.py . --rebuild")
    print()
    print("  3. If k=12 coverage ≥ 100 events, run full panel regression:")
    print("     python ff5_regression.py  (SSIPanelRegression block)")
    print("=" * 60)
