"use client";

import { useState, useCallback } from "react";
import { Search, Shield, TrendingUp, AlertCircle } from "lucide-react";

interface SearchResult {
  type: "investor" | "company";
  name: string;
  score: number;
  tps?: number | null;
  portfolio_size?: number | null;
  id?: string;
  category?: string;
  country?: string;
  status?: string;
}

interface SealedReceipt {
  receipt_sha256: string;
  verify_url: string;
  issued_at: string;
  entity_name: string;
}

export function PulseEntitySearch() {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<SearchResult[]>([]);
  const [loading, setLoading]   = useState(false);
  const [sealing, setSealing]   = useState<string | null>(null);
  const [sealed, setSealed]     = useState<Record<string, SealedReceipt>>({});
  const [error, setError]       = useState<string | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setResults([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/entity/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setResults(json.results ?? []);
    } catch {
      setError("Search failed — check network connection");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    if (v.length >= 2) search(v);
    else setResults([]);
  };

  const handleSeal = async (result: SearchResult) => {
    setSealing(result.name);
    try {
      const payload =
        result.type === "investor"
          ? { tps: result.tps, portfolio_size: result.portfolio_size }
          : { category: result.category, country: result.country, status: result.status };

      const res = await fetch("/api/entity/seal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_name: result.name,
          entity_type: result.type,
          payload,
        }),
      });
      const receipt: SealedReceipt = await res.json();
      setSealed((prev) => ({ ...prev, [result.name]: receipt }));
    } catch {
      setError("Seal failed — try again");
    } finally {
      setSealing(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search box */}
      <div className="relative">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
          {loading ? (
            <div className="w-4 h-4 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Search size={16} className="text-ink-400" />
          )}
        </div>
        <input
          type="text"
          value={query}
          onChange={handleInput}
          placeholder="Type any company or investor name — e.g. Sequoia, Stripe, PIF, Mubadala…"
          className="w-full pl-10 pr-4 py-3 bg-paper-100 border border-ink-200 rounded-lg
                     text-ink-800 text-sm placeholder:text-ink-300
                     focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400
                     font-sans transition"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="divide-y divide-ink-100 border border-ink-100 rounded-lg overflow-hidden bg-white">
          {results.map((r) => {
            const existingReceipt = sealed[r.name];
            const isSealing = sealing === r.name;
            return (
              <div
                key={`${r.type}-${r.name}`}
                className="flex items-center gap-4 p-4 hover:bg-paper-50 transition"
              >
                {/* Type badge */}
                <div className="flex-shrink-0">
                  {r.type === "investor" ? (
                    <TrendingUp size={18} className="text-gold-600" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-info-600 opacity-70" />
                  )}
                </div>

                {/* Entity info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-ink-800 text-sm truncate">
                    {r.name}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="font-mono text-[0.62rem] text-ink-300 uppercase">
                      {r.type}
                    </span>
                    {r.type === "investor" && r.tps != null && (
                      <span className="font-mono text-[0.65rem] text-gold-700">
                        TPS · {Number(r.tps).toFixed(4)}
                      </span>
                    )}
                    {r.type === "investor" && r.portfolio_size != null && (
                      <span className="font-mono text-[0.65rem] text-ink-400">
                        portfolio · {r.portfolio_size}
                      </span>
                    )}
                    {r.type === "company" && r.category && (
                      <span className="font-mono text-[0.65rem] text-ink-400">
                        {r.category}
                      </span>
                    )}
                    {r.type === "company" && r.country && (
                      <span className="font-mono text-[0.65rem] text-ink-400">
                        {r.country}
                      </span>
                    )}
                    <span className="font-mono text-[0.6rem] text-ink-200">
                      match {(r.score * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* Receipt or seal button */}
                <div className="flex-shrink-0">
                  {existingReceipt ? (
                    <a
                      href={existingReceipt.verify_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[0.7rem] font-mono text-ok-700
                                 bg-ok-50 border border-ok-200 px-3 py-1.5 rounded hover:bg-ok-100 transition"
                    >
                      <Shield size={12} />
                      verify receipt →
                    </a>
                  ) : (
                    <button
                      onClick={() => handleSeal(r)}
                      disabled={isSealing}
                      className="flex items-center gap-1.5 text-[0.7rem] font-mono text-gold-700
                                 bg-paper-200 border border-ink-200 px-3 py-1.5 rounded
                                 hover:bg-gold-50 hover:border-gold-300 transition disabled:opacity-50"
                    >
                      <Shield size={12} />
                      {isSealing ? "sealing…" : "seal snapshot"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {query.length >= 2 && !loading && results.length === 0 && (
        <p className="text-sm text-ink-400 text-center py-4">
          No match found for &ldquo;{query}&rdquo; in the graph universe.
          <br />
          <span className="text-[0.75rem]">
            The universe covers 16,765 investors and 21,362 companies from the augmented pipeline.
          </span>
        </p>
      )}

      {query.length === 0 && (
        <p className="text-[0.78rem] text-ink-300 text-center py-2">
          Search the full graph universe · results matched by Dice-Sørensen similarity ·
          seal any snapshot with one click
        </p>
      )}
    </div>
  );
}
