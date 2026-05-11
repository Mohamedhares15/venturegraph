import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Methodology Library · VentureGraph Sovereign" };

interface Formula {
  name: string;
  symbol: string;
  formula: string;
  description: string;
  validation: string;
  limitations: string;
}

const FORMULAS: Formula[] = [
  {
    name: "Trend-Prescience Score",
    symbol: "TPS",
    formula: "TPS_i = (1/N_i) × Σ_k w_k × exit_k,  w_k = 1/(t_exit − t_invest + 1)",
    description: "Measures an investor's historical ability to invest early in companies that later exit. Time-weighted: earlier investments in eventually-exiting companies score higher.",
    validation: "Point-in-time safe — uses only information available at each evaluation date. Robust to winsorisation at 1st/99th percentile.",
    limitations: "Only captures exit-based performance; does not account for mark-to-market returns. Biased toward investors with longer track records.",
  },
  {
    name: "Smart Money Silence",
    symbol: "SMS",
    formula: "SMS_s,t = −(TPS̄_active − TPS̄_silent) × log(n_silent + 1)",
    description: "Quantifies the bearish signal when high-TPS investors stop investing in a sector. Negative SMS suggests smart money is withdrawing — a potential leading indicator of underperformance.",
    validation: "Correlated with subsequent ETF alpha at K=3,6,12,24 month horizons. Pre-registered hypothesis (H3).",
    limitations: "Requires sufficient investor activity per sector per period. Sparse sectors may produce noisy scores.",
  },
  {
    name: "Smart Silence Index",
    symbol: "SSI",
    formula: "SSI_s,t = n_silent_top / n_total_top",
    description: "The fraction of top-TPS investors who are silent (not investing) in sector s at time t. Higher SSI means more smart money has withdrawn.",
    validation: "Monotonic relationship with SMS. Simpler to interpret as a percentage.",
    limitations: "Binary classification of active/silent may miss gradations of activity reduction.",
  },
  {
    name: "Eigenvector Centrality",
    symbol: "C_eig",
    formula: "C_eig(i) = (1/λ) × Σ_j A_ij × C_eig(j)",
    description: "Measures how connected an investor is to other well-connected investors. High eigenvector centrality indicates access to premium deal flow networks.",
    validation: "Converges for strongly connected components. Computed via NetworkX power iteration.",
    limitations: "Localisation in disconnected components. May assign zero to peripheral nodes.",
  },
  {
    name: "Betweenness Centrality",
    symbol: "C_bet",
    formula: "C_bet(i) = Σ_{s≠i≠t} σ_st(i) / σ_st",
    description: "Counts how often an investor lies on shortest paths between other investor pairs. High betweenness indicates bridge/broker positions in the network.",
    validation: "Brandes' algorithm, normalised. O(VE) complexity.",
    limitations: "Sensitive to graph size; may be skewed by structural holes.",
  },
  {
    name: "Louvain Modularity",
    symbol: "Q",
    formula: "Q = (1/2m) × Σ_ij [A_ij − k_i×k_j/(2m)] × δ(c_i, c_j)",
    description: "Optimised by the Louvain algorithm to detect community structure. Higher Q indicates stronger community separation.",
    validation: "Resolution parameter γ = 1.0 (default). Reproducible with fixed random seed.",
    limitations: "Resolution limit — may miss very small communities. Non-deterministic ordering.",
  },
  {
    name: "Jaccard Coefficient (Link Prediction)",
    symbol: "J",
    formula: "J(u,v) = |Γ(u) ∩ Γ(v)| / |Γ(u) ∪ Γ(v)|",
    description: "Predicts future co-investment links based on shared portfolio companies. Investors with similar portfolios are more likely to co-invest.",
    validation: "Standard link prediction baseline. AUC evaluated on time-split hold-out set.",
    limitations: "Ignores temporal dynamics. Works best for active investors with large portfolios.",
  },
  {
    name: "Adamic-Adar Index (Link Prediction)",
    symbol: "AA",
    formula: "AA(u,v) = Σ_{w ∈ Γ(u) ∩ Γ(v)} 1 / log(|Γ(w)|)",
    description: "Similar to Jaccard but weights shared neighbours by their rarity. Co-investments through niche companies score higher.",
    validation: "Typically outperforms Jaccard in sparse graphs.",
    limitations: "Undefined for isolated nodes. Requires connected common neighbours.",
  },
  {
    name: "Cohen's d Effect Size",
    symbol: "d",
    formula: "d = (μ₁ − μ₂) / s_pooled",
    description: "Standardised difference between two group means. Used in power analysis to determine required sample size for H3.",
    validation: "d = 0.15 (small) assumed a priori. Validated post-augmentation.",
    limitations: "Assumes normally distributed outcomes. Sensitive to outliers in small samples.",
  },
];

export default function MethodologyLibraryPage() {
  const m = moduleBySlug("methodology-library")!;

  return (
    <div className="sov-fade-up">
      <ModuleHero num={m.num} floor="FLOOR 05 · REGIONAL & META" title={m.title} tagline={m.tagline}
        actions={<><StatusPill variant="ok"><span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />Live</StatusPill><StatusPill>{m.id}</StatusPill></>}>
        {m.description}
      </ModuleHero>

      <div className="space-y-4 mb-8">
        {FORMULAS.map((f) => (
          <Card key={f.symbol} className="!p-0 overflow-hidden">
            <div className="flex">
              <div className="w-20 flex-shrink-0 bg-ink-900 flex items-center justify-center">
                <span className="font-mono font-bold text-gold-400 text-base">{f.symbol}</span>
              </div>
              <div className="flex-1 p-5">
                <h3 className="text-[1.05rem] font-bold text-ink-900 mb-1">{f.name}</h3>
                <div className="bg-paper-100 border border-ink-100 rounded-md p-3 font-mono text-[0.82rem] text-ink-700 mb-3">
                  {f.formula}
                </div>
                <p className="text-[0.88rem] text-ink-600 mb-3">{f.description}</p>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <CardLabel className="!text-ok-700 mb-1">Validation</CardLabel>
                    <p className="text-[0.8rem] text-ink-500">{f.validation}</p>
                  </div>
                  <div>
                    <CardLabel className="!text-warn-700 mb-1">Limitations</CardLabel>
                    <p className="text-[0.8rem] text-ink-500">{f.limitations}</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Section label="References" title="Key academic sources">
        <Card className="!p-5">
          <ul className="space-y-2 text-[0.85rem] text-ink-600">
            <li>• Blondel, V. D., et al. (2008). "Fast unfolding of communities in large networks." <em>JSTAT</em>.</li>
            <li>• Brandes, U. (2001). "A faster algorithm for betweenness centrality." <em>J. Mathematical Sociology</em>.</li>
            <li>• Liben-Nowell, D. & Kleinberg, J. (2007). "The link-prediction problem for social networks." <em>JASIST</em>.</li>
            <li>• Newman, M. E. J. (2010). <em>Networks: An Introduction</em>. Oxford University Press.</li>
            <li>• Hochberg, Y. V., Ljungqvist, A. & Lu, Y. (2007). "Whom You Know Matters." <em>J. Finance</em>.</li>
            <li>• Cohen, J. (1988). <em>Statistical Power Analysis for the Behavioral Sciences</em>. Routledge.</li>
          </ul>
        </Card>
      </Section>
    </div>
  );
}
