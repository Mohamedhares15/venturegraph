"""
VentureGraph — Centrality Comparison (C-DE422 Part B)
======================================================
centrality_comparison.py

Compares TPS against standard graph centrality measures for top-5 investors:
    - Degree Centrality (in + out)
    - Betweenness Centrality
    - Eigenvector Centrality (approximated on directed graph)
    - Temporal Precursor Score (TPS) — novel contribution

The divergence between TPS ranking and standard centrality rankings is the
core empirical argument of the paper: prominence ≠ prescience.

Run: python centrality_comparison.py
"""

import warnings
warnings.filterwarnings("ignore")

import networkx as nx
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from pathlib import Path


# ── Load ──────────────────────────────────────────────────────────────────────

def load_graph() -> nx.DiGraph:
    for p in ["venturegraph.graphml", "edges.csv"]:
        if Path(p).exists():
            if p.endswith(".graphml"):
                return nx.read_graphml(p)
            edges = pd.read_csv(p)
            G = nx.DiGraph()
            for _, r in edges.iterrows():
                G.add_edge(r["source"], r["target"],
                           weight=float(r.get("weight", 1.0)))
            return G
    raise FileNotFoundError("Graph file not found.")


def load_tps() -> pd.DataFrame:
    p = Path("tps_scores.csv")
    if p.exists():
        return pd.read_csv(p)
    return pd.DataFrame(columns=["investor", "tps", "portfolio_size"])


# ── Compute centralities ──────────────────────────────────────────────────────

def compute_all_centralities(G: nx.DiGraph) -> pd.DataFrame:
    print("  Computing degree centrality ...")
    deg_in  = nx.in_degree_centrality(G)
    deg_out = nx.out_degree_centrality(G)

    print("  Computing betweenness centrality (top 300 nodes, sampled) ...")
    # Use top-300 subgraph for speed; note in paper
    top300 = sorted(G.nodes(), key=lambda n: G.degree(n, weight="weight"),
                    reverse=True)[:300]
    sub = G.subgraph(top300)
    betweenness = nx.betweenness_centrality(sub, weight="weight", normalized=True)
    # Extend to 0.0 for nodes not in subgraph
    betweenness = {n: betweenness.get(n, 0.0) for n in G.nodes()}

    print("  Computing eigenvector centrality ...")
    try:
        eigen = nx.eigenvector_centrality(G, weight="weight", max_iter=500)
    except nx.PowerIterationFailedConvergence:
        eigen = nx.eigenvector_centrality_numpy(G, weight="weight")

    print("  Computing weighted out-degree (volume baseline) ...")
    out_deg_weighted = dict(G.out_degree(weight="weight"))

    df = pd.DataFrame({
        "investor":     list(G.nodes()),
        "deg_in":       [deg_in.get(n, 0) for n in G.nodes()],
        "deg_out":      [deg_out.get(n, 0) for n in G.nodes()],
        "betweenness":  [betweenness.get(n, 0) for n in G.nodes()],
        "eigenvector":  [eigen.get(n, 0) for n in G.nodes()],
        "out_deg_wt":   [out_deg_weighted.get(n, 0) for n in G.nodes()],
    })
    return df


# ── Merge with TPS ────────────────────────────────────────────────────────────

def build_comparison_table(
    centralities: pd.DataFrame,
    tps_df: pd.DataFrame,
    top_n: int = 20,
) -> pd.DataFrame:
    """
    Merge centrality metrics with TPS scores.
    Add rank columns so divergence between metrics is visible.
    """
    if not tps_df.empty:
        merged = centralities.merge(
            tps_df[["investor", "tps", "portfolio_size"]],
            on="investor", how="left"
        ).fillna({"tps": 0.0, "portfolio_size": 0})
    else:
        merged = centralities.copy()
        merged["tps"] = 0.0
        merged["portfolio_size"] = 0

    # Add rank columns (1 = highest)
    for col in ["deg_out", "betweenness", "eigenvector", "tps"]:
        merged[f"rank_{col}"] = merged[col].rank(ascending=False).astype(int)

    # Rank divergence: |rank_tps - rank_deg_out|
    merged["rank_divergence"] = (
        merged["rank_tps"] - merged["rank_deg_out"]
    ).abs()

    return merged.sort_values("tps", ascending=False).reset_index(drop=True)


# ── Print comparison table ────────────────────────────────────────────────────

