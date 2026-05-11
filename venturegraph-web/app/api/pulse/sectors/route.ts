import { NextResponse } from "next/server";
import { fetchLiveSmsScores } from "@/lib/pulse";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET() {
  try {
    const scores = await fetchLiveSmsScores();
    return NextResponse.json({ scores, updated_at: new Date().toISOString() });
  } catch (e) {
    console.error("[api/pulse/sectors]", e);
    return NextResponse.json({ scores: [], error: "Failed to fetch" }, { status: 500 });
  }
}
