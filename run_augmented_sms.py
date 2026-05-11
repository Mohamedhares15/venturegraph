"""
VentureGraph — Re-run SMS-Alpha Correlation on Augmented Data
=============================================================
This script re-runs the full SMS engine (silence detection + H3 correlation)
using the augmented combined dataset (combined_investments.csv,
combined_funding_rounds.csv, combined_objects.csv from data_augmented/) while
re-using the original tps_panel_expanding.csv and event_panel.csv for
top-tier status and ETF alpha data.

Output: data_augmented/augmented_sms_alpha_correlation.csv
        data_augmented/augmented_event_panel_sms.csv
"""

import sys
import shutil
import tempfile
from pathlib import Path
import pandas as pd
import numpy as np
from scipy import stats

PROJECT_ROOT = Path(__file__).parent.resolve()
DATA_AUG    = PROJECT_ROOT / "data_augmented"

print("=" * 65)
print("  VentureGraph — Augmented SMS Engine")
print("=" * 65)

# ── 1. Check required files ─────────────────────────────────────────────────
required = {
    "combined_investments":    DATA_AUG  / "combined_investments.csv",
    "combined_funding_rounds": DATA_AUG  / "combined_funding_rounds.csv",
    "combined_objects":        DATA_AUG  / "combined_objects.csv",
    "tps_panel_expanding":     PROJECT_ROOT / "tps_panel_expanding.csv",
    "event_panel":             PROJECT_ROOT / "event_panel.csv",
}

for name, path in required.items():
    exists = "✓" if path.exists() else "✗ MISSING"
    size   = f"{path.stat().st_size/1024:.0f}KB" if path.exists() else ""
    print(f"  [{exists}] {name}: {size}")

missing = [k for k, v in required.items() if not v.exists()]
if missing:
    print(f"\nERROR: Missing files: {missing}")
    sys.exit(1)

# ── 2. Load data ─────────────────────────────────────────────────────────────
print("\n[1/5] Loading combined_funding_rounds.csv ...")
fr = pd.read_csv(
    required["combined_funding_rounds"],
    usecols=lambda c: c in ["funding_round_id","id","object_id","funded_at","funding_round_type"],
    low_memory=False,
)
# Handle both column name variants
if "id" in fr.columns and "funding_round_id" not in fr.columns:
    fr = fr.rename(columns={"id": "funding_round_id"})
if "object_id" not in fr.columns:
    # try funded_object_id
    for alt in ["funded_object_id","company_id"]:
        if alt in fr.columns:
            fr = fr.rename(columns={alt: "object_id"}); break
fr["funding_round_id"] = fr["funding_round_id"].astype(str).str.strip()
fr["funding_round_type"] = fr["funding_round_type"].astype(str).str.lower().str.strip()
fr = fr[fr["funding_round_type"].isin(["series-a","series-b"])].copy()
fr["funded_at"] = pd.to_datetime(fr["funded_at"], errors="coerce")
fr = fr.dropna(subset=["funded_at"])
fr["quarter"] = fr["funded_at"].dt.to_period("Q").dt.to_timestamp("Q")
print(f"   Series A: {(fr['funding_round_type']=='series-a').sum():,} | "
      f"Series B: {(fr['funding_round_type']=='series-b').sum():,}")

print("\n[2/5] Loading combined_investments.csv ...")
inv = pd.read_csv(
    required["combined_investments"],
    usecols=lambda c: c in ["funding_round_id","funded_object_id","investor_object_id"],
    low_memory=False,
)
inv = inv.dropna(subset=["funding_round_id","investor_object_id"])
inv["funding_round_id"] = inv["funding_round_id"].astype(str).str.strip()
print(f"   Investment records: {len(inv):,}")

print("\n[3/5] Loading combined_objects.csv (chunked) ...")
obj_chunks = []
for chunk in pd.read_csv(
    required["combined_objects"],
    usecols=lambda c: c in ["id","name","category_code"],
    dtype=str,
    chunksize=50_000,
    low_memory=False,
):
    chunk = chunk.dropna(subset=["id"])
    obj_chunks.append(chunk)
obj = pd.concat(obj_chunks, ignore_index=True)
del obj_chunks
print(f"   Objects loaded: {len(obj):,}")

