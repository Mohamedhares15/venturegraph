"""
VentureGraph — Temporal Precursor Score (TPS) Module
C-DE422 · Big Data Engineering II
Student: Mohamed Hares

The Temporal Precursor Score measures the frequency and consistency with
which an investor precedes top-tier institutional capital across their
portfolio. Unlike static centrality, TPS encodes prescience — not prominence.

Formula:
    TPS(A) = (1 / |portfolio(A)|) * Σ_{c ∈ portfolio(A)} prestige(A, c)

    prestige(A, c) = Σ_{B ∈ top-tier} w(A→B on c) * in_rank(B)

    - w(A→B on c)  : decay-weighted edge from A to B on company c
    - in_rank(B)   : normalised weighted in-degree of B (0–1)
    - |portfolio(A)|: companies A invested in (full graph, not filtered)

Run:
    python tps.py [data_folder]
"""

import sys
import numpy as np
import pandas as pd
import networkx as nx
import matplotlib.pyplot as plt
from pathlib import Path

from graph_construction import (
    load_crunchbase, filter_rounds, build_round_table,
    build_edges, assemble_graph, graph_summary
)


# ── Constants ────────────────────────────────────────────────────────────────

TOP_TIER_PERCENTILE = 0.80    # top 20% by weighted in-degree = "top-tier"
TRAIN_END  = "2010-12-31"     # dataset spans 1998–2013; split at 2010/2011
TEST_START = "2011-01-01"


# ── 1. Top-tier identification ───────────────────────────────────────────────

def identify_top_tier(G: nx.DiGraph,
                      percentile: float = TOP_TIER_PERCENTILE) -> set:
    in_degrees = dict(G.in_degree(weight="weight"))
    if not in_degrees:
        return set()
    threshold = np.percentile(list(in_degrees.values()), percentile * 100)
    top_tier  = {n for n, v in in_degrees.items() if v >= threshold}
    print(f"  Top-tier (in-degree ≥ p{int(percentile*100)}): "
          f"{len(top_tier):,} of {G.number_of_nodes():,} nodes")
    return top_tier


def compute_in_rank(G: nx.DiGraph) -> dict:
    in_deg = dict(G.in_degree(weight="weight"))
    max_d  = max(in_deg.values()) if in_deg else 1
    return {n: v / max_d for n, v in in_deg.items()}


# ── 2. TPS computation ───────────────────────────────────────────────────────

def compute_tps(edges: list,
                G: nx.DiGraph,
                top_tier: set,
                round_table: pd.DataFrame) -> pd.DataFrame:
    """
    TPS(A) = tps_raw(A) / portfolio_size(A)

    portfolio_size is drawn from round_table — the full Series A/B dataset,
    NOT the sector-filtered subset — so investors with multi-company portfolios
    are correctly penalised/rewarded by the normalisation.
    """
    in_rank  = compute_in_rank(G)
    edge_df  = pd.DataFrame(edges)

    # Portfolio size from the FULL round_table (before any sector filter)
    portfolio_sizes = (
        round_table.explode("investors")
                   .groupby("investors")["company_name"]
                   .nunique()
                   .rename("portfolio_size")
    )

    # Edges where the target is top-tier
    prec = edge_df[edge_df["target"].isin(top_tier)].copy()
    prec["prestige"] = prec["weight"] * prec["target"].map(in_rank)

    agg = (
        prec.groupby("source")
            .agg(
                tps_raw          = ("prestige", "sum"),
                top_tier_targets = ("target",   "nunique"),
                companies_hit    = ("company",  "nunique"),
            )
            .reset_index()
            .rename(columns={"source": "investor"})
    )

    agg = agg.merge(
        portfolio_sizes.reset_index().rename(columns={"investors": "investor"}),
        on="investor", how="left"
    )
    agg["portfolio_size"] = agg["portfolio_size"].fillna(1)
    agg["tps"] = agg["tps_raw"] / agg["portfolio_size"]

    out_deg = dict(G.out_degree(weight="weight"))
    agg["out_degree"] = agg["investor"].map(out_deg).fillna(0)

    return agg.sort_values("tps", ascending=False).reset_index(drop=True)


