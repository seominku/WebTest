"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { AreaUnit } from "@/lib/area";

const STORAGE_KEY = "real-estate-area-unit-v1";
const CHANGE_EVENT = "real-estate-area-unit-change";
let fallbackAreaUnit: AreaUnit = "sqm";

interface AreaUnitContextValue {
  areaUnit: AreaUnit;
  setAreaUnit: (unit: AreaUnit) => void;
}

const AreaUnitContext = createContext<AreaUnitContextValue | null>(null);

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function getSnapshot(): AreaUnit {
  try {
    fallbackAreaUnit =
      window.localStorage.getItem(STORAGE_KEY) === "pyeong" ? "pyeong" : "sqm";
    return fallbackAreaUnit;
  } catch {
    return fallbackAreaUnit;
  }
}

function getServerSnapshot(): AreaUnit {
  return "sqm";
}

export function AreaUnitProvider({ children }: { children: React.ReactNode }) {
  const areaUnit = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const setAreaUnit = useCallback((unit: AreaUnit) => {
    fallbackAreaUnit = unit;
    try {
      window.localStorage.setItem(STORAGE_KEY, unit);
    } catch {
      // 저장소가 차단된 브라우저에서도 현재 화면 단위 전환은 알린다.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  const value = useMemo(
    () => ({ areaUnit, setAreaUnit }),
    [areaUnit, setAreaUnit],
  );
  return (
    <AreaUnitContext.Provider value={value}>
      {children}
    </AreaUnitContext.Provider>
  );
}

export function useAreaUnit(): AreaUnitContextValue {
  const value = useContext(AreaUnitContext);
  if (!value)
    throw new Error("useAreaUnit must be used inside AreaUnitProvider");
  return value;
}
