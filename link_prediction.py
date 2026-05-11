"""
VentureGraph — Link Prediction Module
C-DE422 · Big Data Engineering II
Student: Mohamed Hares

Predicts which current early-stage companies are structurally positioned
to receive follow-on institutional investment, using:

    1. Common Neighbours (CN)
       CN(u,v) = |N(u) ∩ N(v)|
       Raw count of shared investor neighbours between two nodes.

    2. Adamic-Adar (AA)
       AA(u,v) = Σ_{w ∈ N(u)∩N(v)}  1 / log(|N(w)|)
       Penalises common neighbours that are hubs (connected to everyone),
       upweighting rare shared connections as stronger signals.

    3. TPS-Weighted Adamic-Adar (TPS-AA) — novel extension
       TPS-AA(u,v) = Σ_{w ∈ N(u)∩N(v)}  TPS(w) / log(|N(w)|)
       Replaces the structural penalty with the precursor score of the
       shared neighbour — a shared early-stage investor who is also
       a strong TPS predictor contributes more than a generic hub.

The prediction task:
    For each company that only has a Series A investor (no Series B yet),
    predict which institutional investors are most likely to lead
    a follow-on Series B round, ranked by AA / TPS-AA score.

Run:
    python link_prediction.py [data_folder]
"""

import sys
import numpy as np
import pandas as pd
import networkx as nx
import matplotlib.pyplot as plt
from pathlib import Path
from itertools import combinations
from collections import defaultdict

from graph_construction import (
    load_crunchbase, build_round_table, build_edges, assemble_graph
)


# ── Constants ────────────────────────────────────────────────────────────────

MIN_DEGREE      = 3     # ignore very peripheral nodes in scoring
TOP_K_PAIRS     = 20    # top pairs to display in results table
TOP_K_COMPANIES = 15    # top companies to highlight in prediction


# ── 1. Build bipartite investor–company graph ────────────────────────────────

def build_bipartite(df: pd.DataFrame) -> nx.Graph:
    """
    Bipartite graph: investors on one side, companies on the other.
    An edge (investor, company) exists if the investor participated
    in any Series A or B round for that company.
    Explicitly skips rows where investor_name == company_name
    (data artefact from objects.csv merging company records as investors).
    """
    B = nx.Graph()
    for _, row in df.iterrows():
        inv  = row["investor_name"]
        comp = row["company_name"]
        rtype = row["funding_round_type"]
        if inv == comp:
            continue   # skip self-referential artefacts
        if not B.has_edge(inv, comp):
            B.add_edge(inv, comp, round_type=rtype)
            B.nodes[inv]["type"]  = "investor"
            B.nodes[comp]["type"] = "company"
    return B


# ── 2. Identify Series-A-only companies ─────────────────────────────────────

def find_series_a_only(df: pd.DataFrame) -> set:
    """
    Companies that have a Series A investor but NO Series B investor yet.
    These are the prediction targets — structurally ripe for follow-on.
    """
    has_a = set(df[df["funding_round_type"] == "series-a"]["company_name"])
    has_b = set(df[df["funding_round_type"] == "series-b"]["company_name"])
    a_only = has_a - has_b
    print(f"  Series-A-only companies (prediction targets): {len(a_only):,}")
    return a_only


# ── 3. Common Neighbours ─────────────────────────────────────────────────────

def common_neighbours(G: nx.Graph,
                      node_a: str,
                      node_b: str) -> int:
    """CN(u,v) = |N(u) ∩ N(v)|"""
    na = set(G.neighbors(node_a))
    nb = set(G.neighbors(node_b))
    return len(na & nb)


# ── 4. Adamic-Adar ───────────────────────────────────────────────────────────

def adamic_adar_score(G: nx.Graph,
                      node_a: str,
                      node_b: str) -> float:
    """AA(u,v) = Σ_{w ∈ N(u)∩N(v)} 1 / log(deg(w))"""
    na      = set(G.neighbors(node_a))
    nb      = set(G.neighbors(node_b))
    shared  = na & nb
    score   = 0.0
    for w in shared:
        deg = G.degree(w)
        if deg > 1:
            score += 1.0 / np.log(deg)
    return score


# ── 5. TPS-Weighted Adamic-Adar ──────────────────────────────────────────────

