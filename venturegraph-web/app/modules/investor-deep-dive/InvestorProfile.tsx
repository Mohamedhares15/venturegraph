"use client";
// Investor profile renderer — receives data via props from server component
import {
  LineChart, Line, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceDot, LabelList, Cell,
} from "recharts";
import { Card, CardLabel } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { fmt, fmtInt } from "@/lib/utils";
import type { InvestorProfile as Profile } from "./investor-data";
import { Activity, Layers, Network, Briefcase } from "lucide-react";
import { useState } from "react";

const TABS = [
  { id: "trajectory", label: "TPS Trajectory", icon: Activity },
  { id: "sectors",    label: "Sector Posture", icon: Layers },
  { id: "coinvest",   label: "Co-Investors",   icon: Network },
  { id: "portfolio",  label: "Portfolio + Exits", icon: Briefcase },
] as const;
type TabId = typeof TABS[number]["id"];

export function InvestorProfileView({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<TabId>("trajectory");
  return (
    <div className="space-y-6 sov-fade-up">
      {/* Headline metric strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricCard
          label="TPS"
          value={profile.tps ? fmt(profile.tps.tps, { digits: 3 }) : "—"}
          sub={
            profile.percentiles.tps !== undefined
              ? `P${profile.percentiles.tps.toFixed(0)} percentile`
              : undefined
          }
          accent="gold"
        />
        <MetricCard
          label="Portfolio size"
          value={profile.tps ? fmtInt(profile.tps.portfolio_size) : "—"}
          sub="unique companies"
          accent="ink"
        />
        <MetricCard
          label="Out-degree"
          value={profile.centrality?.deg_out ? fmtInt(profile.centrality.deg_out) : "—"}
          sub="co-invest links"
          accent="info"
        />
        <MetricCard
          label="Betweenness"
          value={profile.centrality?.betweenness ? fmt(profile.centrality.betweenness, { digits: 4 }) : "—"}
          sub={
            profile.percentiles.betweenness !== undefined
              ? `P${profile.percentiles.betweenness.toFixed(0)}`
              : undefined
          }
          accent="violet"
        />
        <MetricCard
          label="Eigenvector"
          value={profile.centrality?.eigenvector ? fmt(profile.centrality.eigenvector, { digits: 4 }) : "—"}
          sub={
            profile.percentiles.eigenvector !== undefined
              ? `P${profile.percentiles.eigenvector.toFixed(0)}`
              : undefined
          }
          accent="info"
        />
        <MetricCard
          label="Realised exits"
          value={fmtInt(profile.exits.acquisitions + profile.exits.ipos)}
          sub={`${profile.exits.acquisitions} acq · ${profile.exits.ipos} IPO`}
          accent="ok"
        />
      </div>

      {/* Community + summary card */}
      {profile.community && (
        <Card variant="violet">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardLabel>Co-investment community</CardLabel>
              <div className="mt-1 flex items-baseline gap-3 flex-wrap">
                <span className="text-[1.4rem] font-mono font-semibold text-ink-900">
                  C{profile.community.id}
                </span>
                {profile.community.size && (
                  <span className="text-ink-500 text-[0.85rem]">
                    {profile.community.size.toLocaleString()} members
                  </span>
                )}
                {profile.community.mean_tps !== undefined && (
                  <span className="text-ink-500 text-[0.85rem]">
                    mean TPS = {fmt(profile.community.mean_tps, { digits: 3 })}
                  </span>
                )}
              </div>
            </div>
            {profile.community.top_sectors && (
              <div className="flex flex-wrap gap-1.5 max-w-md">
                {profile.community.top_sectors.split(/[|,;]/).slice(0, 5).map((s, i) => (
                  <StatusPill key={i} className="!text-[0.6rem]">
                    {s.trim()}
                  </StatusPill>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Tabs */}
      <div className="border-b border-ink-100 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`sov-tab flex items-center gap-2 ${tab === t.id ? "sov-tab--active" : ""}`}
          >
            <t.icon size={14} strokeWidth={1.7} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "trajectory" && <TrajectoryPanel profile={profile} />}
      {tab === "sectors" && <SectorPanel profile={profile} />}
      {tab === "coinvest" && <CoInvestPanel profile={profile} />}
      {tab === "portfolio" && <PortfolioPanel profile={profile} />}
    </div>
  );
}

// ── Trajectory tab ──────────────────────────────────────────────────────
function TrajectoryPanel({ profile }: { profile: Profile }) {
  const ts = profile.tpsPanel;
  if (!ts.length) {
    return <Card variant="info"><CardLabel>No time-series</CardLabel><p className="mt-2 text-ink-600">No TPS panel observations recorded for this investor.</p></Card>;
  }
  const earliest = ts[0].tps;
  const latest = ts[ts.length - 1].tps;
  const delta = latest - earliest;
  const topTier = ts.filter((p) => p.in_top_tier);

  return (
    <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
      <Card>
        <CardLabel>TPS prescience trajectory</CardLabel>
        <p className="text-[0.84rem] text-ink-500 mt-1 mb-3">
          Expanding-window TPS evaluated quarterly. Diamond markers = top-tier window.
        </p>
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ts} margin={{ top: 8, right: 24, left: 4, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="eval_date" tickFormatter={(d) => String(d).slice(0, 7)} minTickGap={28} />
              <YAxis tickFormatter={(v) => Number(v).toFixed(2)} />
              <Tooltip
                formatter={(v: unknown) => [Number(v).toFixed(4), "TPS"]}
                labelFormatter={(l: unknown) => String(l).slice(0, 10)}
              />
              <Line
                type="monotone"
                dataKey="tps"
                stroke="#8a6a14"
                strokeWidth={2.2}
                dot={{ r: 3, fill: "#8a6a14", strokeWidth: 0 }}
                activeDot={{ r: 6, fill: "#0b1f3a" }}
              />
              {topTier.map((p, i) => (
                <ReferenceDot
                  key={i}
                  x={p.eval_date}
                  y={p.tps}
                  r={7}
                  fill="#0e7a3f"
                  stroke="#0b1f3a"
                  strokeWidth={1.2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="space-y-3">
        <MetricCard
          label="Observations"
          value={fmtInt(ts.length)}
          sub="quarterly evaluations"
          accent="ink"
        />
        <MetricCard
          label="Earliest → latest"
          value={`${fmt(earliest, { digits: 3 })} → ${fmt(latest, { digits: 3 })}`}
          sub={delta >= 0 ? "↑ ascending" : "↓ declining"}
          accent={delta >= 0 ? "ok" : "warn"}
          delta={delta}
        />
        <MetricCard
          label="Top-tier quarters"
          value={fmtInt(topTier.length)}
          sub={`of ${ts.length} (${((topTier.length / ts.length) * 100).toFixed(0)}%)`}
          accent="ok"
        />
      </div>
    </div>
  );
}

// ── Sector tab ──────────────────────────────────────────────────────────
function SectorPanel({ profile }: { profile: Profile }) {
  const sp = profile.sectorPosture;
  if (!sp.length) {
    return (
      <Card variant="info">
        <CardLabel>No sector exposure</CardLabel>
        <p className="mt-2 text-ink-600">No sector-attributed deals found in the joined panel.</p>
      </Card>
    );
  }
  const totalDeals = sp.reduce((s, r) => s + r.deals, 0);
  const hhi = sp.reduce((s, r) => s + (r.deals / totalDeals) ** 2, 0);
  const topShare = (sp[0].deals / totalDeals) * 100;

  return (
    <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
      <Card>
        <CardLabel>Sector deployment</CardLabel>
        <p className="text-[0.84rem] text-ink-500 mt-1 mb-3">{sp.length} sectors, {totalDeals.toLocaleString()} attributed deals.</p>
        <div className="h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sp.slice(0, 12)} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" />
              <YAxis type="category" dataKey="sector" width={150} tick={{ fontSize: 11 }} />
              <Tooltip cursor={{ fill: "rgba(180,138,38,0.06)" }} />
              <Bar dataKey="deals" fill="#8a6a14" radius={[0, 3, 3, 0]}>
                <LabelList dataKey="deals" position="right" fill="#0b1f3a" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="space-y-3">
        <MetricCard label="Total deals" value={fmtInt(totalDeals)} accent="gold" />
        <MetricCard label="Sectors" value={fmtInt(sp.length)} accent="ink" />
        <MetricCard
          label="Top sector concentration"
          value={`${topShare.toFixed(1)}%`}
          sub={sp[0].sector}
          accent="info"
        />
        <MetricCard
          label="HHI"
          value={fmt(hhi, { digits: 3 })}
          sub={hhi > 0.4 ? "Concentrated" : "Diversified"}
          accent={hhi > 0.4 ? "warn" : "ok"}
        />
      </div>
    </div>
  );
}

// ── Co-investors tab ────────────────────────────────────────────────────
function CoInvestPanel({ profile }: { profile: Profile }) {
  const co = profile.coInvestors;
  if (!co.length) {
    return (
      <Card variant="info">
        <CardLabel>No co-invest edges</CardLabel>
        <p className="mt-2 text-ink-600">No co-investment edges recorded for this GP.</p>
      </Card>
    );
  }
  const maxTps = Math.max(...co.map((c) => c.their_tps), 0.01);

  return (
    <Card>
      <CardLabel>Top 20 co-investors · coloured by their own TPS</CardLabel>
      <p className="text-[0.84rem] text-ink-500 mt-1 mb-3">
        Darker green = stronger prescience signal in the partner network.
      </p>
      <div className="h-[480px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={co} layout="vertical" margin={{ top: 4, right: 80, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" />
            <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v: unknown, n: unknown) =>
                n === "deals" ? [String(v), "Co-deals"] : [Number(v).toFixed(3), "Their TPS"]
              }
              cursor={{ fill: "rgba(26,79,139,0.06)" }}
            />
            <Bar dataKey="deals" radius={[0, 3, 3, 0]}>
              {co.map((c, i) => {
                // Map TPS to a navy → green colour ramp
                const t = Math.min(c.their_tps / maxTps, 1);
                const r = Math.round(26 + (14 - 26) * t);
                const g = Math.round(79 + (122 - 79) * t);
                const b = Math.round(139 + (63 - 139) * t);
                return <Cell key={i} fill={`rgb(${r},${g},${b})`} />;
              })}
              <LabelList
                dataKey="their_tps"
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
  );
}

// ── Portfolio + exits tab ──────────────────────────────────────────────
function PortfolioPanel({ profile }: { profile: Profile }) {
  const p = profile.portfolio;
  const totalExits = profile.exits.acquisitions + profile.exits.ipos;
  return (
    <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
      <Card>
        <CardLabel>Recent portfolio (top 30 by funding date)</CardLabel>
        <div className="mt-3 max-h-[440px] overflow-auto">
          <table className="sov-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Sector</th>
                <th>Stage</th>
                <th>Funded</th>
              </tr>
            </thead>
            <tbody>
              {p.length === 0 && (
                <tr><td colSpan={4} className="text-ink-400 text-center py-6">No portfolio companies in the joined panel.</td></tr>
              )}
              {p.map((r, i) => (
                <tr key={i}>
                  <td className="font-medium text-ink-900">{r.name}</td>
                  <td>{r.sector || "—"}</td>
                  <td><StatusPill className="!text-[0.6rem]">{r.round_type || "—"}</StatusPill></td>
                  <td className="num">{r.first_funded?.slice(0, 10) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="space-y-3">
        <MetricCard label="Acquisitions" value={fmtInt(profile.exits.acquisitions)} accent="ok" />
        <MetricCard label="IPOs" value={fmtInt(profile.exits.ipos)} accent="ok" />
        <MetricCard
          label="Total realised"
          value={fmtInt(totalExits)}
          sub="exits in panel"
          accent="gold"
        />
      </div>
    </div>
  );
}
