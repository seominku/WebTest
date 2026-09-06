"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  clearRecentListings,
  getRecentListings,
  type RecentListingEntry,
  RECENT_LISTINGS_UPDATED,
  removeRecentListing,
} from "@/lib/recent-listings";
import { ListingCard } from "./listing-card";

export function RecentListingsPanel() {
  const [entries, setEntries] = useState<RecentListingEntry[] | null>(null);

  useEffect(() => {
    const refresh = () => setEntries(getRecentListings());
    const initial = window.setTimeout(refresh, 0);
    window.addEventListener("storage", refresh);
    window.addEventListener(RECENT_LISTINGS_UPDATED, refresh);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("storage", refresh);
      window.removeEventListener(RECENT_LISTINGS_UPDATED, refresh);
    };
  }, []);

  if (entries === null) {
    return <p className="text-slate-500">최근 본 매물을 불러오는 중…</p>;
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
        <p className="font-bold text-slate-800">최근 본 매물이 없습니다.</p>
        <Link
          href="/listings"
          className="mt-3 inline-block text-sm font-semibold text-emerald-700 underline underline-offset-4"
        >
          매물 찾아보기
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">
          현재 브라우저에 최근 {entries.length}개가 저장되어 있습니다.
        </p>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("최근 본 매물 기록을 모두 삭제할까요?")) {
              clearRecentListings();
            }
          }}
          className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-slate-700 hover:border-red-300 hover:text-red-700"
        >
          전체 기록 삭제
        </button>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <div key={entry.listing.id} className="relative">
            <ListingCard listing={entry.listing} />
            <div className="mt-2 flex items-center justify-between gap-3 px-1 text-xs text-slate-500">
              <span>{formatViewedAt(entry.viewedAt)} 확인</span>
              <button
                type="button"
                onClick={() => removeRecentListing(entry.listing.id)}
                className="font-semibold text-slate-600 underline underline-offset-2 hover:text-red-700"
                aria-label={`${entry.listing.title} 최근 기록 삭제`}
              >
                기록 삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatViewedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "최근";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
