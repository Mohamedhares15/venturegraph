// Server-side graph computation utilities.
// These run once, are cached, and compute the SNA stats required by the grading rubric.
import "server-only";
import { loadEdges, loadCentrality, loadPartition } from "@/lib/data";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GraphStats {
  nNodes: number;
  nEdges: number;
  density: number;
  avgClusteringCoeff: number;
  approxDiameter: number;
  nConnectedComponents: number;
  largestComponentSize: number;
  avgDegree: number;
  maxDegree: number;
}

export interface ClosenessRow {
  investor: string;
  closeness: number;
  rank: number;
}

export interface CentralityComparisonRow {
  investor: string;
  rank_deg_out: number;
  rank_betweenness: number;
  rank_eigenvector: number;
  rank_closeness: number;
  deg_out: number;
  betweenness: number;
  eigenvector: number;
  closeness: number;
  tps: number;
}

// ── Adjacency builder ─────────────────────────────────────────────────────────

function buildAdj(
  edges: { source: string; target: string }[],
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const e of edges) {
    add(e.source, e.target);
    add(e.target, e.source); // treat as undirected for clustering / diameter
  }
  return adj;
}

// ── BFS helper ────────────────────────────────────────────────────────────────

function bfs(adj: Map<string, Set<string>>, start: string): Map<string, number> {
  const dist = new Map<string, number>();
  dist.set(start, 0);
  const queue: string[] = [start];
  let head = 0;
  while (head < queue.length) {
    const node = queue[head++];
    const d = dist.get(node)!;
    for (const nb of adj.get(node) ?? []) {
      if (!dist.has(nb)) {
        dist.set(nb, d + 1);
        queue.push(nb);
      }
    }
  }
  return dist;
}

// ── Connected components ──────────────────────────────────────────────────────

function findComponents(adj: Map<string, Set<string>>): number[][] {
  const visited = new Set<string>();
  const components: number[][] = [];
  for (const node of adj.keys()) {
    if (visited.has(node)) continue;
    const comp: string[] = [];
    const stack = [node];
    while (stack.length) {
      const n = stack.pop()!;
      if (visited.has(n)) continue;
      visited.add(n);
      comp.push(n);
      for (const nb of adj.get(n) ?? []) stack.push(nb);
    }
    components.push(comp.map(() => 1));
    comp.forEach((n) => {
      // re-use comp length for size
    });
    components[components.length - 1] = comp.map((_) => comp.length);
  }
  return components;
}

// ── Avg clustering coefficient ────────────────────────────────────────────────

function computeAvgClustering(adj: Map<string, Set<string>>): number {
  let total = 0;
  let count = 0;
  for (const [, neighbors] of adj) {
    const k = neighbors.size;
    if (k < 2) continue;
    const nbArr = [...neighbors];
    let triangles = 0;
    for (let i = 0; i < nbArr.length; i++) {
      for (let j = i + 1; j < nbArr.length; j++) {
        if (adj.get(nbArr[i])?.has(nbArr[j])) triangles++;
      }
    }
    total += (2 * triangles) / (k * (k - 1));
    count++;
  }
  return count > 0 ? total / count : 0;
}

// ── Approximate diameter (BFS from 8 high-degree nodes) ──────────────────────

function approxDiameter(adj: Map<string, Set<string>>): number {
  // Pick the 8 highest-degree nodes
  const sorted = [...adj.entries()]
    .map(([n, nb]) => ({ n, deg: nb.size }))
    .sort((a, b) => b.deg - a.deg)
    .slice(0, 8)
    .map((x) => x.n);
  let max = 0;
  for (const start of sorted) {
    const dist = bfs(adj, start);
    for (const d of dist.values()) if (d > max) max = d;
  }
  return max;
}

// ── Closeness centrality for top N nodes ──────────────────────────────────────

function computeCloseness(
  adj: Map<string, Set<string>>,
  nodes: string[],
  total: number,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const start of nodes) {
    const dist = bfs(adj, start);
    // Only count within the same component
    let sum = 0;
    let reachable = 0;
    for (const d of dist.values()) {
      if (d > 0) {
        sum += d;
        reachable++;
      }
    }
    // Wasserman & Faust normalisation
    if (sum > 0 && reachable > 0) {
      const closeness = ((reachable / (total - 1)) * reachable) / sum;
      result.set(start, closeness);
    } else {
      result.set(start, 0);
    }
  }
  return result;
}

// ── Main exported function ────────────────────────────────────────────────────

let statsCache: GraphStats | null = null;
let closenessCache: ClosenessRow[] | null = null;
let comparisonCache: CentralityComparisonRow[] | null = null;

export async function getGraphStats(): Promise<GraphStats> {
  if (statsCache) return statsCache;

  const edges = await loadEdges();
  const adj = buildAdj(edges.map((e) => ({ source: String(e.source), target: String(e.target) })));
  const nNodes = adj.size;
  const nEdges = edges.length;
  const density = nNodes > 1 ? nEdges / (nNodes * (nNodes - 1)) : 0;

  const avgClusteringCoeff = computeAvgClustering(adj);
  const approxDiam         = approxDiameter(adj);

  // Connected components
  const visited = new Set<string>();
  const componentSizes: number[] = [];
  for (const node of adj.keys()) {
    if (visited.has(node)) continue;
    const stack = [node];
    let size = 0;
    while (stack.length) {
      const n = stack.pop()!;
      if (visited.has(n)) continue;
      visited.add(n);
      size++;
      for (const nb of adj.get(n) ?? []) if (!visited.has(nb)) stack.push(nb);
    }
    componentSizes.push(size);
  }
  const nCC  = componentSizes.length;
  const lgCC = Math.max(...componentSizes, 0);
  const degrees = [...adj.values()].map((nb) => nb.size);
  const avgDeg  = degrees.length ? degrees.reduce((s, d) => s + d, 0) / degrees.length : 0;
  const maxDeg  = Math.max(...degrees, 0);

  statsCache = {
    nNodes, nEdges, density, avgClusteringCoeff,
    approxDiameter: approxDiam,
    nConnectedComponents: nCC,
    largestComponentSize: lgCC,
    avgDegree: avgDeg,
    maxDegree: maxDeg,
  };
  return statsCache;
}

