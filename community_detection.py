"""
VentureGraph — Community Detection Module
C-DE422 · Big Data Engineering II
Student: Mohamed Hares

Applies the Louvain algorithm to detect syndication clusters in the
co-investment graph. Communities are interpreted in terms of:
    - Investment stage (Series A vs B composition)
    - Geography (country_code distribution)
    - Sector specialisation (category_code distribution)
    - Prominence (mean TPS and out-degree of members)

The Louvain algorithm maximises modularity Q:
    Q = (1/2m) Σ_{ij} [A_ij - k_i*k_j/2m] δ(c_i, c_j)

    where A_ij = edge weight, k_i = degree of node i,
    m = total edge weight, δ = 1 if same community.

Run:
    python community_detection.py [data_folder]

Requires:
    pip install python-louvain
"""

import sys
import numpy as np
import pandas as pd
import networkx as nx
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from collections import Counter, defaultdict
from pathlib import Path

try:
    import community as community_louvain   # python-louvain package
except ImportError:
    print("ERROR: python-louvain not installed.")
    print("Run: pip install python-louvain")
    sys.exit(1)

from graph_construction import (
    load_crunchbase, build_round_table, build_edges, assemble_graph
)


# ── Constants ────────────────────────────────────────────────────────────────

MIN_COMMUNITY_SIZE = 5      # ignore communities smaller than this
LOUVAIN_RESOLUTION = 1.0    # increase → more/smaller communities
RANDOM_SEED        = 42


# ── 1. Prepare undirected graph for Louvain ──────────────────────────────────

def to_undirected_weighted(G: nx.DiGraph) -> nx.Graph:
    """
    Louvain operates on undirected graphs.
    Symmetric collapse: w(u,v) = w(u→v) + w(v→u) (if both directions exist).
    """
    U = nx.Graph()
    for u, v, data in G.edges(data=True):
        w = data.get("weight", 1.0)
        if U.has_edge(u, v):
            U[u][v]["weight"] += w
        else:
            U.add_edge(u, v, weight=w)
    return U


# ── 2. Run Louvain ───────────────────────────────────────────────────────────

def run_louvain(U: nx.Graph,
                resolution: float = LOUVAIN_RESOLUTION) -> dict:
    """
    Returns a partition dict: {node: community_id}
    Resolution > 1 → more communities; < 1 → fewer, larger communities.
    """
    partition = community_louvain.best_partition(
        U,
        weight="weight",
        resolution=resolution,
        random_state=RANDOM_SEED
    )
    n_communities = len(set(partition.values()))
    modularity    = community_louvain.modularity(partition, U, weight="weight")
    print(f"  Communities detected : {n_communities}")
    print(f"  Modularity (Q)       : {modularity:.4f}")
    return partition


# ── 3. Enrich communities with metadata ─────────────────────────────────────

def enrich_communities(partition: dict,
                       df: pd.DataFrame,
                       G: nx.DiGraph,
                       tps_df: pd.DataFrame | None = None) -> pd.DataFrame:
    """
    Build a summary DataFrame — one row per community — with:
        community_id, size, top_investors, mean_out_degree, mean_tps,
        top_sectors, top_countries, stage_mix (% Series A vs B)
    """
    # Invert partition: community_id → list of investors
    communities: dict[int, list] = defaultdict(list)
    for node, cid in partition.items():
        communities[cid].append(node)

    # Node-level metrics
    out_deg = dict(G.out_degree(weight="weight"))
    in_deg  = dict(G.in_degree(weight="weight"))
    tps_map = (dict(zip(tps_df["investor"], tps_df["tps"]))
               if tps_df is not None else {})

    # Company-level lookups from df
    investor_meta = df.groupby("investor_name").agg(
        sectors   = ("company_category_list", lambda x:
                      Counter(x.dropna().str.lower()).most_common(3)),
        countries = ("country_code",          lambda x:
                      Counter(x.dropna()).most_common(3)),
        pct_a     = ("funding_round_type",    lambda x:
                      (x == "series-a").mean()),
    ).to_dict("index")

    rows = []
    for cid, members in communities.items():
        if len(members) < MIN_COMMUNITY_SIZE:
            continue

        # Top investors by out-degree within community
        top = sorted(members, key=lambda n: out_deg.get(n, 0), reverse=True)[:5]

        # Mean metrics
        mean_out = np.mean([out_deg.get(n, 0) for n in members])
        mean_in  = np.mean([in_deg.get(n, 0)  for n in members])
        mean_tps = np.mean([tps_map.get(n, 0)  for n in members])

        # Aggregate sector & country from member metadata
        sector_counts:  Counter = Counter()
        country_counts: Counter = Counter()
        pct_a_vals = []
        for m in members:
            if m in investor_meta:
                for sec, cnt in investor_meta[m]["sectors"]:
                    sector_counts[sec] += cnt
                for cc, cnt in investor_meta[m]["countries"]:
                    country_counts[cc] += cnt
                pct_a_vals.append(investor_meta[m]["pct_a"])

        top_sectors   = [s for s, _ in sector_counts.most_common(3)]
        top_countries = [c for c, _ in country_counts.most_common(3)]
        mean_pct_a    = np.mean(pct_a_vals) if pct_a_vals else 0.5

        rows.append({
            "community_id":   cid,
            "size":           len(members),
            "top_investors":  ", ".join(top),
            "mean_out_degree": round(mean_out, 3),
            "mean_in_degree":  round(mean_in, 3),
            "mean_tps":        round(mean_tps, 4),
            "top_sectors":     ", ".join(top_sectors),
            "top_countries":   ", ".join(top_countries),
            "pct_series_a":    round(mean_pct_a, 3),
            "members":         members,   # kept for plotting, dropped on save
        })

    summary = pd.DataFrame(rows).sort_values("size", ascending=False)
    summary = summary.reset_index(drop=True)
    return summary


