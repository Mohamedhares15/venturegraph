import type { Metadata } from "next";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { StatusPill } from "@/components/ui/StatusPill";
import { PortfolioXRayClient } from "./PortfolioXRayClient";
import { moduleBySlug } from "@/lib/modules";

export const metadata: Metadata = {
  title: "Portfolio X-Ray · VentureGraph Sovereign",
};

export default function PortfolioXRayPage() {
  const m = moduleBySlug("portfolio-x-ray")!;
  return (
    <div className="sov-fade-up">
      <ModuleHero
        num={m.num}
        floor="FLOOR 01 · WORKFLOW"
        title={m.title}
        tagline={m.tagline}
        actions={
          <>
            <StatusPill variant="ok">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />
              Live
            </StatusPill>
            <StatusPill>1,789-investor universe</StatusPill>
          </>
        }
      >
        {m.description}
      </ModuleHero>
      <PortfolioXRayClient />
    </div>
  );
}
