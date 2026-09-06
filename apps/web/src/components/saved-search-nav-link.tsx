"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { SAVED_SEARCH_NOTIFICATIONS_UPDATED } from "@/lib/saved-search-events";
import { useAuth } from "./auth-provider";

const REFRESH_INTERVAL_MS = 60_000;

export function SavedSearchNavLink() {
  const { user } = useAuth();
  const [result, setResult] = useState({ count: 0, userId: "" });
  const count = user && result.userId === user.id ? result.count : 0;

  const refresh = useCallback(() => {
    if (!user) return;
    void apiRequest<{ count: number }>("/saved-searches/unread-count")
      .then(({ count: nextCount }) =>
        setResult({ count: nextCount, userId: user.id }),
      )
      .catch(() => undefined);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refresh();
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    window.addEventListener(SAVED_SEARCH_NOTIFICATIONS_UPDATED, refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(SAVED_SEARCH_NOTIFICATIONS_UPDATED, refresh);
    };
  }, [refresh, user]);

  return (
    <Link
      href="/saved-searches"
      aria-label={count ? `저장 검색, 새 매물 ${count}개` : undefined}
      className="relative px-3 py-2 text-sm font-semibold text-slate-700 hover:text-emerald-700"
    >
      저장 검색
      {count > 0 && (
        <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold leading-4 text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