# ── 3. Temporal validation ───────────────────────────────────────────────────

def temporal_split(edges: list, round_table: pd.DataFrame):
    rt = round_table.set_index(["company_name", "funding_round_type"])
    train, test = [], []
    for e in edges:
        try:
            rd = rt.loc[(e["company"], e["source_round"]), "round_date"]
        except KeyError:
            continue
        if pd.Timestamp(rd) <= pd.Timestamp(TRAIN_END):
            train.append(e)
        else:
            test.append(e)
    print(f"  Train edges : {len(train):,}  (≤ {TRAIN_END})")
    print(f"  Test edges  : {len(test):,}  (≥ {TEST_START})")
    return train, test


def evaluate_tps(train_tps: pd.DataFrame,
                 test_edges: list,
                 top_tier_test: set,
                 top_n: int = 50) -> dict:
    top_investors = set(train_tps.head(top_n)["investor"])
    test_df       = pd.DataFrame(test_edges)

    if test_df.empty:
        print("  No test edges — check date range.")
        return {}

    # Test events where source preceded a top-tier investor
    test_prec = test_df[
        test_df["source"].isin(top_investors) &
        test_df["target"].isin(top_tier_test)
    ]

    total_test_prec = test_df[test_df["target"].isin(top_tier_test)]

    precision = (len(test_prec["source"].unique()) / top_n
                 if top_n > 0 else 0)
    recall    = (len(test_prec) / len(total_test_prec)
                 if len(total_test_prec) > 0 else 0)
    f1        = (2 * precision * recall / (precision + recall)
                 if (precision + recall) > 0 else 0)

    print(f"\n  Temporal Validation — top-{top_n} TPS vs test period")
    print(f"  {'─'*48}")
    print(f"  Total test edges              : {len(test_df):,}")
    print(f"  Test edges to top-tier targets: {len(total_test_prec):,}")
    print(f"  Hits (TPS investor → top-tier): {len(test_prec):,}")
    print(f"  Precision                     : {precision:.3f}")
    print(f"  Recall                        : {recall:.3f}")
    print(f"  F1                            : {f1:.3f}")
    return {"precision": precision, "recall": recall, "f1": f1}


# ── 4. Visualisations ────────────────────────────────────────────────────────

def plot_tps_bar(tps_df: pd.DataFrame, top_n: int = 20) -> None:
    # Filter to investors with portfolio_size >= 3 for meaningful comparison
    meaningful = tps_df[tps_df["portfolio_size"] >= 3].head(top_n).copy()

    fig, axes = plt.subplots(1, 2, figsize=(16, 7))

    axes[0].barh(meaningful["investor"][::-1], meaningful["tps"][::-1],
                 color="#2a6ebb", edgecolor="white")
    axes[0].set_title("Temporal Precursor Score (TPS)\n"
                      "(investors with ≥3 portfolio companies)",
                      fontsize=12, pad=10)
    axes[0].set_xlabel("TPS (normalised by portfolio size)")
    axes[0].tick_params(axis="y", labelsize=8)

    axes[1].barh(meaningful["investor"][::-1], meaningful["out_degree"][::-1],
                 color="#e07b39", edgecolor="white")
    axes[1].set_title("Weighted Out-Degree (volume signal)\n"
                      "(same investors for direct comparison)",
                      fontsize=12, pad=10)
    axes[1].set_xlabel("Σ decay weights on all outgoing edges")
    axes[1].tick_params(axis="y", labelsize=8)

    fig.suptitle(f"TPS vs Out-Degree — Top {top_n} Investors "
                 f"(portfolio size ≥ 3)",
                 fontsize=13, fontweight="bold", y=1.01)
    plt.tight_layout()
    plt.savefig("tps_ranking.png", dpi=150, bbox_inches="tight")
    plt.show()
    print("Plot saved → tps_ranking.png")


