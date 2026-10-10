"use client";

import { useState } from "react";
import type { ForecastResponse } from "@/lib/types";

const W = 480;
const H = 220;
const PAD = { top: 16, right: 20, bottom: 32, left: 48 };
const LINE = "#f59e0b";

export default function ForecastChart({ forecast }: { forecast: ForecastResponse }) {
  const [hover, setHover] = useState<number | null>(null);
  const weeks = forecast.weeks;

  const max = Math.max(...weeks.map((w) => w.high));
  const min = Math.min(...weeks.map((w) => w.low));
  const step = niceStep((max - min) / 3 || max / 3);
  const yMin = Math.max(0, Math.floor(min / step) * step);
  const yMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = yMin; t <= yMax + 1e-9; t += step) ticks.push(t);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (weeks.length === 1 ? innerW / 2 : (i / (weeks.length - 1)) * innerW);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * innerH;

  const mid = weeks.map((w, i) => `${i ? "L" : "M"}${x(i)},${y(w.mid)}`).join(" ");
  const band =
    weeks.map((w, i) => `${i ? "L" : "M"}${x(i)},${y(w.high)}`).join(" ") +
    " " +
    [...weeks]
      .reverse()
      .map((w, i) => `L${x(weeks.length - 1 - i)},${y(w.low)}`)
      .join(" ") +
    " Z";

  const active = hover === null ? null : weeks[hover];

  return (
    <div className="relative mt-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Forecast cases per week with low to high range"
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.12} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="currentColor" fillOpacity={0.6}>
              {t.toLocaleString()}
            </text>
          </g>
        ))}

        <path d={band} fill={LINE} fillOpacity={0.18} />
        <path d={mid} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {active && hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="currentColor" strokeOpacity={0.3} />
        )}

        {weeks.map((w, i) => (
          <g key={w.week_ahead}>
            <circle
              cx={x(i)}
              cy={y(w.mid)}
              r={hover === i ? 6 : 4}
              fill={LINE}
              stroke="var(--background, #0a0a0a)"
              strokeWidth={2}
            />
            <text x={x(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="currentColor" fillOpacity={0.6}>
              wk {w.week_ahead}
            </text>
            <rect
              x={x(i) - innerW / (weeks.length - 1 || 1) / 2}
              y={PAD.top}
              width={innerW / (weeks.length - 1 || 1)}
              height={innerH}
              fill="transparent"
              onPointerEnter={() => setHover(i)}
              onPointerMove={() => setHover(i)}
            />
          </g>
        ))}

        <text
          x={x(weeks.length - 1)}
          y={y(weeks[weeks.length - 1].mid) - 12}
          textAnchor="end"
          fontSize={12}
          fontWeight={600}
          fill="currentColor"
        >
          {weeks[weeks.length - 1].mid.toLocaleString()}
        </text>
      </svg>

      <div className="mt-1 flex items-center gap-4 text-xs opacity-70">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: LINE }} /> Expected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm" style={{ background: LINE, opacity: 0.25 }} /> Low–high range
        </span>
      </div>

      {active && hover !== null && (
        <div
          className="pointer-events-none absolute rounded-lg border bg-background px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            top: 0,
            transform: `translateX(${hover > weeks.length / 2 ? "-105%" : "5%"})`,
          }}
        >
          <div className="font-semibold">Week {active.week_ahead}</div>
          <div className="tabular-nums">Expected: {active.mid.toLocaleString()}</div>
          <div className="tabular-nums opacity-70">
            Range: {active.low.toLocaleString()}–{active.high.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}
