"use client";

import { useEffect, useState } from "react";
import { RollingNumber } from "@/components/RollingNumber";
import { DISEASES, SECONDS_PER_YEAR } from "@/lib/burden";

/** Seconds elapsed since Jan 1 (UTC) of the current year, refreshed every `ms`. */
function useYearSeconds(ms = 200): number | null {
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    const yearStart = Date.UTC(new Date().getUTCFullYear(), 0, 1);
    const update = () => setSecs((Date.now() - yearStart) / 1000);
    const id = setInterval(update, ms);
    const first = setTimeout(update, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [ms]);
  return secs;
}

// A live total plus a per-disease breakdown, all counting up from Jan 1.
export function LiveCounter({
  metric,
  label,
  sublabel,
  accent,
}: {
  metric: "cases" | "deaths";
  label: string;
  sublabel: string;
  accent: "amber" | "red";
}) {
  const secs = useYearSeconds();
  const perYear = (n: number) => (secs === null ? null : Math.floor((secs / SECONDS_PER_YEAR) * n));
  const total = DISEASES.reduce((s, d) => s + d[metric], 0);
  const dot = accent === "amber" ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider opacity-60">
        <span className={`inline-block h-1.5 w-1.5 animate-pulse rounded-full ${dot}`} />
        {label}
      </span>
      <RollingNumber
        value={perYear(total)}
        className="text-3xl font-semibold tabular-nums tracking-tight sm:text-5xl"
      />
      <span className="text-xs opacity-60">{sublabel}</span>

      <ul className="mt-1 flex flex-col gap-1.5 text-sm">
        {DISEASES.map((d) => (
          <li key={d.name} className="flex items-baseline justify-between gap-4">
            <span className="opacity-60">{d.name}</span>
            <RollingNumber value={perYear(d[metric])} className="tabular-nums" />
          </li>
        ))}
      </ul>
    </div>
  );
}