def plot_tps_scatter(tps_df: pd.DataFrame) -> None:
    df = tps_df[tps_df["portfolio_size"] >= 3].copy()

    fig, ax = plt.subplots(figsize=(11, 8))
    sc = ax.scatter(df["tps"], df["out_degree"],
                    c=df["top_tier_targets"], cmap="YlOrRd",
                    s=60, alpha=0.75, edgecolors="grey", linewidths=0.4)

    for _, row in df.head(20).iterrows():
        ax.annotate(row["investor"], (row["tps"], row["out_degree"]),
                    fontsize=6.5, ha="left", va="bottom",
                    xytext=(3, 3), textcoords="offset points")

    plt.colorbar(sc, ax=ax, label="Distinct top-tier targets preceded")
    ax.set_xlabel("Temporal Precursor Score (TPS)", fontsize=11)
    ax.set_ylabel("Weighted Out-Degree", fontsize=11)
    ax.set_title("Prescience vs Volume\n"
                 "Investors above the trend line are more predictive than their volume suggests",
                 fontsize=12, pad=12)
    plt.tight_layout()
    plt.savefig("tps_scatter.png", dpi=150)
    plt.show()
    print("Plot saved → tps_scatter.png")


# ── 5. Save ──────────────────────────────────────────────────────────────────

def save_tps(tps_df: pd.DataFrame, out: str = "tps_scores.csv") -> None:
    tps_df.to_csv(out, index=False)
    print(f"TPS scores saved → {out}")


# ── 6. Main ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    DATA_DIR = sys.argv[1] if len(sys.argv) > 1 else "."

    # ── Load full Series A/B graph (no sector filter) ─────────────────────
    print("\n[1/5] Loading data (full Series A/B — no sector filter) ...")
    df          = load_crunchbase(DATA_DIR)
    # Intentionally skip filter_rounds here so portfolio sizes are realistic
    round_table = build_round_table(df)
    edges       = build_edges(round_table)
    G           = assemble_graph(edges)
    graph_summary(G)

    # ── Top-tier ──────────────────────────────────────────────────────────
    print("\n[2/5] Identifying top-tier investors ...")
    top_tier = identify_top_tier(G)

    # ── TPS ───────────────────────────────────────────────────────────────
    print("\n[3/5] Computing TPS ...")
    tps_df = compute_tps(edges, G, top_tier, round_table)

    print(f"\n  Top 20 by TPS (portfolio ≥ 3 companies):")
    meaningful = tps_df[tps_df["portfolio_size"] >= 3]
    print(f"  {'Rank':<5} {'Investor':<38} {'TPS':>7} "
          f"{'Portfolio':>10} {'Top-Tier Targets':>18}")
    print("  " + "─" * 82)
    for i, (_, row) in enumerate(meaningful.head(20).iterrows(), 1):
        print(f"  {i:<5} {row['investor']:<38} {row['tps']:>7.4f} "
              f"{int(row['portfolio_size']):>10} {int(row['top_tier_targets']):>18}")

    save_tps(tps_df)

    # ── Temporal validation ───────────────────────────────────────────────
    print(f"\n[4/5] Temporal validation (train ≤ {TRAIN_END} / test ≥ {TEST_START}) ...")
    train_edges, test_edges = temporal_split(edges, round_table)

    if train_edges and test_edges:
        G_train     = assemble_graph(train_edges)
        top_tier_tr = identify_top_tier(G_train)
        tps_train   = compute_tps(train_edges, G_train, top_tier_tr, round_table)

        G_test      = assemble_graph(test_edges)
        top_tier_te = identify_top_tier(G_test)
        evaluate_tps(tps_train, test_edges, top_tier_te, top_n=50)
    else:
        print("  Skipping — one split is empty.")

    # ── Plots ─────────────────────────────────────────────────────────────
    print("\n[5/5] Generating visualisations ...")
    plot_tps_bar(tps_df, top_n=20)
    plot_tps_scatter(tps_df)

    print("\nDone.")
    print("  tps_scores.csv  — full ranked investor table")
    print("  tps_ranking.png — bar: TPS vs out-degree (portfolio ≥ 3)")
    print("  tps_scatter.png — scatter: prescience vs volume")