import type { Metadata } from "next";
import { ListingEditor } from "@/components/listing-editor";

export const metadata: Metadata = { title: "매물 수정 | 바른매물" };

export default async function EditListingPage({
  params,
}: PageProps<"/agent/listings/[id]/edit">) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-bold text-emerald-700">매물 관리</p>
        <h1 className="mt-2 mb-8 text-3xl font-bold">매물 초안 수정</h1>
        <ListingEditor id={id} />
      </div>
    </main>
  );
}
