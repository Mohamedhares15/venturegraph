"""
VentureGraph 2.0 — Week 2: Signal Construction
===============================================
compute_ssi.py

Builds the SSI Event Panel by:
    1. Loading investment data from the local Crunchbase CSVs
    2. Aligning point-in-time TPS scores from the expanding window panel
    3. Detecting "swarm events" per sector per quarter
    4. Computing SSI_structured and SSI_dumb side by side
    5. Merging with FF5 sector alphas to produce the regression-ready panel

Pre-registration compliance
---------------------------
All parameters are loaded from preregistration.FIXED_PARAMETERS.
No parameter may be set inline in this file.
Protocol integrity is verified at startup — any modification to
preregistration.py since the seal was generated raises immediately.

Output files
------------
    investment_sector_panel.csv   raw (investor, company, sector, date) rows
    ssi_events.csv                one row per qualifying swarm event
    event_panel.csv               regression-ready: (sector, quarter, ssi,
                                  ssi_dumb, controls, alpha_k12, alpha_k24)

Run
---
    python compute_ssi.py [data_folder]
    python compute_ssi.py [data_folder] --rebuild   # force cache rebuild
"""

import argparse
import logging
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("SSI")

# ── Protocol integrity gate ───────────────────────────────────────────────────

PROTOCOL_HASH = "e2d80c1618d67c0e0c7b167280bc6cd200c3f68146e5c800a57b7a3b1773eea0"

def _verify_protocol():
    try:
        from preregistration import verify_protocol_integrity, FIXED_PARAMETERS
        verify_protocol_integrity(PROTOCOL_HASH)
        log.info("Protocol integrity verified ✓")
        return FIXED_PARAMETERS
    except RuntimeError as e:
        log.error(str(e))
        sys.exit(1)
    except ImportError:
        log.error("preregistration.py not found. Ensure it is in the same folder.")
        sys.exit(1)


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — DATA LOADING
# Bridges local Crunchbase CSVs into a flat investment panel with sector labels
# ══════════════════════════════════════════════════════════════════════════════

