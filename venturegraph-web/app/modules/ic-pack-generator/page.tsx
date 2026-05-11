"use client";
import { useEffect, useState, useCallback } from "react";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import { fmtInt } from "@/lib/utils";
import { FileText, Download, Shield } from "lucide-react";

const SECTORS: Record<string, string> = {
  IGV: "Software & Services (Tech)",
  SOXX: "Semiconductors",
  XBI: "Biotechnology",
  HACK: "Cybersecurity",
  FDN: "Internet & Digital",
};

interface SmsRow { sector: string; eval_date: string; sms_score: number; signal_dir?: string; }
interface TpsRow { investor: string; tps: number; portfolio_size: number; }

function sha256(text: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
    .then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""));
}

export default function IcPackGeneratorPage() {
  const m = moduleBySlug("ic-pack-generator")!;
  const [sector, setSector] = useState("IGV");
  const [sms, setSms] = useState<SmsRow[]>([]);
  const [tps, setTps] = useState<TpsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [memo, setMemo] = useState<string | null>(null);
  const [receipt, setReceipt] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/data?name=sms").then((r) => r.json()),
      fetch("/api/data?name=tps").then((r) => r.json()),
    ]).then(([s, t]) => {
      setSms(Array.isArray(s) ? s : []);
      setTps(Array.isArray(t) ? t : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const sectorSms = sms.filter((r) => r.sector === sector).sort((a, b) => (b.eval_date ?? "").localeCompare(a.eval_date ?? ""));
  const latestSms = sectorSms[0];
  const avgSms = sectorSms.length ? sectorSms.reduce((s, r) => s + Number(r.sms_score), 0) / sectorSms.length : 0;
  const topInvestors = [...tps].sort((a, b) => Number(b.tps) - Number(a.tps)).slice(0, 5);

  const generateMemo = useCallback(async () => {
    const ts = new Date().toISOString();
    const body = [
      `═══════════════════════════════════════════════`,
      `  VENTUREGRAPH — INVESTMENT COMMITTEE MEMO`,
      `═══════════════════════════════════════════════`,
      ``,
      `Sector:        ${SECTORS[sector]} (${sector})`,
      `Generated:     ${ts}`,
      ``,
      `── SMS Signal Summary ─────────────────────────`,
      `Latest SMS:    ${latestSms ? Number(latestSms.sms_score).toFixed(4) : "N/A"}`,
      `Direction:     ${latestSms?.signal_dir ?? "N/A"}`,
      `Avg SMS:       ${avgSms.toFixed(4)}`,
      `Observations:  ${sectorSms.length}`,
      ``,
      `── Top TPS Investors (cross-sector) ───────────`,
      ...topInvestors.map((r, i) => `  ${i + 1}. ${r.investor} — TPS ${Number(r.tps).toFixed(4)} (portfolio: ${r.portfolio_size})`),
      ``,
      `── Recommendation ────────────────────────────`,
      latestSms?.signal_dir === "bearish"
        ? `⚠ CAUTION: Bearish silence signal. Smart-money investors are withdrawing from ${SECTORS[sector]}.`
        : `✓ NEUTRAL/BULLISH: No bearish silence detected in ${SECTORS[sector]}.`,
      ``,
      `── Methodology ───────────────────────────────`,
      `SMS = −(TPS̄_active − TPS̄_silent) × log(n_silent + 1)`,
      `TPS = (1/N_i) Σ_k w_k × exit_k`,
      `All signals point-in-time safe.`,
      ``,
      `═══════════════════════════════════════════════`,
    ].join("\n");

    const hash = await sha256(body);
    setMemo(body + `\nSHA-256: ${hash}`);
    setReceipt(hash);
  }, [sector, latestSms, avgSms, sectorSms.length, topInvestors]);

  const downloadMemo = useCallback(() => {
    if (!memo) return;
    const blob = new Blob([memo], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `IC_Memo_${sector}_${new Date().toISOString().slice(0, 10)}.txt`; a.click();
    URL.revokeObjectURL(url);
  }, [memo, sector]);

  if (loading) return <div className="p-12 text-center text-ink-500">Loading sector data…</div>;

  return (
    <div className="sov-fade-up">
      <ModuleHero num={m.num} floor="FLOOR 05 · REGIONAL & META" title={m.title} tagline={m.tagline}
        actions={<><StatusPill variant="ok"><span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />Live</StatusPill><StatusPill>{m.id}</StatusPill></>}>
        {m.description}
      </ModuleHero>

      <Section label="Configuration" title="Select sector and generate memo">
        <Card>
          <div className="flex flex-wrap gap-3 mb-4">
            {Object.entries(SECTORS).map(([key, label]) => (
              <button key={key} onClick={() => { setSector(key); setMemo(null); setReceipt(""); }}
                className={`px-4 py-2 rounded-lg border-2 text-[0.85rem] font-medium transition-all ${sector === key ? "border-gold-500 bg-gold-50 text-gold-800" : "border-ink-100 hover:border-ink-200"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricCard label="SMS observations" value={fmtInt(sectorSms.length)} accent="info" />
            <MetricCard label="Latest SMS" value={latestSms ? Number(latestSms.sms_score).toFixed(4) : "—"} accent="gold" />
            <MetricCard label="Direction" value={latestSms?.signal_dir ?? "—"} accent={latestSms?.signal_dir === "bearish" ? "warn" : "ok"} />
            <MetricCard label="Avg SMS" value={avgSms.toFixed(4)} accent="ink" />
          </div>
          <button className="sov-btn sov-btn--primary" onClick={generateMemo}>
            <FileText size={14} /> Generate IC memo
          </button>
        </Card>
      </Section>

      {memo && (
        <Section label="Generated memo" title={`IC Pack — ${SECTORS[sector]}`}>
          <Card>
            <pre className="whitespace-pre-wrap font-mono text-[0.78rem] text-ink-700 bg-paper-100 p-5 rounded-lg border border-ink-100 max-h-[500px] overflow-auto">
              {memo}
            </pre>
            <div className="flex items-center gap-3 mt-4">
              <button className="sov-btn sov-btn--primary" onClick={downloadMemo}>
                <Download size={14} /> Download .txt
              </button>
              {receipt && (
                <span className="font-mono text-[0.72rem] text-ok-700">
                  <Shield size={12} className="inline mr-1" /> {receipt.slice(0, 24)}…
                </span>
              )}
            </div>
          </Card>
        </Section>
      )}
    </div>
  );
}