# ── 4. Visualisations ────────────────────────────────────────────────────────

def plot_community_graph(G: nx.DiGraph,
                         partition: dict,
                         top_n_nodes: int = 80) -> None:
    """
    Draw the top_n_nodes by degree, coloured by community.
    Edge width ∝ weight.
    """
    # Select top nodes
    top_nodes = sorted(G.nodes(),
                       key=lambda n: G.degree(n, weight="weight"),
                       reverse=True)[:top_n_nodes]
    sub = G.subgraph(top_nodes).copy()

    # Community colours
    cids        = sorted(set(partition.get(n, -1) for n in sub.nodes()))
    cmap        = plt.cm.get_cmap("tab20", len(cids))
    color_map   = {cid: cmap(i) for i, cid in enumerate(cids)}
    node_colors = [color_map[partition.get(n, -1)] for n in sub.nodes()]

    weights = [sub[u][v].get("weight", 1) for u, v in sub.edges()]
    max_w   = max(weights) if weights else 1

    pos = nx.spring_layout(sub, seed=RANDOM_SEED, k=2.0)
    fig, ax = plt.subplots(figsize=(16, 12))

    nx.draw_networkx_nodes(sub, pos, node_color=node_colors,
                           node_size=200, alpha=0.85, ax=ax)
    nx.draw_networkx_labels(sub, pos, font_size=6,
                            font_color="white", ax=ax)
    nx.draw_networkx_edges(sub, pos,
                           width=[1.5 * w / max_w for w in weights],
                           alpha=0.4, arrows=True, arrowsize=8,
                           edge_color="#555555",
                           connectionstyle="arc3,rad=0.05", ax=ax)

    # Legend
    patches = [mpatches.Patch(color=color_map[cid], label=f"Community {cid}")
               for cid in cids[:12]]    # cap legend at 12
    ax.legend(handles=patches, loc="upper left", fontsize=7,
              framealpha=0.8, ncol=2)
    ax.set_title(f"VentureGraph — Louvain Communities (top {top_n_nodes} nodes)",
                 fontsize=13, pad=15)
    ax.axis("off")
    plt.tight_layout()
    plt.savefig("community_graph.png", dpi=150)
    plt.show()
    print("Plot saved → community_graph.png")


def plot_community_profiles(summary: pd.DataFrame, top_n: int = 10) -> None:
    """
    Horizontal bar chart comparing communities by size, mean TPS,
    and mean out-degree — giving a profile of each syndication cluster.
    """
    top = summary.head(top_n).copy()
    labels = [f"C{row.community_id} ({row.size})" for _, row in top.iterrows()]

    fig, axes = plt.subplots(1, 3, figsize=(18, 6))

    # Size
    axes[0].barh(labels[::-1], top["size"][::-1], color="#4C72B0")
    axes[0].set_title("Community Size\n(number of investors)", fontsize=11)
    axes[0].set_xlabel("Investors")

    # Mean TPS
    axes[1].barh(labels[::-1], top["mean_tps"][::-1], color="#2ecc71")
    axes[1].set_title("Mean TPS\n(avg prescience of members)", fontsize=11)
    axes[1].set_xlabel("Mean TPS")

    # Mean out-degree
    axes[2].barh(labels[::-1], top["mean_out_degree"][::-1], color="#e07b39")
    axes[2].set_title("Mean Out-Degree\n(avg activity/volume)", fontsize=11)
    axes[2].set_xlabel("Mean Weighted Out-Degree")

    fig.suptitle(f"Community Profiles — Top {top_n} Largest Syndication Clusters",
                 fontsize=13, fontweight="bold", y=1.02)
    plt.tight_layout()
    plt.savefig("community_profiles.png", dpi=150, bbox_inches="tight")
    plt.show()
    print("Plot saved → community_profiles.png")


