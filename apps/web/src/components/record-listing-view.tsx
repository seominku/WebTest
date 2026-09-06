"use client";

import type { PublicListingSummary } from "@real-estate/shared";
import { useEffect } from "react";
import { recordRecentListing } from "@/lib/recent-listings";

export function RecordListingView({
  listing,
}: {
  listing: PublicListingSummary;
}) {
  useEffect(() => {
    recordRecentListing(listing);
  }, [listing]);

  return null;
}
