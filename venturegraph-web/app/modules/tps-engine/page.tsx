import type { Metadata } from "next";
import {
  BarChart, Bar, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, ReferenceLine,
} from "@/components/ui/Charts";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import { loadTps, loadTpsPanel, mean, median, quantile } from "@/lib/data";
import { fmt, fmtInt } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TPS Engine · VentureGraph Sovereign" };

export default async function TpsEnginePage() {
  const m = moduleBySlug("tps-engine")!;
  const [tps, panel] = await Promise.all([loadTps(), loadTpsPanel()]);

  // ── Leaderboard — top 20 by TPS ───────────────────────────────────────
  const leaderboard = [...tps]
    .filter((r) => r.investor)
    .sort((a, b) => Number(b.tps) - Number(a.tps))
    .slice(0, 20)
    .map((r) => ({
      investor: String(r.investor),
      tps: Number(r.tps) || 0,
      portfolio_size: Number(r.portfolio_size) || 0,
      out_degree: Number(r.out_degree) || 0,
    }));

  // ── Distribution — 40 buckets ─────────────────────────────────────────
  const allTps = tps.map((r) => Number(r.tps) || 0).filter(Number.isFinite);
  const tpsMin = Math.min(...allTps);
  const tpsMax = Math.max(...allTps);
  const N_BINS = 40;
  const binW = (tpsMax - tpsMin) / N_BINS || 0.01;
  const bins = Array.from({ length: N_BINS }, (_, i) => ({
    label: (tpsMin + i * binW).toFixed(3),
    count: 0,
    lo: tpsMin + i * binW,
    hi: tpsMin + (i + 1) * binW,
  }));
  allTps.forEach((v) => {
    const i = Math.min(Math.floor((v - tpsMin) / binW), N_BINS - 1);
    bins[i].count += 1;
  });

  // ── Summary stats ─────────────────────────────────────────────────────
  const univMean   = mean(allTps);
  const univMedian = median(allTps);
  const p75  = quantile(allTps, 0.75);
  const p90  = quantile(allTps, 0.90);
  const p95  = quantile(allTps, 0.95);
  const nTopDecile = allTps.filter((v) => v >= p90).length;

  // ── Trajectory for top-5 investors ───────────────────────────────────
  const top5names = leaderboard.slice(0, 5).map((r) => r.investor);
  const allDates  = [...new Set(panel.map((r) => String(r.eval_date)))].sort();
  const tpsMap    = new Map<string, Map<string, number>>();
  top5names.forEach((n) => tpsMap.set(n, new Map()));
  panel.forEach((r) => {
    if (!top5names.includes(String(r.investor))) return;
    tpsMap.get(String(r.investor))!.set(String(r.eval_date), Number(r.tps) || 0);
  });
  const topTrajectory = allDates
    .filter((_, i) => i % 2 === 0)  // thin to every other date
    .map((date) => {
      const row: Record<string, string | number> = { date: date.slice(0, 7) };
      top5names.forEach((n) => {
        const v = tpsMap.get(n)?.get(date);
        if (v !== undefined) row[n] = v;
      });
      return row;
    });

  const LINE_COLOURS = ["#8a6a14", "#0e7a3f", "#1a4f8b", "#7c3aed", "#d04444"];

  return (
    <div className="sov-fade-up">
      <ModuleHero
        num={m.num}
        floor="FLOOR 03 · SIGNAL ENGINE"
        title={m.title}
        tagline={m.tagline}
        actions={<StatusPill variant="ok"><span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />Live</StatusPill>}
      >
        The Trend-Prescience Score (TPS) is a real-valued rank statistic computed over the expanding
        investment panel. An investor earns a high TPS by deploying capital into companies that
        subsequently attracted top-tier follow-on rounds — measuring foresight, not just deal volume.
      </ModuleHero>

      {/* Formula card */}
      <Section label="Methodology" title="How TPS is constructed">
        <Card variant="info" className="!p-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <CardLabel className="!text-info-700">Formula</CardLabel>
              <div className="mt-3 font-mono text-[0.86rem] bg-paper-100 border border-info-100 rounded-lg p-4 leading-relaxed">
                <div className="text-info-700 font-semibold mb-2">TPS(i, T) =</div>
                <div className="text-ink-700 leading-loose">
                  Σ<sub>j ∈ portfolio(i)</sub> I[<em>j</em> ∈ top-tier<sub>T</sub>] · w(j)<br />
                  ─────────────────────────────<br />
                  |portfolio(i)|
                </div>
              </div>
              <p className="mt-3 text-[0.82rem] text-ink-600 leading-relaxed">
                where <em>top-tier<sub>T</sub></em> is the set of companies that raised a Series A or
                later from a recognised top-tier investor by evaluation date <em>T</em>, and
                <em> w(j)</em> = 1 (uniform in baseline).
              </p>
            </div>
            <div>
              <CardLabel className="!text-info-700">Pre-registration constraints (frozen)</CardLabel>
              <ul className="mt-3 space-y-1.5 text-[0.85rem] text-ink-700">
                {[
                  ["Evaluation window", "Expanding (from t₀)"],
                  ["Top-tier threshold", "Fixed before any back-test"],
                  ["Weight scheme",      "Uniform · w = 1"],
                  ["Panel start",        "2006-01-01"],
                  ["Panel end",          "2013-12-31"],
                  ["Evaluation cadence", "Quarterly"],
                  ["Universe size",      `${fmtInt(tps.length)} investors`],
                ].map(([k, v]) => (
                  <li key={k} className="flex items-baseline justify-between gap-3 border-b border-ink-100 pb-1">
                    <span className="text-ink-500">{k}</span>
                    <span className="font-mono text-[0.82rem] text-ink-900">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </Section>

      {/* Universe stats */}
      <Section label="Universe statistics" title="TPS distribution across all investors">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-5">
          <MetricCard label="Universe"   value={fmtInt(allTps.length)} accent="gold" />
          <MetricCard label="Mean"        value={fmt(univMean,   {digits:4})} accent="ink" />
          <MetricCard label="Median"      value={fmt(univMedian, {digits:4})} accent="ink" />
          <MetricCard label="P75"         value={fmt(p75,  {digits:4})} accent="info" />
          <MetricCard label="P90"         value={fmt(p90,  {digits:4})} accent="warn" />
          <MetricCard label="Top decile"  value={fmtInt(nTopDecile)} sub="≥ P90" accent="ok" />
        </div>

        <Card>
          <CardLabel>Histogram · {fmtInt(allTps.length)} investors in {N_BINS} bins</CardLabel>
          <p className="text-[0.84rem] text-ink-500 mt-1 mb-3">
            Gold dashed line = mean ({fmt(univMean, { digits: 4 })}). The long right tail is the
            group of consistently prescient top-tier GPs.
          </p>
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bins} margin={{ top: 8, right: 24, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" minTickGap={30} tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                  {bins.map((b, i) => (
                    <Cell key={i} fill={b.lo >= p90 ? "#0e7a3f" : b.lo >= univMean ? "#8a6a14" : "#94a3b8"} />
                  ))}
                </Bar>
                <ReferenceLine
                  x={[...bins].sort((a, b) => Math.abs(a.lo - univMean) - Math.abs(b.lo - univMean))[0]?.label ?? ""}
                  stroke="#a07d1d"
                  strokeDasharray="4 3"
                  strokeWidth={2}
                  label={{ value: `μ=${fmt(univMean,{digits:3})}`, fill:"#a07d1d", fontSize:10 }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </Section>

      {/* Leaderboard */}
      <Section label="Prescience leaders" title="Top 20 investors by TPS">
        <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
          <Card>
            <div className="h-[540px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leaderboard} layout="vertical" margin={{ top: 4, right: 80, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="investor" width={180} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="tps" radius={[0, 4, 4, 0]}>
                    {leaderboard.map((_, i) => (
                      <Cell key={i} fill={`hsl(${160 - i * 6}, ${70 - i * 2}%, ${28 + i * 1.5}%)`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="overflow-auto max-h-[540px]">
            <table className="sov-table">
              <thead>
                <tr><th>#</th><th>Investor</th><th>TPS</th><th>Portfolio</th></tr>
              </thead>
              <tbody>
                {leaderboard.map((r, i) => (
                  <tr key={i}>
                    <td className="num text-gold-700 font-semibold">{i + 1}</td>
                    <td className="font-medium text-ink-900 !max-w-[140px] truncate">{r.investor}</td>
                    <td className="num">{r.tps.toFixed(4)}</td>
                    <td className="num">{r.portfolio_size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* Top-5 trajectory overlay */}
      {topTrajectory.length > 0 && (
        <Section label="Prescience over time" title="Top 5 investors · expanding-window TPS">
          <Card>
            <p className="text-[0.84rem] text-ink-500 mb-3">
              Each line traces one investor&apos;s TPS as the expanding panel grows from 2006.
              Steeper rise = earlier foresight.
            </p>
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={topTrajectory} margin={{ top: 8, right: 24, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" minTickGap={36} />
                  <YAxis />
                  <Tooltip />
                  {top5names.map((name, i) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={LINE_COLOURS[i]}
                      strokeWidth={2}
                      dot={false}
                      name={name}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 mt-3 pl-2">
              {top5names.map((name, i) => (
                <span key={name} className="flex items-center gap-1.5 text-[0.78rem] text-ink-600">
                  <span className="w-4 h-1 rounded-full inline-block" style={{ background: LINE_COLOURS[i] }} />
                  {name}
                </span>
              ))}
            </div>
          </Card>
        </Section>
      )}
    </div>
  );
}
