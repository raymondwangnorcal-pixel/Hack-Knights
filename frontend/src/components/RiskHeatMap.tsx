"use client";

import dynamic from "next/dynamic";
import type { Detection, DistrictRisk } from "@/lib/types";

const RiskHeatMapClient = dynamic(() => import("./RiskHeatMapClient"), {
  ssr: false,
  loading: () => <div className="flex h-[480px] w-full items-center justify-center">Loading map…</div>,
});

interface RiskHeatMapProps {
  districts: DistrictRisk[];
  detections: Detection[];
  selected?: string;
  onSelect: (d: DistrictRisk) => void;
}

export default function RiskHeatMap(props: RiskHeatMapProps) {
  if (!props.districts.length) {
    return <div className="flex h-[480px] w-full items-center justify-center">No data</div>;
  }
  return <RiskHeatMapClient {...props} />;
}
