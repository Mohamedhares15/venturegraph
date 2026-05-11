"use client";
import { useState, useTransition } from "react";
import { ShieldCheck, Loader2, Download, Lock, FileWarning } from "lucide-react";
import { issueAuditReceipt, type AuditResponse, type SignalType } from "./actions";
import { Card, CardLabel } from "@/components/ui/Card";
import { HashPill } from "@/components/ui/HashPill";
import { StatusPill } from "@/components/ui/StatusPill";
import { Section } from "@/components/ui/Section";

const SECTORS = [
  { code: "IGV",  label: "IGV — Software & Services (Tech)" },
  { code: "SOXX", label: "SOXX — Semiconductors" },
  { code: "XBI",  label: "XBI — Biotechnology" },
  { code: "XLF",  label: "XLF — Financials & Fintech" },
  { code: "FDN",  label: "FDN — Internet & Digital" },
];

const SIGNAL_TYPES: SignalType[] = ["TPS leaderboard", "SMS silence score", "Community membership"];

export function AuditVaultClient() {
  const [sector, setSector] = useState("IGV");
  const [evalDate, setEvalDate] = useState("2011-12-31");
  const [signalType, setSignalType] = useState<SignalType>("TPS leaderboard");
  const [resp, setResp] = useState<AuditResponse | null>(null);
  const [pending, startTransition] = useTransition();

  const onIssue = () => {
    startTransition(async () => {
      const r = await issueAuditReceipt({ sector, evalDate, signalType });
      setResp(r);
    });
  };

  const onExport = () => {
    if (!resp || !resp.ok) return;
    const blob = new Blob([JSON.stringify(resp, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_receipt_${resp.receipt.receiptHash.slice(0, 12)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Form */}
      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-5">
        <Card className="!p-5">
          <CardLabel>Evaluation parameters</CardLabel>
          <p className="text-[0.85rem] text-ink-500 mt-1 mb-4">
            Pick what you want to seal. The system computes the signal point-in-time and binds
            it to the protocol via SHA-256.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-[0.7rem] font-mono uppercase tracking-wider text-gold-700 font-semibold mb-1.5">
                Target sector (ETF proxy)
              </label>
              <select
                className="sov-input"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
              >
                {SECTORS.map((s) => (
                  <option key={s.code} value={s.code}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[0.7rem] font-mono uppercase tracking-wider text-gold-700 font-semibold mb-1.5">
                Evaluation date (point-in-time)
              </label>
              <input
                type="date"
                className="sov-input font-mono"
                value={evalDate}
                onChange={(e) => setEvalDate(e.target.value)}
                min="2006-01-01"
                max="2013-12-31"
              />
            </div>
            <div>
              <label className="block text-[0.7rem] font-mono uppercase tracking-wider text-gold-700 font-semibold mb-1.5">
                Signal to evaluate
              </label>
              <div className="space-y-1.5">
                {SIGNAL_TYPES.map((t) => (
                  <label
                    key={t}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                      signalType === t
                        ? "bg-gold-50 border-gold-300 text-ink-900"
                        : "bg-paper-200 border-ink-100 hover:bg-paper-300"
                    }`}
                  >
                    <input
                      type="radio"
                      checked={signalType === t}
                      onChange={() => setSignalType(t)}
                      className="accent-gold-700"
                    />
                    <span className="text-[0.92rem]">{t}</span>
                  </label>
                ))}
              </div>
            </div>
            <button
              onClick={onIssue}
              disabled={pending}
              className="sov-btn sov-btn--primary w-full mt-2"
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
              {pending ? "Sealing…" : "Evaluate + Seal"}
            </button>
          </div>
        </Card>

        <div>
          {!resp && (
            <Card variant="info" className="h-full flex flex-col items-center justify-center text-center !p-8">
              <Lock size={32} strokeWidth={1.4} className="text-info-500 mb-3" />
              <CardLabel>Audit receipt</CardLabel>
              <p className="text-ink-600 mt-2 max-w-md text-[0.92rem] leading-relaxed">
                Configure the parameters and press <b className="text-ink-900">Evaluate + Seal</b>{" "}
                to produce a tamper-evident receipt binding the protocol, the input dataset, the
                output payload, and the seal time.
              </p>
            </Card>
          )}

          {resp && !resp.ok && (
            <Card variant="warn" className="h-full flex items-center !p-6">
              <FileWarning className="text-warn-700 mr-3" />
              <div>
                <CardLabel className="!text-warn-700">Could not issue</CardLabel>
                <p className="text-ink-700 mt-1">{resp.error}</p>
              </div>
            </Card>
          )}

          {resp && resp.ok && <ReceiptPanel resp={resp} onExport={onExport} />}
        </div>
      </div>

      {/* Payload */}
      {resp && resp.ok && resp.payload.length > 0 && (
        <Section
          label="Sealed payload"
          title={`${resp.receipt.signalType} — top ${resp.payload.length} rows`}
          description="The exact rows whose hash is bound into the receipt."
        >
          <Card>
            <div className="overflow-x-auto">
              <table className="sov-table">
                <thead>
                  <tr>
                    {Object.keys(resp.payload[0]).map((k) => (
                      <th key={k}>{k.replace(/_/g, " ")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resp.payload.map((row, i) => (
                    <tr key={i}>
                      {Object.entries(row).map(([k, v]) => (
                        <td key={k} className={typeof v === "number" ? "num" : ""}>
                          {typeof v === "number" && Math.abs(v) < 100
                            ? Number(v).toFixed(4)
                            : typeof v === "number"
                            ? v.toLocaleString()
                            : String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Section>
      )}

      {/* Why this matters callout */}
      <Card variant="info" className="!p-5">
        <CardLabel>Why this matters</CardLabel>
        <p className="text-ink-600 mt-2 text-[0.92rem] leading-relaxed">
          Pitchbook, CB Insights, Magnitt, and comparable platforms publish investor scores
          <b className="text-ink-900"> without</b> this hash chain. A regulator asking{" "}
          <em className="text-gold-700">&ldquo;on what data was this score computed, and has the protocol since been modified?&rdquo;</em>{" "}
          cannot be answered by those platforms. It can be answered here by re-running the same
          parameters and comparing the receipt hash. This is the property a compliance officer requires.
        </p>
      </Card>
    </div>
  );
}

function ReceiptPanel({ resp, onExport }: { resp: Extract<AuditResponse, { ok: true }>; onExport: () => void }) {
  const r = resp.receipt;
  return (
    <Card variant="ok" className="!p-5 sov-fade-up h-full">
      <div className="flex items-start gap-4">
        <div className="sov-seal !w-16 !h-16 !text-[0.55rem] flex-shrink-0">
          ISSUED<br />SHA-256
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <CardLabel className="!text-ok-700">✓ Receipt issued</CardLabel>
              <h3 className="text-[1.1rem] font-semibold text-ink-900 mt-1">
                {r.signalType}{" "}
                <span className="text-ink-400 font-normal">·</span>{" "}
                <span className="font-mono text-gold-700">{r.sector}</span>
              </h3>
              <p className="text-[0.85rem] text-ink-500">{r.sectorName} · point-in-time {r.evalDate}</p>
            </div>
            <button onClick={onExport} className="sov-btn sov-btn--ghost !px-3 !py-1.5 !text-[0.78rem]">
              <Download size={13} strokeWidth={1.7} /> JSON
            </button>
          </div>

          <div className="space-y-2.5 mt-4">
            <ReceiptRow label="Receipt hash"  hash={r.receiptHash}  variant="ok" />
            <ReceiptRow label="Protocol hash" hash={r.protocolHash} variant="gold" />
            <ReceiptRow label="Input hash"    hash={r.inputHash}    variant="ink" />
            <ReceiptRow label="Output hash"   hash={r.outputHash}   variant="ink" />
          </div>
          <div className="flex items-center gap-3 mt-4 pt-3 border-t border-ink-100 text-[0.78rem] text-ink-500">
            <StatusPill className="!text-[0.6rem]">Sealed</StatusPill>
            <span className="font-mono">{r.sealedAtUtc}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ReceiptRow({ label, hash, variant }: { label: string; hash: string; variant: "ok" | "gold" | "ink" }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-gold-700 font-semibold whitespace-nowrap w-28">
        {label}
      </span>
      <HashPill hash={hash} truncate={32} variant={variant} />
    </div>
  );
}
