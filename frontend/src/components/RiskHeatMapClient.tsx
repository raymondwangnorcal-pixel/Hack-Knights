import { useEffect, useRef, type MutableRefObject } from "react";
import { Circle, MapContainer, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import countryShapes from "@/lib/countryShapes.json";
import { CITIES, type City, type MapFocus, type MapView } from "@/lib/cities";
import type { Country, Detection, DistrictRisk } from "@/lib/types";
import { RED_DOTS, type DotPalette } from "@/lib/dotColors";
import { DISEASE_LABEL, GENUS_INFO } from "@/lib/species";
import "leaflet/dist/leaflet.css";

interface RiskHeatMapClientProps {
  districts: DistrictRisk[];
  detections: Detection[];
  selected?: string;
  onSelect: (d: DistrictRisk) => void;
  onCitySelect: (c: City) => void;
  onSwipe?: (dir: 1 | -1) => void;
  focus?: MapFocus | null;
  viewRef?: MutableRefObject<MapView | null>;
  /** Colors of the detection dots (default: red). */
  dotPalette?: DotPalette;
  /** Shape of the city markers: the default dot, or a diamond that can't be mistaken for a data dot. */
  cityMarker?: "dot" | "diamond";
  height?: number | string;
}

// Leaflet internals used to move the view without its built-in 250ms zoom animation.
type MapInternals = L.Map & {
  _move(center: L.LatLng, zoom: number): void;
  _moveStart(zoomChanged: boolean, noMoveStart: boolean): void;
  _moveEnd(zoomChanged: boolean): void;
  _stop(): void;
  _limitCenter(center: L.LatLng, zoom: number, bounds: L.LatLngBounds | null): L.LatLng;
};

const ZOOM_PER_WHEEL_PX = 1 / 150; // a mouse-wheel notch (~100 px) is about two thirds of a zoom level
const ZOOM_PER_TRACKPAD_PX = 1 / 70; // pinch and two-finger scroll send many small deltas, so each counts for more
const ZOOM_TAU_MS = 75; // time constant of the zoom easing; time-based so it feels the same at any frame rate
const SHOW_DISTRICT_CIRCLES = false;
const TOP_CLEARANCE = 70; // px kept free at the top for the title floating over the map

function riskColor(riskScore: number): string {
  return `hsl(${Math.max(0, 40 - riskScore * 0.4)} 90% 50%)`;
}

function riskLabel(riskScore: number): string {
  return riskScore >= 70 ? "high" : riskScore >= 40 ? "moderate" : "low";
}

function radiusMeters(d: DistrictRisk): number {
  return 1500 + d.detections_7d * 15;
}

function SmoothWheelZoom() {
  const map = useMap() as MapInternals;

  useEffect(() => {
    const container = map.getContainer();
    let frame: number | null = null;
    let goal = map.getZoom();
    let anchorPoint = L.point(0, 0);
    let anchorLatLng = map.getCenter();

    const finish = () => {
      if (frame === null) return;
      cancelAnimationFrame(frame);
      frame = null;
      map._moveEnd(true);
    };

    let last = 0;
    const step = (now: number) => {
      const dt = last ? Math.min(50, now - last) : 16;
      last = now;
      const zoom = map.getZoom();
      const next = Math.abs(goal - zoom) < 0.002 ? goal : zoom + (goal - zoom) * (1 - Math.exp(-dt / ZOOM_TAU_MS));
      const offset = anchorPoint.subtract(map.getSize().divideBy(2));
      const center = map.unproject(map.project(anchorLatLng, next).subtract(offset), next);
      map._move(map._limitCenter(center, next, (map.options.maxBounds as L.LatLngBounds | undefined) ?? null), next);
      if (next === goal) {
        frame = null;
        map._moveEnd(true);
      } else {
        frame = requestAnimationFrame(step);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (frame === null) {
        map._stop();
        last = 0;
        goal = map.getZoom();
        map._moveStart(true, false);
        frame = requestAnimationFrame(step);
      }
      anchorPoint = map.mouseEventToContainerPoint(e);
      anchorLatLng = map.containerPointToLatLng(anchorPoint);
      // A trackpad pinch arrives as ctrl+wheel; trackpad scrolling as small pixel deltas. Mouse wheels send
      // big (or line-based) steps. Using one gain for all of them made pinching feel heavy.
      const trackpad = e.ctrlKey || (e.deltaMode === 0 && Math.abs(e.deltaY) < 50);
      const gain = trackpad ? ZOOM_PER_TRACKPAD_PX * (e.ctrlKey ? 1.15 : 1) : ZOOM_PER_WHEEL_PX;
      const target = goal + L.DomEvent.getWheelDelta(e) * gain;
      goal = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), target));
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    map.on("dragstart", finish);
    return () => {
      container.removeEventListener("wheel", onWheel);
      map.off("dragstart", finish);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [map]);

  return null;
}

// Labels are placed with a transform from (0, 0) of their layer, so these must hold even when the
// stylesheet is stale or late: without them a label drops into normal flow and drifts off its place.
const LABEL_BASE = "position:absolute;left:0;top:0;margin:0;pointer-events:auto;";
const DISTRICT_LABEL_ZOOM = 9.5; // from here on, district labels replace city labels

// Labels live in their own layer above the black mask and the dots, repositioned every frame.
function CityLabels({ country, onSelect, marker }: { country: Country; onSelect: (c: City) => void; marker: "dot" | "diamond" }) {
  const map = useMap();
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const layer = document.createElement("div");
    layer.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:450;overflow:hidden";
    map.getContainer().appendChild(layer);

    const items = CITIES[country].map((c) => {
      const el = document.createElement("button");
      el.type = "button";
      el.title = `Zoom to ${c.name}`;
      el.className = `city-label${c.hasData ? " city-label--data" : ""}`;
      el.style.cssText = LABEL_BASE;
      el.innerHTML = `<span class="city-dot"></span><span></span>`;
      el.lastElementChild!.textContent = c.name;
      if (marker === "diamond") {
        // A cream diamond with a dark edge: a different shape from the round data dots, so a city never reads as a detection.
        (el.firstElementChild as HTMLElement).style.cssText = `width:10px;height:10px;flex:none;margin-right:4px;border-radius:0;transform:rotate(45deg);background:#ECE6DA;border:1.5px solid #13110F;box-shadow:0 0 0 1px ${c.hasData ? "#F07636" : "rgba(236,230,218,0.75)"};`;
      }
      el.addEventListener("click", () => onSelectRef.current(c));
      layer.appendChild(el);
      return { c, el };
    });

    const place = () => {
      layer.style.display = map.getZoom() >= DISTRICT_LABEL_ZOOM ? "none" : "";
      for (const { c, el } of items) {
        const p = map.latLngToContainerPoint([c.lat, c.lng]);
        el.style.transform = `translate(${p.x - (marker === "diamond" ? 5 : 4)}px, ${p.y}px) translateY(-50%)`;
      }
    };

    place();
    map.on("move resize", place);
    return () => {
      map.off("move resize", place);
      layer.remove();
    };
  }, [map, country, marker]);

  return null;
}

