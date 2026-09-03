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

// Same honesty rule, applied to price_history: "Is this a good price?"
// (see src/lib/priceInsight.ts) only computes a lowest/highest/average
// range once at least this many distinct calendar days of observation
// exist for the exact (hotel, checkIn) pair. Below the threshold the UI
// must show "not enough observations yet," never a range built from one
// or two data points dressed up as a trend - see DECISIONS.md, "Phase 1
// (Layer A): Verified Rate panel, Is this a good price?, RateManifest
// Verdict (2026-09-03)."
export const MIN_OBSERVATION_DAYS_FOR_PRICE_INSIGHT = 3;
