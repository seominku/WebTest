"use client";

export default function ListingsError({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-[70vh] place-items-center bg-stone-50 px-6 text-center">
      <div>
        <p className="font-mono text-sm text-rose-700">LISTINGS UNAVAILABLE</p>
        <h1 className="mt-3 text-3xl font-bold">매물을 불러오지 못했습니다.</h1>
        <p className="mt-3 text-slate-600">
          잠시 후 다시 시도해 주세요. 입력한 검색 조건은 유지됩니다.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-7 rounded-xl bg-slate-950 px-5 py-3 font-bold text-white"
        >
          다시 시도
        </button>
      </div>
    </main>
  );
}
