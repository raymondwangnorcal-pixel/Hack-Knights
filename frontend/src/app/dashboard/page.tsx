"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { DISEASE_LABEL } from "@/lib/species";
import RiskHeatMap from "@/components/RiskHeatMap";
import { SLIDE_MS, SlideStage } from "@/components/SlideStage";
import { DOT_GRADIENT } from "@/lib/dotColors";
import ForecastChart from "@/components/ForecastChart";
import { CITY_ZOOM, DISTRICT_ZOOM, type City, type MapFocus } from "@/lib/cities";
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
const COUNTRIES: Country[] = ["NG", "BR", "US"];
const TYPE = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };

// v0 dashboard: ranked districts, a 2D risk map, forecast and Gemini plan.
// The three.js 3D columns and time slider replace <RiskMap2D> once this works end to end.

export default function DashboardPage() {
  const [country, setCountry] = useState<Country>("NG");
  const [slideDir, setSlideDir] = useState<1 | -1>(1);
  const sliding = useRef(false);
  const resetCount = useRef(0);
  const [panelOpen, setPanelOpen] = useState(false);
  // Maps stay mounted while off-screen, so a map left zoomed on a city is sent back to the whole-country
  // view (after the slide, where nobody sees it) for when you return.
  const [resets, setResets] = useState<Partial<Record<Country, number>>>({});
  // All three countries are fetched up front, so switching never waits on the network mid-slide.
  const [data, setData] = useState<Partial<Record<Country, { risk: RiskResponse; detections: DetectionsResponse }>>>({});
  const [picked, setPicked] = useState<DistrictRisk | null>(null);
  const [activeCity, setActiveCity] = useState<City | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  // Keyed by district so stale results never show for a newly selected district.
  const [forecastFor, setForecastFor] = useState<ForecastResponse | null>(null);
  const [planFor, setPlanFor] = useState<{ district: string; text: string } | null>(null);
  const risk = data[country]?.risk ?? null;
  // Until a district is picked in this country, the top-ranked one is selected.
  const selected = picked?.country === country ? picked : (risk?.districts[0] ?? null);

  useEffect(() => {
    COUNTRIES.forEach((c) => {
      fetch(`/api/risk?country=${c}`)
        .then((r) => r.json())
        .then(async (r: RiskResponse) => {
          const since = new Date(Date.parse(r.updated_at) - 7 * 864e5).toISOString();
          const detections: DetectionsResponse = await fetch(
            `/api/detections?country=${c}&since=${encodeURIComponent(since)}`,
          ).then((d) => d.json());
          setData((prev) => ({ ...prev, [c]: { risk: r, detections } }));
        })
        .catch((err) => console.error(`[dashboard] could not load ${c}`, err));
    });
  }, []);

  // Live: each new detection from the phone pipeline (Postgres NOTIFY -> /stream) refetches the
  // last 7 days of dots, debounced so a burst of uploads costs one request.
  useEffect(() => {
    const es = new EventSource(`/api/stream?country=${country}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    es.addEventListener("detection", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const since = new Date(Date.now() - 7 * 864e5).toISOString();
        fetch(`/api/detections?country=${country}&since=${encodeURIComponent(since)}`)
          .then((r) => r.json())
          .then((d: DetectionsResponse) => {
            if (d.country === country) setData((prev) => (prev[country] ? { ...prev, [country]: { ...prev[country], detections: d } } : prev));
          });
      }, 1500);
    });
    return () => {
      clearTimeout(timer);
      es.close();
    };
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
    setFocus({ key: Date.now(), lat: c.lat, lng: c.lng, zoom: c.zoom ?? CITY_ZOOM });
  };
  const backToCities = () => {
    setActiveCity(null);
    setFocus({ key: Date.now(), reset: true });
  };
  const selectDistrict = (d: DistrictRisk) => {
    setPicked(d);
    setPanelOpen(true);
    setFocus({ key: Date.now(), lat: d.lat, lng: d.lng, zoom: DISTRICT_ZOOM });
  };
  const changeCountry = (c: Country, dir?: 1 | -1) => {
    if (sliding.current) return;
    if (c === country) {
      // The current country's button doubles as "zoom all the way out": back to the whole-country view.
      setActiveCity(null);
      setFocus({ key: -(resetCount.current += 1), reset: true });
      return;
    }
    if (!data[c]) return;
    sliding.current = true;
    setTimeout(() => (sliding.current = false), SLIDE_MS + 100);
    setSlideDir(dir ?? (COUNTRIES.indexOf(c) > COUNTRIES.indexOf(country) ? 1 : -1));
    const leaving = country;
    setTimeout(() => setResets((r) => ({ ...r, [leaving]: Date.now() })), SLIDE_MS + 200);
    setCountry(c);
    setActiveCity(null);
    setFocus(null);
  };
  // Arrows wrap around: past the last country comes the first.
  const step = (dir: 1 | -1) => changeCountry(COUNTRIES[(COUNTRIES.indexOf(country) + dir + COUNTRIES.length) % COUNTRIES.length], dir);

  return (
    <div
      className="relative h-svh w-full overflow-hidden"
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
      {/* The map is the whole page. Everything else floats on it. */}
      <SlideStage
        keys={COUNTRIES}
        current={country}
        dir={slideDir}
        render={(c) => {
          const d = data[c];
          if (!d) return null;
          return (
            <RiskHeatMap
              districts={d.risk.districts}
              detections={d.detections.country === c ? d.detections.detections : []}
              selected={c === country ? selected?.district : undefined}
              onSelect={selectDistrict}
              onCitySelect={selectCity}
              focus={c === country ? focus : resets[c] ? { key: resets[c]!, reset: true } : null}
            />
          );
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex flex-wrap items-start justify-between gap-4 px-5 pt-4">
        <div style={{ textShadow: "0 0 6px #000, 0 0 14px #000" }}>
          <Link href="/?side=prevention" className="pointer-events-auto text-xs uppercase tracking-widest opacity-70 hover:opacity-100" style={TYPE}>
            ← Mozzy
          </Link>
          <h1 className="mt-1 text-5xl leading-none tracking-wide uppercase" style={DISPLAY}>
            <span style={{ color: ORANGE }}>{city}</span> · {disease.replace("_", " ")} risk
          </h1>
          {activeCity && (
            <button
              onClick={backToCities}
              className="pointer-events-auto mt-2 text-xs uppercase tracking-widest opacity-70 hover:opacity-100"
              style={TYPE}
            >
              ← all cities
            </button>
          )}
        </div>
        <div className="pointer-events-auto flex gap-2">
          {COUNTRIES.map((c) => {
            const active = country === c;
            return (
              <button
                key={c}
                onClick={() => changeCountry(c)}
                aria-pressed={active}
                className="rounded-sm border px-4 py-1.5 text-lg uppercase tracking-widest transition-colors"
                style={{
                  ...DISPLAY,
                  borderColor: active ? ORANGE : `${INK}40`,
                  backgroundColor: active ? ORANGE : "rgba(19,17,15,0.75)",
                  color: active ? BG : `${INK}b3`,
                }}
              >
                {c === "NG" ? "Nigeria" : c === "BR" ? "Brazil" : "USA"}
              </button>
            );
          })}
        </div>
      </div>

      {(["left", "right"] as const).map((side) => (
        <button
          key={side}
          onClick={() => step(side === "left" ? -1 : 1)}
          aria-label={side === "left" ? "Previous country" : "Next country"}
          className={`absolute top-1/2 z-[1000] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border transition-colors hover:bg-white/10 ${side === "left" ? "left-4" : "right-4"}`}
          style={{ borderColor: `${INK}40`, backgroundColor: "rgba(19,17,15,0.6)", color: INK }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
            <path d={side === "left" ? "M11 3 5 9l6 6" : "M7 3l6 6-6 6"} />
          </svg>
        </button>
      ))}

      {/* Selected district: a pill that opens into the forecast and the recommended actions. */}
      {selected && (
        <div className="absolute bottom-12 left-4 z-[1000] w-[min(780px,calc(100vw-2rem))] sm:left-20">
          {panelOpen ? (
            <section
              className="rounded-sm border p-4 backdrop-blur-md"
              style={{ borderColor: `${INK}33`, backgroundColor: "rgba(19,17,15,0.88)" }}
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-2xl leading-none tracking-wide uppercase" style={DISPLAY}>
                  <span style={{ color: ORANGE }}>{selected.district}</span>
                  <span className="ml-3 text-base" style={{ ...TYPE, color: `${INK}b3` }}>
                    risk {selected.risk_score}/100 · {selected.detections_7d} detections / 7d
                  </span>
                </h2>
                <button
                  onClick={() => setPanelOpen(false)}
                  aria-label="Close"
                  className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center opacity-70 hover:opacity-100"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1" fill="none" aria-hidden="true">
                    <path d="m2 2 10 10M12 2 2 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-3 grid max-h-[46svh] gap-5 overflow-y-auto md:grid-cols-2" data-lenis-prevent>
                <div>
                  <h3 className="text-lg tracking-wide uppercase" style={DISPLAY}>
                    {DISEASE_LABEL[forecastFor ? forecastFor.disease : selected.main_disease]}{" "}
                    {forecastFor?.unit === "positive mosquito pools" ? "positive pools" : "cases"}, next 4 weeks
                  </h3>
                  {forecastFor ? (
                    <div className={`transition-opacity ${forecastStale ? "opacity-40" : ""}`}>
                      <ForecastChart forecast={forecastFor} />
                    </div>
                  ) : (
                    <p className="mt-3 opacity-60" style={TYPE}>
                      Loading forecast…
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="text-lg tracking-wide uppercase" style={DISPLAY}>
                    Recommended <span style={{ color: RED }}>actions</span>
                  </h3>
                  <p
                    className={`mt-3 whitespace-pre-line text-sm leading-relaxed transition-opacity ${planStale ? "opacity-40" : ""}`}
                    style={TYPE}
                  >
                    {planFor?.text || "Generating…"}
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <button
              onClick={() => setPanelOpen(true)}
              className="flex items-center gap-3 rounded-sm border px-4 py-2 text-left backdrop-blur-md transition-colors hover:bg-white/10"
              style={{ borderColor: `${INK}40`, backgroundColor: "rgba(19,17,15,0.8)" }}
            >
              <span className="text-lg tracking-wide uppercase" style={{ ...DISPLAY, color: ORANGE }}>
                {selected.district}
              </span>
              <span className="text-xs uppercase tracking-widest" style={{ ...TYPE, color: `${INK}b3` }}>
                forecast &amp; actions ↑
              </span>
            </button>
          )}
        </div>
      )}

      {/* Zoom buttons are page controls (not part of a map), so they stay put while maps slide. They send the
          same eased wheel zoom a mouse wheel does to the map in the middle of the screen. */}
      <div className="absolute bottom-6 right-4 z-[1000] flex flex-col overflow-hidden rounded-sm border" style={{ borderColor: `${INK}40`, backgroundColor: "rgba(19,17,15,0.75)" }}>
        {([["Zoom in", -450, "M3 9h12M9 3v12"], ["Zoom out", 450, "M3 9h12"]] as const).map(([label, delta, path]) => (
          <button
            key={label}
            aria-label={label}
            onClick={() => {
              const map = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.closest(".risk-map");
              if (!map) return;
              const r = map.getBoundingClientRect();
              map.dispatchEvent(new WheelEvent("wheel", { deltaY: delta, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
            }}
            className="flex h-9 w-9 items-center justify-center transition-colors hover:bg-white/10"
            style={{ color: INK }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
              <path d={path} />
            </svg>
          </button>
        ))}
      </div>

      {/* Bottom edge: what a dot is (left) and the colour key (right), clear of each other and of the zoom buttons. */}
      <div
        className="pointer-events-none absolute inset-x-4 bottom-8 z-[1000] flex items-end justify-between gap-6 text-[11px] uppercase tracking-widest opacity-80"
        style={{ ...TYPE, textShadow: "0 0 4px #000, 0 0 8px #000" }}
      >
        <span>1 dot = 1 mosquito detection, last 7 days{risk?.is_simulated ? " · simulated data" : ""}</span>
        <div className="mr-12 flex flex-col items-end gap-1">
          <span className="flex items-center gap-2">
            Center
            <span className="inline-block h-2 w-24 rounded-sm" style={{ background: DOT_GRADIENT }} />
            Outskirts
          </span>
          <span>More dots = higher risk</span>
        </div>
      </div>
      {/* Map credits (Leaflet's own box, restyled): plain light text, no background, stays put during slides. */}
      <p
        className="absolute bottom-2 right-[60px] z-[1000] text-[10px] tracking-wide"
        style={{ ...TYPE, color: INK, textShadow: "0 0 4px #000, 0 0 8px #000" }}
      >
        <a href="https://leafletjs.com" target="_blank" rel="noreferrer" className="hover:underline">Leaflet</a>
        {" | Tiles © Esri — Esri, HERE, Garmin, OpenStreetMap contributors · Relief © Esri"}
      </p>
    </div>
  );
}
