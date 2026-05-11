import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { sha256File } from "@/lib/crypto";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import path from "node:path";

export const runtime = "nodejs";

// ── SHA-256 receipt chain ────────────────────────────────────────────────────
function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function sha256Json(obj: unknown): string {
  return sha256(JSON.stringify(obj, Object.keys(obj as object).sort()));
}

function receiptChain(
  protocolHash: string,
  inputHash: string,
  outputHash: string,
  issuedAt: string
): string {
  return sha256(protocolHash + inputHash + outputHash + issuedAt);
}

// ── POST /api/entity/seal ─────────────────────────────────────────────────────
// Body: { entity_name, entity_type, payload }
// Returns: receipt object with SHA-256 chain
export async function POST(request: Request) {
  let body: {
    entity_name?: string;
    entity_type?: string;
    payload?: Record<string, unknown>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { entity_name, entity_type, payload } = body;
  if (!entity_name || !payload) {
    return NextResponse.json(
      { error: "entity_name and payload are required" },
      { status: 400 }
    );
  }

  // Protocol hash
  const protoPath = path.resolve(process.cwd(), "..", "preregistration.py");
  const protocolHash = (await sha256File(protoPath)) ?? "PROTOCOL_NOT_FOUND";

  const issuedAt    = new Date().toISOString();
  const inputData   = { entity_name, entity_type, payload };
  const outputData  = { entity_name, snapshot_at: issuedAt, ...payload };

  const inputHash   = sha256Json(inputData);
  const outputHash  = sha256Json(outputData);
  const receiptHash = receiptChain(protocolHash, inputHash, outputHash, issuedAt);

  const receipt = {
    receipt_type:     "entity_snapshot",
    entity_name:      entity_name.slice(0, 200),
    entity_type:      entity_type ?? "unknown",
    payload:          outputData,
    protocol_version: "v1.0",
    protocol_sha256:  protocolHash,
    input_sha256:     inputHash,
    output_sha256:    outputHash,
    receipt_sha256:   receiptHash,
    issued_at:        issuedAt,
    verifiable_at_url: `/verify/${receiptHash}`,
  };

  // Write to Supabase if configured
  let savedId: string | null = null;
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    if (sb) {
      const { data, error } = await sb
        .from("receipts")
        .insert([receipt])
        .select("id")
        .maybeSingle();
      if (!error && data) savedId = data.id;
    }
  }

  return NextResponse.json({
    ...receipt,
    id: savedId,
    verify_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/verify/${receiptHash}`,
  });
}
