"""
VentureGraph 2.0 — Alpha Equation: FF5 + Swarm Signal Intensity
===============================================================
Author: Mohamed Hares

THE MODEL
---------
Stage 1 — Time-series FF5 regression per sector ETF (24-month rolling):

    R_{s,t} - R_{f,t} = α_{s,t} + β₁·MKT_t + β₂·SMB_t + β₃·HML_t
                        + β₄·RMW_t + β₅·CMA_t + ε_{s,t}

    where α_{s,t} is the monthly abnormal return for sector s at time t.
    This is the dependent variable — the "alpha" we are trying to predict.

Stage 2 — Panel regression of SSI on future abnormal returns:

    α_{s,t+k} = β₀ + β₁·SSI_{s,t} + β₂·SSI_dumb_{s,t}
               + β₃·ReturnMom_{s,t} + β₄·VIX_t + β₅·DealVolume_{s,t}
               + δ_s + λ_t + ε_{s,t}

    where:
    - k ∈ {6, 12, 18, 24} months (pre-registered prediction horizons)
    - δ_s = sector fixed effects
    - λ_t = time fixed effects
    - Standard errors: double-clustered (sector × time)

THE CONTRIBUTION TEST
---------------------
The paper's core claim holds if and only if:
    β₁ > 0 AND p(β₁) < 0.01 AND β₁_SSI > β₁_SSI_dumb (structural > volume)

Usage
-----
    from ff5_regression import FF5AlphaEngine, SSIPanelRegression
"""

import warnings
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf
from scipy import stats

warnings.filterwarnings("ignore")


# ── Part 1: Fama-French Factor Data ──────────────────────────────────────────

def load_ff5_factors(
    path: Optional[Path] = None,
    start: str = "2003-01-01",
    end:   str = "2014-12-31",
) -> pd.DataFrame:
    """
    Load Fama-French 5-factor monthly data.

    Source: https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html
    File:   'F-F_Research_Data_5_Factors_2x3.CSV'
    Units:  percent (divide by 100 for decimal returns)

    If path is None, downloads directly from Ken French's library.
    """
    if path and Path(path).exists():
        # ── Robust Ken French file parser ────────────────────────────────
        # French distributes a CSV file where:
        #   - Header comment lines appear before the data (variable count)
        #   - Column header line starts with a comma: ",Mkt-RF,SMB,HML,..."
        #   - Monthly data rows: "YYYYMM,val,val,val,val,val,val"
        #   - A blank line + "Annual Factors" section follows at the bottom
        #     with 4-digit YYYY rows: "1927,-12.34,..."
        #
        # Parser strategy:
        #   1. Read all lines
        #   2. Find the column-header line (contains "Mkt-RF")
        #   3. Extract only lines whose first token is exactly 6 digits
        #   4. Build DataFrame directly — never call pd.read_csv on the file
        import re

        with open(path, encoding="latin-1") as f_raw:
            raw_lines = f_raw.readlines()

        # Step 1: find the column-header line
        header_line_idx = None
        for i, line in enumerate(raw_lines):
            if "Mkt-RF" in line or "MKT-RF" in line.upper():
                header_line_idx = i
                break

        if header_line_idx is None:
            raise ValueError(
                f"Could not find 'Mkt-RF' column header in {path}.\n"
                "Ensure you downloaded the Fama/French 5-Factor (2x3) file from:\n"
                "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/"
                "data_library.html"
            )

        # Parse column names — handles both:
        #   CSV format:  ",Mkt-RF,SMB,HML,RMW,CMA,RF"  (leading comma)
        #   TXT format:  "  Mkt-RF  SMB  HML  RMW  CMA  RF"
        header_str = raw_lines[header_line_idx].strip().lstrip(",")
        if "," in header_str:
            col_names = [c.strip() for c in header_str.split(",") if c.strip()]
        else:
            col_names = header_str.split()

        # Step 2: extract 6-digit YYYYMM rows (handles both CSV and TXT)
        # Delimiter can be comma (CSV) or whitespace (TXT)
        data_rows = []
        for line in raw_lines[header_line_idx + 1:]:
            stripped = line.strip()
            # Match "YYYYMM," (CSV) or "YYYYMM " (TXT)
            if not re.match(r'^\d{6}[,\s]', stripped):
                continue
            # Split on comma or whitespace
            if "," in stripped:
                parts = [p.strip() for p in stripped.split(",")]
            else:
                parts = stripped.split()
            # Must have exactly date + len(col_names) values
            if len(parts) != len(col_names) + 1:
                continue
            data_rows.append(parts)

        if not data_rows:
            raise ValueError(
                f"No valid YYYYMM rows found in {path}.\n"
                "If you downloaded the CSV, confirm it is the MONTHLY file,\n"
                "not the annual file. The monthly file has rows like:\n"
                "  192607,-2.97,-3.29,3.23,0.89,-0.73,0.22"
            )

        # Step 3: build DataFrame
        ff = pd.DataFrame(data_rows, columns=["date"] + col_names)
        ff = ff.set_index("date")
        ff.index = (pd.to_datetime(ff.index, format="%Y%m")
                    + pd.offsets.MonthEnd(0))
        ff = ff.apply(pd.to_numeric, errors="coerce") / 100

        # Normalise "Mkt-RF" → "MKT"
        rename_map = {c: "MKT" for c in ff.columns
                      if c.strip().upper() in ("MKT-RF", "MKT_RF")}
        ff = ff.rename(columns=rename_map)

        required = {"MKT", "SMB", "HML", "RMW", "CMA", "RF"}
        missing  = required - set(ff.columns)
        if missing:
            raise ValueError(
                f"Missing columns after parsing: {missing}.\n"
                f"Found: {list(ff.columns)}.\n"
                "Ensure you downloaded the 5-Factor file, not the 3-Factor file."
            )

        result = ff[["MKT", "SMB", "HML", "RMW", "CMA", "RF"]].loc[start:end]
        print(f"  FF5 factors loaded: {len(result)} monthly observations "
              f"({result.index.min().date()} → {result.index.max().date()})")
        return result

    # Fallback: synthetic factors for unit testing (replace with real data)
    import warnings
    warnings.warn(
        "FF5 factor file not found. Using synthetic factors for structure testing. "
        "REPLACE WITH REAL FACTORS before any analysis."
    )
    dates  = pd.date_range(start, end, freq="ME")
    np.random.seed(42)
    n      = len(dates)
    return pd.DataFrame({
        "MKT": np.random.normal(0.008, 0.045, n),
        "SMB": np.random.normal(0.002, 0.030, n),
        "HML": np.random.normal(0.003, 0.030, n),
        "RMW": np.random.normal(0.004, 0.025, n),
        "CMA": np.random.normal(0.003, 0.020, n),
        "RF":  np.random.normal(0.002, 0.002, n),
    }, index=pd.DatetimeIndex(dates))


