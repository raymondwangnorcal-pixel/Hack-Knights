import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { Detection, DistrictRisk } from "@/lib/types";
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
      map._move(center, next);
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

function FitToDistricts({ districts }: { districts: DistrictRisk[] }) {
  const map = useMap();
  const key = districts.map((d) => d.district).join("|");

  useEffect(() => {
    if (!districts.length) return;
    const bounds = L.latLngBounds(districts.map((d) => [d.lat, d.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40] });
    // Refit only when the set of districts changes, not on every selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  return null;
}

export default function RiskHeatMapClient({
  districts,
  detections,
  selected,
  onSelect,
}: RiskHeatMapClientProps) {
  return (
    <>
    <MapContainer
      center={[districts[0].lat, districts[0].lng]}
      zoom={11}
      zoomSnap={0}
      scrollWheelZoom={false}
      preferCanvas
      style={{ width: "100%", height: 480 }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <SmoothWheelZoom />
      <FitToDistricts districts={districts} />
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
      {detections.map((o) => (
        <CircleMarker
          key={o.detection_id}
          center={[o.lat, o.lng]}
          radius={2}
          interactive={false}
          pathOptions={{ fillColor: "#7f1d1d", fillOpacity: 0.85, stroke: false }}
        />
      ))}
    </MapContainer>
    <p className="mt-2 text-xs opacity-60">
      Each dot is one mosquito detection from the last 7 days, placed where it was recorded. Areas
      with more dots are higher risk.
    </p>
    </>
  );
}
