"use client";

import { useState } from "react";

export function ListingTransactionSortFields({
  initialSort,
  initialTransactionType,
}: {
  initialSort?: string;
  initialTransactionType?: string;
}) {
  const [transactionType, setTransactionType] = useState(
    initialTransactionType ?? "",
  );
  const [sort, setSort] = useState(initialSort ?? "LATEST");
  const priceSort = sort === "PRICE_ASC" || sort === "PRICE_DESC";

  return (
    <>
      <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700">
        거래 유형
        <select
          name="transactionType"
          value={transactionType}
          onChange={(event) => {
            const value = event.target.value;
            setTransactionType(value);
            if (!value && priceSort) setSort("LATEST");
          }}
          className="w-full min-w-0 rounded-xl border border-stone-300 bg-white px-3 py-3 font-normal"
        >
          <option value="">전체</option>
          <option value="SALE">매매</option>
          <option value="JEONSE">전세</option>
          <option value="MONTHLY_RENT">월세</option>
        </select>
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700">
        정렬
        <select
          name="sort"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="w-full min-w-0 rounded-xl border border-stone-300 bg-white px-3 py-3 font-normal"
        >
          <option value="LATEST">최신순</option>
          <option value="PRICE_ASC" disabled={!transactionType}>
            가격 낮은순
          </option>
          <option value="PRICE_DESC" disabled={!transactionType}>
            가격 높은순
          </option>
          <option value="AREA_ASC">전용면적 작은순</option>
          <option value="AREA_DESC">전용면적 큰순</option>
        </select>
        {!transactionType && (
          <span className="text-xs font-normal text-slate-500">
            가격순은 거래 유형을 함께 선택해야 합니다.
          </span>
        )}
      </label>
    </>
  );
}
