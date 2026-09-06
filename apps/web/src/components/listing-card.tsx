"use client";

import type { PublicListingSummary } from "@real-estate/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiAssetUrl } from "@/lib/api";
import {
  focusListingOnMap,
  LISTING_MAP_FOCUS_EVENT,
} from "@/lib/listing-map-events";
import {
  formatListingPrice,
  propertyTypeLabels,
  transactionTypeLabels,
} from "@/lib/listing-format";
import { FavoriteButton } from "./favorite-button";
import { sampleListingImages } from "@/lib/listing-images";
import { formatArea } from "@/lib/area";
import { useAreaUnit } from "./area-unit-provider";

export function ListingCard({
  listing,
  showMapAction = false,
}: {
  listing: PublicListingSummary;
  showMapAction?: boolean;
}) {
  const [highlighted, setHighlighted] = useState(false);
  const { areaUnit } = useAreaUnit();
  const displayImage =
    listing.primaryImagePath ?? sampleListingImages(listing.id)[0] ?? null;

  useEffect(() => {
    const handleFocus = (event: Event) => {
      const selectedId = (event as CustomEvent<{ listingId: string }>).detail
        .listingId;
      setHighlighted(selectedId === listing.id);
    };
    window.addEventListener(LISTING_MAP_FOCUS_EVENT, handleFocus);
    return () =>
      window.removeEventListener(LISTING_MAP_FOCUS_EVENT, handleFocus);
  }, [listing.id]);

  return (
    <article
      id={`listing-card-${listing.id}`}
      className={`group relative overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/60 ${
        highlighted
          ? "border-emerald-600 ring-4 ring-emerald-100"
          : "border-stone-200"
      }`}
    >
      <Link href={`/listings/${listing.id}`} className="block">
        <div className="relative grid aspect-[16/10] place-items-center overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-800 to-teal-600 text-white">
          {displayImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              crossOrigin="anonymous"
              src={
                displayImage.startsWith("/sample-listings/")
                  ? displayImage
                  : apiAssetUrl(displayImage)
              }
              alt=""
              className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105"
            />
          )}
          <span className="absolute left-5 top-5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
            {transactionTypeLabels[listing.transactionType]}
          </span>
          <div className={`text-center ${displayImage ? "sr-only" : ""}`}>
            <p className="font-mono text-xs tracking-[0.2em] text-emerald-100">
              VERIFIED LISTING
            </p>
            <p className="mt-3 text-2xl font-bold">
              {propertyTypeLabels[listing.property.type]}
            </p>
          </div>
          {!displayImage && (
            <span className="absolute bottom-4 right-5 text-xs text-emerald-100">
              이미지 준비 중
            </span>
          )}
          {displayImage?.startsWith("/sample-listings/") && (
            <span className="absolute bottom-4 left-5 rounded-full bg-slate-950/65 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
              샘플 이미지
            </span>
          )}
        </div>
        <div className="p-6">
          <p className="text-sm font-semibold text-emerald-700">
            {listing.location.sido} {listing.location.sigungu}{" "}
            {listing.location.eupmyeondong}
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950 group-hover:text-emerald-800">
            {listing.title}
          </h2>
          <p className="mt-4 text-lg font-bold text-slate-950">
            {formatListingPrice(listing.transactionType, listing.price)}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {formatArea(listing.property.areaSquareMeters, areaUnit)}
            {listing.property.floor !== null
              ? ` · ${listing.property.floor}층`
              : ""}
            {listing.property.rooms !== null
              ? ` · 방 ${listing.property.rooms}`
              : ""}
          </p>
          <p className="mt-5 line-clamp-2 leading-6 text-slate-600">
            {listing.summary}
          </p>
        </div>
      </Link>
      <div className="absolute right-5 top-5 z-10">
        <FavoriteButton listing={listing} />
      </div>
      {showMapAction &&
        listing.location.latitude !== null &&
        listing.location.longitude !== null && (
          <button
            type="button"
            onClick={() => {
              focusListingOnMap(listing.id);
              document
                .getElementById("listing-map")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="w-full border-t border-stone-200 px-6 py-3 text-left text-sm font-bold text-emerald-700 hover:bg-emerald-50"
          >
            지도에서 위치 보기
          </button>
        )}
    </article>
  );
}
