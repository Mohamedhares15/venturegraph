"use client";
import { useState, useEffect } from "react";

export function useData<T>(name: string): { data: T[]; loading: boolean; error: string | null } {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/data?name=${encodeURIComponent(name)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { setData(Array.isArray(d) ? d : []); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [name]);

  return { data, loading, error };
}

export function useMultiData<T extends Record<string, unknown[]>>(
  names: (keyof T & string)[],
): { data: T; loading: boolean } {
  const [data, setData] = useState<T>({} as T);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all(
      names.map((n) =>
        fetch(`/api/data?name=${encodeURIComponent(n)}`)
          .then((r) => r.ok ? r.json() : [])
          .catch(() => [])
          .then((d) => [n, Array.isArray(d) ? d : []] as [string, unknown[]]),
      ),
    ).then((entries) => {
      setData(Object.fromEntries(entries) as T);
      setLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading };
}
