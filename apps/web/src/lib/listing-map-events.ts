export const LISTING_MAP_FOCUS_EVENT = "real-estate:listing-map-focus";

export function focusListingOnMap(listingId: string): void {
  window.dispatchEvent(
    new CustomEvent(LISTING_MAP_FOCUS_EVENT, { detail: { listingId } }),
  );
}
