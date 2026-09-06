export type AreaUnit = "sqm" | "pyeong";

export const SQUARE_METERS_PER_PYEONG = 3.305785;

export function squareMetersToPyeong(squareMeters: string | number): number {
  return Number(squareMeters) / SQUARE_METERS_PER_PYEONG;
}

export function pyeongToSquareMeters(pyeong: string | number): number {
  return Number(pyeong) * SQUARE_METERS_PER_PYEONG;
}

export function formatArea(
  squareMeters: string | number,
  unit: AreaUnit,
): string {
  const value = Number(squareMeters);
  if (!Number.isFinite(value)) return "-";
  if (unit === "pyeong") {
    return `${squareMetersToPyeong(value).toFixed(1)}평`;
  }
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}㎡`;
}

export function areaInputValue(
  squareMeters: string | undefined,
  unit: AreaUnit,
): string {
  if (!squareMeters) return "";
  if (unit === "sqm") return squareMeters;
  return String(round(squareMetersToPyeong(squareMeters), 1));
}

export function areaInputToSquareMeters(value: string, unit: AreaUnit): string {
  if (!value) return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return unit === "sqm"
    ? value
    : String(round(pyeongToSquareMeters(number), 2));
}

function round(value: number, digits: number): number {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}