def load_investment_panel(
    data_dir:     Path,
    sector_bridge: pd.DataFrame,
    cache_path:   Path,
    rebuild:      bool = False,
) -> pd.DataFrame:
    """
    Join investments.csv + funding_rounds.csv + objects.csv into a flat panel:

        investor_name | company_name | category_code | funded_at
        funding_round_type | etf_primary | sector_name | confidence

    Then attach sector labels from the pre-registered sector bridge.

    Only Series A and Series B rounds are retained (pre-registration §2 data).
    Self-referential rows (investor == company) are dropped.

    Result is cached to `cache_path` to avoid re-joining on every run.
    """
    if cache_path.exists() and not rebuild:
        df = pd.read_csv(cache_path, parse_dates=["funded_at"])
        log.info(f"Investment panel loaded from cache: {len(df):,} rows")
        return df

    log.info("Building investment panel from raw CSVs ...")

    # ── investments.csv ───────────────────────────────────────────────────
    log.info("  Loading investments.csv ...")
    inv = pd.read_csv(
        data_dir / "investments.csv",
        usecols=["funding_round_id", "funded_object_id", "investor_object_id"],
        encoding="latin-1", low_memory=False,
    )
    log.info(f"  {len(inv):,} investment rows")

    # ── funding_rounds.csv — filter to Series A/B immediately ─────────────
    log.info("  Loading funding_rounds.csv ...")
    rounds = pd.read_csv(
        data_dir / "funding_rounds.csv",
        usecols=["funding_round_id", "object_id", "funded_at", "funding_round_type"],
        encoding="latin-1", low_memory=False,
    )
    rounds["funding_round_type"] = rounds["funding_round_type"].str.strip().str.lower()
    rounds = rounds[rounds["funding_round_type"].isin(["series-a", "series-b"])].copy()
    log.info(f"  {len(rounds):,} Series A/B rounds")

    # ── objects.csv — id, name, category_code only ─────────────────────────
    log.info("  Loading objects.csv (large — may take ~30s) ...")
    obj = pd.read_csv(
        data_dir / "objects.csv",
        usecols=["id", "name", "category_code"],
        encoding="latin-1", low_memory=False,
    )
    obj["name"] = obj["name"].str.strip()
    log.info(f"  {len(obj):,} objects")

    # ── Join pipeline ─────────────────────────────────────────────────────
    df = inv.merge(rounds, on="funding_round_id", how="inner")

    investor_map = obj[["id", "name"]].rename(
        columns={"id": "investor_object_id", "name": "investor_name"}
    )
    df = df.merge(investor_map, on="investor_object_id", how="left")

    company_map = obj[["id", "name", "category_code"]].rename(
        columns={"id": "funded_object_id", "name": "company_name"}
    )
    df = df.merge(company_map, on="funded_object_id", how="left")

    # ── Clean ─────────────────────────────────────────────────────────────
    df["funded_at"]     = pd.to_datetime(df["funded_at"], errors="coerce")
    df["investor_name"] = df["investor_name"].str.strip()
    df["company_name"]  = df["company_name"].str.strip()
    df = df.dropna(subset=["funded_at", "investor_name", "company_name"])
    df = df[df["investor_name"] != df["company_name"]]   # drop self-refs

    # ── Normalise category for bridge merge ───────────────────────────────
    df["category_norm"] = (
        df["category_code"]
        .fillna("unknown")
        .str.lower()
        .str.strip()
    )

    # ── Attach sector labels ───────────────────────────────────────────────
    bridge_norm = sector_bridge.copy()
    bridge_norm["category_norm"] = (
        bridge_norm["crunchbase_category"].str.lower().str.strip()
    )
    df = df.merge(
        bridge_norm[["category_norm", "etf_primary", "sector_name", "confidence"]],
        on="category_norm", how="left",
    )

    # Keep only rows with a sector mapping (required for SSI)
    df_mapped = df.dropna(subset=["etf_primary"]).copy()
    n_unmapped = len(df) - len(df_mapped)
    if n_unmapped > 0:
        log.warning(f"  {n_unmapped:,} rows dropped — no sector mapping found")

    log.info(
        f"  Panel built: {len(df_mapped):,} rows | "
        f"{df_mapped['company_name'].nunique():,} companies | "
        f"{df_mapped['investor_name'].nunique():,} investors | "
        f"{df_mapped['etf_primary'].nunique()} sectors"
    )

    df_mapped.to_csv(cache_path, index=False)
    log.info(f"  Investment panel cached → {cache_path}")
    return df_mapped


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — FIRST-ENTRY TABLE
# For each (investor, sector) pair: the date of their very first investment
# This is the contamination-proof foundation for "new entrant" detection
# ══════════════════════════════════════════════════════════════════════════════

def build_first_entry_table(inv_panel: pd.DataFrame) -> pd.DataFrame:
    """
    Compute the first date each investor entered each sector.

    CRITICAL: this uses the FULL historical panel (not filtered to a window).
    The window filtering happens inside compute_ssi() at each eval_date using
    only the subset of this table that existed at or before that eval_date.

    Columns returned:
        investor_name | etf_primary | first_entry_date
    """
    first_entry = (
        inv_panel
        .groupby(["investor_name", "etf_primary"])["funded_at"]
        .min()
        .reset_index()
        .rename(columns={"funded_at": "first_entry_date"})
    )
    log.info(
        f"First-entry table: {len(first_entry):,} "
        f"(investor × sector) pairs"
    )
    return first_entry


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — SSI COMPUTATION
# The core signal engine — one function per pre-registered specification
# ══════════════════════════════════════════════════════════════════════════════

