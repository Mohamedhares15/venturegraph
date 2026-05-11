# VentureGraph 2.0 — Pre-Registration Document
# PROTOCOL FROZEN — DO NOT MODIFY AFTER COMMIT
# ═══════════════════════════════════════════════════════════════════════════
#
# Title:   Temporal Information Cascades in Venture Capital Networks:
#          A Private-to-Public Alpha Bridge via Directed Graph Analysis
#
# Authors: Mohamed Hares
# Date:    2026-05-10 (UTC+03:00)  — frozen before empirical back-test
# Version: 1.0.0-frozen
#
# This document constitutes the pre-registered experimental protocol.
# It must be committed to version control with a SHA-256 hash before
# any empirical analysis is conducted. Any deviation from this protocol
# in the final paper must be disclosed as a robustness test, not as the
# primary specification.
#
# Modelled after: AEA RCT Registry, OSF Pre-registration Standard
# ═══════════════════════════════════════════════════════════════════════════

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — PRIMARY HYPOTHESES
# These are the exact claims the paper makes. Nothing else is claimed.
# ══════════════════════════════════════════════════════════════════════════════

HYPOTHESES = {
    "H1_primary": {
        "statement": (
            "A positive Swarm Signal Intensity (SSI) for sector s at time T₀, "
            "computed using expanding-window TPS and IPD weighting, "
            "predicts statistically significant positive abnormal returns "
            "(Fama-French 5-factor alpha) in the nearest public-market proxy "
            "of sector s during the subsequent k months, where k ∈ {12, 24}."
        ),
        "direction":  "positive",
        "threshold":  "p < 0.01 (two-tailed), double-clustered SE",
        "primary_k":  12,   # months — the theoretically motivated horizon
    },

    "H2_structural": {
        "statement": (
            "The structured SSI (TPS × IPD weighted) predicts abnormal returns "
            "with greater magnitude and significance than SSI_dumb "
            "(raw deal count), establishing that graph topology contributes "
            "information beyond deal volume alone."
        ),
        "direction":  "beta_SSI > beta_SSI_dumb",
        "threshold":  "p < 0.05 for the incremental F-test on nested models",
    },

    "H3_sms": {
        "statement": (
            "Companies with high Smart Money Silence (SMS) scores — "
            "where high-TPS Series A investors decline to participate in "
            "Series B — subsequently underperform a size-matched portfolio "
            "of companies with low SMS scores on the same sector ETF proxy."
        ),
        "direction":  "negative",
        "threshold":  "p < 0.05 (one-tailed, sign pre-specified as negative)",
        "note":       "Exploratory — confirmed as secondary analysis only.",
    },
}

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — FIXED PARAMETERS
# These values are locked. Changing them requires a new pre-registration.
# ══════════════════════════════════════════════════════════════════════════════

