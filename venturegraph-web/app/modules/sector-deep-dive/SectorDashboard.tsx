"use client";
// Sector dashboard charts (client component — receives data as props)
import {
  ComposedChart, BarChart, Bar, Line, ResponsiveContainer, XAxis, YAxis, Tooltip,
  CartesianGrid, LabelList, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Card, CardLabel } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { fmtInt } from "@/lib/utils";
import type { SectorTopInvestor, SectorTimeseries, SectorExits } from "./sector-data";

const STAGE_COLORS = ["#8a6a14", "#0e7a3f", "#1a4f8b", "#7c3aed", "#a35a00", "#d04444", "#94a3b8", "#0b1f3a"];

export function SectorDashboard({
  topInvestors, ts, exits,
}: { topInvestors: SectorTopInvestor[]; ts: SectorTimeseries; exits: SectorExits }) {
  return (
    <div className="space-y-8 sov-fade-up">
      {/* ── Top investors ────────────────────────────────────────────────── */}
      <Section
        label="Capital deployed"
        title="Top investors in this sector"
        description="Bar height = # deals; bar colour = investor's own TPS (darker green = stronger prescience)."
      >
        <Card>
          <div className="h-[460px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topInvestors} layout="vertical" margin={{ top: 4, right: 90, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="investor" width={180} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: unknown, n: unknown) =>
                    n === "deals" ? [String(v), "Deals"] : [Number(v).toFixed(3), "TPS"]
                  }
                  cursor={{ fill: "rgba(180,138,38,0.06)" }}
                />
                <Bar dataKey="deals" radius={[0, 3, 3, 0]}>
                  {topInvestors.map((d, i) => {
                    const t = Math.min(d.tps / Math.max(...topInvestors.map((x) => x.tps), 0.01), 1);
                    const r = Math.round(26 + (14 - 26) * t);
                    const g = Math.round(79 + (122 - 79) * t);
                    const b = Math.round(139 + (63 - 139) * t);
                    return <Cell key={i} fill={`rgb(${r},${g},${b})`} />;
                  })}
                  <LabelList
                    dataKey="tps"
                    position="right"
                    formatter={(v: unknown) => `TPS ${Number(v).toFixed(2)}`}
                    fill="#0b1f3a"
                    fontSize={10}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </Section>

      {/* ── Signal history ──────────────────────────────────────────────── */}
      <Section
        label="Signal history"
        title="SMS · SSI · α"
        description="Smart-Money Silence (gold), normalised SSI (green dotted), and quarterly Fama-French α (navy dashed)."
      >
        <Card>
          {ts.sms.length === 0 ? (
            <p className="text-ink-400 text-sm">No SMS history available.</p>
          ) : (
            <div className="h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={ts.sms} margin={{ top: 8, right: 60, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(d) => String(d).slice(0, 7)} minTickGap={36} />
                  <YAxis yAxisId="L" />
                  <YAxis yAxisId="R" orientation="right" tickFormatter={(v) => Number(v).toFixed(3)} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="L" dataKey="sms_score" fill="#a35a00" name="SMS" opacity={0.85} radius={[3, 3, 0, 0]} />
                  <Line yAxisId="L" type="monotone" dataKey="ssi_norm" name="SSI (norm.)" stroke="#0e7a3f" strokeDasharray="4 3" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="R" type="monotone" dataKey="alpha_k12" name="α (k=12)" stroke="#1a4f8b" strokeDasharray="2 2" strokeWidth={1.6} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </Section>

      {/* ── Deal flow + stage distribution ──────────────────────────────── */}
      <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
        <Card>
          <CardLabel>Quarterly deal flow</CardLabel>
          <p className="text-[0.84rem] text-ink-500 mt-1 mb-3">Investment events vs. unique companies, per quarter.</p>
          {ts.flow.length === 0 ? (
            <p className="text-ink-400 text-sm">No deal flow available.</p>
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={ts.flow} margin={{ top: 8, right: 30, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="quarter" minTickGap={28} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="deals" fill="#8a6a14" name="Investment events" radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="unique_companies" stroke="#1a4f8b" name="Unique companies" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardLabel>Stage distribution</CardLabel>
          <p className="text-[0.84rem] text-ink-500 mt-1 mb-3">Where the capital lands by round type.</p>
          {ts.stages.length === 0 ? (
            <p className="text-ink-400 text-sm">No stage data.</p>
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ts.stages}
                    dataKey="deals"
                    nameKey="stage"
                    innerRadius={60}
                    outerRadius={110}
                    paddingAngle={1}
                    label={(e: { stage?: string; percent?: number }) => `${e.stage} ${(((e.percent ?? 0) * 100)).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {ts.stages.map((_, i) => (
                      <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* ── Exits table ────────────────────────────────────────────────── */}
      <Section
        label="Realised exits"
        title="Liquidity record"
        description={`${fmtInt(exits.acquisitions.length)} acquisitions · ${fmtInt(exits.ipos.length)} IPOs · ${exits.rate.toFixed(1)}% exit rate`}
      >
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardLabel>Acquisitions</CardLabel>
            <div className="mt-3 max-h-[320px] overflow-auto">
              <table className="sov-table">
                <thead><tr><th>Date</th><th className="!text-right">Price (USD)</th></tr></thead>
                <tbody>
                  {exits.acquisitions.length === 0
                    ? <tr><td colSpan={2} className="text-center py-5 text-ink-400">No acquisitions in panel.</td></tr>
                    : exits.acquisitions.slice(0, 50).map((a, i) => (
                        <tr key={i}>
                          <td className="num">{a.acquired_at?.slice(0, 10) || "—"}</td>
                          <td className="num">{a.price_amount ? "$" + a.price_amount.toLocaleString() : "—"}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <CardLabel>IPOs</CardLabel>
            <div className="mt-3 max-h-[320px] overflow-auto">
              <table className="sov-table">
                <thead><tr><th>Date</th><th>Symbol</th><th className="!text-right">Valuation (USD)</th></tr></thead>
                <tbody>
                  {exits.ipos.length === 0
                    ? <tr><td colSpan={3} className="text-center py-5 text-ink-400">No IPOs in panel.</td></tr>
                    : exits.ipos.slice(0, 50).map((p, i) => (
                        <tr key={i}>
                          <td className="num">{p.public_at?.slice(0, 10) || "—"}</td>
                          <td>{p.stock_symbol ?? "—"}</td>
                          <td className="num">{p.valuation_amount ? "$" + p.valuation_amount.toLocaleString() : "—"}</td>
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