print("\n[4/5] Loading tps_panel_expanding.csv ...")
tps = pd.read_csv(
    required["tps_panel_expanding"],
    usecols=["investor","eval_date","tps","in_top_tier"],
    parse_dates=["eval_date"],
    low_memory=False,
)
tps = tps.dropna(subset=["investor","eval_date"])
tps = tps.rename(columns={"investor":"investor_name"})
tps["in_top_tier"] = tps["in_top_tier"].astype(str).str.lower().isin(["true","1","yes"])
print(f"   TPS panel rows: {len(tps):,} | Top-Tier: {tps['in_top_tier'].sum():,}")

print("\n[5/5] Loading event_panel.csv ...")
ep = pd.read_csv(required["event_panel"], parse_dates=["eval_date"], low_memory=False)
print(f"   Event panel rows: {len(ep):,}")

# ── 3. Build lookup maps ──────────────────────────────────────────────────────
print("\n[A] Building lookup maps ...")
id_to_name = dict(zip(obj["id"].astype(str), obj["name"].fillna("")))

CATEGORY_TO_ETF = {
    "software":"IGV","enterprise":"IGV","saas":"IGV","analytics":"IGV",
    "security":"IGV","cloud_computing":"IGV","crm":"IGV","web":"IGV",
    "internet":"IGV","mobile":"IGV","ecommerce":"IGV","advertising":"IGV",
    "social":"IGV","media":"IGV","marketplace":"IGV","finance":"IGV",
    "fintech":"IGV","payments":"IGV","semiconductor":"SOXX","hardware":"SOXX",
    "networking":"SOXX","cleantech":"SOXX","energy":"SOXX",
    "biotech":"XBI","health":"XBI","medical":"XBI","healthcare":"XBI",
    "pharmaceutical":"XBI","diagnostics":"XBI","genomics":"XBI",
}

def cat_to_etf(cat):
    if not cat or pd.isna(cat): return "IGV"
    c = str(cat).lower().strip()
    if c in CATEGORY_TO_ETF: return CATEGORY_TO_ETF[c]
    for k,v in CATEGORY_TO_ETF.items():
        if k in c: return v
    return "IGV"

id_to_etf = {str(r["id"]): cat_to_etf(r.get("category_code","")) for _,r in obj.iterrows()}

# ── 4. Detect silences ────────────────────────────────────────────────────────
print("\n[B] Detecting smart money silences ...")

# Join investments → rounds
df = inv.merge(
    fr[["funding_round_id","object_id","funded_at","funding_round_type","quarter"]],
    on="funding_round_id", how="inner"
)
df["investor_name"] = df["investor_object_id"].astype(str).map(id_to_name).fillna(df["investor_object_id"].astype(str))
df["sector"]        = df["funded_object_id"].astype(str).map(id_to_etf).fillna("IGV")

series_a = df[df["funding_round_type"]=="series-a"].copy()
series_b = df[df["funding_round_type"]=="series-b"].copy()
print(f"   Series A rows: {len(series_a):,} | Series B rows: {len(series_b):,}")

# Top-tier lookup: is an investor top-tier at a given date?
tps_sorted = tps.sort_values(["investor_name","eval_date"])

def is_top_tier_at(investor, date):
    sub = tps_sorted[(tps_sorted["investor_name"]==investor) &
                     (tps_sorted["eval_date"]<=date)]
    if sub.empty: return False
    return bool(sub.iloc[-1]["in_top_tier"])

# Build company → Series B investors map
b_investors = (
    series_b.groupby("object_id")["investor_name"]
    .apply(set).to_dict()
)

# Detect silences
records = []
# Sample for speed if very large
a_sample = series_a.sample(min(len(series_a), 80_000), random_state=42) if len(series_a)>80_000 else series_a

for i, (_, row) in enumerate(a_sample.iterrows()):
    if i % 10000 == 0: print(f"   Processing row {i:,}/{len(a_sample):,}...", end="\r")
    company  = row["object_id"]
    investor = row["investor_name"]
    date     = row["funded_at"]
    sector   = row["sector"]
    quarter  = row["quarter"]

    if not is_top_tier_at(investor, date): continue
    if company not in b_investors: continue

    b_inv_set = b_investors[company]
    is_silent = investor not in b_inv_set

    records.append({
        "investor_name": investor,
        "company_id":    company,
        "sector":        sector,
        "series_a_qtr":  quarter,
        "is_silent":     is_silent,
    })

