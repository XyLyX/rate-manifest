// Hotel/property catalog discovery types. Used by Page 1 (Discover) to
// resolve a destination to a shortlist of hotel objects. No price data,
// no StayingAPI contact of any kind.
//
// Separate from src/lib/price-discovery/ (market price ranges for the
// Compare page) and src/lib/suppliers/ (StayingAPI / Check IQ).
import type { PropertyState } from "@/lib/constants";

export interface DiscoverySearchParams {
  destination: string;
  checkIn?: string;
  checkOut?: string;
  limit?: number;
}

export interface DiscoveredHotel {
  id: string;
  name: string;
  area: string;
  city: string;
  starRating: number;
  imageUrl: string | null;
  state: PropertyState;
  sourceId: string;
  sourcePropertyId: string;
  isMockData: boolean;
}

export interface DiscoverySource {
  id: string;
  search(params: DiscoverySearchParams): Promise<DiscoveredHotel[]>;
}