// Districts with data are picked on the map (there is no list any more): once zoomed in, each one gets
// a small label coloured by its risk; clicking selects it. Hidden when zoomed out, where city labels are.
function DistrictLabels({
  districts,
  selected,
  onSelect,
}: {
  districts: DistrictRisk[];
  selected?: string;
  onSelect: (d: DistrictRisk) => void;
}) {
  const map = useMap();
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const layer = document.createElement("div");
    layer.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:455;overflow:hidden";
    map.getContainer().appendChild(layer);

    const items = districts.map((d) => {
      const el = document.createElement("button");
      el.type = "button";
      el.title = `${d.district}: risk ${d.risk_score}/100`;
      el.className = `district-label${d.district === selected ? " district-label--selected" : ""}`;
      el.style.cssText = LABEL_BASE;
      el.innerHTML = `<span class="district-name"></span><span class="district-score"></span>`;
      (el.children[0] as HTMLElement).textContent = d.district;
      (el.children[1] as HTMLElement).textContent = `${d.risk_score}`;
      (el.children[1] as HTMLElement).style.color = `hsl(${Math.max(0, 40 - d.risk_score * 0.4)} 90% 36%)`;
      el.addEventListener("click", () => onSelectRef.current(d));
      layer.appendChild(el);
      return { d, el };
    });

    const place = () => {
      layer.style.display = map.getZoom() >= DISTRICT_LABEL_ZOOM ? "" : "none";
      for (const { d, el } of items) {
        const p = map.latLngToContainerPoint([d.lat, d.lng]);
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      }
    };
    place();
    map.on("move resize", place);
    return () => {
      map.off("move resize", place);
      layer.remove();
    };
  }, [map, districts, selected]);

  return null;
}

// Street-level detail (roads, buildings) fades in from zoom 10. The Esri tiles carry baked-in place
// names, which show up at the lower zooms, and bigger street names past zoom 13, so the tiles stop
// at 13 and deeper zooms stretch them.
const TILE_FADE_START = 10;
const TILE_FADE_RANGE = 1;
const STREET_BACKDROP = 52; // gray level (0-255) behind the street tiles, close to their land color