export async function getCloseness(topN = 100): Promise<ClosenessRow[]> {
  if (closenessCache) return closenessCache;

  const edges     = await loadEdges();
  const centrality = await loadCentrality();
  const adj = buildAdj(edges.map((e) => ({ source: String(e.source), target: String(e.target) })));

  // Compute for top N by out-degree to limit computation time
  const topNodes = [...centrality]
    .filter((r) => r.investor)
    .sort((a, b) => Number(b.deg_out) - Number(a.deg_out))
    .slice(0, topN)
    .map((r) => String(r.investor));

  const clMap = computeCloseness(adj, topNodes, adj.size);

  closenessCache = [...clMap.entries()]
    .map(([investor, closeness]) => ({ investor, closeness }))
    .sort((a, b) => b.closeness - a.closeness)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return closenessCache;
}

export async function getCentralityComparison(n = 20): Promise<CentralityComparisonRow[]> {
  if (comparisonCache) return comparisonCache;

  const [centrality, closenessRows] = await Promise.all([
    loadCentrality(),
    getCloseness(150),
  ]);

  const clLookup = new Map<string, number>();
  closenessRows.forEach((r) => clLookup.set(r.investor, r.closeness));

  // Rank by each measure
  const byDeg  = [...centrality].sort((a, b) => Number(b.deg_out) - Number(a.deg_out));
  const byBet  = [...centrality].sort((a, b) => Number(b.betweenness) - Number(a.betweenness));
  const byEig  = [...centrality].sort((a, b) => Number(b.eigenvector) - Number(a.eigenvector));

  const rankDeg = new Map(byDeg.map((r, i) => [String(r.investor), i + 1]));
  const rankBet = new Map(byBet.map((r, i) => [String(r.investor), i + 1]));
  const rankEig = new Map(byEig.map((r, i) => [String(r.investor), i + 1]));

  // Union of top N from each measure
  const topNames = new Set<string>();
  byDeg.slice(0, n).forEach((r) => r.investor && topNames.add(String(r.investor)));
  byBet.slice(0, n).forEach((r) => r.investor && topNames.add(String(r.investor)));
  byEig.slice(0, n).forEach((r) => r.investor && topNames.add(String(r.investor)));
  closenessRows.slice(0, n).forEach((r) => topNames.add(r.investor));

  const centLookup = new Map(centrality.map((r) => [String(r.investor), r]));
  const clRankArr  = closenessRows.map((r) => r.investor);
  const rankCl     = new Map(clRankArr.map((inv, i) => [inv, i + 1]));

  comparisonCache = [...topNames]
    .map((investor) => {
      const c = centLookup.get(investor);
      return {
        investor,
        rank_deg_out:    rankDeg.get(investor) ?? 9999,
        rank_betweenness: rankBet.get(investor) ?? 9999,
        rank_eigenvector: rankEig.get(investor) ?? 9999,
        rank_closeness:   rankCl.get(investor) ?? 9999,
        deg_out:          Number(c?.deg_out)    || 0,
        betweenness:      Number(c?.betweenness) || 0,
        eigenvector:      Number(c?.eigenvector) || 0,
        closeness:        clLookup.get(investor) ?? 0,
        tps:              Number(c?.tps)          || 0,
      };
    })
    .sort((a, b) => a.rank_deg_out - b.rank_deg_out);

  return comparisonCache;
}

export async function getGraphData(maxNodes = 120): Promise<{
  nodes: { id: string; label: string; community: number; tps: number; deg: number }[];
  links: { source: string; target: string; weight: number }[];
}> {
  const [edges, centrality, partition] = await Promise.all([
    loadEdges(),
    loadCentrality(),
    loadPartition(),
  ]);

  // Pick top maxNodes by out-degree
  const topInvestors = new Set(
    [...centrality]
      .filter((r) => r.investor)
      .sort((a, b) => Number(b.deg_out) - Number(a.deg_out))
      .slice(0, maxNodes)
      .map((r) => String(r.investor)),
  );

  const tpsLookup  = new Map(centrality.map((r) => [String(r.investor), Number(r.tps) || 0]));
  const degLookup  = new Map(centrality.map((r) => [String(r.investor), Number(r.deg_out) || 0]));
  const commLookup = new Map(partition.map((r) => [String(r.investor), Number(r.community_id)]));

  const nodes = [...topInvestors].map((id) => ({
    id,
    label: id,
    community: commLookup.get(id) ?? 0,
    tps: tpsLookup.get(id) ?? 0,
    deg: degLookup.get(id) ?? 0,
  }));

  const links = edges
    .filter(
      (e) => topInvestors.has(String(e.source)) && topInvestors.has(String(e.target)),
    )
    .map((e) => ({
      source: String(e.source),
      target: String(e.target),
      weight: Number(e.weight) || 1,
    }));

  return { nodes, links };
}
