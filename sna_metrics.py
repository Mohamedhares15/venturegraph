"""
VentureGraph — SNA Metrics Report (C-DE422 Part A)
===================================================
sna_metrics.py

Prints all required network statistics:
    Node count, Edge count, Density, Diameter,
    Average Clustering Coefficient

Run: python sna_metrics.py
"""

import warnings
warnings.filterwarnings("ignore")

import networkx as nx
import pandas as pd
import numpy as np
from pathlib import Path


def load_graph() -> nx.DiGraph:
    p = Path("venturegraph.graphml")
    if p.exists():
        G = nx.read_graphml(p)
        print(f"  Graph loaded from {p}")
        return G
    # Fallback: rebuild from edges.csv
    p2 = Path("edges.csv")
    if p2.exists():
        edges = pd.read_csv(p2)
        G = nx.DiGraph()
        for _, row in edges.iterrows():
            G.add_edge(row["source"], row["target"],
                       weight=float(row.get("weight", 1.0)))
        print(f"  Graph rebuilt from edges.csv")
        return G
    raise FileNotFoundError("Neither venturegraph.graphml nor edges.csv found.")


def compute_metrics(G: nx.DiGraph) -> dict:
    """
    Compute all Part A required metrics.
    Diameter is computed on the largest weakly-connected component
    (the full directed graph may be disconnected).
    """
    U = G.to_undirected()   # undirected version for clustering + diameter

    # ── Core metrics ──────────────────────────────────────────────────────
    n_nodes   = G.number_of_nodes()
    n_edges   = G.number_of_edges()
    density   = nx.density(G)

    # ── Diameter (largest WCC only) ────────────────────────────────────────
    components = list(nx.weakly_connected_components(G))
    largest    = max(components, key=len)
    G_lcc      = G.subgraph(largest).copy()
    U_lcc      = G_lcc.to_undirected()
    try:
        diameter = nx.diameter(U_lcc)
    except nx.NetworkXError:
        diameter = "∞ (disconnected)"

    # ── Average clustering coefficient ────────────────────────────────────
    avg_clustering = nx.average_clustering(U)

    # ── Additional metrics (bonus) ─────────────────────────────────────────
    avg_degree      = np.mean([d for _, d in G.degree()])
    reciprocity     = nx.overall_reciprocity(G)
    n_components    = len(components)
    lcc_fraction    = len(largest) / n_nodes

    return {
        "n_nodes":          n_nodes,
        "n_edges":          n_edges,
        "density":          density,
        "diameter":         diameter,
        "avg_clustering":   avg_clustering,
        "avg_degree":       avg_degree,
        "reciprocity":      reciprocity,
        "n_components":     n_components,
        "lcc_size":         len(largest),
        "lcc_fraction":     lcc_fraction,
    }


def print_metrics(m: dict) -> None:
    print("\n" + "═" * 55)
    print("  VentureGraph — Network Statistics (C-DE422 Part A)")
    print("═" * 55)
    print(f"  {'Metric':<38} {'Value':>12}")
    print("  " + "─" * 52)
    print(f"  {'Node count (investors)':<38} {m['n_nodes']:>12,}")
    print(f"  {'Edge count (precedes relationships)':<38} {m['n_edges']:>12,}")
    print(f"  {'Graph density':<38} {m['density']:>12.6f}")
    print(f"  {'Diameter (largest component)':<38} {str(m['diameter']):>12}")
    print(f"  {'Average clustering coefficient':<38} {m['avg_clustering']:>12.6f}")
    print("  " + "─" * 52)
    print(f"  {'Average degree':<38} {m['avg_degree']:>12.4f}")
    print(f"  {'Reciprocity':<38} {m['reciprocity']:>12.6f}")
    print(f"  {'Weakly connected components':<38} {m['n_components']:>12,}")
    print(f"  {'Largest component (nodes)':<38} {m['lcc_size']:>12,}")
    print(f"  {'Largest component (fraction)':<38} {m['lcc_fraction']:>12.3f}")
    print("═" * 55)
    print()
    print("  INTERPRETATION:")
    print(f"  Density={m['density']:.6f} confirms a sparse network — consistent")
    print(f"  with real-world VC syndication where most investor pairs never")
    print(f"  co-invest. Diameter={m['diameter']} means any two investors are")
    print(f"  connected through at most {m['diameter']} intermediaries,")
    print(f"  reflecting the 'small world' property of financial networks.")
    print(f"  Clustering={m['avg_clustering']:.4f} indicates local syndication cliques")
    print(f"  — investors tend to repeatedly co-invest within tight groups.")
    print("═" * 55)


if __name__ == "__main__":
    print("Loading graph ...")
    G = load_graph()
    print("Computing metrics ...")
    m = compute_metrics(G)
    print_metrics(m)
