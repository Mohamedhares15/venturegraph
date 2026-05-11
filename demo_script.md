# Presentation Demo Script — 10 minutes
## VentureGraph 2.0 · Mohamed Hares · C-DE422

---

## Pre-flight checklist (do 15 minutes before presenting)

- [ ] `streamlit run app.py` running locally — browser open, full screen
- [ ] Sidebar visible · Sovereign Mode toggle tested once
- [ ] `REPORT.md` open in a second tab (as backup)
- [ ] `methodology_appendix.md` open in a third tab
- [ ] PDF export of `REPORT.md` saved to desktop (backup if laptop crashes)
- [ ] Presentation slides open in presenter view (15-second transitions memorized)
- [ ] Phone on silent · water bottle on table · timer on watch

---

## The 10-minute walkthrough

**Timing budget:**
- Intro & problem:    1:00
- Data & graph:       1:00
- TPS & centrality:   1:00
- Communities:        0:45
- SMS innovation:     2:00
- Empirical test:     1:30
- Dashboard demo:     2:00
- Conclusion:         0:45

---

### 00:00 – 01:00 · The Opening Hook

> *"Good morning / afternoon. My project, VentureGraph 2.0, asks one question that every paper in this literature has asked backwards."*
>
> *"Every classical link-prediction method — Adamic-Adar, Common Neighbours, Katz — scores edges that are **likely to form**. That is the entire literature since Liben-Nowell and Kleinberg in 2007."*
>
> *"My contribution inverts it. I score edges **that were expected to form but deliberately did not**. In venture capital, when a top-tier investor leads a Series A and then sits out the Series B, that absence is **structural**. I call this Smart Money Silence, and I'll show you that it is — conceptually at least — a new class of financial signal."*

**[Click to Slide 2 — The Question]**

---

### 01:00 – 02:00 · The Data & the Graph

**[Click to Slide 3 — Dataset]**

> *"Everything sits on the public Crunchbase 2013 snapshot — 12,419 Series A/B investment rows, 3,548 companies, 4,035 investors across five sectors. Directed graph: edge A-to-B exists on company X only if A invested in an earlier round than B. Weight decays exponentially with time, lambda equals 0.3."*
>
> *"After pruning — 1,101 nodes, 3,870 edges. Density 0.0032, clustering 0.51. That's a classical sparse-network-with-strong-local-cliques pattern."*

**[Point to the 3D topology on the dashboard if visible — quick glance]**

---

### 02:00 – 03:00 · TPS vs. Classical Centrality

**[Click to Slide 4 — Three Constructs, then Slide 5 — Centrality Comparison]**

> *"First novel construct: Temporal Precursor Score — TPS. Volume-independent prescience. An investor with one deal where they preceded Sequoia has a higher TPS than an investor with ten deals where they followed everyone."*
>
> *"Rank correlation between TPS and weighted out-degree is 0.31 — low. That matters. It means **TPS measures something classical centrality misses entirely**: not how prominent an investor is, but whether they get there first."*

---

### 03:00 – 03:45 · Louvain Communities

**[Click to Slide 6 — Communities]**

> *"Louvain partitioning gave 35 communities, modularity 0.473 — well above the 0.30 threshold for meaningful structure. The largest community is 361 seed-stage syndicators — SV Angel, First Round Capital, Ron Conway. The Kleiner-Perkins/Benchmark/Index cluster has much lower mean TPS but much higher in-degree — they're the **elite follow-on**, the targets prescient investors aim to precede."*
>
> *"This is a clean separation of 'scouts' and 'follow-on capital' that emerged from the data without seeding it."*

---

### 03:45 – 05:45 · The Innovation — Smart Money Silence

**[Click to Slide 7 — The Innovation]**

> *"Here is the 5-mark bonus contribution. Smart Money Silence. The construction has five steps — they are in `sms_engine.py`, lines 283 to 410."*
>
> *"Step 1: at evaluation date t, identify the top-30% of investors by TPS at that date. That's the prescient set."*
> *"Step 2: for each Series A in the prior 12 months, find which of those top-tier investors led."*
> *"Step 3: for each matched Series B in the prior 3 months, find which top-tier investors actually followed."*
> *"Step 4: the silence is the set difference — **top-tier investors who led the A but did not show up to the B**."*
> *"Step 5: aggregate by sector and quarter."*
>
> *"What I want the committee to see is that this is **not an extension of Lü-Zhou 2011. It is an inversion of it.** Every prior link-prediction paper I am aware of treats edge formation as the signal. This paper treats edge absence as the signal. That is the conceptual contribution."*

**[Click to Slide 8 — The Bridge]**

> *"To test whether it works, I bridge to public equity. FF5 rolling alpha per sector ETF, forward-aligned at five horizons, panel regression with sector and time fixed effects, two-way clustered standard errors, wild-cluster bootstrap. All hyperparameters SHA-256 locked **before** any back-test — that file is `preregistration.py`."*

