"use client";
// Typeahead investor picker — fuzzy filters the universe and pushes URL
import { useState, useMemo, useRef, useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";

interface Props {
  universe: string[];
  popular: string[];
}

export function InvestorSearch({ universe, popular }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("investor") ?? "";
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const suggestions = useMemo(() => {
    if (!q.trim()) return [];
    const lower = q.toLowerCase();
    const starts: string[] = [];
    const contains: string[] = [];
    for (const u of universe) {
      const ul = u.toLowerCase();
      if (ul === lower) starts.unshift(u);
      else if (ul.startsWith(lower)) starts.push(u);
      else if (ul.includes(lower)) contains.push(u);
      if (starts.length + contains.length >= 30) break;
    }
    return [...starts.slice(0, 10), ...contains.slice(0, 10)];
  }, [q, universe]);

  const select = (name: string) => {
    setQ(name);
    setOpen(false);
    startTransition(() => router.push(`/modules/investor-deep-dive?investor=${encodeURIComponent(name)}`));
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search
          size={16}
          strokeWidth={1.7}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none"
        />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && suggestions[0]) select(suggestions[0]);
            if (e.key === "Escape") setOpen(false);
          }}
          className="sov-input !pl-10 !pr-10 !py-3 !text-[0.95rem]"
          placeholder="Search any of 1,789 investors — e.g. Sequoia, Andreessen, Bessemer…"
          spellCheck={false}
        />
        {q && (
          <button
            onClick={() => {
              setQ("");
              setOpen(false);
              router.push("/modules/investor-deep-dive");
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-700"
            aria-label="Clear"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <X size={15} />}
          </button>
        )}
      </div>

      {open && (suggestions.length > 0 || (!q.trim() && popular.length > 0)) && (
        <div className="absolute z-30 w-full mt-2 bg-paper-200 border border-ink-200 rounded-md shadow-lg max-h-[420px] overflow-auto">
          {!q.trim() && (
            <div className="px-3 pt-2 pb-1 sov-label !text-[0.62rem]">Popular investors</div>
          )}
          {(q.trim() ? suggestions : popular).map((name) => (
            <button
              key={name}
              onClick={() => select(name)}
              className="w-full text-left px-4 py-2 text-[0.88rem] hover:bg-paper-300 hover:text-ink-900 flex items-center justify-between gap-3 group"
            >
              <span className="truncate">
                {q.trim() ? <Highlight text={name} q={q} /> : name}
              </span>
              <span className="font-mono text-[0.65rem] text-ink-300 group-hover:text-gold-700">↵</span>
            </button>
          ))}
          {q.trim() && suggestions.length === 0 && (
            <div className="px-4 py-3 text-[0.85rem] text-ink-400">No investor matches that query.</div>
          )}
        </div>
      )}
    </div>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-gold-100 text-gold-900 px-0.5 rounded">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}
