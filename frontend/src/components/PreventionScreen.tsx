"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import RiskHeatMap from "@/components/RiskHeatMap";
import FullscreenMap, { type FullscreenResult } from "@/components/FullscreenMap";
import { PreventionCard } from "@/components/PreventionCard";
import { InfoTip } from "@/components/InfoTip";
import { ORANGE_DOTS } from "@/lib/dotColors";
import { DETECTIONS_BODY, DETECTIONS_TITLE, RISK_SCORE_BODY, RISK_SCORE_TITLE } from "@/lib/riskHelp";
import { CITY_ZOOM, DISTRICT_ZOOM, type City, type MapFocus, type MapView } from "@/lib/cities";
import { readAutoSpeak, setAutoSpeak, speak as speakLine, subscribeAutoSpeak, unlockAudio } from "@/lib/voice";
import { pickSpoken } from "@/lib/spoken";
import type {
  Country,
  DetectionsResponse,
  DistrictRisk,
  Language,
  PreventionResponse,
  RiskResponse,
  VoiceLanguagesResponse,
} from "@/lib/types";

// The "For prevention" screen under the intro, for health departments and prevention groups.
// Mirrors the For you screen: left, the live risk map (detections as dots) with the district
// picker and a ranked district list in place of the listening card; right, the same Prevention
// card with three health-team actions for the selected district, chosen by Gemini when
// configured. This replaces the old /dashboard page.

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
// How many days of detections are drawn as dots (7 matches the main app).
const DOT_DAYS = 14;

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
  const [language, setLanguage] = useState<Language>("en");
  const [voiced, setVoiced] = useState<Language[]>([]);
  // Keyed by place and language so a stale plan never shows after a switch.
  const [plan, setPlan] = useState<{ key: string; data: PreventionResponse } | null>(null);
  const [planRefresh, setPlanRefresh] = useState(0);
  const autoSpeak = useSyncExternalStore(subscribeAutoSpeak, readAutoSpeak, () => true);
  const picked = useRef(false); // the viewer has chosen a district, so a plan may be read aloud
  const spokenFor = useRef<string | null>(null);
  const focusKey = useRef(0); // each map move request gets a new key, so FlyToFocus fires once
  // Full screen: the overlay grows out of the map box, and the two maps hand their camera to each other.
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const homeView = useRef<MapView | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenReady, setFullscreenReady] = useState(false); // mounted early (hidden) so opening is instant

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

  // Recent detections for the map; refetched whenever the district ranking refreshes.
  useEffect(() => {
    const updated = updatedAt;
    if (!updated) return;
    const controller = new AbortController();
    const since = new Date(Date.parse(updated) - DOT_DAYS * 864e5).toISOString();
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
  // Titles in the chosen language are read in its voice; untranslated ones in the English voice.
  const spoken = useMemo(() => (shownPlan ? pickSpoken(shownPlan, language) : null), [shownPlan, language]);
  const voice = spoken?.voice ?? language;
  const spokenTitles = useMemo(() => spoken?.titles ?? [], [spoken]);
  const canSpeak = voiced.includes(voice);
  const sep = voice === "zh" || voice === "yue" ? "。" : ". ";
  const spokenText = (titles: string[]) => `${place.district}${sep}${titles.map((t) => t.replace(/[.。!！]+$/, "")).join(sep)}`;

  // Read a plan aloud once per district and language, only after the viewer picked a district.
  useEffect(() => {
    if (!picked.current || !autoSpeak || !canSpeak || !shownPlan || !spokenTitles.length) return;
    const id = `${place.country}:${place.district}:${language}`;
    if (spokenFor.current === id) return;
    spokenFor.current = id;
    speakLine(`${place.district}${sep}${spokenTitles.map((t) => t.replace(/[.。!！]+$/, "")).join(sep)}`, voice);
  }, [autoSpeak, canSpeak, shownPlan, spokenTitles, place.country, place.district, language, voice, sep]);

  function speak() {
    if (!shownPlan || !spokenTitles.length) return;
    unlockAudio();
    speakLine(spokenText(spokenTitles), voice);
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

  // Build the hidden full-screen map shortly after load (or as soon as the button is approached), so the
  // maps, data and relief tiles are ready by the time it is opened.
  useEffect(() => {
    const t = setTimeout(() => setFullscreenReady(true), 2500);
    return () => clearTimeout(t);
  }, []);

  // Leaving full screen: the home page takes over the country and district picked there.
  function exitFullscreen(r: FullscreenResult) {
    setFullscreen(false);
    if (r.district) {
      if (r.country !== place.country || r.district !== place.district) selectDistrict({ country: r.country, district: r.district }, false);
    } else if (r.country !== country) {
      selectCountry(r.country);
    }
  }

  function selectCity(c: City) {
    setFocus({ key: ++focusKey.current, lat: c.lat, lng: c.lng, zoom: CITY_ZOOM });
    setCityNote(c.hasData ? null : `No detection data for ${c.name} yet.`);
  }

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
          {/* isolate: keeps the map's own layers (z-index up to 1000) below the sticky page header. */}
          <div ref={mapBoxRef} className="relative isolate mt-5">
            {countryRisk ? (
              <RiskHeatMap
                districts={countryRisk.districts}
                detections={detections?.country === country ? detections.detections : []}
                selected={place.district}
                onSelect={(d) => selectDistrict({ country: d.country, district: d.district })}
                onCitySelect={selectCity}
                focus={focus}
                viewRef={homeView}
                dotPalette={ORANGE_DOTS}
                cityMarker="diamond"
                height={MAP_HEIGHT}
              />
            ) : (
              <div className="flex w-full items-center justify-center border border-[#ECE6DA]/20 text-sm opacity-60" style={{ ...MONO, height: MAP_HEIGHT }}>
                Loading map…
              </div>
            )}
            {(countryRisk || cityNote) && (
              <div className="pointer-events-none absolute top-3 right-3 z-[500] flex flex-col items-end gap-1.5">
                {countryRisk && (
                  <button
                    type="button"
                    onClick={() => {
                      setFullscreenReady(true);
                      setFullscreen(true);
                    }}
                    onPointerEnter={() => setFullscreenReady(true)}
                    onFocus={() => setFullscreenReady(true)}
                    className="pointer-events-auto flex items-center gap-2 border border-[#ECE6DA]/40 bg-[#13110F]/85 px-3 py-1.5 text-[11px] tracking-[0.14em] uppercase backdrop-blur-sm transition-colors hover:bg-[#13110F]"
                    style={MONO}
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
                      <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
                    </svg>
                    View in full screen
                  </button>
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
            {districts.length > 0 && (
              <div className="mt-3 grid gap-x-6 sm:grid-cols-2" role="presentation">
                {[0, 1].map((col) => (
                  <div
                    key={col}
                    className={`items-end gap-3 border-b border-[#ECE6DA]/30 pb-1.5 ${col === 1 ? "hidden sm:flex" : "flex"}`}
                    style={MONO}
                  >
                    <span className="w-7 flex-none" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-[10px] tracking-[0.14em] uppercase opacity-60">District</span>
                    <span className="hidden w-14 flex-none sm:block" aria-hidden="true" />
                    <span className="flex w-[76px] flex-none justify-end whitespace-nowrap">
                      <InfoTip title={RISK_SCORE_TITLE} body={RISK_SCORE_BODY} align="right" width={300} className="text-right" underline={false} style={{ color: INK }}>
                        <span className="flex flex-col items-end leading-tight">
                          <span className="text-[10px] tracking-[0.14em] uppercase" style={{ textDecoration: "underline dotted", textUnderlineOffset: 2, textDecorationColor: `${INK}80` }}>Risk</span>
                          <span className="mt-[4px] text-[9px] opacity-60">out of 100</span>
                        </span>
                      </InfoTip>
                    </span>
                    <span className="flex w-[96px] flex-none justify-end whitespace-nowrap">
                      <InfoTip title={DETECTIONS_TITLE} body={DETECTIONS_BODY} align="right" width={300} className="text-right" underline={false} style={{ color: INK }}>
                        <span className="flex flex-col items-end leading-tight">
                          <span className="text-[10px] tracking-[0.14em] uppercase" style={{ textDecoration: "underline dotted", textUnderlineOffset: 2, textDecorationColor: `${INK}80` }}>Detections</span>
                          <span className="mt-[4px] text-[9px] opacity-60">last 7 days</span>
                        </span>
                      </InfoTip>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <ol className="grid gap-x-6 sm:grid-cols-2">
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
                      <span className="w-[76px] flex-none text-right text-[13px] tabular-nums" style={MONO}>
                        {d.risk_score}
                      </span>
                      <span className="w-[96px] flex-none text-right text-[13px] tabular-nums opacity-80" style={MONO}>
                        {d.detections_7d}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
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

      {fullscreenReady &&
        createPortal(
          <FullscreenMap
            open={fullscreen}
            startCountry={country}
            startDistrict={chosen?.district ?? null}
            originRef={mapBoxRef}
            homeView={homeView}
            onClose={exitFullscreen}
          />,
          document.body,
        )}
    </div>
  );
}
