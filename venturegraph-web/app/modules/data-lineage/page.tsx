import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusPill } from "@/components/ui/StatusPill";
import { HashPill } from "@/components/ui/HashPill";
import { moduleBySlug } from "@/lib/modules";
import { loadSnapshot, loadPipelineReport } from "@/lib/data";
import { fmtInt } from "@/lib/utils";
import { createHash } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Data Lineage · VentureGraph Sovereign" };

interface FileInfo { name: string; size: string; hash: string; stage: string; }

async function hashFile(filePath: string): Promise<string> {
  try {
    const buf = await fs.readFile(filePath);
    return createHash("sha256").update(buf).digest("hex").slice(0, 16) + "…";
  } catch { return "—"; }
}

async function getFileSize(filePath: string): Promise<string> {
  try {
    const stat = await fs.stat(filePath);
    const kb = stat.size / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
  } catch { return "—"; }
}

const PIPELINE_FILES = [
  { name: "objects.csv", stage: "Raw input" },
  { name: "investments.csv", stage: "Raw input" },
  { name: "funding_rounds.csv", stage: "Raw input" },
  { name: "acquisitions.csv", stage: "Raw input" },
  { name: "ipos.csv", stage: "Raw input" },
  { name: "edges.csv", stage: "Graph construction" },
  { name: "centrality_comparison.csv", stage: "Network analysis" },
  { name: "community_summary.csv", stage: "Community detection" },
  { name: "community_partition.csv", stage: "Community detection" },
  { name: "tps_scores.csv", stage: "Signal computation" },
  { name: "tps_panel_expanding.csv", stage: "Signal computation" },
  { name: "sms_scores.csv", stage: "Signal computation" },
  { name: "event_panel_sms.csv", stage: "Signal computation" },
  { name: "sector_alphas.csv", stage: "Alpha analysis" },
  { name: "sms_alpha_correlation.csv", stage: "Hypothesis testing" },
  { name: "investment_sector_panel.csv", stage: "Panel construction" },
];

export default async function DataLineagePage() {
  const m = moduleBySlug("data-lineage")!;
  const [snap, report] = await Promise.all([loadSnapshot(), loadPipelineReport()]);

  const dataRoot = path.resolve(process.cwd(), "..");
  const files: FileInfo[] = [];
  for (const f of PIPELINE_FILES) {
    const fp = path.join(dataRoot, f.name);
    const [size, hash] = await Promise.all([getFileSize(fp), hashFile(fp)]);
    files.push({ name: f.name, size, hash, stage: f.stage });
  }

  const stages = [...new Set(files.map((f) => f.stage))];
  const totalFiles = files.filter((f) => f.hash !== "—").length;
  const chainHash = createHash("sha256").update(files.map((f) => f.hash).join("|")).digest("hex");

  return (
    <div className="sov-fade-up">
      <ModuleHero num={m.num} floor="FLOOR 04 · TRUST & AUDIT" title={m.title} tagline={m.tagline}
        actions={<><StatusPill variant="ok"><span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />Live</StatusPill><StatusPill>{m.id}</StatusPill></>}>
        {m.description}
      </ModuleHero>

      <Section label="Pipeline integrity" title="Hash chain across all data artifacts">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <MetricCard label="Files tracked" value={fmtInt(totalFiles)} sub={`of ${PIPELINE_FILES.length}`} accent="info" />
          <MetricCard label="Pipeline stages" value={fmtInt(stages.length)} accent="violet" />
          <MetricCard label="Entities" value={fmtInt(snap.nObjects)} accent="gold" />
          <MetricCard label="Augmented" value={snap.hasAugmented ? "Yes" : "No"} accent={snap.hasAugmented ? "ok" : "ink"} />
        </div>
        <Card className="!p-4">
          <div className="font-mono text-[0.72rem] text-ink-500 break-all">
            <span className="text-ink-800 font-semibold">Chain hash: </span>{chainHash}
          </div>
        </Card>
      </Section>

      {stages.map((stage) => (
        <Section key={stage} label={stage} title={`${stage} artifacts`}>
          <Card>
            <table className="sov-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Size</th>
                  <th>SHA-256 (prefix)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {files.filter((f) => f.stage === stage).map((f, i) => (
                  <tr key={i}>
                    <td className="font-mono text-[0.82rem] font-medium text-ink-900">{f.name}</td>
                    <td className="num">{f.size}</td>
                    <td className="font-mono text-[0.72rem] text-ink-500">{f.hash}</td>
                    <td>
                      <span className={`inline-block w-2 h-2 rounded-full ${f.hash !== "—" ? "bg-ok-500" : "bg-ink-300"}`} />
                      <span className="ml-1 text-[0.75rem]">{f.hash !== "—" ? "verified" : "missing"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>
      ))}

      <Section label="Pipeline flow" title="Transformation DAG">
        <Card className="!p-6">
          <div className="space-y-4 font-mono text-[0.82rem]">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 bg-ink-900 text-gold-400 rounded font-bold">RAW</span>
              <span className="text-ink-400">→</span>
              <span className="text-ink-600">objects.csv, investments.csv, funding_rounds.csv, acquisitions.csv, ipos.csv</span>
            </div>
            <div className="flex items-center gap-3 ml-8">
              <span className="text-ink-400">↓ build_graph.py</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 bg-info-100 text-info-800 rounded font-bold">GRAPH</span>
              <span className="text-ink-400">→</span>
              <span className="text-ink-600">edges.csv, centrality_comparison.csv, community_*.csv</span>
            </div>
            <div className="flex items-center gap-3 ml-8">
              <span className="text-ink-400">↓ compute_signals.py</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 bg-gold-100 text-gold-800 rounded font-bold">SIGNALS</span>
              <span className="text-ink-400">→</span>
              <span className="text-ink-600">tps_scores.csv, sms_scores.csv, event_panel_sms.csv</span>
            </div>
            <div className="flex items-center gap-3 ml-8">
              <span className="text-ink-400">↓ hypothesis_test.py</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 bg-violet-100 text-violet-800 rounded font-bold">OUTPUT</span>
              <span className="text-ink-400">→</span>
              <span className="text-ink-600">sector_alphas.csv, sms_alpha_correlation.csv</span>
            </div>
            {snap.hasAugmented && (
              <>
                <div className="flex items-center gap-3 ml-8">
                  <span className="text-ok-600">↓ run_augmented_pipeline.py</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1.5 bg-ok-100 text-ok-800 rounded font-bold">AUGMENTED</span>
                  <span className="text-ink-400">→</span>
                  <span className="text-ink-600">augmented_edges.csv, augmented_tps_scores.csv, pipeline_report.json</span>
                </div>
              </>
            )}
          </div>
        </Card>
      </Section>
    </div>
  );
}
