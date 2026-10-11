"use client";

import dynamic from "next/dynamic";
import type { City, MapFocus } from "@/lib/cities";
import type { Detection, DistrictRisk } from "@/lib/types";

const RiskHeatMapClient = dynamic(() => import("./RiskHeatMapClient"), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center">Loading map…</div>,
});

interface RiskHeatMapProps {
  districts: DistrictRisk[];
  detections: Detection[];
  selected?: string;
  onSelect: (d: DistrictRisk) => void;
  onCitySelect: (c: City) => void;
  focus?: MapFocus | null;
  /** Map height in px (default: fill the parent). */
  height?: number | string;
}

export default function RiskHeatMap(props: RiskHeatMapProps) {
  if (!props.districts.length) {
    return (
      <div className="flex w-full items-center justify-center" style={{ height: props.height ?? "100%" }}>
        No data
      </div>
    );
  }
  return <RiskHeatMapClient key={props.districts[0].country} {...props} />;
}
