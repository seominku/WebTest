import type { Metadata } from "next";
import { RecentListingsPanel } from "@/components/recent-listings-panel";

export const metadata: Metadata = { title: "최근 본 매물 | 바른매물" };

export default function RecentListingsPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-stone-50 px-6 py-14">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-xs font-bold tracking-[0.18em] text-emerald-700">
          RECENTLY VIEWED
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">최근 본 매물</h1>
        <p className="mb-8 mt-2 text-slate-600">
          이 브라우저에서 확인한 매물을 최신순으로 다시 살펴보세요.
        </p>
        <RecentListingsPanel />
      </div>
    </main>
  );
}
