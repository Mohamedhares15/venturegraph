"""
VentureGraph 2.0 — Smart Money Silence (SMS) Engine
=====================================================
Part D Advanced Signal — C-DE422 Final Project

CONCEPT
-------
Traditional signals track Presence. SMS tracks Absence.

When a top-tier VC (Top-30% TPS) participates in a company's Series A,
conventional wisdom says they will follow-on in the Series B if they
remain bullish. If they DON'T show up in the Series B, that SILENCE is
a high-conviction negative signal — they know something the market doesn't.

ALGORITHM
---------
1. Find all Series A rounds where at least one Top-Tier investor participated.
2. For each such (company, top-tier-investor, series-A-date) triple, check:
   a. Does the company have a subsequent Series B round?
   b. If YES → did the top-tier investor re-appear in that Series B?
3. If the investor is ABSENT from the Series B → record as a Silence event.
4. Aggregate per (sector, quarter) → compute SMS Score = silence_rate × weight.
5. Merge with event_panel.csv → produce event_panel_sms.csv.
6. Correlate sms_score with forward alpha (k=12, k=36).

TEMPORAL INTEGRITY
------------------
Top-Tier status is evaluated using the EXPANDING-WINDOW TPS panel
(tps_panel_expanding.csv), ensuring no look-ahead bias. A VC is considered
Top-Tier for a Series A only if they were in the Top-30% at the time of
that round.

OUTPUTS
-------
• sms_scores.csv        — per (sector, quarter) SMS signal
• event_panel_sms.csv   — event_panel.csv + SMS columns merged in
• console report        — correlation table + summary stats
"""

import warnings
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from scipy import stats

warnings.filterwarnings("ignore")

# ──────────────────────────────────────────────────────────────────────────────
# SECTION 1 — CATEGORY → ETF SECTOR MAP
# ──────────────────────────────────────────────────────────────────────────────

# Direct mapping from Crunchbase category_code → ETF sector ticker.
# These ETFs match the sectors tracked in event_panel.csv.
# Derived from sector_mapping.py's CRUNCHBASE_TO_SIC_PRIOR + SIC_TO_ETF tables.
CATEGORY_TO_ETF = {
    # Software / SaaS → IGV
    "software":            "IGV",
    "enterprise":          "IGV",
    "analytics":           "IGV",
    "security":            "IGV",
    "cloud_computing":     "IGV",
    "saas":                "IGV",
    "crm":                 "IGV",
    "erp":                 "IGV",
    "devops":              "IGV",
    "productivity":        "IGV",
    "collaboration":       "IGV",

    # Semiconductors / Hardware → SOXX
    "semiconductor":       "SOXX",
    "hardware":            "SOXX",
    "networking":          "SOXX",
    "embedded":            "SOXX",
    "chip":                "SOXX",

    # Biotech / Life Sciences → XBI
    "biotech":             "XBI",
    "health":              "XBI",
    "medical":             "XBI",
    "pharmaceutical":      "XBI",
    "life sciences":       "XBI",
    "diagnostics":         "XBI",
    "genomics":            "XBI",
    "healthcare":          "XBI",

    # Consumer Internet → IGV (broader software)
    "web":                 "IGV",
    "internet":            "IGV",
    "mobile":              "IGV",
    "ecommerce":           "IGV",
    "games_video":         "IGV",
    "advertising":         "IGV",
    "social":              "IGV",
    "media":               "IGV",
    "search":              "IGV",
    "marketplace":         "IGV",
    "network_hosting":     "IGV",

    # Clean Tech / Energy → SOXX (proxy, since ICLN not in event_panel)
    "cleantech":           "SOXX",
    "energy":              "SOXX",
    "greentech":           "SOXX",

    # Finance → IGV (closest proxy in event_panel)
    "finance":             "IGV",
    "fintech":             "IGV",
    "payments":            "IGV",
    "insurance":           "IGV",

    # Other tech categories → IGV as default
    "other":               "IGV",
    "unknown":             "IGV",
}

