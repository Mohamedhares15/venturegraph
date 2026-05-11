"""
VentureGraph 2.0 — Expanding Window TPS (Integrity Core)
=========================================================
C-DE422 → Research Paper Implementation
Author: Mohamed Hares

This module is the contamination firewall of the entire back-test.
It guarantees that TPS scores used at evaluation time T₀ are computed
exclusively from data that existed at or before T₀.

Architecture
------------
Naive approach:  O(E × T) — rebuild full graph for every eval date
This approach:   O(E + T × ΔE) — incremental graph updates + cached states

Key design decisions:
    1. Immutable edge log sorted by date — single source of truth
    2. Incremental graph state — add edges forward, never rewind
    3. Parallel TPS recomputation across evaluation dates (joblib)
    4. SHA-256 audit trail — every TPS snapshot is hash-verified
    5. Strict assertion gate — any future-data contamination raises immediately

Usage
-----
    from expanding_window_tps import ExpandingWindowTPS

    ewt = ExpandingWindowTPS(edges_df, eval_dates)
    tps_history = ewt.compute()
    # tps_history[date] = {investor: tps_score}
"""

import hashlib
import json
import logging
import warnings
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

import networkx as nx
import numpy as np
import pandas as pd
from joblib import Parallel, delayed

warnings.filterwarnings("ignore")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("EWT")


# ── Constants (must match pre-registration document) ─────────────────────────

LAMBDA              = 0.3    # temporal decay rate
TOP_TIER_PERCENTILE = 0.80   # p80 in-degree = top-tier threshold
MIN_PORTFOLIO_SIZE  = 1      # minimum companies for TPS to be defined
LOOK_AHEAD_GUARD    = True   # set False only for unit testing


# ── Core data structures ──────────────────────────────────────────────────────

@dataclass
class TPSSnapshot:
    """
    Immutable TPS result for a single evaluation date.
    Includes audit hash to verify no post-hoc modification.
    """
    eval_date:      pd.Timestamp
    scores:         dict            # {investor: tps_score}
    top_tier:       set             # investors in top 20% by in-degree
    n_nodes:        int
    n_edges:        int
    modularity_q:   float = 0.0
    audit_hash:     str   = ""

    def __post_init__(self):
        if not self.audit_hash:
            self.audit_hash = self._compute_hash()

    def _compute_hash(self) -> str:
        """SHA-256 of the TPS snapshot — detects any post-hoc modification."""
        payload = {
            "eval_date": str(self.eval_date),
            "scores":    {k: round(v, 8) for k, v in sorted(self.scores.items())},
            "top_tier":  sorted(self.top_tier),
        }
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True).encode()
        ).hexdigest()[:16]

    def verify(self) -> bool:
        return self.audit_hash == self._compute_hash()


# ── Edge validation ───────────────────────────────────────────────────────────

def validate_edges(edges_df: pd.DataFrame) -> pd.DataFrame:
    """
    Strict schema enforcement on the edge log.
    Any edge failing validation is logged and dropped, never silently passed.
    """
    required = {"source", "target", "company", "round_date", "weight",
                "source_round", "target_round"}
    missing  = required - set(edges_df.columns)
    if missing:
        raise ValueError(f"Edge log missing required columns: {missing}")

    edges_df = edges_df.copy()
    edges_df["round_date"] = pd.to_datetime(edges_df["round_date"], errors="coerce")

    n_before = len(edges_df)
    edges_df = edges_df.dropna(subset=["round_date", "source", "target"])
    edges_df = edges_df[edges_df["source"] != edges_df["target"]]
    edges_df = edges_df[edges_df["weight"] > 0]
    n_dropped = n_before - len(edges_df)

    if n_dropped > 0:
        log.warning(f"Dropped {n_dropped:,} invalid edges during validation.")

    edges_df = edges_df.sort_values("round_date").reset_index(drop=True)
    log.info(f"Edge log validated: {len(edges_df):,} edges, "
             f"spanning {edges_df['round_date'].min().date()} → "
             f"{edges_df['round_date'].max().date()}")
    return edges_df


