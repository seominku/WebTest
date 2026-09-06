import type { Metadata } from "next";
import { ListingEditor } from "@/components/listing-editor";

export const metadata: Metadata = { title: "새 매물 등록 | 바른매물" };

export default function NewListingPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-bold text-emerald-700">새 매물</p>
        <h1 className="mt-2 mb-8 text-3xl font-bold">매물 초안 등록</h1>
        <ListingEditor />
      </div>
    </main>
  );
}