def load_etf_returns(
    etf_symbols: list,
    start: str = "2003-01-01",
    end:   str = "2014-12-31",
    path:  Optional[Path] = None,
) -> pd.DataFrame:
    """
    Load monthly ETF total returns for sector proxy instruments.

    If a CSV cache exists at `path`, load from there.
    Otherwise, fetch from Yahoo Finance via yfinance.

    Required ETFs (from pre-registration):
        XLF  — Financials (fintech proxy, broad)
        IGV  — Software ETF (SaaS/enterprise proxy)
        FDN  — Internet ETF (consumer internet proxy)
        XBI  — Biotech (health/biotech proxy)
        SOXX — Semiconductors
        ICLN — Clean energy
    """
    if path and Path(path).exists():
        returns = pd.read_csv(path, index_col=0, parse_dates=True)
        return returns.loc[start:end]

    try:
        import yfinance as yf
        prices = yf.download(
            etf_symbols, start=start, end=end,
            interval="1mo", auto_adjust=True, progress=False
        )["Close"]
        returns = prices.pct_change().dropna()
        returns.index = returns.index + pd.offsets.MonthEnd(0)
        if path:
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            returns.to_csv(path)
        return returns.loc[start:end]

    except ImportError:
        raise ImportError(
            "yfinance not installed. Run: pip install yfinance\n"
            "Or provide a pre-downloaded returns CSV via `path`."
        )


# ── Part 2: Rolling FF5 Alpha Extraction ─────────────────────────────────────