# ETFs present in event_panel.csv (confirmed from data inspection)
VALID_ETFS = {"IGV", "SOXX", "XBI", "XLK"}


def map_category_to_etf(category_code: Optional[str]) -> str:
    """Map a Crunchbase category_code string to an ETF sector ticker."""
    if not category_code or pd.isna(category_code):
        return "IGV"
    cat = str(category_code).lower().strip()
    # Direct hit
    if cat in CATEGORY_TO_ETF:
        return CATEGORY_TO_ETF[cat]
    # Partial match — check if any key appears in the category string
    for key, etf in CATEGORY_TO_ETF.items():
        if key in cat:
            return etf
    return "IGV"   # default fallback


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 2 — DATA LOADERS
# ──────────────────────────────────────────────────────────────────────────────

def load_data(base_dir: Path = Path(".")) -> dict:
    """Load all required CSV files. Returns a dict of DataFrames."""
    print("=" * 65)
    print("  VentureGraph 2.0 — Smart Money Silence Engine")
    print("=" * 65)

    data = {}

    # --- funding_rounds.csv ---------------------------------------------------
    print("\n[1/5] Loading funding_rounds.csv ...")
    fr_cols = ["id", "object_id", "funded_at", "funding_round_type"]
    fr = pd.read_csv(
        base_dir / "funding_rounds.csv",
        usecols=fr_cols,
        parse_dates=["funded_at"],
        low_memory=False,
    )
    fr["funding_round_type"] = fr["funding_round_type"].str.lower().str.strip()
    # Keep only Series A and Series B
    fr = fr[fr["funding_round_type"].isin(["series-a", "series-b"])].copy()
    fr = fr.rename(columns={"id": "round_id", "object_id": "company_id"})
    fr["quarter"] = fr["funded_at"].dt.to_period("Q").dt.to_timestamp("Q")
    print(f"     Series A: {(fr['funding_round_type']=='series-a').sum():,} | "
          f"Series B: {(fr['funding_round_type']=='series-b').sum():,}")
    data["funding_rounds"] = fr

    # --- investments.csv ------------------------------------------------------
    print("\n[2/5] Loading investments.csv ...")
    inv_cols = ["funding_round_id", "funded_object_id", "investor_object_id"]
    inv = pd.read_csv(
        base_dir / "investments.csv",
        usecols=inv_cols,
        low_memory=False,
    )
    inv = inv.rename(columns={
        "funding_round_id":   "round_id",
        "funded_object_id":   "company_id",
        "investor_object_id": "investor_id",
    })
    inv = inv.dropna(subset=["round_id", "company_id", "investor_id"])
    print(f"     Investment records: {len(inv):,}")
    data["investments"] = inv

    # --- objects.csv (investors + companies) ----------------------------------
    print("\n[3/5] Loading objects.csv (id, name, category_code) ...")
    obj_cols = ["id", "name", "category_code"]
    # objects.csv is 284 MB; read only needed cols
    obj = pd.read_csv(
        base_dir / "objects.csv",
        usecols=obj_cols,
        low_memory=False,
        on_bad_lines="skip",
    )
    obj = obj.dropna(subset=["id"])
    obj["id"] = obj["id"].astype(str).str.strip()
    print(f"     Objects loaded: {len(obj):,}")
    data["objects"] = obj

    # --- tps_panel_expanding.csv ----------------------------------------------
    print("\n[4/5] Loading tps_panel_expanding.csv ...")
    tps_cols = ["investor", "eval_date", "tps", "in_top_tier"]
    tps = pd.read_csv(
        base_dir / "tps_panel_expanding.csv",
        usecols=tps_cols,
        parse_dates=["eval_date"],
        low_memory=False,
    )
    tps = tps.dropna(subset=["investor", "eval_date"])
    # Normalise column name to investor_name for consistency
    tps = tps.rename(columns={"investor": "investor_name"})
    tps["in_top_tier"] = tps["in_top_tier"].astype(bool)
    print(f"     TPS panel rows: {len(tps):,} | "
          f"Top-Tier records: {tps['in_top_tier'].sum():,}")
    data["tps_panel"] = tps

    # --- event_panel.csv ------------------------------------------------------
    print("\n[5/5] Loading event_panel.csv ...")
    ep = pd.read_csv(
        base_dir / "event_panel.csv",
        parse_dates=["eval_date"],
        low_memory=False,
    )
    print(f"     Event panel rows: {len(ep):,}")
    data["event_panel"] = ep

    return data


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 3 — BUILD INVESTOR NAME LOOKUP
# ──────────────────────────────────────────────────────────────────────────────

