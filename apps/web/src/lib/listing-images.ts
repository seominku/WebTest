const SAMPLE_LISTING_IDS = new Set([
  "60000000-0000-4000-8000-000000000001",
  "60000000-0000-4000-8000-000000000002",
  "60000000-0000-4000-8000-000000000003",
  "60000000-0000-4000-8000-000000000005",
  "60000000-0000-4000-8000-000000000006",
]);

const SAMPLE_IMAGES = [
  "/sample-listings/seoul-forest-exterior.webp",
  "/sample-listings/seoul-forest-living-room.webp",
  "/sample-listings/seoul-forest-bedroom.webp",
];

export function sampleListingImages(id: string): string[] {
  return SAMPLE_LISTING_IDS.has(id) ? SAMPLE_IMAGES : [];
}

export function isSampleListingImage(path: string): boolean {
  return path.startsWith("/sample-listings/");
}
