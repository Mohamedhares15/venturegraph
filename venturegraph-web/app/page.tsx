// Landing page: sovereign hero + signature stats + 5-floor architectural map
import Link from "next/link";
import { ArrowUpRight, Lock, ShieldCheck, Sparkles } from "lucide-react";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FLOORS } from "@/lib/modules";
import { loadSnapshot } from "@/lib/data";
import { sha256File } from "@/lib/crypto";
import { fmtInt, shortHash } from "@/lib/utils";
import { MetricCard } from "@/components/ui/MetricCard";
import { HashPill } from "@/components/ui/HashPill";
import { StatusPill } from "@/components/ui/StatusPill";
import path from "node:path";

export default async function Landing() {
  const snap = await loadSnapshot();
  const protoPath = path.resolve(process.cwd(), "..", "preregistration.py");
  const proto = (await sha256File(protoPath)) ?? "";

  return (
    <div className="sov-fade-up">
      {/* ════════════════════════════════════════════════════════════════
          HERO — sovereign masthead
          ════════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden mb-10 rounded-2xl border border-ink-100 shadow-md">
        <div className="absolute inset-0 bg-gradient-to-br from-paper-200 via-paper-300 to-paper-50" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, var(--color-gold-500), transparent 40%), radial-gradient(circle at 80% 70%, var(--color-ink-700), transparent 40%)",
          }}
        />
        <div className="absolute top-0 left-0 right-0 h-1 bg-ink-900" />
        <div className="absolute bottom-0 left-0 right-0 sov-hero-rule" />

        <div className="relative px-10 py-14 md:py-16">
          <div className="grid lg:grid-cols-[1fr_auto] gap-10 items-end">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 mb-4">
                <StatusPill variant="ok" className="!text-[0.6rem]">
                  <span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />
                  Audit-Live
                </StatusPill>
                <StatusPill className="!text-[0.6rem]">v2.0 · Sovereign</StatusPill>
                <StatusPill variant="ink" className="!text-[0.6rem]">Pre-Registered</StatusPill>
              </div>
              <h1 className="font-sans font-bold tracking-[-0.02em] text-ink-900 leading-[1.05] text-[clamp(2.4rem,4.5vw,4rem)]">
                Audit-grade<br className="hidden md:block" />
                <span className="text-ink-900">private-market intelligence</span>
                <span className="font-serif italic text-gold-700 font-medium block mt-1">
                  for sovereign capital.
                </span>
              </h1>
              <p className="mt-5 text-[1.05rem] text-ink-600 leading-relaxed max-w-2xl">
                Twenty-two analytical modules. One pre-registered protocol. Every signal
                cryptographically sealed. Every receipt verifiable. Built for the compliance
                review that has to survive the audit.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link href="/modules/portfolio-x-ray" className="sov-btn sov-btn--primary">
                  Run Portfolio X-Ray
                  <ArrowUpRight size={16} strokeWidth={2} />
                </Link>
                <Link href="/modules/audit-vault" className="sov-btn sov-btn--ghost">
                  <ShieldCheck size={15} strokeWidth={1.7} />
                  Issue an audit receipt
                </Link>
              </div>
            </div>

            <div className="hidden lg:flex flex-col items-center gap-3">
              <div className="sov-seal !w-20 !h-20 !text-[0.62rem]">
                SEAL<br />SHA-256
              </div>
              <HashPill hash={proto} truncate={20} variant="gold" copyable />
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          SIGNATURE STATS
          ════════════════════════════════════════════════════════════════ */}
      <section className="mb-10">
        <div className="sov-label mb-3">Live snapshot · current pipeline</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sov-fade-up-stagger">
          <MetricCard label="Investors" value={fmtInt(snap.nInvestors)} sub={snap.hasAugmented ? "augmented universe" : "universe"} accent="gold" />
          <MetricCard
            label="Co-invest edges"
            value={fmtInt(snap.nEdges)}
            sub={`${fmtInt(snap.nNodes)} nodes`}
            accent="info"
          />
          <MetricCard
            label="Communities"
            value={fmtInt(snap.nCommunities)}
            sub="Louvain detected"
            accent="violet"
          />
          <MetricCard
            label="SMS candidates"
            value={fmtInt(snap.nSmsObservations)}
            sub={snap.hasAugmented ? `power ${(snap.powerAfter * 100).toFixed(0)}%` : `${fmtInt(snap.nAlphas)} α points`}
            accent="warn"
          />
          <MetricCard
            label="TPS-scored"
            value={fmtInt(snap.nTps)}
            sub={`max ${snap.maxTps.toFixed(2)}`}
            accent="ok"
          />
          <MetricCard
            label="Entities indexed"
            value={fmtInt(snap.nObjects)}
            sub={snap.hasAugmented ? "augmented + Crunchbase" : "Crunchbase 2013"}
            accent="ink"
          />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          ARCHITECTURE — 5 floors × 22 modules
          ════════════════════════════════════════════════════════════════ */}
      <section className="mb-10">
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="sov-label">The architecture</div>
            <h2 className="text-[1.6rem] font-semibold text-ink-900 mt-1">
              Five floors. Twenty-two modules. One sealed protocol.
            </h2>
            <p className="text-ink-500 mt-1 max-w-3xl">
              Each floor is a distinct mode of work — daily workflow, deep analysis, signal
              composition, audit + trust, regional context. Every module reads from the same
              hash-sealed pipeline.
            </p>
          </div>
          <StatusPill variant="ok" className="!text-[0.62rem] hidden md:inline-flex">
            <Sparkles size={11} strokeWidth={2} />
            22 / 22 wired
          </StatusPill>
        </div>

        <div className="space-y-6">
          {FLOORS.map((floor, idx) => (
            <FloorBlock key={floor.key} floor={floor} index={idx + 1} />
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          AUDIT FOOTER — protocol seal
          ════════════════════════════════════════════════════════════════ */}
      <section className="mt-12 grid md:grid-cols-3 gap-5">
        <div className="sov-card sov-card--ok md:col-span-2">
          <div className="flex items-start gap-4">
            <Lock size={22} strokeWidth={1.7} className="text-ok-700 mt-1 flex-shrink-0" />
            <div>
              <div className="sov-label !text-ok-700">Protocol Integrity</div>
              <h3 className="text-[1.05rem] font-semibold text-ink-900 mt-1">
                The pre-registered protocol is sealed.
              </h3>
              <p className="text-[0.9rem] text-ink-600 mt-1 leading-relaxed">
                <code className="font-mono text-[0.82rem] bg-paper-100 px-1.5 py-0.5 rounded border border-ink-100">
                  preregistration.py
                </code>{" "}
                contains the frozen hypotheses, fixed parameters, and dataset snapshot hashes.
                It was sealed before any signal was computed. Mutating one byte changes this hash and
                propagates through every receipt.
              </p>
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <HashPill hash={proto} truncate={32} variant="ok" />
                <span className="font-mono text-[0.7rem] text-ink-400">
                  short · {shortHash(proto, 12)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="sov-card sov-card--info">
          <div className="sov-label">Why this matters</div>
          <p className="text-[0.88rem] text-ink-600 mt-2 leading-relaxed">
            Pitchbook, CB Insights, Magnitt — none publish hash receipts. A regulator asking
            <em className="text-gold-700"> &ldquo;on what data was this score computed?&rdquo; </em>
            cannot be answered there. It can be answered here.
          </p>
        </div>
      </section>
    </div>
  );
}

function FloorBlock({
  floor,
  index,
}: {
  floor: (typeof FLOORS)[number];
  index: number;
}) {
  return (
    <div className="bg-paper-200 border border-ink-100 rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-ink-100 bg-gradient-to-r from-paper-100 to-paper-200">
        <span className={`sov-floor-dot f${index}`} />
        <span className="font-mono text-[0.66rem] tracking-[0.2em] uppercase text-ink-400 font-semibold">
          FLOOR {floor.num}
        </span>
        <span className="text-[1.05rem] font-semibold text-ink-900">{floor.name}</span>
        <span className="font-serif italic text-gold-700 ml-1">— {floor.tagline}</span>
        <span className="ml-auto font-mono text-[0.66rem] text-ink-300">
          {floor.modules.length} modules
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-0 divide-x divide-y divide-ink-100">
        {floor.modules.map((m) => {
          const Icon = (Icons[m.icon as keyof typeof Icons] as LucideIcon) || Icons.Circle;
          return (
            <Link
              key={m.id}
              href={`/modules/${m.slug}`}
              className="group p-4 hover:bg-paper-300 transition-colors relative"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-md bg-paper-100 border border-ink-100 flex items-center justify-center text-gold-700 group-hover:bg-gold-100 group-hover:border-gold-300 transition-colors flex-shrink-0">
                  <Icon size={16} strokeWidth={1.7} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[0.6rem] tracking-wider text-ink-300">
                      {m.num}
                    </span>
                    <span className="font-semibold text-[0.92rem] text-ink-900 truncate">
                      {m.title}
                    </span>
                    {m.status === "live" && (
                      <span className="text-[0.55rem] font-mono tracking-wider text-ok-700 bg-ok-100 px-1.5 py-0.5 rounded border border-ok-100">
                        LIVE
                      </span>
                    )}
                  </div>
                  <p className="text-[0.78rem] text-ink-500 mt-1 leading-snug">{m.tagline}</p>
                </div>
                <ArrowUpRight
                  size={14}
                  strokeWidth={2}
                  className="text-ink-300 group-hover:text-gold-700 transition-colors flex-shrink-0 mt-1"
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
