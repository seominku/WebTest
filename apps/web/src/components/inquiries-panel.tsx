"use client";

import type {
  InquiriesResponse,
  InquirySummary,
  PaginationMeta,
  ReceivedInquiriesResponse,
  ReceivedInquirySummary,
} from "@real-estate/shared";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { notifyInquiryNotificationsUpdated } from "@/lib/inquiry-notification-events";
import { useAuth } from "./auth-provider";

const statusNames = {
  CLOSED: "종료",
  OPEN: "답변 대기",
  RESPONDED: "답변 완료",
} as const;

export function InquiriesPanel() {
  const { user, loading, authenticatedRequest } = useAuth();
  const isAgent = user?.role === "AGENT";
  const [mine, setMine] = useState<InquirySummary[] | null>(null);
  const [received, setReceived] = useState<ReceivedInquirySummary[] | null>(
    null,
  );
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minePage, setMinePage] = useState(1);
  const [receivedPage, setReceivedPage] = useState(1);
  const [minePagination, setMinePagination] = useState<PaginationMeta | null>(
    null,
  );
  const [receivedPagination, setReceivedPagination] =
    useState<PaginationMeta | null>(null);
  const [unreadResponses, setUnreadResponses] = useState(0);

  const markViewed = useCallback(async () => {
    if (unreadResponses === 0) return;
    setPendingId("mark-viewed");
    setError(null);
    try {
      await authenticatedRequest("/inquiries/responses/viewed", {
        body: "{}",
        method: "POST",
      });
      setUnreadResponses(0);
      setMine(
        (current) =>
          current?.map((item) =>
            item.status === "RESPONDED" && item.responseViewedAt === null
              ? { ...item, responseViewedAt: new Date().toISOString() }
              : item,
          ) ?? null,
      );
      notifyInquiryNotificationsUpdated();
    } catch {
      setError("답변 읽음 상태를 저장하지 못했습니다.");
    } finally {
      setPendingId(null);
    }
  }, [authenticatedRequest, unreadResponses]);

  const load = useCallback(async () => {
    try {
      const data = await fetchInquiries(isAgent, minePage, receivedPage);
      applyInquiryData(data);
    } catch {
      setError("문의 내역을 불러오지 못했습니다.");
    }
  }, [isAgent, minePage, receivedPage]);

  function applyInquiryData(data: Awaited<ReturnType<typeof fetchInquiries>>) {
    setMine(data.mine.items);
    setMinePagination(data.mine.pagination);
    setReceived(data.received?.items ?? null);
    setReceivedPagination(data.received?.pagination ?? null);
    setUnreadResponses(data.unreadCount);
  }

  useEffect(() => {
    if (loading || !user) return;
    let active = true;
    void fetchInquiries(isAgent, minePage, receivedPage)
      .then((data) => {
        if (!active) return;
        applyInquiryData(data);
      })
      .catch(() => {
        if (active) setError("문의 내역을 불러오지 못했습니다.");
      });
    return () => {
      active = false;
    };
  }, [isAgent, loading, minePage, receivedPage, user]);

  async function respond(id: string) {
    const responseMessage = replies[id]?.trim() ?? "";
    if (responseMessage.length < 2) {
      setError("답변을 2자 이상 입력해 주세요.");
      return;
    }
    setPendingId(id);
    setError(null);
    try {
      await authenticatedRequest(`/inquiries/${id}/respond`, {
        body: JSON.stringify({ responseMessage }),
        method: "PUT",
      });
      setReplies((current) => ({ ...current, [id]: "" }));
      await load();
    } catch {
      setError("답변을 저장하지 못했습니다.");
    } finally {
      setPendingId(null);
    }
  }

  async function close(id: string) {
    setPendingId(id);
    setError(null);
    try {
      await authenticatedRequest(`/inquiries/${id}/close`, {
        body: "{}",
        method: "POST",
      });
      notifyInquiryNotificationsUpdated();
      await load();
    } catch {
      setError("문의를 종료하지 못했습니다.");
    } finally {
      setPendingId(null);
    }
  }

  if (loading) return <p className="text-slate-500">계정을 확인하는 중…</p>;
  if (!user) {
    return (
      <AccessMessage>
        <Link href="/login" className="font-bold text-emerald-800 underline">
          로그인
        </Link>
        후 문의 내역을 확인할 수 있습니다.
      </AccessMessage>
    );
  }

  return (
    <div>
      <p className="font-mono text-xs font-bold tracking-[0.18em] text-emerald-700">
        INQUIRIES
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">문의 관리</h1>
      <p className="mt-2 text-slate-600">
        보낸 문의와 중개사 답변 상태를 한곳에서 확인하세요.
      </p>
      {error && (
        <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">
          {error}
        </p>
      )}

      {user.role === "AGENT" && (
        <InquirySection title="내 매물에 받은 문의">
          {received === null ? (
            <LoadingMessage />
          ) : received.length === 0 ? (
            <EmptyMessage text="아직 받은 문의가 없습니다." />
          ) : (
            <>
              {received.map((inquiry) => (
                <InquiryCard
                  key={inquiry.id}
                  inquiry={inquiry}
                  label={`${inquiry.customer.displayName}님의 문의`}
                >
                  {inquiry.status !== "CLOSED" && (
                    <div className="mt-4 border-t border-stone-200 pt-4">
                      <label
                        htmlFor={`reply-${inquiry.id}`}
                        className="text-sm font-bold"
                      >
                        중개사 답변
                      </label>
                      <textarea
                        id={`reply-${inquiry.id}`}
                        value={replies[inquiry.id] ?? ""}
                        onChange={(event) =>
                          setReplies((current) => ({
                            ...current,
                            [inquiry.id]: event.target.value,
                          }))
                        }
                        maxLength={2000}
                        rows={3}
                        placeholder={
                          inquiry.responseMessage ?? "답변 내용을 입력하세요."
                        }
                        className="mt-2 w-full rounded-xl border border-stone-300 p-3 text-sm"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={pendingId === inquiry.id}
                          onClick={() => respond(inquiry.id)}
                          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                        >
                          {inquiry.responseMessage ? "답변 수정" : "답변 등록"}
                        </button>
                        <CloseButton
                          disabled={pendingId === inquiry.id}
                          onClick={() => close(inquiry.id)}
                        />
                      </div>
                    </div>
                  )}
                </InquiryCard>
              ))}
              <PaginationControls
                pagination={receivedPagination}
                onPageChange={setReceivedPage}
              />
            </>
          )}
        </InquirySection>
      )}

      <InquirySection
        title="내가 보낸 문의"
        action={
          unreadResponses > 0 ? (
            <button
              type="button"
              disabled={pendingId === "mark-viewed"}
              onClick={() => void markViewed()}
              className="min-h-11 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-bold text-emerald-800 disabled:opacity-60"
            >
              새 답변 {unreadResponses}개 모두 읽음
            </button>
          ) : undefined
        }
      >
        {mine === null ? (
          <LoadingMessage />
        ) : mine.length === 0 ? (
          <EmptyMessage text="아직 보낸 문의가 없습니다." />
        ) : (
          <>
            {mine.map((inquiry) => (
              <InquiryCard key={inquiry.id} inquiry={inquiry} label="내 문의">
                {inquiry.status !== "CLOSED" && (
                  <CloseButton
                    disabled={pendingId === inquiry.id}
                    onClick={() => close(inquiry.id)}
                  />
                )}
              </InquiryCard>
            ))}
            <PaginationControls
              pagination={minePagination}
              onPageChange={setMinePage}
            />
          </>
        )}
      </InquirySection>
    </div>
  );
}

