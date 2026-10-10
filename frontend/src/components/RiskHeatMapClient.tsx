import { useEffect, useRef } from "react";
import { Circle, MapContainer, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import countryShapes from "@/lib/countryShapes.json";
import type { Country, Detection, DistrictRisk } from "@/lib/types";
import "leaflet/dist/leaflet.css";

interface RiskHeatMapClientProps {
  districts: DistrictRisk[];
  detections: Detection[];
  selected?: string;
  onSelect: (d: DistrictRisk) => void;
}

// Leaflet internals used to move the view without its built-in 250ms zoom animation.
type MapInternals = L.Map & {
  _move(center: L.LatLng, zoom: number): void;
  _moveStart(zoomChanged: boolean, noMoveStart: boolean): void;
  _moveEnd(zoomChanged: boolean): void;
  _stop(): void;
  _limitCenter(center: L.LatLng, zoom: number, bounds: L.LatLngBounds | null): L.LatLng;
};

const ZOOM_PER_WHEEL_PX = 1 / 150;
const EASE = 0.25;
const SHOW_DISTRICT_CIRCLES = false;

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

    const step = () => {
      const zoom = map.getZoom();
      const next = Math.abs(goal - zoom) < 0.001 ? goal : zoom + (goal - zoom) * EASE;
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
        goal = map.getZoom();
        map._moveStart(true, false);
        frame = requestAnimationFrame(step);
      }
      anchorPoint = map.mouseEventToContainerPoint(e);
      anchorLatLng = map.containerPointToLatLng(anchorPoint);
      const target = goal + L.DomEvent.getWheelDelta(e) * ZOOM_PER_WHEEL_PX;
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

interface City {
  name: string;
  lat: number;
  lng: number;
  hasData?: boolean;
}

// Clickable city labels. Cities that have detection data are highlighted.
const CITIES: Record<Country, City[]> = {
  NG: [
    { name: "Lagos", lat: 6.5244, lng: 3.3792, hasData: true },
    { name: "Abuja", lat: 9.0765, lng: 7.3986 },
    { name: "Kano", lat: 12.0022, lng: 8.592 },
    { name: "Ibadan", lat: 7.3775, lng: 3.947 },
    { name: "Port Harcourt", lat: 4.8156, lng: 7.0498 },
    { name: "Kaduna", lat: 10.5105, lng: 7.4165 },
    { name: "Benin City", lat: 6.335, lng: 5.6037 },
    { name: "Maiduguri", lat: 11.8333, lng: 13.15 },
    { name: "Enugu", lat: 6.4584, lng: 7.5464 },
  ],
  BR: [
    { name: "São Paulo", lat: -23.5505, lng: -46.6333, hasData: true },
    { name: "Rio de Janeiro", lat: -22.9068, lng: -43.1729 },
    { name: "Brasília", lat: -15.7939, lng: -47.8828 },
    { name: "Salvador", lat: -12.9777, lng: -38.5016 },
    { name: "Fortaleza", lat: -3.7319, lng: -38.5267 },
    { name: "Belo Horizonte", lat: -19.9167, lng: -43.9345 },
    { name: "Manaus", lat: -3.119, lng: -60.0217 },
    { name: "Curitiba", lat: -25.4284, lng: -49.2733 },
    { name: "Recife", lat: -8.0476, lng: -34.877 },
    { name: "Porto Alegre", lat: -30.0346, lng: -51.2177 },
    { name: "Belém", lat: -1.4558, lng: -48.4902 },
  ],
  US: [
    { name: "New York", lat: 40.7128, lng: -74.006, hasData: true },
    { name: "Los Angeles", lat: 34.0522, lng: -118.2437 },
    { name: "Chicago", lat: 41.8781, lng: -87.6298 },
    { name: "Houston", lat: 29.7604, lng: -95.3698 },
    { name: "Phoenix", lat: 33.4484, lng: -112.074 },
    { name: "Miami", lat: 25.7617, lng: -80.1918 },
    { name: "Atlanta", lat: 33.749, lng: -84.388 },
    { name: "Seattle", lat: 47.6062, lng: -122.3321 },
    { name: "Denver", lat: 39.7392, lng: -104.9903 },
    { name: "Washington", lat: 38.9072, lng: -77.0369 },
    { name: "Boston", lat: 42.3601, lng: -71.0589 },
  ],
};

const CITY_ZOOM = 13;

// Labels live in their own layer above the black mask and the dots, repositioned every frame.
function CityLabels({ country }: { country: Country }) {
  const map = useMap();

  useEffect(() => {
    const layer = document.createElement("div");
    layer.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:450;overflow:hidden";
    map.getContainer().appendChild(layer);

    const items = CITIES[country].map((c) => {
      const el = document.createElement("button");
      el.type = "button";
      el.title = `Zoom to ${c.name}`;
      el.className = `city-label${c.hasData ? " city-label--data" : ""}`;
      el.innerHTML = `<span class="city-dot"></span><span></span>`;
      el.lastElementChild!.textContent = c.name;
      el.addEventListener("click", () => map.flyTo([c.lat, c.lng], CITY_ZOOM, { duration: 1.2 }));
      layer.appendChild(el);
      return { c, el };
    });

    const place = () => {
      for (const { c, el } of items) {
        const p = map.latLngToContainerPoint([c.lat, c.lng]);
        el.style.transform = `translate(${p.x - 4}px, ${p.y}px) translateY(-50%)`;
      }
    };

    place();
    map.on("move zoom resize", place);
    return () => {
      map.off("move zoom resize", place);
      layer.remove();
    };
  }, [map, country]);

  return null;
}

// Street-level detail (roads, buildings) fades in from zoom 12. The tiles carry baked-in place
// names at lower zooms and street names at the closest ones, so they are only used between 12 and 13
// (deeper zooms stretch the zoom-13 tiles).
const TILE_FADE_START = 12;
const TILE_FADE_RANGE = 0.6;

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
        attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors",
      },
    ).addTo(map);
    const fade = () => layer.setOpacity(Math.min(1, Math.max(0, map.getZoom() - TILE_FADE_START) / TILE_FADE_RANGE));
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
const DOT_CORE: [number, number, number] = [196, 30, 38];
const DOT_EDGE: [number, number, number] = [252, 165, 165];

