// Shared four-tower platform foundation (Phase 1A) — provider-neutral types.
//
// Nothing in src/lib/platform may import from src/lib/suppliers, src/lib/search
// or anything StayingAPI-related (enforced by platform.test.ts). This module
// is the tower-neutral spine: Trip Component -> Offer Snapshot -> Selection ->
// Commercial Route. Tower-specific data lives in each component's input and
// each offer's payload, never in these shared shapes.

// The four foundational towers. Hotels + Flights is an orchestrated journey
// over two components, not a fifth tower.
export const TOWER_KINDS = ["hotel", "flight", "rail", "cruise"] as const;
export type TowerKind = (typeof TOWER_KINDS)[number];

// "experience" is an additive component kind (attractions, private/group
// tours, transfers). It is deliberately NOT a tower.
export type ComponentKind = TowerKind | "experience";

// status describes the OFFER-SELECTION state of a component, not whether the
// traveller has "chosen" it: "selected" = a current offer selection exists;
// "draft" = none (never made, or invalidated by an input edit). Whether a Hotel
// PROPERTY has been chosen is carried independently by HotelInput.propertyId
// (see getPropertyChoice in src/lib/hotel/decision.ts), so a chosen hotel with
// no rate/offer is correctly "draft".
export type ComponentStatus = "draft" | "selected";

// --- Tower input contracts -------------------------------------------------

export interface HotelInput {
  destination: string;
  checkIn: string; // ISO date YYYY-MM-DD
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
  // Catalogue identity of the chosen property, once the traveller has chosen one (Hotel V1).
  propertyId?: string;
}

export interface FlightLeg {
  from: string;
  to: string;
  departure: string; // ISO date YYYY-MM-DD
}

export interface FlightInput {
  tripType: "one_way" | "return" | "multi_city";
  legs: FlightLeg[];
  returnDate?: string; // only when tripType === "return"
  travellers: { adults: number; children: number };
  cabin?: string;
  nonstopOnly?: boolean;
}

// Rail: the final field set is established against the first real Rail source
// (Phase 2). This is only the extensible boundary that accepts it.
export type RailInput = Record<string, unknown>;

// Cruise: reference evidence supports only a destination/cruise query and a
// departure date. Ports, duration, cabin etc. are NOT locked here.
export interface CruiseInput {
  query: string;
  departureDate?: string;
  // Any further fields (e.g. a departure port, once a real source supplies
  // one) are source-specific and deliberately not part of this contract.
  [sourceSpecific: string]: unknown;
}

// Experiences are additive components, not a tower. Private Tours and Group
// Tours are distinct categories alongside attractions, activities and
// transfers. Other context stays free-form until a real experience flow needs it.
export const EXPERIENCE_CATEGORIES = ["attraction", "activity", "private_tour", "group_tour", "transfer"] as const;
export type ExperienceCategory = (typeof EXPERIENCE_CATEGORIES)[number];

export interface ExperienceInput {
  category: ExperienceCategory;
  [context: string]: unknown;
}

export interface ComponentInputByKind {
  hotel: HotelInput;
  flight: FlightInput;
  rail: RailInput;
  cruise: CruiseInput;
  experience: ExperienceInput;
}

// --- Trip component --------------------------------------------------------

export interface TripComponent<K extends ComponentKind = ComponentKind> {
  id: string;
  tripId: string;
  kind: K;
  position: number;
  status: ComponentStatus;
  input: ComponentInputByKind[K];
  createdAt: Date;
  updatedAt: Date;
}

// --- Merchant vs access route ---------------------------------------------

// The travel merchant / source (e.g. Trip.com). One row per merchant, however
// many networks reach it.
export interface Merchant {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
}

// How Rate Manifest reaches / monetises a merchant (e.g. an affiliate
// network, or the merchant's own site). Never a merchant itself.
export type AccessRouteKind = "affiliate_network" | "direct";

export interface AccessRoute {
  id: string;
  slug: string;
  name: string;
  kind: AccessRouteKind;
  createdAt: Date;
}

export type MerchantAccessStatus = "unverified" | "approved" | "inactive";

export interface MerchantAccessLink {
  id: string;
  merchantId: string;
  accessRouteId: string;
  status: MerchantAccessStatus;
}

// --- Offer snapshot & provenance -------------------------------------------

// WHY / WHERE the offer entered the decision. Says nothing about monetisation.
export interface DecisionProvenance {
  enteredVia: string; // e.g. "source_search", "compare_shortlist", "partner_package"
  evidenceRefs: string[];
}

// The genuinely shared offer fields. Tower-specific detail is `payload`.
export interface OfferSnapshot {
  id: string;
  componentId: string;
  kind: ComponentKind;
  merchantId: string;
  externalRef: string | null; // the source's own id for this offer, if any
  currency: string;
  totalPrice: number;
  // The merchant/source URL as returned by the source, before any commercial
  // routing. NOT a claim that it is attributed or valid for handoff.
  sourceUrl: string | null;
  capturedAt: Date;
  payload: Record<string, unknown>;
  provenance: DecisionProvenance;
}

// --- Selection -------------------------------------------------------------

// The chosen offer for ONE component. At most one selection per component;
// selections on different components never interact.
export interface Selection {
  id: string;
  componentId: string;
  offerId: string;
  selectedAt: Date;
}

// --- Commercial route & attribution ---------------------------------------

export type RouteType = "affiliate_outbound" | "direct_outbound" | "inquiry_only" | "unavailable";
export type RouteEligibility = "eligible" | "ineligible" | "unknown";

// Evidence that a tracked/affiliated URL was actually produced. Supplied by a
// future integration (e.g. a network link converter); never inferred.
export interface TrackingEvidence {
  method: string; // e.g. "network_link_conversion"
  trackedUrl: string;
  verifiedAt: string; // ISO timestamp
  // Optional detail from the access route (e.g. the network campaign that confirmed it).
  campaignId?: number | null;
  // Opaque Rate Manifest attribution identifier sent to the network as the
  // publisher Sub-ID. Never derived from traveller data. Stored with the
  // route's attribution JSON (no schema change).
  attributionId?: string;
}

// --- Commercial handoff (no inventory) ------------------------------------

// Phase 2 addition. A commercial-only route to a merchant WITHOUT an ingested
// offer: "this component's context will be handed to this merchant". It
// carries no price on purpose - a merchant page may show live prices, but
// that does not make them Rate Manifest inventory. It is the priceless
// counterpart of OfferSnapshot and is routed through the same access-route /
// attribution rules. `contextInput` is a snapshot of the component's input at
// handoff time; if the component is edited afterwards the handoff is stale.
export interface CommercialHandoff {
  id: string;
  componentId: string;
  merchantId: string;
  contextInput: Record<string, unknown>;
  // Where the merchant handoff lands, exactly as configured/provided. Not a claim of attribution.
  landingUrl: string | null;
  provenance: DecisionProvenance;
  createdAt: Date;
}

export type AttributionStatus = "none" | "tracked";

export interface Attribution {
  status: AttributionStatus;
  evidence: TrackingEvidence | null;
}

export type UnavailableReason = "no_booking_url" | "no_access_route" | "attribution_unverified";

export interface CommercialRoute {
  id: string;
  // Exactly one of selectionId (priced offer) or handoffId (commercial-only) is set.
  selectionId: string | null;
  handoffId: string | null;
  componentId: string;
  merchantId: string;
  accessRouteId: string | null;
  routeType: RouteType;
  eligibility: RouteEligibility;
  destinationUrl: string | null;
  attribution: Attribution;
  reason: UnavailableReason | null;
  resolvedAt: Date;
}
