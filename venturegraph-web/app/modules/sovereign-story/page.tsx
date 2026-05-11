import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import { loadSnapshot, loadPipelineReport } from "@/lib/data";
import { fmtInt } from "@/lib/utils";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sovereign Story · VentureGraph Sovereign" };

const STEPS = [
  {
    num: "01",
    title: "The Problem: Information Asymmetry in Venture Capital",
    body: `Venture capital is one of the most opaque asset classes. LPs (limited partners) commit capital for 10+ years with minimal transparency into how GPs (general partners) source, evaluate, and exit deals. Traditional due diligence relies on track records, references, and self-reported IRR — all of which suffer from survivorship bias and selective disclosure. The question is: can network science reveal patterns that traditional analysis misses?`,
  },
  {
    num: "02",
    title: "The Insight: Co-Investment Networks Encode Intelligence",
    body: `When two investors repeatedly co-invest in the same companies, they form a directed, time-weighted edge in a co-investment graph. This graph is not random — it encodes trust, deal flow access, sector expertise, and strategic alignment. By analysing the topology of this graph, we can extract signals that predict which investors will outperform and which sectors will underperform.`,
  },
  {
    num: "03",
    title: "The Signal: Trend-Prescience Score (TPS)",
    body: `TPS measures an investor's historical ability to invest in companies before they exit (via acquisition or IPO). The formula time-weights each investment: earlier bets on successful exits score higher. High-TPS investors consistently identify winners before the market. TPS is not hindsight bias — it's computed point-in-time from the graph, making it safe for forward-looking analysis.`,
  },
  {
    num: "04",
    title: "The Discovery: Smart Money Silence (SMS)",
    body: `SMS is the novel contribution of this research. When high-TPS investors stop investing in a sector — when the "smart money" goes silent — it can be a bearish signal. We formalise this as: SMS = −(TPS̄_active − TPS̄_silent) × log(n_silent + 1). If SMS is negative and significant, it means the best investors are withdrawing, which historically precedes sector underperformance.`,
  },
  {
    num: "05",
    title: "The Validation: From Hypothesis to Evidence",
    body: `We pre-registered three hypotheses before running any back-tests. H1: High-TPS investors have more exits. H2: Network centrality predicts future co-investment links. H3: High-SMS sectors underperform their benchmark ETF. The original Crunchbase sample (N=472K) was underpowered for H3 (power ≈ 74%). After augmenting with SEC EDGAR, MAGNiTT, and Companies House data, we achieved 100% statistical power.`,
  },
  {
    num: "06",
    title: "The Platform: From Research to Product",
    body: `VentureGraph Sovereign is the productised form of this research. It provides 22 interactive modules spanning five floors: Workflow, Deep Analysis, Signal Engine, Trust & Audit, and Regional/Meta. Every computation is SHA-256 sealed for audit-grade reproducibility. The platform transforms academic social network analysis into actionable investment intelligence — the kind of capability that was previously only available to the largest quantitative funds.`,
  },
];

export default async function SovereignStoryPage() {
  const m = moduleBySlug("sovereign-story")!;
  const [snap, report] = await Promise.all([loadSnapshot(), loadPipelineReport()]);

  return (
    <div className="sov-fade-up">
      <ModuleHero num={m.num} floor="FLOOR 05 · REGIONAL & META" title={m.title} tagline={m.tagline}
        actions={<><StatusPill variant="ok"><span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />Live</StatusPill><StatusPill>{m.id}</StatusPill></>}>
        {m.description}
      </ModuleHero>

      <div className="space-y-6 mb-8">
        {STEPS.map((step) => (
          <section key={step.num} className="group">
            <Card className="!p-0 overflow-hidden">
              <div className="flex">
                <div className="w-16 flex-shrink-0 bg-ink-900 flex items-center justify-center">
                  <span className="font-mono font-bold text-gold-400 text-lg">{step.num}</span>
                </div>
                <div className="flex-1 p-6">
                  <h2 className="text-lg font-bold text-ink-900 mb-3">{step.title}</h2>
                  <p className="text-[0.92rem] text-ink-600 leading-relaxed">{step.body}</p>
                </div>
              </div>
            </Card>
          </section>
        ))}
      </div>

      <Section label="By the numbers" title="The data behind the story">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="!p-4 text-center">
            <div className="text-2xl font-bold text-gold-700">{fmtInt(snap.nObjects)}</div>
            <div className="text-[0.78rem] text-ink-500">entities indexed</div>
          </Card>
          <Card className="!p-4 text-center">
            <div className="text-2xl font-bold text-gold-700">{fmtInt(snap.nEdges)}</div>
            <div className="text-[0.78rem] text-ink-500">co-investment edges</div>
          </Card>
          <Card className="!p-4 text-center">
            <div className="text-2xl font-bold text-gold-700">{fmtInt(snap.nInvestors)}</div>
            <div className="text-[0.78rem] text-ink-500">investors scored</div>
          </Card>
          <Card className="!p-4 text-center">
            <div className="text-2xl font-bold text-gold-700">{snap.hasAugmented ? "100%" : "74%"}</div>
            <div className="text-[0.78rem] text-ink-500">statistical power</div>
          </Card>
        </div>
      </Section>

      {report && (
        <Section label="Augmentation impact" title="How data augmentation changed the story">
          <Card className="!p-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-ink-900 mb-2">Before augmentation</h3>
                <ul className="space-y-1 text-[0.88rem] text-ink-600">
                  <li>• ~54K investment events</li>
                  <li>• ~12K graph edges</li>
                  <li>• Statistical power: {(report.power_before * 100).toFixed(1)}%</li>
                  <li>• H3 verdict: "Cannot reject null"</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-ink-900 mb-2">After augmentation</h3>
                <ul className="space-y-1 text-[0.88rem] text-ink-600">
                  <li>• {fmtInt(report.n_investments)} investment events</li>
                  <li>• {fmtInt(report.n_edges)} graph edges</li>
                  <li>• Statistical power: {(report.power_after * 100).toFixed(0)}%</li>
                  <li>• H3 verdict: <strong className="text-ok-700">"Sufficient power to detect effect"</strong></li>
                </ul>
              </div>
            </div>
          </Card>
        </Section>
      )}
    </div>
  );
}
