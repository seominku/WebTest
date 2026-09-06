"use client";

import Link from "next/link";
import { useState } from "react";
import type { SavedSearchSummary } from "@real-estate/shared";
import { useAuth } from "./auth-provider";

interface SavableFilters {
  maxAreaSquareMeters?: string;
  maxPriceManwon?: string;
  minAreaSquareMeters?: string;
  minPriceManwon?: string;
  propertyType?: string;
  sido?: string;
  sigungu?: string;
  sort?: string;
  transactionType?: string;
}

export function SaveSearchButton({ filters }: { filters: SavableFilters }) {
  const { authenticatedRequest, loading, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName(filters));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (loading) return null;
  if (!user) {
    return (
      <Link href="/login" className="text-sm font-bold text-emerald-800">
        로그인하고 조건 저장
      </Link>
    );
  }

  async function save() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setMessage("저장할 검색의 이름을 입력해 주세요.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      await authenticatedRequest<SavedSearchSummary>("/saved-searches", {
        body: JSON.stringify({
          ...Object.fromEntries(
            Object.entries(filters).filter(([, value]) => value),
          ),
          name: trimmedName,
          sort: filters.sort || "LATEST",
        }),
        method: "POST",
      });
      setMessage("검색 조건을 저장했습니다.");
      setOpen(false);
    } catch {
      setMessage("검색 조건을 저장하지 못했습니다. 입력값을 확인해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {message && (
        <span aria-live="polite" className="text-sm text-slate-600">
          {message}{" "}
          {message.includes("저장했습니다") && (
            <Link href="/saved-searches" className="font-bold underline">
              확인
            </Link>
          )}
        </span>
      )}
      {open ? (
        <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
          <label className="sr-only" htmlFor="saved-search-name">
            검색 조건 이름
          </label>
          <input
            id="saved-search-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-stone-300 px-3 text-sm sm:w-64"
            placeholder="예: 성동구 매매 아파트"
          />
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-bold"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-bold text-emerald-800"
        >
          현재 조건 저장
        </button>
      )}
    </div>
  );
}

function defaultName(filters: SavableFilters): string {
  const transaction = {
    JEONSE: "전세",
    MONTHLY_RENT: "월세",
    SALE: "매매",
  }[filters.transactionType ?? ""];
  return (
    [filters.sido, filters.sigungu, transaction, "매물"]
      .filter(Boolean)
      .join(" ") || "전체 매물 검색"
  );
}