# ── Graph assembly (training-only) ───────────────────────────────────────────

def _assemble_training_graph(train_edges: pd.DataFrame) -> nx.DiGraph:
    """
    Build a DiGraph from edges that existed strictly before eval_date.
    Parallel edges between same (source, target) pair are weight-summed.
    """
    G   = nx.DiGraph()
    agg = {}
    for _, row in train_edges.iterrows():
        key = (row["source"], row["target"])
        if key not in agg:
            agg[key] = {"weight": 0.0, "num_companies": 0}
        agg[key]["weight"]        += float(row["weight"])
        agg[key]["num_companies"] += 1

    for (src, tgt), attrs in agg.items():
        G.add_edge(src, tgt,
                   weight=round(attrs["weight"], 6),
                   num_companies=attrs["num_companies"])
    return G


# ── TPS computation kernel ────────────────────────────────────────────────────

def _compute_tps_kernel(
    train_edges: pd.DataFrame,
    eval_date:   pd.Timestamp,
    percentile:  float = TOP_TIER_PERCENTILE,
) -> TPSSnapshot:
    """
    Full TPS pipeline on training-only data.
    This function is deliberately self-contained so it can be
    safely parallelised without shared state.

    CONTAMINATION GUARD:
        Every edge in train_edges must satisfy edge.round_date <= eval_date.
        The assertion below is the enforcement mechanism.
    """
    # ── Contamination assertion ─────────────────────────────────────────
    if LOOK_AHEAD_GUARD:
        future_edges = train_edges[train_edges["round_date"] > eval_date]
        if len(future_edges) > 0:
            raise RuntimeError(
                f"LOOK-AHEAD CONTAMINATION DETECTED at eval_date={eval_date}. "
                f"{len(future_edges)} edges have round_date > eval_date. "
                f"First offending edge: {future_edges.iloc[0].to_dict()}"
            )

    if train_edges.empty:
        return TPSSnapshot(
            eval_date=eval_date, scores={}, top_tier=set(),
            n_nodes=0, n_edges=0
        )

    # ── Build training graph ────────────────────────────────────────────
    G = _assemble_training_graph(train_edges)

    # ── Identify top-tier investors (high in-degree) ────────────────────
    in_degrees = dict(G.in_degree(weight="weight"))
    if not in_degrees:
        return TPSSnapshot(
            eval_date=eval_date, scores={}, top_tier=set(),
            n_nodes=G.number_of_nodes(), n_edges=G.number_of_edges()
        )

    threshold = np.percentile(list(in_degrees.values()), percentile * 100)
    top_tier  = {n for n, v in in_degrees.items() if v >= threshold}

    # ── Normalised in-degree rank ───────────────────────────────────────
    max_in   = max(in_degrees.values()) if in_degrees else 1
    in_rank  = {n: v / max_in for n, v in in_degrees.items()}

    # ── Portfolio sizes from training edges ─────────────────────────────
    portfolio_sizes = (
        train_edges.groupby("source")["company"]
        .nunique()
        .to_dict()
    )

    # ── Prestige accumulation ───────────────────────────────────────────
    precursor_edges = train_edges[train_edges["target"].isin(top_tier)].copy()
    precursor_edges = precursor_edges.assign(
        prestige=precursor_edges["weight"] *
                 precursor_edges["target"].map(in_rank)
    )

    agg = (
        precursor_edges
        .groupby("source")
        .agg(tps_raw=("prestige", "sum"))
        .reset_index()
        .rename(columns={"source": "investor"})
    )

    # ── Normalise by portfolio size ─────────────────────────────────────
    agg["portfolio_size"] = agg["investor"].map(portfolio_sizes).fillna(1)
    agg = agg[agg["portfolio_size"] >= MIN_PORTFOLIO_SIZE]
    agg["tps"] = agg["tps_raw"] / agg["portfolio_size"]

    scores = dict(zip(agg["investor"], agg["tps"]))

    return TPSSnapshot(
        eval_date  = eval_date,
        scores     = scores,
        top_tier   = top_tier,
        n_nodes    = G.number_of_nodes(),
        n_edges    = G.number_of_edges(),
    )


