import Link from "next/link";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,0.9fr)_minmax(32rem,1.1fr)]">
      <section className="hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="text-sm font-semibold text-emerald-300">
          ← 홈으로
        </Link>
        <div className="max-w-lg">
          <p className="font-mono text-sm text-emerald-300">
            VERIFIED LISTINGS
          </p>
          <p className="mt-6 text-4xl font-bold leading-tight tracking-tight">
            매물의 시작부터 거래 완료까지, 확인 가능한 기록으로 연결합니다.
          </p>
          <p className="mt-6 leading-7 text-slate-300">
            세션과 권한, 검수 이력을 처음부터 안전하게 설계한 부동산
            플랫폼입니다.
          </p>
        </div>
        <p className="text-sm text-slate-500">로컬 개발 인증 흐름</p>
      </section>

      <section className="flex items-center justify-center bg-stone-50 px-6 py-14 sm:px-10">
        <div className="w-full max-w-md">
          <p className="font-mono text-xs font-bold tracking-[0.18em] text-emerald-700">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 leading-7 text-slate-600">{description}</p>
          <div className="mt-9">{children}</div>
        </div>
      </section>
    </main>
  );
}
