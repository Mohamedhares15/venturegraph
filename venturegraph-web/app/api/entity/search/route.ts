import { NextResponse } from "next/server";
import { loadTps, loadObjects } from "@/lib/data";
import { matchInvestors } from "@/lib/fuzzy";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [], query: q });
  }

  try {
    const [tpsRows, objects] = await Promise.all([loadTps(), loadObjects()]);

    // Build investor universe
    const investorNames = tpsRows.map((r) => r.investor).filter(Boolean);

    // Match investors
    const investorMatches = matchInvestors([q], investorNames, 0.5)
      .filter((m) => m.score > 0.4)
      .map((m) => ({
        type: "investor" as const,
        name: m.matched ?? m.input,
        score: m.score,
        tps: tpsRows.find((r) => r.investor === m.matched)?.tps ?? null,
        portfolio_size: tpsRows.find((r) => r.investor === m.matched)?.portfolio_size ?? null,
      }));

    // Match companies from objects
    const qLower = q.toLowerCase();
    const companyMatches = objects
      .filter(
        (o) =>
          o.name &&
          (String(o.name).toLowerCase().includes(qLower) ||
            qLower.includes(String(o.name).toLowerCase().slice(0, 6)))
      )
      .slice(0, 5)
      .map((o) => ({
        type: "company" as const,
        name: String(o.name ?? ""),
        score: 0.7,
        id: String(o.id),
        category: String(o.category_code ?? ""),
        country: String(o.country_code ?? ""),
        status: String(o.status ?? ""),
      }));

    // Enrich with live signals if Supabase configured
    let liveSignals: Record<string, unknown>[] = [];
    if (isSupabaseConfigured()) {
      const sb = getSupabase();
      if (sb) {
        const { data } = await sb
          .from("signals")
          .select("sector, deviation_sigma, issued_at, receipt_sha256, sms_value")
          .eq("status", "active")
          .order("issued_at", { ascending: false })
          .limit(20);
        liveSignals = data ?? [];
      }
    }

    // Combine and rank
    const results = [
      ...investorMatches.slice(0, 5),
      ...companyMatches.slice(0, 5),
    ].sort((a, b) => b.score - a.score);

    return NextResponse.json({
      results,
      live_signals: liveSignals,
      query: q,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[api/entity/search]", e);
    return NextResponse.json({ results: [], error: "Search failed", query: q }, { status: 500 });
  }
}
