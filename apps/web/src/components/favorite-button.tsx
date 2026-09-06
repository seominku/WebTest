"use client";

import type { PublicListingSummary } from "@real-estate/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./auth-provider";
import { useFavorites } from "./favorites-provider";

export function FavoriteButton({ listing }: { listing: PublicListingSummary }) {
  const router = useRouter();
  const { user } = useAuth();
  const { isFavorite, pendingIds, toggle } = useFavorites();
  const [error, setError] = useState(false);
  const active = isFavorite(listing.id);
  const pending = pendingIds.has(listing.id);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!user) {
          router.push("/login");
          return;
        }
        setError(false);
        void toggle(listing).catch(() => setError(true));
      }}
      aria-label={
        error
          ? "관심 매물 저장 실패, 다시 시도"
          : active
            ? "관심 매물에서 제거"
            : "관심 매물로 저장"
      }
      aria-pressed={active}
      title={error ? "저장하지 못했습니다" : undefined}
      className={`grid size-10 place-items-center rounded-full border text-xl shadow-sm backdrop-blur transition disabled:opacity-50 ${
        active
          ? "border-rose-200 bg-rose-50 text-rose-600"
          : "border-white/60 bg-white/90 text-slate-500 hover:text-rose-600"
      }`}
    >
      {active ? "♥" : "♡"}
    </button>
  );
}
