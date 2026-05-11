// Module registry — single source of truth for navigation & landing-page architecture.
// Mirrors sovereign_mode.py's _MODULE_REGISTRY but with rich metadata for the new UI.

export type Floor = "F0" | "F1" | "F2" | "F3" | "F4" | "F5";

export interface ModuleEntry {
  id: string;
  slug: string;
  num: string;
  title: string;
  shortTitle: string;
  floor: Floor;
  status: "live" | "preview" | "soon";
  icon: string; // lucide-react icon name
  tagline: string;
  description: string;
}

export interface FloorEntry {
  key: Floor;
  num: string;
  name: string;
  tagline: string;
  modules: ModuleEntry[];
}

export const MODULES: ModuleEntry[] = [
  // Floor 0 · Live Engine
  {
    id:          "M00",
    slug:        "pulse",
    num:         "00",
    title:       "Live Pulse",
    shortTitle:  "Live Pulse",
    floor:       "F0",
    status:      "live",
    icon:        "Activity",
    tagline:     "Real-time signals · live deal flow · market benchmarked.",
    description:
      "Continuously-running early-warning engine. Live deal flow every 15 min. " +
      "Signal issuance every 6 h. Daily market benchmarking. Every signal SHA-256 sealed " +
      "and publicly verifiable before the market outcome exists.",
  },
  {
    id:          "M00T",
    slug:        "pulse/track-record",
    num:         "00T",
    title:       "Lead-Time Track Record",
    shortTitle:  "Track Record",
    floor:       "F0",
    status:      "live",
    icon:        "BarChart2",
    tagline:     "All signals vs actual market moves — public lead-time proof.",
    description:
      "Every sealed signal versus its ETF outcome at T+30/60/90/180/360 days. " +
      "Independently verifiable: receipt timestamp vs free market data.",
  },

  // Floor 1 · Workflow
  {
    id: "M01",
    slug: "portfolio-x-ray",
    num: "01",
    title: "Portfolio X-Ray",
    shortTitle: "Portfolio X-Ray",
    floor: "F1",
    status: "live",
    icon: "Crosshair",
    tagline: "Audit-grade triage of any institutional portfolio.",
    description:
      "Paste a list of GP names. The platform fuzzy-matches them to the universe, then aggregates prescience, sector exposure, community concentration, and exit realisation — all with a cryptographic receipt.",
  },
  {
    id: "M03",
    slug: "multi-sector-dashboard",
    num: "03",
    title: "Multi-Sector Dashboard",
    shortTitle: "Multi-Sector",
    floor: "F1",
    status: "live",
    icon: "LayoutGrid",
    tagline: "Five sectors, one decision surface.",
    description:
      "Compare SMS / SSI / FF5 alpha across the entire ETF basket simultaneously, with a sector × quarter heatmap.",
  },
  {
    id: "M02",
    slug: "intelligence-feed",
    num: "02",
    title: "Live Intelligence Feed",
    shortTitle: "Intel Feed",
    floor: "F1",
    status: "live",
    icon: "Activity",
    tagline: "Real-time SMS / SSI / α event stream.",
    description:
      "Severity-ranked stream of silence events, smart-money influx, and alpha breakouts — every entry traceable to its source CSV.",
  },
  {
    id: "M04",
    slug: "saved-workspaces",
    num: "04",
    title: "Saved Workspaces",
    shortTitle: "Workspaces",
    floor: "F1",
    status: "live",
    icon: "Save",
    tagline: "Hash-sealed analyst sessions.",
    description:
      "Export current state (portfolio, signal weights, focus filters) to a hash-sealed JSON; import to resume any prior workspace.",
  },

  // Floor 2 · Deep Analysis
  {
    id: "M06",
    slug: "investor-deep-dive",
    num: "06",
    title: "Investor Deep-Dive",
    shortTitle: "Investor",
    floor: "F2",
    status: "live",
    icon: "Search",
    tagline: "Nine-layer profile of any GP in the universe.",
    description:
      "TPS time-series, sector posture, co-investor graph, full portfolio + realised exits, percentile ranks, and a sealed compliance receipt.",
  },
  {
    id: "M07",
    slug: "sector-deep-dive",
    num: "07",
    title: "Sector Deep-Dive",
    shortTitle: "Sector",
    floor: "F2",
    status: "live",
    icon: "BarChart3",
    tagline: "End-to-end view of an ETF-mapped sector.",
    description:
      "Top investors, SMS/SSI/alpha overlay, deal flow, stage distribution, and exit panel — for any of five flagship sectors.",
  },
  {
    id: "M08",
    slug: "network-navigator",
    num: "08",
    title: "Network Navigator",
    shortTitle: "Network",
    floor: "F2",
    status: "live",
    icon: "Share2",
    tagline: "Co-investment graph, centrality, ego networks.",
    description:
      "Browse the directed co-investment DiGraph: density, centrality leaders, degree distributions, ego-network drill-down.",
  },
  {
    id: "M07B",
    slug: "community-explorer",
    num: "07B",
    title: "Community Explorer",
    shortTitle: "Communities",
    floor: "F2",
    status: "live",
    icon: "Users",
    tagline: "Louvain-detected co-investor clusters.",
    description:
      "35 communities surfaced from the global graph: profile, members, sector & country signatures, mean TPS.",
  },

  // Floor 3 · Signal Engine
  {
    id: "M11",
    slug: "signal-composer",
    num: "11",
    title: "Multi-Signal Composer",
    shortTitle: "Composer",
    floor: "F3",
    status: "live",
    icon: "Sliders",
    tagline: "Custom z-score blends across five primitives.",
    description:
      "Tune weights for TPS, eigenvector, betweenness, community fit, and top-tier flag. Every recompute issues a fresh receipt.",
  },
  {
    id: "M13",
    slug: "derived-signals",
    num: "13",
    title: "Derived Signals",
    shortTitle: "Derived",
    floor: "F3",
    status: "live",
    icon: "Sparkles",
    tagline: "Six composite signals from the corpus.",
    description:
      "TPS momentum, SMS momentum, sector HHI, clustering proxy, sector velocity, prescience index — all point-in-time safe.",
  },
  {
    id: "M12",
    slug: "scenario-analyzer",
    num: "12",
    title: "Scenario Analyzer",
    shortTitle: "Scenarios",
    floor: "F3",
    status: "live",
    icon: "GitBranch",
    tagline: "Five macro stress-tests on any portfolio.",
    description:
      "Tech Winter, ESG Tilt, MENA Expansion, AI Super-Cycle, Liquidity Crunch — calibrated multipliers, audit-hashed runs.",
  },
  {
    id: "M0D",
    slug: "link-prediction",
    num: "D",
    title: "Link Prediction",
    shortTitle: "Link Predict",
    floor: "F3",
    status: "live",
    icon: "GitBranch",
    tagline: "Common Neighbors · Adamic-Adar · TPS-AA hybrid.",
    description:
      "Part D advanced analysis: three link-prediction methods on the co-investment graph, evaluated and compared. TPS-AA is the pre-registered novel contribution.",
  },
  {
    id: "M09",
    slug: "tps-engine",
    num: "09",
    title: "TPS Engine",
    shortTitle: "TPS",
    floor: "F3",
    status: "live",
    icon: "TrendingUp",
    tagline: "Trend-Prescience Score, fully decomposed.",
    description:
      "Formula, leaderboard, distribution, per-investor time-series across the expanding panel.",
  },
  {
    id: "M10",
    slug: "sms-engine",
    num: "10",
    title: "SMS Engine",
    shortTitle: "SMS",
    floor: "F3",
    status: "live",
    icon: "VolumeX",
    tagline: "Smart-Money Silence + SSI panel.",
    description:
      "Silence proportion, intensity, and α-correlation visualised across sectors and time, with full event drilldown.",
  },

  // Floor 4 · Trust & Audit
  {
    id: "M14",
    slug: "audit-vault",
    num: "14",
    title: "Audit Vault",
    shortTitle: "Audit Vault",
    floor: "F4",
    status: "live",
    icon: "ShieldCheck",
    tagline: "Tamper-evident receipts for every signal.",
    description:
      "Pick any sector × eval-date × signal type. The system issues a SHA-256 receipt binding protocol, inputs, outputs, and seal time.",
  },
  {
    id: "M15",
    slug: "compliance-verifier",
    num: "15",
    title: "Compliance Verifier",
    shortTitle: "Verifier",
    floor: "F4",
    status: "live",
    icon: "BadgeCheck",
    tagline: "Re-prove any historical receipt.",
    description:
      "Paste an old receipt hash, the system recomputes from current data. Match → certified. Mismatch → tamper-evident fail.",
  },
  {
    id: "M16",
    slug: "frozen-protocol",
    num: "16",
    title: "Frozen Protocol",
    shortTitle: "Protocol",
    floor: "F4",
    status: "live",
    icon: "FileLock",
    tagline: "The pre-registered scientific protocol.",
    description:
      "Hypotheses, fixed parameters, sealed datasets, robustness tests — all SHA-256 sealed before any back-test runs.",
  },
  {
    id: "M17",
    slug: "data-lineage",
    num: "17",
    title: "Data Lineage",
    shortTitle: "Lineage",
    floor: "F4",
    status: "live",
    icon: "Network",
    tagline: "Raw → pipeline → dashboard, hash-verified.",
    description:
      "Every CSV, every transformation, every output — hashed live. Tamper anywhere and the chain breaks.",
  },

  // Floor 5 · Regional / Commercial / Meta
  {
    id: "M18",
    slug: "mena-pulse",
    num: "18",
    title: "MENA Pulse",
    shortTitle: "MENA",
    floor: "F5",
    status: "live",
    icon: "Globe",
    tagline: "Regional view of the GCC + Levant.",
    description:
      "MENA-HQ companies, GCC-only slice, country breakdowns, MENA-active investors, and realised regional exits.",
  },
  {
    id: "M19",
    slug: "ic-pack-generator",
    num: "19",
    title: "IC Pack Generator",
    shortTitle: "IC Pack",
    floor: "F5",
    status: "live",
    icon: "FileText",
    tagline: "One-click investment-committee memo.",
    description:
      "Generates a fully-formatted HTML / PDF memo for any sector, with hash-receipt footer and methodology appendix.",
  },
  {
    id: "M21",
    slug: "pricing-roi",
    num: "21",
    title: "Pricing & ROI",
    shortTitle: "Pricing",
    floor: "F5",
    status: "live",
    icon: "Calculator",
    tagline: "Tier model + break-even maths.",
    description:
      "Six institutional tiers, transparent ACV bands, illustrative ROI vs. Pitchbook + alternative-data baselines.",
  },
  {
    id: "M22",
    slug: "sovereign-story",
    num: "22",
    title: "Sovereign Story",
    shortTitle: "Story",
    floor: "F5",
    status: "live",
    icon: "Landmark",
    tagline: "Why this exists. Six-step narrative.",
    description:
      "The full thesis from regulator-trust to MENA expansion — readable as a single scrolling page.",
  },
  {
    id: "M20",
    slug: "methodology-library",
    num: "20",
    title: "Methodology Library",
    shortTitle: "Methodology",
    floor: "F5",
    status: "live",
    icon: "BookOpen",
    tagline: "Reference for every formula in the platform.",
    description:
      "TPS, SMS, SSI, composite, prescience, HHI, centrality — all defined with formula, validation, and limitations.",
  },
  {
    id: "M23",
    slug: "information-diffusion",
    num: "23",
    title: "Information Diffusion",
    shortTitle: "Diffusion",
    floor: "F3",
    status: "live",
    icon: "Radio",
    tagline: "IC, LT, SIR/SIS cascade simulations on the co-investment graph.",
    description:
      "Simulate Independent Cascade, Linear Threshold, and epidemic spreading models. Run influence maximization with greedy seed selection.",
  },
  {
    id: "M24",
    slug: "project-presentation",
    num: "24",
    title: "Project Presentation",
    shortTitle: "Presentation",
    floor: "F5",
    status: "live",
    icon: "Presentation",
    tagline: "All project requirements in one scrollable view.",
    description:
      "Parts A–F of the rubric: graph construction, centrality, community detection, advanced analysis, visualizations, and dashboard — all on one page for presenting.",
  },
];

