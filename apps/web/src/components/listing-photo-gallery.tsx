"use client";

import { useState } from "react";
import { apiAssetUrl } from "@/lib/api";
import { isSampleListingImage } from "@/lib/listing-images";

export function ListingPhotoGallery({
  images,
  title,
}: {
  images: string[];
  title: string;
}) {
  const [selected, setSelected] = useState(0);
  const current = images[selected];
  if (!current) return null;
  const sample = isSampleListingImage(current);

  function move(offset: number) {
    setSelected((value) => (value + offset + images.length) % images.length);
  }

  return (
    <div className="min-w-0 w-full max-w-full">
      <div className="relative aspect-[4/3] max-h-[640px] overflow-hidden bg-slate-900 sm:aspect-[16/9]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          crossOrigin="anonymous"
          src={imageUrl(current)}
          alt={`${title} 사진 ${selected + 1}`}
          className="size-full object-cover"
        />
        {sample && (
          <span className="absolute left-3 top-3 rounded-full bg-slate-950/75 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur sm:left-4 sm:top-4 sm:px-3 sm:text-xs">
            연출된 샘플 이미지
          </span>
        )}
        <span className="absolute bottom-3 right-3 rounded-full bg-slate-950/75 px-3 py-1 text-xs font-bold text-white sm:bottom-4 sm:right-4">
          {selected + 1} / {images.length}
        </span>
        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="이전 사진"
              onClick={() => move(-1)}
              className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-2xl font-bold text-slate-900 shadow sm:left-4"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="다음 사진"
              onClick={() => move(1)}
              className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-2xl font-bold text-slate-900 shadow sm:right-4"
            >
              ›
            </button>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto bg-slate-950 p-3 sm:justify-center">
          {images.map((path, index) => (
            <button
              key={path}
              type="button"
              onClick={() => setSelected(index)}
              aria-label={`${index + 1}번 사진 보기`}
              aria-current={index === selected ? "true" : undefined}
              className="h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 border-transparent opacity-70 transition aria-[current=true]:border-emerald-300 aria-[current=true]:opacity-100 sm:h-20 sm:w-32"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                crossOrigin="anonymous"
                src={imageUrl(path)}
                alt=""
                className="size-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function imageUrl(path: string): string {
  return isSampleListingImage(path) ? path : apiAssetUrl(path);
}