def compute_ssi(
    tps_panel:       pd.DataFrame,
    first_entry:     pd.DataFrame,
    window_months:   int = 6,      # pre-registered w=6
    min_investors:   int = 5,      # pre-registered cluster threshold
) -> pd.DataFrame:
    """
    SSI_{s,t} = Σ_{i ∈ I(s,t,w)} TPS_pit(i,t) × IPD_weight(i,s,t)

    Where:
        I(s,t,w)        = investors making FIRST entry into sector s
                          within the window [t-w, t]
        TPS_pit(i,t)    = point-in-time TPS from expanding window panel
                          (contamination-free — no future data)
        IPD_weight(i,t) = 1 / rank_by_entry_date(i)
                          earliest entrant in the swarm gets weight=1,
                          second gets 1/2, etc.

    SSI_dumb = raw count of new entrants (no TPS or IPD weighting)
    Both are returned in the same DataFrame for direct comparison.

    Parameters
    ----------
    tps_panel     : output of expanding_window_tps.compute_expanding_tps()
                    columns: eval_date, investor, tps, in_top_tier
    first_entry   : output of build_first_entry_table()
                    columns: investor_name, etf_primary, first_entry_date
    window_months : rolling window for new-entrant detection (pre-reg: 6)
    min_investors : minimum swarm size (pre-reg: 5)

    Returns
    -------
    pd.DataFrame with columns:
        eval_date | sector | ssi | ssi_dumb | n_entrants | mean_tps
        median_ipd_days | swarm_investors (comma-sep names for audit)
    """
    eval_dates  = sorted(tps_panel["eval_date"].unique())
    window      = pd.DateOffset(months=window_months)
    ssi_records = []

    log.info(
        f"Computing SSI over {len(eval_dates)} eval dates × "
        f"{first_entry['etf_primary'].nunique()} sectors | "
        f"window={window_months}mo | min_investors={min_investors}"
    )

    for eval_ts in eval_dates:
        eval_ts      = pd.Timestamp(eval_ts)
        window_start = eval_ts - window

        # ── Point-in-time TPS scores for this eval date ───────────────────
        # Only scores computed on data ≤ eval_ts (contamination-free)
        tps_at_t = (
            tps_panel[tps_panel["eval_date"] == eval_ts]
            .set_index("investor")[["tps", "in_top_tier"]]
        )

        # ── First-entry events visible at eval_ts ─────────────────────────
        # An investor's first-entry date is only "known" if it happened
        # at or before eval_ts — this respects the information boundary
        visible_entries = first_entry[
            first_entry["first_entry_date"] <= eval_ts
        ].copy()

        for sector in first_entry["etf_primary"].unique():
            # New entrants: first entered this sector in (window_start, eval_ts]
            swarm_candidates = visible_entries[
                (visible_entries["etf_primary"] == sector) &
                (visible_entries["first_entry_date"] >  window_start) &
                (visible_entries["first_entry_date"] <= eval_ts)
            ].copy()

            n = len(swarm_candidates)
            if n < min_investors:
                continue   # below pre-registered swarm threshold

            # ── IPD weighting: rank by entry date (1=fastest) ─────────────
            swarm_candidates = swarm_candidates.sort_values("first_entry_date")
            swarm_candidates["ipd_rank"]   = np.arange(1, n + 1, dtype=float)
            swarm_candidates["ipd_weight"] = 1.0 / swarm_candidates["ipd_rank"]

            # ── Point-in-time TPS lookup ───────────────────────────────────
            swarm_candidates["tps_pit"] = (
                swarm_candidates["investor_name"]
                .map(tps_at_t["tps"])
                .fillna(0.0)   # 0 for investors not yet scored at this date
            )

            # ── SSI structured ─────────────────────────────────────────────
            ssi = float(
                (swarm_candidates["tps_pit"] * swarm_candidates["ipd_weight"]).sum()
            )

            # ── SSI dumb (pre-registered null model) ──────────────────────
            ssi_dumb = float(n)

            # ── IPD spread: median days between first and last entrant ─────
            # A tight swarm (low spread) is a stronger signal than a
            # slow trickle — useful as a robustness control variable
            dates_sorted = swarm_candidates["first_entry_date"].sort_values()
            ipd_spread_days = float(
                (dates_sorted.iloc[-1] - dates_sorted.iloc[0]).days
            )

            ssi_records.append({
                "eval_date":        eval_ts,
                "sector":           sector,
                "ssi":              round(ssi, 8),
                "ssi_dumb":         ssi_dumb,
                "n_entrants":       n,
                "mean_tps_pit":     round(float(swarm_candidates["tps_pit"].mean()), 6),
                "max_tps_pit":      round(float(swarm_candidates["tps_pit"].max()),  6),
                "n_top_tier":       int(swarm_candidates["investor_name"]
                                        .isin(tps_at_t[tps_at_t["in_top_tier"]].index)
                                        .sum()),
                "ipd_spread_days":  ipd_spread_days,
                "swarm_investors":  "|".join(swarm_candidates["investor_name"].tolist()),
            })

    result = pd.DataFrame(ssi_records)

    if result.empty:
        log.warning(
            "No swarm events detected. Check: "
            "(1) sector bridge has coverage, "
            "(2) min_investors threshold not too high, "
            "(3) eval dates overlap with investment data range."
        )
        return result

    result = result.sort_values(["eval_date", "sector"]).reset_index(drop=True)
    log.info(
        f"SSI events detected: {len(result):,} | "
        f"Sectors: {result['sector'].nunique()} | "
        f"Date range: {result['eval_date'].min().date()} → "
        f"{result['eval_date'].max().date()}"
    )
    return result


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — EVENT PANEL ASSEMBLY
# Joins SSI events with FF5 alphas and controls to produce the
# regression-ready panel for Stage 2 (SSIPanelRegression in ff5_regression.py)
# ══════════════════════════════════════════════════════════════════════════════