FIXED_PARAMETERS = {

    # ── TPS computation ─────────────────────────────────────────────────────
    "tps": {
        "lambda_decay":         0.3,
        "top_tier_percentile":  0.80,
        "min_portfolio_size":   3,
        "look_ahead_guard":     True,   # MUST remain True for all primary specs
    },

    # ── SSI construction ────────────────────────────────────────────────────
    "ssi": {
        "rolling_window_months":    6,      # w = 6 months (pre-registered)
        "min_swarm_size":           5,      # minimum investors to qualify
        "ipd_weighting":            "rank_inverse",   # 1/rank by entry date
        "new_entrants_only":        True,   # repeat investors excluded
        "eval_frequency":           "QE",   # quarter-end evaluation dates
    },

    # ── Prediction horizons ─────────────────────────────────────────────────
    # ALL horizons are tested. Primary claim is k=12 only.
    # k=6, k=18, k=36 are robustness checks — not primary findings.
    "prediction_horizons_k": {
        "primary":   [12, 24],
        "secondary": [6, 18, 36],
        "note": (
            "If k=6 produces the strongest result, it must be disclosed as "
            "inconsistent with the proposed 12-24 month information cascade "
            "mechanism. A k=6 peak suggests momentum, not cascade dynamics."
        ),
    },

    # ── FF5 abnormal return computation ─────────────────────────────────────
    "ff5": {
        "estimation_window_months": 24,
        "factor_source":   "Ken French Data Library",
        "factor_file":     "F-F_Research_Data_5_Factors_2x3.CSV",
        "return_type":     "total_return_adjusted",
        "frequency":       "monthly",
    },

    # ── Regression specification ─────────────────────────────────────────────
    "regression": {
        "dependent_variable":  "FF5_alpha_t_plus_k",
        "primary_independent": "SSI_structured",
        "controls": [
            "SSI_dumb",
            "sector_return_momentum_t_minus_3",
            "VIX_level_t",
            "log_deal_volume_sector_t",
        ],
        "fixed_effects":   ["sector", "time_quarter"],
        "standard_errors": "double_clustered_sector_x_time",
        "estimator":       "OLS_within_transformation",
    },

    # ── Statistical thresholds ───────────────────────────────────────────────
    "significance": {
        "primary_alpha":            0.01,   # 1% level
        "bonferroni_correction":    True,
        "bonferroni_n_tests":       10,     # 5 sectors × 2 primary horizons
        "bonferroni_threshold":     0.001,  # 0.01 / 10
        "minimum_economic_sharpe":  0.80,   # Sharpe > 0.8 after tx costs
        "power_target":             0.80,   # 80% power at primary alpha
    },

    # ── Data sample ─────────────────────────────────────────────────────────
    "data": {
        "primary_source":   "Crunchbase 2013 snapshot + VentureXpert",
        "train_period":     {"start": "2000-01-01", "end": "2010-12-31"},
        "test_period":      {"start": "2011-01-01", "end": "2013-12-31"},
        "out_of_sample":    {"start": "2014-01-01", "end": "2022-12-31"},
        "geographies":      ["USA"],    # v1.0 US-only; international = v2.0
        "round_types":      ["series-a", "series-b"],
    },

    # ── Sector mapping (locked — see sector_mapping.py for SIC bridge) ──────
    "sector_mapping": {
        "fintech":           {"etf_primary": "XLF",  "etf_secondary": "IPAY"},
        "saas":              {"etf_primary": "IGV",  "etf_secondary": "WCLD"},
        "consumer_internet": {"etf_primary": "FDN",  "etf_secondary": "ARKW"},
        "biotech":           {"etf_primary": "XBI",  "etf_secondary": "IBB"},
        "semiconductors":    {"etf_primary": "SOXX", "etf_secondary": "SMH"},
        "clean_energy":      {"etf_primary": "ICLN", "etf_secondary": "QCLN"},
        "mapping_method":    "SIC_code_bridge_v1",
        "fallback_method":   "text_embedding_cosine_similarity",
        "locked_date":       "[DATE LOCKED AT PRE-REGISTRATION]",
    },
}

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — PRE-SPECIFIED ROBUSTNESS TESTS
# These tests will be run regardless of whether they help or hurt the result.
# ══════════════════════════════════════════════════════════════════════════════

ROBUSTNESS_TESTS = [
    {
        "id":          "ROB-01",
        "name":        "GFC Exclusion",
        "description": "Exclude 2008-01-01 to 2009-12-31 from estimation.",
        "purpose":     "Verify result is not driven by crisis-period dynamics.",
        "required":    True,
    },
    {
        "id":          "ROB-02",
        "name":        "Placebo Date Shuffle",
        "description": (
            "Randomly permute swarm event dates 1,000 times. "
            "Real β₁ must exceed the 99th percentile of placebo distribution."
        ),
        "purpose":     "Confirm the temporal ordering is the source of signal.",
        "required":    True,
    },
    {
        "id":          "ROB-03",
        "name":        "Alternative SSI Window",
        "description": "Rerun with w ∈ {3, 9} months.",
        "purpose":     "Signal should be monotonically robust to window choice.",
        "required":    True,
    },
    {
        "id":          "ROB-04",
        "name":        "Alternative Sector Mapping",
        "description": "Replace primary ETF proxy with secondary ETF proxy.",
        "purpose":     "Results should not depend on specific ETF choice.",
        "required":    True,
    },
    {
        "id":          "ROB-05",
        "name":        "Investor Type Subsample",
        "description": "Run separately for angels, institutional VCs, CVCs.",
        "purpose":     "Identify which investor class drives the signal.",
        "required":    True,
    },
    {
        "id":          "ROB-06",
        "name":        "TPS Percentile Sensitivity",
        "description": "Rerun with top-tier at p70 and p90 instead of p80.",
        "purpose":     "Top-tier threshold should not be a sensitive choice.",
        "required":    True,
    },
    {
        "id":          "ROB-07",
        "name":        "Alternative Factor Model",
        "description": "Replace FF5 with Carhart 4-factor and with FF3.",
        "purpose":     "Alpha should be model-specification robust.",
        "required":    False,   # recommended, not required for submission
    },
]

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — DEVIATIONS POLICY
# ══════════════════════════════════════════════════════════════════════════════

