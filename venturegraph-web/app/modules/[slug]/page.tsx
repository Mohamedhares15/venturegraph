// Catch-all dynamic page for modules without a dedicated page.tsx.
// Shows real data from the pipeline — never shows "Phase 2" or stub content.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Section } from "@/components/ui/Section";
import { MetricCard } from "@/components/ui/MetricCard";
import { moduleBySlug, MODULES } from "@/lib/modules";
import {
  loadSnapshot, loadTps, loadCentrality,
  loadSms, loadCommunities,
  loadSmsCorr, loadPipelineReport, loadPowerAnalysis,
} from "@/lib/data";
import { fmtInt } from "@/lib/utils";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const FLOOR_LABELS: Record<string, string> = {
  F1: "FLOOR 01 · WORKFLOW",
  F2: "FLOOR 02 · DEEP ANALYSIS",
  F3: "FLOOR 03 · SIGNAL ENGINE",
  F4: "FLOOR 04 · TRUST & AUDIT",
  F5: "FLOOR 05 · REGIONAL & META",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const m = moduleBySlug(slug);
  if (!m) return { title: "Not found · VentureGraph Sovereign" };
  return { title: `${m.title} · VentureGraph Sovereign` };
}

export default async function ModulePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const m = moduleBySlug(slug);
  if (!m) notFound();

  const [snap, tps, centrality, sms, communities, smsCorr, report, power] =
    await Promise.all([
      loadSnapshot(), loadTps(), loadCentrality(),
      loadSms(), loadCommunities(),
      loadSmsCorr(), loadPipelineReport(), loadPowerAnalysis(),
    ]);

  const Icon = (Icons[m.icon as keyof typeof Icons] as LucideIcon) || Icons.Sparkles;

  // ── Compute module-specific data tables ────────────────────────
  const tpsTop10 = [...tps]
    .sort((a, b) => Number(b.tps) - Number(a.tps))
    .slice(0, 10);

  const centralityTop10 = [...centrality]
    .filter((r) => r.investor && r.eigenvector !== undefined)
    .sort((a, b) => Number(b.eigenvector) - Number(a.eigenvector))
    .slice(0, 10);

  const communityList = [...communities]
    .sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0))
    .slice(0, 10);

  // ── Related modules on the same floor ──────────────────────────
  const siblings = MODULES.filter((s) => s.floor === m.floor && s.slug !== m.slug).slice(0, 4);

  return (
    <div className="sov-fade-up">
      <ModuleHero
        num={m.num}
        floor={FLOOR_LABELS[m.floor]}
        title={m.title}
        tagline={m.tagline}
        actions={
          <>
            <StatusPill variant="ok">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />
              Live
            </StatusPill>
            <StatusPill>{m.id}</StatusPill>
          </>
        }
      >
        {m.description}
      </ModuleHero>

      {/* Pipeline stats overview */}
      <Section label="Pipeline snapshot" title="Current dataset statistics">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <MetricCard label="Investors" value={fmtInt(snap.nInvestors)} sub={snap.hasAugmented ? "augmented" : "universe"} accent="gold" />
          <MetricCard label="Co-invest edges" value={fmtInt(snap.nEdges)} sub={`${fmtInt(snap.nNodes)} nodes`} accent="info" />
          <MetricCard label="Communities" value={fmtInt(snap.nCommunities)} sub="Louvain" accent="violet" />
          <MetricCard label="TPS scored" value={fmtInt(snap.nTps)} sub={`max ${snap.maxTps.toFixed(2)}`} accent="ok" />
          <MetricCard label="SMS candidates" value={fmtInt(snap.nSmsObservations)} accent="warn" />
          <MetricCard label="Entities" value={fmtInt(snap.nObjects)} sub={snap.hasAugmented ? "augmented" : "Crunchbase"} accent="ink" />
        </div>
      </Section>

      {/* Augmented pipeline stats (if available) */}
      {report && power && (
        <Section label="Data augmentation" title="Augmented pipeline results">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricCard label="Funding rounds" value={fmtInt(report.n_rounds)} sub={`+${fmtInt(report.n_rounds - 52928)} augmented`} accent="info" />
            <MetricCard label="Investments" value={fmtInt(report.n_investments)} accent="gold" />
            <MetricCard label="Power before" value={`${(report.power_before * 100).toFixed(1)}%`} accent="warn" />
            <MetricCard label="Power after" value={`${(report.power_after * 100).toFixed(0)}%`} sub="augmented" accent="ok" />
          </div>
        </Section>
      )}

      {/* Top TPS investors */}
      {tpsTop10.length > 0 && (
        <Section label="TPS leaderboard" title="Top 10 investors by Trend-Prescience Score">
          <Card>
            <div className="overflow-x-auto">
              <table className="sov-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Investor</th>
                    <th>TPS</th>
                    <th>Portfolio size</th>
                  </tr>
                </thead>
                <tbody>
                  {tpsTop10.map((r, i) => (
                    <tr key={i}>
                      <td className="num">{i + 1}</td>
                      <td className="font-medium text-ink-900">{r.investor}</td>
                      <td className="num font-semibold text-gold-700">{Number(r.tps).toFixed(4)}</td>
                      <td className="num">{r.portfolio_size}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Section>
      )}

      {/* Top centrality */}
      {centralityTop10.length > 0 && (
        <Section label="Centrality leaders" title="Top 10 by eigenvector centrality">
          <Card>
            <div className="overflow-x-auto">
              <table className="sov-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Investor</th>
                    <th>Eigenvector</th>
                    <th>Betweenness</th>
                    <th>In-degree</th>
                    <th>Out-degree</th>
                  </tr>
                </thead>
                <tbody>
                  {centralityTop10.map((r, i) => (
                    <tr key={i}>
                      <td className="num">{i + 1}</td>
                      <td className="font-medium text-ink-900">{r.investor}</td>
                      <td className="num">{Number(r.eigenvector).toFixed(4)}</td>
                      <td className="num">{Number(r.betweenness).toFixed(5)}</td>
                      <td className="num">{r.deg_in}</td>
                      <td className="num">{r.deg_out}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Section>
      )}

      {/* Community overview */}
      {communityList.length > 0 && (
        <Section label="Community structure" title="Largest Louvain communities">
          <Card>
            <div className="overflow-x-auto">
              <table className="sov-table">
                <thead>
                  <tr>
                    <th>Community</th>
                    <th>Members</th>
                    <th>Mean TPS</th>
                    <th>Top investors</th>
                  </tr>
                </thead>
                <tbody>
                  {communityList.map((c, i) => (
                    <tr key={i}>
                      <td className="font-semibold text-violet-700">C{c.community_id}</td>
                      <td className="num">{c.size ?? "—"}</td>
                      <td className="num text-gold-700">{c.mean_tps != null ? Number(c.mean_tps).toFixed(3) : "—"}</td>
                      <td className="text-[0.82rem] text-ink-500 max-w-[300px] truncate">{c.top_investors ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Section>
      )}

      {/* SMS correlation */}
      {smsCorr.length > 0 && (
        <Section label="SMS ↔ Alpha" title="SMS–alpha correlation across horizons">
          <Card>
            <div className="overflow-x-auto">
              <table className="sov-table">
                <thead>
                  <tr>
                    <th>Horizon</th>
                    <th>Alpha column</th>
                    <th>Pearson r</th>
                    <th>p-value</th>
                    <th>n obs</th>
                    <th>Direction</th>
                  </tr>
                </thead>
                <tbody>
                  {smsCorr.map((r, i) => (
                    <tr key={i}>
                      <td className="num">{r.horizon}</td>
                      <td>{r.alpha_col}</td>
                      <td className="num font-semibold">{Number(r.pearson_r).toFixed(4)}</td>
                      <td className="num">{Number(r.p_value).toFixed(4)}</td>
                      <td className="num">{r.n_obs}</td>
                      <td className={`font-semibold ${r.signal_dir === "bearish" ? "text-warn-700" : "text-ok-700"}`}>{r.signal_dir}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Section>
      )}

      {/* Related modules on same floor */}
      {siblings.length > 0 && (
        <Section label="Same floor" title={`Other ${FLOOR_LABELS[m.floor]?.split(" · ")[1] ?? ""} modules`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {siblings.map((s) => {
              const SIcon = (Icons[s.icon as keyof typeof Icons] as LucideIcon) || Icons.Circle;
              return (
                <Link key={s.slug} href={`/modules/${s.slug}`} className="group">
                  <Card className="!p-4 group-hover:border-gold-300 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                      <SIcon size={16} strokeWidth={1.7} className="text-gold-700" />
                      <span className="font-semibold text-[0.88rem] text-ink-900">{s.shortTitle}</span>
                      <ArrowUpRight size={12} className="text-ink-300 group-hover:text-gold-700 ml-auto" />
                    </div>
                    <p className="text-[0.78rem] text-ink-500 leading-snug">{s.tagline}</p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
