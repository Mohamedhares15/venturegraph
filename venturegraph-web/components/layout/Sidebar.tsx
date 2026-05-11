// Sidebar: floor-grouped module navigation with sovereign masthead + ops telemetry
import Link from "next/link";
import { FLOORS } from "@/lib/modules";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { loadSnapshot } from "@/lib/data";

interface SidebarProps {
  protoSeal: string;
}

export async function Sidebar({ protoSeal }: SidebarProps) {
  // Pull live telemetry server-side
  const snap = await loadSnapshot();

  return (
    <aside className="sov-paper-grain w-[290px] flex-shrink-0 border-r border-ink-100 hidden lg:flex flex-col">
      {/* ── Brand masthead ───────────────────────────────────────────────── */}
      <div className="px-6 pt-7 pb-5 border-b border-ink-100">
        <Link href="/" className="block group">
          <div className="flex items-center gap-3">
            <div className="sov-seal !w-11 !h-11 !text-[0.55rem]">
              VG<br />2.0
            </div>
            <div>
              <div className="font-sans font-bold text-ink-900 tracking-[0.18em] text-[0.92rem] leading-none">
                VENTUREGRAPH
              </div>
              <div className="font-serif italic text-gold-700 text-[1.05rem] leading-tight mt-0.5">
                Sovereign
              </div>
            </div>
          </div>
        </Link>
        <div className="mt-3 font-mono text-[0.6rem] text-ink-300 tracking-[0.18em] uppercase">
          SEAL · {protoSeal || "UNSIGNED"}
        </div>
      </div>

      {/* ── Floor + module navigation ────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {FLOORS.map((floor) => (
          <div key={floor.key}>
            <div className="px-3 pb-2 flex items-center gap-2">
              <span className={`sov-floor-dot f${floor.key.slice(1)}`} />
              <span className="font-mono text-[0.6rem] tracking-[0.2em] text-ink-400 uppercase font-semibold">
                FLOOR {floor.num} · {floor.name}
              </span>
            </div>
            <ul className="space-y-0.5">
              {floor.modules.map((m) => {
                const Icon = (Icons[m.icon as keyof typeof Icons] as LucideIcon) || Icons.Circle;
                return (
                  <li key={m.id}>
                    <Link
                      href={m.floor === "F0" ? `/${m.slug}` : `/modules/${m.slug}`}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[0.86rem] text-ink-700 hover:bg-paper-300 hover:text-ink-900 transition group relative"
                    >
                      <Icon
                        size={15}
                        strokeWidth={1.7}
                        className="text-ink-400 group-hover:text-gold-600 flex-shrink-0"
                      />
                      <span className="truncate flex-1">{m.shortTitle}</span>
                      {m.status === "live" ? (
                        <span className="text-[0.55rem] font-mono tracking-wider text-ok-700 bg-ok-100 px-1.5 py-0.5 rounded">
                          LIVE
                        </span>
                      ) : (
                        <span className="text-[0.55rem] font-mono tracking-wider text-ink-400">
                          {m.num}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Operations telemetry ─────────────────────────────────────────── */}
      <div className="border-t border-ink-100 p-4">
        <div className="font-mono text-[0.6rem] tracking-[0.2em] text-ink-400 uppercase font-semibold mb-2">
          OPERATIONS
        </div>
        <div className="bg-paper-200 border border-ink-100 rounded-md p-3 space-y-1.5">
          <TelemetryRow label="DATA" value={`${snap.nObjects ? "22" : "0"}/22`} ok />
          <TelemetryRow
            label="INVESTORS"
            value={snap.nInvestors.toLocaleString()}
            ok
          />
          <TelemetryRow
            label="EDGES"
            value={snap.nEdges.toLocaleString()}
            ok
          />
          <TelemetryRow label="SEAL" value={protoSeal || "—"} ok />
          <TelemetryRow label="VERSION" value="v2.0-sov" />
        </div>
      </div>
    </aside>
  );
}

function TelemetryRow({
  label,
  value,
  ok = false,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <div className="flex items-center justify-between font-mono text-[0.7rem]">
      <span className="text-ink-400">{label}</span>
      <span className="flex items-center gap-1.5 text-ink-900 font-medium">
        {value}
        {ok && <span className="w-1.5 h-1.5 rounded-full bg-ok-500 inline-block" />}
      </span>
    </div>
  );
}
