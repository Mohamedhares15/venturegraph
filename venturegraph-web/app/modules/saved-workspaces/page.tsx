"use client";
import { useState, useCallback } from "react";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { Card, CardLabel } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { moduleBySlug } from "@/lib/modules";
import { Save, Download, Upload, Trash2, Clock, Shield } from "lucide-react";

interface Workspace {
  id: string;
  name: string;
  created: string;
  hash: string;
  signals: string[];
  sectors: string[];
}

function sha256Hex(text: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
    .then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""));
}

export default function SavedWorkspacesPage() {
  const m = moduleBySlug("saved-workspaces")!;
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("vg_workspaces") || "[]"); } catch { return []; }
  });
  const [name, setName] = useState("");
  const [sectors, setSectors] = useState("IGV,SOXX,XBI");
  const [signals, setSignals] = useState("TPS,SMS,SSI");
  const [importJson, setImportJson] = useState("");
  const [lastHash, setLastHash] = useState("");

  const saveWorkspace = useCallback(async () => {
    const ws: Workspace = {
      id: crypto.randomUUID(),
      name: name || `Workspace ${workspaces.length + 1}`,
      created: new Date().toISOString(),
      hash: "",
      signals: signals.split(",").map((s) => s.trim()),
      sectors: sectors.split(",").map((s) => s.trim()),
    };
    ws.hash = await sha256Hex(JSON.stringify(ws));
    const updated = [...workspaces, ws];
    setWorkspaces(updated);
    localStorage.setItem("vg_workspaces", JSON.stringify(updated));
    setLastHash(ws.hash);
    setName("");
  }, [name, signals, sectors, workspaces]);

  const deleteWorkspace = useCallback((id: string) => {
    const updated = workspaces.filter((w) => w.id !== id);
    setWorkspaces(updated);
    localStorage.setItem("vg_workspaces", JSON.stringify(updated));
  }, [workspaces]);

  const exportAll = useCallback(() => {
    const blob = new Blob([JSON.stringify(workspaces, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "venturegraph_workspaces.json"; a.click();
    URL.revokeObjectURL(url);
  }, [workspaces]);

  const importWorkspaces = useCallback(async () => {
    try {
      const parsed = JSON.parse(importJson) as Workspace[];
      if (!Array.isArray(parsed)) throw new Error("Not an array");
      const updated = [...workspaces, ...parsed];
      setWorkspaces(updated);
      localStorage.setItem("vg_workspaces", JSON.stringify(updated));
      setImportJson("");
    } catch { alert("Invalid JSON format."); }
  }, [importJson, workspaces]);

  return (
    <div className="sov-fade-up">
      <ModuleHero num={m.num} floor="FLOOR 01 · WORKFLOW" title={m.title} tagline={m.tagline}
        actions={<><StatusPill variant="ok"><span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />Live</StatusPill><StatusPill>{m.id}</StatusPill></>}>
        {m.description}
      </ModuleHero>

      <Section label="Create workspace" title="Save current analysis state">
        <Card>
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="sov-label mb-1 block">Workspace name</label>
              <input className="sov-input w-full" placeholder="My analysis…" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="sov-label mb-1 block">Signal weights (comma-separated)</label>
              <input className="sov-input w-full" value={signals} onChange={(e) => setSignals(e.target.value)} />
            </div>
            <div>
              <label className="sov-label mb-1 block">Focus sectors</label>
              <input className="sov-input w-full" value={sectors} onChange={(e) => setSectors(e.target.value)} />
            </div>
          </div>
          <button className="sov-btn sov-btn--primary" onClick={saveWorkspace}>
            <Save size={14} /> Save workspace
          </button>
          {lastHash && (
            <div className="mt-3 font-mono text-[0.72rem] text-ink-400 break-all">
              <Shield size={12} className="inline mr-1 text-ok-600" />
              SHA-256: {lastHash}
            </div>
          )}
        </Card>
      </Section>

      <Section label="Saved" title={`${workspaces.length} workspace${workspaces.length !== 1 ? "s" : ""}`}>
        {workspaces.length === 0 ? (
          <Card><p className="text-ink-500 text-[0.9rem]">No workspaces saved yet. Create one above.</p></Card>
        ) : (
          <div className="space-y-3">
            {workspaces.map((w) => (
              <Card key={w.id} className="!p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-ink-900">{w.name}</h3>
                    <div className="flex items-center gap-3 text-[0.78rem] text-ink-500 mt-1">
                      <span className="flex items-center gap-1"><Clock size={11} />{new Date(w.created).toLocaleString()}</span>
                      <span>{w.signals.join(", ")}</span>
                      <span>{w.sectors.join(", ")}</span>
                    </div>
                    <div className="font-mono text-[0.65rem] text-ink-300 mt-1 truncate">SHA-256: {w.hash}</div>
                  </div>
                  <button className="sov-btn sov-btn--ghost !text-red-600" onClick={() => deleteWorkspace(w.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <button className="sov-btn sov-btn--ghost" onClick={exportAll} disabled={!workspaces.length}>
            <Download size={14} /> Export JSON
          </button>
        </div>
      </Section>

      <Section label="Import" title="Restore from exported JSON">
        <Card>
          <textarea className="sov-input w-full h-28 font-mono text-[0.78rem]" placeholder="Paste workspace JSON here…"
            value={importJson} onChange={(e) => setImportJson(e.target.value)} />
          <button className="sov-btn sov-btn--primary mt-3" onClick={importWorkspaces} disabled={!importJson}>
            <Upload size={14} /> Import
          </button>
        </Card>
      </Section>
    </div>
  );
}
