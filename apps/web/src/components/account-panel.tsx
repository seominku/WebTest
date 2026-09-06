"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./auth-provider";

const roleNames = {
  USER: "일반 사용자",
  AGENT: "중개사",
  ADMIN: "관리자",
} as const;

export function AccountPanel() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (loading) {
    return <p className="text-slate-500">로그인 상태를 확인하고 있습니다…</p>;
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold">로그인이 필요합니다</h1>
        <p className="mt-3 text-slate-600">
          계정과 세션 정보를 확인하려면 로그인해 주세요.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white"
        >
          로그인으로 이동
        </Link>
      </div>
    );
  }

  async function handleLogout() {
    setPending(true);
    setMessage(null);
    try {
      await logout();
      router.replace("/login");
    } catch {
      setMessage("로그아웃을 완료하지 못했습니다. 다시 시도해 주세요.");
      setPending(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 bg-emerald-50 px-7 py-6">
        <p className="text-sm font-semibold text-emerald-700">인증된 세션</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          {user.displayName}님, 반갑습니다.
        </h1>
      </div>
      <dl className="divide-y divide-stone-100 px-7">
        <Detail label="이메일" value={user.email} />
        <Detail label="계정 역할" value={roleNames[user.role]} />
        <Detail label="세션 방식" value="서버 측 HttpOnly 쿠키" />
      </dl>
      <div className="px-7 py-6">
        {message && <p className="mb-4 text-sm text-red-700">{message}</p>}
        <Link
          href="/inquiries"
          className="mr-3 inline-flex rounded-xl border border-emerald-300 px-5 py-3 font-semibold text-emerald-800 transition hover:bg-emerald-50"
        >
          문의 관리
        </Link>
        <Link
          href="/saved-searches"
          className="mr-3 mt-3 inline-flex rounded-xl border border-emerald-300 px-5 py-3 font-semibold text-emerald-800 transition hover:bg-emerald-50 sm:mt-0"
        >
          저장 검색
        </Link>
        <Link
          href="/viewings"
          className="mr-3 mt-3 inline-flex rounded-xl border border-emerald-300 px-5 py-3 font-semibold text-emerald-800 transition hover:bg-emerald-50 sm:mt-0"
        >
          방문 일정
        </Link>
        {user.role === "AGENT" && (
          <Link
            href="/agent/listings"
            className="mr-3 inline-flex rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white transition hover:bg-emerald-800"
          >
            내 매물 관리
          </Link>
        )}
        {user.role === "ADMIN" && (
          <Link
            href="/admin/listings"
            className="mr-3 inline-flex rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white transition hover:bg-emerald-800"
          >
            매물 검수 관리
          </Link>
        )}
        <button
          type="button"
          onClick={handleLogout}
          disabled={pending}
          className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-800 transition hover:border-red-300 hover:text-red-700 disabled:opacity-60"
        >
          {pending ? "로그아웃 중…" : "로그아웃"}
        </button>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-5 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <dt className="text-sm font-semibold text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}