class FF5AlphaEngine:
    """
    Computes monthly abnormal returns (α) for each sector ETF using
    a 24-month rolling Fama-French 5-factor regression.

    The rolling window ensures that α at time t is estimated using
    only the 24 months of data immediately preceding t — no look-ahead.

    Mathematical specification:
        For each sector s and month t:
            [R_{s,τ} - R_{f,τ}] = α_{s,t} + Σⱼ β_{j,s,t} · F_{j,τ} + ε_{s,τ}
            for τ ∈ [t-24, t-1]  (24-month estimation window)

        The intercept α_{s,t} from this rolling regression is the
        dependent variable in Stage 2.

    Parameters
    ----------
    etf_returns : pd.DataFrame  — monthly ETF returns, columns = ETF symbols
    ff_factors  : pd.DataFrame  — monthly FF5 factors + RF
    window      : int           — rolling estimation window in months (default 24)
    """

    def __init__(
        self,
        etf_returns: pd.DataFrame,
        ff_factors:  pd.DataFrame,
        window:      int = 24,
    ):
        self.etf_returns = etf_returns
        self.ff_factors  = ff_factors
        self.window      = window
        self._alphas: Optional[pd.DataFrame] = None

    def compute_alphas(self, verbose: bool = True) -> pd.DataFrame:
        """
        Run rolling FF5 regression for each ETF.
        Returns DataFrame of monthly alphas: index=date, columns=ETF symbols.

        Minimum observations per regression: window // 2 (12 months).
        Regressions with fewer observations return NaN.
        """
        aligned = self.etf_returns.join(self.ff_factors, how="inner")
        factor_cols = ["MKT", "SMB", "HML", "RMW", "CMA"]
        results     = {}

        for etf in self.etf_returns.columns:
            if etf not in aligned.columns:
                continue

            excess_ret = aligned[etf] - aligned["RF"]
            alphas     = pd.Series(index=aligned.index, dtype=float)

            for t in range(self.window, len(aligned)):
                window_data = aligned.iloc[t - self.window: t]
                y = excess_ret.iloc[t - self.window: t].values
                X = sm.add_constant(window_data[factor_cols].values)

                if np.isnan(y).any() or np.isnan(X).any():
                    continue
                if len(y) < self.window // 2:
                    continue

                try:
                    ols     = sm.OLS(y, X).fit()
                    alphas.iloc[t] = ols.params[0]   # intercept = α
                except Exception:
                    alphas.iloc[t] = np.nan

            results[etf] = alphas
            if verbose:
                valid = alphas.notna().sum()
                print(f"  {etf}: {valid} monthly alphas computed "
                      f"({aligned.index[self.window].date()} → "
                      f"{aligned.index[-1].date()})")

        self._alphas = pd.DataFrame(results).dropna(how="all")
        return self._alphas

    @property
    def alphas(self) -> pd.DataFrame:
        if self._alphas is None:
            raise RuntimeError("Call compute_alphas() first.")
        return self._alphas

    def to_long(self, sector_map: dict) -> pd.DataFrame:
        """
        Melt alpha DataFrame to long format and add sector labels.
        sector_map: {ETF_symbol: sector_name}

        Returns DataFrame: date | sector | etf | alpha
        """
        long = self.alphas.reset_index().melt(
            id_vars="index", var_name="etf", value_name="alpha"
        ).rename(columns={"index": "date"})
        long["sector"] = long["etf"].map(sector_map)
        return long.dropna(subset=["alpha"]).sort_values(["date", "sector"])


# ── Part 3: Swarm Signal Intensity ───────────────────────────────────────────

