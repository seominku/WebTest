import Link from "next/link";
import { AuthNav } from "./auth-nav";
import { MobileNav } from "./mobile-nav";

export function SiteHeader() {
  return (
    <header className="border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full min-w-0 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-10">
        <Link
          href="/"
          className="flex items-center gap-3 font-bold tracking-tight"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-700 text-sm text-white">
            RE
          </span>
          <span className="hidden sm:inline">바른매물</span>
        </Link>
        <div className="hidden items-center gap-1 md:flex lg:gap-2">
          <Link
            href="/listings"
            className="hidden px-3 py-2 text-sm font-semibold text-slate-700 transition hover:text-emerald-700 sm:block"
          >
            매물 찾기
          </Link>
          <Link
            href="/recent"
            className="hidden px-3 py-2 text-sm font-semibold text-slate-700 transition hover:text-emerald-700 md:block"
          >
            최근 본 매물
          </Link>
          <AuthNav />
        </div>
        <MobileNav />
      </div>
    </header>
  );
}