def tps_adamic_adar_score(G: nx.Graph,
                           node_a: str,
                           node_b: str,
                           tps_map: dict) -> float:
    """
    TPS-AA(u,v) = Σ_{w ∈ N(u)∩N(v)} TPS(w) / log(deg(w))

    If a shared neighbour w has a high TPS, they are a known reliable
    precursor of institutional capital — their shared connection to both
    u and v is a stronger follow-on signal than a generic hub's connection.
    """
    na     = set(G.neighbors(node_a))
    nb     = set(G.neighbors(node_b))
    shared = na & nb
    score  = 0.0
    for w in shared:
        deg = G.degree(w)
        tps = tps_map.get(w, 0.01)   # floor of 0.01 to avoid zero-weight
        if deg > 1:
            score += tps / np.log(deg)
    return score


# ── 6. Score all (company, investor) candidate pairs ────────────────────────

def score_candidates(B: nx.Graph,
                     a_only_companies: set,
                     tps_map: dict,
                     institutional_investors: set) -> pd.DataFrame:
    """
    For each Series-A-only company, score every institutional investor
    that is NOT already connected to it.

    Returns a DataFrame with columns:
        company, investor, cn, aa, tps_aa
    sorted by tps_aa descending.
    """
    rows = []

    for company in a_only_companies:
        if company not in B:
            continue
        existing_investors = set(B.neighbors(company))

        for investor in institutional_investors:
            if investor not in B:
                continue
            if investor in existing_investors:
                continue   # already invested — not a prediction target
            if investor == company:
                continue   # filter self-referential pairs (data artefact)

            cn     = common_neighbours(B, company, investor)
            if cn == 0:
                continue   # no structural basis for prediction

            aa     = adamic_adar_score(B, company, investor)
            taa    = tps_adamic_adar_score(B, company, investor, tps_map)

            rows.append({
                "company":  company,
                "investor": investor,
                "cn":       cn,
                "aa":       round(aa, 4),
                "tps_aa":   round(taa, 4),
            })

    df = pd.DataFrame(rows)
    if df.empty:
        return df
    return df.sort_values("tps_aa", ascending=False).reset_index(drop=True)


# ── 7. Temporal validation ───────────────────────────────────────────────────

def temporal_link_validation(df: pd.DataFrame,
                              train_end: str = "2010-12-31") -> dict:
    """
    Train: build bipartite graph on rounds ≤ train_end.
    Test:  identify Series B rounds that appeared after train_end
           for companies that only had Series A in the training window.

    Evaluate: did the top-K TPS-AA predictions match actual Series B investors?
    Returns precision@K for K = 10, 20, 50.
    """
    train_df = df[df["funded_at"] <= pd.Timestamp(train_end)].copy()
    test_df  = df[df["funded_at"] >  pd.Timestamp(train_end)].copy()

    print(f"  Train rows : {len(train_df):,}  (≤ {train_end})")
    print(f"  Test rows  : {len(test_df):,}  (> {train_end})")

    # Actual Series B investors in the test period
    actual_b = set(zip(
        test_df[test_df["funding_round_type"] == "series-b"]["company_name"],
        test_df[test_df["funding_round_type"] == "series-b"]["investor_name"]
    ))
    print(f"  Actual Series B (company, investor) pairs in test: {len(actual_b):,}")

    if not actual_b:
        print("  No test Series B events — check date range.")
        return {}

    # Build training bipartite graph
    B_train  = build_bipartite(train_df)
    a_only   = find_series_a_only(train_df)

    # Load TPS from file — use only scores computed on training data
    tps_path = Path("tps_scores.csv")
    tps_map  = {}
    if tps_path.exists():
        tps_df  = pd.read_csv(tps_path)
        tps_map = dict(zip(tps_df["investor"], tps_df["tps"]))

    # Institutional investors = those with degree ≥ MIN_DEGREE in training graph
    investor_nodes = {n for n, d in B_train.nodes(data=True)
                      if d.get("type") == "investor"
                      and B_train.degree(n) >= MIN_DEGREE}

    preds = score_candidates(B_train, a_only, tps_map, investor_nodes)

    if preds.empty:
        print("  No predictions generated.")
        return {}

    print(f"  Candidate pairs scored on training graph: {len(preds):,}")

    # Filter actual_b to only companies that were in a_only (training targets)
    actual_b_filtered = {(c, i) for c, i in actual_b if c in a_only}
    print(f"  Test Series B events for training targets: {len(actual_b_filtered):,}")

    if not actual_b_filtered:
        print("  No overlap between training targets and test events.")
        print("  (Companies that had Series A ≤ 2010 and Series B in 2011-2013)")
        # Report raw hit count against full actual_b as fallback
        for k in [10, 20, 50]:
            top_k = set(zip(preds.head(k)["company"], preds.head(k)["investor"]))
            hits  = top_k & actual_b
            prec  = len(hits) / k
            print(f"  Precision@{k:<3} (vs all test B): {prec:.4f}  ({len(hits)} hits)")
        return {}

    results = {}
    for k in [10, 20, 50]:
        top_k = set(zip(preds.head(k)["company"], preds.head(k)["investor"]))
        hits  = top_k & actual_b_filtered
        prec  = len(hits) / k
        results[f"precision@{k}"] = round(prec, 4)
        print(f"  Precision@{k:<3} : {prec:.4f}  ({len(hits)} hits)")

    return results


