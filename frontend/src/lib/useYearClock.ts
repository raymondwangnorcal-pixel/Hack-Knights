"use client";

import { useEffect, useState } from "react";

/** Seconds since Jan 1 (UTC) of the current year, refreshed every `ms`. Null until mounted. */
export function useYearClock(ms: number): { secs: number; year: number } | null {
  const [clock, setClock] = useState<{ secs: number; year: number } | null>(null);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const year = now.getUTCFullYear();
      setClock({ secs: (now.getTime() - Date.UTC(year, 0, 1)) / 1000, year });
    };
    const id = setInterval(update, ms);
    const first = setTimeout(update, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [ms]);
  return clock;
}
