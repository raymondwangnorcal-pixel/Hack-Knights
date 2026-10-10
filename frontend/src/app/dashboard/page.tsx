"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DISEASE_LABEL } from "@/lib/species";
import type { Country, DistrictRisk, ForecastResponse, RiskResponse } from "@/lib/types";

// v0 dashboard: ranked districts, a 2D risk map, forecast and Gemini plan.
// The three.js 3D columns and time slider replace <RiskMap2D> once this works end to end.

export default function DashboardPage() {
  const [country, setCountry] = useState<Country>("NG");
  const [risk, setRisk] = useState<RiskResponse | null>(null);
  const [selected, setSelected] = useState<DistrictRisk | null>(null);
  // Keyed by district so stale results never show for a newly selected district.
  const [forecastFor, setForecastFor] = useState<ForecastResponse | null>(null);
  const [planFor, setPlanFor] = useState<{ district: string; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/risk?country=${country}`)
      .then((r) => r.json())
      .then((data: RiskResponse) => {
        setRisk(data);
        setSelected(data.districts[0] ?? null);
      });
  }, [country]);

  useEffect(() => {
    if (!selected) return;
    const district = selected.district;
    fetch(`/api/forecast?district=${encodeURIComponent(district)}`)
      .then((r) => r.json())
      .then(setForecastFor);
    fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "district_plan", district, country: selected.country }),
    })
      .then((r) => r.json())
      .then((d) => setPlanFor({ district, text: d.text ?? "" }));
  }, [selected]);

  const forecast = forecastFor?.district === selected?.district ? forecastFor : null;
  const plan = planFor && planFor.district === selected?.district ? planFor.text : "";

  const city = country === "NG" ? "Lagos" : "São Paulo";
  const disease = country === "NG" ? "malaria" : "dengue";

  return (
    <div className="theme-dark flex min-h-screen flex-1 flex-col">
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/?side=prevention" className="text-sm opacity-60">← Mozzy</Link>
          <h1 className="text-2xl font-semibold">
            {city} · {disease} risk
          </h1>
          {risk?.is_simulated && (
            <span className="rounded-full bg-current/10 px-2 py-0.5 text-xs">Simulated data</span>
          )}
        </div>
        <div className="flex rounded-full border p-1">
          {(["NG", "BR"] as Country[]).map((c) => (
            <button
              key={c}
              onClick={() => setCountry(c)}
              className={`rounded-full px-4 py-1 text-sm ${
                country === c ? "bg-foreground text-background" : ""
              }`}
            >
              {c === "NG" ? "Nigeria" : "Brazil"}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-2xl border p-4">
          {risk && (
            <RiskMap2D
              districts={risk.districts}
              selected={selected?.district}
              onSelect={setSelected}
            />
          )}
        </section>

        <aside className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold opacity-60">Treat this week</h2>
          {risk?.districts.map((d) => (
            <button
              key={d.district}
              onClick={() => setSelected(d)}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left ${
                selected?.district === d.district ? "border-foreground" : ""
              }`}
            >
              <span>
                <span className="mr-2 opacity-50">{d.rank}</span>
                {d.district}
              </span>
              <span className="text-sm tabular-nums">
                {d.risk_score} · {d.detections_7d} buzzes / 7d
              </span>
            </button>
          ))}
        </aside>
      </div>

      {selected && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border p-4">
            <h2 className="font-semibold">
              {selected.district}: {DISEASE_LABEL[selected.main_disease]} cases, next 4 weeks
            </h2>
            {forecast ? (
              <ForecastBars forecast={forecast} />
            ) : (
              <p className="opacity-60">Loading forecast…</p>
            )}
          </section>
          <section className="rounded-2xl border p-4">
            <h2 className="font-semibold">Recommended actions</h2>
            <p className="mt-2 whitespace-pre-line">{plan || "Generating…"}</p>
          </section>
        </div>
      )}
    </main>
    </div>
  );
}

function RiskMap2D({
  districts,
  selected,
  onSelect,
}: {
  districts: DistrictRisk[];
  selected?: string;
  onSelect: (d: DistrictRisk) => void;
}) {
  const { project } = useMemo(() => {
    const lats = districts.map((d) => d.lat);
    const lngs = districts.map((d) => d.lng);
    const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
    const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
    const pad = 60;
    return {
      project: (d: DistrictRisk) => ({
        x: pad + ((d.lng - minLng) / (maxLng - minLng || 1)) * (640 - 2 * pad),
        y: pad + ((maxLat - d.lat) / (maxLat - minLat || 1)) * (400 - 2 * pad),
      }),
    };
  }, [districts]);

  return (
    <svg viewBox="0 0 640 400" className="w-full" role="img" aria-label="District risk map">
      {districts.map((d) => {
        const { x, y } = project(d);
        const r = 10 + d.detections_7d / 6;
        const isSel = d.district === selected;
        return (
          <g key={d.district} onClick={() => onSelect(d)} className="cursor-pointer">
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={`hsl(${40 - d.risk_score * 0.4} 90% 50%)`}
              fillOpacity={0.55}
              stroke={isSel ? "currentColor" : "none"}
              strokeWidth={2}
            />
            <text x={x} y={y + r + 14} textAnchor="middle" fontSize={12} fill="currentColor">
              {d.district}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ForecastBars({ forecast }: { forecast: ForecastResponse }) {
  const max = Math.max(...forecast.weeks.map((w) => w.high));
  return (
    <div className="mt-4 flex h-48 items-end gap-4">
      {forecast.weeks.map((w) => (
        <div key={w.week_ahead} className="flex flex-1 flex-col items-center gap-1">
          <div className="relative w-full" style={{ height: `${(w.high / max) * 100}%` }}>
            <div
              className="absolute inset-x-0 bottom-0 rounded-t bg-amber-500/25"
              style={{ height: "100%" }}
            />
            <div
              className="absolute inset-x-0 bottom-0 rounded-t bg-amber-500"
              style={{ height: `${(w.mid / w.high) * 100}%` }}
            />
          </div>
          <span className="text-xs tabular-nums">{w.mid.toLocaleString()}</span>
          <span className="text-xs opacity-60">wk {w.week_ahead}</span>
        </div>
      ))}
    </div>
  );
}
