"use client";

import type { PublicListingSummary } from "@real-estate/shared";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import {
  formatKrw,
  formatListingPrice,
  propertyTypeLabels,
  transactionTypeLabels,
} from "@/lib/listing-format";
import { useAuth } from "./auth-provider";
import { useFavorites } from "./favorites-provider";
import { ListingMap } from "./listing-map";
import { formatArea } from "@/lib/area";
import { useAreaUnit } from "./area-unit-provider";

export function CompareListingsPanel() {
  const { areaUnit } = useAreaUnit();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { items, loading } = useFavorites();
  const ids = Array.from(
    new Set(
      (searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 3),
    ),
  );
  const listings = ids
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is PublicListingSummary => Boolean(item));

  if (authLoading || loading) {
    return <p className="text-slate-500">비교할 매물을 불러오는 중…</p>;
  }
  if (!user) {
    return (
      <MessageCard>
        <Link href="/login" className="font-bold text-emerald-800 underline">
          로그인
        </Link>
        후 관심 매물을 비교할 수 있습니다.
      </MessageCard>
    );
  }
  if (listings.length < 2) {
    return (
      <MessageCard>
        비교하려면 관심 매물에서 2개 이상을 선택해 주세요.
        <Link
          href="/favorites"
          className="mt-4 block font-bold text-emerald-800 underline"
        >
          관심 매물로 이동
        </Link>
      </MessageCard>
    );
  }

  const rows: Array<{
    label: string;
    value: (listing: PublicListingSummary) => ReactNode;
  }> = [
    {
      label: "거래 유형",
      value: (listing) => transactionTypeLabels[listing.transactionType],
    },
    {
      label: "가격",
      value: (listing) =>
        formatListingPrice(listing.transactionType, listing.price),
    },
    {
      label: "전용면적",
      value: (listing) =>
        formatArea(listing.property.areaSquareMeters, areaUnit),
    },
    {
      label: "매물 유형",
      value: (listing) => propertyTypeLabels[listing.property.type],
    },
    {
      label: "층·방·욕실",
      value: (listing) =>
        [
          listing.property.floor !== null
            ? `${listing.property.floor}층`
            : null,
          listing.property.rooms !== null
            ? `방 ${listing.property.rooms}`
            : null,
          listing.property.bathrooms !== null
            ? `욕실 ${listing.property.bathrooms}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || "-",
    },
    {
      label: "위치",
      value: (listing) =>
        `${listing.location.sido} ${listing.location.sigungu} ${listing.location.eupmyeondong}`,
    },
    {
      label: "관리비",
      value: (listing) =>
        listing.price.maintenanceFeeKrw
          ? formatKrw(listing.price.maintenanceFeeKrw)
          : "정보 없음",
    },
    {
      label: "중개사무소",
      value: (listing) => listing.agency.name,
    },
    {
      label: "담당·연락처",
      value: (listing) => (
        <>
          {listing.agency.agentName}
          <br />
          <span className="text-slate-500">{listing.agency.phone}</span>
        </>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-slate-600">
          선택한 {listings.length}개 매물을 비교하고 있습니다.
        </p>
        <Link
          href="/favorites"
          className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-slate-700"
        >
          비교 대상 다시 선택
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-left">
          <thead>
            <tr>
              <th className="w-32 border-b border-r border-stone-200 bg-stone-50 p-4 text-sm text-slate-500">
                비교 항목
              </th>
              {listings.map((listing) => (
                <th
                  key={listing.id}
                  className="border-b border-stone-200 p-5 align-top"
                >
                  <Link
                    href={`/listings/${listing.id}`}
                    className="text-lg font-bold text-slate-950 hover:text-emerald-800"
                  >
                    {listing.title}
                  </Link>
                  <p className="mt-2 text-xs font-semibold text-emerald-700">
                    상세 보기 →
                  </p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th className="border-r border-t border-stone-200 bg-stone-50 p-4 text-sm font-bold text-slate-600">
                  {row.label}
                </th>
                {listings.map((listing) => (
                  <td
                    key={listing.id}
                    className="border-t border-stone-200 p-4 align-top text-sm font-medium leading-6 text-slate-800"
                  >
                    {row.value(listing)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {listings.some(
        (listing) =>
          listing.location.latitude !== null &&
          listing.location.longitude !== null,
      ) && (
        <div className="mt-8">
          <ListingMap listings={listings} />
        </div>
      )}
    </div>
  );
}

function MessageCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-slate-600">
      {children}
    </div>
  );
}
