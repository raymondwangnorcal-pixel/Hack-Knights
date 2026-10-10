"use client";

import { useEffect, useState } from "react";

// Counts up live from Jan 1 (UTC) of the current year at a fixed per-second rate.
// Computed from elapsed time on every frame, so it never drifts.
export function LiveCounter({
  ratePerSecond,
  label,
  sublabel,
  accent,
}: {
  ratePerSecond: number;
  label: string;
  sublabel: string;
  accent: "amber" | "red";
}) {
  const [value, setValue] = useState<number | null>(null);

  useEffect(() => {
    const yearStart = Date.UTC(new Date().getUTCFullYear(), 0, 1);
    let raf = 0;
    const tick = () => {
      setValue(Math.floor(((Date.now() - yearStart) / 1000) * ratePerSecond));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ratePerSecond]);

  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider opacity-60">
        <span
          className={`inline-block h-1.5 w-1.5 animate-pulse rounded-full ${
            accent === "amber" ? "bg-amber-500" : "bg-red-500"
          }`}
        />
        {label}
      </span>
      <span className="text-3xl font-semibold tabular-nums tracking-tight sm:text-5xl">
        {value === null ? "—" : value.toLocaleString("en-US")}
      </span>
      <span className="text-xs opacity-60">{sublabel}</span>
    </div>
  );
}