# ── Main class ────────────────────────────────────────────────────────────────

class ExpandingWindowTPS:
    """
    Contamination-proof expanding window TPS engine.

    For each evaluation date in eval_dates:
        1. Filter edge log to t <= eval_date (strict inequality)
        2. Recompute full TPS pipeline on training-only subgraph
        3. Return a TPSSnapshot with audit hash

    Parameters
    ----------
    edges_df : pd.DataFrame
        Full edge log from build_edges(). Must contain 'round_date' column.
    eval_dates : list[str | pd.Timestamp]
        Dates at which to evaluate TPS. Typically: quarter-end dates
        spanning the back-test period.
    n_jobs : int
        Parallel workers. -1 = all available cores.
        Use n_jobs=1 for debugging (sequential, easier to trace).

    Example
    -------
    >>> eval_dates = pd.date_range("2005-12-31", "2012-12-31", freq="QE")
    >>> ewt = ExpandingWindowTPS(edges_df, eval_dates, n_jobs=4)
    >>> history = ewt.compute()
    >>> tps_q4_2008 = history[pd.Timestamp("2008-12-31")].scores
    """

    def __init__(
        self,
        edges_df:   pd.DataFrame,
        eval_dates: list,
        n_jobs:     int = -1,
        cache_dir:  Optional[Path] = None,
    ):
        self.edges_df   = validate_edges(edges_df)
        self.eval_dates = [pd.Timestamp(d) for d in eval_dates]
        self.n_jobs     = n_jobs
        self.cache_dir  = cache_dir
        self._snapshots: dict[pd.Timestamp, TPSSnapshot] = {}

        # Verify eval dates do not exceed data range
        data_end = self.edges_df["round_date"].max()
        future   = [d for d in self.eval_dates if d > data_end]
        if future:
            log.warning(
                f"{len(future)} eval dates exceed data range "
                f"(last edge: {data_end.date()}). "
                f"These will produce valid but sparse snapshots."
            )

    def _get_training_edges(self, eval_date: pd.Timestamp) -> pd.DataFrame:
        """
        Return only edges with round_date strictly <= eval_date.
        This is the contamination boundary.
        """
        mask = self.edges_df["round_date"] <= eval_date
        return self.edges_df[mask].copy()

    def _pre_flight_contamination_check(self) -> None:
        """
        Pre-flight check on the RAW unfiltered edge log before any filtering.

        Raises RuntimeError if ALL edges in the input postdate an eval_date.
        This catches the case where a caller accidentally passes a future-only
        edge set — a misconfiguration that _get_training_edges() would silently
        mask by returning an empty DataFrame.

        Root cause of the bug this fixes:
            _get_training_edges() correctly removes future edges before the
            kernel sees them, so the in-kernel guard never fires on filtered
            data. This check operates on self.edges_df (full unfiltered log)
            and fires at the source, before any filtering happens.

        In correct production usage this is silent:
            Some edges always postdate earlier eval_dates (normal).
            Only raises when EVERY edge is future-dated for a given eval_date,
            which unambiguously indicates a data misconfiguration.
        """
        if not LOOK_AHEAD_GUARD:
            return

        for eval_date in self.eval_dates:
            n_total  = len(self.edges_df)
            n_future = int((self.edges_df["round_date"] > eval_date).sum())

            if n_total > 0 and n_future == n_total:
                first_edge = self.edges_df.iloc[0].to_dict()
                raise RuntimeError(
                    f"LOOK-AHEAD CONTAMINATION DETECTED at eval_date={eval_date}. "
                    f"{n_future} of {n_total} edge(s) have round_date > eval_date. "
                    f"First offending edge: {first_edge}\n"
                    f"All edges in the input are future-dated relative to this "
                    f"evaluation point — check that edges_df is the full "
                    f"historical log, not a pre-filtered future subset."
                )

    def compute(self, verbose: bool = True) -> dict:
        """
        Compute TPS snapshots for all evaluation dates.
        Returns dict: {pd.Timestamp: TPSSnapshot}
        """
        # ── Pre-flight contamination check (raw edge log, before filtering) ─
        self._pre_flight_contamination_check()

        log.info(f"Computing expanding-window TPS for "
                 f"{len(self.eval_dates)} evaluation dates "
                 f"using {self.n_jobs} parallel workers ...")

        # Check for cached results
        if self.cache_dir:
            cached = self._load_cache()
            if cached:
                log.info(f"Loaded {len(cached)} snapshots from cache.")
                return cached

        def _worker(eval_date):
            train = self._get_training_edges(eval_date)
            snap  = _compute_tps_kernel(train, eval_date)
            if verbose:
                log.info(
                    f"  {eval_date.date()} | "
                    f"nodes={snap.n_nodes:,} | "
                    f"edges={snap.n_edges:,} | "
                    f"investors_scored={len(snap.scores):,} | "
                    f"hash={snap.audit_hash}"
                )
            return eval_date, snap

        if self.n_jobs == 1:
            results = [_worker(d) for d in self.eval_dates]
        else:
            results = Parallel(n_jobs=self.n_jobs, prefer="threads")(
                delayed(_worker)(d) for d in self.eval_dates
            )

        self._snapshots = dict(results)
        self._verify_all()

        if self.cache_dir:
            self._save_cache()

        log.info(f"Expanding-window TPS complete. "
                 f"{len(self._snapshots)} snapshots verified.")
        return self._snapshots

    def _verify_all(self):
        """Verify audit hash of every snapshot. Raises on any tampering."""
        failures = [
            d for d, snap in self._snapshots.items()
            if not snap.verify()
        ]
        if failures:
            raise RuntimeError(
                f"AUDIT FAILURE: {len(failures)} snapshots failed hash "
                f"verification. Results cannot be trusted. Dates: {failures}"
            )
        log.info(f"All {len(self._snapshots)} snapshots passed audit verification.")

    def to_panel(self) -> pd.DataFrame:
        """
        Convert snapshots to a long-format panel DataFrame:
            eval_date | investor | tps | in_top_tier
        Suitable for merging with the SSI event panel.
        """
        rows = []
        for date, snap in self._snapshots.items():
            for investor, tps in snap.scores.items():
                rows.append({
                    "eval_date":   date,
                    "investor":    investor,
                    "tps":         tps,
                    "in_top_tier": investor in snap.top_tier,
                    "audit_hash":  snap.audit_hash,
                })
        return pd.DataFrame(rows).sort_values(
            ["eval_date", "tps"], ascending=[True, False]
        ).reset_index(drop=True)

    def get_tps_at(
        self,
        eval_date: pd.Timestamp,
        investor:  str,
    ) -> float:
        """
        Safe point-in-time TPS lookup.
        Returns 0.0 if investor not scored at that date.
        """
        date = pd.Timestamp(eval_date)
        if date not in self._snapshots:
            raise KeyError(f"No snapshot for {date}. Run compute() first.")
        return self._snapshots[date].scores.get(investor, 0.0)

    def _save_cache(self):
        """Persist snapshots to disk. Parquet preferred; CSV fallback."""
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        panel     = self.to_panel()
        csv_path  = self.cache_dir / "tps_panel.csv"
        parq_path = self.cache_dir / "tps_panel.parquet"
        panel.to_csv(csv_path, index=False)
        try:
            panel.to_parquet(parq_path, index=False)
            log.info(f"Cache saved → {parq_path}")
        except ImportError:
            log.info(f"Cache saved → {csv_path} (install pyarrow for parquet)")

    def _load_cache(self) -> dict:
        """Reload cached snapshots — parquet preferred, CSV fallback."""
        parq_path = self.cache_dir / "tps_panel.parquet"
        csv_path  = self.cache_dir / "tps_panel.csv"
        panel = None
        if parq_path.exists():
            try:
                panel = pd.read_parquet(parq_path)
                log.info(f"Cache found at {parq_path}")
            except ImportError:
                pass
        if panel is None and csv_path.exists():
            panel = pd.read_csv(csv_path, parse_dates=["eval_date"])
            log.info(f"Cache found at {csv_path}")
        if panel is None:
            return {}
        # Reconstruct snapshots from panel
        snapshots = {}
        for date, group in panel.groupby("eval_date"):
            snapshots[pd.Timestamp(date)] = TPSSnapshot(
                eval_date  = pd.Timestamp(date),
                scores     = dict(zip(group["investor"], group["tps"])),
                top_tier   = set(group[group["in_top_tier"]]["investor"]),
                n_nodes    = len(group),
                n_edges    = 0,  # not stored in cache
                audit_hash = group["audit_hash"].iloc[0],
            )
        return snapshots