export const FLOORS: FloorEntry[] = [
  {
    key: "F0",
    num: "00",
    name: "Live Engine",
    tagline: "Real-time signals, deal flow, and market-benchmarked lead times.",
    modules: MODULES.filter((m) => m.floor === "F0"),
  },
  {
    key: "F1",
    num: "01",
    name: "Workflow",
    tagline: "The analyst's daily-use surface.",
    modules: MODULES.filter((m) => m.floor === "F1"),
  },
  {
    key: "F2",
    num: "02",
    name: "Deep Analysis",
    tagline: "Drill-downs into investors, sectors, networks, and communities.",
    modules: MODULES.filter((m) => m.floor === "F2"),
  },
  {
    key: "F3",
    num: "03",
    name: "Signal Engine",
    tagline: "Composite scoring, derived signals, scenario stress-testing.",
    modules: MODULES.filter((m) => m.floor === "F3"),
  },
  {
    key: "F4",
    num: "04",
    name: "Trust & Audit",
    tagline: "Cryptographic receipts, protocol seal, verification chain.",
    modules: MODULES.filter((m) => m.floor === "F4"),
  },
  {
    key: "F5",
    num: "05",
    name: "Regional & Meta",
    tagline: "MENA, IC packs, commercials, methodology, story.",
    modules: MODULES.filter((m) => m.floor === "F5"),
  },
];

export function moduleBySlug(slug: string): ModuleEntry | undefined {
  return MODULES.find((m) => m.slug === slug);
}
