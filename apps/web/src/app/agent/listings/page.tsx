import type { Metadata } from "next";
import { AgentListingsPanel } from "@/components/agent-listings-panel";

export const metadata: Metadata = { title: "내 매물 관리 | 바른매물" };

export default function AgentListingsPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <AgentListingsPanel />
      </div>
    </main>
  );
}
