"use client";

import type { ViewingAppointmentSummary } from "@real-estate/shared";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "./auth-provider";

export function ListingViewingForm({ listingId }: { listingId: string }) {
  const { authenticatedRequest, loading, user } = useAuth();
  const [requestedAt, setRequestedAt] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (loading) return null;
  if (!user) {
    return (
      <div className="mt-5 rounded-2xl bg-stone-50 p-4 text-sm leading-6">
        <Link href="/login" className="font-bold text-emerald-800 underline">
          로그인
        </Link>
        하면 방문 희망 일정을 요청할 수 있습니다.
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!requestedAt) return;
    setPending(true);
    setResult(null);
    try {
      await authenticatedRequest<ViewingAppointmentSummary>("/viewings", {
        body: JSON.stringify({
          listingId,
          message: message.trim() || undefined,
          requestedAt: new Date(requestedAt).toISOString(),
        }),
        method: "POST",
      });
      setResult("방문 요청을 보냈습니다. 중개사 확인 후 상태가 바뀝니다.");
      setRequestedAt("");
      setMessage("");
    } catch {
      setResult(
        "방문 요청을 저장하지 못했습니다. 현재 시각보다 1시간 이후인지 확인해 주세요.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 border-t border-stone-200 pt-6">
      <h3 className="font-bold">방문 일정 요청</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        1시간 이후부터 90일 이내의 희망 시간을 선택하세요.
      </p>
      <label htmlFor="viewing-at" className="mt-4 block text-sm font-semibold">
        희망 날짜와 시간
      </label>
      <input
        id="viewing-at"
        type="datetime-local"
        required
        value={requestedAt}
        onChange={(event) => setRequestedAt(event.target.value)}
        className="mt-2 min-h-12 w-full rounded-xl border border-stone-300 px-3"
      />
      <label
        htmlFor="viewing-message"
        className="mt-4 block text-sm font-semibold"
      >
        전달 사항 <span className="font-normal text-slate-400">(선택)</span>
      </label>
      <textarea
        id="viewing-message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        maxLength={500}
        rows={3}
        className="mt-2 w-full rounded-xl border border-stone-300 p-3 text-sm"
        placeholder="가능한 시간 범위나 확인할 내용을 적어 주세요."
      />
      <p className="text-right text-xs text-slate-400">
        {message.length}/500자
      </p>
      {result && (
        <p aria-live="polite" className="mt-3 text-sm leading-6 text-slate-600">
          {result}
        </p>
      )}
      <button
        disabled={pending}
        className="mt-4 min-h-12 w-full rounded-xl bg-slate-950 px-4 font-bold text-white disabled:opacity-60"
      >
        {pending ? "요청 중…" : "방문 요청 보내기"}
      </button>
      <Link
        href="/viewings"
        className="mt-3 block text-center text-sm font-bold text-emerald-800"
      >
        내 방문 일정 보기
      </Link>
    </form>
  );
}
