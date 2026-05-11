import type { Metadata } from "next";
import { ModuleHero } from "@/components/ui/ModuleHero";
import { StatusPill } from "@/components/ui/StatusPill";
import { AuditVaultClient } from "./AuditVaultClient";
import { moduleBySlug } from "@/lib/modules";

export const metadata: Metadata = {
  title: "Audit Vault · VentureGraph Sovereign",
};

export default function AuditVaultPage() {
  const m = moduleBySlug("audit-vault")!;
  return (
    <div className="sov-fade-up">
      <ModuleHero
        num={m.num}
        floor="FLOOR 04 · TRUST & AUDIT"
        title={m.title}
        tagline={m.tagline}
        actions={
          <>
            <StatusPill variant="ok">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse" />
              Live
            </StatusPill>
            <StatusPill>SHA-256</StatusPill>
          </>
        }
      >
        {m.description}
      </ModuleHero>
      <AuditVaultClient />
    </div>
  );
}
