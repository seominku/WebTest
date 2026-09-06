"use client";

import type {
  ViewingAppointmentSummary,
  ViewingAppointmentsResponse,
  ViewingProposalRole,
  ViewingStatus,
} from "@real-estate/shared";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "./auth-provider";

const statusNames: Record<ViewingStatus, string> = {
  CANCELLED: "취소",
  CONFIRMED: "확정",
  DECLINED: "거절",
  PENDING: "확인 대기",
};

export function ViewingsPanel() {
  const { authenticatedRequest, loading, user } = useAuth();
  const [mine, setMine] = useState<ViewingAppointmentSummary[] | null>(null);
  const [received, setReceived] = useState<ViewingAppointmentSummary[] | null>(
    null,
  );
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [proposalTimes, setProposalTimes] = useState<Record<string, string>>(
    {},
  );
  const [proposalMessages, setProposalMessages] = useState<
    Record<string, string>
  >({});
  const [openProposalId, setOpenProposalId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [mineData, receivedData] = await Promise.all([
      apiRequest<ViewingAppointmentsResponse>("/viewings/mine"),
      user?.role === "AGENT"
        ? apiRequest<ViewingAppointmentsResponse>("/viewings/received")
        : null,
    ]);
    setMine(mineData.items);
    setReceived(receivedData?.items ?? null);
  }, [user?.role]);

  useEffect(() => {
    if (loading || !user) return;
    let active = true;
    void Promise.all([
      apiRequest<ViewingAppointmentsResponse>("/viewings/mine"),
      user.role === "AGENT"
        ? apiRequest<ViewingAppointmentsResponse>("/viewings/received")
        : null,
    ])
      .then(([mineData, receivedData]) => {
        if (!active) return;
        setMine(mineData.items);
        setReceived(receivedData?.items ?? null);
      })
      .catch(() => active && setError("방문 일정을 불러오지 못했습니다."));
    return () => {
      active = false;
    };
  }, [loading, user]);

  async function respond(id: string, status: "CONFIRMED" | "DECLINED") {
    setPendingId(id);
    setError(null);
    try {
      await authenticatedRequest(`/viewings/${id}/respond`, {
        body: JSON.stringify({
          responseMessage: responses[id]?.trim() || undefined,
          status,
        }),
        method: "PUT",
      });
      await load();
    } catch {
      setError("방문 요청 상태를 변경하지 못했습니다.");
    } finally {
      setPendingId(null);
    }
  }

  async function cancel(id: string) {
    setPendingId(id);
    setError(null);
    try {
      await authenticatedRequest(`/viewings/${id}/cancel`, {
        body: "{}",
        method: "POST",
      });
      await load();
    } catch {
      setError("방문 요청을 취소하지 못했습니다.");
    } finally {
      setPendingId(null);
    }
  }

  async function proposeReschedule(id: string) {
    const proposedAt = proposalTimes[id];
    if (!proposedAt) {
      setError("변경할 날짜와 시간을 선택해 주세요.");
      return;
    }
    setPendingId(id);
    setError(null);
    try {
      await authenticatedRequest(`/viewings/${id}/reschedule-proposals`, {
        body: JSON.stringify({
          message: proposalMessages[id]?.trim() || undefined,
          proposedAt: new Date(proposedAt).toISOString(),
        }),
        method: "POST",
      });
      setOpenProposalId(null);
      await load();
    } catch {
      setError(
        "시간 변경 제안을 저장하지 못했습니다. 1시간 이후부터 90일 이내인지 확인해 주세요.",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function respondToReschedule(id: string, accepted: boolean) {
    setPendingId(id);
    setError(null);
    try {
      await authenticatedRequest(
        `/viewings/${id}/reschedule-proposals/respond`,
        {
          body: JSON.stringify({ accepted }),
          method: "PUT",
        },
      );
      await load();
    } catch {
      setError("시간 변경 제안에 응답하지 못했습니다.");
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
        </Link>{" "}
        후 방문 일정을 확인할 수 있습니다.
      </p>
    );

  return (
    <div>
      <p className="font-mono text-xs font-bold tracking-[0.18em] text-emerald-700">
        VIEWINGS
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">방문 일정</h1>
      <p className="mt-2 text-slate-600">
        희망 방문 시간을 요청하고 중개사의 확정 여부를 확인하세요.
      </p>
      {error && (
        <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">
          {error}
        </p>
      )}

      {user.role === "AGENT" && (
        <ViewingSection title="내 매물에 받은 방문 요청">
          <ViewingList
            items={received}
            openProposalId={openProposalId}
            pendingId={pendingId}
            proposalMessages={proposalMessages}
            proposalTimes={proposalTimes}
            responses={responses}
            setOpenProposalId={setOpenProposalId}
            setProposalMessages={setProposalMessages}
            setProposalTimes={setProposalTimes}
            setResponses={setResponses}
            viewerRole="AGENT"
            onProposeReschedule={proposeReschedule}
            onRespond={respond}
            onRespondToReschedule={respondToReschedule}
          />
        </ViewingSection>
      )}
      <ViewingSection title="내가 요청한 방문 일정">
        <ViewingList
          items={mine}
          openProposalId={openProposalId}
          pendingId={pendingId}
          proposalMessages={proposalMessages}
          proposalTimes={proposalTimes}
          setOpenProposalId={setOpenProposalId}
          setProposalMessages={setProposalMessages}
          setProposalTimes={setProposalTimes}
          viewerRole="CUSTOMER"
          onCancel={cancel}
          onProposeReschedule={proposeReschedule}
          onRespondToReschedule={respondToReschedule}
        />
      </ViewingSection>
    </div>
  );
}

function ViewingSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="mt-9">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

function ViewingList({
  items,
  onCancel,
  onProposeReschedule,
  onRespond,
  onRespondToReschedule,
  openProposalId,
  pendingId,
  proposalMessages,
  proposalTimes,
  responses = {},
  setOpenProposalId,
  setProposalMessages,
  setProposalTimes,
  setResponses,
  viewerRole,
}: {
  items: ViewingAppointmentSummary[] | null;
  onCancel?: (id: string) => void;
  onProposeReschedule: (id: string) => void;
  onRespond?: (id: string, status: "CONFIRMED" | "DECLINED") => void;
  onRespondToReschedule: (id: string, accepted: boolean) => void;
  openProposalId: string | null;
  pendingId: string | null;
  proposalMessages: Record<string, string>;
  proposalTimes: Record<string, string>;
  responses?: Record<string, string>;
  setOpenProposalId: React.Dispatch<React.SetStateAction<string | null>>;
  setProposalMessages: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  setProposalTimes: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  setResponses?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  viewerRole: ViewingProposalRole;
}) {
  const [rescheduleLimits] = useState(() => {
    const now = Date.now();
    return {
      maximum: localDateTimeInput(new Date(now + 90 * 24 * 60 * 60 * 1000)),
      minimum: localDateTimeInput(new Date(now + 60 * 60 * 1000)),
    };
  });
  if (items === null) return <p className="text-slate-500">불러오는 중…</p>;
  if (!items.length)
    return (
      <p className="rounded-2xl border border-dashed bg-white p-8 text-center text-slate-500">
        등록된 방문 일정이 없습니다.
      </p>
    );
  return items.map((item) => (
    <article
      key={item.id}
      className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-emerald-700">
            {item.customer
              ? `${item.customer.displayName}님의 요청`
              : "방문 요청"}
          </p>
          <Link
            href={`/listings/${item.listing.id}`}
            className="mt-1 block text-lg font-bold hover:text-emerald-800"
          >
            {item.listing.title}
          </Link>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${item.status === "CONFIRMED" ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-slate-700"}`}
        >
          {statusNames[item.status]}
        </span>
      </div>
      <p className="mt-4 text-lg font-bold">{formatDate(item.requestedAt)}</p>
      {item.message && (
        <p className="mt-3 rounded-xl bg-stone-50 p-4 text-sm leading-6 text-slate-700">
          {item.message}
        </p>
      )}
      {item.responseMessage && (
        <p className="mt-3 rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
          <strong>중개사 안내</strong>
          <br />
          {item.responseMessage}
        </p>
      )}
      {item.rescheduleProposal?.status === "PENDING" && (
        <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <p className="font-bold">
            {item.rescheduleProposal.proposedByRole === "AGENT"
              ? "중개사가 새 시간을 제안했습니다."
              : "고객이 새 시간을 제안했습니다."}
          </p>
          <p className="mt-2 text-base font-bold">
            {formatDate(item.rescheduleProposal.proposedAt)}
          </p>
          {item.rescheduleProposal.message && (
            <p className="mt-2 leading-6">{item.rescheduleProposal.message}</p>
          )}
          {item.rescheduleProposal.proposedByRole === viewerRole ? (
            <p className="mt-3 text-sky-700">
              상대방의 응답을 기다리고 있습니다.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pendingId === item.id}
                onClick={() => onRespondToReschedule(item.id, true)}
                className="min-h-11 rounded-xl bg-sky-700 px-4 font-bold text-white disabled:opacity-60"
              >
                새 시간 수락
              </button>
              <button
                type="button"
                disabled={pendingId === item.id}
                onClick={() => onRespondToReschedule(item.id, false)}
                className="min-h-11 rounded-xl border border-sky-300 bg-white px-4 font-bold text-sky-900 disabled:opacity-60"
              >
                변경 거절
              </button>
            </div>
          )}
        </div>
      )}
      {item.rescheduleProposal?.status === "DECLINED" && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          최근 시간 변경 제안이 거절되어 기존 방문 시간이 유지됩니다.
        </p>
      )}
      {onRespond && item.status === "PENDING" && (
        <div className="mt-4 border-t border-stone-200 pt-4">
          <label
            htmlFor={`viewing-response-${item.id}`}
            className="text-sm font-bold"
          >
            일정 안내 <span className="font-normal text-slate-400">(선택)</span>
          </label>
          <textarea
            id={`viewing-response-${item.id}`}
            maxLength={500}
            rows={2}
            value={responses[item.id] ?? ""}
            onChange={(event) =>
              setResponses?.((current) => ({
                ...current,
                [item.id]: event.target.value,
              }))
            }
            className="mt-2 w-full rounded-xl border border-stone-300 p-3 text-sm"
            placeholder="만나는 장소나 준비 사항을 알려 주세요."
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              disabled={pendingId === item.id}
              onClick={() => onRespond(item.id, "CONFIRMED")}
              className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              일정 확정
            </button>
            <button
              disabled={pendingId === item.id}
              onClick={() => onRespond(item.id, "DECLINED")}
              className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-bold disabled:opacity-60"
            >
              요청 거절
            </button>
          </div>
        </div>
      )}
      {onCancel &&
        (item.status === "PENDING" || item.status === "CONFIRMED") &&
        new Date(item.requestedAt) > new Date() && (
          <button
            disabled={pendingId === item.id}
            onClick={() => onCancel(item.id)}
            className="mt-4 min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-bold text-slate-700 disabled:opacity-60"
          >
            요청 취소
          </button>
        )}
      {(item.status === "PENDING" || item.status === "CONFIRMED") &&
        new Date(item.requestedAt) > new Date() &&
        item.rescheduleProposal?.status !== "PENDING" && (
          <div className="mt-4 border-t border-stone-200 pt-4">
            {openProposalId === item.id ? (
              <div className="grid gap-3">
                <label
                  htmlFor={`reschedule-at-${item.id}`}
                  className="text-sm font-bold"
                >
                  새 방문 날짜와 시간
                </label>
                <input
                  id={`reschedule-at-${item.id}`}
                  type="datetime-local"
                  min={rescheduleLimits.minimum}
                  max={rescheduleLimits.maximum}
                  value={proposalTimes[item.id] ?? ""}
                  onChange={(event) =>
                    setProposalTimes((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-stone-300 px-3 py-3 text-sm sm:max-w-sm"
                />
                <label
                  htmlFor={`reschedule-message-${item.id}`}
                  className="text-sm font-bold"
                >
                  변경 사유{" "}
                  <span className="font-normal text-slate-400">(선택)</span>
                </label>
                <textarea
                  id={`reschedule-message-${item.id}`}
                  maxLength={500}
                  rows={2}
                  value={proposalMessages[item.id] ?? ""}
                  onChange={(event) =>
                    setProposalMessages((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-stone-300 p-3 text-sm"
                  placeholder="시간을 변경하려는 이유나 안내를 적어 주세요."
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pendingId === item.id}
                    onClick={() => onProposeReschedule(item.id)}
                    className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-60"
                  >
                    변경 제안 보내기
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenProposalId(null)}
                    className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-bold"
                  >
                    닫기
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setOpenProposalId(item.id)}
                className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700"
              >
                시간 변경 제안
              </button>
            )}
          </div>
        )}
    </article>
  ));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

function localDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
