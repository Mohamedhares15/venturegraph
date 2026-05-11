"use client";
// Interactive force-directed graph — zoom, pan, hover to see node details.
// Uses react-force-graph-2d (canvas-based, WebGL-accelerated).
// Dynamically imported (SSR: false) to avoid server rendering issues.
import dynamic from "next/dynamic";
import { useMemo, useRef, useState, useCallback } from "react";

// Dynamic import — react-force-graph-2d needs browser APIs
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

// A stable palette for 20 community colours
const COMM_PALETTE = [
  "#8a6a14","#0e7a3f","#1a4f8b","#7c3aed","#d04444",
  "#a35a00","#0891b2","#065f46","#7e22ce","#be123c",
  "#0369a1","#854d0e","#166534","#1e3a5f","#6b21a8",
  "#b45309","#0f766e","#9f1239","#1d4ed8","#4a044e",
];

interface GraphNode {
  id: string;
  label: string;
  community: number;
  tps: number;
  deg: number;
}

interface GraphLink {
  source: string;
  target: string;
  weight: number;
}

interface Props {
  nodes: GraphNode[];
  links: GraphLink[];
  height?: number;
}

export function ForceGraph({ nodes, links, height = 600 }: Props) {
  const fgRef = useRef<{ zoomToFit: (ms?: number) => void } | null>(null);
  const [hovered, setHovered] = useState<GraphNode | null>(null);

  // Memoize graph data to avoid re-renders
  const graphData = useMemo(() => ({ nodes: nodes.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) }), [nodes, links]);

  const nodeColor = useCallback((node: GraphNode) => {
    return COMM_PALETTE[node.community % COMM_PALETTE.length] ?? "#94a3b8";
  }, []);

  const nodeVal = useCallback((node: GraphNode) => {
    // Size by degree, min 1 max 8
    return Math.max(1, Math.min(8, node.deg * 0.8 + 1));
  }, []);

  const nodeLabel = useCallback((node: GraphNode) => {
    return `<div style="font:12px monospace;padding:4px 8px;background:#0b1f3a;color:#fbfaf6;border:1px solid #8a6a14;border-radius:4px;max-width:220px">
      <b>${node.label}</b><br/>
      TPS: ${node.tps.toFixed(3)}&nbsp;&nbsp;Degree: ${node.deg}&nbsp;&nbsp;Comm: C${node.community}
    </div>`;
  }, []);

  return (
    <div className="relative">
      <div
        className="rounded-md overflow-hidden border border-ink-100"
        style={{ height }}
      >
        <ForceGraph2D
          ref={fgRef as never}
          graphData={graphData}
          nodeId="id"
          nodeLabel={nodeLabel as never}
          nodeColor={nodeColor as never}
          nodeVal={nodeVal as never}
          linkColor={() => "rgba(148,163,184,0.3)"}
          linkWidth={(l: unknown) => Math.min(((l as GraphLink).weight ?? 1) * 0.3 + 0.4, 2.5)}
          onNodeHover={(node) => setHovered((node as GraphNode | null))}
          onEngineStop={() => fgRef.current?.zoomToFit(400)}
          backgroundColor="#fbfaf6"
          width={undefined}
          height={height}
          cooldownTicks={80}
          d3AlphaDecay={0.025}
          d3VelocityDecay={0.35}
        />
      </div>

      {/* Hover card */}
      {hovered && (
        <div className="absolute top-3 right-3 bg-paper-200 border border-gold-300 rounded-lg p-3 shadow-md min-w-[200px] pointer-events-none">
          <div className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-gold-700 font-semibold mb-1">
            NODE DETAIL
          </div>
          <div className="font-semibold text-ink-900 text-[0.9rem]">{hovered.label}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[0.78rem] text-ink-600">
            <span>TPS</span><span className="font-mono text-ink-900">{hovered.tps.toFixed(4)}</span>
            <span>Degree</span><span className="font-mono text-ink-900">{hovered.deg}</span>
            <span>Community</span><span className="font-mono text-ink-900">C{hovered.community}</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-2 items-center text-[0.72rem] text-ink-500">
        <span className="font-mono font-semibold text-ink-700">Communities:</span>
        {[...new Set(nodes.map((n) => n.community))].sort((a, b) => a - b).slice(0, 10).map((c) => (
          <span key={c} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COMM_PALETTE[c % COMM_PALETTE.length] }} />
            C{c}
          </span>
        ))}
        {new Set(nodes.map((n) => n.community)).size > 10 && <span className="text-ink-400">+ more…</span>}
      </div>
    </div>
  );
}
