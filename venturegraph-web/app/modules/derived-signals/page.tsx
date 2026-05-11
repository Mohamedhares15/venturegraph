import type { Metadata } from "next";
import {
  BarChart, Bar, Cell, LineChart, Line,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "@/components/ui/Charts";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import {
  loadTpsPanel, loadSms, loadInvPanel, loadCentrality,
  ETF_SECTOR, mean,
} from "@/lib/data";
import { fmt, fmtInt, groupBy } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Derived Signals · VentureGraph Sovereign",
};

export default async function DerivedSignalsPage() {
  const m = moduleBySlug("derived-signals")!;
  const [tpsPanel, sms, invPanel, centrality] = await Promise.all([
    loadTpsPanel(), loadSms(), loadInvPanel(), loadCentrality(),
  ]);

  // ── 1 · TPS Momentum — QoQ delta for top-20 investors ───────────────
  const tpsByInv = groupBy(tpsPanel.filter((r: {investor?: unknown}) => r.investor), (r) => String(r.investor));
  const tpsMomentum = [...tpsByInv.entries()]
    .map(([investor, rows]) => {
      type R = { eval_date?: unknown; tps?: unknown };
      const sorted = (rows as R[]).sort((a, b) => String(a.eval_date).localeCompare(String(b.eval_date)));
      if (sorted.length < 2) return null;
      const last = Number(sorted[sorted.length - 1].tps) || 0;
      const prev = Number(sorted[sorted.length - 2].tps) || 0;
      return { investor, momentum: last - prev, current_tps: last };
    })
    .filter(Boolean) as { investor: string; momentum: number; current_tps: number }[];

  const topRising = [...tpsMomentum].sort((a, b) => b.momentum - a.momentum).slice(0, 10);
  const topFalling = [...tpsMomentum].sort((a, b) => a.momentum - b.momentum).slice(0, 10);

  // ── 2 · SMS Momentum — latest minus previous for each sector ────────
  const smsBySector = groupBy(sms.filter((r: {sector?: unknown; eval_date?: unknown}) => r.sector && r.eval_date), (r) => String(r.sector));
  const smsMomentum = [...smsBySector.entries()].map(([sector, rows]) => {
    const sorted = rows.sort((a, b) => String(a.eval_date).localeCompare(String(b.eval_date)));
    if (sorted.length < 2) return null;
    const last = Number(sorted[sorted.length - 1].sms_score) || 0;
    const prev = Number(sorted[sorted.length - 2].sms_score) || 0;
    return { sector, momentum: last - prev, current: last, name: ETF_SECTOR[sector] ?? sector };
  }).filter(Boolean) as { sector: string; momentum: number; current: number; name: string }[];

  // ── 3 · Sector HHI per investor ── top 15 most concentrated ─────────
  const hhi: { investor: string; hhi: number; n_sectors: number }[] = [];
  const invBySector = groupBy(
    invPanel.filter((r) => r.investor_name && (r.sector_name || r.etf_primary)),
    (r) => String(r.investor_name),
  );
  for (const [investor, rows] of invBySector) {
    const secMap = new Map<string, number>();
    rows.forEach((r: { sector_name?: unknown; etf_primary?: unknown }) => {
      const s = String(r.sector_name ?? r.etf_primary ?? "other");
      secMap.set(s, (secMap.get(s) ?? 0) + 1);
    });
    const total = rows.length;
    if (total < 3) continue;
    const h = [...secMap.values()].reduce((s, v) => s + (v / total) ** 2, 0);
    hhi.push({ investor, hhi: h, n_sectors: secMap.size });
  }
  const topHHI = hhi.sort((a, b) => b.hhi - a.hhi).slice(0, 15);
  const bottomHHI = hhi.sort((a, b) => a.hhi - b.hhi).slice(0, 15);

  // ── 4 · Clustering proxy — betweenness / (deg_out + 1) ──────────────
  const clusteringProxy = centrality
    .filter((r) => r.investor && r.betweenness !== undefined && r.deg_out !== undefined)
    .map((r) => ({
      investor: String(r.investor),
      proxy: (Number(r.betweenness) || 0) / ((Number(r.deg_out) || 0) + 1),
      betweenness: Number(r.betweenness) || 0,
      deg_out: Number(r.deg_out) || 0,
    }))
    .sort((a, b) => b.proxy - a.proxy)
    .slice(0, 15);

  // ── 5 · Sector velocity — QoQ deal count change ─────────────────────
  const sectorVelocity = Object.keys(ETF_SECTOR).map((sec) => {
    const rows = invPanel.filter((r) => (r.sector_name === sec || r.etf_primary === sec) && r.funded_at);
    const byQ = groupBy(rows, (r: { funded_at?: unknown }) => {
      const d = new Date(String(r.funded_at));
      return Number.isNaN(d.valueOf())
        ? "?"
        : `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    });
    const quarters = [...byQ.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (quarters.length < 2) return { sector: sec, velocity: 0 };
    const last = quarters[quarters.length - 1][1].length;
    const prev = quarters[quarters.length - 2][1].length;
    return { sector: sec, velocity: last - prev, name: ETF_SECTOR[sec] };
  });

  const SIGNALS = [
    { id: "tps_momentum",     label: "TPS Momentum",             color: "#8a6a14" },
    { id: "sms_momentum",     label: "SMS Momentum",             color: "#a35a00" },
    { id: "hhi",              label: "Sector HHI",               color: "#1a4f8b" },
    { id: "clustering_proxy", label: "Clustering Proxy",         color: "#7c3aed" },
    { id: "sector_velocity",  label: "Sector Velocity",          color: "#0e7a3f" },
  ];

  return (
    <div className="sov-fade-up">
      <ModuleHero
        num={m.num}
        floor="FLOOR 03 · SIGNAL ENGINE"
        title={m.title}
        tagline={m.tagline}
        actions={
          <>
            <StatusPill variant="ok">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />
              Live
            </StatusPill>
            <StatusPill>{SIGNALS.length} composite signals</StatusPill>
          </>
        }
      >
        {m.description}
      </ModuleHero>

      {/* Signal catalogue */}
      <Section label="Signal catalogue" title="Five derived composite signals">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {SIGNALS.map((s) => (
            <div
              key={s.id}
              className="bg-paper-200 border border-ink-100 rounded-lg p-4 border-l-[3px]"
              style={{ borderLeftColor: s.color }}
            >
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] font-semibold mb-1"
                style={{ color: s.color }}>
                {s.label}
              </div>
              <p className="text-[0.78rem] text-ink-600 leading-snug">
                {s.id === "tps_momentum"     && "Quarter-on-quarter TPS change. Rising stars vs. fading names."}
                {s.id === "sms_momentum"     && "QoQ SMS change per sector. Accelerating vs. easing silence."}
                {s.id === "hhi"              && "Herfindahl-Hirschman Index of investor sector portfolio. Focused vs. diversified."}
                {s.id === "clustering_proxy" && "Betweenness / (deg_out + 1). Brokers that are not mere hubs."}
                {s.id === "sector_velocity"  && "QoQ deal acceleration by sector. Gaining vs. losing momentum."}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* TPS Momentum */}
      <Section label="Signal 1 · TPS Momentum" title="Rising stars & fading names">
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardLabel className="!text-ok-700">Top 10 rising TPS (most improved QoQ)</CardLabel>
            <div className="h-[320px] mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topRising} layout="vertical" margin={{ top: 4, right: 70, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="investor" width={150} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="momentum" fill="#0e7a3f" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <CardLabel className="!text-risk-700">Top 10 falling TPS (most declined QoQ)</CardLabel>
            <div className="h-[320px] mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topFalling} layout="vertical" margin={{ top: 4, right: 70, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="investor" width={150} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="momentum" fill="#d04444" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </Section>

      {/* SMS Momentum + Sector Velocity */}
      <Section label="Signals 2 & 5 · SMS Momentum + Sector Velocity" title="Which sectors are accelerating?">
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardLabel>SMS Momentum (latest QoQ Δ)</CardLabel>
            <div className="h-[260px] mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={smsMomentum} margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="sector" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="momentum" radius={[3, 3, 0, 0]}>
                    {smsMomentum.map((s, i) => (
                      <Cell key={i} fill={s.momentum >= 0 ? "#a35a00" : "#0e7a3f"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[0.75rem] text-ink-400 mt-2">Gold = rising silence. Green = easing.</p>
          </Card>
          <Card>
            <CardLabel>Sector Velocity (latest QoQ Δ deal count)</CardLabel>
            <div className="h-[260px] mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorVelocity} margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="sector" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="velocity" radius={[3, 3, 0, 0]}>
                    {sectorVelocity.map((s, i) => (
                      <Cell key={i} fill={s.velocity >= 0 ? "#0e7a3f" : "#d04444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </Section>

      {/* HHI + Clustering proxy */}
      <Section label="Signals 3 & 4 · Sector HHI + Clustering Proxy" title="Concentration & brokerage">
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardLabel>Most focused investors (highest HHI)</CardLabel>
            <div className="overflow-auto max-h-[320px] mt-2">
              <table className="sov-table">
                <thead><tr><th>Investor</th><th>HHI</th><th>Sectors</th></tr></thead>
                <tbody>
                  {topHHI.map((r, i) => (
                    <tr key={i}>
                      <td className="truncate !max-w-[160px] font-medium text-ink-900">{r.investor}</td>
                      <td className="num font-semibold text-warn-700">{r.hhi.toFixed(4)}</td>
                      <td className="num">{r.n_sectors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <CardLabel>Top clustering proxy (brokers, not just hubs)</CardLabel>
            <div className="overflow-auto max-h-[320px] mt-2">
              <table className="sov-table">
                <thead><tr><th>Investor</th><th>Proxy</th><th>Betw.</th><th>Deg↑</th></tr></thead>
                <tbody>
                  {clusteringProxy.map((r, i) => (
                    <tr key={i}>
                      <td className="truncate !max-w-[150px] font-medium text-ink-900">{r.investor}</td>
                      <td className="num font-semibold text-violet-700">{r.proxy.toFixed(6)}</td>
                      <td className="num">{r.betweenness.toFixed(5)}</td>
                      <td className="num">{r.deg_out.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </Section>
    </div>
  );
}
