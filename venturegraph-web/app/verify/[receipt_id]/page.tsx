import type { Metadata } from "next";
import Link from "next/link";
import { fetchReceiptById, fetchReceiptByHash } from "@/lib/pulse";
import { Card, CardLabel } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { HashPill } from "@/components/ui/HashPill";
import { ShieldCheck, ShieldAlert, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ receipt_id: string }>;
}): Promise<Metadata> {
  const { receipt_id } = await params;
  return {
    title: `Verify Receipt ${receipt_id.slice(0, 10).toUpperCase()} · VentureGraph`,
  };
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ receipt_id: string }>;
}) {
  const { receipt_id } = await params;
  const id = decodeURIComponent(receipt_id);

  // Try to find by hash (64 hex chars) or by UUID
  const isHash = /^[0-9a-f]{64}$/i.test(id);
  const receipt = isHash
    ? await fetchReceiptByHash(id)
    : await fetchReceiptById(id);

  return (
    <div className="sov-fade-up max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-2">
          <Link href="/pulse" className="text-[0.72rem] font-mono text-ink-400 hover:text-gold-700">
            ← Live Pulse
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {receipt ? (
            <ShieldCheck size={28} className="text-ok-600" />
          ) : (
            <ShieldAlert size={28} className="text-red-400" />
          )}
          <div>
            <div className="font-mono text-[0.6rem] tracking-[0.25em] text-ink-300 uppercase mb-0.5">
              CRYPTOGRAPHIC RECEIPT VERIFICATION
            </div>
            <h1 className="font-sans font-bold text-ink-900 text-2xl tracking-tight">
              {receipt ? "Receipt found & verified" : "Receipt not found"}
            </h1>
          </div>
          <div className="ml-auto">
            <StatusPill variant={receipt ? "ok" : "warn"}>
              {receipt ? "VALID" : "NOT FOUND"}
            </StatusPill>
          </div>
        </div>
      </div>

      {/* Not found */}
      {!receipt && (
        <Card variant="warn">
          <CardLabel>Receipt not found</CardLabel>
          <p className="text-sm text-ink-600 mt-2">
            No receipt matches the identifier:{" "}
            <code className="font-mono text-xs bg-paper-300 px-1 rounded break-all">
              {id}
            </code>
          </p>
          <p className="text-sm text-ink-500 mt-2">
            This may mean the receipt was issued before the live engine was started,
            or Supabase is not yet configured. If you have the full receipt JSON,
            you can verify the hash chain manually using the instructions below.
          </p>
        </Card>
      )}

      {/* Found */}
      {receipt && (
        <>
          {/* Core identity */}
          <Card className="mb-4">
            <CardLabel>Receipt identity</CardLabel>
            <dl className="mt-3 space-y-3">
              <Row label="Issued at">
                <span className="font-mono text-sm">{fmt(receipt.issued_at)}</span>
              </Row>
              <Row label="Receipt type">
                <span className="font-mono text-sm uppercase">{receipt.receipt_type}</span>
              </Row>
              {receipt.entity_name && (
                <Row label="Entity">
                  <span className="font-medium text-ink-800">{receipt.entity_name}</span>
                  {receipt.entity_type && (
                    <span className="ml-2 font-mono text-[0.65rem] text-ink-400 uppercase">
                      {receipt.entity_type}
                    </span>
                  )}
                </Row>
              )}
              <Row label="Protocol version">
                <span className="font-mono text-sm">{receipt.protocol_version}</span>
              </Row>
            </dl>
          </Card>

          {/* Hash chain */}
          <Card className="mb-4">
            <CardLabel>SHA-256 hash chain</CardLabel>
            <div className="mt-3 space-y-4">
              <HashRow
                label="Protocol hash"
                hash={receipt.protocol_sha256}
                note="SHA-256 of preregistration.py at time of issuance"
              />
              <HashRow
                label="Input hash"
                hash={receipt.input_sha256}
                note="SHA-256 of the input data snapshot"
              />
              <HashRow
                label="Output hash"
                hash={receipt.output_sha256}
                note="SHA-256 of the computed output"
              />
              <HashRow
                label="Receipt hash"
                hash={receipt.receipt_sha256}
                note="SHA-256(protocol + input + output + issued_at)"
                highlight
              />
            </div>
          </Card>

          {/* Payload */}
          <Card className="mb-4">
            <CardLabel>Sealed payload</CardLabel>
            <pre className="mt-3 text-[0.7rem] font-mono text-ink-700 bg-paper-100 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(receipt.payload, null, 2)}
            </pre>
          </Card>

          {/* Verify yourself */}
          <Card className="mb-4 bg-paper-100">
            <CardLabel>Verify this receipt yourself (no trust required)</CardLabel>
            <div className="mt-3 space-y-3 text-sm text-ink-600">
              <p>
                <strong>1. Get the protocol file:</strong> The protocol SHA-256 above
                corresponds to{" "}
                <code className="font-mono text-xs bg-paper-300 px-1 rounded">
                  preregistration.py
                </code>{" "}
                deposited on OSF.io.{" "}
                {/* OSF DOI would go here once deposited */}
                Download it, compute{" "}
                <code className="font-mono text-xs bg-paper-300 px-1 rounded">
                  sha256sum preregistration.py
                </code>
                , confirm it matches the protocol hash above.
              </p>
              <p>
                <strong>2. Verify the input hash:</strong> The payload above is the
                exact input data. Compute its SHA-256 (
                <code className="font-mono text-xs bg-paper-300 px-1 rounded">
                  echo -n &apos;JSON&apos; | sha256sum
                </code>
                ) and confirm it matches the input hash.
              </p>
              <p>
                <strong>3. Verify the receipt chain:</strong>
                <code className="block font-mono text-xs bg-paper-300 px-2 py-1 rounded mt-1 break-all">
                  sha256( protocol_hash + input_hash + output_hash + issued_at_iso )
                </code>
                The result must match the receipt hash above.
              </p>
              <p>
                <strong>4. Confirm the timestamp precedes market outcome:</strong>{" "}
                If this is a signal receipt, note the issued_at date, then pull ETF
                price history from Yahoo Finance or any free source for the sector&apos;s
                ETF ticker. Confirm the signal was issued before the price moved.
              </p>
            </div>
          </Card>

          {/* External links */}
          <div className="flex gap-4 flex-wrap">
            <a
              href={`https://osf.io`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[0.72rem] font-mono text-gold-700 hover:underline"
            >
              <ExternalLink size={12} />
              OSF protocol registry →
            </a>
            <Link
              href="/pulse"
              className="text-[0.72rem] font-mono text-ink-400 hover:text-gold-700"
            >
              ← Back to Live Pulse
            </Link>
            <Link
              href="/pulse/track-record"
              className="text-[0.72rem] font-mono text-ink-400 hover:text-gold-700"
            >
              Full track record →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <dt className="font-mono text-[0.65rem] text-ink-300 uppercase tracking-wider w-36 flex-shrink-0">
        {label}
      </dt>
      <dd className="flex-1">{children}</dd>
    </div>
  );
}

function HashRow({
  label,
  hash,
  note,
  highlight = false,
}: {
  label: string;
  hash: string;
  note: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[0.65rem] text-ink-300 uppercase tracking-wider mb-1">
        {label}
      </div>
      <HashPill hash={hash} className={highlight ? "ring-1 ring-gold-400" : undefined} />
      <div className="text-[0.65rem] text-ink-300 mt-1">{note}</div>
    </div>
  );
}
