"use client";

import type {
  SavedSearchMatchesResponse,
  SavedSearchSummary,
  SavedSearchesResponse,
  PaginationMeta,
} from "@real-estate/shared";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import {
  propertyTypeLabels,
  transactionTypeLabels,
} from "@/lib/listing-format";
import { notifySavedSearchNotificationsUpdated } from "@/lib/saved-search-events";
import { ListingCard } from "./listing-card";
import { useAuth } from "./auth-provider";
import { formatArea } from "@/lib/area";
import { useAreaUnit } from "./area-unit-provider";

export function SavedSearchesPanel() {
  const { areaUnit } = useAreaUnit();
  const { authenticatedRequest, loading, user } = useAuth();
  const [searches, setSearches] = useState<SavedSearchSummary[] | null>(null);
  const [matches, setMatches] = useState<
    SavedSearchMatchesResponse["items"] | null
  >(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matchPage, setMatchPage] = useState(1);
  const [matchPagination, setMatchPagination] = useState<PaginationMeta | null>(
    null,
  );

  const load = useCallback(async () => {
    const [saved, matched] = await Promise.all([
      apiRequest<SavedSearchesResponse>("/saved-searches"),
      apiRequest<SavedSearchMatchesResponse>(
        `/saved-searches/matches?page=${matchPage}`,
      ),
    ]);
    setSearches(saved.items);
    setMatches(matched.items);
    setMatchPagination(matched.pagination);
  }, [matchPage]);

  useEffect(() => {
    if (loading || !user) return;
    let active = true;
    void Promise.all([
      apiRequest<SavedSearchesResponse>("/saved-searches"),
      apiRequest<SavedSearchMatchesResponse>(
        `/saved-searches/matches?page=${matchPage}`,
      ),
    ])
      .then(([saved, matched]) => {
        if (!active) return;
        setSearches(saved.items);
        setMatches(matched.items);
        setMatchPagination(matched.pagination);
      })
      .catch(() => active && setError("저장 검색을 불러오지 못했습니다."));
    return () => {
      active = false;
    };
  }, [loading, matchPage, user]);

  async function remove(id: string) {
    setPendingId(id);
    setError(null);
    try {
      await authenticatedRequest(`/saved-searches/${id}`, {
        body: "{}",
        method: "DELETE",
      });
      await load();
    } catch {
      setError("저장 검색을 삭제하지 못했습니다.");
    } finally {
      setPendingId(null);
    }
  }

  async function markAllMatchesViewed() {
    setPendingId("mark-viewed");
    setError(null);
    try {
      await authenticatedRequest("/saved-searches/matches/viewed", {
        body: "{}",
        method: "POST",
      });
      notifySavedSearchNotificationsUpdated();
      await load();
    } catch {
      setError("새 매물 알림 읽음 상태를 저장하지 못했습니다.");
    } finally {
      setPendingId(null);
    }
  }

  if (loading) return <p className="text-slate-500">계정을 확인하는 중…</p>;
  if (!user)
    return (
      <p className="rounded-2xl border bg-white p-8 text-center">
        <Link href="/login" className="font-bold text-emerald-800 underline">
          로그인
        </Link>
        후 검색 조건과 새 매물 알림을 확인할 수 있습니다.
      </p>
    );

  return (
    <div>
      <p className="font-mono text-xs font-bold tracking-[0.18em] text-emerald-700">
        SAVED SEARCHES
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">
        저장 검색과 새 매물
      </h1>
      <p className="mt-2 text-slate-600">
        자주 쓰는 조건을 다시 적용하고, 저장 후 새로 공개된 일치 매물을
        확인하세요.
      </p>
      {error && (
        <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">
          {error}
        </p>
      )}

      <section className="mt-9">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">저장한 조건</h2>
          <Link href="/listings" className="text-sm font-bold text-emerald-800">
            매물 검색으로 이동
          </Link>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {searches === null ? (
            <p className="text-slate-500">불러오는 중…</p>
          ) : searches.length === 0 ? (
            <p className="rounded-2xl border border-dashed bg-white p-8 text-center text-slate-500 md:col-span-2">
              아직 저장한 검색 조건이 없습니다.
            </p>
          ) : (
            searches.map((search) => (
              <article
                key={search.id}
                className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{search.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {describeFilters(search, areaUnit)}
                    </p>
                  </div>
                  {search.unreadMatchCount > 0 && (
                    <span className="shrink-0 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
                      새 매물 {search.unreadMatchCount}
                    </span>
                  )}
                </div>
                <div className="mt-5 flex gap-2">
                  <Link
                    href={searchUrl(search)}
                    className="min-h-11 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white"
                  >
                    조건 적용
                  </Link>
                  <button
                    type="button"
                    disabled={pendingId === search.id}
                    onClick={() => remove(search.id)}
                    className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-bold disabled:opacity-60"
                  >
                    삭제
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">최근 일치한 새 매물</h2>
          {(searches?.reduce(
            (total, search) => total + search.unreadMatchCount,
            0,
          ) ?? 0) > 0 && (
            <button
              type="button"
              disabled={pendingId === "mark-viewed"}
              onClick={() => void markAllMatchesViewed()}
              className="min-h-11 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-bold text-emerald-800 disabled:opacity-60"
            >
              새 매물 알림 모두 읽음
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          외부 전송 없이 이 화면과 상단 숫자 배지에만 알립니다.
        </p>
        {matches === null ? (
          <p className="mt-4 text-slate-500">불러오는 중…</p>
        ) : matches.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed bg-white p-8 text-center text-slate-500">
            저장 이후 새로 공개된 일치 매물이 아직 없습니다.
          </p>
        ) : (
          <div className="mt-5 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {matches.map((match) => (
              <div key={match.id}>
                <p className="mb-2 text-xs font-bold text-emerald-700">
                  ‘{match.savedSearch.name}’ 조건과 일치
                </p>
                <ListingCard listing={match.listing} />
              </div>
            ))}
          </div>
        )}
        <MatchesPagination
          pagination={matchPagination}
          onPageChange={setMatchPage}
        />
      </section>
    </div>
  );
}

function MatchesPagination({
  onPageChange,
  pagination,
}: {
  onPageChange: (page: number) => void;
  pagination: PaginationMeta | null;
}) {
  if (!pagination || pagination.totalPages <= 1) return null;
  return (
    <nav
      aria-label="새 매물 알림 페이지"
      className="mt-7 flex items-center justify-center gap-3"
    >
      <button
        type="button"
        disabled={pagination.page <= 1}
        onClick={() => onPageChange(pagination.page - 1)}
        className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm font-bold disabled:opacity-40"
      >
        이전
      </button>
      <span className="text-sm text-slate-500">
        {pagination.page} / {pagination.totalPages}
      </span>
      <button
        type="button"
        disabled={pagination.page >= pagination.totalPages}
        onClick={() => onPageChange(pagination.page + 1)}
        className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm font-bold disabled:opacity-40"
      >
        다음
      </button>
    </nav>
  );
}

function searchUrl(search: SavedSearchSummary): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search.filters)) {
    if (value && !(key === "sort" && value === "LATEST")) query.set(key, value);
  }
  return `/listings${query.size ? `?${query}` : ""}`;
}

function describeFilters(
  search: SavedSearchSummary,
  areaUnit: "sqm" | "pyeong",
): string {
  const f = search.filters;
  const parts = [
    f.transactionType ? transactionTypeLabels[f.transactionType] : "전체 거래",
    f.propertyType ? propertyTypeLabels[f.propertyType] : "전체 유형",
    [f.sido, f.sigungu].filter(Boolean).join(" ") || "전국",
  ];
  if (f.minPriceManwon || f.maxPriceManwon)
    parts.push(
      `${f.minPriceManwon ?? "0"}~${f.maxPriceManwon ?? "제한 없음"}만원`,
    );
  if (f.minAreaSquareMeters || f.maxAreaSquareMeters)
    parts.push(
      `${f.minAreaSquareMeters ? formatArea(f.minAreaSquareMeters, areaUnit) : `0${areaUnit === "sqm" ? "㎡" : "평"}`}~${f.maxAreaSquareMeters ? formatArea(f.maxAreaSquareMeters, areaUnit) : "제한 없음"}`,
    );
  return parts.join(" · ");
}
