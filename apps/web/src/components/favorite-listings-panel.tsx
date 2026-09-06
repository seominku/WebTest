"use client";

import Link from "next/link";
import { useState } from "react";
import { ListingCard } from "./listing-card";
import { useAuth } from "./auth-provider";
import { useFavorites } from "./favorites-provider";

export function FavoriteListingsPanel() {
  const { user, loading: authLoading } = useAuth();
  const { items, loading } = useFavorites();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const selected = items
    .map((item) => item.id)
    .filter((id) => selectedIds.has(id));

  function toggleComparison(id: string) {
    setSelectionError(null);
    if (!selectedIds.has(id) && selected.length >= 3) {
      setSelectionError("비교할 매물은 최대 3개까지 선택할 수 있습니다.");
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (authLoading || loading) {
    return (
      <p className="rounded-2xl bg-white p-8 text-slate-500">
        관심 매물을 불러오는 중입니다…
      </p>
    );
  }
  if (!user) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center">
        <p className="text-slate-600">
          관심 매물은 로그인 후 이용할 수 있습니다.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white"
        >
          로그인
        </Link>
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
        <p className="font-bold text-slate-800">저장한 관심 매물이 없습니다.</p>
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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div>
          <p className="font-bold text-emerald-950">비교할 매물 선택</p>
          <p className="mt-1 text-sm text-emerald-800">
            2~3개를 선택하면 가격·면적·위치를 나란히 볼 수 있습니다.
          </p>
        </div>
        {selected.length >= 2 ? (
          <Link
            href={`/compare?ids=${encodeURIComponent(selected.join(","))}`}
            className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white"
          >
            선택한 {selected.length}개 비교
          </Link>
        ) : (
          <span className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-400">
            {selected.length}/3개 선택
          </span>
        )}
      </div>
      {selectionError && (
        <p
          role="alert"
          className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-700"
        >
          {selectionError}
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {items.map((listing) => {
          const checked = selectedIds.has(listing.id);
          return (
            <div key={listing.id}>
              <label
                className={`mb-2 flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition ${
                  checked
                    ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                    : "border-stone-200 bg-white text-slate-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && selected.length >= 3}
                  onChange={() => toggleComparison(listing.id)}
                  className="size-4 accent-emerald-700"
                />
                비교 선택
              </label>
              <ListingCard listing={listing} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
