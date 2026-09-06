"use client";

import { useAreaUnit } from "./area-unit-provider";

export function AreaUnitToggle({ className = "" }: { className?: string }) {
  const { areaUnit, setAreaUnit } = useAreaUnit();
  return (
    <div
      role="group"
      aria-label="전용면적 표시 단위"
      className={`inline-flex rounded-xl border border-stone-300 bg-stone-100 p-1 ${className}`}
    >
      <UnitButton
        active={areaUnit === "sqm"}
        label="제곱미터"
        onClick={() => setAreaUnit("sqm")}
      >
        ㎡
      </UnitButton>
      <UnitButton
        active={areaUnit === "pyeong"}
        label="평수"
        onClick={() => setAreaUnit("pyeong")}
      >
        평
      </UnitButton>
    </div>
  );
}

function UnitButton({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${label}로 표시`}
      aria-pressed={active}
      onClick={onClick}
      className="min-h-8 min-w-9 rounded-lg px-2 text-xs font-bold text-slate-500 transition aria-pressed:bg-white aria-pressed:text-emerald-800 aria-pressed:shadow-sm"
    >
      {children}
    </button>
  );
}
