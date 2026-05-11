===========================================================================
    ____   ____             __                       ________                       __    
    \   \ /   /___   ____ _/  |_ __ _________  ____ /  _____/___________  ______ |  |__ 
     \   Y   // __ \ /    \   __\  |  \_  __ \/ __ \   \  __\_  __ \__  \ \____ \|  |  \
      \     /\  ___/|   |  \  | |  |  /|  | \/  ___/\    \_\  \  | \// __ \|  |_> >   Y  \
       \___/  \___  >___|  /__| |____/ |__|   \___  >\______  /__|  (____  /   __/|___|  /
                  \/     \/                       \/        \/           \/|__|        \/ 
    
    The Quartz & Obsidian Intelligence Suite — Version 2.0
    C-DE422 · Big Data Engineering II · Egypt University of Informatics
===========================================================================
Student : Mohamed Hares
Course  : C-DE422 (Big Data Engineering II)
Project : Identifying Temporal Precursor Investors in Co-Investment Networks
Due     : May 12, 2026
Bonus   : Submitted for the 5-mark Innovation Bonus (Smart Money Silence)
===========================================================================

1. OVERVIEW & INNOVATION STATEMENT
-----------------------------------
VentureGraph 2.0 is a complete graph-theoretic analytics suite that identifies
"Temporal Precursor Scores" (TPS) among venture capital firms to proxy
their prescience based on investment sequence, rather than sheer size or volume.

**The Innovation (5-Mark Bonus Consideration):**
Beyond standard link prediction, this project introduces "Smart Money Silence" (SMS),
an inverse link-prediction signal. SMS identifies when expected high-conviction 
deals *do not form*, acting as a powerful bearish indicator that structurally 
precedes sector underperformance.

2. DATASET ACCESS
-----------------
The primary dataset is the Crunchbase 2013 Snapshot (Kaggle):
  https://www.kaggle.com/datasets/arindam235/startup-investments-crunchbase

Download the following files and place them in the project root directory:
  - investments.csv
  - funding_rounds.csv
  - objects.csv

The remaining CSV files in the project root (edges.csv, tps_scores.csv,
community_partition.csv, link_predictions.csv, etc.) are pre-computed
pipeline outputs and do NOT need to be re-generated to run the dashboard.

3. REQUIREMENTS & QUICKSTART
-----------------------------
Prerequisites: Python 3.10+, Node.js 18+, 4GB RAM (Graph computation).

==> PYTHON PIPELINE (generates all analysis CSVs)

Step 1: Install Python Dependencies
    pip install -r requirements.txt

Step 2: Run Analytical Pipeline (in order)
    python graph_construction.py      # Part A core — builds edges.csv
    python tps.py                     # Part B scoring — TPS leaderboard
    python community_detection.py     # Part C/E communities
    python link_prediction.py         # Part D Link Prediction
    python sna_metrics.py             # Part A full metrics report
    python centrality_comparison.py   # Part B cross-measure comparison
    python sms_engine.py              # Bonus SMS scoring (Innovation)

    NOTE: All pre-computed CSV outputs are already included in the ZIP.
    You do NOT need to re-run the pipeline to launch the dashboard.

==> INTERACTIVE DASHBOARD (Part F — Next.js Web App)

Step 3: Install Node.js dependencies
    cd venturegraph-web
    npm install

Step 4: Launch the dashboard
    npm run dev

    Dashboard accessible at: http://localhost:3000

    The dashboard reads pre-computed CSVs from the parent directory (../),
    so it must be launched from within the venturegraph-web/ folder inside
    the project root. No additional configuration is required.

4. DASHBOARD MODULE GUIDE
--------------------------
The Next.js dashboard (venturegraph-web/) has 5 analytical floors / 22 modules:

>>> FLOOR 2 — DEEP ANALYSIS (C-DE422 Core) <<<
    - Network Navigator (Part A + B):
        Graph stats, centrality leaders (4 measures), degree distribution,
        interactive force-graph with zoom/pan/hover, community color coding
    - Community Explorer (Part C):
        Louvain 35-community breakdown, color-coded bar charts,
        size × TPS scatter, full community profile table

>>> FLOOR 3 — SIGNAL ENGINE <<<
    - Link Prediction (Part D):
        Common Neighbors, Adamic-Adar, TPS-AA hybrid
        with method comparison and top-15 predictions per method
    - SMS Engine (Innovation):
        Smart Money Silence panel with multi-sector time series
        and alpha lead-lag correlation table

>>> FLOOR 4 — TRUST & AUDIT <<<
    - Audit Vault: SHA-256 receipt generation for every signal run

5. C-DE422 COMPLIANCE MAP
--------------------------
[check] Part A: Network Metrics       -> sna_metrics.py + Network Navigator (Floor 2)
                                         (nodes, edges, density, diameter, clustering,
                                          degree distribution, connected components)
[check] Part B: Centrality (4 mesr.)  -> centrality_comparison.py + Network Navigator
                                         (degree, betweenness, eigenvector, TPS)
                                         Top-5 named per measure in REPORT.md §4.1
[check] Part C: Community Detection   -> community_detection.py + Community Explorer
                                         35 communities, Q=0.473, sizes in REPORT.md §3.3
[check] Part D: Advanced Analysis     -> link_prediction.py + Link Prediction module
                                         (Common Neighbors + Adamic-Adar + TPS-AA hybrid)
[check] Part E: Visualizations (6+)   -> centrality_comparison.png, community_graph.png,
                                          community_profiles.png, community_stage_mix.png,
                                          tps_ranking.png, tps_scatter.png,
                                          link_prediction_top.png, link_prediction_scatter.png
[check] Part F: Interactive Dashboard -> venturegraph-web/ (Next.js, npm run dev)
                                         Loads data, runs centrality + community interactively,
                                         zoom/pan/hover network graph, stats summary panel
[check] Written Report (8-12 pp)      -> REPORT.md / submission/VentureGraph_REPORT.pdf
[check] Code Quality + requirements   -> requirements.txt + well-commented .py files
[check] 5-Mark Innovation Bonus       -> SMS (inverse link prediction) + SHA-256 protocol

6. KEY FILES
------------
  Python Pipeline:
    graph_construction.py    <- Part A core graph builder
    tps.py                   <- Part B TPS scoring
    community_detection.py   <- Part C Louvain detection
    link_prediction.py       <- Part D CN / AA / TPS-AA methods
    sna_metrics.py           <- Part A full metrics report
    centrality_comparison.py <- Part B cross-measure table
    sms_engine.py            <- Innovation: SMS signal engine
    preregistration.py       <- Pre-registered protocol (SHA-256 sealed)
    requirements.txt         <- Python dependencies

  Interactive Dashboard:
    venturegraph-web/        <- Next.js 16 app (Part F)
    venturegraph-web/package.json <- Node.js dependencies

  Reports:
    REPORT.md                <- Main written report (9 sections)
    methodology_appendix.md  <- Full pipeline methodology
    paper_abstract.md        <- SSRN-ready abstract

  Data Augmentation Pipeline (Innovation — resolves statistical power gap):
    scraper_edgar.py             <- SEC EDGAR Form D scraper
    scraper_magnitt.py           <- MAGNiTT / MENA press parser
    scraper_companies_house.py   <- UK Companies House REST API scraper
    scraper_bundesanzeiger.py    <- German Federal Gazette scraper
    entity_matcher.py            <- Cross-source entity de-duplication
    run_augmented_pipeline.py    <- Master orchestrator (scrape → match → recompute)

  Augmented Pipeline Results (data_augmented/):
    combined_objects.csv         <- 462,825 merged entities
    combined_investments.csv     <- 80,800 investment links
    combined_funding_rounds.csv  <- 53,979 funding rounds
    augmented_edges.csv          <- 28,998 graph edges (7.5× original)
    augmented_tps_scores.csv     <- 3,069 TPS-scored investors
    augmented_sms_scores.csv     <- 808 SMS candidates (10.6× original)
    power_analysis.json          <- Statistical power: 74% → 100%
    pipeline_report.json         <- Full execution audit

  To re-run the augmented pipeline:
    python run_augmented_pipeline.py --full --ch-api-key YOUR_KEY
    (Takes ~30 min; requires internet access for SEC EDGAR + Companies House)

  Pre-computed pipeline outputs (included — no need to regenerate):
    edges.csv, tps_scores.csv, community_partition.csv, community_summary.csv
    centrality_comparison.csv, link_predictions.csv, sms_scores.csv
    sms_alpha_correlation.csv, sector_alphas.csv

  SSRN Research Paper:
    venturegraph_ssrn_paper.md   <- Full 20-25 page paper (8 sections + appendices)

===========================================================================
"In a market where every fund has access to the same public data, the
information advantage belongs to whoever asks the right structural 
question first. Sequence — not volume — is that question."
===========================================================================
