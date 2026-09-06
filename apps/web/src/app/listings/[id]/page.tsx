import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatKrw,
  formatListingPrice,
  propertyTypeLabels,
  transactionTypeLabels,
} from "@/lib/listing-format";
import { getListing } from "@/lib/listings";
import { ListingInquiryForm } from "@/components/listing-inquiry-form";
import { RecordListingView } from "@/components/record-listing-view";
import { ListingPhotoGallery } from "@/components/listing-photo-gallery";
import { ListingViewingForm } from "@/components/listing-viewing-form";
import { sampleListingImages } from "@/lib/listing-images";
import { AreaValue } from "@/components/area-value";
import { AreaUnitToggle } from "@/components/area-unit-toggle";
import type { ReactNode } from "react";

export default async function ListingDetailPage({
  params,
}: PageProps<"/listings/[id]">) {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) notFound();
  const images = listing.imagePaths.length
    ? listing.imagePaths
    : sampleListingImages(listing.id);

  const facts: Array<[string, ReactNode]> = [
    ["매물 유형", propertyTypeLabels[listing.property.type]],
    [
      "전용 면적",
      <AreaValue
        key="area-square-meters"
        squareMeters={listing.property.areaSquareMeters}
      />,
    ],
    [
      "층",
      listing.property.floor !== null ? `${listing.property.floor}층` : "-",
    ],
    [
      "방",
      listing.property.rooms !== null ? `${listing.property.rooms}개` : "-",
    ],
    [
      "욕실",
      listing.property.bathrooms !== null
        ? `${listing.property.bathrooms}개`
        : "-",
    ],
  ];

  return (
    <main className="min-h-screen min-w-0 bg-stone-50 pb-20">
      <RecordListingView listing={listing} />
      <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-8 sm:px-6 lg:px-10">
        <Link
          href="/listings"
          className="text-sm font-semibold text-emerald-800"
        >
          ← 매물 목록
        </Link>

        <div className="mt-7 overflow-hidden rounded-3xl bg-slate-950 shadow-sm">
          <div className="relative grid min-w-0 grid-cols-1 place-items-center overflow-hidden text-center text-white">
            {images.length ? (
              <ListingPhotoGallery images={images} title={listing.title} />
            ) : (
              <div className="p-10">
                <p className="font-mono text-sm tracking-[0.22em] text-emerald-100">
                  VERIFIED LISTING
                </p>
                <p className="mt-4 text-4xl font-bold">
                  {propertyTypeLabels[listing.property.type]}
                </p>
                <p className="mt-3 text-emerald-100">대표 이미지 준비 중</p>
              </div>
            )}
          </div>
          <div className="grid gap-5 bg-gradient-to-r from-emerald-950 to-slate-950 p-5 text-white sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-fit rounded-full bg-white/15 px-3 py-1 text-sm font-bold">
                  {transactionTypeLabels[listing.transactionType]}
                </span>
                <p className="text-sm text-emerald-100">
                  {listing.location.sido} {listing.location.sigungu}{" "}
                  {listing.location.eupmyeondong}
                </p>
              </div>
              <h1 className="mt-3 break-keep text-2xl font-bold tracking-tight sm:text-3xl">
                {listing.title}
              </h1>
            </div>
            <p className="shrink-0 text-xl font-bold sm:text-2xl lg:text-right">
              {formatListingPrice(listing.transactionType, listing.price)}
            </p>
          </div>
        </div>

        <div className="mt-8 grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-8">
            <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-7">
              <h2 className="text-2xl font-bold">매물 정보</h2>
              <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4">
                {facts.map(([label, value]) => (
                  <div
                    key={label}
                    className="min-w-0 rounded-2xl bg-stone-50 p-3 sm:p-4"
                  >
                    <dt className="text-xs font-semibold text-slate-500">
                      {label}
                      {label === "전용 면적" && (
                        <AreaUnitToggle className="mt-2 block" />
                      )}
                    </dt>
                    <dd className="mt-2 font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="rounded-3xl border border-stone-200 bg-white p-7">
              <h2 className="text-2xl font-bold">상세 설명</h2>
              <p className="mt-5 whitespace-pre-line leading-8 text-slate-700">
                {listing.description}
              </p>
            </section>

            <section className="rounded-3xl border border-stone-200 bg-white p-7">
              <h2 className="text-2xl font-bold">위치</h2>
              <p className="mt-4 leading-7 text-slate-700">
                {listing.location.roadAddress ??
                  `${listing.location.sido} ${listing.location.sigungu} ${listing.location.eupmyeondong} 일대`}
              </p>
              {!listing.location.roadAddress && (
                <p className="mt-2 text-sm text-slate-500">
                  거주자 개인정보 보호를 위해 상세 주소를 공개하지 않습니다.
                </p>
              )}
            </section>
          </div>

          <aside className="h-fit min-w-0 rounded-3xl border border-stone-200 bg-white p-5 sm:p-7 lg:sticky lg:top-6">
            <p className="text-sm font-semibold text-emerald-700">
              등록 중개사무소
            </p>
            <h2 className="mt-2 text-xl font-bold">{listing.agency.name}</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">담당 중개사</dt>
                <dd className="font-semibold">{listing.agency.agentName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">등록번호</dt>
                <dd className="font-semibold">
                  {listing.agency.registrationNumber}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">대표번호</dt>
                <dd className="font-semibold">{listing.agency.phone}</dd>
              </div>
              {listing.price.maintenanceFeeKrw && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">관리비</dt>
                  <dd className="font-semibold">
                    {formatKrw(listing.price.maintenanceFeeKrw)}
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              현재 데이터는 학습용 가상 매물입니다. 계약 전 등기·권리관계와 현장
              상태를 별도로 확인해야 합니다.
            </p>
            <ListingInquiryForm listingId={listing.id} />
            <ListingViewingForm listingId={listing.id} />
          </aside>
        </div>
      </div>
    </main>
  );
}
