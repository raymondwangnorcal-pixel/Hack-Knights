"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { DISEASE_LABEL } from "@/lib/species";
import RiskHeatMap from "@/components/RiskHeatMap";
import ForecastChart from "@/components/ForecastChart";
import { CITIES, CITY_ZOOM, DISTRICT_ZOOM, type City, type MapFocus } from "@/lib/cities";
import type {
  Country,
  DetectionsResponse,
  DistrictRisk,
  ForecastResponse,
  RiskResponse,
} from "@/lib/types";

// Same look as the home page intro.
const BG = "#13110F";
const INK = "#ECE6DA";
const ORANGE = "#F07636";
const RED = "#E0434A";
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const TYPE = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };

// v0 dashboard: ranked districts, a 2D risk map, forecast and Gemini plan.
// The three.js 3D columns and time slider replace <RiskMap2D> once this works end to end.

export default function DashboardPage() {
  const [country, setCountry] = useState<Country>("NG");
  const [risk, setRisk] = useState<RiskResponse | null>(null);
  const [selected, setSelected] = useState<DistrictRisk | null>(null);
  const [detections, setDetections] = useState<DetectionsResponse | null>(null);
  const [activeCity, setActiveCity] = useState<City | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
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

  const selectCity = (c: City) => {
    setActiveCity(c);
    setFocus({ key: Date.now(), lat: c.lat, lng: c.lng, zoom: CITY_ZOOM });
  };
  const backToCities = () => {
    setActiveCity(null);
    setFocus({ key: Date.now(), reset: true });
  };
  const selectDistrict = (d: DistrictRisk) => {
    setSelected(d);
    setFocus({ key: Date.now(), lat: d.lat, lng: d.lng, zoom: DISTRICT_ZOOM });
  };
  const changeCountry = (c: Country) => {
    setCountry(c);
    setActiveCity(null);
    setFocus(null);
  };

  return (
    <div
      className="flex min-h-screen flex-1 flex-col"
      style={
        {
          backgroundColor: BG,
          color: INK,
          colorScheme: "dark",
          "--background": BG,
          "--foreground": INK,
        } as CSSProperties
      }
    >
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/?side=prevention" className="text-xs uppercase tracking-widest opacity-60" style={TYPE}>
              ← Mozzy
            </Link>
            <h1 className="mt-1 text-5xl leading-none tracking-wide uppercase" style={DISPLAY}>
              <span style={{ color: ORANGE }}>{city}</span> · {disease.replace("_", " ")} risk
            </h1>
          </div>
          {risk?.is_simulated && (
            <span
              className="rounded-sm border px-2 py-1 text-[11px] uppercase tracking-widest"
              style={{ ...TYPE, borderColor: `${INK}33`, color: `${INK}99` }}
            >
              Simulated data
            </span>
          )}
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-sm border p-4" style={{ borderColor: `${INK}33` }}>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {(["NG", "BR", "US"] as Country[]).map((c) => {
                const active = country === c;
                return (
                  <button
                    key={c}
                    onClick={() => changeCountry(c)}
                    aria-pressed={active}
                    className="rounded-sm border px-4 py-2 text-lg uppercase tracking-widest transition-colors"
                    style={{
                      ...DISPLAY,
                      borderColor: active ? ORANGE : `${INK}33`,
                      backgroundColor: active ? ORANGE : "transparent",
                      color: active ? BG : `${INK}b3`,
                    }}
                  >
                    {c === "NG" ? "Nigeria" : c === "BR" ? "Brazil" : "USA"}
                  </button>
                );
              })}
            </div>
            {risk && (
              <RiskHeatMap
                districts={risk.districts}
                detections={detections?.country === risk.country ? detections.detections : []}
                selected={selected?.district}
                onSelect={selectDistrict}
                onCitySelect={selectCity}
                focus={focus}
              />
            )}
          </section>

          <aside className="flex flex-col gap-2">
            {activeCity ? (
              <>
                <button
                  onClick={backToCities}
                  className="self-start text-xs uppercase tracking-widest opacity-70 hover:opacity-100"
                  style={TYPE}
                >
                  ← All cities
                </button>
                <h2 className="text-3xl tracking-wide uppercase" style={DISPLAY}>
                  <span style={{ color: ORANGE }}>{activeCity.name}</span> · locations
                </h2>
                {activeCity.hasData ? (
                  risk?.districts.map((d) => {
                    const active = selected?.district === d.district;
                    return (
                      <button
                        key={d.district}
                        onClick={() => selectDistrict(d)}
                        className="flex items-center justify-between rounded-sm border px-3 py-2 text-left"
                        style={{
                          borderColor: active ? ORANGE : `${INK}33`,
                          backgroundColor: active ? `${ORANGE}1a` : "transparent",
                        }}
                      >
                        <span className="text-lg uppercase tracking-wide" style={DISPLAY}>
                          <span className="mr-2" style={{ color: ORANGE }}>
                            {d.rank}
                          </span>
                          {d.district}
                        </span>
                        <span className="text-xs tabular-nums" style={{ ...TYPE, color: `${INK}b3` }}>
                          {d.risk_score}/100 · {d.detections_7d} buzzes / 7d
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="text-sm leading-relaxed" style={{ ...TYPE, color: `${INK}99` }}>
                    No detection data for {activeCity.name} yet.
                  </p>
                )}
              </>
            ) : (
              <>
                <h2 className="text-3xl tracking-wide uppercase" style={DISPLAY}>
                  Pick a <span style={{ color: RED }}>city</span>
                </h2>
                {CITIES[country].map((c) => (
                  <button
                    key={c.name}
                    onClick={() => selectCity(c)}
                    className="flex items-center justify-between rounded-sm border px-3 py-2 text-left"
                    style={{ borderColor: c.hasData ? `${ORANGE}80` : `${INK}33` }}
                  >
                    <span
                      className="text-lg uppercase tracking-wide"
                      style={{ ...DISPLAY, color: c.hasData ? ORANGE : INK }}
                    >
                      {c.name}
                    </span>
                    <span className="text-xs tabular-nums" style={{ ...TYPE, color: `${INK}b3` }}>
                      {c.hasData && risk
                        ? `${risk.districts.length} locations · top ${Math.max(...risk.districts.map((d) => d.risk_score))}/100`
                        : "No data yet"}
                    </span>
                  </button>
                ))}
              </>
            )}
          </aside>
        </div>

        {selected && (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-sm border p-4" style={{ borderColor: `${INK}33` }}>
              <h2 className="text-2xl tracking-wide uppercase" style={DISPLAY}>
                <span style={{ color: ORANGE }}>{forecastFor ? forecastFor.district : selected.district}</span>:{" "}
                {DISEASE_LABEL[forecastFor ? forecastFor.disease : selected.main_disease]} cases, next 4 weeks
              </h2>
              {forecastFor ? (
                <div className={`transition-opacity ${forecastStale ? "opacity-40" : ""}`}>
                  <ForecastChart forecast={forecastFor} />
                </div>
              ) : (
                <p className="opacity-60" style={TYPE}>
                  Loading forecast…
                </p>
              )}
            </section>
            <section className="rounded-sm border p-4" style={{ borderColor: `${INK}33` }}>
              <h2 className="text-2xl tracking-wide uppercase" style={DISPLAY}>
                Recommended <span style={{ color: RED }}>actions</span>
              </h2>
              <p
                className={`mt-2 whitespace-pre-line text-sm leading-relaxed transition-opacity ${planStale ? "opacity-40" : ""}`}
                style={TYPE}
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
