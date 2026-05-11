import type { Metadata } from "next";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, Legend,
} from "@/components/ui/Charts";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import {
  loadEventPanel, loadSms, loadAlphas, loadInvPanel,
  ETF_SECTOR, mean, median,
} from "@/lib/data";
import { fmt, fmtInt, groupBy } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Multi-Sector Dashboard · VentureGraph Sovereign" };

const SECTOR_COLOURS: Record<string, string> = {
  IGV: "#8a6a14", SOXX: "#7c3aed", XBI: "#0e7a3f", XLF: "#a35a00", FDN: "#1a4f8b",
};
const SECTORS = Object.keys(ETF_SECTOR);

export default async function MultiSectorPage() {
  const m = moduleBySlug("multi-sector-dashboard")!;
  const [eventPanel, sms, alphas, invPanel] = await Promise.all([
    loadEventPanel(), loadSms(), loadAlphas(), loadInvPanel(),
  ]);

  const panel = eventPanel.length ? eventPanel : sms;

  // ── Per-sector stats ──────────────────────────────────────────────────
  const sectorProfiles = SECTORS.map((sec) => {
    const rows = panel.filter((r) => r.sector === sec && r.sms_score !== undefined);
    const smsScores = rows.map((r) => Number(r.sms_score) || 0);
    const secAlphas = alphas
      .filter((r) => r.sector === sec || r.etf === sec)
      .map((r) => Number(r.alpha) || 0);
    const secDeals = invPanel.filter(
      (r) => r.sector_name === sec || r.etf_primary === sec,
    ).length;
    const nInvestors = new Set(
      invPanel
        .filter((r) => r.sector_name === sec || r.etf_primary === sec)
        .map((r) => String(r.investor_name)),
    ).size;
    return {
      sector: sec,
      label: ETF_SECTOR[sec],
      mean_sms: mean(smsScores),
      median_sms: median(smsScores),
      mean_alpha: mean(secAlphas),
      n_observations: rows.length,
      n_deals: secDeals,
      n_investors: nInvestors,
    };
  });

  // ── Radar data — normalise all metrics to 0-100 ───────────────────────
  const maxSms  = Math.max(...sectorProfiles.map((s) => s.mean_sms), 0.01);
  const maxAlpha = Math.max(...sectorProfiles.map((s) => Math.abs(s.mean_alpha)), 0.0001);
  const maxDeals = Math.max(...sectorProfiles.map((s) => s.n_deals), 1);
  const maxInv   = Math.max(...sectorProfiles.map((s) => s.n_investors), 1);
  const radarData = [
    { axis: "SMS",         ...Object.fromEntries(sectorProfiles.map((s) => [s.sector, (s.mean_sms / maxSms) * 100])) },
    { axis: "Alpha",       ...Object.fromEntries(sectorProfiles.map((s) => [s.sector, (Math.abs(s.mean_alpha) / maxAlpha) * 100])) },
    { axis: "Deal volume", ...Object.fromEntries(sectorProfiles.map((s) => [s.sector, (s.n_deals / maxDeals) * 100])) },
    { axis: "Investors",   ...Object.fromEntries(sectorProfiles.map((s) => [s.sector, (s.n_investors / maxInv) * 100])) },
    { axis: "Obs.",        ...Object.fromEntries(sectorProfiles.map((s) => [s.sector, Math.min(s.n_observations * 5, 100)])) },
  ];

  // ── Heatmap data — sector × quarter SMS score ────────────────────────
  const allDates  = [...new Set(panel.filter((r) => r.eval_date).map((r) => String(r.eval_date).slice(0, 7)))].sort();
  const recentDates = allDates.slice(-12);
  const heatmap = recentDates.map((d) => {
    const row: Record<string, string | number> = { date: d };
    SECTORS.forEach((sec) => {
      const match = panel.find(
        (r) => String(r.eval_date).startsWith(d) && r.sector === sec && r.sms_score !== undefined,
      );
      row[sec] = match ? Number(match.sms_score) || 0 : 0;
    });
    return row;
  });

  // ── Alpha comparison bar ──────────────────────────────────────────────
  const alphaBar = sectorProfiles.map((s) => ({
    sector: s.sector,
    alpha: s.mean_alpha,
    name: s.label.split(" ")[0],
  }));

  return (
    <div className="sov-fade-up">
      <ModuleHero
        num={m.num}
        floor="FLOOR 01 · WORKFLOW"
        title={m.title}
        tagline={m.tagline}
        actions={<StatusPill variant="ok"><span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse"/>Live</StatusPill>}
      >
        Compare SMS, SSI, Fama-French alpha, deal volume, and investor concentration across all
        five flagship ETF sectors simultaneously — the daily workflow surface for sector
        allocation decisions.
      </ModuleHero>

      {/* Sector metric strip */}
      <Section label="Sector overview" title="Live snapshot · five ETF proxies">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {sectorProfiles.map((s) => (
            <Card key={s.sector} className="!p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full" style={{ background: SECTOR_COLOURS[s.sector] }} />
                <span className="font-mono text-[0.78rem] font-semibold text-ink-900">{s.sector}</span>
              </div>
              <div className="sov-metric-value !text-[1.3rem] text-ink-900">{fmt(s.mean_sms, { digits: 3 })}</div>
              <div className="sov-metric-label mt-1">mean SMS</div>
              <div className="mt-2 flex items-baseline justify-between text-[0.78rem]">
                <span className="text-ink-500">α</span>
                <span className={s.mean_alpha >= 0 ? "text-ok-700 font-mono" : "text-risk-700 font-mono"}>
                  {fmt(s.mean_alpha, { digits: 4, signed: true })}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-[0.78rem] mt-0.5">
                <span className="text-ink-500">deals</span>
                <span className="font-mono text-ink-700">{fmtInt(s.n_deals)}</span>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      {/* Radar + alpha side by side */}
      <Section label="Comparative view" title="Sector radar · five dimensions">
        <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
          <Card>
            <CardLabel>Normalised radar</CardLabel>
            <p className="text-[0.84rem] text-ink-500 mt-1 mb-2">
              SMS, alpha magnitude, deal volume, investor count, observation count — all scaled to 100.
            </p>
            <div className="h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} margin={{ top: 20, right: 30, left: 30, bottom: 20 }}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 12 }} />
                  {SECTORS.map((sec) => (
                    <Radar
                      key={sec}
                      name={sec}
                      dataKey={sec}
                      stroke={SECTOR_COLOURS[sec]}
                      fill={SECTOR_COLOURS[sec]}
                      fillOpacity={0.08}
                      strokeWidth={2}
                    />
                  ))}
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardLabel>Mean Fama-French α comparison</CardLabel>
            <p className="text-[0.84rem] text-ink-500 mt-1 mb-2">
              Positive = sector outperformed the five-factor model historically.
            </p>
            <div className="h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={alphaBar} margin={{ top: 8, right: 20, left: 4, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="sector" />
                  <YAxis />
                  <Tooltip
                  />
                  <Bar dataKey="alpha" radius={[4, 4, 0, 0]}>
                    {alphaBar.map((d, i) => (
                      <Cell key={i} fill={d.alpha >= 0 ? SECTOR_COLOURS[d.sector] : "#d04444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </Section>

      {/* SMS heatmap over the last 12 evaluation dates */}
      {heatmap.length > 0 && (
        <Section label="SMS heatmap" title="Sector × date — last 12 evaluation periods">
          <Card>
            <p className="text-[0.84rem] text-ink-500 mb-3">
              A grouped bar for each date with one bar per sector. Tall gold bars signal elevated
              smart-money silence in that sector.
            </p>
            <div className="h-[380px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={heatmap} margin={{ top: 4, right: 24, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {SECTORS.map((sec) => (
                    <Bar key={sec} dataKey={sec} fill={SECTOR_COLOURS[sec]} radius={[2, 2, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Section>
      )}

      {/* Metric table */}
      <Section label="Full table" title="All metrics side by side">
        <Card>
          <div className="overflow-x-auto">
            <table className="sov-table">
              <thead>
                <tr>
                  <th>Sector</th><th>Name</th>
                  <th>Mean SMS</th><th>Median SMS</th>
                  <th>Mean α</th><th>Deals</th><th>Investors</th><th>SMS obs.</th>
                </tr>
              </thead>
              <tbody>
                {sectorProfiles.map((s) => (
                  <tr key={s.sector}>
                    <td>
                      <span className="inline-flex items-center gap-2 font-mono font-semibold text-ink-900">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: SECTOR_COLOURS[s.sector] }} />
                        {s.sector}
                      </span>
                    </td>
                    <td className="text-ink-700">{s.label}</td>
                    <td className="num">{s.mean_sms.toFixed(4)}</td>
                    <td className="num">{s.median_sms.toFixed(4)}</td>
                    <td className={`num font-semibold ${s.mean_alpha >= 0 ? "text-ok-700" : "text-risk-700"}`}>
                      {s.mean_alpha.toFixed(5)}
                    </td>
                    <td className="num">{s.n_deals.toLocaleString()}</td>
                    <td className="num">{s.n_investors.toLocaleString()}</td>
                    <td className="num">{s.n_observations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>
    </div>
  );
}
