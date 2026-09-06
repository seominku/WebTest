export type ServiceStatus = "ok" | "degraded" | "unavailable";

export interface HealthResponse {
  service: "api" | "web";
  status: ServiceStatus;
  timestamp: string;
  version: string;
}

export type PublicPropertyType =
  "APARTMENT" | "HOUSE" | "OFFICETEL" | "COMMERCIAL" | "LAND";

export type PublicTransactionType = "SALE" | "JEONSE" | "MONTHLY_RENT";

export interface PublicListingPrice {
  depositKrw: string | null;
  maintenanceFeeKrw: string | null;
  monthlyRentKrw: string | null;
  salePriceKrw: string | null;
}

export interface PublicListingSummary {
  agency: {
    agentName: string;
    name: string;
    phone: string;
    registrationNumber: string;
  };
  id: string;
  imageCount: number;
  primaryImagePath: string | null;
  location: {
    eupmyeondong: string;
    latitude: number | null;
    longitude: number | null;
    roadAddress: string | null;
    sido: string;
    sigungu: string;
  };
  price: PublicListingPrice;
  property: {
    areaSquareMeters: string;
    bathrooms: number | null;
    floor: number | null;
    rooms: number | null;
    type: PublicPropertyType;
  };
  publishedAt: string;
  summary: string;
  title: string;
  transactionType: PublicTransactionType;
}

export interface PublicListingDetail extends PublicListingSummary {
  description: string;
  imagePaths: string[];
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PublicListingsResponse {
  items: PublicListingSummary[];
  pagination: PaginationMeta;
}

export interface FavoriteListingsResponse {
  items: PublicListingSummary[];
}

export type ListingSort =
  "LATEST" | "PRICE_ASC" | "PRICE_DESC" | "AREA_ASC" | "AREA_DESC";

export interface SavedSearchFilters {
  maxAreaSquareMeters: string | null;
  maxPriceManwon: string | null;
  minAreaSquareMeters: string | null;
  minPriceManwon: string | null;
  propertyType: PublicPropertyType | null;
  sido: string | null;
  sigungu: string | null;
  sort: ListingSort;
  transactionType: PublicTransactionType | null;
}

export interface SavedSearchSummary {
  createdAt: string;
  filters: SavedSearchFilters;
  id: string;
  name: string;
  unreadMatchCount: number;
  updatedAt: string;
}

export interface SavedSearchesResponse {
  items: SavedSearchSummary[];
}

export interface SavedSearchMatchSummary {
  createdAt: string;
  id: string;
  listing: PublicListingSummary;
  savedSearch: { id: string; name: string };
  viewedAt: string | null;
}

export interface SavedSearchMatchesResponse {
  items: SavedSearchMatchSummary[];
  pagination: PaginationMeta;
}

export type InquiryStatus = "OPEN" | "RESPONDED" | "CLOSED";

export interface InquirySummary {
  createdAt: string;
  id: string;
  listing: {
    id: string;
    title: string;
  };
  message: string;
  respondedAt: string | null;
  responseMessage: string | null;
  responseViewedAt: string | null;
  status: InquiryStatus;
  updatedAt: string;
}

export interface ReceivedInquirySummary extends InquirySummary {
  customer: {
    displayName: string;
  };
}

export interface InquiriesResponse {
  items: InquirySummary[];
  pagination: PaginationMeta;
}

export interface ReceivedInquiriesResponse {
  items: ReceivedInquirySummary[];
  pagination: PaginationMeta;
}

export type ViewingStatus = "PENDING" | "CONFIRMED" | "DECLINED" | "CANCELLED";

export type ViewingProposalRole = "CUSTOMER" | "AGENT";
export type ViewingProposalStatus =
  "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";

export interface ViewingRescheduleProposalSummary {
  createdAt: string;
  id: string;
  message: string | null;
  proposedAt: string;
  proposedByRole: ViewingProposalRole;
  respondedAt: string | null;
  responseMessage: string | null;
  status: ViewingProposalStatus;
}

export interface ViewingAppointmentSummary {
  createdAt: string;
  customer?: { displayName: string };
  id: string;
  listing: { id: string; title: string };
  message: string | null;
  requestedAt: string;
  respondedAt: string | null;
  responseMessage: string | null;
  rescheduleProposal: ViewingRescheduleProposalSummary | null;
  status: ViewingStatus;
  updatedAt: string;
}

export interface ViewingAppointmentsResponse {
  items: ViewingAppointmentSummary[];
}

export type ManagedListingStatus =
  | "DRAFT"
  | "REVIEW_PENDING"
  | "NEEDS_CHANGES"
  | "APPROVED"
  | "PUBLISHED"
  | "PAUSED"
  | "EXPIRED"
  | "COMPLETED"
  | "REJECTED"
  | "DELETED";

export interface ManagedListingSummary {
  completedAt: string | null;
  expiresAt: string | null;
  id: string;
  latestReviewNote: string | null;
  location: string;
  propertyType: PublicPropertyType;
  publishedAt: string | null;
  status: ManagedListingStatus;
  title: string;
  transactionType: PublicTransactionType;
  updatedAt: string;
  version: number;
}

export interface ReviewQueueListing extends ManagedListingDetail {
  agency: {
    agentName: string;
    name: string;
    registrationNumber: string;
  };
}

export interface ReviewQueueResponse {
  items: ReviewQueueListing[];
}

export interface PublicationQueueResponse {
  items: ReviewQueueListing[];
}

export interface ManagedListingsResponse {
  items: ManagedListingSummary[];
}

export interface ManagedListingDetail extends ManagedListingSummary {
  address: {
    detailAddress: string | null;
    eupmyeondong: string;
    postalCode: string | null;
    roadAddress: string;
    sido: string;
    sigungu: string;
    visibility: "APPROXIMATE" | "EXACT_AFTER_INQUIRY" | "PUBLIC";
  };
  description: string;
  images: ListingImage[];
  price: PublicListingPrice;
  property: {
    areaSquareMeters: string;
    bathrooms: number | null;
    buildYear: number | null;
    floor: number | null;
    rooms: number | null;
    totalFloors: number | null;
    type: PublicPropertyType;
  };
}

export interface ListingImage {
  contentPath: string | null;
  height: number | null;
  id: string;
  mimeType: string;
  rejectionReason: string | null;
  sizeBytes: number;
  sortOrder: number;
  status: "UPLOADED" | "SCANNING" | "READY" | "REJECTED";
  thumbnailPath: string | null;
  width: number | null;
}
