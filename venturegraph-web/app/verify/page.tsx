"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Search } from "lucide-react";
import { Card, CardLabel } from "@/components/ui/Card";

export default function VerifyIndexPage() {
  const router = useRouter();
  const [hash, setHash] = useState("");
  const [error, setError] = useState("");

  const handleVerify = () => {
    const clean = hash.trim();
    if (!clean) { setError("Paste a receipt hash or ID to verify"); return; }
    if (clean.length < 10) { setError("Hash too short — paste the full SHA-256 (64 chars) or UUID"); return; }
    setError("");
    router.push(`/verify/${encodeURIComponent(clean)}`);
  };

  return (
    <div className="sov-fade-up max-w-2xl mx-auto mt-12">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck size={32} className="text-ok-700" />
        <div>
          <div className="font-mono text-[0.6rem] tracking-[0.25em] text-ink-300 uppercase mb-0.5">
            CRYPTOGRAPHIC RECEIPT VERIFICATION
          </div>
          <h1 className="font-sans font-bold text-ink-900 text-2xl tracking-tight">
            Verify a Receipt
          </h1>
        </div>
      </div>

      <p className="text-ink-500 text-sm mb-8 max-w-xl">
        Every signal and entity snapshot issued by VentureGraph is sealed with a
        SHA-256 hash chain. Paste any receipt hash below to verify it — no login required.
      </p>

      <Card className="mb-6">
        <CardLabel>Enter receipt hash or ID</CardLabel>
        <div className="flex gap-2 mt-3">
          <input
            type="text"
            value={hash}
            onChange={(e) => setHash(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            placeholder="64-char SHA-256 hash or UUID…"
            className="flex-1 px-3 py-2 bg-paper-100 border border-ink-200 rounded-md
                       text-ink-800 text-sm font-mono placeholder:text-ink-300
                       focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
          <button
            onClick={handleVerify}
            className="sov-btn sov-btn--primary px-4 py-2 text-sm flex items-center gap-2"
          >
            <Search size={14} />
            Verify
          </button>
        </div>
        {error && <p className="text-red-600 text-xs mt-2 font-mono">{error}</p>}
      </Card>

      <Card className="bg-paper-100">
        <CardLabel>How the receipt chain works</CardLabel>
        <ol className="text-sm text-ink-600 mt-3 space-y-2 list-decimal list-inside">
          <li>
            <strong>Protocol hash</strong> — SHA-256 of{" "}
            <code className="font-mono text-xs bg-paper-300 px-1 rounded">
              preregistration.py
            </code>
            , deposited on OSF.io before any signal is computed.
          </li>
          <li>
            <strong>Input hash</strong> — SHA-256 of the exact input data snapshot
            (sector, SMS score, baseline, timestamp).
          </li>
          <li>
            <strong>Output hash</strong> — SHA-256 of the computed output (direction,
            contributing investors).
          </li>
          <li>
            <strong>Receipt hash</strong> —{" "}
            <code className="font-mono text-xs bg-paper-300 px-1 rounded">
              SHA256(protocol + input + output + issued_at)
            </code>
            . This is the public identifier you can verify independently.
          </li>
        </ol>
        <p className="text-xs text-ink-400 mt-3">
          Receipts are issued before market outcomes exist — the timestamp is the proof.
          Compare the issued_at date to any free ETF price history to verify the lead time.
        </p>
      </Card>
    </div>
  );
}
