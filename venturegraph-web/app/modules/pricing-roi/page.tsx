import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import { loadSnapshot } from "@/lib/data";
import { fmtInt } from "@/lib/utils";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing & ROI · VentureGraph Sovereign" };

const TIERS = [
  { name: "Explorer", seats: "1–2", acv: "$0", features: ["Dashboard view-only", "5 sectors", "TPS leaderboard", "Community view"], highlight: false },
  { name: "Analyst", seats: "1–5", acv: "$24,000", features: ["Full signal engine", "Scenario analyzer", "IC Pack export", "Email alerts"], highlight: false },
  { name: "Desk", seats: "5–15", acv: "$72,000", features: ["All Analyst features", "Signal Composer", "Saved Workspaces", "Custom blends"], highlight: true },
  { name: "Fund", seats: "15–50", acv: "$180,000", features: ["All Desk features", "MENA expansion", "Compliance vault", "API access"], highlight: false },
  { name: "Platform", seats: "50–200", acv: "$420,000", features: ["All Fund features", "White-label UI", "Multi-tenant", "Dedicated support"], highlight: false },
  { name: "Enterprise", seats: "Unlimited", acv: "Custom", features: ["All Platform features", "On-prem deployment", "Custom integrations", "SLA guarantee"], highlight: false },
];

const ROI_COMPARISONS = [
  { provider: "Pitchbook", annualCost: "$25,000", signalDepth: "Basic", snaCapability: "None", auditTrail: "No" },
  { provider: "Preqin", annualCost: "$18,000", signalDepth: "Basic", snaCapability: "None", auditTrail: "No" },
  { provider: "CB Insights", annualCost: "$30,000", signalDepth: "Medium", snaCapability: "Limited", auditTrail: "No" },
  { provider: "VentureGraph Analyst", annualCost: "$24,000", signalDepth: "Deep (TPS+SMS+SSI)", snaCapability: "Full graph + centrality", auditTrail: "SHA-256 sealed" },
];

export default async function PricingRoiPage() {
  const m = moduleBySlug("pricing-roi")!;
  const snap = await loadSnapshot();

  return (
    <div className="sov-fade-up">
      <ModuleHero num={m.num} floor="FLOOR 05 · REGIONAL & META" title={m.title} tagline={m.tagline}
        actions={<><StatusPill variant="ok"><span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />Live</StatusPill><StatusPill>{m.id}</StatusPill></>}>
        {m.description}
      </ModuleHero>

      <Section label="Tier model" title="Six institutional tiers with transparent pricing">
        <div className="grid md:grid-cols-3 xl:grid-cols-6 gap-3">
          {TIERS.map((t) => (
            <Card key={t.name} className={`!p-5 ${t.highlight ? "!border-gold-400 !bg-gold-50/50 ring-2 ring-gold-200" : ""}`}>
              {t.highlight && <div className="text-[0.65rem] font-bold text-gold-700 uppercase tracking-widest mb-2">Most popular</div>}
              <h3 className="text-lg font-bold text-ink-900">{t.name}</h3>
              <div className="text-2xl font-bold text-gold-700 mt-1">{t.acv}</div>
              <div className="text-[0.75rem] text-ink-500">{t.seats} seats · per year</div>
              <ul className="mt-4 space-y-1.5">
                {t.features.map((f, i) => (
                  <li key={i} className="text-[0.78rem] text-ink-600 flex items-start gap-1.5">
                    <span className="text-ok-600 mt-0.5">✓</span>{f}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </Section>

      <Section label="ROI comparison" title="VentureGraph vs alternative data providers">
        <Card>
          <div className="overflow-x-auto">
            <table className="sov-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Annual cost</th>
                  <th>Signal depth</th>
                  <th>SNA capability</th>
                  <th>Audit trail</th>
                </tr>
              </thead>
              <tbody>
                {ROI_COMPARISONS.map((r, i) => (
                  <tr key={i} className={r.provider.includes("VentureGraph") ? "bg-gold-50" : ""}>
                    <td className={`font-medium ${r.provider.includes("VentureGraph") ? "text-gold-800 font-bold" : "text-ink-900"}`}>{r.provider}</td>
                    <td className="num">{r.annualCost}</td>
                    <td>{r.signalDepth}</td>
                    <td>{r.snaCapability}</td>
                    <td className={r.auditTrail.includes("SHA") ? "text-ok-700 font-semibold" : "text-ink-500"}>{r.auditTrail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      <Section label="Platform scale" title="What your subscription covers">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="!p-4 text-center">
            <div className="text-2xl font-bold text-ink-900">{fmtInt(snap.nInvestors)}</div>
            <div className="text-[0.78rem] text-ink-500">Investors tracked</div>
          </Card>
          <Card className="!p-4 text-center">
            <div className="text-2xl font-bold text-ink-900">{fmtInt(snap.nEdges)}</div>
            <div className="text-[0.78rem] text-ink-500">Co-investment edges</div>
          </Card>
          <Card className="!p-4 text-center">
            <div className="text-2xl font-bold text-ink-900">{fmtInt(snap.nObjects)}</div>
            <div className="text-[0.78rem] text-ink-500">Entities indexed</div>
          </Card>
          <Card className="!p-4 text-center">
            <div className="text-2xl font-bold text-ink-900">22</div>
            <div className="text-[0.78rem] text-ink-500">Analytics modules</div>
          </Card>
        </div>
      </Section>

      <Section label="Break-even" title="Illustrative ROI calculation">
        <Card className="!p-6">
          <div className="space-y-3 text-[0.9rem] text-ink-700">
            <p><strong>Scenario:</strong> A mid-market VC fund ($500M AUM) with 10 analysts uses VentureGraph Desk tier ($72K/year).</p>
            <p><strong>Improvement:</strong> If TPS-guided deal sourcing avoids just one failed investment per year (avg loss: $2M), the ROI is <strong className="text-ok-700">27× cost</strong>.</p>
            <p><strong>Alternative:</strong> Building equivalent SNA capability in-house requires 2 data engineers × 6 months + infrastructure = ~$400K minimum, with no audit trail guarantee.</p>
            <p className="text-[0.82rem] text-ink-400 italic mt-2">Note: These are illustrative figures for academic demonstration. Actual ROI will vary by fund size, strategy, and market conditions.</p>
          </div>
        </Card>
      </Section>
    </div>
  );
}