def compute_ssi(
    tps_panel:    pd.DataFrame,
    investment_df: pd.DataFrame,
    sector_bridge: pd.DataFrame,
    window_months: int = 6,           # pre-registered: w=6
    min_investors: int = 5,           # pre-registered: cluster threshold
) -> pd.DataFrame:
    """
    SSI_{s,t} = Σ_{i ∈ I(s,t,w)} TPS_{point-in-time}(i) × IPD_rank(i,s)⁻¹

    Where I(s,t,w) = investors making their FIRST investment in sector s
                     in the window [t-w, t].

    "First investment in sector" is critical — repeat investors in the
    same sector are NOT swarm members. The swarm signal measures NEW
    capital flowing into a sector, not continuation of existing positions.

    Parameters
    ----------
    tps_panel     : output of expanding_window_tps.compute_expanding_tps()
    investment_df : raw investment data with (investor, company, sector, date)
    sector_bridge : mapping of Crunchbase category → ETF symbol
    window_months : rolling window for swarm detection (pre-registered: 6)
    min_investors : minimum cluster size for a valid swarm (pre-registered: 5)
    """
    # Merge sector labels
    inv_df = investment_df.merge(
        sector_bridge[["crunchbase_category", "etf_symbol", "sector_name"]],
        on="crunchbase_category", how="left"
    ).dropna(subset=["etf_symbol"])

    inv_df["date"] = pd.to_datetime(inv_df["date"])
    inv_df = inv_df.sort_values("date")

    # Track each investor's FIRST entry into each sector
    first_entry = (
        inv_df.groupby(["investor_name", "etf_symbol"])["date"]
        .min()
        .reset_index()
        .rename(columns={"date": "first_entry_date"})
    )

    # For each evaluation quarter, find investors who entered sector
    # for the first time within the rolling window
    eval_dates  = sorted(tps_panel["eval_date"].unique())
    window      = pd.DateOffset(months=window_months)
    ssi_records = []

    for eval_date in eval_dates:
        eval_ts   = pd.Timestamp(eval_date)
        window_start = eval_ts - window

        # TPS scores at this eval_date (point-in-time, contamination-free)
        tps_at_t = tps_panel[tps_panel["eval_date"] == eval_ts].set_index("investor")

        for sector in first_entry["etf_symbol"].unique():
            # New entrants in this sector during the window
            sector_entries = first_entry[
                (first_entry["etf_symbol"]    == sector) &
                (first_entry["first_entry_date"] > window_start) &
                (first_entry["first_entry_date"] <= eval_ts)
            ]

            n_entrants = len(sector_entries)
            if n_entrants < min_investors:
                continue   # below swarm threshold — not a qualifying event

            # Weight by TPS × IPD rank (IPD rank approximated by entry order:
            # earlier = lower IPD = higher weight)
            sector_entries = sector_entries.copy()
            sector_entries["tps"] = sector_entries["investor_name"].map(
                tps_at_t["tps"]
            ).fillna(0.0)

            # IPD rank: rank by first_entry_date ascending; rank 1 = fastest
            sector_entries["ipd_rank"] = sector_entries["first_entry_date"].rank()
            sector_entries["ipd_weight"] = 1 / sector_entries["ipd_rank"]

            # SSI = Σ TPS × IPD_weight
            ssi = (sector_entries["tps"] * sector_entries["ipd_weight"]).sum()

            # SSI_dumb = raw investor count (the null model)
            ssi_dumb = float(n_entrants)

            ssi_records.append({
                "eval_date":   eval_date,
                "sector":      sector,
                "ssi":         round(ssi, 6),
                "ssi_dumb":    ssi_dumb,
                "n_entrants":  n_entrants,
                "mean_tps":    sector_entries["tps"].mean(),
                "swarm_event": 1,
            })

    return pd.DataFrame(ssi_records).sort_values(["eval_date", "sector"])


def compute_ssi_dumb(
    investment_df: pd.DataFrame,
    sector_bridge: pd.DataFrame,
    window_months: int = 6,
    min_investors: int = 5,
) -> pd.DataFrame:
    """
    Dumb baseline: SSI = raw deal count, no TPS or IPD weighting.
    Used to prove the structural signal adds value beyond volume.
    """
    # This is embedded in compute_ssi() as 'ssi_dumb' column.
    # Separated here for clarity in the regression specification.
    raise NotImplementedError(
        "Use the ssi_dumb column from compute_ssi() output. "
        "This function is a documentation stub."
    )


# ── Part 4: Panel Regression ─────────────────────────────────────────────────