function StreetTiles() {
  const map = useMap();

  useEffect(() => {
    const layer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      {
        minZoom: TILE_FADE_START,
        maxNativeZoom: 13,
        maxZoom: 15,
        opacity: 0,
        keepBuffer: 8, // keep far more tiles around the view, so a fast zoom or pan meets already-loaded ones
        updateInterval: 60, // ask for new tiles sooner while zooming (default 200 ms)
        attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors",
      },
    ).addTo(map);
    const container = map.getContainer();
    // Tiles that haven't arrived yet show the map background. As the street tiles take over, that background
    // goes from black to the tiles' own gray, so a missing tile reads as a slightly dim patch, not a black flash.
    const fade = () => {
      const t = Math.min(1, Math.max(0, map.getZoom() - TILE_FADE_START) / TILE_FADE_RANGE);
      layer.setOpacity(t);
      const g = Math.round(t * STREET_BACKDROP);
      container.style.backgroundColor = `rgb(${g}, ${g}, ${g})`;
    };
    fade();
    map.on("zoom", fade);
    return () => {
      map.off("zoom", fade);
      layer.remove();
    };
  }, [map]);

  return null;
}

const COUNTRY_GRAY = "#3a3a3a";
const DOT_RADIUS_AT_FIT = 3;
const DOT_MIN_RADIUS = 2.5;
const DOT_MAX_RADIUS = 7;
const DOT_GROWTH_PER_ZOOM = 1.2;

// Dark red near the average position of a district's detections, fading to light red at its edge.
function dotColors(detections: Detection[], palette: DotPalette): Map<string, string> {
  const byDistrict = new Map<string, Detection[]>();
  for (const o of detections) {
    const key = o.district_id ?? o.district; // dots of one district (or one hotspot) share a colour scale
    const list = byDistrict.get(key);
    if (list) list.push(o);
    else byDistrict.set(key, [o]);
  }

  const colors = new Map<string, string>();
  for (const group of byDistrict.values()) {
    const lat = group.reduce((s, o) => s + o.lat, 0) / group.length;
    const lng = group.reduce((s, o) => s + o.lng, 0) / group.length;
    const dist = group.map((o) => Math.hypot(o.lat - lat, o.lng - lng));
    const sorted = [...dist].sort((a, b) => a - b);
    const reach = sorted[Math.floor(sorted.length * 0.95)] || 1;
    group.forEach((o, i) => {
      const t = Math.round(Math.min(1, dist[i] / reach) * 15) / 15; // 16 steps: few enough colours to draw each in one batch
      const [r, g, b] = palette.core.map((c, k) => Math.round(c + (palette.edge[k] - c) * t));
      colors.set(o.detection_id, `rgb(${r} ${g} ${b})`);
    });
  }
  return colors;
}

// Whole-country view for each country (contiguous US only), as [[south, west], [north, east]].
const COUNTRY_VIEW: Record<Country, L.LatLngBoundsLiteral> = {
  NG: [[4.2, 2.6], [13.9, 14.7]],
  BR: [[-33.8, -74], [5.3, -34.7]],
  US: [[24.4, -125], [49.5, -66.9]],
};

interface Ring {
  xs: Float64Array;
  ys: Float64Array;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// Country outlines as web-mercator coordinates in 0..1, so each frame is just a scale and an offset.
const ringCache = new Map<Country, Ring[]>();
function countryRings(country: Country): Ring[] {
  const cached = ringCache.get(country);
  if (cached) return cached;
  const shape = (countryShapes as Record<string, { polygons: number[][][][] }>)[country];
  const rings = shape.polygons.map((poly) => {
    const outer = poly[0];
    const xs = new Float64Array(outer.length);
    const ys = new Float64Array(outer.length);
    outer.forEach(([lng, lat], i) => {
      const clamped = Math.max(-85.05, Math.min(85.05, lat));
      xs[i] = (lng + 180) / 360;
      ys[i] = 0.5 - Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360)) / (2 * Math.PI);
    });
    return {
      xs,
      ys,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  });
  ringCache.set(country, rings);
  return rings;
}

