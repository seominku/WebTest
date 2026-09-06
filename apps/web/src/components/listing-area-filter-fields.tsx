"use client";

import { useState } from "react";
import { areaInputToSquareMeters, areaInputValue } from "@/lib/area";
import { useAreaUnit } from "./area-unit-provider";

export function ListingAreaFilterFields({
  initialMaximum,
  initialMinimum,
}: {
  initialMaximum?: string;
  initialMinimum?: string;
}) {
  const { areaUnit } = useAreaUnit();
  const [minimumSquareMeters, setMinimumSquareMeters] = useState(
    initialMinimum ?? "",
  );
  const [maximumSquareMeters, setMaximumSquareMeters] = useState(
    initialMaximum ?? "",
  );
  const unitLabel = areaUnit === "sqm" ? "㎡" : "평";

  return (
    <>
      <AreaFilterField
        kind="최소"
        canonicalValue={minimumSquareMeters}
        name="minAreaSquareMeters"
        onChange={setMinimumSquareMeters}
        unit={areaUnit}
        unitLabel={unitLabel}
      />
      <AreaFilterField
        kind="최대"
        canonicalValue={maximumSquareMeters}
        name="maxAreaSquareMeters"
        onChange={setMaximumSquareMeters}
        unit={areaUnit}
        unitLabel={unitLabel}
      />
    </>
  );
}

function AreaFilterField({
  canonicalValue,
  kind,
  name,
  onChange,
  unit,
  unitLabel,
}: {
  canonicalValue: string;
  kind: "최소" | "최대";
  name: string;
  onChange: (value: string) => void;
  unit: "sqm" | "pyeong";
  unitLabel: string;
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700">
      {kind} 전용면적
      <input type="hidden" name={name} value={canonicalValue} />
      <div className="flex min-w-0 items-center rounded-xl border border-stone-300 bg-white pr-3">
        <input
          type="number"
          min="0"
          step={unit === "sqm" ? "0.01" : "0.1"}
          inputMode="decimal"
          value={areaInputValue(canonicalValue, unit)}
          onChange={(event) =>
            onChange(areaInputToSquareMeters(event.target.value, unit))
          }
          placeholder={
            unit === "sqm"
              ? kind === "최소"
                ? "예: 59"
                : "예: 85"
              : kind === "최소"
                ? "예: 18"
                : "예: 25.7"
          }
          aria-label={`${kind} 전용면적 ${unitLabel}`}
          className="min-w-0 flex-1 rounded-xl px-3 py-3 font-normal outline-none"
        />
        <span className="text-xs text-slate-500">{unitLabel}</span>
      </div>
      {areaUnitHelp(unit)}
    </label>
  );
}

function areaUnitHelp(unit: "sqm" | "pyeong") {
  return (
    <span className="text-xs font-normal text-slate-400">
      {unit === "pyeong"
        ? "검색 시 ㎡로 자동 변환됩니다."
        : "소수점 둘째 자리까지 입력할 수 있습니다."}
    </span>
  );
}