def build_event_panel(
    ssi_df:       pd.DataFrame,
    alpha_long:   pd.DataFrame,
    k_months:     list = [6, 12, 18, 24],
) -> pd.DataFrame:
    """
    Align SSI at time t with FF5 alpha at time t+k for each horizon k.

    The result is a panel with one row per (eval_date, sector) that has:
        - SSI and SSI_dumb at time t
        - FF5 alpha at t+k for each k in k_months
        - Control variables (sector momentum, deal volume)

    This is the exact input to SSIPanelRegression in ff5_regression.py.

    Parameters
    ----------
    ssi_df      : output of compute_ssi()
    alpha_long  : output of FF5AlphaEngine.to_long()
                  columns: date, sector, etf, alpha
    k_months    : pre-registered prediction horizons

    Returns
    -------
    pd.DataFrame with one row per (eval_date × sector) observation
    """
    if ssi_df.empty:
        log.error("SSI DataFrame is empty — cannot build event panel.")
        return pd.DataFrame()

    ssi_df      = ssi_df.copy()
    alpha_long  = alpha_long.copy()
    ssi_df["eval_date"]  = pd.to_datetime(ssi_df["eval_date"])
    alpha_long["date"]   = pd.to_datetime(alpha_long["date"])

    # ── Align merge key ───────────────────────────────────────────────────
    # SSI 'sector' column contains ETF symbols (XLF, FDN, XBI, SOXX).
    # alpha_long may have sector as human-readable name ("fintech") OR
    # as ETF symbol depending on how ff5_regression.py was run.
    # Use the 'etf' column from alpha_long if present (most reliable),
    # otherwise fall back to 'sector'.  Rename it to 'sector' for the merge.
    if "etf" in alpha_long.columns:
        alpha_merge = alpha_long.rename(columns={"etf": "_merge_sector"})
    else:
        alpha_merge = alpha_long.rename(columns={"sector": "_merge_sector"})
    ssi_merge = ssi_df.rename(columns={"sector": "_merge_sector"})

    panel = ssi_merge.copy()

    # ── Attach alpha at each horizon k ────────────────────────────────────
    for k in k_months:
        alpha_k = (
            alpha_merge[["date", "_merge_sector", "alpha"]]
            .rename(columns={"alpha": f"alpha_k{k}"})
        )
        # Forward-shift: alpha at t+k aligns with SSI at t
        alpha_k["eval_date"] = alpha_k["date"] - pd.DateOffset(months=k)
        alpha_k = alpha_k.drop(columns=["date"])

        panel = panel.merge(alpha_k, on=["eval_date", "_merge_sector"], how="left")

    # Restore the 'sector' column name
    panel = panel.rename(columns={"_merge_sector": "sector"})

    # ── Sector return momentum (lagged 3-month return as control) ─────────
    for k in k_months:
        col = f"alpha_k{k}"
        if col in panel.columns:
            panel[f"retmom_{col}"] = panel.groupby("sector")[col].shift(3)

    # ── Log deal volume (number of qualifying investments in window) ───────
    panel["log_deal_volume"] = np.log1p(panel["n_entrants"])

    # ── Normalise SSI to [0,1] per sector for comparability ──────────────
    # (raw SSI magnitudes vary by sector size; normalisation is informative
    #  but the regression uses raw SSI — this is an audit column only)
    panel["ssi_norm"] = panel.groupby("sector")["ssi"].transform(
        lambda x: (x - x.min()) / (x.max() - x.min() + 1e-10)
    )

    # ── Final sort and clean ───────────────────────────────────────────────
    panel = panel.sort_values(["eval_date", "sector"]).reset_index(drop=True)

    # Report coverage
    for k in k_months:
        col   = f"alpha_k{k}"
        valid = panel[col].notna().sum() if col in panel.columns else 0
        log.info(f"  alpha_k{k:>2}: {valid:,}/{len(panel):,} observations with alpha")

    return panel


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — DUMB BENCHMARK COMPARISON
# Proves the structured SSI adds value beyond raw deal count
# This is the single most important test for peer review acceptance
# ══════════════════════════════════════════════════════════════════════════════