def build_investor_name_map(objects: pd.DataFrame) -> dict:
    """Return {object_id → investor_name} dict for fast lookup."""
    # Fund objects have ids like 'f:123'; company objects like 'c:123'
    return dict(zip(objects["id"].astype(str), objects["name"].fillna("")))


def build_company_sector_map(objects: pd.DataFrame) -> dict:
    """Return {company_id → ETF_sector} dict."""
    return {
        str(row["id"]): map_category_to_etf(row["category_code"])
        for _, row in objects.iterrows()
    }


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 4 — TOP-TIER LOOKUP (TEMPORAL INTEGRITY)
# ──────────────────────────────────────────────────────────────────────────────

def build_top_tier_lookup(tps_panel: pd.DataFrame) -> pd.DataFrame:
    """
    Build a sorted DataFrame for efficient as-of lookups.
    For any (investor_name, date) query we return whether the investor
    was in the Top-Tier at the most recent eval_date ≤ query_date.
    """
    tps_sorted = tps_panel.sort_values(["investor_name", "eval_date"])
    return tps_sorted


def was_top_tier_at(
    tps_sorted: pd.DataFrame,
    investor_name: str,
    query_date: pd.Timestamp,
) -> bool:
    """
    Point-in-time Top-Tier check.
    Returns True iff the investor was in_top_tier at the most recent
    eval_date that is ≤ query_date.
    """
    investor_rows = tps_sorted[
        (tps_sorted["investor_name"] == investor_name) &
        (tps_sorted["eval_date"] <= query_date)
    ]
    if investor_rows.empty:
        return False
    return bool(investor_rows.iloc[-1]["in_top_tier"])


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 5 — CORE SMS ALGORITHM
# ──────────────────────────────────────────────────────────────────────────────

