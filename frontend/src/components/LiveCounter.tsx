"use client";

import { useEffect, useState } from "react";

// Counts up live from Jan 1 of the current year at a fixed per-second rate.
// Computed from elapsed time on every frame, so it never drifts.
export function LiveCounter({
  ratePerSecond,
  label,
  sublabel,
  tone,
}: {
  ratePerSecond: number;
  label: string;
  sublabel: string;
  tone: "light" | "dark";
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

  const muted = tone === "light" ? "text-neutral-500" : "text-neutral-400";
  const dot = tone === "light" ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex flex-col gap-1">
      <span className={`flex items-center gap-2 font-mono text-xs uppercase tracking-wider ${muted}`}>
        <span className={`inline-block h-1.5 w-1.5 animate-pulse rounded-full ${dot}`} />
        {label}
      </span>
      <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
        {value === null ? "—" : value.toLocaleString("en-US")}
      </span>
      <span className={`text-xs ${muted}`}>{sublabel}</span>
    </div>
  );
}
