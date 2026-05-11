// SHA-256 helpers — server-side only (Node crypto)
import crypto from "node:crypto";
import fs from "node:fs/promises";

export function sha256(input: string | Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function sha256Obj(obj: unknown): string {
  // Stable JSON: sort object keys recursively
  const stringify = (val: unknown): string => {
    if (val === null || typeof val !== "object") return JSON.stringify(val);
    if (Array.isArray(val)) return "[" + val.map(stringify).join(",") + "]";
    const keys = Object.keys(val as Record<string, unknown>).sort();
    return (
      "{" +
      keys
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            stringify((val as Record<string, unknown>)[k])
        )
        .join(",") +
      "}"
    );
  };
  return sha256(stringify(obj));
}

export async function sha256File(filePath: string): Promise<string | null> {
  try {
    const data = await fs.readFile(filePath);
    return sha256(data);
  } catch {
    return null;
  }
}

// Build a tamper-evident audit receipt that mirrors the Python pipeline's structure
export function buildReceipt(params: {
  module: string;
  inputs: unknown;
  output: unknown;
  protocolHash: string;
}): {
  module: string;
  inputs: unknown;
  inputHash: string;
  outputHash: string;
  protocolHash: string;
  sealedAtUtc: string;
  receiptHash: string;
  issuer: string;
} {
  const inputHash = sha256Obj(params.inputs);
  const outputHash = sha256Obj(params.output);
  const sealedAtUtc = new Date().toISOString();
  const receipt = {
    module: params.module,
    inputs: params.inputs,
    inputHash,
    outputHash,
    protocolHash: params.protocolHash,
    sealedAtUtc,
    issuer: "VentureGraph Sovereign · EUI · C-DE422",
  };
  return { ...receipt, receiptHash: sha256Obj(receipt) };
}