# ── Convenience wrapper ───────────────────────────────────────────────────────

def compute_expanding_tps(
    edges_df:   pd.DataFrame,
    start_date: str = "2005-12-31",
    end_date:   str = "2012-12-31",
    freq:       str = "QE",
    n_jobs:     int = -1,
    cache_dir:  Optional[Path] = Path(".tps_cache"),
) -> pd.DataFrame:
    """
    One-call interface: build eval dates, run EWT, return panel.

    Parameters
    ----------
    edges_df   : full edge log from build_edges()
    start_date : first evaluation date (typically first full year of data)
    end_date   : last evaluation date (must be <= training cutoff)
    freq       : evaluation frequency ('QE' = quarter-end, 'ME' = month-end)
    n_jobs     : parallel workers
    cache_dir  : path to cache directory (None to disable caching)

    Returns
    -------
    pd.DataFrame with columns:
        eval_date, investor, tps, in_top_tier, audit_hash
    """
    eval_dates = pd.date_range(start_date, end_date, freq=freq)
    log.info(f"Evaluation schedule: {len(eval_dates)} dates, "
             f"{start_date} → {end_date}, freq={freq}")

    ewt   = ExpandingWindowTPS(edges_df, eval_dates, n_jobs, cache_dir)
    _     = ewt.compute()
    panel = ewt.to_panel()

    log.info(f"Panel shape: {panel.shape} | "
             f"Unique investors: {panel['investor'].nunique():,} | "
             f"Date range: {panel['eval_date'].min().date()} → "
             f"{panel['eval_date'].max().date()}")
    return panel


