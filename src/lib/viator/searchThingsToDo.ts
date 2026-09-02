import { isViatorConfigured, viatorFetch } from "./client";
import { resolveDestinationId } from "./destinations";
import type { ThingsToDoProduct, ThingsToDoSearchParams } from "./types";

// The one real call in this first, deliberately small build - see
// DECISIONS.md, "Decision: build a native Viator Things To Do
// integration," and "Viator adapter: confirmed against the real OpenAPI
// spec." POST /products/search, request/response shapes below confirmed
// directly against the OpenAPI spec pulled from the user's own Viator
// dashboard, not guessed from public docs.

interface ImageVariant {
  height: number;
  width: number;
  url: string;
}

interface ProductImage {
  isCover: boolean;
  variants: ImageVariant[];
}

interface ProductSummary {
  productCode: string;
  title?: string;
  description?: string;
  images?: ProductImage[];
  reviews?: {
    totalReviews: number;
    combinedAverageRating?: number;
  };
  pricing?: {
    currency: string;
    summary?: {
      fromPrice?: number;
    };
  };
  productUrl?: string;
}

interface ProductSearchResponse {
  products: ProductSummary[];
  // The spec's own `required` list names this `total`, but the actual
  // property in the schema is `totalCount` - a real inconsistency in
  // Viator's spec, not a typo introduced here. Read defensively.
  totalCount?: number;
}

// Picks the largest available variant of the cover image (falling back to
// the first image/variant if no image is explicitly flagged as cover) -
// good enough for a card thumbnail without needing every size Viator
// returns.
function pickImageUrl(images?: ProductImage[]): string | null {
  if (!images || images.length === 0) return null;
  const cover = images.find((img) => img.isCover) ?? images[0];
  if (!cover || !cover.variants || cover.variants.length === 0) return null;
  const largest = [...cover.variants].sort((a, b) => b.width - a.width)[0];
  return largest ? largest.url : null;
}

function toThingsToDoProduct(product: ProductSummary, checkedAt: string): ThingsToDoProduct | null {
  // A product missing its own code or a price to show isn't safely
  // renderable as a card - same "skip rather than guess" rule as every
  // other adapter's malformed-row handling in this app.
  if (!product.productCode || product.pricing?.summary?.fromPrice == null) return null;

  return {
    supplierProductId: product.productCode,
    supplierSlug: "viator",
    supplierName: "Viator",
    title: product.title ?? "Untitled experience",
    shortDescription: product.description ?? "",
    imageUrl: pickImageUrl(product.images),
    rating: product.reviews?.combinedAverageRating ?? null,
    reviewCount: product.reviews?.totalReviews ?? 0,
    currency: product.pricing?.currency ?? "USD",
    fromPrice: product.pricing.summary.fromPrice,
    // Search results are already filtered to the requested date range
    // (filtering.startDate/endDate below), but that is not the same as a
    // real-time confirmation for one specific date and traveler count -
    // Viator's own docs recommend a separate /availability/check
    // immediately before presenting something as bookable. Not called
    // here yet - see DECISIONS.md for why this stays a documented next
    // step (a per-product, per-date call) rather than one more call per
    // card on a destination-search page.
    confirmedAvailable: false,
    // Pre-attributed by Viator itself (confirmed in the spec: "This URL
    // includes all the necessary information for Viator to correctly
    // attribute and pay commission... You must use the full URL and not
    // modify it in any way"). Never rewritten here.
    bookingUrl: product.productUrl ?? `https://www.viator.com/tours/${product.productCode}`,
    checkedAt,
  };
}

/**
 * Searches Viator for real, live things-to-do products in one destination
 * over a date range. Returns [] on no configuration, no destination
 * match, or any API failure - never throws - so a missing/broken Viator
 * integration degrades the same way a missing supplier adapter does
 * elsewhere in this app: one fewer source, not a broken page.
 */
export async function searchThingsToDo(params: ThingsToDoSearchParams): Promise<ThingsToDoProduct[]> {
  if (!isViatorConfigured()) return [];

  try {
    const destinationId = await resolveDestinationId(params.destinationName);
    if (destinationId == null) return [];

    const response = await viatorFetch<ProductSearchResponse>("/products/search", {
      method: "POST",
      body: {
        filtering: {
          destination: String(destinationId),
          startDate: params.startDate,
          endDate: params.endDate,
        },
        sorting: { sort: "TRAVELER_RATING", order: "DESCENDING" },
        pagination: { start: 1, count: 12 },
        currency: params.currency,
      },
    });

    const checkedAt = new Date().toISOString();
    return response.products
      .map((product) => toThingsToDoProduct(product, checkedAt))
      .filter((product): product is ThingsToDoProduct => product !== null);
  } catch (error) {
    // Logged, not thrown - a Things To Do outage must never take down the
    // hotel search page this renders alongside. See DECISIONS.md.
    console.error("searchThingsToDo failed:", error);
    return [];
  }
}