# ── 8. Visualisations ────────────────────────────────────────────────────────

def plot_top_predictions(preds: pd.DataFrame,
                         top_n: int = TOP_K_COMPANIES) -> None:
    """
    Grouped bar chart: top predicted (company, investor) pairs
    by TPS-AA score, with AA shown alongside for comparison.
    """
    top = preds.head(top_n).copy()
    top["label"] = top["company"].str[:20] + " ← " + top["investor"].str[:20]

    x   = np.arange(len(top))
    w   = 0.35
    fig, ax = plt.subplots(figsize=(14, 8))

    ax.barh(x + w/2, top["tps_aa"][::-1].values, w,
            label="TPS-AA (novel)", color="#2a6ebb", alpha=0.85)
    ax.barh(x - w/2, top["aa"][::-1].values, w,
            label="Adamic-Adar (baseline)", color="#e07b39", alpha=0.85)

    ax.set_yticks(x)
    ax.set_yticklabels(top["label"][::-1].values, fontsize=8)
    ax.set_xlabel("Link Prediction Score")
    ax.set_title(f"Top {top_n} Predicted Follow-on Investments\n"
                 "TPS-AA vs Standard Adamic-Adar",
                 fontsize=13, pad=12)
    ax.legend(fontsize=10)
    plt.tight_layout()
    plt.savefig("link_prediction_top.png", dpi=150)
    plt.show()
    print("Plot saved → link_prediction_top.png")


def plot_score_distribution(preds: pd.DataFrame) -> None:
    """
    Histogram comparing AA vs TPS-AA score distributions.
    Shows how TPS-weighting reshapes the scoring landscape.
    """
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    axes[0].hist(preds["aa"],     bins=60, color="#e07b39",
                 alpha=0.75, edgecolor="white")
    axes[0].set_title("Adamic-Adar Score Distribution", fontsize=11)
    axes[0].set_xlabel("AA Score")
    axes[0].set_ylabel("Count")

    axes[1].hist(preds["tps_aa"], bins=60, color="#2a6ebb",
                 alpha=0.75, edgecolor="white")
    axes[1].set_title("TPS-Weighted Adamic-Adar Distribution", fontsize=11)
    axes[1].set_xlabel("TPS-AA Score")

    fig.suptitle("Score Distribution: AA vs TPS-AA\n"
                 "(TPS-weighting concentrates signal among fewer, "
                 "higher-confidence pairs)",
                 fontsize=12, y=1.02)
    plt.tight_layout()
    plt.savefig("link_prediction_distribution.png", dpi=150,
                bbox_inches="tight")
    plt.show()
    print("Plot saved → link_prediction_distribution.png")


def plot_cn_vs_tpsaa(preds: pd.DataFrame) -> None:
    """
    Scatter: Common Neighbours (x) vs TPS-AA (y).
    Points above the trend have fewer but higher-quality shared neighbours.
    """
    sample = preds.head(500)
    fig, ax = plt.subplots(figsize=(10, 7))
    sc = ax.scatter(sample["cn"], sample["tps_aa"],
                    c=sample["aa"], cmap="YlOrRd",
                    s=40, alpha=0.7, edgecolors="grey", linewidths=0.3)
    plt.colorbar(sc, ax=ax, label="Adamic-Adar score")
    ax.set_xlabel("Common Neighbours", fontsize=11)
    ax.set_ylabel("TPS-Weighted Adamic-Adar", fontsize=11)
    ax.set_title("Structural vs Prescient Signal\n"
                 "Points above trend: quality of shared connections "
                 "exceeds quantity",
                 fontsize=12, pad=12)
    plt.tight_layout()
    plt.savefig("link_prediction_scatter.png", dpi=150)
    plt.show()
    print("Plot saved → link_prediction_scatter.png")


