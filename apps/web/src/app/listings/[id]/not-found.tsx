import Link from "next/link";

export default function ListingNotFound() {
  return (
    <main className="grid min-h-[70vh] place-items-center bg-stone-50 px-6 text-center">
      <div>
        <p className="font-mono text-sm text-emerald-700">LISTING NOT FOUND</p>
        <h1 className="mt-3 text-3xl font-bold">공개 중인 매물이 아닙니다.</h1>
        <p className="mt-3 text-slate-600">
          삭제·만료됐거나 아직 게시 승인을 받지 않은 매물일 수 있습니다.
        </p>
        <Link
          href="/listings"
          className="mt-7 inline-block rounded-xl bg-slate-950 px-5 py-3 font-bold text-white"
        >
          공개 매물 보기
        </Link>
      </div>
    </main>
  );
}
