"use client";

import type { PublicListingSummary } from "@real-estate/shared";
import Image from "next/image";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatListingPrice, propertyTypeLabels } from "@/lib/listing-format";
import { apiAssetUrl } from "@/lib/api";
import { sampleListingImages } from "@/lib/listing-images";
import { formatArea } from "@/lib/area";
import { useAreaUnit } from "./area-unit-provider";
import {
  focusListingOnMap,
  LISTING_MAP_FOCUS_EVENT,
} from "@/lib/listing-map-events";

interface LeafletMap {
  setView(center: [number, number], zoom: number): LeafletMap;
  fitBounds(
    bounds: [[number, number], [number, number]],
    options?: { padding: [number, number] },
  ): LeafletMap;
  remove(): void;
}

interface LeafletLayerGroup {
  addTo(map: LeafletMap): LeafletLayerGroup;
  addLayer(layer: unknown): LeafletLayerGroup;
  clearLayers(): void;
}

interface LeafletMarker {
  bindTooltip(text: string): LeafletMarker;
  on(event: "click", callback: () => void): LeafletMarker;
  openTooltip(): LeafletMarker;
}

interface LeafletApi {
  map(element: HTMLDivElement): LeafletMap;
  tileLayer(
    url: string,
    options: { attribution: string; maxZoom: number },
  ): { addTo(map: LeafletMap): void };
  marker(position: [number, number]): LeafletMarker & {
    addTo(map: LeafletMap): LeafletMarker;
  };
  markerClusterGroup(): LeafletLayerGroup;
  layerGroup(): LeafletLayerGroup;
  circleMarker(
    position: [number, number],
    options: {
      color: string;
      fillColor: string;
      fillOpacity: number;
      radius: number;
      weight: number;
    },
  ): {
    addTo(group: LeafletLayerGroup): LeafletMarker;
  };
}

type FacilityCategory = "subway" | "bus" | "convenience";

interface Facility {
  distanceMeters: number;
  id: string;
  latitude: number;
  longitude: number;
  name: string;
}

interface OverpassElement {
  center?: { lat: number; lon: number };
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  type: string;
}

const facilityOptions: Record<
  FacilityCategory,
  { color: string; fallbackName: string; label: string; query: string }
> = {
  subway: {
    color: "#2563eb",
    fallbackName: "지하철역",
    label: "지하철",
    query: 'node["railway"="station"]["station"="subway"]',
  },
  bus: {
    color: "#16a34a",
    fallbackName: "버스 정류장",
    label: "버스",
    query: 'node["highway"="bus_stop"]',
  },
  convenience: {
    color: "#ea580c",
    fallbackName: "편의점",
    label: "편의점",
    query: 'node["shop"="convenience"]',
  },
};

