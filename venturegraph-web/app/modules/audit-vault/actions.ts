"use server";
// Audit Vault — issue an SHA-256 receipt for an arbitrary signal evaluation.
import path from "node:path";
import { loadTps, loadSms, loadPartition, ETF_SECTOR } from "@/lib/data";
import { sha256File, sha256Obj, buildReceipt } from "@/lib/crypto";

export type SignalType = "TPS leaderboard" | "SMS silence score" | "Community membership";

export interface AuditReceipt {
  ok: true;
  receipt: {
    module: string;
    sector: string;
    sectorName: string;
    evalDate: string;
    signalType: SignalType;
    protocolHash: string;
    inputHash: string;
    outputHash: string;
    receiptHash: string;
    sealedAtUtc: string;
    issuer: string;
  };
  payload: Array<Record<string, string | number>>;
}
export interface AuditError { ok: false; error: string }
export type AuditResponse = AuditReceipt | AuditError;

export async function issueAuditReceipt(params: {
  sector: string;
  evalDate: string;
  signalType: SignalType;
}): Promise<AuditResponse> {
  const { sector, evalDate, signalType } = params;
  if (!sector || !evalDate || !signalType) {
    return { ok: false, error: "Missing parameters." };
  }

  const protoPath = path.resolve(process.cwd(), "..", "preregistration.py");
  const protocolHash = (await sha256File(protoPath)) ?? "PROTOCOL_FILE_MISSING";

  let payload: Array<Record<string, string | number>> = [];

  if (signalType === "TPS leaderboard") {
    const tps = await loadTps();
    payload = [...tps]
      .sort((a, b) => Number(b.tps) - Number(a.tps))
      .slice(0, 10)
      .map((r) => ({
        investor: String(r.investor ?? ""),
        tps: Number(r.tps) || 0,
        portfolio_size: Number(r.portfolio_size) || 0,
        out_degree: Number(r.out_degree) || 0,
      }));
  } else if (signalType === "SMS silence score") {
    const sms = await loadSms();
    const filtered = sms
      .filter((r) => r.sector === sector && String(r.eval_date) <= evalDate)
      .sort((a, b) => String(a.eval_date).localeCompare(String(b.eval_date)));
    payload = filtered.slice(-10).map((r) => ({
      eval_date: String(r.eval_date ?? ""),
      sector: String(r.sector ?? ""),
      n_expected: Number(r.n_expected) || 0,
      n_silent: Number(r.n_silent) || 0,
      sms_score: Number(r.sms_score) || 0,
      top_silenced_investors: String(r.top_silenced_investors ?? "—"),
    }));
  } else if (signalType === "Community membership") {
    const partition = await loadPartition();
    // Group by community → top 10 communities by member count
    const map = new Map<number, number>();
    partition.forEach((r) => {
      const k = Number(r.community_id);
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    payload = Array.from(map.entries())
      .map(([community_id, members]) => ({ community_id, members }))
      .sort((a, b) => b.members - a.members)
      .slice(0, 10);
  }

  const receipt = buildReceipt({
    module: "AUDIT_VAULT",
    inputs: { sector, evalDate, signalType },
    output: payload,
    protocolHash,
  });

  return {
    ok: true,
    receipt: {
      module: receipt.module,
      sector,
      sectorName: ETF_SECTOR[sector] ?? sector,
      evalDate,
      signalType,
      protocolHash: receipt.protocolHash,
      inputHash: receipt.inputHash,
      outputHash: receipt.outputHash,
      receiptHash: receipt.receiptHash,
      sealedAtUtc: receipt.sealedAtUtc,
      issuer: receipt.issuer,
    },
    payload,
  };
}
