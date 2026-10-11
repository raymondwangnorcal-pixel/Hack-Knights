"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type RefObject } from "react";
import RiskHeatMap from "@/components/RiskHeatMap";
import { SLIDE_MS, SlideStage } from "@/components/SlideStage";
import { InfoTip } from "@/components/InfoTip";
import { RISK_SCORE_BODY, RISK_SCORE_CITY_NOTE, RISK_SCORE_TITLE } from "@/lib/riskHelp";
import { ORANGE_DOTS, paletteGradient } from "@/lib/dotColors";
import { CITIES, CITY_ZOOM, DISTRICT_ZOOM, type City, type MapFocus, type MapView } from "@/lib/cities";
import { loadUsTestDots } from "@/lib/usTestDots";
import type {
  Country,
  Detection,
  DetectionsResponse,
  DistrictRisk,
  RiskResponse,
} from "@/lib/types";

// Same look as the home page intro.
const BG = "#13110F";
const INK = "#ECE6DA";
const ORANGE = "#F07636";
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const COUNTRIES: Country[] = ["NG", "BR", "US"];
// The USA map shows simulated West Nile detections generated from the CDC's county map plus heat, water and population
// (scripts/build_us_test_dots.py) instead of the database's US detections.
type MapKey = Country;
const MAPS: MapKey[] = ["NG", "BR", "US"];
const baseOf = (k: MapKey): Country => k;
const MAP_LABEL: Record<MapKey, string> = { NG: "Nigeria", BR: "Brazil", US: "USA" };
const TYPE = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };

// The home page's "View in full screen": the /dashboard map experience (country slides, city and district
// labels, forecast pill, zoom buttons, legend), as an overlay that grows out of the home page's map box.
// It is a port of app/dashboard/page.tsx, which is kept as it was.

// How many days of detections are drawn as dots (7 matches the main app; the numbers in the panel are 7-day figures).
const DOT_DAYS = 7;
const OPEN_MS = 900;
const CLOSE_MS = 700;
const GROW = "cubic-bezier(0.45, 0, 0.12, 1)"; // eases in, then a long soft landing

export interface FullscreenResult {
  country: Country;
  district: string | null;
}

interface FullscreenMapProps {
  open: boolean;
  /** The home page's current country and (if the viewer picked one) district; carried in. */
  startCountry: Country;
  startDistrict: string | null;
  /** The home page's map box: the overlay grows out of it and shrinks back into it. */
  originRef: RefObject<HTMLElement | null>;
  /** Camera of the home page's map: read on open, written on close, so the view carries both ways. */
  homeView: MutableRefObject<MapView | null>;
  onClose: (result: FullscreenResult) => void;
}

// Where the overlay's visible window sits when it is the size of the origin box. The overlay is always
// laid out at full-window size; it is shifted so its centre is on the box's centre and clipped to the box,
// then both are eased away. Nothing is resized during the animation, so the maps never re-layout.
function boxWindow(box: DOMRect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dx = box.left + box.width / 2 - vw / 2;
  const dy = box.top + box.height / 2 - vh / 2;
  return {
    transform: `translate3d(${dx}px, ${dy}px, 0)`,
    clipPath: `inset(${box.top - dy}px ${vw - (box.right - dx)}px ${vh - (box.bottom - dy)}px ${box.left - dx}px)`,
  };
}
const FULL_WINDOW = { transform: "translate3d(0px, 0px, 0)", clipPath: "inset(0px 0px 0px 0px)" };

