"use client";

import type { InquirySummary } from "@real-estate/shared";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuth } from "./auth-provider";

const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 2000;

export function ListingInquiryForm({ listingId }: { listingId: string }) {
  const { user, loading, authenticatedRequest } = useAuth();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = message.trim();
    if (normalized.length < MIN_MESSAGE_LENGTH) {
      setNotice({
        kind: "error",
        text: `문의 내용을 ${MIN_MESSAGE_LENGTH}자 이상 입력해 주세요.`,
      });
      return;
    }

    setPending(true);
    setNotice(null);
    try {
      await authenticatedRequest<InquirySummary>("/inquiries", {
        body: JSON.stringify({ listingId, message: normalized }),
        method: "POST",
      });
      setMessage("");
      setNotice({
        kind: "success",
        text: "문의를 전달했습니다. 문의 내역에서 답변 상태를 확인할 수 있습니다.",
      });
    } catch {
      setNotice({
        kind: "error",
        text: "문의를 전달하지 못했습니다. 로그인 상태와 내용을 확인해 주세요.",
      });
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return <p className="mt-6 text-sm text-slate-500">계정을 확인하는 중…</p>;
  }

  if (!user) {
    return (
      <div className="mt-6 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950">
        <Link href="/login" className="font-bold underline">
          로그인
        </Link>
        하면 이 매물의 중개사에게 문의를 보낼 수 있습니다.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 border-t border-stone-200 pt-6">
      <label htmlFor="listing-inquiry" className="text-sm font-bold">
        중개사에게 문의
      </label>
      <textarea
        id="listing-inquiry"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        minLength={MIN_MESSAGE_LENGTH}
        maxLength={MAX_MESSAGE_LENGTH}
        rows={5}
        placeholder="입주 가능일, 방문 일정 등 궁금한 점을 적어 주세요."
        className="mt-2 w-full resize-y rounded-xl border border-stone-300 px-3 py-3 text-sm leading-6 outline-none focus:border-emerald-600"
      />
      <div className="mt-2 flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-500">최소 {MIN_MESSAGE_LENGTH}자</span>
        <span
          className={
            message.length > MAX_MESSAGE_LENGTH - 100
              ? "font-bold text-amber-700"
              : "text-slate-500"
          }
        >
          {message.length}/{MAX_MESSAGE_LENGTH}자
        </span>
      </div>
      {notice && (
        <p
          role="status"
          className={`mt-3 rounded-xl p-3 text-sm ${
            notice.kind === "success"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 w-full rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "전달 중…" : "문의 보내기"}
      </button>
      <Link
        href="/inquiries"
        className="mt-3 block text-center text-sm font-semibold text-emerald-800"
      >
        내 문의 내역 보기
      </Link>
    </form>
  );
}