// ---- Boundary lines: states / provinces zoomed out, districts / counties / municipalities zoomed in.
// Built by scripts/build_map_lines.py into public/geo; loaded once per country and kept as
// web-mercator (0..1) coordinates like the country outline, so each frame is a scale and an offset.
interface Line {
  xs: Float64Array;
  ys: Float64Array;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
type Level = "adm1" | "adm2";
const lineCache = new Map<string, Promise<Line[]>>();

function loadLines(country: Country, level: Level): Promise<Line[]> {
  const key = `${country}-${level}`;
  let hit = lineCache.get(key);
  if (!hit) {
    hit = fetch(`/geo/${key}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`/geo/${key}.json returned ${r.status}: run scripts/build_map_lines.py`);
        return r.json() as Promise<{ lines: number[][] }>;
      })
      .then(({ lines }) =>
        lines.map((flat) => {
          const n = flat.length / 2;
          const xs = new Float64Array(n);
          const ys = new Float64Array(n);
          for (let i = 0; i < n; i++) {
            const lat = Math.max(-85.05, Math.min(85.05, flat[2 * i + 1]));
            xs[i] = (flat[2 * i] + 180) / 360;
            ys[i] = 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
          }
          return { xs, ys, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
        }),
      );
    hit.catch((err) => {
      lineCache.delete(key); // retry next time instead of caching the failure
      console.error("[map] could not load boundary lines", err);
    });
    lineCache.set(key, hit);
  }
  return hit;
}

// How the lines fade with zoom, relative to the zoom at which the whole country fits.
const ADM1_ALPHA = 0.3;
const ADM2_ALPHA = 0.2;
const ADM2_START = 1.0; // zoom levels past "whole country" where district lines begin to appear
const ADM2_FULL = 2.5;

function strokeLines(
  ctx: CanvasRenderingContext2D,
  lines: Line[],
  scale: number,
  ox: number,
  oy: number,
  w: number,
  h: number,
  alpha: number,
  width: number,
) {
  if (alpha <= 0.005) return;
  const path = new Path2D();
  for (const l of lines) {
    if (l.maxX * scale + ox < 0 || l.minX * scale + ox > w || l.maxY * scale + oy < 0 || l.minY * scale + oy > h) continue;
    path.moveTo(l.xs[0] * scale + ox, l.ys[0] * scale + oy);
    for (let i = 1; i < l.xs.length; i++) path.lineTo(l.xs[i] * scale + ox, l.ys[i] * scale + oy);
  }
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "rgb(236, 230, 218)";
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.stroke(path);
  ctx.globalAlpha = 1;
}

// ---- Topography: Esri hillshade tiles. The tiles are near-white with faint slope shadows, so each
// one is turned into a transparent-black shading layer (darker slope = more alpha) and drawn over the gray
// country shape, clipped to its outline. Own canvas rather than a tile layer, so it stays under the dots and lines.
const RELIEF_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile";
const RELIEF_STRENGTH = 0.4; // peak darkness of the steepest shadows (0–1); "subtle" lives here
const RELIEF_CONTRAST = 55; // tile brightness drop (out of 255) that counts as a full shadow
const RELIEF_MAX_Z = 9;
const reliefTiles = new Map<string, HTMLCanvasElement | "loading" | "failed">();

function reliefTile(z: number, x: number, y: number, onLoad: () => void): HTMLCanvasElement | null {
  const key = `${z}/${x}/${y}`;
  const hit = reliefTiles.get(key);
  if (hit === "failed" || hit === "loading") return null;
  if (hit) return hit;
  reliefTiles.set(key, "loading");
  const img = new Image();
  img.crossOrigin = "anonymous"; // the tiles allow it; needed to read their pixels
  img.onload = () => {
    const c = document.createElement("canvas");
    // Half resolution: the shading is soft, and this makes the per-pixel conversion four times cheaper.
    c.width = Math.max(1, img.naturalWidth >> 1);
    c.height = Math.max(1, img.naturalHeight >> 1);
    const cx = c.getContext("2d", { willReadFrequently: true })!;
    cx.drawImage(img, 0, 0, c.width, c.height);
    const px = cx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < px.data.length; i += 4) {
      const shadow = Math.min(1, Math.max(0, (255 - px.data[i]) / RELIEF_CONTRAST));
      px.data[i] = px.data[i + 1] = px.data[i + 2] = 0;
      px.data[i + 3] = Math.round(shadow * RELIEF_STRENGTH * 255);
    }
    cx.putImageData(px, 0, 0);
    reliefTiles.set(key, c);
    onLoad();
  };
  img.onerror = () => {
    reliefTiles.set(key, "failed");
    console.error(`[map] relief tile ${key} failed to load`);
  };
  img.src = `${RELIEF_URL}/${z}/${y}/${x}`;
  return null;
}

function drawRelief(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  scale: number,
  ox: number,
  oy: number,
  w: number,
  h: number,
  alpha: number,
  onLoad: () => void,
) {
  if (alpha <= 0.005) return;
  const tz = Math.min(RELIEF_MAX_Z, Math.max(2, Math.round(zoom)));
  const n = 2 ** tz;
  const size = scale / n;
  const x0 = Math.max(0, Math.floor(-ox / size));
  const x1 = Math.min(n - 1, Math.floor((w - ox) / size));
  const y0 = Math.max(0, Math.floor(-oy / size));
  const y1 = Math.min(n - 1, Math.floor((h - oy) / size));
  // The shading is transparent black, so it needs no clipping to the country: outside it, it lands on the
  // black map background and is invisible. (Clipping to the outline on every frame was the costliest step.)
  ctx.globalAlpha = alpha;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const img = reliefTile(tz, x, y, onLoad);
      // +0.5px overlap hides hairline seams between tiles
      if (img) ctx.drawImage(img, x * size + ox, y * size + oy, size + 0.5, size + 0.5);
    }
  }
  ctx.globalAlpha = 1;
}

// ---- Clicking a dot: a small card with what the detection was (all from the detection row).
function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function fillTip(tip: HTMLElement, o: Detection, onClose: () => void) {
  const info = GENUS_INFO[o.genus] ?? GENUS_INFO.other;
  const line = (cls: string, text: string) => {
    const el = document.createElement("div");
    el.className = cls;
    el.textContent = text;
    return el;
  };
  const close = document.createElement("button");
  close.type = "button";
  close.className = "dot-tip-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";
  close.addEventListener("click", onClose);
  const sure = o.confidence ? ` · ${Math.round(o.confidence * 100)}% sure` : "";
  const carries = info.diseases.length ? `Can carry ${info.diseases.map((d) => DISEASE_LABEL[d].toLowerCase()).join(", ")}` : "";
  tip.replaceChildren(
    close,
    line("dot-tip-title", o.species ?? `${info.label} mosquito`),
    line("dot-tip-sub", `${info.label}${sure}`),
    line("dot-tip-row", `Heard ${timeAgo(o.time)} in ${o.district}`),
    ...(carries ? [line("dot-tip-row", carries)] : []),
  );
}

// Hovering a dot: just the species and how sure the model was. Clicking opens the full card.
function fillHover(el: HTMLElement, o: Detection) {
  const info = GENUS_INFO[o.genus] ?? GENUS_INFO.other;
  const title = document.createElement("div");
  title.className = "dot-hover-title";
  title.textContent = o.species ?? `${info.label} mosquito`;
  const sub = document.createElement("div");
  sub.className = "dot-hover-sub";
  sub.textContent = o.confidence ? `${info.label} · ${Math.round(o.confidence * 100)}% sure · click for more` : `${info.label} · click for more`;
  el.replaceChildren(title, sub);
}

// A filled dot drawn once into a small canvas; each frame then just stamps it, which is far cheaper than
// building and filling a circle path for every dot.
const spriteCache = new Map<string, HTMLCanvasElement>();
function dotSprite(color: string, radius: number, dpr: number): HTMLCanvasElement {
  const key = `${color}|${radius}|${dpr}`;
  let c = spriteCache.get(key);
  if (!c) {
    const px = Math.ceil((radius * 2 + 2) * dpr);
    c = document.createElement("canvas");
    c.width = c.height = px;
    const g = c.getContext("2d")!;
    g.fillStyle = color;
    g.beginPath();
    g.arc(px / 2, px / 2, radius * dpr, 0, Math.PI * 2);
    g.fill();
    spriteCache.set(key, c);
  }
  return c;
}

function MapOverlay({ country, detections, palette }: { country: Country; detections: Detection[]; palette: DotPalette }) {
  const map = useMap();
  const fitZoom = useRef<number | null>(null);

  useEffect(() => {
    if (fitZoom.current === null) fitZoom.current = map.getZoom();
    const base = fitZoom.current;
    const colors = dotColors(detections, palette);
    const rings = countryRings(country);
    // Dots are projected once (web-mercator, 0..1). A frame is then a scale and an offset per dot, and the dots
    // are drawn one path and one fill per colour instead of one of each per dot.
    const dotCount = detections.length;
    const dotX = new Float64Array(dotCount);
    const dotY = new Float64Array(dotCount);
    const fallbackColor = `rgb(${palette.core.join(" ")})`;
    const byColor = new Map<string, number[]>();
    detections.forEach((o, i) => {
      const lat = Math.max(-85.05, Math.min(85.05, o.lat));
      dotX[i] = (o.lng + 180) / 360;
      dotY[i] = 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
      const color = colors.get(o.detection_id) ?? fallbackColor;
      const list = byColor.get(color);
      if (list) list.push(i);
      else byColor.set(color, [i]);
    });
    const redOf = (c: string) => Number(c.match(/\d+/)![0]);
    const batches = [...byColor].sort((a, b) => Math.abs(redOf(a[0]) - palette.core[0]) - Math.abs(redOf(b[0]) - palette.core[0]));
    let occupied = new Uint8Array(0);
    const radius = () =>
      Math.min(
        DOT_MAX_RADIUS,
        Math.max(DOT_MIN_RADIUS, DOT_RADIUS_AT_FIT * DOT_GROWTH_PER_ZOOM ** (map.getZoom() - base)),
      );

    // Own canvas over the map container, redrawn from lat/lng on every move/zoom frame.
    // Leaflet's canvas renderer only reprojects at the end of a zoom, so resizing its
    // dots mid-zoom made them drift off the map.
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;z-index:401";
    map.getContainer().appendChild(canvas);
    const ctx = canvas.getContext("2d")!;

    // Clicking a dot picks it: a ring on the dot and a card that follows it as the map moves.
    const container = map.getContainer();
    let picked: Detection | null = null;
    const tip = document.createElement("div");
    tip.className = "dot-tip";
    tip.style.cssText = "position:absolute;left:0;top:0;z-index:460;display:none;";
    container.appendChild(tip);
    L.DomEvent.disableClickPropagation(tip);
    L.DomEvent.disableScrollPropagation(tip);
    const hit = (pt: L.Point): Detection | null => {
      const scale = 256 * 2 ** map.getZoom();
      const origin = map.latLngToContainerPoint([0, 0]);
      const ox = origin.x - scale / 2;
      const oy = origin.y - scale / 2;
      let best = -1;
      let bestDist = radius() + 5; // a little slack so small dots are easy to hit
      for (let i = 0; i < dotCount; i++) {
        const dx = dotX[i] * scale + ox - pt.x;
        if (dx > bestDist || dx < -bestDist) continue;
        const dy = dotY[i] * scale + oy - pt.y;
        if (dy > bestDist || dy < -bestDist) continue;
        const d = Math.hypot(dx, dy);
        if (d <= bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best < 0 ? null : detections[best];
    };
    const placeTip = () => {
      if (!picked) return;
      const p = map.latLngToContainerPoint([picked.lat, picked.lng]);
      const below = p.y < 190; // flip under the dot near the top edge
      tip.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, ${below ? "16px" : "calc(-100% - 16px)"})`;
    };
    // Hovering a dot shows a small species label that follows it; it hides once that dot is opened.
    let hovered: Detection | null = null;
    const hoverTip = document.createElement("div");
    hoverTip.className = "dot-hover";
    hoverTip.style.cssText = "position:absolute;left:0;top:0;z-index:458;pointer-events:none;display:none;";
    container.appendChild(hoverTip);
    const placeHover = () => {
      if (!hovered || hovered === picked) return;
      const p = map.latLngToContainerPoint([hovered.lat, hovered.lng]);
      const below = p.y < 70;
      hoverTip.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, ${below ? "12px" : "calc(-100% - 12px)"})`;
    };
    const setHover = (o: Detection | null) => {
      if (o === hovered) return;
      hovered = o;
      if (o) fillHover(hoverTip, o);
      hoverTip.style.display = o && o !== picked ? "" : "none";
      placeHover();
      redraw();
    };
    const pick = (o: Detection | null) => {
      picked = o;
      if (o) fillTip(tip, o, () => pick(null));
      tip.style.display = o ? "" : "none";
      hoverTip.style.display = hovered && hovered !== picked ? "" : "none";
      placeTip();
      placeHover();
      redraw();
    };
    // City and district labels sit on top of the dots. A click or hover that lands on a label belongs to the
    // label alone, so a dot underneath it is never picked or hovered at the same time.
    const overLabel = (e: L.LeafletMouseEvent) =>
      !!(e.originalEvent.target as HTMLElement | null)?.closest?.(".city-label, .district-label");
    const onClick = (e: L.LeafletMouseEvent) => {
      if (overLabel(e)) return;
      pick(hit(e.containerPoint));
    };
    const onHover = (e: L.LeafletMouseEvent) => {
      const o = overLabel(e) ? null : hit(e.containerPoint);
      container.style.cursor = o ? "pointer" : "";
      setHover(o);
    };
    const onLeave = () => setHover(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && pick(null);
    map.on("click", onClick);
    map.on("mousemove", onHover);
    map.on("mouseout", onLeave);
    document.addEventListener("keydown", onKey);

    let adm1: Line[] = [];
    let adm2: Line[] = [];
    let queued = 0;
    const redraw = () => {
      if (!alive) return; // a late tile load must not draw on a map that has been removed
      cancelAnimationFrame(queued);
      queued = requestAnimationFrame(() => draw());
    };
    let alive = true;
    loadLines(country, "adm1").then((l) => alive && ((adm1 = l), redraw()), () => {});
    // District lines are the big file (Brazil: 2 MB): fetched only once zoomed in far enough to see them.
    let adm2Requested = false;
    const wantAdm2 = () => {
      if (adm2Requested || map.getZoom() < base + ADM2_START - 0.3) return;
      adm2Requested = true;
      loadLines(country, "adm2").then((l) => alive && ((adm2 = l), redraw()), () => (adm2Requested = false));
    };

    const draw = () => {
      const size = map.getSize();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== size.x * dpr || canvas.height !== size.y * dpr) {
        canvas.width = size.x * dpr;
        canvas.height = size.y * dpr;
        canvas.style.width = `${size.x}px`;
        canvas.style.height = `${size.y}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);

      // The country as a flat gray shape on the black map background.
      const scale = 256 * 2 ** map.getZoom();
      const origin = map.latLngToContainerPoint([0, 0]);
      const ox = origin.x - scale / 2;
      const oy = origin.y - scale / 2;
      const outline = new Path2D();
      for (const ring of rings) {
        if (
          ring.maxX * scale + ox < 0 ||
          ring.minX * scale + ox > size.x ||
          ring.maxY * scale + oy < 0 ||
          ring.minY * scale + oy > size.y
        )
          continue;
        for (let i = 0; i < ring.xs.length; i++) {
          const x = ring.xs[i] * scale + ox;
          const y = ring.ys[i] * scale + oy;
          if (i === 0) outline.moveTo(x, y);
          else outline.lineTo(x, y);
        }
        outline.closePath();
      }
      const zoom = map.getZoom();
      wantAdm2();
      // Everything on the gray shape fades out together once the street tiles take over.
      const shape = 1 - Math.min(1, Math.max(0, (zoom - TILE_FADE_START) / TILE_FADE_RANGE));
      ctx.globalAlpha = shape;
      ctx.fillStyle = COUNTRY_GRAY;
      ctx.fill(outline);
      ctx.globalAlpha = 1;
      drawRelief(ctx, zoom, scale, ox, oy, size.x, size.y, shape * (1 - 0.65 * Math.min(1, Math.max(0, (zoom - 7.5) / 2.5))), redraw);
      // States first (visible zoomed out), then districts as you zoom in; both thin out under the street tiles.
      const into = (zoom - base - ADM2_START) / (ADM2_FULL - ADM2_START);
      strokeLines(ctx, adm1, scale, ox, oy, size.x, size.y, ADM1_ALPHA * (0.5 + 0.5 * shape), 1);
      strokeLines(ctx, adm2, scale, ox, oy, size.x, size.y, ADM2_ALPHA * Math.min(1, Math.max(0, into)) * shape, 0.75);
      ctx.strokeStyle = "rgba(236, 230, 218, 0.3)";
      ctx.lineWidth = 1;
      ctx.stroke(outline);

      const r = radius();
      ctx.globalAlpha = 0.9;
      const spriteR = Math.round(r * 4) / 4; // sprites are cached per colour and quarter-pixel radius
      const side = spriteR * 2 + 2; // sprite size in CSS px
      const half = side / 2;
      // Dots stacked within a fraction of a dot width look like one, so each tiny pixel cell gets a single dot.
      // The darkest (most central) colours are drawn first, so they win the cell.
      const cell = Math.max(1.5, r * 0.8);
      const cols = Math.ceil(size.x / cell) + 2;
      const rows = Math.ceil(size.y / cell) + 2;
      if (occupied.length < cols * rows) occupied = new Uint8Array(cols * rows);
      else occupied.fill(0, 0, cols * rows);
      for (const [color, idx] of batches) {
        const sprite = dotSprite(color, spriteR, dpr);
        for (let k = 0; k < idx.length; k++) {
          const i = idx[k];
          const x = dotX[i] * scale + ox;
          const y = dotY[i] * scale + oy;
          if (x < -r || x > size.x + r || y < -r || y > size.y + r) continue; // off screen
          const slot = ((y / cell) | 0) * cols + ((x / cell) | 0);
          if (occupied[slot]) continue;
          occupied[slot] = 1;
          ctx.drawImage(sprite, x - half, y - half, side, side);
        }
      }
      if (hovered && hovered !== picked) {
        const p = map.latLngToContainerPoint([hovered.lat, hovered.lng]);
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = "#ECE6DA";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
        ctx.stroke();
        placeHover();
      }
      if (picked) {
        const p = map.latLngToContainerPoint([picked.lat, picked.lng]);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#ECE6DA";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        ctx.stroke();
        placeTip();
      }
    };

