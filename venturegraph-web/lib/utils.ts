import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format a number for institutional display.
export function fmt(value: number | null | undefined, opts: {
  digits?: number;
  signed?: boolean;
  pct?: boolean;
  compact?: boolean;
  fallback?: string;
} = {}): string {
  const { digits = 2, signed = false, pct = false, compact = false, fallback = "—" } = opts;
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  const v = pct ? value * 100 : value;
  let str: string;
  if (compact) {
    str = new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: digits,
    }).format(v);
  } else {
    str = v.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }
  if (pct) str += "%";
  if (signed && v > 0) str = "+" + str;
  return str;
}

export function fmtInt(value: number | null | undefined, fallback = "—"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return Math.round(value).toLocaleString("en-US");
}

export function shortHash(hash: string, n = 12): string {
  return hash ? hash.slice(0, n).toUpperCase() : "";
}

// Trim a string to len chars, ellipsis if longer
export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Group by key
export function groupBy<T, K extends string | number>(
  arr: T[],
  fn: (item: T) => K,
): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of arr) {
    const k = fn(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}