---

### 05:45 – 07:15 · The Honest Empirical Result

**[Click to Slide 9 — The Empirical Result]**

> *"And here is where I am going to be more honest than most student papers would be."*
>
> *"H3 — the pre-registered hypothesis that elevated SMS forecasts negative alpha — is **not rejected by the null**. Across five horizons, p-values range from 0.61 to 0.90. Correlation signs reverse. At k=12 and k=24 the sign is negative as predicted; at k=6, 18, 36 the sign is positive — counter-directional."*
>
> *"I ran a post-hoc power analysis. With the observed effect size of |r| ≈ 0.06, detecting it at alpha 0.05 and 80% power requires **n ≈ 2,170 observations**. I have 35 to 76 per horizon. The study is under-powered by a factor of 30."*
>
> *"This is what the pipeline produced. I report it honestly."*

**[Click to Slide 10 — Why the Null Matters]**

> *"The methodological contribution is independent of this null. The framework works — it produces clean, reproducible, audit-hashed numbers. Any researcher with access to WRDS VentureXpert or Magnitt MENA can run it on n ≥ 500 per horizon and decide the question. **That is the deliverable.** The null says: 'this dataset is too small', not 'the construct is wrong.'"*

---

### 07:15 – 09:15 · The Live Dashboard (Part F)

**[ALT-TAB to running Streamlit · start in Academic Mode]**

> *"Now the Part F deliverable. This is `app.py` — one codebase, two modes. Academic Mode is what you see now."*

**[Scroll to the 3D topology, rotate once with mouse]**
> *"3D topology of the top-150-by-out-degree subgraph. Spring layout, nodes sized by out-degree."*

**[Scroll to centrality scatter]**
> *"The prescience-versus-volume scatter we just discussed."*

**[Scroll to SMS Innovation panel]**
> *"This is the panel showing the **real** pipeline output — not the fabricated version some dashboards put in these panels. Here's the correlation table from `sms_alpha_correlation.csv` directly. Honest disclosure inline: null result, p-values 0.61–0.90, methodology contribution stands independent."*

**[Scroll to 10x quant terminal]**
> *"Part D extra credit — ten quantitative modules: percolation stress test, k-core elite syndicate, spectral gap, dynamic PageRank slider, clique detection."*

**[Now switch to Sovereign Mode via sidebar toggle]**

> *"And here is where the project points forward. Sovereign Mode is the prototype of what the framework becomes when deployed for a sovereign wealth fund compliance use case. The Audit Vault shows live SHA-256 hashes per signal. The Frozen Protocol Viewer renders `preregistration.py` as a governance-style UI. The pricing calculator and investor-memo generator demonstrate the commercial direction the future-work §8 describes."*

> *"This is not a product pitch. It is the research framework shown in its deployment-ready form."*

**[ALT-TAB back to slides]**

---

### 09:15 – 10:00 · Conclusion

**[Click to Slide 12 — Conclusion]**

> *"To close: all six briefed parts delivered, the 5-mark bonus contribution is a genuinely novel inverse link-prediction signal with full pre-registered evaluation machinery, the empirical H3 test is null in this sample and reported honestly, and the dashboard demonstrates both the academic submission and a clear forward path."*
>
> *"The methodology stack — TPS, SMS, SHA-256 pre-registration, expanding-window firewall, two-way clustered panel regression — is reproducible, documented in `methodology_appendix.md`, and ready for replication on any larger dataset."*
>
> *"Happy to take questions."*

---

## After-demo reset checklist

- [ ] Leave laptop open at the **SSRN paper_abstract.md** page (strong closing visual)
- [ ] Have the pre-registration SHA-256 hash ready to show on request
- [ ] Have 1 backup sentence ready if the dashboard crashes: *"The pipeline CSVs are all on disk — let me show the raw `sms_scores.csv` in Excel instead."*

---

## If you run short of time (→ cut these first, in order)

1. **Cut first:** the Louvain community slide (0:45 saved) — mention in passing
2. **Cut second:** the 10× quant terminal tour in the dashboard (0:45 saved)
3. **Cut third:** the Sovereign Mode demo (cut to 20 seconds: just show the toggle exists, don't explore)

**Never cut:** the SMS construction, the honest null, the methodology framing.

---

## If you run long (→ expand these, in order)

1. **Expand first:** the centrality rank-divergence table (`centrality_comparison.csv:rank_divergence` column) — shows specific investor-name examples
2. **Expand second:** the community `community_summary.csv` — walk through 2–3 communities with names
3. **Expand third:** the 10× quant terminal — run the percolation stress test live

---

*Practice this script aloud at least twice before presenting. First time with a timer, second time in front of a mirror. If any sentence feels awkward in your own voice, rewrite it.*
