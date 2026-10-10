"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { DistrictRisk } from "@/lib/types";

const DynamicMap = dynamic(() => import("./RiskHeatMapClient"), {
  ssr: false,
  loading: () => <div className="w-full h-96 bg-background rounded-lg flex items-center justify-center">Loading map…</div>,
});

interface RiskHeatMapProps {
  districts: DistrictRisk[];
  selected?: string;
  onSelect: (d: DistrictRisk) => void;
}

export default function RiskHeatMap({ districts, selected, onSelect }: RiskHeatMapProps) {
  const bounds = useMemo(() => {
    if (!districts.length) return null;
    const lats = districts.map((d) => d.lat);
    const lngs = districts.map((d) => d.lng);
    return {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lngs),
      west: Math.min(...lngs),
    };
  }, [districts]);

  if (!bounds) {
    return <div className="w-full h-96 bg-background rounded-lg flex items-center justify-center">No data</div>;
  }

  return (
    <DynamicMap
      districts={districts}
      selected={selected}
      onSelect={onSelect}
      bounds={bounds}
    />
  );
}
