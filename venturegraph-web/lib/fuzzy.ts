// Lightweight fuzzy matcher (Dice-Sørensen on character bigrams).
// Mirrors difflib.get_close_matches behaviour in the Python pipeline.

function bigrams(s: string): Map<string, number> {
  const map = new Map<string, number>();
  const t = s.toLowerCase().replace(/\s+/g, " ").trim();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    map.set(g, (map.get(g) ?? 0) + 1);
  }
  return map;
}

function dice(a: string, b: string): number {
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const [g, n] of A) {
    const m = B.get(g);
    if (m) inter += Math.min(n, m);
  }
  const totalA = Array.from(A.values()).reduce((s, n) => s + n, 0);
  const totalB = Array.from(B.values()).reduce((s, n) => s + n, 0);
  return (2 * inter) / (totalA + totalB);
}

export interface MatchResult {
  input: string;
  matched: string | null;
  score: number;
}

export function parsePortfolio(text: string): string[] {
  if (!text) return [];
  const parts: string[] = [];
  for (const line of text.replace(/[;,]/g, "\n").split("\n")) {
    const s = line.trim().replace(/^["']|["']$/g, "");
    if (s.length >= 3) parts.push(s);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}

export function matchInvestors(
  inputs: string[],
  universe: string[],
  cutoff = 0.78,
): MatchResult[] {
  const lowerToName = new Map<string, string>();
  for (const u of universe) lowerToName.set(u.toLowerCase(), u);

  return inputs.map((name) => {
    const lower = name.toLowerCase();
    if (lowerToName.has(lower)) {
      return { input: name, matched: lowerToName.get(lower)!, score: 1 };
    }
    let bestScore = 0;
    let best: string | null = null;
    for (const candidate of universe) {
      const s = dice(lower, candidate.toLowerCase());
      if (s > bestScore) {
        bestScore = s;
        best = candidate;
      }
    }
    return bestScore >= cutoff
      ? { input: name, matched: best, score: bestScore }
      : { input: name, matched: null, score: bestScore };
  });
}
