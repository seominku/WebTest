import "server-only";
import type {
  PublicListingDetail,
  PublicListingsResponse,
} from "@real-estate/shared";
import data from "./pages-listings.json";

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
  _filters: ListingFilters,
): Promise<PublicListingsResponse> {
  return {
    items: data as PublicListingDetail[],
    pagination: { page: 1, pageSize: 12, total: data.length, totalPages: 1 },
  };
}

export async function getListing(
  id: string,
): Promise<PublicListingDetail | null> {
  return (data as PublicListingDetail[]).find((item) => item.id === id) ?? null;
}
