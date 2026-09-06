"use client";

import Link from "next/link";
import { useAuth } from "./auth-provider";
import { InquiryNavLink } from "./inquiry-nav-link";
import { SavedSearchNavLink } from "./saved-search-nav-link";

export function AuthNav() {
  const { user, loading } = useAuth();

  if (loading) {
    return <span className="text-sm text-slate-400">확인 중</span>;
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <InquiryNavLink />
        <SavedSearchNavLink />
        <Link
          href="/viewings"
          className="hidden px-3 py-2 text-sm font-semibold text-slate-700 transition hover:text-emerald-700 xl:block"
        >
          방문 일정
        </Link>
        <Link
          href="/favorites"
          className="hidden px-3 py-2 text-sm font-semibold text-slate-700 transition hover:text-rose-600 lg:block"
        >
          관심 매물
        </Link>
        <Link
          href="/account"
          className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
        >
          {user.displayName}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        className="px-3 py-2 text-sm font-semibold text-slate-700 transition hover:text-emerald-700"
      >
        로그인
      </Link>
      <Link
        href="/register"
        className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
      >
        회원가입
      </Link>
    </div>
  );
}
