import Link from "next/link";
import { ListingCard } from "@/components/listing-card";
import { ListingMap } from "@/components/listing-map";
import { ListingTransactionSortFields } from "@/components/listing-transaction-sort-fields";
import { SaveSearchButton } from "@/components/save-search-button";
import { ListingAreaFilterFields } from "@/components/listing-area-filter-fields";
import { getListings, type ListingFilters } from "@/lib/listings";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ListingsPage({
  searchParams,
}: PageProps<"/listings">) {
  const raw = (await searchParams) as SearchParams;
  const filters: ListingFilters = {
    maxAreaSquareMeters: first(raw.maxAreaSquareMeters),
    maxPriceManwon: first(raw.maxPriceManwon),
    minAreaSquareMeters: first(raw.minAreaSquareMeters),
    minPriceManwon: first(raw.minPriceManwon),
    page: first(raw.page),
    propertyType: first(raw.propertyType),
    sido: first(raw.sido),
    sigungu: first(raw.sigungu),
    sort: first(raw.sort),
    transactionType: first(raw.transactionType),
  };
  const result = await getListings(filters);

  return (
    <main className="min-h-screen min-w-0 bg-stone-50">
      <section className="border-b border-stone-200 bg-slate-950 text-white">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:px-10">
          <p className="font-mono text-sm tracking-[0.18em] text-emerald-300">
            FIND YOUR PLACE
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
            확인 가능한 매물을 찾아보세요
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            게시 승인과 중개사 상태를 통과한 매물만 공개합니다. 상세 주소는 공개
            범위에 따라 보호됩니다.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
        <form className="grid min-w-0 gap-3 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          <ListingTransactionSortFields
            initialSort={filters.sort}
            initialTransactionType={filters.transactionType}
          />
          <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700">
            매물 유형
            <select
              name="propertyType"
              defaultValue={filters.propertyType ?? ""}
              className="w-full min-w-0 rounded-xl border border-stone-300 bg-white px-3 py-3 font-normal"
            >
              <option value="">전체</option>
              <option value="APARTMENT">아파트</option>
              <option value="HOUSE">주택</option>
              <option value="OFFICETEL">오피스텔</option>
              <option value="COMMERCIAL">상가</option>
              <option value="LAND">토지</option>
            </select>
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700">
            시·도
            <input
              name="sido"
              defaultValue={filters.sido}
              placeholder="예: 서울특별시"
              className="w-full min-w-0 rounded-xl border border-stone-300 px-3 py-3 font-normal"
            />
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700">
            시·군·구
            <input
              name="sigungu"
              defaultValue={filters.sigungu}
              placeholder="예: 성동구"
              className="w-full min-w-0 rounded-xl border border-stone-300 px-3 py-3 font-normal"
            />
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700">
            최소 가격
            <div className="flex min-w-0 items-center rounded-xl border border-stone-300 bg-white pr-3">
              <input
                name="minPriceManwon"
                type="number"
                min="0"
                inputMode="numeric"
                defaultValue={filters.minPriceManwon}
                placeholder="예: 10000"
                className="min-w-0 flex-1 rounded-xl px-3 py-3 font-normal outline-none"
              />
              <span className="text-xs text-slate-500">만원</span>
            </div>
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700">
            최대 가격
            <div className="flex min-w-0 items-center rounded-xl border border-stone-300 bg-white pr-3">
              <input
                name="maxPriceManwon"
                type="number"
                min="0"
                inputMode="numeric"
                defaultValue={filters.maxPriceManwon}
                placeholder="예: 150000"
                className="min-w-0 flex-1 rounded-xl px-3 py-3 font-normal outline-none"
              />
              <span className="text-xs text-slate-500">만원</span>
            </div>
          </label>
          <ListingAreaFilterFields
            initialMaximum={filters.maxAreaSquareMeters}
            initialMinimum={filters.minAreaSquareMeters}
          />
          <button className="self-end rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white transition hover:bg-emerald-800">
            조건 적용
          </button>
        </form>

        <ListingMap listings={result.items} />

        <div className="mt-10 grid gap-4 sm:flex sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-700">공개 매물</p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight">
              총 {result.pagination.total.toLocaleString("ko-KR")}건
            </h2>
          </div>
          <div className="grid justify-items-start gap-2 sm:justify-items-end">
            <SaveSearchButton
              filters={{
                maxAreaSquareMeters: filters.maxAreaSquareMeters,
                maxPriceManwon: filters.maxPriceManwon,
                minAreaSquareMeters: filters.minAreaSquareMeters,
                minPriceManwon: filters.minPriceManwon,
                propertyType: filters.propertyType,
                sido: filters.sido,
                sigungu: filters.sigungu,
                sort: filters.sort,
                transactionType: filters.transactionType,
              }}
            />
            {(filters.transactionType ||
              filters.propertyType ||
              filters.sido ||
              filters.sigungu ||
              filters.minPriceManwon ||
              filters.maxPriceManwon ||
              filters.minAreaSquareMeters ||
              filters.maxAreaSquareMeters ||
              (filters.sort && filters.sort !== "LATEST")) && (
              <Link
                href="/listings"
                className="text-sm font-semibold text-slate-600 underline underline-offset-4"
              >
                조건 초기화
              </Link>
            )}
          </div>
        </div>

        {result.items.length ? (
          <div className="mt-7 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {result.items.map((listing) => (
              <ListingCard key={listing.id} listing={listing} showMapAction />
            ))}
          </div>
        ) : (
          <div className="mt-7 rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-20 text-center">
            <p className="text-2xl font-bold">
              조건에 맞는 공개 매물이 없습니다.
            </p>
            <p className="mt-3 text-slate-600">
              지역이나 거래 유형을 넓혀 다시 찾아보세요.
            </p>
          </div>
        )}

        {result.pagination.totalPages > 1 && (
          <nav
            aria-label="매물 페이지"
            className="mt-10 flex justify-center gap-2"
          >
            {Array.from(
              { length: result.pagination.totalPages },
              (_, index) => index + 1,
            ).map((page) => {
              const query = new URLSearchParams(
                Object.entries(filters).filter(
                  ([key, value]) => key !== "page" && value,
                ) as [string, string][],
              );
              query.set("page", String(page));
              return (
                <Link
                  key={page}
                  href={`/listings?${query}`}
                  aria-current={
                    page === result.pagination.page ? "page" : undefined
                  }
                  className="grid size-10 place-items-center rounded-xl border border-stone-300 bg-white text-sm font-bold aria-[current=page]:border-emerald-700 aria-[current=page]:bg-emerald-700 aria-[current=page]:text-white"
                >
                  {page}
                </Link>
              );
            })}
          </nav>
        )}
      </section>
    </main>
  );
}
