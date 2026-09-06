import type { Metadata } from "next";
import { SavedSearchesPanel } from "@/components/saved-searches-panel";

export const metadata: Metadata = { title: "저장 검색 | 바른매물" };

export default function SavedSearchesPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-stone-50 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-6xl">
        <SavedSearchesPanel />
      </div>
    </main>
  );
}
