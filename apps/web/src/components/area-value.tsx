"use client";

import { formatArea } from "@/lib/area";
import { useAreaUnit } from "./area-unit-provider";

export function AreaValue({ squareMeters }: { squareMeters: string | number }) {
  const { areaUnit } = useAreaUnit();
  return <>{formatArea(squareMeters, areaUnit)}</>;
}
