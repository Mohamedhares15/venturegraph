"""
VentureGraph — Graph Construction Module
C-DE422 · Big Data Engineering II
Student: Mohamed Hares

Builds a directed, time-weighted co-investment graph from Crunchbase data.
An edge A → B on company X exists only when investor A entered an earlier
funding round than investor B. Edge weight uses exponential decay:
    w(t) = e^(-λ·Δt)  where Δt is in years between rounds.

Dataset files required (all in the same folder):
    investments.csv     — one row per investor per round (IDs only)
    funding_rounds.csv  — round dates, types, amounts
    objects.csv         — maps object IDs to names and categories
"""

import sys
import numpy as np
import pandas as pd
import networkx as nx
import matplotlib.pyplot as plt
from pathlib import Path


# ── Constants ────────────────────────────────────────────────────────────────

LAMBDA = 0.3
TARGET_SECTORS     = {"finance", "fintech", "software", "saas", "enterprise"}
TARGET_ROUND_TYPES = {"series-a", "series-b"}


# ── 1. Data Loading & Joining ────────────────────────────────────────────────

def load_crunchbase(folder: str) -> pd.DataFrame:
    """
    Join the three Crunchbase files into one flat DataFrame:

        investments.funding_round_id   → funding_rounds.funding_round_id
        investments.investor_object_id → objects.id  (investor name)
        investments.funded_object_id   → objects.id  (company name + category)

    Returns columns:
        company_name, company_category_list, investor_name,
        funding_round_type, funded_at
    """
    folder = Path(folder)

    # ── investments.csv ───────────────────────────────────────────────────
    print("  [1/3] Loading investments.csv ...")
    inv = pd.read_csv(
        folder / "investments.csv",
        usecols=["funding_round_id", "funded_object_id", "investor_object_id"],
        encoding="latin-1",
        low_memory=False
    )
    print(f"        {len(inv):,} investment rows")

    # ── funding_rounds.csv — filter to Series A/B immediately ─────────────
    print("  [2/3] Loading funding_rounds.csv ...")
    rounds = pd.read_csv(
        folder / "funding_rounds.csv",
        usecols=["funding_round_id", "object_id", "funded_at", "funding_round_type"],
        encoding="latin-1",
        low_memory=False
    )
    rounds["funding_round_type"] = rounds["funding_round_type"].str.strip().str.lower()
    rounds = rounds[rounds["funding_round_type"].isin(TARGET_ROUND_TYPES)].copy()
    print(f"        {len(rounds):,} Series A/B rounds kept")

    # ── objects.csv — read only id, name, category_list ───────────────────
    print("  [3/3] Loading objects.csv (large file — may take ~30s) ...")
    obj = pd.read_csv(
        folder / "objects.csv",
        usecols=["id", "name", "category_code"],
        encoding="latin-1",
        low_memory=False
    )
    obj["name"] = obj["name"].str.strip()
    print(f"        {len(obj):,} objects loaded")

    # ── Join: investments ← funding_rounds ────────────────────────────────
    df = inv.merge(rounds, on="funding_round_id", how="inner")
    print(f"\n  After joining rounds  : {len(df):,} rows")

    # ── Join: resolve investor name ───────────────────────────────────────
    investor_map = obj[["id", "name"]].rename(
        columns={"id": "investor_object_id", "name": "investor_name"}
    )
    df = df.merge(investor_map, on="investor_object_id", how="left")

    # ── Join: resolve company name + category ─────────────────────────────
    company_map = obj[["id", "name", "category_code"]].rename(
        columns={
            "id": "funded_object_id",
            "name": "company_name",
            "category_code": "company_category_list",
        }
    )
    df = df.merge(company_map, on="funded_object_id", how="left")

    # ── Final clean-up ────────────────────────────────────────────────────
    df["funded_at"]     = pd.to_datetime(df["funded_at"], errors="coerce")
    df["investor_name"] = df["investor_name"].str.strip()
    df["company_name"]  = df["company_name"].str.strip()
    df = df.dropna(subset=["funded_at", "investor_name", "company_name"])

    print(f"  After cleaning        : {len(df):,} rows — "
          f"{df['company_name'].nunique():,} companies, "
          f"{df['investor_name'].nunique():,} investors")
    return df


# ── 2. Sector filter ─────────────────────────────────────────────────────────

def filter_rounds(df: pd.DataFrame) -> pd.DataFrame:
    """Keep only rows whose company category_code is in TARGET_SECTORS."""
    if "company_category_list" not in df.columns:
        return df

    def _in_sector(cat_str):
        if pd.isna(cat_str):
            return False
        # category_code is a single value e.g. "finance", "software"
        return str(cat_str).strip().lower() in TARGET_SECTORS

    df = df[df["company_category_list"].apply(_in_sector)].copy()
    return df.reset_index(drop=True)


# ── 3. Round-level aggregation ───────────────────────────────────────────────

def build_round_table(df: pd.DataFrame) -> pd.DataFrame:
    """
    Collapse to one row per (company, round_type):
        round_date — earliest funded_at in that group
        investors  — sorted list of all investors in that round
    """
    agg = (
        df.groupby(["company_name", "funding_round_type"])
          .agg(
              round_date=("funded_at", "min"),
              investors=("investor_name", lambda x: sorted(set(x)))
          )
          .reset_index()
    )
    return agg.sort_values(["company_name", "round_date"]).reset_index(drop=True)


# ── 4. Edge construction ─────────────────────────────────────────────────────

def exponential_decay_weight(date_a: pd.Timestamp,
                              date_b: pd.Timestamp,
                              lam: float = LAMBDA) -> float:
    """w(t) = e^(-λ·Δt), Δt in years. Closer in time → weight nearer 1."""
    delta_years = (date_b - date_a).days / 365.25
    return float(np.exp(-lam * delta_years))