def print_comparison(df: pd.DataFrame, top_n: int = 15) -> None:
    print("\n" + "═" * 90)
    print("  Centrality Comparison — TPS vs Standard Metrics (C-DE422 Part B)")
    print("═" * 90)
    print(f"  {'Investor':<30} {'TPS':>7} {'Rank':>5} │ "
          f"{'OutDeg':>8} {'Rank':>5} │ "
          f"{'Betwn':>8} {'Rank':>5} │ "
          f"{'Eigen':>8} {'Rank':>5} │ {'Diverge':>8}")
    print("  " + "─" * 88)

    for i, row in df.head(top_n).iterrows():
        div_str = f"+{int(row['rank_divergence'])}" if row['rank_tps'] < row['rank_deg_out'] else f"-{int(row['rank_divergence'])}"
        print(
            f"  {row['investor'][:29]:<30} "
            f"{row['tps']:>7.4f} {int(row['rank_tps']):>5} │ "
            f"{row['out_deg_wt']:>8.3f} {int(row['rank_deg_out']):>5} │ "
            f"{row['betweenness']:>8.5f} {int(row['rank_betweenness']):>5} │ "
            f"{row['eigenvector']:>8.5f} {int(row['rank_eigenvector']):>5} │ "
            f"{div_str:>8}"
        )

    print("═" * 90)
    print()
    print("  TOP 5 — TPS (Prescience) vs Out-Degree (Volume):")
    print(f"  {'Rank':>5}  {'Investor (by TPS)':<35}  {'Investor (by Out-Degree)':<35}")
    print("  " + "─" * 78)
    top_tps = df.nlargest(5, "tps")["investor"].tolist()
    top_out = df.nlargest(5, "out_deg_wt")["investor"].tolist()
    for i in range(5):
        print(f"  {i+1:>5}  {top_tps[i][:34]:<35}  {top_out[i][:34]:<35}")
    print()
    print("  Rank correlation (TPS vs Out-Degree): "
          f"ρ = {df['rank_tps'].corr(df['rank_deg_out'], method='spearman'):+.4f}")
    print("  Rank correlation (TPS vs Betweenness): "
          f"ρ = {df['rank_tps'].corr(df['rank_betweenness'], method='spearman'):+.4f}")
    print("  [Low correlation = TPS captures different information than standard metrics]")
    print("═" * 90)


# ── Visualisation ─────────────────────────────────────────────────────────────

def plot_centrality_comparison(df: pd.DataFrame, top_n: int = 20) -> None:
    top = df.head(top_n).copy()

    fig = plt.figure(figsize=(18, 10))
    gs  = gridspec.GridSpec(2, 3, figure=fig, hspace=0.45, wspace=0.35)

    metrics = [
        ("tps",         "Temporal Precursor Score (TPS)", "#2a6ebb"),
        ("out_deg_wt",  "Weighted Out-Degree",            "#e07b39"),
        ("betweenness", "Betweenness Centrality",         "#2ecc71"),
        ("eigenvector", "Eigenvector Centrality",         "#9b59b6"),
    ]

    for idx, (col, title, colour) in enumerate(metrics):
        ax = fig.add_subplot(gs[idx // 2, idx % 2])
        vals = top.nlargest(top_n, col)
        ax.barh(vals["investor"].str[:22][::-1],
                vals[col][::-1], color=colour, alpha=0.85)
        ax.set_title(title, fontsize=10, pad=8)
        ax.set_xlabel("Score", fontsize=8)
        ax.tick_params(axis="y", labelsize=7)

    # Scatter: TPS vs Out-Degree (the key divergence plot)
    ax_sc = fig.add_subplot(gs[:, 2])
    sc = ax_sc.scatter(
        df["out_deg_wt"], df["tps"],
        c=df["betweenness"], cmap="YlOrRd",
        s=40, alpha=0.7, edgecolors="grey", linewidths=0.3
    )
    for _, row in df.head(12).iterrows():
        ax_sc.annotate(row["investor"][:18],
                       (row["out_deg_wt"], row["tps"]),
                       fontsize=5.5, ha="left", va="bottom",
                       xytext=(2, 2), textcoords="offset points")
    plt.colorbar(sc, ax=ax_sc, label="Betweenness", shrink=0.8)
    ax_sc.set_xlabel("Weighted Out-Degree (Volume)", fontsize=9)
    ax_sc.set_ylabel("TPS (Prescience)", fontsize=9)
    ax_sc.set_title("Prescience vs Volume\n"
                    "Divergence = TPS adds information beyond degree",
                    fontsize=10, pad=8)

    fig.suptitle("VentureGraph — Centrality Comparison (C-DE422 Part B)",
                 fontsize=13, fontweight="bold", y=1.01)
    plt.savefig("centrality_comparison.png", dpi=150, bbox_inches="tight")
    print("  Plot saved → centrality_comparison.png")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("VentureGraph — Centrality Comparison (C-DE422 Part B)")
    print("=" * 60)

    print("\nLoading graph ...")
    G = load_graph()
    print(f"  {G.number_of_nodes():,} nodes, {G.number_of_edges():,} edges")

    print("\nLoading TPS scores ...")
    tps_df = load_tps()
    print(f"  {len(tps_df):,} investors with TPS scores")

    print("\nComputing centrality metrics ...")
    centralities = compute_all_centralities(G)

    print("\nBuilding comparison table ...")
    comparison = build_comparison_table(centralities, tps_df, top_n=20)

    print_comparison(comparison, top_n=15)

    print("\nGenerating visualisation ...")
    plot_centrality_comparison(comparison, top_n=20)

    comparison.to_csv("centrality_comparison.csv", index=False)
    print("  Table saved → centrality_comparison.csv")
