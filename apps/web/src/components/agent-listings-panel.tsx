"use client";

import type { ManagedListingsResponse } from "@real-estate/shared";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "./auth-provider";

const statusNames = {
  DRAFT: "초안",
  REVIEW_PENDING: "검토 대기",
  NEEDS_CHANGES: "수정 필요",
  APPROVED: "승인",
  PUBLISHED: "공개 중",
  PAUSED: "일시 중지",
  EXPIRED: "만료",
  COMPLETED: "거래 완료",
  REJECTED: "반려",
  DELETED: "삭제",
} as const;

export function AgentListingsPanel() {
  const { user, loading, authenticatedRequest } = useAuth();
  const [data, setData] = useState<ManagedListingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadListings = useCallback(() => {
    setError(null);
    return apiRequest<ManagedListingsResponse>("/listings/mine")
      .then(setData)
      .catch(() => setError("내 매물 목록을 불러오지 못했습니다."));
  }, []);

  useEffect(() => {
    if (!loading && user?.role === "AGENT") {
      void apiRequest<ManagedListingsResponse>("/listings/mine")
        .then(setData)
        .catch(() => setError("내 매물 목록을 불러오지 못했습니다."));
    }
  }, [loading, user]);

  async function submitReview(id: string, version: number) {
    setPendingId(id);
    setError(null);
    try {
      await authenticatedRequest(`/listings/${id}/submit-review`, {
        body: JSON.stringify({ version }),
        method: "POST",
      });
      await loadListings();
    } catch {
      setError("검수 요청을 처리하지 못했습니다. 목록을 새로 확인해 주세요.");
    } finally {
      setPendingId(null);
    }
  }

  async function lifecycleAction(
    id: string,
    version: number,
    action: "pause" | "resume" | "complete",
  ) {
    if (
      action === "complete" &&
      !window.confirm("거래 완료 후에는 다시 공개할 수 없습니다. 계속할까요?")
    ) {
      return;
    }
    setPendingId(id);
    setError(null);
    try {
      await authenticatedRequest(`/listings/${id}/${action}`, {
        body: JSON.stringify({ version }),
        method: "POST",
      });
      await loadListings();
    } catch {
      setError("매물 상태를 변경하지 못했습니다. 목록을 새로 확인해 주세요.");
    } finally {
      setPendingId(null);
    }
  }

  if (loading)
    return <p className="text-slate-500">계정을 확인하고 있습니다…</p>;
  if (!user)
    return <AccessMessage text="로그인 후 중개사 매물을 관리할 수 있습니다." />;
  if (user.role !== "AGENT")
    return (
      <AccessMessage text="활성 중개사 계정만 매물을 관리할 수 있습니다." />
    );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-bold tracking-[0.18em] text-emerald-700">
            AGENT LISTINGS
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            내 매물 관리
          </h1>
          <p className="mt-2 text-slate-600">
            초안을 작성하고 검토 전 내용을 관리합니다.
          </p>
        </div>
        <Link
          href="/agent/listings/new"
          className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white"
        >
          새 매물 등록
        </Link>
      </div>
      {error && (
        <p className="mt-8 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>
      )}
      {!data && !error && (
        <p className="mt-8 text-slate-500">매물을 불러오는 중…</p>
      )}
      {data?.items.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center text-slate-600">
          등록한 매물이 없습니다. 첫 초안을 만들어보세요.
        </div>
      )}
      <div className="mt-8 grid gap-4">
        {data?.items.map((listing) => {
          const editable =
            listing.status === "DRAFT" || listing.status === "NEEDS_CHANGES";
          return (
            <article
              key={listing.id}
              className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                    {statusNames[listing.status]}
                  </span>
                  <h2 className="mt-3 text-xl font-bold">{listing.title}</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    {listing.location} · 버전 {listing.version}
                  </p>
                  {listing.expiresAt &&
                    (listing.status === "PUBLISHED" ||
                      listing.status === "PAUSED") && (
                      <p className="mt-1 text-xs text-slate-500">
                        게시 만료: {formatDate(listing.expiresAt)}
                      </p>
                    )}
                  {listing.latestReviewNote && (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      검수 의견: {listing.latestReviewNote}
                    </p>
                  )}
                </div>
                {editable && (
                  <div className="flex gap-2">
                    <Link
                      href={`/agent/listings/${listing.id}/edit`}
                      className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold"
                    >
                      수정
                    </Link>
                    <button
                      type="button"
                      disabled={pendingId === listing.id}
                      onClick={() => submitReview(listing.id, listing.version)}
                      className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {pendingId === listing.id ? "요청 중…" : "검수 요청"}
                    </button>
                  </div>
                )}
                {listing.status === "PUBLISHED" && (
                  <div className="flex gap-2">
                    <ActionButton
                      disabled={pendingId === listing.id}
                      onClick={() =>
                        lifecycleAction(listing.id, listing.version, "pause")
                      }
                    >
                      일시 중지
                    </ActionButton>
                    <ActionButton
                      disabled={pendingId === listing.id}
                      onClick={() =>
                        lifecycleAction(listing.id, listing.version, "complete")
                      }
                      danger
                    >
                      거래 완료
                    </ActionButton>
                  </div>
                )}
                {listing.status === "PAUSED" && (
                  <div className="flex gap-2">
                    <ActionButton
                      disabled={pendingId === listing.id}
                      onClick={() =>
                        lifecycleAction(listing.id, listing.version, "resume")
                      }
                    >
                      게시 재개
                    </ActionButton>
                    <ActionButton
                      disabled={pendingId === listing.id}
                      onClick={() =>
                        lifecycleAction(listing.id, listing.version, "complete")
                      }
                      danger
                    >
                      거래 완료
                    </ActionButton>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  danger = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-60 ${
        danger
          ? "border-red-300 text-red-700"
          : "border-stone-300 text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function AccessMessage({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center">
      <p className="text-lg font-bold">{text}</p>
      <Link
        href="/login"
        className="mt-5 inline-flex rounded-xl bg-slate-950 px-5 py-3 font-bold text-white"
      >
        로그인
      </Link>
    </div>
  );
}
