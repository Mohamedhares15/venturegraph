"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import { fmtInt } from "@/lib/utils";
import {
  LineChart, Line, BarChart, Bar, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "@/components/ui/Charts";
import { Play, RotateCcw, Zap } from "lucide-react";

/* ── Types ────────────────────────────────────────────────────────── */
interface TpsRow { investor: string; tps: number; portfolio_size: number; }
interface EdgeRow { source: string; target: string; }

type NodeState = "inactive" | "active" | "recovered";

interface SimStep {
  round: number;
  newlyActive: string[];
  totalActive: number;
  totalInactive: number;
  totalRecovered: number;
}

/* ── IC Simulation ────────────────────────────────────────────────── */
function runIC(
  adj: Map<string, string[]>,
  seeds: string[],
  prob: number,
  maxRounds: number
): SimStep[] {
  const state = new Map<string, NodeState>();
  for (const n of adj.keys()) state.set(n, "inactive");
  seeds.forEach((s) => state.set(s, "active"));

  const steps: SimStep[] = [{ round: 0, newlyActive: [...seeds], totalActive: seeds.length, totalInactive: adj.size - seeds.length, totalRecovered: 0 }];
  let frontier = [...seeds];

  for (let r = 1; r <= maxRounds && frontier.length > 0; r++) {
    const next: string[] = [];
    for (const u of frontier) {
      for (const v of adj.get(u) ?? []) {
        if (state.get(v) === "inactive" && Math.random() < prob) {
          state.set(v, "active");
          next.push(v);
        }
      }
    }
    frontier = next;
    const totalActive = [...state.values()].filter((s) => s === "active").length;
    steps.push({ round: r, newlyActive: next, totalActive, totalInactive: adj.size - totalActive, totalRecovered: 0 });
  }
  return steps;
}

/* ── LT Simulation ────────────────────────────────────────────────── */
function runLT(
  adj: Map<string, string[]>,
  inAdj: Map<string, string[]>,
  seeds: string[],
  maxRounds: number
): SimStep[] {
  const active = new Set(seeds);
  const thresholds = new Map<string, number>();
  for (const n of adj.keys()) thresholds.set(n, 0.3 + Math.random() * 0.4); // θ ∈ [0.3, 0.7]

  const steps: SimStep[] = [{ round: 0, newlyActive: [...seeds], totalActive: seeds.length, totalInactive: adj.size - seeds.length, totalRecovered: 0 }];

  for (let r = 1; r <= maxRounds; r++) {
    const next: string[] = [];
    for (const [v] of adj) {
      if (active.has(v)) continue;
      const neighbors = inAdj.get(v) ?? [];
      if (neighbors.length === 0) continue;
      const pressure = neighbors.filter((u) => active.has(u)).length / neighbors.length;
      if (pressure >= (thresholds.get(v) ?? 0.5)) {
        next.push(v);
      }
    }
    if (next.length === 0) break;
    next.forEach((v) => active.add(v));
    steps.push({ round: r, newlyActive: next, totalActive: active.size, totalInactive: adj.size - active.size, totalRecovered: 0 });
  }
  return steps;
}

/* ── SIR Simulation ───────────────────────────────────────────────── */
function runSIR(
  adj: Map<string, string[]>,
  seeds: string[],
  beta: number,
  gamma: number,
  maxRounds: number
): SimStep[] {
  const state = new Map<string, NodeState>();
  for (const n of adj.keys()) state.set(n, "inactive");
  seeds.forEach((s) => state.set(s, "active"));

  const steps: SimStep[] = [];
  const count = () => {
    let a = 0, r = 0, i = 0;
    for (const s of state.values()) { if (s === "active") a++; else if (s === "recovered") r++; else i++; }
    return { a, r, i };
  };
  const c = count();
  steps.push({ round: 0, newlyActive: [...seeds], totalActive: c.a, totalInactive: c.i, totalRecovered: c.r });

  for (let r = 1; r <= maxRounds; r++) {
    const infected: string[] = [];
    const recovered: string[] = [];
    for (const [n, s] of state) {
      if (s === "active") {
        // try to infect neighbors
        for (const v of adj.get(n) ?? []) {
          if (state.get(v) === "inactive" && Math.random() < beta) {
            infected.push(v);
          }
        }
        // try to recover
        if (Math.random() < gamma) recovered.push(n);
      }
    }
    infected.forEach((v) => state.set(v, "active"));
    recovered.forEach((v) => state.set(v, "recovered"));
    const cc = count();
    steps.push({ round: r, newlyActive: infected, totalActive: cc.a, totalInactive: cc.i, totalRecovered: cc.r });
    if (cc.a === 0) break;
  }
  return steps;
}

/* ── Greedy Influence Maximization ────────────────────────────────── */
function greedyInfluenceMax(
  adj: Map<string, string[]>,
  k: number,
  prob: number,
  nSim: number
): { seeds: string[]; expectedSize: number }[] {
  const candidates = [...adj.keys()].sort((a, b) => (adj.get(b)?.length ?? 0) - (adj.get(a)?.length ?? 0)).slice(0, 50); // top-50 by degree
  const seeds: string[] = [];
  const results: { seeds: string[]; expectedSize: number }[] = [];

  for (let i = 0; i < k; i++) {
    let bestNode = "";
    let bestGain = -1;
    for (const v of candidates) {
      if (seeds.includes(v)) continue;
      const testSeeds = [...seeds, v];
      let totalSize = 0;
      for (let s = 0; s < nSim; s++) {
        const steps = runIC(adj, testSeeds, prob, 20);
        totalSize += steps[steps.length - 1].totalActive;
      }
      const avg = totalSize / nSim;
      if (avg > bestGain) { bestGain = avg; bestNode = v; }
    }
    seeds.push(bestNode);
    results.push({ seeds: [...seeds], expectedSize: bestGain });
  }
  return results;
}

/* ── Component ────────────────────────────────────────────────────── */
export default function InformationDiffusionPage() {
  const m = moduleBySlug("information-diffusion")!;
  const [edges, setEdges] = useState<EdgeRow[]>([]);
  const [tps, setTps] = useState<TpsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState<"ic" | "lt" | "sir">("ic");
  const [prob, setProb] = useState(0.15);
  const [gamma, setGamma] = useState(0.1);
  const [seedCount, setSeedCount] = useState(3);
  const [seedStrategy, setSeedStrategy] = useState<"top-degree" | "top-tps" | "random">("top-tps");
  const [simResult, setSimResult] = useState<SimStep[] | null>(null);
  const [influenceResult, setInfluenceResult] = useState<{ seeds: string[]; expectedSize: number }[] | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/data?name=edges").then((r) => r.json()),
      fetch("/api/data?name=tps").then((r) => r.json()),
    ]).then(([e, t]) => {
      setEdges(Array.isArray(e) ? e.slice(0, 5000) : []);
      setTps(Array.isArray(t) ? t : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const { adj, inAdj, nodes } = useMemo(() => {
    const adj = new Map<string, string[]>();
    const inAdj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      if (!adj.has(e.target)) adj.set(e.target, []);
      if (!inAdj.has(e.source)) inAdj.set(e.source, []);
      if (!inAdj.has(e.target)) inAdj.set(e.target, []);
      adj.get(e.source)!.push(e.target);
      inAdj.get(e.target)!.push(e.source);
    }
    return { adj, inAdj, nodes: [...adj.keys()] };
  }, [edges]);

  const tpsMap = useMemo(() => {
    const m = new Map<string, number>();
    tps.forEach((r) => m.set(r.investor, Number(r.tps) || 0));
    return m;
  }, [tps]);

  const getSeeds = useCallback((k: number): string[] => {
    if (seedStrategy === "top-tps") {
      return [...tpsMap.entries()]
        .filter(([inv]) => adj.has(inv))
        .sort((a, b) => b[1] - a[1])
        .slice(0, k)
        .map(([inv]) => inv);
    }
    if (seedStrategy === "top-degree") {
      return nodes
        .sort((a, b) => (adj.get(b)?.length ?? 0) - (adj.get(a)?.length ?? 0))
        .slice(0, k);
    }
    // random
    const shuffled = [...nodes].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, k);
  }, [seedStrategy, tpsMap, adj, nodes]);

  const runSimulation = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const seeds = getSeeds(seedCount);
      let result: SimStep[];
      if (model === "ic") result = runIC(adj, seeds, prob, 30);
      else if (model === "lt") result = runLT(adj, inAdj, seeds, 30);
      else result = runSIR(adj, seeds, prob, gamma, 50);
      setSimResult(result);
      setRunning(false);
    }, 50);
  }, [model, prob, gamma, seedCount, getSeeds, adj, inAdj]);

  const runInfluenceMax = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const results = greedyInfluenceMax(adj, 5, prob, 10);
      setInfluenceResult(results);
      setRunning(false);
    }, 50);
  }, [adj, prob]);

  if (loading) return <div className="p-12 text-center text-ink-500">Loading graph data…</div>;

  const lastStep = simResult?.[simResult.length - 1];
  const chartData = simResult?.map((s) => ({
    round: s.round,
    Active: s.totalActive,
    Inactive: s.totalInactive,
    Recovered: s.totalRecovered,
  }));

  return (
    <div className="sov-fade-up">
      <ModuleHero num={m.num} floor="FLOOR 03 · SIGNAL ENGINE" title={m.title} tagline={m.tagline}
        actions={<><StatusPill variant="ok"><span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />Live</StatusPill><StatusPill>{m.id}</StatusPill></>}>
        {m.description}
      </ModuleHero>

      {/* Theory Overview */}
      <Section label="Theory" title="Three Diffusion Mechanics + Influence Maximization">
        <div className="grid md:grid-cols-3 gap-3 mb-4">
          <Card className="!p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-900 text-blue-200 flex items-center justify-center font-mono font-bold text-xs flex-shrink-0">IC</div>
              <div>
                <h3 className="font-bold text-ink-900">Independent Cascade</h3>
                <p className="text-[0.82rem] text-ink-500 mt-1">Sender-driven, stochastic. Active node u gets <strong>one chance</strong> to activate each neighbor v with probability p(u,v). One-shot rule: failed attempts are permanent.</p>
                <div className="mt-2 text-[0.72rem] font-mono text-blue-700">Best for: viral content, gossip, contagion</div>
              </div>
            </div>
          </Card>
          <Card className="!p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-900 text-emerald-200 flex items-center justify-center font-mono font-bold text-xs flex-shrink-0">LT</div>
              <div>
                <h3 className="font-bold text-ink-900">Linear Threshold</h3>
                <p className="text-[0.82rem] text-ink-500 mt-1">Receiver-driven, deterministic. Node v activates when cumulative pressure from active neighbors ≥ threshold θᵥ. <strong>Peer pressure accumulates.</strong></p>
                <div className="mt-2 text-[0.72rem] font-mono text-emerald-700">Best for: technology adoption, social proof</div>
              </div>
            </div>
          </Card>
          <Card className="!p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-900 text-red-200 flex items-center justify-center font-mono font-bold text-xs flex-shrink-0">SIR</div>
              <div>
                <h3 className="font-bold text-ink-900">SIR Epidemic</h3>
                <p className="text-[0.82rem] text-ink-500 mt-1">Susceptible → Infected → Recovered. Unlike IC/LT, nodes can <strong>recover with immunity</strong>. R₀ = β/γ determines outbreak vs die-out.</p>
                <div className="mt-2 text-[0.72rem] font-mono text-red-700">Best for: epidemics, recurring rumors</div>
              </div>
            </div>
          </Card>
        </div>

        <Card className="!p-5">
          <h3 className="font-bold text-ink-900 mb-2">IC vs LT vs SIR — Key Differences</h3>
          <div className="overflow-x-auto">
            <table className="sov-table">
              <thead>
                <tr><th>Property</th><th>IC</th><th>LT</th><th>SIR</th></tr>
              </thead>
              <tbody>
                <tr><td className="font-medium">Driver</td><td>Sender (u pushes)</td><td>Receiver (v pulls)</td><td>Contact (β transmission)</td></tr>
                <tr><td className="font-medium">Randomness</td><td>Stochastic (coin flip)</td><td>Deterministic (given θ)</td><td>Stochastic (β, γ)</td></tr>
                <tr><td className="font-medium">State changes</td><td>Inactive → Active (permanent)</td><td>Inactive → Active (permanent)</td><td>S → I → R (three states)</td></tr>
                <tr><td className="font-medium">Key parameter</td><td>p(u,v) edge probability</td><td>θᵥ node threshold</td><td>R₀ = β/γ</td></tr>
                <tr><td className="font-medium">Cascade ends</td><td>No new activations</td><td>No threshold breached</td><td>I = 0 (all recovered)</td></tr>
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      {/* Simulation Controls */}
      <Section label="Simulator" title="Run diffusion on the co-investment graph">
        <Card>
          <div className="grid md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="sov-label mb-1 block">Diffusion model</label>
              <div className="flex gap-1">
                {(["ic", "lt", "sir"] as const).map((m) => (
                  <button key={m} onClick={() => { setModel(m); setSimResult(null); }}
                    className={`sov-btn flex-1 !text-[0.78rem] ${model === m ? "sov-btn--primary" : "sov-btn--ghost"}`}>
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="sov-label mb-1 block">
                {model === "sir" ? `β (transmission) — ${prob.toFixed(2)}` : `Probability p — ${prob.toFixed(2)}`}
              </label>
              <input type="range" min="1" max="50" value={prob * 100}
                onChange={(e) => setProb(Number(e.target.value) / 100)}
                className="w-full accent-gold-600" />
            </div>
            {model === "sir" && (
              <div>
                <label className="sov-label mb-1 block">γ (recovery) — {gamma.toFixed(2)}</label>
                <input type="range" min="1" max="50" value={gamma * 100}
                  onChange={(e) => setGamma(Number(e.target.value) / 100)}
                  className="w-full accent-red-600" />
              </div>
            )}
            <div>
              <label className="sov-label mb-1 block">Seed count — {seedCount}</label>
              <input type="range" min="1" max="10" value={seedCount}
                onChange={(e) => setSeedCount(Number(e.target.value))}
                className="w-full accent-gold-600" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mb-4">
            <div>
              <label className="sov-label mb-1 block">Seed strategy</label>
              <div className="flex gap-1">
                {(["top-tps", "top-degree", "random"] as const).map((s) => (
                  <button key={s} onClick={() => setSeedStrategy(s)}
                    className={`sov-btn !text-[0.75rem] ${seedStrategy === s ? "sov-btn--primary" : "sov-btn--ghost"}`}>
                    {s === "top-tps" ? "Top TPS" : s === "top-degree" ? "Top Degree" : "Random"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button className="sov-btn sov-btn--primary" onClick={runSimulation} disabled={running || nodes.length === 0}>
              <Play size={14} /> {running ? "Running…" : "Run simulation"}
            </button>
            <button className="sov-btn sov-btn--ghost" onClick={() => setSimResult(null)} disabled={!simResult}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </Card>
      </Section>

      {/* Simulation Results */}
      {simResult && lastStep && (
        <Section label="Results" title={`${model.toUpperCase()} cascade — ${simResult.length - 1} rounds`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricCard label="Cascade size" value={fmtInt(lastStep.totalActive + lastStep.totalRecovered)} sub={`of ${fmtInt(nodes.length)} nodes`} accent="gold" />
            <MetricCard label="Rounds" value={fmtInt(simResult.length - 1)} accent="info" />
            <MetricCard label="Still inactive" value={fmtInt(lastStep.totalInactive)} accent="ink" />
            {model === "sir" && <MetricCard label="Recovered" value={fmtInt(lastStep.totalRecovered)} accent="ok" />}
            {model !== "sir" && <MetricCard label="R₀ estimate" value={lastStep.totalActive > seedCount ? ((lastStep.totalActive - seedCount) / seedCount).toFixed(1) : "< 1"} accent={lastStep.totalActive > seedCount * 2 ? "warn" : "ok"} />}
          </div>

          <Card>
            <CardLabel>Cascade curve over time</CardLabel>
            <div className="h-[350px] mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="round" label={{ value: "Round", position: "insideBottom", offset: -5 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Active" stroke="#d97706" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Inactive" stroke="#6b7280" strokeWidth={2} dot={false} />
                  {model === "sir" && <Line type="monotone" dataKey="Recovered" stroke="#059669" strokeWidth={2} dot={false} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="mt-4">
            <CardLabel>Round-by-round log</CardLabel>
            <div className="overflow-auto max-h-[300px]">
              <table className="sov-table">
                <thead className="sticky top-0 bg-paper-50 z-10">
                  <tr>
                    <th>Round</th>
                    <th>Newly activated</th>
                    <th>Total active</th>
                    <th>Inactive</th>
                    {model === "sir" && <th>Recovered</th>}
                  </tr>
                </thead>
                <tbody>
                  {simResult.map((s) => (
                    <tr key={s.round}>
                      <td className="num font-bold">{s.round}</td>
                      <td className="text-[0.78rem]">{s.newlyActive.length > 0 ? (s.newlyActive.length > 5 ? `${s.newlyActive.slice(0, 5).join(", ")} +${s.newlyActive.length - 5} more` : s.newlyActive.join(", ")) : "—"}</td>
                      <td className="num font-semibold text-gold-700">{s.totalActive}</td>
                      <td className="num">{s.totalInactive}</td>
                      {model === "sir" && <td className="num text-ok-700">{s.totalRecovered}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Section>
      )}

      {/* Influence Maximization */}
      <Section label="Influence maximization" title="Greedy seed selection (Kempe, Kleinberg & Tardos, 2003)">
        <Card className="!p-5 mb-4">
          <h3 className="font-bold text-ink-900 mb-2">The Problem</h3>
          <p className="text-[0.88rem] text-ink-600 mb-3">Given budget k, find seed set S₀ ⊂ V with |S₀| = k that maximizes expected cascade size σ(S₀). This is <strong>NP-hard</strong>, but the greedy algorithm exploits <strong>submodularity</strong> (diminishing returns) to achieve a (1 − 1/e) ≈ 63% approximation guarantee.</p>
          <div className="bg-paper-100 border border-ink-100 rounded-md p-4 font-mono text-[0.82rem] text-ink-700 mb-3">
            <div>S ← ∅</div>
            <div>for i = 1 to k:</div>
            <div className="ml-4">v* ← argmax<sub>v∈V\S</sub> [σ(S ∪ {"{v}"}) − σ(S)]</div>
            <div className="ml-4">S ← S ∪ {"{v*}"}</div>
            <div>return S</div>
          </div>
          <p className="text-[0.82rem] text-ink-500"><strong>Why top-degree fails:</strong> High-degree nodes often overlap in coverage. Greedy picks seeds that maximise <em>marginal</em> gain — each new seed covers different parts of the network.</p>
        </Card>
        <div className="flex gap-3 mb-4">
          <button className="sov-btn sov-btn--primary" onClick={runInfluenceMax} disabled={running || nodes.length === 0}>
            <Zap size={14} /> {running ? "Computing…" : "Run greedy (k=5, 10 simulations)"}
          </button>
        </div>
        {influenceResult && (
          <Card>
            <CardLabel>Greedy seed selection results</CardLabel>
            <table className="sov-table mt-3">
              <thead>
                <tr><th>Step</th><th>Seed added</th><th>Total seeds</th><th>Expected cascade</th><th>Marginal gain</th></tr>
              </thead>
              <tbody>
                {influenceResult.map((r, i) => (
                  <tr key={i}>
                    <td className="num font-bold">{i + 1}</td>
                    <td className="font-medium text-ink-900">{r.seeds[r.seeds.length - 1]}</td>
                    <td className="num">{r.seeds.length}</td>
                    <td className="num font-semibold text-gold-700">{r.expectedSize.toFixed(1)}</td>
                    <td className="num text-ok-700">+{i === 0 ? r.expectedSize.toFixed(1) : (r.expectedSize - influenceResult[i - 1].expectedSize).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[0.75rem] text-ink-400 mt-2">Submodularity visible: marginal gain decreases with each additional seed.</p>
          </Card>
        )}
      </Section>

      {/* Formulas */}
      <Section label="Key formulas" title="Diffusion model specifications">
        <div className="grid md:grid-cols-2 gap-3">
          <Card className="!p-5">
            <CardLabel className="!text-blue-700">Independent Cascade</CardLabel>
            <div className="bg-paper-100 rounded-md p-3 font-mono text-[0.82rem] mt-2">
              P(v activates) = 1 − Π<sub>u∈active_nbrs</sub>(1 − p(u,v))
            </div>
            <p className="text-[0.78rem] text-ink-500 mt-2">Each active neighbor gets one independent attempt. Multiple neighbors increase activation probability.</p>
          </Card>
          <Card className="!p-5">
            <CardLabel className="!text-emerald-700">Linear Threshold</CardLabel>
            <div className="bg-paper-100 rounded-md p-3 font-mono text-[0.82rem] mt-2">
              v activates when Σ<sub>u∈active_nbrs</sub> b(u,v) ≥ θᵥ
            </div>
            <p className="text-[0.78rem] text-ink-500 mt-2">b(u,v) = influence weight from u to v. θᵥ = personal threshold. Pressure accumulates deterministically.</p>
          </Card>
          <Card className="!p-5">
            <CardLabel className="!text-red-700">SIR Epidemic</CardLabel>
            <div className="bg-paper-100 rounded-md p-3 font-mono text-[0.82rem] mt-2">
              dS/dt = −βSI, dI/dt = βSI − γI, dR/dt = γI
            </div>
            <p className="text-[0.78rem] text-ink-500 mt-2">R₀ = β/γ. If R₀ {">"} 1 → outbreak grows. If R₀ {"<"} 1 → dies out.</p>
          </Card>
          <Card className="!p-5">
            <CardLabel className="!text-gold-700">Submodularity</CardLabel>
            <div className="bg-paper-100 rounded-md p-3 font-mono text-[0.82rem] mt-2">
              S ⊂ T ⇒ σ(S∪{"{v}"}) − σ(S) ≥ σ(T∪{"{v}"}) − σ(T)
            </div>
            <p className="text-[0.78rem] text-ink-500 mt-2">Diminishing returns: adding a seed to a smaller set yields ≥ the gain of adding it to a larger set. Guarantees greedy ≥ 63% optimal.</p>
          </Card>
        </div>
      </Section>

      {/* Network context */}
      <Section label="Network context" title="Graph stats for diffusion">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Nodes in graph" value={fmtInt(nodes.length)} accent="info" />
          <MetricCard label="Edges loaded" value={fmtInt(edges.length)} accent="gold" />
          <MetricCard label="Avg degree" value={nodes.length ? (edges.length / nodes.length).toFixed(1) : "—"} accent="ink" />
          <MetricCard label="TPS universe" value={fmtInt(tps.length)} accent="ok" />
        </div>
      </Section>
    </div>
  );
}
