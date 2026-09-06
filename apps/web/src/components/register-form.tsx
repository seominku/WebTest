"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { AuthUser } from "./auth-provider";
import { ApiError, apiRequest } from "@/lib/api";

interface RegisterResponse {
  user: AuthUser & { status: "PENDING_VERIFICATION" | "ACTIVE" };
  verificationToken?: string;
}

export function RegisterForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const passwordConfirmation = String(form.get("passwordConfirmation") ?? "");

    if (password !== passwordConfirmation) {
      setMessage("비밀번호 확인이 일치하지 않습니다.");
      setPending(false);
      return;
    }

    try {
      const registered = await apiRequest<RegisterResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password,
          displayName: form.get("displayName"),
        }),
      });

      if (registered.verificationToken) {
        await apiRequest("/auth/verify-email", {
          method: "POST",
          body: JSON.stringify({ token: registered.verificationToken }),
        });
        router.replace("/login?verified=1");
        return;
      }

      setMessage("가입이 완료되었습니다. 이메일의 확인 안내를 진행해 주세요.");
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 409
          ? "이미 사용 중인 이메일이거나 가입할 수 없는 계정입니다."
          : "회원가입을 완료하지 못했습니다. 입력값을 확인해 주세요.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field
        label="이름"
        name="displayName"
        autoComplete="name"
        minLength={2}
      />
      <Field label="이메일" name="email" type="email" autoComplete="email" />
      <Field
        label="비밀번호"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        description="12자 이상 입력해 주세요."
      />
      <Field
        label="비밀번호 확인"
        name="passwordConfirmation"
        type="password"
        autoComplete="new-password"
        minLength={12}
      />

      {message && (
        <p
          aria-live="polite"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
        >
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-slate-950 px-5 py-3.5 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "계정을 준비하는 중…" : "회원가입"}
      </button>

      <p className="text-center text-sm text-slate-600">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="font-semibold text-emerald-700">
          로그인
        </Link>
      </p>
    </form>
  );
}

function Field({
  label,
  description,
  type = "text",
  ...input
}: {
  label: string;
  description?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm font-semibold text-slate-800">
      {label}
      <input
        {...input}
        type={type}
        required
        className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base font-normal outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
      />
      {description && (
        <span className="mt-2 block text-xs font-normal text-slate-500">
          {description}
        </span>
      )}
    </label>
  );
}
