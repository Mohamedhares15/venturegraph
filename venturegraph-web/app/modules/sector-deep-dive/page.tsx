import type { Metadata } from "next";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { StatusPill } from "@/components/ui/StatusPill";
import { Card, CardLabel } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { SECTORS } from "@/lib/data";
import { moduleBySlug } from "@/lib/modules";
import { fmt, fmtInt } from "@/lib/utils";
import { SectorPicker } from "./SectorPicker";
import { SectorDashboard } from "./SectorDashboard";
import {
  getSectorSnapshot,
  getSectorTopInvestors,
  getSectorTimeseries,
  getSectorExits,
} from "./sector-data";

export const metadata: Metadata = {
  title: "Sector Deep-Dive · VentureGraph Sovereign",
};

export default async function SectorDeepDivePage({
  searchParams,
}: {
  searchParams: Promise<{ sector?: string }>;
}) {
  const m = moduleBySlug("sector-deep-dive")!;
  const sp = await searchParams;
  const sector = sp?.sector && SECTORS.includes(sp.sector) ? sp.sector : SECTORS[0];

  const [snap, topInv, ts, exits] = await Promise.all([
    getSectorSnapshot(sector),
    getSectorTopInvestors(sector, 15),
    getSectorTimeseries(sector),
    getSectorExits(sector),
  ]);

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
            <StatusPill>5 ETF-mapped sectors</StatusPill>
          </>
        }
      >
        {m.description}
      </ModuleHero>

      <Card className="!p-5 mb-6">
        <SectorPicker sectors={SECTORS} current={sector} />
      </Card>

      {/* Sector card with key metadata */}
      <Card className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardLabel>Sector profile</CardLabel>
            <h2 className="text-[1.55rem] font-semibold text-ink-900 mt-1">
              <span className="font-mono text-gold-700 mr-3">{snap.sector}</span>
              {snap.sector_name}
            </h2>
            <p className="text-ink-500 mt-1">
              {snap.earliest ?? "—"} → {snap.latest ?? "—"} · {fmtInt(snap.n_deals)} investment events ·
              {" "}
              {fmtInt(snap.n_companies)} companies · {fmtInt(snap.n_investors)} unique investors
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <MetricCard label="Deal events" value={fmtInt(snap.n_deals)} accent="gold" />
        <MetricCard label="Companies" value={fmtInt(snap.n_companies)} accent="ink" />
        <MetricCard label="Investors" value={fmtInt(snap.n_investors)} accent="info" />
        <MetricCard
          label="Latest SMS"
          value={snap.latest_sms ? fmt(snap.latest_sms.score, { digits: 3 }) : "—"}
          sub={snap.latest_sms?.date}
          accent={
            snap.latest_sms && snap.latest_sms.score > 0.5
              ? "warn"
              : snap.latest_sms && snap.latest_sms.score < 0.3
              ? "ok"
              : "gold"
          }
        />
        <MetricCard
          label="Latest α (FF5)"
          value={snap.latest_alpha ? fmt(snap.latest_alpha.alpha, { digits: 4, signed: true }) : "—"}
          sub={
            snap.mean_alpha !== undefined
              ? `μ = ${fmt(snap.mean_alpha, { digits: 4, signed: true })} · n = ${snap.alpha_observations}`
              : undefined
          }
          accent={(snap.latest_alpha?.alpha ?? 0) >= 0 ? "ok" : "risk"}
        />
      </div>

      <SectorDashboard topInvestors={topInv} ts={ts} exits={exits} />
    </div>
  );
}
