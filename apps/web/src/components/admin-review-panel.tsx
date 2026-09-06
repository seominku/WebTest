"use client";

import type {
  PublicationQueueResponse,
  ReviewQueueListing,
  ReviewQueueResponse,
} from "@real-estate/shared";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuth } from "./auth-provider";
import { AreaValue } from "./area-value";

type Decision = "APPROVED" | "NEEDS_CHANGES" | "REJECTED";

export function AdminReviewPanel() {
  const { user, loading, authenticatedRequest } = useAuth();
  const [data, setData] = useState<ReviewQueueResponse | null>(null);
  const [publicationData, setPublicationData] =
    useState<PublicationQueueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setError(null);
    try {
      const [reviews, publications] = await Promise.all([
        apiRequest<ReviewQueueResponse>("/listings/review-queue"),
        apiRequest<PublicationQueueResponse>("/listings/publication-queue"),
      ]);
      setData(reviews);
      setPublicationData(publications);
    } catch {
      setError("검수·게시 대기 목록을 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    if (!loading && user?.role === "ADMIN") {
      void Promise.all([
        apiRequest<ReviewQueueResponse>("/listings/review-queue"),
        apiRequest<PublicationQueueResponse>("/listings/publication-queue"),
      ])
        .then(([reviews, publications]) => {
          setData(reviews);
          setPublicationData(publications);
        })
        .catch(() => setError("검수·게시 대기 목록을 불러오지 못했습니다."));
    }
  }, [loading, user]);

  if (loading)
    return <p className="text-slate-500">관리자 권한을 확인하고 있습니다…</p>;
  if (!user || user.role !== "ADMIN") {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center">
        <p className="text-lg font-bold">관리자 계정으로 로그인해야 합니다.</p>
        <Link
          href="/login"
          className="mt-5 inline-flex rounded-xl bg-slate-950 px-5 py-3 font-bold text-white"
        >
          로그인
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="font-mono text-xs font-bold tracking-[0.18em] text-emerald-700">
        LISTING REVIEW
      </p>
      <h1 className="mt-2 text-3xl font-bold">매물 검수 관리</h1>
      <p className="mt-2 text-slate-600">
        중개사가 요청한 매물을 확인하고 검수 결과를 기록합니다.
      </p>
      {error && (
        <p className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>
      )}
      {!data && !error && (
        <p className="mt-8 text-slate-500">검수 목록을 불러오는 중…</p>
      )}
      {data?.items.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center text-slate-600">
          검수 대기 중인 매물이 없습니다.
        </div>
      )}
      <div className="mt-8 grid gap-6">
        {data?.items.map((listing) => (
          <ReviewCard
            key={listing.id}
            listing={listing}
            authenticatedRequest={authenticatedRequest}
            onReviewed={loadQueue}
          />
        ))}
      </div>
      <div className="mt-14 border-t border-stone-200 pt-10">
        <h2 className="text-2xl font-bold">게시 대기</h2>
        <p className="mt-2 text-slate-600">
          검수를 통과한 매물의 게시 기간을 정하고 공개합니다.
        </p>
        {publicationData?.items.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-slate-600">
            게시 대기 중인 매물이 없습니다.
          </div>
        )}
        <div className="mt-6 grid gap-4">
          {publicationData?.items.map((listing) => (
            <PublishCard
              key={listing.id}
              listing={listing}
              authenticatedRequest={authenticatedRequest}
              onPublished={loadQueue}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PublishCard({
  listing,
  authenticatedRequest,
  onPublished,
}: {
  listing: ReviewQueueListing;
  authenticatedRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
  onPublished: () => Promise<void>;
}) {
  const [durationDays, setDurationDays] = useState(90);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function publish() {
    setPending(true);
    setMessage(null);
    try {
      await authenticatedRequest(`/listings/${listing.id}/publish`, {
        body: JSON.stringify({ durationDays, version: listing.version }),
        method: "POST",
      });
      await onPublished();
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : "매물 게시를 시작하지 못했습니다.",
      );
      setPending(false);
    }
  }

  return (
    <article className="flex flex-wrap items-end justify-between gap-5 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-sm font-bold text-emerald-700">
          검수 승인 · {listing.agency.name}
        </p>
        <h3 className="mt-2 text-xl font-bold">{listing.title}</h3>
        <p className="mt-2 text-sm text-slate-600">
          {listing.location} · 버전 {listing.version}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm font-bold text-slate-700">
          게시 기간
          <select
            value={durationDays}
            onChange={(event) => setDurationDays(Number(event.target.value))}
            className="ml-2 rounded-xl border border-stone-300 bg-white px-3 py-2 font-normal"
          >
            <option value={30}>30일</option>
            <option value={60}>60일</option>
            <option value={90}>90일</option>
            <option value={180}>180일</option>
          </select>
        </label>
        <button
          disabled={pending}
          onClick={publish}
          className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {pending ? "게시 중…" : "게시 시작"}
        </button>
      </div>
      {message && <p className="w-full text-sm text-red-700">{message}</p>}
    </article>
  );
}

function ReviewCard({
  listing,
  authenticatedRequest,
  onReviewed,
}: {
  listing: ReviewQueueListing;
  authenticatedRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
  onReviewed: () => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function decide(decision: Decision) {
    if (decision !== "APPROVED" && note.trim().length < 5) {
      setMessage("수정 요구와 반려에는 5자 이상의 검수 의견이 필요합니다.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      await authenticatedRequest(`/listings/${listing.id}/review`, {
        body: JSON.stringify({
          decision,
          note: note.trim() || undefined,
          version: listing.version,
        }),
        method: "POST",
      });
      await onReviewed();
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : "검수 결과를 저장하지 못했습니다.",
      );
      setPending(false);
    }
  }

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-emerald-700">
            {listing.agency.name} · {listing.agency.agentName}
          </p>
          <h2 className="mt-2 text-2xl font-bold">{listing.title}</h2>
          <p className="mt-2 text-sm text-slate-600">
            {listing.location} ·{" "}
            <AreaValue squareMeters={listing.property.areaSquareMeters} /> ·
            버전 {listing.version}
          </p>
        </div>
        <span className="h-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
          검토 대기
        </span>
      </div>
      <p className="mt-5 whitespace-pre-wrap leading-7 text-slate-700">
        {listing.description}
      </p>
      <dl className="mt-5 grid gap-3 rounded-xl bg-stone-50 p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">거래 유형</dt>
          <dd className="mt-1 font-bold">{listing.transactionType}</dd>
        </div>
        <div>
          <dt className="text-slate-500">중개사 등록번호</dt>
          <dd className="mt-1 font-bold">
            {listing.agency.registrationNumber}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">도로명 주소</dt>
          <dd className="mt-1 font-bold">{listing.address.roadAddress}</dd>
        </div>
      </dl>
      <label className="mt-5 block text-sm font-bold text-slate-800">
        검수 의견
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="수정 요구 또는 반려 사유를 구체적으로 작성해 주세요."
          className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 font-normal outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
        />
      </label>
      {message && <p className="mt-3 text-sm text-red-700">{message}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          disabled={pending}
          onClick={() => decide("REJECTED")}
          className="rounded-xl border border-red-300 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-60"
        >
          반려
        </button>
        <button
          disabled={pending}
          onClick={() => decide("NEEDS_CHANGES")}
          className="rounded-xl border border-amber-300 px-4 py-2 text-sm font-bold text-amber-800 disabled:opacity-60"
        >
          수정 요구
        </button>
        <button
          disabled={pending}
          onClick={() => decide("APPROVED")}
          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          승인
        </button>
      </div>
    </article>
  );
}
