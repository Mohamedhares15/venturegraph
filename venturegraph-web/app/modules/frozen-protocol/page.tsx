import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import { HashPill } from "@/components/ui/HashPill";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Frozen Protocol · VentureGraph Sovereign" };

const HYPOTHESES = [
  { id: "H1", statement: "Higher TPS investors achieve higher portfolio-exit rates (acquisitions + IPOs) than low-TPS investors.", status: "Supported" },
  { id: "H2", statement: "Network centrality (eigenvector + betweenness) positively predicts future co-investment links.", status: "Supported" },
  { id: "H3", statement: "Sectors with higher SMS (Smart Money Silence) scores under-perform their benchmark ETF over the subsequent K-month horizon.", status: "Not rejected at α=0.05 (original), Supported post-augmentation" },
];

const PARAMETERS = [
  { name: "TPS formula", value: "TPS_i = (1/N_i) Σ_k w_k × exit_k, w_k = 1/(t_exit − t_invest)" },
  { name: "Co-investment edge weight", value: "w_ij = Σ_c 1/(t_c − t_min + 1), directed by investment date" },
  { name: "SMS score", value: "SMS_s,t = −(TPS̄_active − TPS̄_silent) × log(n_silent + 1)" },
  { name: "Community detection", value: "Louvain method, resolution γ = 1.0" },
  { name: "Centrality", value: "Eigenvector (NetworkX), Betweenness (Brandes), In/Out degree" },
  { name: "Significance level", value: "α = 0.05, two-tailed" },
  { name: "Effect size", value: "Cohen's d = 0.15 (small)" },
  { name: "Statistical power target", value: "1 − β ≥ 0.80" },
  { name: "Entity matching", value: "Jaro-Winkler ≥ 0.92" },
];

const DATASETS = [
  { file: "objects.csv", desc: "Crunchbase 2013 entity table", rows: "472,552" },
  { file: "investments.csv", desc: "Investment events", rows: "~54k" },
  { file: "funding_rounds.csv", desc: "Funding round records", rows: "52,928" },
  { file: "acquisitions.csv", desc: "M&A exit events", rows: "~29k" },
  { file: "ipos.csv", desc: "IPO exit events", rows: "~2.5k" },
];

export default function FrozenProtocolPage() {
  const m = moduleBySlug("frozen-protocol")!;

  return (
    <div className="sov-fade-up">
      <ModuleHero num={m.num} floor="FLOOR 04 · TRUST & AUDIT" title={m.title} tagline={m.tagline}
        actions={<><StatusPill variant="ok"><span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />Live</StatusPill><StatusPill>{m.id}</StatusPill></>}>
        {m.description}
      </ModuleHero>

      <Section label="Pre-registered hypotheses" title="Sealed before any back-test execution">
        <div className="space-y-3">
          {HYPOTHESES.map((h) => (
            <Card key={h.id} className="!p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-ink-900 text-gold-400 flex items-center justify-center font-mono font-bold text-[0.82rem] flex-shrink-0">
                  {h.id}
                </div>
                <div className="flex-1">
                  <p className="text-[0.92rem] text-ink-800 leading-relaxed">{h.statement}</p>
                  <div className="mt-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-[0.75rem] font-semibold ${h.status.includes("Supported") ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                      {h.status}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section label="Fixed parameters" title="Model specification locked before execution">
        <Card>
          <table className="sov-table">
            <thead>
              <tr><th>Parameter</th><th>Specification</th></tr>
            </thead>
            <tbody>
              {PARAMETERS.map((p, i) => (
                <tr key={i}>
                  <td className="font-semibold text-ink-900 whitespace-nowrap">{p.name}</td>
                  <td className="font-mono text-[0.8rem] text-ink-600">{p.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>

      <Section label="Sealed datasets" title="Input data frozen at commit time">
        <Card>
          <table className="sov-table">
            <thead>
              <tr><th>File</th><th>Description</th><th>Records</th></tr>
            </thead>
            <tbody>
              {DATASETS.map((d, i) => (
                <tr key={i}>
                  <td className="font-mono text-[0.82rem] text-gold-700">{d.file}</td>
                  <td className="text-ink-600">{d.desc}</td>
                  <td className="num">{d.rows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>

      <Section label="Robustness checks" title="Pre-registered sensitivity tests">
        <Card className="!p-5">
          <ul className="space-y-2 text-[0.9rem] text-ink-700">
            <li className="flex items-start gap-2"><span className="text-gold-600 font-bold">1.</span> Winsorise TPS at 1st/99th percentile — re-run H1.</li>
            <li className="flex items-start gap-2"><span className="text-gold-600 font-bold">2.</span> Exclude top-5 most connected investors — re-run H2 link prediction.</li>
            <li className="flex items-start gap-2"><span className="text-gold-600 font-bold">3.</span> Vary SMS horizon K ∈ {"{3, 6, 12, 24}"} months — check H3 consistency.</li>
            <li className="flex items-start gap-2"><span className="text-gold-600 font-bold">4.</span> Bootstrap 1 000 resamples of the co-investment graph — report confidence intervals.</li>
            <li className="flex items-start gap-2"><span className="text-gold-600 font-bold">5.</span> Replace Louvain with Leiden community detection — check TPS-community correlation stability.</li>
          </ul>
        </Card>
      </Section>
    </div>
  );
}
