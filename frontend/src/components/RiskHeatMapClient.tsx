import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { useEffect, useRef } from "react";
import L from "leaflet";
import type { DistrictRisk } from "@/lib/types";
import "leaflet/dist/leaflet.css";

interface RiskHeatMapClientProps {
  districts: DistrictRisk[];
  selected?: string;
  onSelect: (d: DistrictRisk) => void;
  bounds: { north: number; south: number; east: number; west: number };
}

function getRiskColor(riskScore: number): string {
  const hue = Math.max(0, 40 - riskScore * 0.4);
  return `hsl(${hue} 90% 50%)`;
}

export default function RiskHeatMapClient({
  districts,
  selected,
  onSelect,
  bounds,
}: RiskHeatMapClientProps) {
  const mapRef = useRef<L.Map>(null);

  const mapBounds: L.LatLngBoundsExpression = [
    [bounds.south - 0.05, bounds.west - 0.05],
    [bounds.north + 0.05, bounds.east + 0.05],
  ];

  const center: [number, number] = [
    (bounds.south + bounds.north) / 2,
    (bounds.west + bounds.east) / 2,
  ];

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.fitBounds(mapBounds);
    }
  }, [mapBounds]);

  return (
    <MapContainer
      ref={mapRef}
      center={center}
      zoom={11}
      style={{ width: "100%", height: "100%", minHeight: "400px" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {districts.map((d) => {
        const radius = 10 + d.detections_7d / 6;
        const isSel = d.district === selected;
        const color = getRiskColor(d.risk_score);

        return (
          <CircleMarker
            key={d.district}
            center={[d.lat, d.lng]}
            radius={radius}
            fillColor={color}
            fillOpacity={0.55}
            stroke={isSel}
            color={isSel ? "white" : "transparent"}
            weight={isSel ? 2 : 0}
            eventHandlers={{
              click: () => onSelect(d),
            }}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{d.district}</p>
                <p className="text-xs">Risk: {d.risk_score}</p>
                <p className="text-xs">Detections 7d: {d.detections_7d}</p>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