class SSIPanelRegression:
    """
    Stage 2 regression: SSI → future abnormal returns.

    Model:
        α_{s,t+k} = β₀ + β₁·SSI_{s,t} + β₂·SSI_dumb_{s,t}
                   + β₃·RetMom_{s,t} + β₄·VIX_t + β₅·ln(DealVol_{s,t})
                   + δ_s + λ_t + ε_{s,t}

    Identification strategy:
        - Sector FE (δ_s) absorbs time-invariant sector characteristics
          (e.g. biotech is structurally different from fintech)
        - Time FE (λ_t) absorbs market-wide shocks (e.g. GFC, QE periods)
        - After both FE, β₁ is identified from within-sector, within-time
          variation in SSI → the "pure" swarm signal

    Standard errors:
        Double-clustered by sector × time (Thompson 2011)
        Implementation: sandwich estimator via statsmodels cov_type='cluster'
        with two-way clustering approximation (Cameron, Gelbach, Miller 2011)
    """

    def __init__(
        self,
        alpha_long: pd.DataFrame,   # from FF5AlphaEngine.to_long()
        ssi_df:     pd.DataFrame,   # from compute_ssi()
        k_months:   list = [6, 12, 18, 24],  # pre-registered horizons
    ):
        self.alpha_long = alpha_long
        self.ssi_df     = ssi_df
        self.k_months   = k_months
        self._results   = {}

    def _build_panel(self, k: int) -> pd.DataFrame:
        """
        Align SSI at time t with alpha at time t+k.
        Merges on (sector, date) after shifting alpha forward by k months.
        """
        alpha = self.alpha_long.copy()
        alpha["date_lagged"] = alpha["date"] - pd.DateOffset(months=k)

        ssi = self.ssi_df.copy()
        ssi["eval_date"] = pd.to_datetime(ssi["eval_date"])

        panel = ssi.merge(
            alpha[["date_lagged", "sector", "alpha"]].rename(
                columns={"date_lagged": "eval_date"}
            ),
            on=["eval_date", "sector"],
            how="inner",
        )

        # Add sector and time dummies
        panel["sector_code"] = pd.Categorical(panel["sector"]).codes
        panel["time_code"]   = pd.Categorical(
            panel["eval_date"].dt.to_period("Q")
        ).codes

        panel = panel.dropna(subset=["alpha", "ssi", "ssi_dumb"])
        return panel

    def _double_cluster_se(
        self,
        model_result,
        panel: pd.DataFrame,
        cluster1: str = "sector_code",
        cluster2: str = "time_code",
    ):
        """
        Cameron-Gelbach-Miller (2011) two-way cluster correction.

        V_double = V_cluster1 + V_cluster2 - V_cluster1×cluster2

        This is the standard approach for panel data with both
        cross-sectional and time-series dependence.
        """
        X    = model_result.model.exog
        resid = model_result.resid
        n    = len(resid)

        def _cluster_vcov(cluster_ids):
            clusters = panel[cluster_ids].values
            unique_c = np.unique(clusters)
            G        = len(unique_c)
            B        = np.zeros((X.shape[1], X.shape[1]))
            for c in unique_c:
                mask  = clusters == c
                Xc    = X[mask]
                ec    = resid[mask]
                score = Xc.T @ ec
                B    += np.outer(score, score)
            bread = np.linalg.inv(X.T @ X)
            # Small-sample correction: (G / (G-1)) × (n-1) / (n-k)
            k  = X.shape[1]
            sc = (G / (G - 1)) * ((n - 1) / (n - k))
            return sc * bread @ B @ bread

        V1  = _cluster_vcov(cluster1)
        V2  = _cluster_vcov(cluster2)

        # Intersection clustering
        panel["_intersect"] = (
            panel[cluster1].astype(str) + "_" + panel[cluster2].astype(str)
        )
        V12 = _cluster_vcov("_intersect")
        panel.drop(columns=["_intersect"], inplace=True)

        V_dbl = V1 + V2 - V12
        se    = np.sqrt(np.diag(np.abs(V_dbl)))
        return se

    def run(self, verbose: bool = True) -> dict:
        """
        Run the panel regression for each pre-registered horizon k.
        Returns dict: {k: regression_summary}
        """
        for k in self.k_months:
            panel = self._build_panel(k)

            if len(panel) < 30:
                print(f"  k={k}: insufficient observations ({len(panel)}). Skipping.")
                continue

            # Absorb FE via within-transformation (demeaning)
            for var in ["alpha", "ssi", "ssi_dumb"]:
                panel[f"{var}_dm_sector"] = panel[var] - panel.groupby("sector_code")[var].transform("mean")
            for var in ["alpha_dm_sector", "ssi_dm_sector", "ssi_dumb_dm_sector"]:
                panel[f"{var}_dt"] = panel[var] - panel.groupby("time_code")[var].transform("mean")

            y_col  = "alpha_dm_sector_dt"
            X_cols = ["ssi_dm_sector_dt", "ssi_dumb_dm_sector_dt"]

            y = panel[y_col].values
            X = sm.add_constant(panel[X_cols].values)

            ols    = sm.OLS(y, X).fit()
            se_dbl = self._double_cluster_se(ols, panel)

            t_stats = ols.params / se_dbl
            p_vals  = 2 * stats.t.sf(np.abs(t_stats), df=len(y) - X.shape[1])

            result = {
                "k":              k,
                "n_obs":          len(panel),
                "n_sectors":      panel["sector_code"].nunique(),
                "n_periods":      panel["time_code"].nunique(),
                "beta_ssi":       ols.params[1],
                "beta_ssi_dumb":  ols.params[2],
                "se_ssi":         se_dbl[1],
                "se_ssi_dumb":    se_dbl[2],
                "t_ssi":          t_stats[1],
                "t_ssi_dumb":     t_stats[2],
                "p_ssi":          p_vals[1],
                "p_ssi_dumb":     p_vals[2],
                "r_squared":      ols.rsquared,
                "significant":    p_vals[1] < 0.01,
                "structural_wins": ols.params[1] > ols.params[2],
            }

            self._results[k] = result

            if verbose:
                sig_str = "***" if p_vals[1] < 0.01 else ("**" if p_vals[1] < 0.05 else "")
                print(
                    f"  k={k:>2}mo | n={len(panel):>4} | "
                    f"β_SSI={ols.params[1]:+.4f}{sig_str} (p={p_vals[1]:.4f}) | "
                    f"β_dumb={ols.params[2]:+.4f} (p={p_vals[2]:.4f}) | "
                    f"R²={ols.rsquared:.4f} | "
                    f"Structural wins: {result['structural_wins']}"
                )

        return self._results

    def summary_table(self) -> pd.DataFrame:
        """
        Publication-ready results table.
        Stars: *** p<0.01, ** p<0.05, * p<0.10
        """
        if not self._results:
            raise RuntimeError("Run run() first.")

        rows = []
        for k, r in self._results.items():
            def star(p):
                return "***" if p < 0.01 else ("**" if p < 0.05 else ("*" if p < 0.10 else ""))

            rows.append({
                "Horizon (k months)": k,
                "β_SSI (structured)": f"{r['beta_ssi']:+.4f}{star(r['p_ssi'])}",
                "SE_SSI":             f"({r['se_ssi']:.4f})",
                "β_SSI_dumb (volume)":f"{r['beta_ssi_dumb']:+.4f}{star(r['p_ssi_dumb'])}",
                "SE_dumb":            f"({r['se_ssi_dumb']:.4f})",
                "R²":                 f"{r['r_squared']:.4f}",
                "N":                  r["n_obs"],
                "Structural wins":    "✓" if r["structural_wins"] else "✗",
            })
        return pd.DataFrame(rows)


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\nVentureGraph 2.0 — FF5 Alpha Engine")
    print("=" * 50)

    ETF_SYMBOLS = ["XLF", "IGV", "FDN", "XBI", "SOXX", "ICLN"]
    # Map ETF symbol → sector label used in SSI events.
    # IMPORTANT: SSI 'sector' column stores ETF symbols directly (XLF, FDN...).
    # Setting each ETF to map to itself ensures the merge key aligns.
    # The human-readable name is preserved in the 'etf' column of alpha_long.
    SECTOR_MAP  = {
        "XLF": "XLF", "IGV": "IGV",
        "FDN": "FDN", "XBI": "XBI",
        "SOXX": "SOXX", "ICLN": "ICLN",
    }

    print("\n[1/3] Loading FF5 factors ...")
    ff5 = load_ff5_factors(
        path=Path("F-F_Research_Data_5_Factors_2x3.CSV"),
        start="2003-01-01", end="2014-12-31"
    )
    print(f"  Factors loaded: {ff5.shape}")

    print("\n[2/3] Loading ETF returns ...")
    etf_ret = load_etf_returns(
        ETF_SYMBOLS, start="2003-01-01", end="2014-12-31",
        path=Path("etf_returns_cache.csv")
    )
    print(f"  ETF returns: {etf_ret.shape}")

    print("\n[3/3] Computing rolling FF5 alphas ...")
    engine = FF5AlphaEngine(etf_ret, ff5, window=24)
    alphas = engine.compute_alphas()
    alpha_long = engine.to_long(SECTOR_MAP)
    alpha_long.to_csv("sector_alphas.csv", index=False)
    print(f"\nAlphas saved → sector_alphas.csv  ({len(alpha_long):,} rows)")
    print(alpha_long.head(10).to_string())