    draw();
    map.on("move resize", draw);
    return () => {
      alive = false;
      cancelAnimationFrame(queued);
      map.off("move resize", draw);
      map.off("click", onClick);
      map.off("mousemove", onHover);
      map.off("mouseout", onLeave);
      document.removeEventListener("keydown", onKey);
      container.style.cursor = "";
      hoverTip.remove();
      tip.remove();
      canvas.remove();
    };
  }, [map, detections, country, palette]);

  return null;
}

// Dragging sideways (or swiping two fingers sideways) on the whole-country view slides to the next
// country. Zoomed in, the same drag just pans the map, so it only counts at the whole-country zoom.
const SWIPE_DRAG_PX = 110;
const SWIPE_WHEEL_PX = 140;

function SwipeToChange({ onSwipe }: { onSwipe: (dir: 1 | -1) => void }) {
  const map = useMap();
  const onSwipeRef = useRef(onSwipe);
  useEffect(() => {
    onSwipeRef.current = onSwipe;
  });

  useEffect(() => {
    const container = map.getContainer();
    const wholeCountry = () => map.getZoom() <= map.getMinZoom() + 0.5;

    let start: { x: number; y: number; id: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button > 0 || !wholeCountry() || (e.target as HTMLElement).closest("button, a, .dot-tip")) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const onMove = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < SWIPE_DRAG_PX || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      start = null;
      onSwipeRef.current(dx < 0 ? 1 : -1); // drag left: the next map comes in from the right
    };
    const onUp = () => {
      start = null;
    };

    let wheelX = 0;
    let wheelTimer: ReturnType<typeof setTimeout> | undefined;
    let locked = false;
    const onWheel = (e: WheelEvent) => {
      if (locked || !wholeCountry() || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      wheelX += e.deltaX;
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        wheelX = 0;
      }, 200);
      if (Math.abs(wheelX) < SWIPE_WHEEL_PX) return;
      onSwipeRef.current(wheelX > 0 ? 1 : -1);
      wheelX = 0;
      locked = true; // one slide per swipe, not one per trackpad momentum tick
      setTimeout(() => {
        locked = false;
      }, 900);
    };

    container.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    container.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      container.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      container.removeEventListener("wheel", onWheel);
      clearTimeout(wheelTimer);
    };
  }, [map]);

  return null;
}

