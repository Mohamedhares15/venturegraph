import Link from "next/link";
import { Compass, ArrowRight } from "lucide-react";
import { Card, CardLabel } from "@/components/ui/Card";
import { FLOORS } from "@/lib/modules";

export default function NotFound() {
  return (
    <div className="sov-fade-up py-10">
      <Card className="!p-10 max-w-3xl mx-auto text-center" variant="info">
        <div className="flex justify-center mb-4">
          <div className="sov-seal !w-20 !h-20 !text-[0.6rem]">
            ROUTE<br />404
          </div>
        </div>
        <CardLabel className="!text-info-700">No such module</CardLabel>
        <h1 className="text-[1.6rem] font-semibold text-ink-900 mt-2">
          That route is not on any of the five floors.
        </h1>
        <p className="text-ink-600 mt-2 max-w-xl mx-auto leading-relaxed">
          Pick a destination from the architecture below — or return to the landing page.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/" className="sov-btn sov-btn--primary">
            <Compass size={14} strokeWidth={1.7} />
            Back to landing
            <ArrowRight size={13} strokeWidth={2} />
          </Link>
        </div>

        <div className="mt-8 text-left grid sm:grid-cols-2 gap-3">
          {FLOORS.flatMap((f) => f.modules)
            .filter((m) => m.status === "live")
            .map((m) => (
              <Link
                key={m.id}
                href={`/modules/${m.slug}`}
                className="px-3 py-2 rounded-md border border-ink-100 hover:border-gold-300 hover:bg-paper-300 transition-colors text-[0.88rem] text-ink-700 hover:text-ink-900 flex items-center justify-between gap-2"
              >
                <span>
                  <span className="font-mono text-[0.62rem] text-gold-700 mr-2">{m.num}</span>
                  {m.title}
                </span>
                <ArrowRight size={13} strokeWidth={2} className="text-ink-300" />
              </Link>
            ))}
        </div>
      </Card>
    </div>
  );
}