def detect_silences(data: dict) -> pd.DataFrame:
    """
    Main SMS detection function.

    Returns a DataFrame of individual silence events with columns:
        company_id, investor_name, sector, series_a_date,
        series_b_date, silence (True = absent from B), tps_at_a
    """
    fr       = data["funding_rounds"]
    inv      = data["investments"]
    objects  = data["objects"]
    tps      = data["tps_panel"]

    # Build lookup maps
    name_map   = build_investor_name_map(objects)
    sector_map = build_company_sector_map(objects)
    tps_sorted = build_top_tier_lookup(tps)

    print("\n[SMS] Building investor→name map  ...", flush=True)
    # Attach investor names to investment records
    inv = inv.copy()
    inv["investor_name"] = inv["investor_id"].astype(str).map(name_map)
    inv = inv.dropna(subset=["investor_name"])
    inv = inv[inv["investor_name"] != ""]

    # Attach round metadata (date, type)
    fr_meta = fr[["round_id", "company_id", "funded_at",
                   "funding_round_type", "quarter"]].copy()
    inv = inv.merge(fr_meta, on=["round_id", "company_id"], how="inner")

    print("[SMS] Separating Series A / B investments ...", flush=True)
    series_a = inv[inv["funding_round_type"] == "series-a"].copy()
    series_b = inv[inv["funding_round_type"] == "series-b"].copy()

    # Companies with both A and B
    companies_with_b = set(series_b["company_id"].unique())

    print(f"[SMS] Total Series A investor participations: {len(series_a):,}")
    print(f"[SMS] Companies with a Series B: {len(companies_with_b):,}")

    # Build set of (company_id, investor_name) that appear in any Series B
    # (for fast lookup)
    b_participants = set(
        zip(series_b["company_id"].astype(str),
            series_b["investor_name"].astype(str))
    )

    print("[SMS] Checking Top-Tier status at Series A date (temporal filter) ...")
    print("      (This may take a minute for large datasets)")

    # Build a cached top-tier name set per eval quarter to speed up matching
    # Instead of per-row lookup, group TPS by quarter-end snapshots
    tps_qt = tps.copy()
    tps_qt["quarter"] = tps_qt["eval_date"].dt.to_period("Q").dt.to_timestamp("Q")
    top_tier_by_qtr = (
        tps_qt[tps_qt["in_top_tier"]]
        .groupby("quarter")["investor_name"]
        .apply(set)
        .to_dict()
    )

    def get_top_tier_set_at_date(date: pd.Timestamp) -> set:
        """Return set of top-tier investor names as of the most recent quarter ≤ date."""
        available_qtrs = [q for q in top_tier_by_qtr if q <= date]
        if not available_qtrs:
            return set()
        return top_tier_by_qtr[max(available_qtrs)]

    # Process each Series A record
    silence_records = []
    # Group by company + round to process efficiently
    series_a_grouped = series_a.groupby(
        ["company_id", "round_id", "funded_at", "quarter"]
    )

    for (company_id, round_id, funded_at, quarter), group in series_a_grouped:
        # Skip if company has no Series B
        company_id_str = str(company_id)
        if company_id_str not in companies_with_b:
            continue

        # Get the top-tier set at Series A date
        top_tier_names = get_top_tier_set_at_date(funded_at)
        if not top_tier_names:
            continue

        # Filter investors in this Series A round who were top-tier
        top_tier_a_investors = [
            inv_name for inv_name in group["investor_name"]
            if str(inv_name) in top_tier_names
        ]

        if not top_tier_a_investors:
            continue

        # Get sector for this company
        sector = sector_map.get(company_id_str, "IGV")

        # Get the Series B date for this company (earliest Series B)
        series_b_rows = series_b[series_b["company_id"].astype(str) == company_id_str]
        if series_b_rows.empty:
            continue
        series_b_date = series_b_rows["funded_at"].min()

        # For each top-tier Series A investor, check for silence
        for inv_name in top_tier_a_investors:
            was_in_b = (company_id_str, str(inv_name)) in b_participants
            silence_records.append({
                "company_id":    company_id_str,
                "investor_name": str(inv_name),
                "sector":        sector,
                "series_a_date": funded_at,
                "series_a_qtr":  quarter,
                "series_b_date": series_b_date,
                "is_silent":     not was_in_b,  # True = didn't follow on (SILENCE)
            })

    print(f"[SMS] {len(silence_records):,} expected-edge observations found")

    if not silence_records:
        print("[SMS] WARNING: No silence records found. Check data joins.")
        return pd.DataFrame()

    df = pd.DataFrame(silence_records)
    n_silent = df["is_silent"].sum()
    print(f"[SMS] Silences detected: {n_silent:,} "
          f"({100*n_silent/len(df):.1f}% silence rate)")
    return df


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 6 — SMS SCORE AGGREGATION
# ──────────────────────────────────────────────────────────────────────────────

