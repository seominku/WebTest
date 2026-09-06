"use client";

import Link from "next/link";
import { useRef } from "react";
import { useAuth } from "./auth-provider";

export function MobileNav() {
  const { user } = useAuth();
  const menuRef = useRef<HTMLDetailsElement>(null);
  return (
    <details
      ref={menuRef}
      className="relative md:hidden"
      onKeyDown={(event) => {
        if (event.key === "Escape" && menuRef.current?.open) {
          menuRef.current.open = false;
          menuRef.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-bold marker:hidden">
        메뉴
      </summary>
      <nav
        aria-label="모바일 메뉴"
        className="absolute right-0 top-12 z-[1000] grid max-h-[calc(100dvh-5rem)] w-56 gap-1 overflow-y-auto overscroll-contain rounded-2xl border border-stone-200 bg-white p-2 shadow-xl"
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("a") &&
            menuRef.current
          ) {
            menuRef.current.open = false;
          }
        }}
      >
        <MobileLink href="/listings">매물 찾기</MobileLink>
        <MobileLink href="/recent">최근 본 매물</MobileLink>
        {user ? (
          <>
            <MobileLink href="/favorites">관심 매물</MobileLink>
            <MobileLink href="/saved-searches">저장 검색·새 매물</MobileLink>
            <MobileLink href="/inquiries">문의 내역</MobileLink>
            <MobileLink href="/viewings">방문 일정</MobileLink>
            <MobileLink href="/account">내 계정</MobileLink>
          </>
        ) : (
          <>
            <MobileLink href="/login">로그인</MobileLink>
            <MobileLink href="/register">회원가입</MobileLink>
          </>
        )}
      </nav>
    </details>
  );
}

function MobileLink({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
    >
      {children}
    </Link>
  );
}
