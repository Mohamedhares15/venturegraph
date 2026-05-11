import { NextRequest, NextResponse } from "next/server";
import {
  loadTps, loadCommunities, loadPartition, loadCentrality,
  loadEdges, loadSms, loadSmsCorr, loadEventPanel, loadTpsPanel,
  loadAlphas, loadInvPanel, loadObjects,
} from "@/lib/data";

const LOADERS: Record<string, () => Promise<unknown[]>> = {
  tps: loadTps,
  communities: loadCommunities,
  partition: loadPartition,
  centrality: loadCentrality,
  edges: loadEdges,
  sms: loadSms,
  sms_corr: loadSmsCorr,
  event_panel: loadEventPanel,
  tps_panel: loadTpsPanel,
  alphas: loadAlphas,
  inv_panel: loadInvPanel,
  objects: loadObjects,
};

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name || !LOADERS[name]) {
    return NextResponse.json({ error: "Unknown dataset: " + name }, { status: 400 });
  }
  try {
    const data = await LOADERS[name]();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
