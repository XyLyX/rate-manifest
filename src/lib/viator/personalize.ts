import type { ThingsToDoProduct } from "./types";
import type { TripPurpose } from "@/lib/constants";

// Page 3 (Complete Your Trip)'s personalization - see
// claude/travel-decision-platform-assessment.md, "RateManifest — Final
// Customer Journey": "personalization... should feel intelligent, not
// generic," with explicit non-generic examples per trip type (a couple
// gets a sunset cruise or fine dining, a family gets water parks or
// aquariums, and so on).
//
// Deliberately a keyword re-ranking over Viator's own real search results,
// never a second, invented recommendation list - see
// src/lib/viator/searchThingsToDo.ts's own "skip rather than guess" rule
// and DECISIONS.md's standing rule against fabricated signals. Every
// product shown was genuinely returned by Viator for this destination and
// date range; this only changes the ORDER a customer sees them in, moving
// the ones that plausibly match their stated trip purpose to the front.
// No product is added, removed, or re-labeled, and nothing here claims a
// product "is perfect for families" - the UI decides what to say about
// the reordering, not this function.
//
// A keyword match against title + shortDescription is a blunt instrument
// (it will miss a "romantic dhow cruise" that happens to be titled just
// "Dhow Cruise Dinner" in a language Viator didn't tag with the word
// "romantic") - that's an accepted, honest limitation of working from
// title/description text alone, not a bug to silently paper over with
// invented category data Viator didn't actually provide.
const PURPOSE_KEYWORDS: Record<Exclude<TripPurpose, "UNSPECIFIED">, string[]> = {
  COUPLE: ["romantic", "sunset", "couple", "private", "yacht", "dinner cruise", "spa", "candlelight"],
  FAMILY: ["family", "kids", "child", "water park", "aquarium", "zoo", "theme park", "farm"],
  SOLO: ["walking tour", "group tour", "city tour", "food tour", "hop-on", "hop on", "backpacker"],
  BUSINESS: ["half-day", "half day", "express", "skip-the-line", "skip the line", "evening", "quick"],
  FIRST_TIME: ["iconic", "must-see", "must see", "highlights", "top attractions", "city tour", "observation deck", "at the top"],
};

function matchesPurpose(product: ThingsToDoProduct, purpose: Exclude<TripPurpose, "UNSPECIFIED">): boolean {
  const haystack = `${product.title} ${product.shortDescription}`.toLowerCase();
  return PURPOSE_KEYWORDS[purpose].some((kw) => haystack.includes(kw));
}

/**
 * Stable partition, not a re-score: products matching the trip's stated
 * purpose move to the front, in the same relative order Viator returned
 * them (already sorted by traveler rating - see searchThingsToDo.ts);
 * everything else follows, also in its original order. "UNSPECIFIED" (the
 * default when Page 1's trip-intent chips are skipped) returns the list
 * completely untouched - no purpose stated means no reordering claim.
 */
export function personalizeThingsToDo(products: ThingsToDoProduct[], purpose: TripPurpose): ThingsToDoProduct[] {
  if (purpose === "UNSPECIFIED") return products;

  const matched: ThingsToDoProduct[] = [];
  const rest: ThingsToDoProduct[] = [];
  for (const product of products) {
    (matchesPurpose(product, purpose) ? matched : rest).push(product);
  }
  return [...matched, ...rest];
}
