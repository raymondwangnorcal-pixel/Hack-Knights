"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import RiskHeatMap from "@/components/RiskHeatMap";
import ForecastChart from "@/components/ForecastChart";
import { PreventionCard } from "@/components/PreventionCard";
import { CITY_ZOOM, DISTRICT_ZOOM, type City, type MapFocus } from "@/lib/cities";
import { DISEASE_LABEL } from "@/lib/species";
import { readAutoSpeak, setAutoSpeak, speak as speakLine, subscribeAutoSpeak, unlockAudio } from "@/lib/voice";
import type {
  Country,
  DetectionsResponse,
  DistrictRisk,
  ForecastResponse,
  Language,
  PreventionResponse,
  RiskResponse,
  VoiceLanguagesResponse,
} from "@/lib/types";

// The "For prevention" screen under the intro, for health departments and prevention groups.
// Mirrors the For you screen: left, the live risk map (detections as dots) with the district
// picker and a ranked district list in place of the listening card; right, the same Prevention
// card with three health-team actions for the selected district, chosen by Gemini when
// configured. Below, the district's 4-week forecast. This replaces the old /dashboard page.

const INK = "#ECE6DA";
const ORANGE = "#F07636";
const RED = "#E0434A";
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const COND = { fontFamily: "'Roboto Condensed', var(--font-geist-sans), sans-serif" };
const MONO = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };

const COUNTRIES: Country[] = ["NG", "BR", "US"];
const CITY: Record<Country, string> = { NG: "Lagos", BR: "São Paulo", US: "New York" };
const COUNTRY_NAME: Record<Country, string> = { NG: "Nigeria", BR: "Brazil", US: "USA" };
const MAP_HEIGHT = 460;

type Place = { country: Country; district: string };

const byRank = (ds: DistrictRisk[]) => [...ds].sort((a, b) => a.rank - b.rank);

function fetchRisk(c: Country): Promise<RiskResponse | null> {
  return fetch(`/api/risk?country=${c}`)
    .then((r) => r.json())
    .then((d: RiskResponse) => (d?.districts ? d : null))
    .catch(() => null);
}

