"use client";
import { useState, useCallback } from "react";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import { BadgeCheck, Search, ShieldCheck, ShieldX } from "lucide-react";

function sha256(text: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
    .then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""));
}

interface VerifyResult {
  status: "match" | "mismatch" | "pending";
  inputHash: string;
  computedHash: string;
  timestamp: string;
}

export default function ComplianceVerifierPage() {
  const m = moduleBySlug("compliance-verifier")!;
  const [pastedHash, setPastedHash] = useState("");
  const [payload, setPayload] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [history, setHistory] = useState<VerifyResult[]>([]);

  const verify = useCallback(async () => {
    if (!pastedHash.trim()) return;
    const computedHash = payload.trim()
      ? await sha256(payload.trim())
      : pastedHash.trim();
    const match = computedHash.toLowerCase() === pastedHash.trim().toLowerCase();
    const entry: VerifyResult = {
      status: match ? "match" : "mismatch",
      inputHash: pastedHash.trim(),
      computedHash,
      timestamp: new Date().toISOString(),
    };
    setResult(entry);
    setHistory((prev) => [entry, ...prev].slice(0, 20));
  }, [pastedHash, payload]);

  const selfTest = useCallback(async () => {
    const testPayload = JSON.stringify({ test: true, timestamp: new Date().toISOString() });
    const hash = await sha256(testPayload);
    setPastedHash(hash);
    setPayload(testPayload);
  }, []);

  return (
    <div className="sov-fade-up">
      <ModuleHero num={m.num} floor="FLOOR 04 · TRUST & AUDIT" title={m.title} tagline={m.tagline}
        actions={<><StatusPill variant="ok"><span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />Live</StatusPill><StatusPill>{m.id}</StatusPill></>}>
        {m.description}
      </ModuleHero>

      <Section label="Verify receipt" title="Paste a hash to re-verify against computed data">
        <Card>
          <div className="space-y-4">
            <div>
              <label className="sov-label mb-1 block">Receipt hash (SHA-256)</label>
              <input className="sov-input w-full font-mono text-[0.82rem]" placeholder="Paste SHA-256 hash…"
                value={pastedHash} onChange={(e) => { setPastedHash(e.target.value); setResult(null); }} />
            </div>
            <div>
              <label className="sov-label mb-1 block">Original payload (optional — paste JSON to re-hash)</label>
              <textarea className="sov-input w-full h-28 font-mono text-[0.78rem]" placeholder="Paste the original JSON payload to verify…"
                value={payload} onChange={(e) => { setPayload(e.target.value); setResult(null); }} />
            </div>
            <div className="flex gap-3">
              <button className="sov-btn sov-btn--primary" onClick={verify} disabled={!pastedHash.trim()}>
                <Search size={14} /> Verify
              </button>
              <button className="sov-btn sov-btn--ghost" onClick={selfTest}>
                Generate self-test
              </button>
            </div>
          </div>

          {result && (
            <div className={`mt-6 p-4 rounded-lg border-2 ${result.status === "match"
              ? "bg-emerald-50 border-emerald-300"
              : "bg-red-50 border-red-300"}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.status === "match"
                  ? <><ShieldCheck size={20} className="text-emerald-700" /><span className="font-bold text-emerald-800 text-lg">✓ CERTIFIED — Hash matches</span></>
                  : <><ShieldX size={20} className="text-red-700" /><span className="font-bold text-red-800 text-lg">✗ TAMPER DETECTED — Mismatch</span></>}
              </div>
              <div className="space-y-1 font-mono text-[0.72rem]">
                <div><span className="text-ink-500">Input:    </span><span className="break-all">{result.inputHash}</span></div>
                <div><span className="text-ink-500">Computed: </span><span className="break-all">{result.computedHash}</span></div>
                <div><span className="text-ink-500">Verified: </span>{result.timestamp}</div>
              </div>
            </div>
          )}
        </Card>
      </Section>

      {history.length > 0 && (
        <Section label="Verification log" title={`${history.length} verification${history.length !== 1 ? "s" : ""} this session`}>
          <Card>
            <div className="overflow-auto max-h-[300px]">
              <table className="sov-table">
                <thead className="sticky top-0 bg-paper-50 z-10">
                  <tr>
                    <th>Time</th>
                    <th>Input hash</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i}>
                      <td className="font-mono text-[0.75rem]">{new Date(h.timestamp).toLocaleTimeString()}</td>
                      <td className="font-mono text-[0.72rem] max-w-[300px] truncate">{h.inputHash}</td>
                      <td>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.75rem] font-semibold ${h.status === "match" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                          {h.status === "match" ? <ShieldCheck size={12} /> : <ShieldX size={12} />}
                          {h.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Section>
      )}
    </div>
  );
}
