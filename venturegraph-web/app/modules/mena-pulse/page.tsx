import type { Metadata } from "next";
import {
  BarChart, Bar, Cell, PieChart, Pie,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "@/components/ui/Charts";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import { fmtInt, groupBy } from "@/lib/utils";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "MENA Pulse · VentureGraph Sovereign" };

// Countries to consider "MENA-region" in Crunchbase data
const MENA_COUNTRIES = new Set([
  "ARE", "SAU", "EGY", "JOR", "LBN", "KWT", "BHR", "QAT", "OMN", "YEM",
  "IRQ", "SYR", "PSE", "TUN", "DZA", "MAR", "LBY", "SDN", "IRN", "PAK",
  "UAE", "SA",  "EG",  "JO",  "LB",  "KW",  "BH",  "QA",  "OM",  "TN",
  "MA",  "DZ",  "MR",  "DJ",  "SO",
]);
const GCC_COUNTRIES = new Set(["ARE", "SAU", "KWT", "BHR", "QAT", "OMN", "UAE", "SA", "KW", "BH", "QA", "OM"]);

export default async function MenaPulsePage() {
  const m = moduleBySlug("mena-pulse")!;

  type Obj = Record<string, unknown>;
  type MenaJson = { objects: Obj[]; investments: Obj[]; acquisitions: Obj[]; ipos: Obj[] };
  let menaData: MenaJson = { objects: [], investments: [], acquisitions: [], ipos: [] };
  try {
    const p = join(process.cwd(), "public", "data", "mena_data.json");
    menaData = JSON.parse(readFileSync(p, "utf-8")) as MenaJson;
  } catch {
    try {
      // Vercel serverless fallback: webpack bundles require() at build time
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      menaData = require("../../../public/data/mena_data.json") as MenaJson;
    } catch { /* JSON not found — page will show zeros */ }
  }
  const menaObjects = menaData.objects;
  const invPanel    = menaData.investments;
  const acq         = menaData.acquisitions;
  const ipos        = menaData.ipos;

  const gccObjects = menaObjects.filter(
    (o) => GCC_COUNTRIES.has(String(o.country_code ?? "").toUpperCase()),
  );

  // Country breakdown
  const countryMap  = groupBy(menaObjects, (o) => String(o.country_code ?? "??").toUpperCase());
  const countryBar  = [...countryMap.entries()]
    .map(([country, items]) => ({ country, count: items.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // Category breakdown for MENA
  const catMap = groupBy(menaObjects, (o) => String(o.category_code ?? "other").toLowerCase());
  const catBar = [...catMap.entries()]
    .map(([cat, items]) => ({ cat, count: items.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // ── MENA-invested companies from invPanel ─────────────────────────────
  const menaObjectIds = new Set(menaObjects.map((o) => String(o.id)));
  const menaInvRows   = invPanel.filter(
    (r) => r.funded_object_id && menaObjectIds.has(String(r.funded_object_id)),
  );
  const menaInvestors = new Set(
    menaInvRows.filter((r) => r.investor_name).map((r) => String(r.investor_name)),
  );
  const topMenaInvestors = [...groupBy(menaInvRows, (r) => String(r.investor_name ?? ""))]
    .map(([investor, rows]) => ({ investor, deals: rows.length }))
    .filter((x) => x.investor && x.investor !== "undefined")
    .sort((a, b) => b.deals - a.deals)
    .slice(0, 15);

  // ── MENA exits ────────────────────────────────────────────────────────
  const menaAcq = acq.filter(
    (a) => a.acquired_object_id && menaObjectIds.has(String(a.acquired_object_id)),
  );
  const menaIpo = ipos.filter(
    (i) => i.object_id && menaObjectIds.has(String(i.object_id)),
  );

  // Deal flow by year from invPanel
  const yearMap = groupBy(
    menaInvRows.filter((r) => r.funded_at),
    (r) => String(r.funded_at ?? "").slice(0, 4),
  );
  const flowByYear = [...yearMap.entries()]
    .map(([year, rows]) => ({ year, deals: rows.length }))
    .filter((x) => /^\d{4}$/.test(x.year))
    .sort((a, b) => a.year.localeCompare(b.year));

  const PIE_COLORS = ["#8a6a14", "#1a4f8b", "#0e7a3f", "#7c3aed", "#a35a00", "#d04444", "#94a3b8", "#0b1f3a"];

  return (
    <div className="sov-fade-up">
      <ModuleHero
        num={m.num}
        floor="FLOOR 05 · REGIONAL & META"
        title={m.title}
        tagline={m.tagline}
        actions={
          <>
            <StatusPill variant="ok"><span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse"/>Live</StatusPill>
            <StatusPill>GCC + Levant</StatusPill>
          </>
        }
      >
        Regional view of MENA-headquartered companies, GCC-only subset, country breakdowns,
        MENA-active investors, and realised regional exits — all drawn from the same sealed
        Crunchbase panel.
      </ModuleHero>

      {/* Key stats */}
      <Section label="Regional snapshot" title="MENA summary statistics">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard label="MENA companies" value={fmtInt(menaObjects.length)} sub="all entity types" accent="gold" />
          <MetricCard label="GCC subset"     value={fmtInt(gccObjects.length)} sub="core 6 + UAE" accent="info" />
          <MetricCard label="MENA investors" value={fmtInt(menaInvestors.size)} sub="active in region" accent="ink" />
          <MetricCard label="Deal events"    value={fmtInt(menaInvRows.length)} sub="attributed deals" accent="ok" />
          <MetricCard
            label="Realised exits"
            value={fmtInt(menaAcq.length + menaIpo.length)}
            sub={`${menaAcq.length} acq · ${menaIpo.length} IPO`}
            accent="warn"
          />
        </div>
      </Section>

      {/* Country + category */}
      <div className="grid lg:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardLabel>Top 15 countries by entity count</CardLabel>
          <div className="h-[380px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={countryBar} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="country" width={55} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#8a6a14" radius={[0, 3, 3, 0]}>
                  {countryBar.map((_, i) => (
                    <Cell key={i} fill={GCC_COUNTRIES.has(countryBar[i].country) ? "#0e7a3f" : "#8a6a14"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[0.75rem] text-ink-400 mt-2">Green = GCC member. Gold = wider MENA.</p>
        </Card>

        <Card>
          <CardLabel>Category distribution in MENA</CardLabel>
          <div className="h-[380px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={catBar}
                  dataKey="count"
                  nameKey="cat"
                  innerRadius={55}
                  outerRadius={110}
                  paddingAngle={1}
                >
                  {catBar.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Deal flow by year */}
      {flowByYear.length > 0 && (
        <Section label="Deal flow" title="MENA-attributed investment events by year">
          <Card>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={flowByYear} margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="deals" fill="#1a4f8b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Section>
      )}

      {/* Top investors active in MENA */}
      <Section label="Investor activity" title="Top 15 investors by MENA deal count">
        <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
          <Card>
            <div className="h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topMenaInvestors} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="investor" width={170} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="deals" fill="#1a4f8b" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="space-y-3">
            <Card variant="ok">
              <CardLabel className="!text-ok-700">Acquisitions</CardLabel>
              <div className="sov-metric-value mt-1">{menaAcq.length}</div>
              <div className="sov-metric-sub">MENA companies acquired</div>
            </Card>
            <Card variant="info">
              <CardLabel className="!text-info-700">IPOs</CardLabel>
              <div className="sov-metric-value mt-1">{menaIpo.length}</div>
              <div className="sov-metric-sub">MENA companies public</div>
            </Card>
            <Card>
              <CardLabel>Countries represented</CardLabel>
              <div className="sov-metric-value mt-1">{countryMap.size}</div>
              <div className="sov-metric-sub">in MENA entity set</div>
            </Card>
          </div>
        </div>
      </Section>
    </div>
  );
}
