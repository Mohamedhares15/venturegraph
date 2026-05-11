# VentureGraph 2.0 — One-Page Handout

**Mohamed Hares** · C-DE422 Big Data Engineering II · Egypt University of Informatics · 12 May 2026
*Identifying Temporal Precursor Investors & Smart Money Silence in Co-Investment Networks*

---

## The Question

Classical link prediction scores edges that **form**. This project scores edges that were **expected to form but did not** — and tests whether that absence predicts public-market sector returns.

## The Data

Crunchbase 2013 snapshot · **12,419 investments · 3,548 companies · 4,035 investors · 5 sectors** · 2000–2013.
Directed, time-weighted co-investment graph. Pruned: **1,101 nodes · 3,870 edges** · density 0.0032 · clustering 0.5147.

## The Three Novel Constructs

| Construct | Formula | What it measures | File |
|---|---|---|---|
| **TPS** — Temporal Precursor Score | $\frac{1}{\|\text{portfolio}\|} \sum_c \sum_{B \in \mathcal{T}} w(A\to B,c) \cdot \text{rank}^{-1}(B)$ | Prescience (volume-independent) | `tps.py` |
| **SSI** — Swarm Signal Intensity | TPS-weighted rolling new-entrant inflow | Prescient capital inflow | `compute_ssi.py` |
| **SMS** — Smart Money Silence 🌟 | rate at which top-30% TPS Series A investors **decline** to follow-on to Series B | Structural absence as signal | `sms_engine.py` |

🌟 = **primary innovation** for the 5-mark bonus. First operationalization of **inverse link prediction** as a financial signal, extending Lü–Zhou (2011).

## The Findings

- **TPS ≠ classical centrality:** rank correlation with out-degree ρ ≈ 0.31 (low).
- **Louvain communities:** 35 partitions, Q = 0.473 — clean separation of "seed scouts" from "elite follow-on."
- **H3 empirical test** (pre-registered): SMS → FF5 sector alpha.

| Horizon | Pearson *r* | p-value | n |
|---|---|---|---|
| k=6 | +0.023 | 0.90 | 35 |
| k=12 | **−0.036** | 0.77 | 73 |
| k=18 | +0.045 | 0.79 | 37 |
| k=24 | **−0.060** | 0.61 | 76 |
| k=36 | +0.047 | 0.70 | 67 |

**Honest finding:** H3 is not rejected by the null. Power analysis → needs n ≈ 2,170 (30× larger). The *methodological* contribution is the deliverable; empirical resolution is explicit future work.

## The Audit Infrastructure (rare even in peer-reviewed finance)

- **Pre-registered protocol** (`preregistration.py`): SHA-256-locked hyperparameters + hypotheses + robustness tests before any back-test.
- **Expanding-window firewall** (`expanding_window_tps.py`): per-snapshot SHA-256 audit, prevents look-ahead contamination.
- **Two-way clustered SE** (Cameron-Gelbach-Miller) · **wild-cluster bootstrap** (Rademacher, n=999) · **placebo permutation**.

## The Dashboard (Part F)

`streamlit run app.py` · Two modes: **Academic** (submission) · **Sovereign** (commercial-direction prototype).
10 interactive quant modules: percolation stress, k-core, spectral gap, dynamic PageRank, Adamic-Adar, Shannon entropy, clique detection, assortativity, triadic closure, information arbitrage.

## The Deliverables Map (C-DE422 Brief Compliance)

| Brief | File | Status |
|---|---|---|
| Part A — Network statistics | `graph_construction.py`, `sna_metrics.py` | ✓ |
| Part B — Centrality | `tps.py`, `centrality_comparison.py` | ✓ |
| Part C — Community | `community_detection.py` | ✓ |
| Part D — Advanced analysis | `link_prediction.py`, `sms_engine.py` 🌟 | ✓ |
| Part E — Visualizations | 9 PNGs | ✓ |
| Part F — Dashboard | `app.py` (dual-mode) | ✓ |
| Report | `REPORT.md` + `methodology_appendix.md` | ✓ |
| Bonus (5 marks) | SMS + pre-registration + audit stack | ✓ |

---

**Code:** `github.com/mohamedhares/venturegraph` *(publishing)* · **Paper draft:** `paper_abstract.md` · **Contact:** mohamed.hares@eui.edu.eg
