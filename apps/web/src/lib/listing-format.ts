import type {
  PublicListingPrice,
  PublicPropertyType,
  PublicTransactionType,
} from "@real-estate/shared";

export const propertyTypeLabels: Record<PublicPropertyType, string> = {
  APARTMENT: "아파트",
  COMMERCIAL: "상가",
  HOUSE: "주택",
  LAND: "토지",
  OFFICETEL: "오피스텔",
};

export const transactionTypeLabels: Record<PublicTransactionType, string> = {
  JEONSE: "전세",
  MONTHLY_RENT: "월세",
  SALE: "매매",
};

export function formatListingPrice(
  type: PublicTransactionType,
  price: PublicListingPrice,
): string {
  if (type === "SALE" && price.salePriceKrw) {
    return `매매 ${formatKrw(price.salePriceKrw)}`;
  }
  if (type === "JEONSE" && price.depositKrw) {
    return `전세 ${formatKrw(price.depositKrw)}`;
  }
  if (
    type === "MONTHLY_RENT" &&
    price.depositKrw !== null &&
    price.monthlyRentKrw
  ) {
    return `월세 ${formatKrw(price.depositKrw)} / ${formatKrw(price.monthlyRentKrw)}`;
  }
  return "가격 문의";
}

export function formatKrw(value: string): string {
  const amount = BigInt(value);
  const zero = BigInt(0);
  const eokUnit = BigInt(100_000_000);
  const manUnit = BigInt(10_000);
  const eok = amount / eokUnit;
  const man = (amount % eokUnit) / manUnit;
  const won = amount % manUnit;
  const parts: string[] = [];

  if (eok > zero) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (man > zero) parts.push(`${man.toLocaleString("ko-KR")}만`);
  if (won > zero || parts.length === 0)
    parts.push(`${won.toLocaleString("ko-KR")}`);
  return `${parts.join(" ")}원`;
}
