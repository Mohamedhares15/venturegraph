import type { Metadata } from "next";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { StatusPill } from "@/components/ui/StatusPill";
import { Card, CardLabel } from "@/components/ui/Card";
import { InvestorSearch } from "./InvestorSearch";
import { InvestorProfileView } from "./InvestorProfile";
import { getInvestorProfile } from "./investor-data";
import { loadInvestorUniverse, loadTps } from "@/lib/data";
import { moduleBySlug } from "@/lib/modules";
import { Search, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Investor Deep-Dive · VentureGraph Sovereign",
};

export default async function InvestorDeepDivePage({
  searchParams,
}: {
  searchParams: Promise<{ investor?: string }>;
}) {
  const m = moduleBySlug("investor-deep-dive")!;
  const sp = await searchParams;
  const target = sp?.investor?.trim() ?? "";

  const universe = await loadInvestorUniverse();
  const tps = await loadTps();
  // Top 12 by TPS for "popular" suggestions when search is empty
  const popular = [...tps]
    .filter((r) => r.investor)
    .sort((a, b) => Number(b.tps) - Number(a.tps))
    .slice(0, 12)
    .map((r) => r.investor as string);

  const profile = target ? await getInvestorProfile(target) : null;

  return (
    <div className="sov-fade-up">
      <ModuleHero
        num={m.num}
        floor="FLOOR 02 · DEEP ANALYSIS"
        title={m.title}
        tagline={m.tagline}
        actions={
          <>
            <StatusPill variant="ok">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />
              Live
            </StatusPill>
            <StatusPill>{universe.length.toLocaleString()} investors</StatusPill>
          </>
        }
      >
        {m.description}
      </ModuleHero>

      <Card className="!p-5 mb-6">
        <CardLabel>
          <Search size={11} strokeWidth={2.2} className="inline mr-1 -mt-0.5" />
          Pick an investor
        </CardLabel>
        <p className="text-[0.84rem] text-ink-500 mt-1 mb-3">
          Type any GP name. Suggestions update live; press Enter or click to load profile.
        </p>
        <InvestorSearch universe={universe} popular={popular} />
      </Card>

      {!profile && target && (
        <Card variant="warn">
          <CardLabel className="!text-warn-700">Not found</CardLabel>
          <p className="mt-2 text-ink-700">
            <code className="font-mono text-[0.86rem] bg-paper-100 px-1.5 py-0.5 rounded border border-ink-100">
              {target}
            </code>{" "}
            does not match any investor in the universe. Try the search box above.
          </p>
        </Card>
      )}

      {!profile && !target && (
        <Card>
          <div className="flex items-start gap-4">
            <Sparkles size={22} strokeWidth={1.6} className="text-gold-500 mt-0.5 flex-shrink-0" />
            <div>
              <CardLabel>Quick start</CardLabel>
              <p className="text-[0.92rem] text-ink-600 mt-2 leading-relaxed">
                Drill into any of the {universe.length.toLocaleString()} investors. The profile
                aggregates <b className="text-ink-900">nine independent signal layers</b> — TPS, time-series prescience, community
                membership, four centrality measures, sector posture, full portfolio + realised exits.
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {popular.slice(0, 8).map((p) => (
                  <a
                    key={p}
                    href={`/modules/investor-deep-dive?investor=${encodeURIComponent(p)}`}
                    className="sov-tag hover:!bg-gold-200 transition-colors"
                  >
                    {p}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {profile && (
        <>
          <div className="mb-4 flex items-baseline gap-3 flex-wrap">
            <h2 className="text-[1.6rem] font-semibold text-ink-900">{profile.name}</h2>
            {profile.percentiles.tps !== undefined && profile.percentiles.tps >= 90 && (
              <StatusPill variant="ok">
                <Sparkles size={11} strokeWidth={2} />
                Top {(100 - profile.percentiles.tps).toFixed(0)}% TPS
              </StatusPill>
            )}
          </div>
          <InvestorProfileView profile={profile} />
        </>
      )}
    </div>
  );
}
