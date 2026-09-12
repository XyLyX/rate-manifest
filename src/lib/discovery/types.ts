// The generic discovery-side "Source Normaliser" - claude/discovery-
// property-graph-architecture.md ("FROZEN 2026-09-12"), Section 9: "build
// the generic Normaliser from day one, even with only one source behind
// it. Do not hard-wire Google directly into Page 1 components." This is
// the same idea as SUPPLIER_ADAPTERS (src/lib/suppliers/index.ts), which
// already normalizes every rate source into one common SupplierOffer shape
// before scoring/verdict logic ever sees it - applied one layer earlier, to
// property discovery instead of rates.
//
// Pipeline (Section 9's diagram): Source -> Adapter -> Normalised Hotel ->
// Identity -> RateManifest Property. Today there is exactly one adapter
// (curatedCatalogSource.ts, wrapping RateManifest's own hand-picked hotels
// table) - Track B's real discovery vendor (Google Hotels via SerpApi or an
// alternative, still being evaluated by Navin) becomes a second
// implementation of DiscoverySource, not a rewrite of Page 1/Page 2.

import type { PropertyState } from "@/lib/constants";

/**
 * A single property as returned by a discovery source, already normalized
 * to RateManifest's own shape - see the frozen spec, Section 2's "Hotel
 * card fields" decision: image, name, area/location, star rating, and an
 * optional short factual descriptor. Deliberately carries NO price field
 * at all, not even an optional one - the frozen "never render/suppress
 * price on Page 1 or Page 2" rule (Section 3) is enforced here at the type
 * level, not by convention in a component that could forget to omit it.
 *
 * `sourceId` and `sourcePropertyId` are the raw identity a given source
 * returned (Section 6, "Canonical Property Identity") - kept even though
 * today's only source (the curated catalog) is also RateManifest's own
 * canonical id, so that a future real source's identity-matching step has
 * somewhere to record what it actually saw before any matching happens.
 */
export interface DiscoveredHotel {
  /** RateManifest's own canonical property id, once identified. For the curated-catalog source this IS the identity step - see that adapter's own comment. */
  id: string;
  name: string;
  area: string;
  city: string;
  starRating: number;
  /** Short factual descriptor, if the source provides one - optional per the frozen "if available" wording. No source populates this yet. */
  descriptor?: string;
  /** Source-hosted image URL only (frozen Section 7: "initially source-hosted only... do not download/re-host images by default"). Null when the source has none - the curated catalog never has one (see page.tsx's initial-letter placeholder). */
  imageUrl: string | null;
  /** The RateManifest Property Graph state (src/lib/constants.ts) this record currently carries - see hotels.state's own schema comment. */
  state: PropertyState;
  /** Which DiscoverySource produced this record. */
  sourceId: string;
  /** The identity that source itself uses for this property, before any RateManifest matching. */
  sourcePropertyId: string;
  /** Carried through unchanged from the pre-2026-09-12 Top Hotels card - the existing "Demo" honesty badge for a simulated-data hotel. Not part of the frozen Page 1 spec's field list, kept because removing an existing honesty disclosure isn't this change's job. */
  isMockData: boolean;
}

export interface DiscoverySearchParams {
  destination: string;
  checkIn: string;
  checkOut: string;
  /** Optional cap on how many results to return - discovery should default to broad, not narrow (Section 2: "Page 1 must allow broad exploration"). */
  limit?: number;
}

/**
 * One discovery source, normalized. `search` must never call StayingAPI or
 * any other rate-verification resource (the frozen "critical rule" for
 * Page 1) - a DiscoverySource answers "what properties exist," never "what
 * do they cost."
 */
export interface DiscoverySource {
  id: string;
  search(params: DiscoverySearchParams): Promise<DiscoveredHotel[]>;
}