def compute_sms_scores(silence_df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate individual silence events to (sector, quarter) SMS scores.

    SMS Score formula:
        silence_rate  = n_silent / n_expected     [0–1]
        sms_score     = silence_rate              (primary signal)
        sms_intensity = n_silent * silence_rate   (weighted severity)

    The quarter used is the Series A quarter (when the 'expected edge' was
    formed), not the Series B quarter.  This matches how event_panel.csv
    is structured — it uses the signal origin date.
    """
    if silence_df.empty:
        return pd.DataFrame()

    agg = (
        silence_df
        .groupby(["sector", "series_a_qtr"])
        .agg(
            n_expected=("is_silent", "count"),
            n_silent=("is_silent", "sum"),
            top_silenced_investors=("investor_name", lambda x:
                "|".join(
                    silence_df.loc[x.index[silence_df.loc[x.index, "is_silent"]], "investor_name"]
                    .value_counts()
                    .head(5)
                    .index
                    .tolist()
                )
            ),
        )
        .reset_index()
    )

    agg["sms_score"]     = agg["n_silent"] / (agg["n_expected"] + 1e-9)
    agg["sms_intensity"] = agg["n_silent"] * agg["sms_score"]

    # Normalize sms_score to [0, 1] across all observations
    max_score = agg["sms_score"].max()
    if max_score > 0:
        agg["sms_score_norm"] = agg["sms_score"] / max_score
    else:
        agg["sms_score_norm"] = 0.0

    agg = agg.rename(columns={"series_a_qtr": "eval_date"})
    agg = agg.sort_values(["eval_date", "sector"]).reset_index(drop=True)

    print(f"\n[SMS] Score summary:")
    print(f"      Sector-quarters with data: {len(agg):,}")
    print(f"      Mean silence rate:         {agg['sms_score'].mean():.3f}")
    print(f"      Max silence rate:          {agg['sms_score'].max():.3f}")
    print(f"      Total silences:            {agg['n_silent'].sum():,}")
    print(f"      Total expected edges:      {agg['n_expected'].sum():,}")

    return agg


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 7 — MERGE WITH EVENT PANEL
# ──────────────────────────────────────────────────────────────────────────────

def merge_with_event_panel(
    sms_scores: pd.DataFrame,
    event_panel: pd.DataFrame,
) -> pd.DataFrame:
    """
    Left-join event_panel.csv with sms_scores on (sector, eval_date).
    Returns event_panel_sms with NaN for rows without SMS observations.
    """
    if sms_scores.empty:
        print("[SMS] No SMS scores to merge — returning unmodified event_panel")
        event_panel["sms_score"]          = np.nan
        event_panel["sms_intensity"]      = np.nan
        event_panel["n_expected"]         = np.nan
        event_panel["n_silent"]           = np.nan
        event_panel["sms_score_norm"]     = np.nan
        event_panel["top_silenced_investors"] = np.nan
        return event_panel

    # Normalise eval_date to quarter-end in both DataFrames
    ep = event_panel.copy()
    ep["eval_date"] = pd.to_datetime(ep["eval_date"])
    ep["_merge_qtr"] = ep["eval_date"].dt.to_period("Q").dt.to_timestamp("Q")

    sms = sms_scores.copy()
    sms["eval_date"] = pd.to_datetime(sms["eval_date"])
    sms["_merge_qtr"] = sms["eval_date"].dt.to_period("Q").dt.to_timestamp("Q")

    sms_cols = ["sector", "_merge_qtr", "sms_score", "sms_intensity",
                "n_expected", "n_silent", "sms_score_norm",
                "top_silenced_investors"]

    merged = ep.merge(
        sms[sms_cols],
        on=["sector", "_merge_qtr"],
        how="left",
    ).drop(columns=["_merge_qtr"])

    n_matched = merged["sms_score"].notna().sum()
    print(f"\n[SMS] Event panel merge:")
    print(f"      Event panel rows:           {len(ep):,}")
    print(f"      Rows with SMS signal:       {n_matched:,}")
    print(f"      Coverage:                   {100*n_matched/len(ep):.1f}%")

    return merged


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 8 — ALPHA CORRELATION
# ──────────────────────────────────────────────────────────────────────────────

def correlate_sms_with_alpha(event_panel_sms: pd.DataFrame) -> pd.DataFrame:
    """
    Correlate SMS Score with forward sector alpha at horizons k=6,12,24,36.
    Returns a DataFrame with Pearson r and p-values.

    Interpretation:
        Negative r → High SMS (silence) predicts low alpha → signal works.
        Positive r → counter-intuitive / noise.
    """
    alpha_cols = [c for c in event_panel_sms.columns if c.startswith("alpha_k")]
    if not alpha_cols:
        print("[SMS] No alpha columns found in event_panel_sms")
        return pd.DataFrame()

    rows_clean = event_panel_sms.dropna(subset=["sms_score"])
    if len(rows_clean) < 10:
        print(f"[SMS] Insufficient data for correlation ({len(rows_clean)} rows)")
        return pd.DataFrame()

    results = []
    for col in sorted(alpha_cols):
        sub = rows_clean.dropna(subset=[col])
        if len(sub) < 5:
            continue
        r, p = stats.pearsonr(sub["sms_score"], sub[col])
        k_label = col.replace("alpha_k", "k=")
        results.append({
            "horizon":    k_label,
            "alpha_col":  col,
            "pearson_r":  round(r, 4),
            "p_value":    round(p, 4),
            "n_obs":      len(sub),
            "signal_dir": "✓ Works" if r < 0 else "✗ Counter",
        })

    corr_df = pd.DataFrame(results)
    if corr_df.empty:
        return corr_df

    print("\n[SMS] Alpha Correlation Results:")
    print("-" * 55)
    print(corr_df.to_string(index=False))
    print("-" * 55)
    return corr_df


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 9 — MAIN PIPELINE
# ──────────────────────────────────────────────────────────────────────────────

class SMSEngine:
    """
    End-to-end Smart Money Silence pipeline.

    Usage:
        engine = SMSEngine(base_dir=Path("."))
        engine.run()
    """

    def __init__(self, base_dir: Path = Path(".")):
        self.base_dir = Path(base_dir)
        self.silence_df      : Optional[pd.DataFrame] = None
        self.sms_scores      : Optional[pd.DataFrame] = None
        self.event_panel_sms : Optional[pd.DataFrame] = None
        self.corr_table      : Optional[pd.DataFrame] = None

    def run(self) -> "SMSEngine":
        """Execute the full SMS pipeline end to end."""
        # 1. Load data
        data = load_data(self.base_dir)

        # 2. Detect silences
        print("\n" + "─" * 65)
        print("  PHASE A: Detecting Smart Money Silences")
        print("─" * 65)
        self.silence_df = detect_silences(data)

        # 3. Compute SMS scores
        print("\n" + "─" * 65)
        print("  PHASE B: Computing SMS Scores per Sector/Quarter")
        print("─" * 65)
        self.sms_scores = compute_sms_scores(self.silence_df)

        # 4. Merge with event panel
        print("\n" + "─" * 65)
        print("  PHASE C: Merging with Event Panel")
        print("─" * 65)
        self.event_panel_sms = merge_with_event_panel(
            self.sms_scores, data["event_panel"]
        )

        # 5. Correlate with alpha
        print("\n" + "─" * 65)
        print("  PHASE D: Correlating SMS with Forward Alpha")
        print("─" * 65)
        self.corr_table = correlate_sms_with_alpha(self.event_panel_sms)

        # 6. Save outputs
        self._save_outputs()

        print("\n" + "=" * 65)
        print("  SMS ENGINE COMPLETE ✓")
        print("=" * 65)
        return self

    def _save_outputs(self):
        """Save sms_scores.csv and event_panel_sms.csv."""
        print("\n[SMS] Saving outputs ...")

        if self.sms_scores is not None and not self.sms_scores.empty:
            out_path = self.base_dir / "sms_scores.csv"
            self.sms_scores.to_csv(out_path, index=False)
            print(f"  → sms_scores.csv        ({len(self.sms_scores):,} rows)")

        if self.event_panel_sms is not None and not self.event_panel_sms.empty:
            out_path = self.base_dir / "event_panel_sms.csv"
            self.event_panel_sms.to_csv(out_path, index=False)
            print(f"  → event_panel_sms.csv   ({len(self.event_panel_sms):,} rows)")

        if self.corr_table is not None and not self.corr_table.empty:
            out_path = self.base_dir / "sms_alpha_correlation.csv"
            self.corr_table.to_csv(out_path, index=False)
            print(f"  → sms_alpha_correlation.csv")

        if self.silence_df is not None and not self.silence_df.empty:
            out_path = self.base_dir / "sms_silence_events.csv"
            self.silence_df.to_csv(out_path, index=False)
            print(f"  → sms_silence_events.csv ({len(self.silence_df):,} events)")


# ──────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    base = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    engine = SMSEngine(base_dir=base)
    engine.run()