function FitToCountry({ country }: { country: Country }) {
  const map = useMap();

  useEffect(() => {
    const bounds = L.latLngBounds(COUNTRY_VIEW[country]);
    map.fitBounds(bounds, { paddingTopLeft: [8, TOP_CLEARANCE], paddingBottomRight: [8, 8], animate: false });
    // No zooming out past the whole country, and no panning away from it.
    map.setMinZoom(map.getZoom() - 0.3);
    map.setMaxBounds(bounds.pad(0.1));
  }, [map, country]);

  return null;
}

function FlyToFocus({ focus, country }: { focus?: MapFocus | null; country: Country }) {
  const map = useMap();

  useEffect(() => {
    if (!focus) return;
    if (focus.reset) {
      map.flyToBounds(L.latLngBounds(COUNTRY_VIEW[country]), { paddingTopLeft: [8, TOP_CLEARANCE], paddingBottomRight: [8, 8], duration: 1.2 });
    } else {
      map.flyTo([focus.lat, focus.lng], focus.zoom, { duration: 1.2 });
    }
    // Fire once per request, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, focus?.key]);

  return null;
}

// Lets the page read this map's camera or jump it (no animation), to carry a view between two maps.
function ExposeView({ viewRef }: { viewRef: MutableRefObject<MapView | null> }) {
  const map = useMap();
  useEffect(() => {
    viewRef.current = {
      get: () => {
        const c = map.getCenter();
        return { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
      },
      set: (lat, lng, zoom) => {
        // A view carried over from a smaller map can be further out than this map's own limit.
        map.setMinZoom(Math.min(map.getMinZoom(), zoom));
        map.setView([lat, lng], zoom, { animate: false });
      },
    };
    return () => {
      viewRef.current = null;
    };
  }, [map, viewRef]);
  return null;
}

export default function RiskHeatMapClient({
  districts,
  detections,
  selected,
  onSelect,
  onCitySelect,
  onSwipe,
  focus,
  viewRef,
  dotPalette = RED_DOTS,
  cityMarker = "dot",
  height = "100%",
}: RiskHeatMapClientProps) {
  const country = districts[0].country;
  return (
    <div className="relative h-full w-full" data-lenis-prevent>
    <MapContainer
      center={L.latLngBounds(COUNTRY_VIEW[country]).getCenter()}
      zoom={5}
      zoomSnap={0}
      minZoom={2}
      maxZoom={15}
      zoomAnimation={false}
      fadeAnimation={false}
      maxBoundsViscosity={1}
      scrollWheelZoom={false}
      zoomControl={false}
      attributionControl={false}
      preferCanvas
      className="risk-map"
      style={{ width: "100%", height, background: "#000" }}
    >
      <StreetTiles />
      <SmoothWheelZoom />
      <CityLabels country={country} onSelect={onCitySelect} marker={cityMarker} />
      <FlyToFocus focus={focus} country={country} />
      <FitToCountry country={country} />
      {onSwipe && <SwipeToChange onSwipe={onSwipe} />}
      {viewRef && <ExposeView viewRef={viewRef} />}
      {SHOW_DISTRICT_CIRCLES && districts.map((d) => {
        const isSel = d.district === selected;
        return (
          <Circle
            key={d.district}
            center={[d.lat, d.lng]}
            radius={radiusMeters(d)}
            pathOptions={{
              fillColor: riskColor(d.risk_score),
              fillOpacity: 0.2,
              color: isSel ? "#fff" : riskColor(d.risk_score),
              opacity: isSel ? 1 : 0.5,
              weight: isSel ? 2 : 1,
            }}
            eventHandlers={{ click: () => onSelect(d) }}
          >
            <Popup>
              <div style={{ minWidth: 190 }}>
                <strong>{d.district}</strong>
                <div style={{ marginTop: 6 }}>
                  <strong>Risk score:</strong> {d.risk_score} out of 100 ({riskLabel(d.risk_score)})
                </div>
                <div style={{ marginTop: 4 }}>
                  <strong>Mosquito detections:</strong> {d.detections_7d} in the last 7 days
                </div>
                <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7, lineHeight: 1.35 }}>
                  A detection is one mosquito identified from a recorded buzz sound. Higher scores mean
                  more mosquitoes, recent cases and favorable weather, so treat these areas first.
                </div>
              </div>
            </Popup>
          </Circle>
        );
      })}
      <DistrictLabels districts={districts} selected={selected} onSelect={onSelect} />
      <MapOverlay country={country} detections={detections} palette={dotPalette} />
    </MapContainer>
    </div>
  );
}
