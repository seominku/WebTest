import type { Metadata } from "next";
import { Suspense } from "react";
import { CompareListingsPanel } from "@/components/compare-listings-panel";

export const metadata: Metadata = { title: "관심 매물 비교 | 바른매물" };

export default function CompareListingsPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-stone-50 px-6 py-14 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-xs font-bold tracking-[0.18em] text-emerald-700">
          COMPARE LISTINGS
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          관심 매물 비교
        </h1>
        <p className="mb-8 mt-2 text-slate-600">
          중요한 조건을 같은 행에서 확인하고 지도 위치도 함께 비교하세요.
        </p>
        <Suspense
          fallback={<p className="text-slate-500">비교 화면 준비 중…</p>}
        >
          <CompareListingsPanel />
        </Suspense>
      </div>
    </main>
  );
}
