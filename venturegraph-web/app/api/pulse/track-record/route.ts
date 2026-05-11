import { NextResponse } from "next/server";
import { fetchTrackRecord, fetchRecentEvents } from "@/lib/pulse";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET() {
  try {
    const [record, events] = await Promise.all([
      fetchTrackRecord(),
      fetchRecentEvents(30),
    ]);
    return NextResponse.json({
      record,
      recent_events: events,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[api/pulse/track-record]", e);
    return NextResponse.json({ record: null, error: "Failed to fetch" }, { status: 500 });
  }
}
