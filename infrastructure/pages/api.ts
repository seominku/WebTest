import type { PublicListingDetail } from "@real-estate/shared";
import data from "./pages-listings.json";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Fail locally. No HTTP, cookies, account simulation, or persistent writes.
export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (
    (!init.method || init.method.toUpperCase() === "GET") &&
    /^\/listings\/[^/?]+$/.test(path)
  ) {
    const listing = (data as PublicListingDetail[]).find(
      (item) => path === `/listings/${item.id}`,
    );
    if (listing) return listing as T;
  }
  throw new ApiError(
    "원본 화면 미리보기에서는 서버 기능을 사용할 수 없습니다.",
    503,
  );
}

export function apiAssetUrl(path: string): string {
  const prefix = "/WebTest/sample-listings/";
  if (path.startsWith(prefix)) return path;
  if (path.startsWith("/sample-listings/")) return `/WebTest${path}`;
  return "/WebTest/sample-listings/seoul-forest-exterior.webp";
}