export function PreventionScreen() {
  const [risk, setRisk] = useState<Record<Country, RiskResponse | null>>({ NG: null, BR: null, US: null });
  const [chosen, setChosen] = useState<Place | null>(null);
  const [detections, setDetections] = useState<DetectionsResponse | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [cityNote, setCityNote] = useState<string | null>(null);
  const [live, setLive] = useState<Country | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [language, setLanguage] = useState<Language>("en");
  const [voiced, setVoiced] = useState<Language[]>([]);
  // Keyed by place and language so a stale plan never shows after a switch.
  const [plan, setPlan] = useState<{ key: string; data: PreventionResponse } | null>(null);
  const [planRefresh, setPlanRefresh] = useState(0);
  const autoSpeak = useSyncExternalStore(subscribeAutoSpeak, readAutoSpeak, () => true);
  const picked = useRef(false); // the viewer has chosen a district, so a plan may be read aloud
  const spokenFor = useRef<string | null>(null);
  const focusKey = useRef(0); // each map move request gets a new key, so FlyToFocus fires once

  const storeRisk = (c: Country) => (d: RiskResponse | null) => {
    if (d) setRisk((prev) => ({ ...prev, [c]: d }));
  };

  // District lists for all three cities (the picker offers them all), and which languages have a voice.
  useEffect(() => {
    COUNTRIES.forEach((c) => fetchRisk(c).then(storeRisk(c)));
    fetch("/api/voice")
      .then((r) => r.json())
      .then((d: VoiceLanguagesResponse) => setVoiced(d.languages ?? []))
      .catch(() => setVoiced([]));
  }, []);

  // This visit's pick, else the highest-risk Lagos district.
  const place: Place = chosen ?? { country: "NG", district: byRank(risk.NG?.districts ?? [])[0]?.district ?? "" };
  const country = place.country;
  const countryRisk = risk[country];
  const districts = useMemo(() => byRank(countryRisk?.districts ?? []), [countryRisk]);
  const updatedAt = countryRisk?.updated_at;

  // Last 7 days of detections for the map; refetched whenever the district ranking refreshes.
  useEffect(() => {
    const updated = updatedAt;
    if (!updated) return;
    const controller = new AbortController();
    const since = new Date(Date.parse(updated) - 7 * 864e5).toISOString();
    fetch(`/api/detections?country=${country}&since=${encodeURIComponent(since)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d: DetectionsResponse) => {
        if (d?.country === country) setDetections(d);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [country, updatedAt]);

  // Live: each new detection from the phone pipeline (Postgres NOTIFY -> /stream) refetches the
  // district ranking (and through it the dots), debounced so a burst of uploads costs one request.
  useEffect(() => {
    const es = new EventSource(`/api/stream?country=${country}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    es.onopen = () => setLive(country);
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) setLive(null);
    };
    es.addEventListener("detection", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fetchRisk(country).then((d) => {
          if (d) setRisk((prev) => ({ ...prev, [country]: d }));
        });
      }, 1500);
    });
    return () => {
      clearTimeout(timer);
      es.close();
    };
  }, [country]);

  // Forecast for the selected district.
  useEffect(() => {
    if (!place.district) return;
    const controller = new AbortController();
    fetch(`/api/forecast?district=${encodeURIComponent(place.district)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ForecastResponse | null) => {
        if (d?.weeks?.length) setForecast(d);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [place.district]);

  // Health-team plan for the selected district; refreshed every 5 minutes like the For you card.
  useEffect(() => {
    const timer = setInterval(() => setPlanRefresh((n) => n + 1), 5 * 60_000);
    return () => clearInterval(timer);
  }, []);
  const planKey = `${place.country}:${place.district}:${language}:${planRefresh}`;
  useEffect(() => {
    if (!place.district) return;
    const controller = new AbortController();
    const key = planKey;
    fetch("/api/prevention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: place.country, district: place.district, language, audience: "health_team" }),
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error("Prevention unavailable");
        return r.json();
      })
      .then((data: PreventionResponse) => {
        if (!controller.signal.aborted && data.actions?.length === 3) setPlan({ key, data });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [place.country, place.district, language, planKey]);

  const shownPlan = plan?.key === planKey ? plan.data : null;
  const canSpeak = voiced.includes(language);
  const spokenTitles = useMemo(
    () => (shownPlan ? shownPlan.actions.filter((a) => !a.language || a.language === language).map((a) => a.title) : []),
    [shownPlan, language],
  );
  const sep = language === "zh" || language === "yue" ? "。" : ". ";
  const spokenText = (titles: string[]) => `${place.district}${sep}${titles.map((t) => t.replace(/[.。!！]+$/, "")).join(sep)}`;

  // Read a plan aloud once per district and language, only after the viewer picked a district.
  useEffect(() => {
    if (!picked.current || !autoSpeak || !canSpeak || !shownPlan || !spokenTitles.length) return;
    const id = `${place.country}:${place.district}:${language}`;
    if (spokenFor.current === id) return;
    spokenFor.current = id;
    speakLine(`${place.district}${sep}${spokenTitles.map((t) => t.replace(/[.。!！]+$/, "")).join(sep)}`, language);
  }, [autoSpeak, canSpeak, shownPlan, spokenTitles, place.country, place.district, language, sep]);

  function speak() {
    if (!shownPlan || !spokenTitles.length) return;
    unlockAudio();
    speakLine(spokenText(spokenTitles), language);
  }

  function selectDistrict(next: Place, zoom = true) {
    unlockAudio(); // inside the tap, so the plan can speak when it arrives
    picked.current = true;
    setChosen(next);
    setCityNote(null);
    const d = risk[next.country]?.districts.find((x) => x.district === next.district);
    if (zoom && d) setFocus({ key: ++focusKey.current, lat: d.lat, lng: d.lng, zoom: DISTRICT_ZOOM });
    else if (next.country !== country) setFocus(null);
  }

  function selectCountry(c: Country) {
    if (c === country) return;
    const top = byRank(risk[c]?.districts ?? [])[0];
    if (top) selectDistrict({ country: c, district: top.district }, false);
  }

  function selectCity(c: City) {
    setFocus({ key: ++focusKey.current, lat: c.lat, lng: c.lng, zoom: CITY_ZOOM });
    setCityNote(c.hasData ? null : `No detection data for ${c.name} yet.`);
  }

  const forecastShown = forecast && forecast.district === place.district ? forecast : null;
  const forecastStale = !!forecast && !forecastShown;
  const shownForecast = forecastShown ?? forecast;
  const unit = shownForecast?.unit === "positive mosquito pools" ? "positive pools" : "cases";

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="grid flex-1 gap-3 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
        {/* ---------- Map card ---------- */}
        <section aria-label="Live risk map" className="flex min-w-0 flex-col border border-[#ECE6DA]/20 px-4 pt-4 pb-5 sm:px-7 sm:pt-6">
          {/* Header: state · place · country tabs */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[#ECE6DA]/20 pb-4 sm:pb-5">
            <span className="flex items-center gap-2.5 text-[22px] leading-none tracking-[0.18em] uppercase sm:text-[26px]" style={{ ...DISPLAY, color: ORANGE }}>
              {live === country && <span className="live-dot h-2.5 w-2.5 rounded-full" style={{ backgroundColor: RED }} aria-hidden="true" />}
              {live === country ? "Live risk" : "Risk map"}
            </span>
            <span className="hidden h-7 w-px bg-[#ECE6DA]/25 sm:block" />
            <label className="relative flex items-center gap-1.5 text-[19px] sm:text-[22px]" style={COND}>
              <span>{place.district ? `${place.district}, ${CITY[country]}` : "Choose a district"}</span>
              <span aria-hidden="true" className="text-sm opacity-50">▾</span>
              <select
                aria-label="District"
                className="absolute inset-0 cursor-pointer opacity-0"
                value={`${country}|${place.district}`}
                onChange={(e) => {
                  const [c, d] = e.target.value.split("|") as [Country, string];
                  selectDistrict({ country: c, district: d });
                }}
              >
                {COUNTRIES.map((c) => (
                  <optgroup key={c} label={`${CITY[c]}, ${COUNTRY_NAME[c]}`}>
                    {byRank(risk[c]?.districts ?? []).map((d) => (
                      <option key={d.district} value={`${c}|${d.district}`}>
                        {d.district}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <div className="ml-auto flex gap-1" role="group" aria-label="City">
              {COUNTRIES.map((c) => {
                const active = c === country;
                return (
                  <button
                    key={c}
                    onClick={() => selectCountry(c)}
                    aria-pressed={active}
                    disabled={!risk[c]}
                    className="border px-2.5 py-1 text-[16px] tracking-wider uppercase transition-colors disabled:opacity-35"
                    style={{
                      ...DISPLAY,
                      borderColor: active ? ORANGE : `${INK}33`,
                      backgroundColor: active ? ORANGE : "transparent",
                      color: active ? "#13110F" : `${INK}b3`,
                    }}
                  >
                    {CITY[c]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Map */}
          <div className="relative mt-5">
            {countryRisk ? (
              <RiskHeatMap
                districts={countryRisk.districts}
                detections={detections?.country === country ? detections.detections : []}
                selected={place.district}
                onSelect={(d) => selectDistrict({ country: d.country, district: d.district })}
                onCitySelect={selectCity}
                focus={focus}
                height={MAP_HEIGHT}
              />
            ) : (
              <div className="flex w-full items-center justify-center border border-[#ECE6DA]/20 text-sm opacity-60" style={{ ...MONO, height: MAP_HEIGHT }}>
                Loading map…
              </div>
            )}
            {(countryRisk?.is_simulated || cityNote) && (
              <div className="pointer-events-none absolute top-3 right-3 z-[500] flex flex-col items-end gap-1.5">
                {countryRisk?.is_simulated && (
                  <span className="border border-[#ECE6DA]/30 bg-[#13110F]/80 px-1.5 py-0.5 text-[10px] tracking-[0.14em] uppercase" style={MONO}>
                    Simulated data
                  </span>
                )}
                {cityNote && (
                  <span className="bg-[#13110F]/85 px-2 py-1 text-[12px]" style={MONO} role="status">
                    {cityNote}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Ranked districts */}
          <div className="mt-5 border-t border-[#ECE6DA]/20 pt-4">
            <span className="text-[11px] tracking-[0.18em] uppercase opacity-55" style={MONO}>
              Districts by risk · {CITY[country]}
            </span>
            <ol className="mt-3 grid gap-x-6 sm:grid-cols-2">
              {districts.map((d) => {
                const active = d.district === place.district;
                return (
                  <li key={d.district}>
                    <button
                      onClick={() => selectDistrict({ country, district: d.district })}
                      aria-current={active ? "true" : undefined}
                      className="flex w-full items-center gap-3 border-b border-[#ECE6DA]/15 py-2 text-left hover:opacity-100"
                      style={{ opacity: active ? 1 : 0.8 }}
                    >
                      <span className="w-7 flex-none text-[22px] leading-none" style={{ ...DISPLAY, color: active ? ORANGE : `${INK}80` }}>
                        {String(d.rank).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[17px]" style={{ ...COND, color: active ? ORANGE : INK }}>
                        {d.district}
                      </span>
                      <span className="hidden h-1 w-14 flex-none bg-[#ECE6DA]/15 sm:block" aria-hidden="true">
                        <span className="block h-full" style={{ width: `${d.risk_score}%`, backgroundColor: d.risk_score >= 70 ? RED : ORANGE }} />
                      </span>
                      <span className="flex-none text-right text-[12px] whitespace-nowrap tabular-nums opacity-75" style={MONO}>
                        {d.risk_score}/100 · {d.detections_7d}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {districts.length > 0 && (
              <p className="mt-2 text-[11px] tracking-[0.12em] uppercase opacity-50" style={MONO}>
                Risk score / 100 · buzzes in the last 7 days
              </p>
            )}
          </div>
        </section>

        {/* ---------- Prevention card ---------- */}
        <PreventionCard
          data={shownPlan}
          language={language}
          onLanguage={setLanguage}
          canSpeak={canSpeak}
          autoSpeak={autoSpeak}
          onAutoSpeak={setAutoSpeak}
          onSpeak={speak}
          contextPrefix={place.district}
          loadingContext="Checking the district's numbers…"
          loadingFooter="Preparing a plan for this district."
        />
      </div>

      {/* ---------- Forecast row ---------- */}
      <section aria-label="Forecast" className="border border-[#ECE6DA]/20 px-4 pt-4 pb-5 sm:px-7 sm:pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[#ECE6DA]/20 pb-4">
          <h2 className="text-[26px] leading-none tracking-wide uppercase sm:text-[32px]" style={DISPLAY}>
            <span style={{ color: ORANGE }}>{place.district || "—"}</span>
            {shownForecast ? ` · ${DISEASE_LABEL[shownForecast.disease]} ${unit}, next 4 weeks` : " · forecast"}
          </h2>
          {shownForecast?.is_simulated && (
            <span className="text-[10px] tracking-[0.14em] uppercase opacity-60" style={MONO}>
              Prototype · simulated history
            </span>
          )}
        </div>
        {shownForecast ? (
          <div className={`mx-auto max-w-3xl pt-4 transition-opacity ${forecastStale ? "opacity-40" : ""}`}>
            <ForecastChart forecast={shownForecast} />
          </div>
        ) : (
          <p className="pt-4 text-sm opacity-60" style={MONO}>
            Loading forecast…
          </p>
        )}
      </section>
    </div>
  );
}
