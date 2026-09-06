import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/register-form";

export const metadata: Metadata = { title: "회원가입 | 바른매물" };

export default function RegisterPage() {
  return (
    <AuthShell
      eyebrow="CREATE ACCOUNT"
      title="안전한 매물 탐색을 시작하세요"
      description="가입 계정은 이메일 확인 후 활성화됩니다. 비밀번호와 인증 토큰 원문은 서버에 저장하지 않습니다."
    >
      <RegisterForm />
    </AuthShell>
  );
}