# ── 9. Save ──────────────────────────────────────────────────────────────────

def save_predictions(preds: pd.DataFrame,
                     out: str = "link_predictions.csv") -> None:
    preds.to_csv(out, index=False)
    print(f"Predictions saved → {out}")


# ── 10. Main ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    DATA_DIR = sys.argv[1] if len(sys.argv) > 1 else "."

    # ── Load data ─────────────────────────────────────────────────────────
    print("\n[1/5] Loading data ...")
    df          = load_crunchbase(DATA_DIR)
    round_table = build_round_table(df)
    edges       = build_edges(round_table)
    G           = assemble_graph(edges)

    # ── Load TPS ──────────────────────────────────────────────────────────
    tps_path = Path(DATA_DIR) / "tps_scores.csv"
    if not tps_path.exists():
        tps_path = Path("tps_scores.csv")
    if tps_path.exists():
        tps_df  = pd.read_csv(tps_path)
        tps_map = dict(zip(tps_df["investor"], tps_df["tps"]))
        print(f"  TPS scores loaded: {len(tps_map):,} investors")
    else:
        tps_map = {}
        print("  WARNING: tps_scores.csv not found — TPS-AA will use floor values.")

    # ── Build bipartite graph ─────────────────────────────────────────────
    print("\n[2/5] Building investor–company bipartite graph ...")
    B = build_bipartite(df)
    investor_nodes = {n for n, d in B.nodes(data=True)
                      if d.get("type") == "investor"
                      and B.degree(n) >= MIN_DEGREE}
    company_nodes  = {n for n, d in B.nodes(data=True)
                      if d.get("type") == "company"}
    print(f"  Investor nodes (degree ≥ {MIN_DEGREE}): {len(investor_nodes):,}")
    print(f"  Company nodes                         : {len(company_nodes):,}")
    print(f"  Bipartite edges                       : {B.number_of_edges():,}")

    # ── Find prediction targets ───────────────────────────────────────────
    print("\n[3/5] Identifying Series-A-only companies ...")
    a_only = find_series_a_only(df)

    # ── Score candidates ──────────────────────────────────────────────────
    print("\n[4/5] Scoring (company, investor) candidate pairs ...")
    print("  (This may take a minute for large graphs ...)")
    preds = score_candidates(B, a_only, tps_map, investor_nodes)
    print(f"  Candidate pairs scored: {len(preds):,}")

    if preds.empty:
        print("No predictions generated. Exiting.")
        sys.exit(0)

    # Print top predictions
    print(f"\n  Top {TOP_K_PAIRS} predicted follow-on investments (by TPS-AA):")
    print(f"  {'Rank':<5} {'Company':<30} {'Investor':<35} "
          f"{'CN':>4} {'AA':>8} {'TPS-AA':>8}")
    print("  " + "─" * 95)
    for i, row in preds.head(TOP_K_PAIRS).iterrows():
        print(f"  {i+1:<5} {row['company']:<30} {row['investor']:<35} "
              f"{int(row['cn']):>4} {row['aa']:>8.4f} {row['tps_aa']:>8.4f}")

    save_predictions(preds)

    # ── Temporal validation ───────────────────────────────────────────────
    print("\n[4b/5] Temporal validation (train ≤ 2010, test 2011–2013) ...")
    val_results = temporal_link_validation(df, train_end="2010-12-31")

    # ── Visualise ─────────────────────────────────────────────────────────
    print("\n[5/5] Generating visualisations ...")
    plot_top_predictions(preds, top_n=TOP_K_COMPANIES)
    plot_score_distribution(preds)
    plot_cn_vs_tpsaa(preds)

    print("\nDone. Output files:")
    print("  link_predictions.csv           — full scored candidate table")
    print("  link_prediction_top.png        — top predictions: TPS-AA vs AA")
    print("  link_prediction_distribution.png — score distributions")
    print("  link_prediction_scatter.png    — CN vs TPS-AA scatter")