print(f"\n   Silence records found: {len(records):,}")

if not records:
    print("ERROR: No silence records found. Exiting.")
    sys.exit(1)

silence_df = pd.DataFrame(records)
n_silent   = silence_df["is_silent"].sum()
print(f"   Silences: {n_silent:,} ({100*n_silent/len(silence_df):.1f}% rate)")

# ── 5. Compute SMS scores per (sector, quarter) ───────────────────────────────
print("\n[C] Computing SMS scores per sector/quarter ...")

agg = (
    silence_df.groupby(["sector","series_a_qtr"])
    .agg(n_expected=("is_silent","count"), n_silent=("is_silent","sum"))
    .reset_index()
)
agg["sms_score"] = agg["n_silent"] / (agg["n_expected"] + 1e-9)
agg = agg.rename(columns={"series_a_qtr":"eval_date"})
print(f"   Sector-quarters: {len(agg):,}")
print(f"   Mean SMS score:  {agg['sms_score'].mean():.4f}")

# ── 6. Merge with event panel ─────────────────────────────────────────────────
print("\n[D] Merging with event panel ...")
ep["eval_date"]  = pd.to_datetime(ep["eval_date"])
ep["_qtr"]       = ep["eval_date"].dt.to_period("Q").dt.to_timestamp("Q")
agg["eval_date"] = pd.to_datetime(agg["eval_date"])
agg["_qtr"]      = agg["eval_date"].dt.to_period("Q").dt.to_timestamp("Q")

merged = ep.merge(
    agg[["sector","_qtr","sms_score","n_expected","n_silent"]],
    on=["sector","_qtr"], how="left",
    suffixes=("","_aug")
)
merged = merged.drop(columns=["_qtr"])
n_matched = merged["sms_score"].notna().sum()
print(f"   Event panel rows: {len(ep):,}")
print(f"   Rows with SMS:    {n_matched:,} ({100*n_matched/len(ep):.1f}% coverage)")

# ── 7. Correlate SMS with forward alpha (H3 test) ────────────────────────────
print("\n[E] Correlating SMS with forward alpha (H3 test) ...")
alpha_cols = [c for c in merged.columns if c.startswith("alpha_k")]
print(f"   Alpha columns found: {alpha_cols}")

rows_clean = merged.dropna(subset=["sms_score"])
results = []

for col in sorted(alpha_cols):
    sub = rows_clean.dropna(subset=[col])
    if len(sub) < 5: continue
    r, p = stats.pearsonr(sub["sms_score"], sub[col])
    k_label = col.replace("alpha_k","k=")
    signal = "✓ Works (negative)" if r < 0 else "✗ Counter (positive)"
    results.append({
        "horizon":    k_label,
        "alpha_col":  col,
        "pearson_r":  round(r, 4),
        "p_value":    round(p, 4),
        "n_obs":      len(sub),
        "signal_dir": signal,
        "dataset":    "augmented",
    })

if not results:
    print("   No alpha columns with sufficient data found.")
else:
    corr_df = pd.DataFrame(results)
    print("\n   AUGMENTED H3 RESULTS:")
    print("   " + "-"*60)
    print(corr_df.to_string(index=False))
    print("   " + "-"*60)

    # Compare with original
    orig_corr = pd.read_csv(PROJECT_ROOT / "sms_alpha_correlation.csv")
    print("\n   ORIGINAL H3 RESULTS (n=35-76):")
    print("   " + orig_corr.to_string(index=False))

    # Save
    out = DATA_AUG / "augmented_sms_alpha_correlation.csv"
    corr_df.to_csv(out, index=False)
    print(f"\n   Saved → {out}")

    # Save merged event panel
    ep_out = DATA_AUG / "augmented_event_panel_sms.csv"
    merged.to_csv(ep_out, index=False)
    print(f"   Saved → {ep_out}")

print("\n" + "=" * 65)
print("  AUGMENTED SMS ENGINE COMPLETE ✓")
print("=" * 65)