def run_dumb_benchmark(
    event_panel: pd.DataFrame,
    k_primary:   int = 12,
) -> dict:
    """
    Side-by-side OLS comparison: SSI_structured vs SSI_dumb as predictors
    of alpha_k{k_primary}.

    This is a simplified (non-double-clustered) version for quick diagnostics.
    The full publication-grade test runs in SSIPanelRegression (ff5_regression.py).

    Returns a dict with:
        r2_structured  — R² of model with SSI_structured
        r2_dumb        — R² of model with SSI_dumb
        r2_joint       — R² of model with both
        r2_increment   — r2_joint - r2_dumb (incremental contribution of structure)
        beta_structured, beta_dumb, p_structured, p_dumb
        verdict        — "STRUCTURED WINS" / "DUMB WINS" / "INCONCLUSIVE"
    """
    try:
        import statsmodels.api as sm
        from scipy import stats as scipy_stats
    except ImportError:
        log.error("statsmodels required: pip install statsmodels")
        return {}

    alpha_col = f"alpha_k{k_primary}"
    required  = ["ssi", "ssi_dumb", alpha_col]
    sub       = event_panel[required].dropna()

    if len(sub) < 20:
        log.warning(
            f"Only {len(sub)} complete observations for k={k_primary}. "
            f"Insufficient for reliable OLS."
        )
        return {"n_obs": len(sub), "verdict": "INSUFFICIENT DATA"}

    y         = sub[alpha_col].values
    X_struct  = sm.add_constant(sub[["ssi"]].values)
    X_dumb    = sm.add_constant(sub[["ssi_dumb"]].values)
    X_joint   = sm.add_constant(sub[["ssi", "ssi_dumb"]].values)

    ols_s = sm.OLS(y, X_struct).fit()
    ols_d = sm.OLS(y, X_dumb).fit()
    ols_j = sm.OLS(y, X_joint).fit()

    beta_s = ols_s.params[1]
    beta_d = ols_d.params[1]
    p_s    = ols_s.pvalues[1]
    p_d    = ols_d.pvalues[1]
    r2_inc = ols_j.rsquared - ols_d.rsquared

    if p_s < 0.05 and beta_s > 0 and r2_inc > 0.01:
        verdict = "STRUCTURED WINS"
    elif p_d < 0.05 and p_s >= 0.05:
        verdict = "DUMB WINS"
    elif p_s < 0.05 and abs(beta_s) > abs(beta_d):
        verdict = "STRUCTURED WINS (magnitude)"
    else:
        verdict = "INCONCLUSIVE — run full panel regression"

    results = {
        "n_obs":          len(sub),
        "k_months":       k_primary,
        "r2_structured":  round(ols_s.rsquared, 6),
        "r2_dumb":        round(ols_d.rsquared, 6),
        "r2_joint":       round(ols_j.rsquared, 6),
        "r2_increment":   round(r2_inc,          6),
        "beta_structured":round(beta_s, 6),
        "beta_dumb":      round(beta_d, 6),
        "p_structured":   round(p_s, 6),
        "p_dumb":         round(p_d, 6),
        "verdict":        verdict,
    }

    # ── Print diagnostic table ─────────────────────────────────────────────
    def stars(p):
        return "***" if p < 0.01 else "**" if p < 0.05 else "*" if p < 0.10 else ""

    print(f"\n  Dumb Benchmark — k={k_primary} months")
    print(f"  {'─'*60}")
    print(f"  {'Model':<22} {'Beta':>10} {'p-value':>10} {'R²':>10}")
    print(f"  {'─'*60}")
    print(f"  {'SSI structured':<22} {beta_s:>+10.6f} "
          f"{p_s:>10.4f}{stars(p_s):<3} {ols_s.rsquared:>10.6f}")
    print(f"  {'SSI dumb (count)':<22} {beta_d:>+10.6f} "
          f"{p_d:>10.4f}{stars(p_d):<3} {ols_d.rsquared:>10.6f}")
    print(f"  {'Joint model':<22} {'':>10} {'':>10} {ols_j.rsquared:>10.6f}")
    print(f"  {'─'*60}")
    print(f"  Incremental R² (structured over dumb): {r2_inc:+.6f}")
    print(f"  *** VERDICT: {verdict}")

    return results


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 6 — PLACEBO TEST
# Permutes swarm event dates to build a null distribution for β_SSI
# Your real β must exceed the 99th percentile of this distribution
# ══════════════════════════════════════════════════════════════════════════════

