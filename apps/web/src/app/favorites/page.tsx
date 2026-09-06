import type { Metadata } from "next";
import { FavoriteListingsPanel } from "@/components/favorite-listings-panel";

export const metadata: Metadata = { title: "관심 매물 | 바른매물" };

export default function FavoritesPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-stone-50 px-6 py-14 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-xs font-bold tracking-[0.18em] text-emerald-700">
          FAVORITES
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950">
          관심 매물
        </h1>
        <p className="mb-8 mt-3 text-slate-600">
          나중에 다시 확인할 매물을 한곳에서 비교하세요.
        </p>
        <FavoriteListingsPanel />
      </div>
    </main>
  );
}
