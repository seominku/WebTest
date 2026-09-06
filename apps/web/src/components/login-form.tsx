"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth, type AuthUser } from "./auth-provider";
import { ApiError, apiRequest } from "@/lib/api";

export function LoginForm({ verified }: { verified: boolean }) {
  const router = useRouter();
  const { setSession } = useAuth();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);

    try {
      const result = await apiRequest<{
        user: AuthUser;
        csrfToken: string;
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      setSession(result.user, result.csrfToken);
      router.replace("/account");
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 401
          ? "이메일 또는 비밀번호가 올바르지 않거나 이메일 확인이 필요합니다."
          : "로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {verified && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
          이메일 확인이 완료되었습니다. 이제 로그인할 수 있습니다.
        </p>
      )}
      <label className="block text-sm font-semibold text-slate-800">
        이메일
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base font-normal outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
        />
      </label>
      <label className="block text-sm font-semibold text-slate-800">
        비밀번호
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base font-normal outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
        />
      </label>

      {message && (
        <p
          aria-live="polite"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
        >
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-slate-950 px-5 py-3.5 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "확인하는 중…" : "로그인"}
      </button>

      <p className="text-center text-sm text-slate-600">
        계정이 없나요?{" "}
        <Link href="/register" className="font-semibold text-emerald-700">
          회원가입
        </Link>
      </p>
    </form>
  );
}
