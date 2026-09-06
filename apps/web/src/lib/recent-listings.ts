import type { PublicListingSummary } from "@real-estate/shared";

const STORAGE_KEY = "real-estate:recent-listings:v1";
const MAX_RECENT_LISTINGS = 20;
export const RECENT_LISTINGS_UPDATED = "real-estate:recent-listings-updated";

export interface RecentListingEntry {
  listing: PublicListingSummary;
  viewedAt: string;
}

export function getRecentListings(): RecentListingEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentListingEntry).slice(0, MAX_RECENT_LISTINGS);
  } catch {
    return [];
  }
}

export function recordRecentListing(listing: PublicListingSummary): void {
  const entries = getRecentListings().filter(
    (entry) => entry.listing.id !== listing.id,
  );
  writeRecentListings([
    { listing, viewedAt: new Date().toISOString() },
    ...entries,
  ]);
}

export function removeRecentListing(listingId: string): void {
  writeRecentListings(
    getRecentListings().filter((entry) => entry.listing.id !== listingId),
  );
}

export function clearRecentListings(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    notifyUpdated();
  } catch {
    // 브라우저가 로컬 저장소를 차단하면 기록 기능만 조용히 비활성화한다.
  }
}

function writeRecentListings(entries: RecentListingEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_RECENT_LISTINGS)),
    );
    notifyUpdated();
  } catch {
    // 시크릿 모드·용량 제한 등으로 저장할 수 없는 경우 탐색은 계속 허용한다.
  }
}

function notifyUpdated(): void {
  window.dispatchEvent(new Event(RECENT_LISTINGS_UPDATED));
}

function isRecentListingEntry(value: unknown): value is RecentListingEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<RecentListingEntry>;
  const listing = entry.listing as Partial<PublicListingSummary> | undefined;
  return Boolean(
    typeof entry.viewedAt === "string" &&
    listing &&
    typeof listing.id === "string" &&
    typeof listing.title === "string" &&
    listing.agency &&
    listing.location &&
    listing.price &&
    listing.property,
  );
}