DEVIATIONS_POLICY = """
Any deviation from this pre-registered protocol must:
    1. Be documented in Appendix A of the paper with a timestamp
    2. Be labelled as "Unregistered Specification" in all tables
    3. Not be reported as a primary finding in the abstract or introduction
    4. Be accompanied by the registered specification result, even if weaker

Specifically prohibited:
    - Changing k_primary after observing which horizon produces significance
    - Changing the SSI min_swarm_size after observing event frequencies
    - Adding control variables after observing regression residuals
    - Changing the top_tier_percentile after observing TPS distributions
"""

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — PROTOCOL SEAL (run this to generate your freeze hash)
# ══════════════════════════════════════════════════════════════════════════════

def generate_protocol_hash() -> dict:
    """
    Generates a SHA-256 hash of the entire protocol specification.
    Commit this hash to Git before running any analysis.
    The hash proves the protocol was fixed before results were observed.
    """
    protocol = {
        "hypotheses":       HYPOTHESES,
        "fixed_parameters": FIXED_PARAMETERS,
        "robustness_tests": ROBUSTNESS_TESTS,
    }
    serialised = json.dumps(protocol, indent=2, sort_keys=True, default=str)
    sha256     = hashlib.sha256(serialised.encode()).hexdigest()
    timestamp  = datetime.now(timezone.utc).isoformat()

    seal = {
        "protocol_hash":      sha256,
        "sealed_at_utc":      timestamp,
        "python_file":        __file__,
        "instruction": (
            "Commit this seal to Git BEFORE running any back-test. "
            "The Git commit hash + this protocol hash together constitute "
            "your pre-registration proof."
        ),
    }
    return seal


def verify_protocol_integrity(expected_hash: str) -> bool:
    """
    Verify that the protocol has not been modified since sealing.
    Call this at the start of every analysis script.
    """
    current_seal = generate_protocol_hash()
    current_hash = current_seal["protocol_hash"]
    if current_hash != expected_hash:
        raise RuntimeError(
            f"PROTOCOL INTEGRITY VIOLATION\n"
            f"Expected hash : {expected_hash}\n"
            f"Current hash  : {current_hash}\n"
            f"The pre-registration document has been modified after sealing. "
            f"Any results produced with this modified protocol cannot be "
            f"reported as pre-registered findings."
        )
    return True


if __name__ == "__main__":
    print("\nVentureGraph 2.0 — Pre-Registration Seal Generator")
    print("=" * 60)
    print("\nGenerating protocol hash ...")
    seal = generate_protocol_hash()
    print(f"\n  Protocol Hash : {seal['protocol_hash']}")
    print(f"  Sealed At     : {seal['sealed_at_utc']}")
    print(f"\n{'─'*60}")
    print("  NEXT STEPS:")
    print("  1. Copy the protocol hash above")
    print("  2. Run: git add preregistration.py && git commit -m 'FREEZE: protocol v1.0'")
    print("  3. Note the Git commit SHA")
    print("  4. Store both hashes in your lab notebook")
    print("  5. Add verify_protocol_integrity(hash) to top of every analysis script")
    print(f"{'─'*60}\n")

    # Save seal to file
    seal_path = Path("protocol_seal.json")
    with open(seal_path, "w") as f:
        json.dump(seal, f, indent=2)
    print(f"  Seal saved → {seal_path}")
    print("  WARNING: This file records when the protocol was frozen.")
    print("  Do not modify it after the initial commit.\n")
