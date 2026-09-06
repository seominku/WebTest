import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = { title: "로그인 | 바른매물" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { verified } = await props.searchParams;
  return (
    <AuthShell
      eyebrow="WELCOME BACK"
      title="계정으로 로그인하세요"
      description="세션은 서버에서 관리되며 유휴 시간과 절대 만료 시간이 지나면 자동으로 종료됩니다."
    >
      <LoginForm verified={verified === "1"} />
    </AuthShell>
  );
}
