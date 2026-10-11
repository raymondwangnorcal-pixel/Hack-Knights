"use client";

import dynamic from "next/dynamic";
import type { MutableRefObject } from "react";
import type { City, MapFocus, MapView } from "@/lib/cities";
import type { DotPalette } from "@/lib/dotColors";
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
  /** Whole-country view only: a sideways drag or swipe asks for the next (+1) or previous (-1) country. */
  onSwipe?: (dir: 1 | -1) => void;
  focus?: MapFocus | null;
  /** Filled with a handle to read or jump the map's camera (see MapView). */
  viewRef?: MutableRefObject<MapView | null>;
  /** Colors of the detection dots (default: red). */
  dotPalette?: DotPalette;
  /** Shape of the city markers (default: dot). */
  cityMarker?: "dot" | "diamond";
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
