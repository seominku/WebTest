import type { Metadata } from "next";
import { AccountPanel } from "@/components/account-panel";

export const metadata: Metadata = { title: "내 계정 | 바른매물" };

export default function AccountPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-stone-50 px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <p className="mb-3 font-mono text-xs font-bold tracking-[0.18em] text-emerald-700">
          MY ACCOUNT
        </p>
        <AccountPanel />
      </div>
    </main>
  );
}