export default function FullscreenMap({ open, startCountry, startDistrict, originRef, homeView, onClose }: FullscreenMapProps) {
  const [country, setCountry] = useState<MapKey>(startCountry);
  const base = baseOf(country); // the country whose data this map shows
  const [slideDir, setSlideDir] = useState<1 | -1>(1);
  const sliding = useRef(false);
  const resetCount = useRef(0);
  const [panelOpen, setPanelOpen] = useState(false);
  // Maps stay mounted while off-screen, so a map left zoomed on a city is sent back to the whole-country
  // view (after the slide, where nobody sees it) for when you return.
  const [resets, setResets] = useState<Partial<Record<MapKey, number>>>({});
  // All three countries are fetched up front, so switching never waits on the network mid-slide.
  const [data, setData] = useState<Partial<Record<Country, { risk: RiskResponse; detections: DetectionsResponse }>>>({});
  const [picked, setPicked] = useState<DistrictRisk | null>(null);
  const [activeCity, setActiveCity] = useState<City | null>(null);
  const [pickedCity, setPickedCity] = useState<City | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  // Keyed by district so stale results never show for a newly selected district.
  const [planFor, setPlanFor] = useState<{ district: string; text: string } | null>(null);
  const [usDots, setUsDots] = useState<Detection[]>([]);
  const risk = data[base]?.risk ?? null;
  // Clicking a city that has data selects the whole city (Lagos, São Paulo, New York) as one summed-up area;
  // clicking a district inside it selects just that district. Nothing is selected until the first click.
  const cityRisk = useMemo(() => {
    if (!risk) return null;
    const ds = risk.districts;
    if (!ds.length) return null;
    const name = CITIES[risk.country].find((c) => c.hasData)?.name ?? ds[0].district;
    const detections = ds.reduce((s, d) => s + d.detections_7d, 0);
    const weighted = (f: (d: DistrictRisk) => number) => ds.reduce((s, d) => s + f(d) * d.detections_7d, 0) / (detections || 1);
    const city: DistrictRisk = {
      district: name,
      country: risk.country,
      lat: ds.reduce((s, d) => s + d.lat, 0) / ds.length,
      lng: ds.reduce((s, d) => s + d.lng, 0) / ds.length,
      risk_score: Math.round(weighted((d) => d.risk_score)),
      rank: 0,
      detections_7d: detections,
      cases_14d: ds.reduce((s, d) => s + d.cases_14d, 0),
      weather_factor: weighted((d) => d.weather_factor),
      main_disease: ds[0].main_disease,
    };
    return city;
  }, [risk]);
  const cityHere = pickedCity && CITIES[base].some((c) => c.name === pickedCity.name) ? pickedCity : null;
  const selected = picked?.country === base ? picked : cityHere?.hasData ? cityRisk : null;
  const isCity = !!selected && selected === cityRisk;
  // A city on the map with no data behind it yet.
  const noDataCity = !picked || picked.country !== base ? (cityHere && !cityHere.hasData ? cityHere : null) : null;

  useEffect(() => {
    let alive = true;
    loadUsTestDots(DOT_DAYS).then(
      (d) => alive && setUsDots(d),
      (err) => console.error("[fullscreen map] could not load the simulated USA dots", err),
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    COUNTRIES.forEach((c) => {
      fetch(`/api/risk?country=${c}`)
        .then((r) => r.json())
        .then(async (r: RiskResponse) => {
          const since = new Date(Date.parse(r.updated_at) - DOT_DAYS * 864e5).toISOString();
          const detections: DetectionsResponse = await fetch(
            `/api/detections?country=${c}&since=${encodeURIComponent(since)}`,
          ).then((d) => d.json());
          setData((prev) => ({ ...prev, [c]: { risk: r, detections } }));
        })
        .catch((err) => console.error(`[fullscreen map] could not load ${c}`, err));
    });
  }, []);

  // Live: each new detection from the phone pipeline (Postgres NOTIFY -> /stream) refetches the
  // dots, debounced so a burst of uploads costs one request.
  useEffect(() => {
    if (!open) return; // only listen while the map is actually on screen
    const es = new EventSource(`/api/stream?country=${base}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    es.addEventListener("detection", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const since = new Date(Date.now() - DOT_DAYS * 864e5).toISOString();
        fetch(`/api/detections?country=${base}&since=${encodeURIComponent(since)}`)
          .then((r) => r.json())
          .then((d: DetectionsResponse) => {
            if (d.country === base) setData((prev) => (prev[base] ? { ...prev, [base]: { ...prev[base], detections: d } } : prev));
          });
      }, 1500);
    });
    return () => {
      clearTimeout(timer);
      es.close();
    };
  }, [base, open]);

  useEffect(() => {
    if (!selected) return;
    const district = selected.district;
    fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "district_plan", district, country: selected.country }),
    })
      .then((r) => r.json())
      .then((d) => setPlanFor({ district, text: d.text ?? "" }));
  }, [selected]);

  // Keep the previous plan on screen (dimmed) while the new one loads, so the panel doesn't jump.
  const planStale = !!planFor && planFor.district !== selected?.district;

  const countryName = MAP_LABEL[country];
  const disease = base === "NG" ? "malaria" : base === "BR" ? "dengue" : "west_nile";

  const selectCity = (c: City) => {
    setActiveCity(c);
    setPickedCity(c);
    setPicked(null);
    setPanelOpen(true);
    setFocus({ key: Date.now(), lat: c.lat, lng: c.lng, zoom: c.zoom ?? CITY_ZOOM });
  };
  const backToCities = () => {
    setActiveCity(null);
    setPickedCity(null);
    setPicked(null);
    setFocus({ key: Date.now(), reset: true });
  };
  const selectDistrict = (d: DistrictRisk) => {
    setPicked(d);
    setPickedCity(null);
    setPanelOpen(true);
    setFocus({ key: Date.now(), lat: d.lat, lng: d.lng, zoom: DISTRICT_ZOOM });
  };
  const changeCountry = (c: MapKey, dir?: 1 | -1) => {
    if (sliding.current) return;
    if (c === country) {
      // The current country's button doubles as "zoom all the way out": back to the whole-country view.
      setActiveCity(null);
      setPickedCity(null);
      setPicked(null);
      setFocus({ key: -(resetCount.current += 1), reset: true });
      return;
    }
    if (!data[baseOf(c)]) return;
    sliding.current = true;
    setTimeout(() => (sliding.current = false), SLIDE_MS + 100);
    setSlideDir(dir ?? (MAPS.indexOf(c) > MAPS.indexOf(country) ? 1 : -1));
    const leaving = country;
    setTimeout(() => setResets((r) => ({ ...r, [leaving]: Date.now() })), SLIDE_MS + 200);
    setCountry(c);
    setActiveCity(null);
    setFocus(null);
  };
  // Arrows wrap around: past the last country comes the first.
  const step = (dir: 1 | -1) => changeCountry(MAPS[(MAPS.indexOf(country) + dir + MAPS.length) % MAPS.length], dir);

  // One map camera handle per country, so the home page's view can be carried into (and back out of) this one.
  const viewNG = useRef<MapView | null>(null);
  const viewBR = useRef<MapView | null>(null);
  const viewUS = useRef<MapView | null>(null);
  const viewRefs: Record<MapKey, MutableRefObject<MapView | null>> = { NG: viewNG, BR: viewBR, US: viewUS };

  // While closed, follow the home page's country and pick, so opening never has to switch maps.
  // (Adjusted during render, keyed on what it follows, rather than in an effect.)
  const followKey = `${startCountry}|${startDistrict ?? ""}|${data[startCountry] ? 1 : 0}`;
  const [followed, setFollowed] = useState<string | null>(null);
  if (open) {
    if (followed !== null) setFollowed(null); // so the next close re-syncs, even if nothing on the home page changed
  } else if (followed !== followKey) {
    setFollowed(followKey);
    if (country !== startCountry) {
      setSlideDir(MAPS.indexOf(startCountry) > MAPS.indexOf(country) ? 1 : -1);
      setCountry(startCountry);
    }
    setPicked(startDistrict ? (data[startCountry]?.risk.districts.find((x) => x.district === startDistrict) ?? null) : null);
    setPickedCity(null);
    setActiveCity(null);
    setPanelOpen(false);
    setFocus(null);
  }

  const rootRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // The test map is not a place the home page can show, so closing from it leaves the home page as it was.
  const requestClose = () =>
    onClose({ country: base, district: picked?.country === base ? picked.district : null });
  const latestClose = useRef(requestClose);
  useEffect(() => {
    latestClose.current = requestClose;
  });

  // Open: the overlay is shifted onto the home map box and clipped to it, then eased out to the whole window;
  // the controls fade in as it lands. Close: the reverse.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const chrome = chromeRef.current;
    if (!root || !chrome) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const later = (fn: () => void, ms: number) => {
      timers.current.push(setTimeout(fn, ms));
    };
    const ease = (ms: number) => {
      root.style.transition = `transform ${ms}ms ${GROW}, clip-path ${ms}ms ${GROW}`;
    };
    const lockScroll = () => {
      const gutter = window.innerWidth - document.documentElement.clientWidth;
      document.documentElement.style.overflow = "hidden";
      if (gutter > 0) document.body.style.paddingRight = `${gutter}px`; // keep the page from shifting sideways
    };
    const unlockScroll = () => {
      document.documentElement.style.overflow = "";
      document.body.style.paddingRight = "";
    };
    // Once the map covers the window, the page behind it is hidden (not removed, so scroll position and layout
    // stay put). Otherwise the browser keeps painting it under the map on every frame.
    const hideBehind = () => {
      for (const el of Array.from(document.body.children) as HTMLElement[]) {
        if (el === root || el.tagName === "SCRIPT" || el.tagName.toLowerCase() === "nextjs-portal") continue;
        el.dataset.mapHidden = el.style.visibility || "-";
        el.style.visibility = "hidden";
      }
    };
    const showBehind = () => {
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>(":scope > [data-map-hidden]"))) {
        el.style.visibility = el.dataset.mapHidden === "-" ? "" : (el.dataset.mapHidden ?? "");
        delete el.dataset.mapHidden;
      }
    };

    if (open && !wasOpen.current) {
      wasOpen.current = true;
      const view = homeView.current?.get();
      if (view) viewRefs[country].current?.set(view.lat, view.lng, view.zoom); // keep the current view
      const box = originRef.current?.getBoundingClientRect();
      lockScroll();
      root.style.transition = "none";
      root.style.visibility = "visible";
      root.style.pointerEvents = "none";
      const from = box ? boxWindow(box) : FULL_WINDOW;
      root.style.transform = from.transform;
      root.style.clipPath = from.clipPath;
      chrome.style.transition = "none";
      chrome.style.opacity = "0";
      root.getBoundingClientRect(); // commit the start frame before easing away from it
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          ease(OPEN_MS);
          root.style.transform = FULL_WINDOW.transform;
          root.style.clipPath = FULL_WINDOW.clipPath;
        }),
      );
      later(() => {
        root.style.pointerEvents = "auto";
        chrome.style.transition = "opacity 260ms ease";
        chrome.style.opacity = "1";
      }, OPEN_MS - 140);
      later(hideBehind, OPEN_MS + 60);
    } else if (!open && wasOpen.current) {
      wasOpen.current = false;
      showBehind();
      root.style.pointerEvents = "none";
      chrome.style.transition = "opacity 140ms ease";
      chrome.style.opacity = "0";
      const view = viewRefs[country].current?.get();
      if (view && country === startCountry) homeView.current?.set(view.lat, view.lng, view.zoom);
      later(() => {
        const box = originRef.current?.getBoundingClientRect();
        const to = box ? boxWindow(box) : FULL_WINDOW;
        ease(CLOSE_MS);
        root.style.transform = to.transform;
        root.style.clipPath = to.clipPath;
      }, 120);
      later(() => {
        root.style.visibility = "hidden";
        unlockScroll();
      }, 120 + CLOSE_MS + 40);
    }
    // Runs on open/close only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(
    () => () => {
      document.documentElement.style.overflow = "";
      document.body.style.paddingRight = "";
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>(":scope > [data-map-hidden]"))) {
        el.style.visibility = el.dataset.mapHidden === "-" ? "" : (el.dataset.mapHidden ?? "");
        delete el.dataset.mapHidden;
      }
    },
    [],
  );

  // Esc exits, unless it is closing a dot's card (that one is the map's to handle).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const card = [...document.querySelectorAll<HTMLElement>(".risk-map .dot-tip")].some((el) => {
        const r = el.getBoundingClientRect();
        return el.style.display !== "none" && r.width > 0 && r.right > 0 && r.left < window.innerWidth;
      });
      // An open information box handles its own Esc; a dot's card likewise.
      const infoOpen = !!document.querySelector("[data-infotip-open]");
      if (!card && !infoOpen) latestClose.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    <div
      ref={rootRef}
      data-lenis-prevent
      role="dialog"
      aria-label="Full-screen risk map"
      aria-hidden={!open}
      className="fixed inset-0 z-[3000] overflow-hidden"
      style={
        {
          visibility: "hidden",
          willChange: "transform, clip-path",
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
        keys={MAPS}
        current={country}
        dir={slideDir}
        render={(c) => {
          const d = data[baseOf(c)];
          if (!d) return null;
          return (
            <RiskHeatMap
              districts={d.risk.districts}
              detections={c === "US" ? usDots : d.detections.country === c ? d.detections.detections : []}
              selected={c === country ? selected?.district : undefined}
              onSelect={selectDistrict}
              onCitySelect={selectCity}
              onSwipe={step}
              viewRef={viewRefs[c]}
              dotPalette={ORANGE_DOTS}
              cityMarker="diamond"
              focus={c === country ? focus : resets[c] ? { key: resets[c]!, reset: true } : null}
            />
          );
        }}
      />

      {/* Controls sit in their own layer so they can fade in once the map has grown to full size. */}
      <div ref={chromeRef} className="pointer-events-none absolute inset-0 z-[1000]" style={{ opacity: 0 }}>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex flex-wrap items-start justify-between gap-4 px-5 pt-4">
        <div style={{ textShadow: "0 0 6px #000, 0 0 14px #000" }}>
          <button
            onClick={requestClose}
            className="pointer-events-auto text-xs uppercase tracking-widest opacity-70 hover:opacity-100"
            style={TYPE}
          >
            ✕ Exit full screen
          </button>
          <h1 className="mt-1 text-5xl leading-none tracking-wide uppercase" style={DISPLAY}>
            <span style={{ color: ORANGE }}>{countryName}</span> · {disease.replace("_", " ")} risk
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
          {MAPS.map((c) => {
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
                {MAP_LABEL[c]}
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
          className={`pointer-events-auto absolute top-1/2 z-[1000] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border transition-colors hover:bg-white/10 ${side === "left" ? "left-4" : "right-4"}`}
          style={{ borderColor: `${INK}40`, backgroundColor: "rgba(19,17,15,0.6)", color: INK }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
            <path d={side === "left" ? "M11 3 5 9l6 6" : "M7 3l6 6-6 6"} />
          </svg>
        </button>
      ))}

      {/* Bottom left: asks for a click until a location (city or district) is picked; then a pill that
          opens into its recommended actions. */}
      <div className="pointer-events-none absolute bottom-8 left-4 z-[1000] flex max-w-[calc(100vw-2rem)] flex-col items-center gap-2 sm:left-20">
        {!selected ? (
          <p
            className="pointer-events-auto inline-block rounded-sm border px-4 py-2 text-xs uppercase tracking-widest backdrop-blur-md"
            style={{ ...TYPE, borderColor: `${INK}40`, backgroundColor: "rgba(19,17,15,0.8)", color: `${INK}cc` }}
          >
            {noDataCity ? (
              <>
                <span style={{ color: ORANGE }}>{noDataCity.name}</span> has no data yet
              </>
            ) : (
              "Click on a location to see its recommended actions"
            )}
          </p>
        ) : (
          <>
          {panelOpen ? (
            <section
              className="pointer-events-auto flex max-h-[calc(100svh-9.5rem)] w-[360px] max-w-[calc(100vw-2rem)] flex-col rounded-sm border p-4 backdrop-blur-md"
              style={{ borderColor: `${INK}33`, backgroundColor: "rgba(19,17,15,0.88)" }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl leading-none tracking-wide uppercase" style={DISPLAY}>
                    <span style={{ color: ORANGE }}>{selected.district}</span>
                  </h2>
                  <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm" style={{ ...TYPE, color: `${INK}cc` }}>
                    <span>{isCity ? "Citywide risk score" : "Risk score"}</span>
                    <InfoTip
                      title={RISK_SCORE_TITLE}
                      body={RISK_SCORE_BODY + (isCity ? RISK_SCORE_CITY_NOTE : "")}
                      side="top"
                      width={320}
                      className="font-bold"
                      style={{ color: INK }}
                    >
                      {selected.risk_score} out of 100
                    </InfoTip>
                  </p>
                  <p className="mt-1 text-sm" style={{ ...TYPE, color: `${INK}cc` }}>
                    <strong style={{ color: INK }}>{selected.detections_7d}</strong> mosquito detections in the last seven days
                  </p>
                </div>
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
              <div className="mt-3 min-h-0 flex-1 overflow-y-auto" data-lenis-prevent>
                <h3 className="text-lg tracking-wide uppercase" style={DISPLAY}>
                  Recommended actions
                </h3>
                <p
                  className={`mt-3 whitespace-pre-line text-sm leading-relaxed transition-opacity ${planStale ? "opacity-40" : ""}`}
                  style={TYPE}
                >
                  {planFor?.text || "Generating…"}
                </p>
              </div>
            </section>
          ) : (
            <button
              onClick={() => setPanelOpen(true)}
              className="pointer-events-auto flex items-center gap-3 rounded-sm border px-4 py-2 text-left backdrop-blur-md transition-colors hover:bg-white/10"
              style={{ borderColor: `${INK}40`, backgroundColor: "rgba(19,17,15,0.8)" }}
            >
              <span className="text-lg tracking-wide uppercase" style={{ ...DISPLAY, color: ORANGE }}>
                {selected.district}
              </span>
              <span className="text-xs uppercase tracking-widest" style={{ ...TYPE, color: `${INK}b3` }}>
                recommended actions ↑
              </span>
            </button>
          )}
          </>
        )}
        <p
          className="pointer-events-none text-center text-[11px] uppercase tracking-widest opacity-80"
          style={{ ...TYPE, textShadow: "0 0 4px #000, 0 0 8px #000" }}
        >
          {country === "US"
            ? `1 dot = 1 West Nile detection, last ${DOT_DAYS} days`
            : `1 dot = 1 mosquito detection, last ${DOT_DAYS} days`}
        </p>
      </div>

      {/* Zoom buttons are page controls (not part of a map), so they stay put while maps slide. They send the
          same eased wheel zoom a mouse wheel does to the map in the middle of the screen. */}
      <div className="pointer-events-auto absolute bottom-6 right-4 z-[1000] flex flex-col overflow-hidden rounded-sm border" style={{ borderColor: `${INK}40`, backgroundColor: "rgba(19,17,15,0.75)" }}>
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

      {/* Bottom right: the colour key, clear of the zoom buttons. (What a dot is sits under the bottom-left menu.) */}
      <div
        className="pointer-events-none absolute inset-x-4 bottom-8 z-[1000] flex items-end justify-end gap-6 text-[11px] uppercase tracking-widest opacity-80"
        style={{ ...TYPE, textShadow: "0 0 4px #000, 0 0 8px #000" }}
      >
        <div className="mr-12 flex flex-col items-end gap-1">
          <span className="flex items-center gap-2">
            Center
            <span className="inline-block h-2 w-24 rounded-sm" style={{ background: paletteGradient(ORANGE_DOTS) }} />
            Outskirts
          </span>
          <span>More dots = higher risk</span>
        </div>
      </div>
      {/* Map credits (Leaflet's own box, restyled): plain light text, no background, stays put during slides. */}
      <p
        className="pointer-events-auto absolute bottom-2 right-[60px] z-[1000] text-[10px] tracking-wide"
        style={{ ...TYPE, color: INK, textShadow: "0 0 4px #000, 0 0 8px #000" }}
      >
        <a href="https://leafletjs.com" target="_blank" rel="noreferrer" className="hover:underline">Leaflet</a>
        {" | Tiles © Esri — Esri, HERE, Garmin, OpenStreetMap contributors · Relief © Esri"}
      </p>
      </div>
    </div>
  );
}