def plot_stage_mix(summary: pd.DataFrame, top_n: int = 10) -> None:
    """
    Stacked bar: % Series A vs Series B per community.
    Communities skewed toward A are earlier-stage clusters.
    """
    top    = summary.head(top_n).copy()
    labels = [f"C{row.community_id}" for _, row in top.iterrows()]
    pct_a  = top["pct_series_a"].values
    pct_b  = 1 - pct_a

    x = np.arange(len(labels))
    fig, ax = plt.subplots(figsize=(12, 5))
    ax.bar(x, pct_a, label="Series A", color="#2a6ebb", alpha=0.85)
    ax.bar(x, pct_b, bottom=pct_a, label="Series B", color="#e07b39", alpha=0.85)
    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=9)
    ax.set_ylabel("Proportion of investments")
    ax.set_title("Investment Stage Mix per Community\n"
                 "(communities left of centre skew toward Series A)",
                 fontsize=12)
    ax.legend()
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda y, _: f"{y:.0%}"))
    plt.tight_layout()
    plt.savefig("community_stage_mix.png", dpi=150)
    plt.show()
    print("Plot saved → community_stage_mix.png")


# ── 5. Print summary table ───────────────────────────────────────────────────

def print_summary(summary: pd.DataFrame) -> None:
    print(f"\n  {'ID':<5} {'Size':>5} {'Mean TPS':>9} {'Mean Out°':>10} "
          f"{'% Ser-A':>8}  Top Investors")
    print("  " + "─" * 100)
    for _, row in summary.head(15).iterrows():
        print(f"  C{row.community_id:<4} {row['size']:>5} "
              f"{row.mean_tps:>9.4f} {row.mean_out_degree:>10.3f} "
              f"{row.pct_series_a:>8.1%}  {row.top_investors}")


# ── 6. Save ──────────────────────────────────────────────────────────────────

def save_communities(summary: pd.DataFrame,
                     partition: dict,
                     out_summary: str = "community_summary.csv",
                     out_partition: str = "community_partition.csv") -> None:
    # Drop the members list column before saving
    summary.drop(columns=["members"], errors="ignore").to_csv(
        out_summary, index=False)

    pd.DataFrame(
        partition.items(), columns=["investor", "community_id"]
    ).to_csv(out_partition, index=False)

    print(f"Saved → {out_summary}")
    print(f"Saved → {out_partition}")


# ── 7. Main ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    DATA_DIR = sys.argv[1] if len(sys.argv) > 1 else "."

    # ── Load data & build graph ───────────────────────────────────────────
    print("\n[1/5] Loading data ...")
    df          = load_crunchbase(DATA_DIR)
    round_table = build_round_table(df)
    edges       = build_edges(round_table)
    G           = assemble_graph(edges)

    # ── Load TPS scores if available ──────────────────────────────────────
    tps_path = Path(DATA_DIR) / "tps_scores.csv"
    if not tps_path.exists():
        tps_path = Path("tps_scores.csv")
    if tps_path.exists():
        tps_df = pd.read_csv(tps_path)
        print(f"  TPS scores loaded from {tps_path}")
    else:
        tps_df = None
        print("  tps_scores.csv not found — TPS enrichment skipped.")

    # Add investor_name & country to df for enrichment
    # (country_code comes from objects.csv via the join in load_crunchbase)
    # We rename funded_object columns to match what enrich expects
    if "country_code" not in df.columns:
        df["country_code"] = "unknown"
    df = df.rename(columns={
        "company_category_list": "company_category_list",
        "investor_name": "investor_name",
    })

    # ── Louvain ───────────────────────────────────────────────────────────
    print("\n[2/5] Converting to undirected graph for Louvain ...")
    U = to_undirected_weighted(G)
    print(f"  Undirected: {U.number_of_nodes():,} nodes, "
          f"{U.number_of_edges():,} edges")

    print("\n[3/5] Running Louvain community detection ...")
    partition = run_louvain(U)

    # ── Enrich ────────────────────────────────────────────────────────────
    print("\n[4/5] Enriching communities with metadata ...")
    summary = enrich_communities(partition, df, G, tps_df)
    print_summary(summary)
    save_communities(summary, partition)

    # ── Visualise ─────────────────────────────────────────────────────────
    print("\n[5/5] Generating visualisations ...")
    plot_community_graph(G, partition, top_n_nodes=80)
    plot_community_profiles(summary, top_n=10)
    plot_stage_mix(summary, top_n=10)

    print("\nDone. Output files:")
    print("  community_partition.csv  — node → community_id mapping")
    print("  community_summary.csv    — per-community profile table")
    print("  community_graph.png      — graph coloured by community")
    print("  community_profiles.png   — size / TPS / out-degree bars")
    print("  community_stage_mix.png  — Series A vs B stage mix")