def run_placebo_test(
    event_panel: pd.DataFrame,
    k_primary:   int   = 12,
    n_perms:     int   = 1000,
    seed:        int   = 42,
) -> dict:
    """
    Randomly shuffle SSI values across (date, sector) observations 1,000 times.
    Re-run OLS for each permutation. Record β_SSI from each permutation.

    Real signal requirement (pre-registration §3 ROB-02):
        real_beta > 99th percentile of permutation distribution

    This test is computationally cheap (no graph recomputation —
    just OLS on shuffled columns) and is the strongest single defence
    against the "spurious correlation" objection.
    """
    try:
        import statsmodels.api as sm
    except ImportError:
        log.error("statsmodels required: pip install statsmodels")
        return {}

    alpha_col = f"alpha_k{k_primary}"
    sub       = event_panel[["ssi", alpha_col]].dropna()

    if len(sub) < 20:
        return {"verdict": "INSUFFICIENT DATA"}

    y    = sub[alpha_col].values
    rng  = np.random.default_rng(seed)
    perm_betas = np.zeros(n_perms)

    for i in range(n_perms):
        ssi_perm     = rng.permutation(sub["ssi"].values)
        X_perm       = sm.add_constant(ssi_perm)
        perm_betas[i] = sm.OLS(y, X_perm).fit().params[1]

    real_beta = sm.OLS(y, sm.add_constant(sub["ssi"].values)).fit().params[1]
    pct_99    = np.percentile(perm_betas, 99)
    p_val     = (perm_betas >= real_beta).mean()

    passed    = real_beta > pct_99
    verdict   = "PASSES PLACEBO" if passed else "FAILS PLACEBO — result may be noise"

    print(f"\n  Placebo Test (n={n_perms} permutations) — k={k_primary} months")
    print(f"  {'─'*50}")
    print(f"  Real β_SSI            : {real_beta:+.6f}")
    print(f"  99th pct (permuted)   : {pct_99:+.6f}")
    print(f"  Permutation p-value   : {p_val:.4f}")
    print(f"  *** VERDICT           : {verdict}")

    return {
        "real_beta":    real_beta,
        "pct_99":       pct_99,
        "perm_p_value": p_val,
        "passed":       passed,
        "verdict":      verdict,
        "n_perms":      n_perms,
    }


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 7 — MAIN PIPELINE
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="VentureGraph 2.0 — Week 2: SSI Signal Construction"
    )
    parser.add_argument("data_dir", nargs="?", default=".",
                        help="Folder containing investments.csv, etc.")
    parser.add_argument("--rebuild", action="store_true",
                        help="Force rebuild of all cached files")
    args = parser.parse_args()

    DATA_DIR  = Path(args.data_dir)
    CACHE_DIR = Path(".ssi_cache")
    CACHE_DIR.mkdir(exist_ok=True)

    print("\nVentureGraph 2.0 — Week 2: Signal Construction")
    print("=" * 60)

    # ── Step 0: Verify protocol integrity ─────────────────────────────────
    print("\n[0/6] Verifying protocol integrity ...")
    params = _verify_protocol()
    W      = params["ssi"]["rolling_window_months"]
    MIN_SW = params["ssi"]["min_swarm_size"]
    K_LIST = (params["prediction_horizons_k"]["primary"] +
              params["prediction_horizons_k"]["secondary"])
    K_PRI  = params["prediction_horizons_k"]["primary"][0]   # k=12

    # ── Step 1: Build sector bridge ────────────────────────────────────────
    print("\n[1/6] Building sector bridge ...")
    from sector_mapping import SectorMapper
    mapper = SectorMapper(cache_dir=CACHE_DIR / "sector_cache")
    mapper.build(crunchbase_df=None, force_rebuild=args.rebuild)
    bridge = mapper._bridge
    print(f"  {len(bridge)} sector mappings loaded")

    # ── Step 2: Load investment panel ─────────────────────────────────────
    print("\n[2/6] Loading investment panel ...")
    inv_panel = load_investment_panel(
        data_dir   = DATA_DIR,
        sector_bridge = bridge,
        cache_path = CACHE_DIR / "investment_panel.csv",
        rebuild    = args.rebuild,
    )
    inv_panel.to_csv("investment_sector_panel.csv", index=False)

    # ── Step 3: Build first-entry table ───────────────────────────────────
    print("\n[3/6] Building first-entry table ...")
    first_entry = build_first_entry_table(inv_panel)

    # ── Step 4: Load expanding-window TPS panel ───────────────────────────
    print("\n[4/6] Loading expanding-window TPS panel ...")
    tps_path = Path("tps_panel_expanding.csv")
    if not tps_path.exists():
        log.info("  tps_panel_expanding.csv not found — running now ...")
        from expanding_window_tps import compute_expanding_tps
        import pandas as _pd

        # Build edges from the investment panel
        from graph_construction import build_round_table, build_edges
        rt     = build_round_table(inv_panel.rename(
            columns={"investor_name":"investor_name",
                     "funded_at":"funded_at",
                     "funding_round_type":"funding_round_type",
                     "company_name":"company_name"}))
        edges  = build_edges(rt)
        edf    = pd.DataFrame(edges)
        edf["round_date"] = pd.to_datetime(edf.get("round_date",
                            rt.set_index(["company_name","funding_round_type"])
                            ["round_date"].reindex(
                                pd.MultiIndex.from_arrays(
                                    [edf["company"], edf["source_round"]])).values))
        tps_panel = compute_expanding_tps(
            edges_df   = edf,
            start_date = "2005-12-31",
            end_date   = "2012-12-31",
            freq       = "QE",
            cache_dir  = CACHE_DIR / "tps_cache",
        )
        tps_panel.to_csv(tps_path, index=False)
    else:
        tps_panel = pd.read_csv(tps_path, parse_dates=["eval_date"])
        log.info(f"  TPS panel loaded: {len(tps_panel):,} rows | "
                 f"{tps_panel['eval_date'].nunique()} eval dates | "
                 f"{tps_panel['investor'].nunique():,} investors")

    # ── Step 5: Compute SSI ────────────────────────────────────────────────
    print("\n[5/6] Computing SSI event panel ...")
    ssi_df = compute_ssi(
        tps_panel     = tps_panel,
        first_entry   = first_entry,
        window_months = W,
        min_investors = MIN_SW,
    )

    if ssi_df.empty:
        print("\n  ⚠ No swarm events detected with current parameters.")
        print("  Suggestions:")
        print(f"  1. Reduce min_investors below {MIN_SW} in preregistration.py")
        print("  2. Widen sector bridge coverage")
        print("  3. Check investment panel date range vs TPS panel dates")
        sys.exit(0)

    ssi_df.to_csv("ssi_events.csv", index=False)
    print(f"\n  SSI events saved → ssi_events.csv ({len(ssi_df):,} events)")

    # Print top 10 events for inspection
    print(f"\n  Top 10 SSI events (by SSI score):")
    print(f"  {'Date':<14} {'Sector':<22} {'SSI':>8} "
          f"{'Dumb':>6} {'N':>4} {'Mean TPS':>10}")
    print("  " + "─" * 70)
    for _, r in ssi_df.nlargest(10, "ssi").iterrows():
        print(f"  {str(r['eval_date'])[:10]:<14} {r['sector']:<22} "
              f"{r['ssi']:>8.4f} {r['ssi_dumb']:>6.0f} "
              f"{r['n_entrants']:>4.0f} {r['mean_tps_pit']:>10.4f}")

    # ── Step 6: Build event panel & run benchmark ─────────────────────────
    print("\n[6/6] Building event panel & dumb benchmark ...")

    # Try to load FF5 alphas — use synthetic if real data not yet downloaded
    alpha_path = Path("sector_alphas.csv")
    if alpha_path.exists():
        alpha_long = pd.read_csv(alpha_path, parse_dates=["date"])
        log.info(f"  FF5 alphas loaded: {len(alpha_long):,} rows")
    else:
        log.warning(
            "  sector_alphas.csv not found. "
            "Run ff5_regression.py after downloading:\n"
            "  • Ken French FF5 factors: "
            "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html\n"
            "  • ETF prices: yfinance (pip install yfinance)\n"
            "  Proceeding with synthetic alphas for structural testing only."
        )
        # Synthetic alphas for structural test
        sectors    = ssi_df["sector"].unique()
        dates      = pd.date_range("2003-01-31", "2014-12-31", freq="ME")
        np.random.seed(42)
        alpha_long = pd.DataFrame([
            {"date": d, "sector": s, "etf": s, "alpha": np.random.normal(0, 0.01)}
            for d in dates for s in sectors
        ])
        alpha_long["date"] = pd.to_datetime(alpha_long["date"])

    event_panel = build_event_panel(ssi_df, alpha_long, k_months=K_LIST)
    event_panel.to_csv("event_panel.csv", index=False)
    print(f"\n  Event panel saved → event_panel.csv "
          f"({len(event_panel):,} rows × {len(event_panel.columns)} cols)")

    # ── Dumb benchmark ─────────────────────────────────────────────────────
    print(f"\n  Running dumb benchmark (k={K_PRI} months) ...")
    benchmark = run_dumb_benchmark(event_panel, k_primary=K_PRI)

    # ── Placebo test ───────────────────────────────────────────────────────
    print(f"\n  Running placebo permutation test (1,000 permutations) ...")
    placebo = run_placebo_test(event_panel, k_primary=K_PRI, n_perms=1000)

    # ── Final summary ──────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("WEEK 2 SIGNAL CONSTRUCTION — COMPLETE")
    print("=" * 60)
    print(f"  Protocol hash verified  : e2d80c16...")
    print(f"  Investment panel rows   : {len(inv_panel):,}")
    print(f"  Swarm events detected   : {len(ssi_df):,}")
    print(f"  Event panel rows        : {len(event_panel):,}")
    print(f"  Dumb benchmark verdict  : {benchmark.get('verdict', 'N/A')}")
    print(f"  Placebo test verdict    : {placebo.get('verdict', 'N/A')}")
    print()
    print("  Output files:")
    print("    investment_sector_panel.csv  — flat (investor, company, sector, date)")
    print("    ssi_events.csv               — qualifying swarm events")
    print("    event_panel.csv              — regression-ready panel")
    print()
    print("  NEXT: Run full panel regression with double-clustered SE")
    print("  Command: python ff5_regression.py (after downloading real FF5 data)")
    print("=" * 60)