def build_edges(round_table: pd.DataFrame) -> list[dict]:
    """
    For every company, for every pair (earlier_round, later_round),
    draw a directed edge from each investor in the earlier round
    to each investor in the later round, weighted by temporal decay.
    """
    edges = []
    for company, group in round_table.groupby("company_name"):
        rounds = group.sort_values("round_date").to_dict("records")
        for i, earlier in enumerate(rounds):
            for later in rounds[i + 1:]:
                w     = exponential_decay_weight(earlier["round_date"],
                                                 later["round_date"])
                delta = (later["round_date"] - earlier["round_date"]).days / 365.25
                for src in earlier["investors"]:
                    for tgt in later["investors"]:
                        if src == tgt:
                            continue
                        edges.append({
                            "source":          src,
                            "target":          tgt,
                            "company":         company,
                            "weight":          w,
                            "round_gap_years": round(delta, 3),
                            "source_round":    earlier["funding_round_type"],
                            "target_round":    later["funding_round_type"],
                        })
    return edges


# ── 5. Graph assembly ────────────────────────────────────────────────────────

def assemble_graph(edges: list[dict]) -> nx.DiGraph:
    """
    Collapse parallel (A→B) edges by summing weights across all companies.
    Edge attributes: weight (summed decay), num_companies.
    """
    G   = nx.DiGraph()
    agg: dict[tuple, dict] = {}

    for e in edges:
        key = (e["source"], e["target"])
        if key not in agg:
            agg[key] = {"weight": 0.0, "num_companies": 0}
        agg[key]["weight"]        += e["weight"]
        agg[key]["num_companies"] += 1

    for (src, tgt), attrs in agg.items():
        G.add_edge(src, tgt,
                   weight=round(attrs["weight"], 4),
                   num_companies=attrs["num_companies"])
    return G


# ── 6. Summary ───────────────────────────────────────────────────────────────

def graph_summary(G: nx.DiGraph) -> None:
    print("=" * 55)
    print("VentureGraph — Graph Summary")
    print("=" * 55)
    print(f"  Nodes (investors)  : {G.number_of_nodes():,}")
    print(f"  Edges (precedes)   : {G.number_of_edges():,}")
    print(f"  Density            : {nx.density(G):.6f}")
    print(f"  Weakly connected   : {nx.is_weakly_connected(G)}")
    top = sorted(G.out_degree(weight="weight"),
                 key=lambda x: x[1], reverse=True)[:10]
    print("\n  Top 10 by weighted out-degree (strongest precursors):")
    for rank, (node, val) in enumerate(top, 1):
        print(f"    {rank:2}. {node:<42} {val:.3f}")
    print("=" * 55)


# ── 7. Persistence ───────────────────────────────────────────────────────────

def save_graph(G: nx.DiGraph, out: str = "venturegraph.graphml") -> None:
    nx.write_graphml(G, out)
    print(f"Graph saved → {out}")


def save_edge_list(edges: list[dict], out: str = "edges.csv") -> None:
    pd.DataFrame(edges).to_csv(out, index=False)
    print(f"Edge list saved → {out}")


# ── 8. Visualisation ─────────────────────────────────────────────────────────

def plot_subgraph(G: nx.DiGraph, top_n: int = 30) -> None:
    top_nodes = [n for n, _ in
                 sorted(G.out_degree(weight="weight"),
                        key=lambda x: x[1], reverse=True)[:top_n]]
    sub     = G.subgraph(top_nodes)
    weights = [sub[u][v]["weight"] for u, v in sub.edges()]
    max_w   = max(weights) if weights else 1

    pos = nx.spring_layout(sub, seed=42, k=2.5)
    fig, ax = plt.subplots(figsize=(14, 10))
    nx.draw_networkx_nodes(sub, pos, node_size=300,
                           node_color="#4C72B0", alpha=0.9, ax=ax)
    nx.draw_networkx_labels(sub, pos, font_size=7,
                            font_color="white", ax=ax)
    nx.draw_networkx_edges(
        sub, pos,
        width=[2.5 * w / max_w for w in weights],
        edge_color=weights, edge_cmap=plt.cm.YlOrRd,
        arrows=True, arrowsize=12,
        connectionstyle="arc3,rad=0.1", ax=ax,
    )
    ax.set_title(
        f"VentureGraph — Top {top_n} Precursor Investors (directed, weighted)",
        fontsize=13, pad=15
    )
    ax.axis("off")
    plt.tight_layout()
    plt.savefig("venturegraph_preview.png", dpi=150)
    plt.show()
    print("Plot saved → venturegraph_preview.png")


# ── 9. Main ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Pass folder path as argument, or omit to use current directory
    DATA_DIR = sys.argv[1] if len(sys.argv) > 1 else "."

    print(f"\nLoading data from: {DATA_DIR}")
    df = load_crunchbase(DATA_DIR)

    print("\nFiltering to FinTech / SaaS ...")
    df = filter_rounds(df)
    print(f"  Rows after sector filter : {len(df):,}  "
          f"({df['company_name'].nunique():,} companies, "
          f"{df['investor_name'].nunique():,} investors)")

    round_table = build_round_table(df)
    print(f"  Round records            : {len(round_table):,}")

    print("\nBuilding directed edges ...")
    edges = build_edges(round_table)
    print(f"  Raw edges (pre-aggregation): {len(edges):,}")

    G = assemble_graph(edges)
    graph_summary(G)

    save_edge_list(edges)
    save_graph(G)
    plot_subgraph(G, top_n=30)