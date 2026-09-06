import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-stone-50 text-slate-950">
      <section className="mx-auto flex min-h-[72vh] max-w-6xl flex-col justify-center px-6 py-20 lg:px-10">
        <span className="mb-6 w-fit rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
          개발 환경 준비 완료
        </span>
        <h1 className="max-w-4xl text-5xl font-bold tracking-[-0.04em] sm:text-7xl">
          좋은 매물을 찾는 과정도
          <br />
          <span className="text-emerald-700">믿을 수 있어야 합니다.</span>
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
          사용자, 중개사, 관리자의 흐름을 하나로 연결하고 검수 이력과 변경
          기록을 남기는 부동산 매물 플랫폼을 구축하고 있습니다.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-emerald-800"
            href="/listings"
          >
            공개 매물 보기
          </Link>
          <Link
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold transition hover:border-emerald-700 hover:text-emerald-800"
            href="/register"
          >
            무료로 시작하기
          </Link>
        </div>
      </section>

      <section className="border-y border-stone-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-5 px-6 py-14 md:grid-cols-3 lg:px-10">
          {[
            [
              "01",
              "검증 가능한 매물",
              "등록부터 승인, 게시, 만료까지 모든 상태 변화를 추적합니다.",
            ],
            [
              "02",
              "역할 기반 관리",
              "일반 사용자와 중개사, 관리자의 권한을 명확하게 분리합니다.",
            ],
            [
              "03",
              "복구 가능한 운영",
              "상태 확인, 감사 로그, 백업과 롤백을 처음부터 설계합니다.",
            ],
          ].map(([number, title, description]) => (
            <article
              key={number}
              className="rounded-2xl border border-stone-200 p-6"
            >
              <span className="font-mono text-sm text-emerald-700">
                {number}
              </span>
              <h2 className="mt-8 text-xl font-bold">{title}</h2>
              <p className="mt-3 leading-7 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
