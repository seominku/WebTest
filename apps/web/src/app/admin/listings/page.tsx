import type { Metadata } from "next";
import { AdminReviewPanel } from "@/components/admin-review-panel";

export const metadata: Metadata = { title: "매물 검수 관리 | 바른매물" };

export default function AdminListingsPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <AdminReviewPanel />
      </div>
    </main>
  );
}
