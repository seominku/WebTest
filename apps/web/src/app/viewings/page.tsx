import type { Metadata } from "next";
import { ViewingsPanel } from "@/components/viewings-panel";

export const metadata: Metadata = { title: "방문 일정 | 바른매물" };

export default function ViewingsPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-stone-50 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-4xl">
        <ViewingsPanel />
      </div>
    </main>
  );
}
