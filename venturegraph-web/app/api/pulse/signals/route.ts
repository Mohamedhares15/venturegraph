import { NextResponse } from "next/server";
import { fetchActiveSignals, fetchAllSignalsWithOutcomes } from "@/lib/pulse";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "active";

  try {
    if (mode === "all") {
      const signals = await fetchAllSignalsWithOutcomes(50);
      return NextResponse.json({ signals, updated_at: new Date().toISOString() });
    }
    const signals = await fetchActiveSignals(20);
    return NextResponse.json({ signals, updated_at: new Date().toISOString() });
  } catch (e) {
    console.error("[api/pulse/signals]", e);
    return NextResponse.json({ signals: [], error: "Failed to fetch" }, { status: 500 });
  }
}
