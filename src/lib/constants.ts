// Closed sets for the String fields in prisma/schema.prisma that stand in
// for enums (SQLite has no native enum type — see the schema file header).
// Treat these as the source of truth; the Prisma schema comments point back
// here.

export const SUPPLIER_INTEGRATION_TYPES = [
  "mock",
  "affiliate_widget",
  "api_partner",
] as const;
export type SupplierIntegrationType = (typeof SUPPLIER_INTEGRATION_TYPES)[number];

export const BOOKING_OUTCOME_STATUSES = [
  "clicked",
  "confirmed_via_followup",
  "issue_reported",
  "unknown",
] as const;
export type BookingOutcomeStatus = (typeof BOOKING_OUTCOME_STATUSES)[number];

export const EVENT_TYPES = [
  "search",
  "results_viewed",
  "rate_revealed",
  "outbound_click",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const PRICE_TRACKING_STATUSES = ["active", "triggered", "sent", "cancelled"] as const;
export type PriceTrackingStatus = (typeof PRICE_TRACKING_STATUSES)[number];

// A Supplier's reliabilityScore is null until it has at least this many
// BookingOutcome rows — below the threshold the UI shows the mandatory
// "new partner — reliability data building" empty state (Blueprint,
// Section A) rather than a number computed from too little data.
export const MIN_BOOKING_OUTCOMES_FOR_RELIABILITY_SCORE = 10;