async function fetchInquiries(
  isAgent: boolean,
  minePage: number,
  receivedPage: number,
) {
  const [mineData, receivedData, unread] = await Promise.all([
    apiRequest<InquiriesResponse>(`/inquiries/mine?page=${minePage}`),
    isAgent
      ? apiRequest<ReceivedInquiriesResponse>(
          `/inquiries/received?page=${receivedPage}`,
        )
      : null,
    apiRequest<{ count: number }>("/inquiries/unread-count"),
  ]);
  return {
    mine: mineData,
    received: receivedData,
    unreadCount: unread.count,
  };
}

function InquirySection({
  action,
  children,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="mt-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
        {action}
      </div>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

function PaginationControls({
  onPageChange,
  pagination,
}: {
  onPageChange: (page: number) => void;
  pagination: PaginationMeta | null;
}) {
  if (!pagination || pagination.totalPages <= 1) return null;
  return (
    <nav
      aria-label="문의 페이지"
      className="flex items-center justify-center gap-3 pt-2"
    >
      <button
        type="button"
        disabled={pagination.page <= 1}
        onClick={() => onPageChange(pagination.page - 1)}
        className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-bold disabled:opacity-40"
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
        className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-bold disabled:opacity-40"
      >
        다음
      </button>
    </nav>
  );
}

function InquiryCard({
  children,
  inquiry,
  label,
}: {
  children?: React.ReactNode;
  inquiry: InquirySummary;
  label: string;
}) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-emerald-700">{label}</p>
          <Link
            href={`/listings/${inquiry.listing.id}`}
            className="mt-1 block text-lg font-bold hover:text-emerald-800"
          >
            {inquiry.listing.title}
          </Link>
        </div>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-slate-700">
          {statusNames[inquiry.status]}
        </span>
      </div>
      <p className="mt-4 whitespace-pre-line rounded-xl bg-stone-50 p-4 text-sm leading-6 text-slate-700">
        {inquiry.message}
      </p>
      {inquiry.responseMessage && (
        <div className="mt-3 rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
          <p className="mb-1 font-bold">중개사 답변</p>
          <p className="whitespace-pre-line">{inquiry.responseMessage}</p>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">
        {new Intl.DateTimeFormat("ko-KR", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(inquiry.createdAt))}
      </p>
      {children && <div className="mt-4">{children}</div>}
    </article>
  );
}

function CloseButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60"
    >
      문의 종료
    </button>
  );
}

function LoadingMessage() {
  return <p className="text-sm text-slate-500">문의 내역을 불러오는 중…</p>;
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center text-slate-500">
      {text}
    </p>
  );
}

function AccessMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
      {children}
    </div>
  );
}
