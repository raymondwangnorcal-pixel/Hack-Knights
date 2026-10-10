"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DISEASE_LABEL } from "@/lib/species";
import RiskHeatMap from "@/components/RiskHeatMap";
import ForecastChart from "@/components/ForecastChart";
import type {
  Country,
  DetectionsResponse,
  DistrictRisk,
  ForecastResponse,
  RiskResponse,
} from "@/lib/types";

// v0 dashboard: ranked districts, a 2D risk map, forecast and Gemini plan.
// The three.js 3D columns and time slider replace <RiskMap2D> once this works end to end.

export default function DashboardPage() {
  const [country, setCountry] = useState<Country>("NG");
  const [risk, setRisk] = useState<RiskResponse | null>(null);
  const [selected, setSelected] = useState<DistrictRisk | null>(null);
  const [detections, setDetections] = useState<DetectionsResponse | null>(null);
  // Keyed by district so stale results never show for a newly selected district.
  const [forecastFor, setForecastFor] = useState<ForecastResponse | null>(null);
  const [planFor, setPlanFor] = useState<{ district: string; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/risk?country=${country}`)
      .then((r) => r.json())
      .then((data: RiskResponse) => {
        setRisk(data);
        setSelected(data.districts[0] ?? null);
        const since = new Date(Date.parse(data.updated_at) - 7 * 864e5).toISOString();
        return fetch(`/api/detections?country=${data.country}&since=${encodeURIComponent(since)}`);
      })
      .then((r) => r.json())
      .then(setDetections);
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

  // Keep the previous district's results on screen (dimmed) while the new ones load,
  // so the page height stays put and the scroll position doesn't jump.
  const forecastStale = !!forecastFor && forecastFor.district !== selected?.district;
  const planStale = !!planFor && planFor.district !== selected?.district;

  const city = country === "NG" ? "Lagos" : country === "BR" ? "São Paulo" : "New York";
  const disease = country === "NG" ? "malaria" : country === "BR" ? "dengue" : "west_nile";

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
          {(["NG", "BR", "US"] as Country[]).map((c) => (
            <button
              key={c}
              onClick={() => setCountry(c)}
              className={`rounded-full px-4 py-1 text-sm ${
                country === c ? "bg-foreground text-background" : ""
              }`}
            >
              {c === "NG" ? "Nigeria" : c === "BR" ? "Brazil" : "USA"}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-2xl border p-4">
          {risk && (
            <RiskHeatMap
              districts={risk.districts}
              detections={detections?.country === risk.country ? detections.detections : []}
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
              {forecastFor ? forecastFor.district : selected.district}:{" "}
              {DISEASE_LABEL[forecastFor ? forecastFor.disease : selected.main_disease]} cases, next 4
              weeks
            </h2>
            {forecastFor ? (
              <div className={`transition-opacity ${forecastStale ? "opacity-40" : ""}`}>
                <ForecastChart forecast={forecastFor} />
              </div>
            ) : (
              <p className="opacity-60">Loading forecast…</p>
            )}
          </section>
          <section className="rounded-2xl border p-4">
            <h2 className="font-semibold">Recommended actions</h2>
            <p
              className={`mt-2 whitespace-pre-line transition-opacity ${planStale ? "opacity-40" : ""}`}
            >
              {planFor?.text || "Generating…"}
            </p>
          </section>
        </div>
      )}
    </main>
    </div>
  );
}