function distanceMeters(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = radians(toLatitude - fromLatitude);
  const longitudeDelta = radians(toLongitude - fromLongitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(fromLatitude)) *
      Math.cos(radians(toLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(
    earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
  );
}

async function fetchOverpassElements(
  query: string,
  signal: AbortSignal,
): Promise<OverpassElement[]> {
  const endpoints = [
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
  ];
  let lastError: unknown;

  for (const endpoint of endpoints) {
    const requestController = new AbortController();
    const abortRequest = () => requestController.abort();
    const timeout = window.setTimeout(abortRequest, 8_000);
    signal.addEventListener("abort", abortRequest, { once: true });
    try {
      const response = await fetch(endpoint, {
        body: `data=${encodeURIComponent(query)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
        signal: requestController.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { elements?: OverpassElement[] };
      return data.elements ?? [];
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
    } finally {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", abortRequest);
    }
  }
  throw lastError ?? new Error("Overpass request failed");
}

declare global {
  interface Window {
    L?: LeafletApi;
  }
}

export function ListingMap({ listings }: { listings: PublicListingSummary[] }) {
  const { areaUnit } = useAreaUnit();
  const mapElement = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const facilityLayer = useRef<LeafletLayerGroup | null>(null);
  const listingMarkers = useRef(new Map<string, LeafletMarker>());
  const [leafletReady, setLeafletReady] = useState(false);
  const [clusterReady, setClusterReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [selectedListing, setSelectedListing] =
    useState<PublicListingSummary | null>(null);
  const [facilityCategory, setFacilityCategory] =
    useState<FacilityCategory>("subway");
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(false);
  const [facilitiesError, setFacilitiesError] = useState<string | null>(null);
  const points = useMemo(
    () =>
      listings.filter(
        (listing) =>
          listing.location.latitude !== null &&
          listing.location.longitude !== null,
      ),
    [listings],
  );
  const selectedImage = selectedListing
    ? (selectedListing.primaryImagePath ??
      sampleListingImages(selectedListing.id)[0] ??
      null)
    : null;

  useEffect(() => {
    if (
      !leafletReady ||
      !clusterReady ||
      !mapElement.current ||
      !window.L ||
      typeof window.L.markerClusterGroup !== "function" ||
      !points.length
    )
      return;
    const L = window.L;
    const markers = listingMarkers.current;
    const map = L.map(mapElement.current).setView(
      [points[0]!.location.latitude!, points[0]!.location.longitude!],
      11,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    facilityLayer.current = L.layerGroup().addTo(map);
    const bounds = points.map(
      (listing) =>
        [listing.location.latitude!, listing.location.longitude!] as [
          number,
          number,
        ],
    );
    const markerGroup = L.markerClusterGroup().addTo(map);
    for (const listing of points) {
      const marker = L.marker([
        listing.location.latitude!,
        listing.location.longitude!,
      ]);
      marker
        .bindTooltip(
          `${formatListingPrice(listing.transactionType, listing.price)} · ${formatArea(listing.property.areaSquareMeters, areaUnit)}\n${listing.title}`,
        )
        .on("click", () => {
          setSelectedListing(listing);
          focusListingOnMap(listing.id);
        });
      markerGroup.addLayer(marker);
      markers.set(listing.id, marker);
    }
    if (bounds.length > 1) {
      map.fitBounds(
        [
          [
            Math.min(...bounds.map(([lat]) => lat)),
            Math.min(...bounds.map(([, lng]) => lng)),
          ],
          [
            Math.max(...bounds.map(([lat]) => lat)),
            Math.max(...bounds.map(([, lng]) => lng)),
          ],
        ],
        { padding: [30, 30] },
      );
    }
    mapInstance.current = map;
    return () => {
      map.remove();
      mapInstance.current = null;
      facilityLayer.current = null;
      markers.clear();
    };
  }, [areaUnit, clusterReady, leafletReady, points]);

  useEffect(() => {
    const handleFocus = (event: Event) => {
      const listingId = (event as CustomEvent<{ listingId: string }>).detail
        .listingId;
      const listing = points.find((candidate) => candidate.id === listingId);
      if (!listing) return;
      setSelectedListing(listing);
      mapInstance.current?.setView(
        [listing.location.latitude!, listing.location.longitude!],
        17,
      );
      window.setTimeout(() => {
        listingMarkers.current.get(listingId)?.openTooltip();
      }, 350);
    };
    window.addEventListener(LISTING_MAP_FOCUS_EVENT, handleFocus);
    return () =>
      window.removeEventListener(LISTING_MAP_FOCUS_EVENT, handleFocus);
  }, [points]);

  useEffect(() => {
    const layer = facilityLayer.current;
    const L = window.L;
    if (!selectedListing || !layer || !L) return;

    const latitude = selectedListing.location.latitude!;
    const longitude = selectedListing.location.longitude!;
    const option = facilityOptions[facilityCategory];
    const controller = new AbortController();
    layer.clearLayers();
    setFacilities([]);
    setFacilitiesError(null);
    setFacilitiesLoading(true);

    const query = `[out:json][timeout:10];${option.query}(around:800,${latitude},${longitude});out 30;`;
    void fetchOverpassElements(query, controller.signal)
      .then((elements) => {
        const found = elements
          .map((element): Facility | null => {
            const lat = element.lat ?? element.center?.lat;
            const lon = element.lon ?? element.center?.lon;
            if (lat === undefined || lon === undefined) return null;
            return {
              distanceMeters: distanceMeters(latitude, longitude, lat, lon),
              id: `${element.type}-${element.id}`,
              latitude: lat,
              longitude: lon,
              name: element.tags?.name ?? option.fallbackName,
            };
          })
          .filter((facility): facility is Facility => facility !== null)
          .sort((a, b) => a.distanceMeters - b.distanceMeters)
          .slice(0, 20);

        layer.clearLayers();
        for (const facility of found) {
          L.circleMarker([facility.latitude, facility.longitude], {
            color: "#ffffff",
            fillColor: option.color,
            fillOpacity: 0.95,
            radius: 7,
            weight: 2,
          })
            .addTo(layer)
            .bindTooltip(
              `${facility.name} · ${facility.distanceMeters.toLocaleString("ko-KR")}m`,
            );
        }
        setFacilities(found);
        mapInstance.current?.setView([latitude, longitude], 15);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setFacilitiesError(
          "주변 시설 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setFacilitiesLoading(false);
      });

    return () => controller.abort();
  }, [facilityCategory, selectedListing]);

  if (!points.length) return null;
  return (
    <section
      id="listing-map"
      className="mt-8 min-w-0 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm"
    >
      <Script
        src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        strategy="afterInteractive"
        onReady={() => setLeafletReady(true)}
        onError={() => setMapError(true)}
      />
      {leafletReady && (
        <Script
          src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"
          strategy="afterInteractive"
          onReady={() => {
            const ready = typeof window.L?.markerClusterGroup === "function";
            setClusterReady(ready);
            setMapError(!ready);
          }}
          onError={() => setMapError(true)}
        />
      )}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      />
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"
      />
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css"
      />
      <div className="border-b border-stone-200 px-5 py-4">
        <h2 className="text-xl font-bold">지도에서 매물 보기</h2>
        <p className="mt-1 text-sm text-slate-500">
          지도를 확대·축소하거나 마커를 클릭해 매물 상세를 확인하세요.
        </p>
      </div>
      <div
        className={`grid min-w-0 grid-cols-1 ${selectedListing ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}
      >
        <div
          ref={mapElement}
          className="h-[420px] min-w-0 w-full bg-stone-100"
          aria-label="공개 매물 위치 지도"
        />
        {selectedListing && (
          <aside
            className="min-w-0 border-t border-stone-200 bg-white p-5 lg:max-h-[420px] lg:overflow-y-auto lg:border-l lg:border-t-0"
            aria-label="선택한 매물 정보"
          >
            <div className="relative mb-4 h-44 overflow-hidden rounded-2xl bg-stone-100">
              {selectedImage ? (
                <Image
                  crossOrigin="anonymous"
                  src={
                    selectedImage.startsWith("/sample-listings/")
                      ? selectedImage
                      : apiAssetUrl(selectedImage)
                  }
                  alt={`${selectedListing.title} 대표 사진`}
                  fill
                  sizes="320px"
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <div className="flex h-44 items-center justify-center text-sm text-slate-400">
                  등록된 대표 사진이 없습니다
                </div>
              )}
              {selectedImage?.startsWith("/sample-listings/") && (
                <span className="absolute bottom-2 left-2 rounded-full bg-slate-950/70 px-2.5 py-1 text-[11px] font-bold text-white">
                  샘플 이미지
                </span>
              )}
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-emerald-700">
                  선택한 매물
                </p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  {selectedListing.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedListing(null)}
                className="grid size-11 shrink-0 place-items-center rounded-lg text-xl leading-none text-slate-500 hover:bg-stone-100"
                aria-label="매물 정보 닫기"
              >
                ×
              </button>
            </div>
            <p className="mt-4 text-base font-semibold text-slate-900">
              {formatListingPrice(
                selectedListing.transactionType,
                selectedListing.price,
              )}
            </p>
            <dl className="mt-3 grid gap-2 text-sm text-slate-600">
              <div className="flex justify-between gap-3">
                <dt>전용면적</dt>
                <dd>
                  {formatArea(
                    selectedListing.property.areaSquareMeters,
                    areaUnit,
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>매물 유형</dt>
                <dd>{propertyTypeLabels[selectedListing.property.type]}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>공개 위치</dt>
                <dd>
                  {selectedListing.location.sigungu}{" "}
                  {selectedListing.location.eupmyeondong}
                </dd>
              </div>
            </dl>
            <div className="mt-5 border-t border-stone-200 pt-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900">
                  주변 800m 시설
                </h4>
                {!facilitiesLoading && !facilitiesError && (
                  <span className="text-xs text-slate-500">
                    {facilities.length}곳
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(Object.keys(facilityOptions) as FacilityCategory[]).map(
                  (category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setFacilityCategory(category)}
                      className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                        facilityCategory === category
                          ? "bg-slate-900 text-white"
                          : "bg-stone-100 text-slate-600 hover:bg-stone-200"
                      }`}
                    >
                      {facilityOptions[category].label}
                    </button>
                  ),
                )}
              </div>
              {facilitiesLoading && (
                <p className="mt-3 text-xs text-slate-500">
                  주변 시설을 찾는 중입니다…
                </p>
              )}
              {facilitiesError && (
                <p className="mt-3 text-xs text-red-600">{facilitiesError}</p>
              )}
              {!facilitiesLoading && !facilitiesError && (
                <ul className="mt-3 grid gap-2">
                  {facilities.slice(0, 5).map((facility) => (
                    <li
                      key={facility.id}
                      className="flex justify-between gap-3 text-xs text-slate-600"
                    >
                      <span className="truncate">{facility.name}</span>
                      <span className="shrink-0 font-semibold">
                        {facility.distanceMeters.toLocaleString("ko-KR")}m
                      </span>
                    </li>
                  ))}
                  {!facilities.length && (
                    <li className="text-xs text-slate-500">
                      반경 안에서 확인된 시설이 없습니다.
                    </li>
                  )}
                </ul>
              )}
              <p className="mt-3 text-[11px] leading-4 text-slate-400">
                OpenStreetMap 등록 정보를 기준으로 하며 실제 운영 여부와 다를 수
                있습니다.
              </p>
            </div>
            <a
              href={`/listings/${selectedListing.id}`}
              className="mt-5 block rounded-xl bg-emerald-700 px-4 py-3 text-center text-sm font-bold text-white hover:bg-emerald-800"
            >
              상세 매물 보기
            </a>
          </aside>
        )}
      </div>
      {mapError ? (
        <p
          role="alert"
          className="border-t border-stone-200 px-5 py-3 text-xs text-red-700"
        >
          지도를 불러오지 못했습니다. 페이지를 새로고침해 주세요. 아래 매물
          목록은 계속 이용할 수 있습니다.
        </p>
      ) : (
        (!leafletReady || !clusterReady) && (
          <p className="border-t border-stone-200 px-5 py-3 text-xs text-slate-500">
            지도 타일을 불러오는 중입니다…
          </p>
        )
      )}
      <p className="border-t border-stone-200 px-5 py-3 text-xs text-slate-500">
        표시 위치는 개인정보 보호를 위한 공개용 근사 좌표입니다.
      </p>
    </section>
  );
}