// Dark red near the average position of a district's detections, fading to light red at its edge.
function dotColors(detections: Detection[]): Map<string, string> {
  const byDistrict = new Map<string, Detection[]>();
  for (const o of detections) {
    const list = byDistrict.get(o.district);
    if (list) list.push(o);
    else byDistrict.set(o.district, [o]);
  }

  const colors = new Map<string, string>();
  for (const group of byDistrict.values()) {
    const lat = group.reduce((s, o) => s + o.lat, 0) / group.length;
    const lng = group.reduce((s, o) => s + o.lng, 0) / group.length;
    const dist = group.map((o) => Math.hypot(o.lat - lat, o.lng - lng));
    const sorted = [...dist].sort((a, b) => a - b);
    const reach = sorted[Math.floor(sorted.length * 0.95)] || 1;
    group.forEach((o, i) => {
      const t = Math.min(1, dist[i] / reach);
      const [r, g, b] = DOT_CORE.map((c, k) => Math.round(c + (DOT_EDGE[k] - c) * t));
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

function MapOverlay({ country, detections }: { country: Country; detections: Detection[] }) {
  const map = useMap();
  const fitZoom = useRef<number | null>(null);

  useEffect(() => {
    if (fitZoom.current === null) fitZoom.current = map.getZoom();
    const base = fitZoom.current;
    const colors = dotColors(detections);
    const rings = countryRings(country);
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
      ctx.globalAlpha = 1 - Math.min(1, Math.max(0, (map.getZoom() - TILE_FADE_START) / TILE_FADE_RANGE));
      ctx.fillStyle = COUNTRY_GRAY;
      ctx.fill(outline);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(236, 230, 218, 0.3)";
      ctx.lineWidth = 1;
      ctx.stroke(outline);

      const r = radius();
      ctx.globalAlpha = 0.9;
      for (const o of detections) {
        const p = map.latLngToContainerPoint([o.lat, o.lng]);
        ctx.fillStyle = colors.get(o.detection_id) ?? "#c41e26";
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    draw();
    map.on("move zoom resize", draw);
    return () => {
      map.off("move zoom resize", draw);
      canvas.remove();
    };
  }, [map, detections, country]);

  return null;
}

function FitToCountry({ country }: { country: Country }) {
  const map = useMap();

  useEffect(() => {
    const bounds = L.latLngBounds(COUNTRY_VIEW[country]);
    map.fitBounds(bounds, { padding: [8, 8], animate: false });
    // No zooming out past the whole country, and no panning away from it.
    map.setMinZoom(map.getZoom() - 0.3);
    map.setMaxBounds(bounds.pad(0.1));
  }, [map, country]);

  return null;
}

export default function RiskHeatMapClient({
  districts,
  detections,
  selected,
  onSelect,
}: RiskHeatMapClientProps) {
  const country = districts[0].country;
  return (
    <>
    <MapContainer
      center={L.latLngBounds(COUNTRY_VIEW[country]).getCenter()}
      zoom={5}
      zoomSnap={0}
      minZoom={2}
      maxZoom={15}
      zoomAnimation={false}
      maxBoundsViscosity={1}
      scrollWheelZoom={false}
      preferCanvas
      className="risk-map"
      style={{ width: "100%", height: 520 }}
    >
      <StreetTiles />
      <SmoothWheelZoom />
      <CityLabels country={country} />
      <FitToCountry country={country} />
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
      <MapOverlay country={country} detections={detections} />
    </MapContainer>
    <div
      className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] uppercase tracking-widest opacity-80"
      style={{ fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" }}
    >
      <span>1 dot = 1 mosquito detection, last 7 days</span>
      <span className="flex items-center gap-2">
        Center
        <span
          className="inline-block h-2 w-20 rounded-sm"
          style={{
            background: `linear-gradient(to right, rgb(${DOT_CORE.join(" ")}), rgb(${DOT_EDGE.join(" ")}))`,
          }}
        />
        Outskirts
      </span>
      <span>More dots = higher risk</span>
    </div>
    </>
  );
}
