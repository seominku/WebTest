import "server-only";
import type {
  PublicListingDetail,
  PublicListingsResponse,
} from "@real-estate/shared";

const API_BASE_URL = (
  process.env.API_INTERNAL_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000/api/v1"
).replace(/\/$/, "");

export interface ListingFilters {
  maxAreaSquareMeters?: string;
  maxPriceManwon?: string;
  minAreaSquareMeters?: string;
  minPriceManwon?: string;
  page?: string;
  propertyType?: string;
  sido?: string;
  sigungu?: string;
  sort?: string;
  transactionType?: string;
}

export async function getListings(
  filters: ListingFilters,
): Promise<PublicListingsResponse> {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }

  const response = await fetch(`${API_BASE_URL}/listings?${query}`, {
    // Publication and visibility changes must be reflected on the next request.
    cache: "no-store",
  });
  if (!response.ok) throw new Error("매물 목록을 불러오지 못했습니다.");
  return response.json() as Promise<PublicListingsResponse>;
}

export async function getListing(
  id: string,
): Promise<PublicListingDetail | null> {
  const response = await fetch(`${API_BASE_URL}/listings/${id}`, {
    cache: "no-store",
  });
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new Error("매물 상세를 불러오지 못했습니다.");
  return response.json() as Promise<PublicListingDetail>;
}
