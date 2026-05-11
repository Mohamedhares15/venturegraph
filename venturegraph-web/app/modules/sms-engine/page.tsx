import type { Metadata } from "next";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import { loadEventPanel, loadSms, loadSmsCorr, loadExpandedSmsCorr, loadExpansionSummary, ETF_SECTOR, mean } from "@/lib/data";
import { groupBy } from "@/lib/utils";
import { SmsEngineCharts } from "./SmsEngineCharts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "SMS Engine · VentureGraph Sovereign" };

export default async function SmsEnginePage() {
  const m = moduleBySlug("sms-engine")!;
  const [eventPanel, sms, corr, expandedCorr, expansionSummary] = await Promise.all([
    loadEventPanel(),
    loadSms(),
    loadSmsCorr(),
    loadExpandedSmsCorr(),
    loadExpansionSummary(),
  ]);

  const sectors = Object.keys(ETF_SECTOR);
  const src = eventPanel.length ? eventPanel : sms;

  // Per-sector summary
  const sectorStats = sectors.map((sec) => {
    const rows = src.filter((r) => r.sector === sec && r.sms_score !== undefined);
    const scores = rows.map((r) => Number(r.sms_score) || 0);
    const latest = [...rows].sort((a, b) =>
      String(a.eval_date).localeCompare(String(b.eval_date)),
    ).pop();
    return {
      sector: sec,
      name: ETF_SECTOR[sec],
      n_obs: rows.length,
      mean_sms: mean(scores),
      latest_score: latest ? Number(latest.sms_score) || 0 : 0,
    };
  });

  // Multi-sector time series
  const byDate = groupBy(
    src.filter((r) => r.sector && r.eval_date && r.sms_score !== undefined),
    (r) => String(r.eval_date).slice(0, 7),
  );
  const allDates = [...byDate.keys()].sort();
  const multiSectorTs = allDates.map((d) => {
    const row: Record<string, string | number> = { date: d };
    const items = byDate.get(d) ?? [];
    sectors.forEach((sec) => {
      const item = items.find((i) => i.sector === sec);
      if (item) row[sec] = Number(item.sms_score) || 0;
    });
    return row;
  });

  // Top silence events
  const topEvents = [...src]
    .filter((r) => r.sms_score !== undefined)
    .sort((a, b) => Number(b.sms_score) - Number(a.sms_score))
    .slice(0, 15)
    .map((r) => ({
      date: String(r.eval_date).slice(0, 10),
      sector: String(r.sector ?? "—"),
      score: Number(r.sms_score) || 0,
      n_silent: Number((r as Record<string, unknown>).n_silent) || undefined,
      n_expected: Number((r as Record<string, unknown>).n_expected) || undefined,
    }));

  const corrRows = corr.slice(0, 30);

  return (
    <div className="sov-fade-up">
      <ModuleHero
        num={m.num}
        floor="FLOOR 03 · SIGNAL ENGINE"
        title={m.title}
        tagline={m.tagline}
        actions={
          <StatusPill variant="ok">
            <span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />
            Live
          </StatusPill>
        }
      >
        Smart-Money Silence (SMS) measures the fraction of previously-active top-tier investors
        that abstain from a sector in a given window. High SMS → the smart money has gone quiet;
        SSI (Silence-Signal Index) normalises this by expected activity. Both are leading
        indicators of sector alpha.
      </ModuleHero>

      <SmsEngineCharts
        sectorStats={sectorStats}
        multiSectorTs={multiSectorTs}
        topEvents={topEvents}
        corrRows={corrRows}
        expandedCorrRows={expandedCorr}
        expansionSummary={expansionSummary}
        sectors={sectors}
      />
    </div>
  );
}