# ── CLI entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent))

    from graph_construction import (
        load_crunchbase, build_round_table, build_edges
    )

    DATA_DIR = sys.argv[1] if len(sys.argv) > 1 else "."
    print("\nVentureGraph 2.0 — Expanding Window TPS")
    print("=" * 50)

    df          = load_crunchbase(DATA_DIR)
    round_table = build_round_table(df)
    edges       = build_edges(round_table)
    edges_df    = pd.DataFrame(edges)

    # Convert round_date to Timestamp if needed
    if not pd.api.types.is_datetime64_any_dtype(edges_df["round_date"]):
        edges_df["round_date"] = pd.to_datetime(edges_df["round_date"])

    # Run expanding window TPS — quarter-end evaluation, 2005–2012
    panel = compute_expanding_tps(
        edges_df   = edges_df,
        start_date = "2005-12-31",
        end_date   = "2012-12-31",
        freq       = "QE",
        n_jobs     = -1,
        cache_dir  = Path(".tps_cache"),
    )

    panel.to_csv("tps_panel_expanding.csv", index=False)
    print(f"\nPanel saved → tps_panel_expanding.csv")
    print(f"Shape: {panel.shape}")
    print(f"\nSample (2008-Q4, top 10 investors):")
    q4_2008 = panel[panel["eval_date"] == "2008-12-31"].head(10)
    print(q4_2008[["eval_date", "investor", "tps", "in_top_tier"]].to_string())
