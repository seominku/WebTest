import type { Metadata } from "next";
import { InquiriesPanel } from "@/components/inquiries-panel";

export const metadata: Metadata = { title: "문의 관리 | 바른매물" };

export default function InquiriesPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-stone-50 px-6 py-14">
      <div className="mx-auto max-w-4xl">
        <InquiriesPanel />
      </div>
    </main>
  );
}
