// Rate Manifest - data model, implemented with Drizzle ORM against Postgres
// (Netlify DB, auto-provisioned - see DECISIONS.md, "Hosting: Netlify DB").
//
// Implements the seven objects from the Blueprint (Section B): Hotel, Room,
// Rate, Cancellation, Supplier, PriceHistory, BookingOutcome - plus one
// addition, Event, the instrumentation model. Every SEARCH, RESULTS_VIEWED,
// RATE_REVEALED and OUTBOUND_CLICK gets logged there, and this is exactly
// what feeds the D4 MVP Measurement Log in the economics workbook once
// there's real traffic. Nothing about the *shape* of these tables is
// mock-specific - only the Supplier rows and the values a SupplierAdapter
// returns are mock, today.
//
// This was SQLite (via Drizzle + @libsql/client) for local dev, for exactly
// the reason this project deploys nowhere: no persistent disk to put a
// SQLite file on. Now that it's hosted on Netlify, it's on Netlify's own
// auto-provisioned Postgres (via @netlify/database) instead - the port was
// mechanical, exactly as flagged when SQLite was first chosen: swap
// "drizzle-orm/sqlite-core" for "drizzle-orm/pg-core", swap the column
// builders (integer(...,{mode:'boolean'})→boolean(), integer(...,{mode:
// 'timestamp'})→timestamp(), sql`(unixepoch())`→sql`now()`), and point
// src/db/client.ts at a Postgres connection instead of a file. No table,
// column, or relation changed shape.
//
// "Enum" fields below are typed `text` with a TypeScript union type
// (see src/lib/constants.ts) rather than a native Postgres enum - the
// allowed values are enforced in application code, same as before.

import { sql } from "drizzle-orm";
import { pgTable, text, integer, boolean, real, doublePrecision, timestamp, uniqueIndex, index, check } from "drizzle-orm/pg-core";

export const hotels = pgTable("hotels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  area: text("area").notNull(),
  city: text("city").notNull().default("Dubai"),
  starRating: integer("star_rating").notNull(),
  // true until a real supplier feed supplies this hotel's content
  isMockData: boolean("is_mock_data").notNull().default(true),
  // used only by the mock supplier adapter as a price anchor; null once isMockData is false
  mockBasePrice: real("mock_base_price"),
  // 2026-09-11 (claude/rate-manifest-technical-blueprint.md, Section 12,
  // Navin's own developer brief): marks a hotel as part of the curated
  // public "Exceptional Stays" / Rate Manifest IQ launch set
  // (/hotel/[hotelId], /exceptional-stays). Deliberately just a flag, not
  // "has intelligence" - per the brief's own "Critical distinction," a
  // featured hotel with no stored verdict yet must still render "Rate
  // Manifest has not analysed this property yet," never a manufactured
  // score. Default false: every existing hotel row stays un-featured until
  // explicitly curated, so this migration changes nothing about what's
  // currently live.
  featuredInIq: boolean("featured_in_iq").notNull().default(false),
  // 2026-09-12 (claude/discovery-property-graph-architecture.md, "FROZEN
  // 2026-09-12," Section 5): the RateManifest Property Graph's state field
  // - PropertyState in src/lib/constants.ts ("draft" | "verified" |
  // "curated"). Defaults "curated" because every row in this table today
  // was hand-picked the same way the original catalog and the Exceptional
  // Stays set were - see that constant's own comment for why a future
  // automated discovery adapter must set this explicitly rather than rely
  // on the default. Not a traveller-facing badge - Page 2 (Compare &
  // Choose) must not present a "curated" property as better than a
  // "draft" one just because RateManifest already knew about it.
  state: text("state").notNull().default("curated"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`now()`),

  // --- Phase 1.1 Track A (2026-09-12, claude/phase1.1-architecture-
  // decisions.md, Open Question 2): Property Contract enrichment fields.
  // Schema capability only - additive and nullable, per that decision's own
  // instruction: no existing row is required to have a value, and nothing
  // in this migration backfills one. Compare & Choose (src/app/compare/
  // page.tsx) keeps rendering "Not available from the source checked" for
  // any property missing a given field here, exactly as it does today.
  address: text("address"),
  country: text("country"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  // Property category/type (e.g. "resort", "boutique", "business hotel") -
  // free text for now, not a closed enum; the real vocabulary isn't decided
  // yet and inventing one here would be inventing a classification this
  // decision doesn't authorize.
  category: text("category"),
  website: text("website"),
  // JSON-encoded string[] - same "encode as text" convention already used
  // elsewhere in this schema (see events.metadata, verdicts.reasons_json).
  aliases: text("aliases"),
  facilities: text("facilities"),
  accessibilityAttributes: text("accessibility_attributes"),
  images: text("images"),
  // "confirmed" | "unknown", one record-level flag for the enrichment fields
  // above as a group - see src/db/schema.ts's own comment on this column for
  // why this isn't a per-field flag or a new confidence scale.
  enrichmentConfidence: text("enrichment_confidence"),
});

export const rooms = pgTable("rooms", {
  id: text("id").primaryKey(),
  hotelId: text("hotel_id")
    .notNull()
    .references(() => hotels.id, { onDelete: "cascade" }),
  // the normalized room type Layer 2 maps supplier-specific names onto, e.g. "double_standard"
  normalizedType: text("normalized_type").notNull(),
  occupancy: integer("occupancy").notNull().default(2),
  bedConfig: text("bed_config").notNull(),
});

export const suppliers = pgTable("suppliers", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  // "mock" | "affiliate_widget" | "api_partner"
  integrationType: text("integration_type").notNull(),
  requiresClickToReveal: boolean("requires_click_to_reveal").notNull().default(true),
  allowsMultiSupplierDisplay: boolean("allows_multi_supplier_display").notNull().default(true),
  tosNotes: text("tos_notes"),
  // Null, not zero, until there's enough BookingOutcome data - the UI must
  // show "new partner - reliability data building" whenever this is null.
  reliabilityScore: real("reliability_score"),
  bookingOutcomeCount: integer("booking_outcome_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),

  // --- Phase 1.1 Track D (2026-09-13, Commercial Router): five supplier
  // capability flags. All default to the conservative safe value - a supplier
  // is assumed capable of discovery/rate-verification (they already are, by
  // being in the adapter registry) but NOT capable of commercial booking and
  // NOT enrolled in any affiliate programme, until explicitly set otherwise.
  //
  // Being an api_partner does NOT imply supportsCommercialBooking - StayingAPI
  // is integration_type = 'api_partner' and is the sole real data source
  // today, but its commercial booking capability is unconfirmed (it supplies
  // outboundUrls for rate-verification purposes only). supportsCommercialBooking
  // must NEVER be set true for StayingAPI / priceline without a deliberate
  // future decision backed by confirmed affiliate or direct-booking capability.
  //
  // See the Track D implementation brief and the Commercial Router
  // (src/lib/commercial/router.ts) for how these flags are consumed.
  supportsDiscovery: boolean("supports_discovery").notNull().default(true),
  supportsRateVerification: boolean("supports_rate_verification").notNull().default(true),
  supportsCommercialBooking: boolean("supports_commercial_booking").notNull().default(false),
  hasAffiliateProgram: boolean("has_affiliate_program").notNull().default(false),
  // The environment variable name that holds the affiliate ID for this
  // supplier, e.g. "BOOKING_AFFILIATE_ID". Null when hasAffiliateProgram
  // is false. The router resolves process.env[affiliateIdEnvKey] at
  // route-resolution time — never stored in the DB itself.
  affiliateIdEnvKey: text("affiliate_id_env_key"),
});

export const rates = pgTable(
  "rates",
  {
    id: text("id").primaryKey(),
    // groups every Rate row produced by one search
    searchId: text("search_id").notNull(),
    hotelId: text("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    checkIn: timestamp("check_in", { mode: "date" }).notNull(),
    checkOut: timestamp("check_out", { mode: "date" }).notNull(),
    nights: integer("nights").notNull(),
    currency: text("currency").notNull().default("AED"),
    nightlyPrice: real("nightly_price").notNull(),
    taxesFeesPerNight: real("taxes_fees_per_night").notNull(),
    totalPrice: real("total_price").notNull(),
    soldOut: boolean("sold_out").notNull().default(false),
    // rates are volatile between the moment a search happens and any later
    // booking - capturedAt is what lets us tell "the price we showed" apart
    // from "the price now"
    capturedAt: timestamp("captured_at", { mode: "date" }).notNull().default(sql`now()`),

    // --- Phase 1.1 Track A (claude/phase1.1-architecture-decisions.md,
    // Open Question 6): the two named, already-approved Rate Observation
    // extensions - meal inclusion and payment terms - added to the
    // existing rates table rather than a new table, ratifying the current
    // three-table split (rates / price_history / verdicts.evidence_json) as
    // the standing contract. Each pairs with its own "confirmed" | "unknown"
    // confidence flag, the exact pattern cancellation.confidence and
    // taxesConfidence already use on SupplierOffer (src/lib/suppliers/
    // types.ts) - no adapter populates these yet (none can, honestly, per
    // "never invent"), so every existing and new row simply has both pairs
    // null until a supplier adapter is extended to set them - a later
    // Track C change, not this one.
    mealIncluded: boolean("meal_included"),
    mealConfidence: text("meal_confidence"),
    paymentTerms: text("payment_terms"),
    paymentTermsConfidence: text("payment_terms_confidence"),
  },
  (t) => [index("rates_hotel_checkin_idx").on(t.hotelId, t.checkIn), index("rates_search_idx").on(t.searchId)]
);

export const cancellations = pgTable("cancellations", {
  id: text("id").primaryKey(),
  rateId: text("rate_id")
    .notNull()
    .unique()
    .references(() => rates.id, { onDelete: "cascade" }),
  isFreeCancellation: boolean("is_free_cancellation").notNull(),
  deadline: timestamp("deadline", { mode: "date" }),
  penaltyPercentage: real("penalty_percentage"),
});

// The durable historical ledger - distinct from Rate, which is scoped to
// one search. One row per (hotel, supplier, check-in date) per calendar
// day, upserted as new observations come in. This is what Layer 2's
// "has this hotel's price moved" and long-run supplier-reliability queries
// run against - the actual asset the three-layer architecture calls the
// moat. It should never be pruned the way Rate rows eventually might be.
export const priceHistory = pgTable(
  "price_history",
  {
    id: text("id").primaryKey(),
    hotelId: text("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    checkIn: timestamp("check_in", { mode: "date" }).notNull(),
    observedDate: timestamp("observed_date", { mode: "date" }).notNull(),
    nightlyPrice: real("nightly_price").notNull(),
    totalPrice: real("total_price").notNull(),
    soldOut: boolean("sold_out").notNull().default(false),
    observedAt: timestamp("observed_at", { mode: "date" }).notNull().default(sql`now()`),

    // --- Phase 1.1 Track A - same extension and same reasoning as rates'
    // own comment above; kept in parity across both tables per the Open
    // Question 6 decision to extend fields "within these three tables"
    // rather than build a fourth. Null on every existing row; no backfill.
    mealIncluded: boolean("meal_included"),
    mealConfidence: text("meal_confidence"),
    paymentTerms: text("payment_terms"),
    paymentTermsConfidence: text("payment_terms_confidence"),
  },
  (t) => [
    uniqueIndex("price_history_unique_obs").on(t.hotelId, t.supplierId, t.checkIn, t.observedDate),
    index("price_history_hotel_supplier_idx").on(t.hotelId, t.supplierId),
  ]
);

// Where the "we stand behind the booking" trust layer actually gets its
// data - from the post-booking WhatsApp check-in described in the
// Blueprint, not from assuming a click became a booking.
export const bookingOutcomes = pgTable(
  "booking_outcomes",
  {
    id: text("id").primaryKey(),
    rateId: text("rate_id")
      .notNull()
      .references(() => rates.id, { onDelete: "cascade" }),
    hotelId: text("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    // "clicked" | "confirmed_via_followup" | "issue_reported" | "unknown"
    status: text("status").notNull().default("clicked"),
    source: text("source").notNull().default("whatsapp_checkin"),
    issueNote: text("issue_note"),
    clickedAt: timestamp("clicked_at", { mode: "date" }).notNull().default(sql`now()`),
    resolvedAt: timestamp("resolved_at", { mode: "date" }),
  },
  (t) => [index("booking_outcomes_supplier_status_idx").on(t.supplierId, t.status)]
);

// "Track this price" - offered on the best offer's card as the option for
// someone who isn't booking right now (see DECISIONS.md, "Price tracking").
// No phone number, same principle as the WhatsApp check-in: this only ever
// asks for an email, and only when the customer opts in. minDropAed is the
// customer's own stated threshold ("only tell me if it drops by at least
// this much"), not a global site setting - a guest who'd only care about a
// AED 200 swing shouldn't get pinged over a AED 5 one.
//
// Detection today is opportunistic, not a background poller: it runs
// inside runSearch() every time *anyone* searches the same hotel/dates
// again, and compares the new cheapest total against baselineTotal. A row
// that fires flips to "triggered" and waits at /admin/price-alerts for a
// human to actually email the customer - the same manual-reconciliation
// shape as the WhatsApp check-in, until a real email sender (Resend or
// similar) is wired up to send "sent" automatically instead.
export const priceTracking = pgTable(
  "price_tracking",
  {
    id: text("id").primaryKey(),
    hotelId: text("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    checkIn: timestamp("check_in", { mode: "date" }).notNull(),
    checkOut: timestamp("check_out", { mode: "date" }).notNull(),
    email: text("email").notNull(),
    // The customer's own minimum-drop threshold, in AED, before we'd
    // consider it worth interrupting them.
    minDropAed: real("min_drop_aed").notNull(),
    // The cheapest total found at the moment they opted in - every later
    // check compares against this, not against the previous check, so a
    // slow multi-step slide down still triggers once the cumulative drop
    // clears their threshold.
    baselineTotal: real("baseline_total").notNull(),
    // "active" | "triggered" | "sent" | "cancelled"
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`now()`),
    triggeredAt: timestamp("triggered_at", { mode: "date" }),
    triggeredTotal: real("triggered_total"),
    sentAt: timestamp("sent_at", { mode: "date" }),
  },
  (t) => [index("price_tracking_hotel_dates_status_idx").on(t.hotelId, t.checkIn, t.checkOut, t.status)]
);

// StayingAPI's live price-compare endpoint answers slowly the first time
// (an uncached query returns 202 + a job that takes up to ~35 seconds to
// finish, confirmed live on 2026-09-01 - see DECISIONS.md, "Live
// StayingAPI calls and the refresh architecture") - far too slow for a
// page a real visitor is waiting on. This table is the fix: a background
// job (src/app/api/admin/refresh-staying-api/route.ts) does that slow live
// call ahead of time and stores the finished result here, in the exact
// shape a SupplierOffer needs - including outboundUrl and cancellation
// terms, neither of which any other table in this schema persists.
// stayingApiAdapter.ts (the one a live search actually calls) only ever
// reads this table; it never calls the live API itself.
//
// A live StayingAPI job can take "tens of seconds but can run several
// minutes (240s+)" per their own docs, while a Netlify serverless function
// has a hard, non-configurable 60-second limit - so nothing here can just
// wait inside one request for a job to finish. Instead this table doubles
// as a small job queue: refresh-staying-api submits the request and, if
// StayingAPI answers 202 (uncached), writes status "pending" with the
// jobId/pollUrl and returns immediately; collect-staying-api-jobs (called
// repeatedly by the GitHub Actions workflow, which has no 60s ceiling)
// checks each pending job once per call and flips it to "ready" once
// StayingAPI's job finishes. stayingApiAdapter.ts only ever reads "ready"
// rows.
export const stayingApiCache = pgTable(
  "staying_api_cache",
  {
    id: text("id").primaryKey(),
    hotelId: text("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    checkIn: timestamp("check_in", { mode: "date" }).notNull(),
    checkOut: timestamp("check_out", { mode: "date" }).notNull(),
    // "pending" while StayingAPI's own job is still running; "ready" once
    // offersJson holds a finished, successful result (zero offers is a
    // real, permanent answer here - a genuine "checked, nothing
    // available"); "failed" when the submit or poll step itself errored
    // (bad key, network blip, StayingAPI job failure) - deliberately NOT
    // "ready", so it's never confused with a real zero-offers answer and
    // never gets treated as permanent. See stayingApiRefresh.ts's
    // FAILED_CHECK_RETRY_COOLDOWN_MS for how a "failed" row gets a bounded,
    // cooldown-gated retry rather than being stuck or retried immediately.
    status: text("status").notNull().default("pending"),
    jobId: text("job_id"),
    pollUrl: text("poll_url"),
    // JSON-encoded SupplierOffer[], null until status = "ready" - same
    // "encode as text" convention as events.metadata below.
    offersJson: text("offers_json"),
    // Count of raw offers returned by StayingAPI BEFORE any currency or
    // supplier allow-list filtering. Nullable for backwards compatibility with
    // rows written before this column existed. Zero means StayingAPI itself
    // returned no offers; non-zero with offersJson="[]" means mapOffers()
    // discarded everything. Written by stayingApiRefresh.ts at the same time
    // offersJson is written.
    rawOfferCount: integer("raw_offer_count"),
    refreshedAt: timestamp("refreshed_at", { mode: "date" }).notNull().default(sql`now()`),
    // Occupancy added 2026-09-13 — adults and children count are now part of
    // the cache identity because StayingAPI's price-compare result can differ
    // by occupancy. Previously the cache key was (hotelId, checkIn, checkOut)
    // only, meaning a family search and a couple search for the same
    // hotel/dates silently shared one row. Defaults match the application-wide
    // occupancy defaults (trips.adults default 2, trips.children default 0) so
    // existing rows are migrated honestly without inventing occupancy data.
    // childAges[] is deliberately not stored or sent — Rate Manifest does not
    // currently collect individual child ages (see diagnostic 2026-09-13).
    adults: integer("adults").notNull().default(2),
    children: integer("children").notNull().default(0),
  },
  (t) => [uniqueIndex("staying_api_cache_hotel_checkin_idx").on(t.hotelId, t.checkIn, t.checkOut, t.adults, t.children)]
);

// The Decision Audit Trail - one immutable row per runSearch() call,
// capturing exactly what the existing scoreOffers()/getDealSignal()
// pipeline computed and showed on the RateManifest Verdict panel (see
// src/components/RateManifestVerdict.tsx), rather than recomputing it live
// and throwing it away every time. Nothing reads this table yet as of
// 2026-09-05 - it exists so that, from today, there is a record of what
// RateManifest actually told a visitor and why, which is the actual
// foundation "explainable, defensible decisions" needs. See
// src/lib/verdict.ts for the one writer.
//
// topSupplierSlug is deliberately a plain string, not a foreign key to
// suppliers.id - the same "identity is the slug" convention SupplierOffer
// already uses throughout search.ts and scoring, and it avoids an extra
// slug->id lookup query in the hot path of every search purely to satisfy
// a referential-integrity nicety this audit-log table doesn't need. The
// full evidence set (every offer compared, not just the winner) lives in
// evidenceJson.
export const verdicts = pgTable(
  "verdicts",
  {
    id: text("id").primaryKey(),
    // Groups every Verdict row with the Rate rows from the same runSearch()
    // call - same convention as rates.searchId, also not a foreign key.
    searchId: text("search_id").notNull(),
    hotelId: text("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    // 0-100, copied from the top-ranked DisplayOffer's score - see
    // bestDealScore.ts. 0 when nothing was available to score.
    score: real("score").notNull(),
    // "strong" | "good" | "fair" | "weak" - see dealSignal.ts's DealSignalTier
    tier: text("tier").notNull(),
    // The one-line plain-language recommendation shown on screen, e.g.
    // "Book it." - see dealSignal.ts's DealSignal.verdict.
    decision: text("decision").notNull(),
    topSupplierSlug: text("top_supplier_slug"),
    // JSON-encoded ScoreReason[] for the top-ranked offer - same
    // "encode as text" convention as events.metadata below.
    reasonsJson: text("reasons_json").notNull(),
    sourcesChecked: integer("sources_checked").notNull(),
    cheapestTotal: real("cheapest_total"),
    averageTotal: real("average_total"),
    currency: text("currency").notNull().default("AED"),
    // JSON-encoded VerdictEvidenceOffer[] - every offer actually compared,
    // not just the winner. See src/lib/verdict.ts.
    evidenceJson: text("evidence_json").notNull(),
    // OQ5 (2026-09-12, claude/phase1.1-architecture-decisions.md): the
    // confidence tier ("high" | "medium" | "low") for this verdict's top
    // offer, as computed by confidence.ts's getVerdictConfidence() via
    // bestDealScore.ts's scoreOffers(). Nullable because rows written before
    // this column existed won't have it; read those as "unknown", never as
    // any specific tier. Not the same as hotels.enrichmentConfidence (which
    // is a property-level enrichment flag — see that column's own comment
    // above). See confidence.ts for the full rationale on why this is a
    // separate axis from the 0-100 score.
    confidence: text("confidence"),
    rateSnapshotJson: text("rate_snapshot_json"),
    generatedAt: timestamp("generated_at", { mode: "date" }).notNull().default(sql`now()`),
  },
  (t) => [
    index("verdicts_hotel_generated_idx").on(t.hotelId, t.generatedAt),
    index("verdicts_search_idx").on(t.searchId),
  ]
);

// Instrumentation: every SEARCH / RESULTS_VIEWED / RATE_REVEALED /
// OUTBOUND_CLICK gets one row here. This table's aggregates are exactly the
// columns the D4 MVP Measurement Log (Rate-Manifest-Economics.xlsx) expects
// to be pasted in, once there's real traffic to measure.
export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    // "search" | "results_viewed" | "rate_revealed" | "outbound_click"
    type: text("type").notNull(),
    sessionId: text("session_id").notNull(),
    hotelId: text("hotel_id").references(() => hotels.id, { onDelete: "set null" }),
    supplierId: text("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    metadata: text("metadata"), // JSON-encoded extra context
    createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`now()`),
  },
  (t) => [index("events_type_created_idx").on(t.type, t.createdAt)]
);

// --- Four-page journey (2026-09-05): Discover -> Check IQ -> Complete The
// Trip -> Confirm & Book. See claude/travel-decision-platform-assessment.md
// for the full spec and claude/rate-manifest-technical-blueprint.md
// Section 10 for the build plan these three tables implement. This is the
// lightweight Customer/Trip Graph originally designed in Sprint 1 planning
// and deliberately deferred then ("document the interface, don't build
// the machinery yet - no real consumer exists") - the four-page journey is
// that real consumer.

// One row per Page 1 (Discover) search. Session-scoped, no account
// required - carries destination/dates/guests/intent forward through all
// four pages via its id, so nothing has to be re-entered or re-passed
// through an ever-growing query string. Deliberately lean compared to the
// original blueprint's full `trip` table (Section 6) - budget_hint and
// flexibility aren't collected anywhere in the UI yet, so they're left out
// rather than added as unused columns; extend this table when a page
// actually needs them, same discipline as everything else in Sprint 1.
export const trips = pgTable("trips", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  destination: text("destination").notNull(),
  checkIn: timestamp("check_in", { mode: "date" }).notNull(),
  checkOut: timestamp("check_out", { mode: "date" }).notNull(),
  adults: integer("adults").notNull().default(2),
  children: integer("children").notNull().default(0),
  rooms: integer("rooms").notNull().default(1),
  // "COUPLE" | "FAMILY" | "SOLO" | "BUSINESS" | "FIRST_TIME" | "UNSPECIFIED"
  // - see TRIP_PURPOSES in src/lib/constants.ts. "Skip" on Page 1 maps to
  // UNSPECIFIED, not null - there's always a value, just sometimes an
  // explicit "customer didn't say" one, so downstream code never has to
  // handle a missing column on top of the "no strong signal" case.
  purpose: text("purpose").notNull().default("UNSPECIFIED"),
  // V2A Build 1 (Traveller Intent Profile): the optional "Personalise your
  // stay" section on Page 1 - nightly budget + currency, preferred
  // location, up to three trip priorities, optional essential requirements
  // (see src/lib/tripIntent.ts's TripPreferences and its own module comment).
  // Nullable, no default: NULL means the traveller never touched that
  // section, or this trip predates V2A Build 1 - both read back identically
  // via deserializeTripPreferences(), so every existing trip stays valid
  // with zero backfill. JSON-encoded text, the same "encode as text"
  // convention already used elsewhere in this schema (hotels.images,
  // verdicts.reasons_json, staying_api_cache.offers_json).
  preferencesJson: text("preferences_json"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`now()`),
});

// The record of "select this deal" on Page 2 (Check IQ) - what a customer
// actually chose, not just what was on offer. This is what makes Page 4's
// "RateManifest Verdict -> why this rate was selected" a real lookup
// instead of a re-derivation from query params, and it's the concrete
// implementation of the blueprint's `trip_property` table (Section 6),
// scoped to exactly what Page 4 needs to render rather than the fuller
// original shape. deepLink is stored at selection time (a snapshot of
// offer.outboundUrl, which already carries this app's own rate-tracking
// param and, for a real Source once one exists, that Source's own
// affiliate attribution) rather than reconstructed later - the offer that
// produced it may not be re-derivable identically after the fact if
// scoring or supplier data changes between selection and confirmation.
export const tripSelections = pgTable(
  "trip_selections",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    hotelId: text("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    // Not a foreign key to verdicts.id - a Verdict is generated per search,
    // not per offer, so this points at the verdict that was showing when
    // the customer selected, same "identity is enough, don't force a join
    // on a hot path" convention as verdicts.topSupplierSlug uses.
    verdictId: text("verdict_id"),
    supplierSlug: text("supplier_slug").notNull(),
    supplierName: text("supplier_name").notNull(),
    totalPrice: real("total_price").notNull(),
    currency: text("currency").notNull().default("AED"),
    deepLink: text("deep_link").notNull(),
    selectedAt: timestamp("selected_at", { mode: "date" }).notNull().default(sql`now()`),
  },
  (t) => [index("trip_selections_trip_idx").on(t.tripId)]
);

// Page 3 (Complete The Trip)'s "Add to My Trip" - one row per experience a
// customer explicitly added, not every product shown. Deliberately
// supplier-agnostic (Viator today, Klook or another Experience source
// later) rather than reusing ThingsToDoProduct's Viator-specific shape -
// see src/lib/viator/types.ts's own comment on why Things To Do has its
// own model instead of being forced into SupplierOffer. This table stores
// a snapshot of what was shown (title/price/link at add-time), same
// reasoning as tripSelections.deepLink above - a live re-fetch at confirm
// time isn't guaranteed to return the identical product.
export const tripExperiences = pgTable(
  "trip_experiences",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    supplierSlug: text("supplier_slug").notNull(), // "viator" today
    supplierProductId: text("supplier_product_id").notNull(),
    title: text("title").notNull(),
    imageUrl: text("image_url"),
    price: real("price"),
    currency: text("currency").notNull().default("AED"),
    bookingUrl: text("booking_url").notNull(),
    addedAt: timestamp("added_at", { mode: "date" }).notNull().default(sql`now()`),
  },
  (t) => [
    index("trip_experiences_trip_idx").on(t.tripId),
    uniqueIndex("trip_experiences_trip_product_idx").on(t.tripId, t.supplierProductId),
  ]
);

// W3 (2026-09-14): destination interest capture. Records which unsupported
// destinations visitors searched for, so Rate Manifest knows where to
// expand next and can reach out when a destination goes live. Deliberately
// minimal: no deduplication constraint (multiple people can legitimately
// submit the same destination), no newsletter opt-in, no account link.
// source is always "destination_search" for this form; kept as a plain text
// column so future intake channels (e.g. a blog CTA) get a different value
// without a schema change.
export const destinationInterest = pgTable("destination_interest", {
  id: text("id").primaryKey(),
  destination: text("destination").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  source: text("source").notNull().default("destination_search"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`now()`),
});

// ---------------------------------------------------------------------------
// Shared four-tower platform foundation (Phase 1A, 2026-09-21).
// ADDITIVE ONLY: these tables coexist with the Hotel-specific tables above
// (trip_selections, rates, suppliers, verdicts, staying_api_cache) and do not
// reference or replace them. Nothing here is derived from StayingAPI.
// See src/lib/platform/ for the contracts. Applied via the idempotent SQL in
// src/app/api/admin/init-db/route.ts (mirror any change there).
// ---------------------------------------------------------------------------

// One row per part of a Trip: hotel | flight | rail | cruise | experience.
// Tower-specific search/context lives in input_json, not in shared columns.
// A Trip may hold any number of components; none overwrites another.
export const tripComponents = pgTable(
  "trip_components",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    position: integer("position").notNull().default(0),
    status: text("status").notNull().default("draft"),
    inputJson: text("input_json").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().default(sql`now()`),
  },
  (t) => [index("trip_components_trip_idx").on(t.tripId)]
);

// Travel merchant / source (e.g. Trip.com). Distinct from the legacy
// `suppliers` table, which is Hotel/StayingAPI-seller shaped.
export const merchants = pgTable("merchants", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`now()`),
});

// How RM reaches/monetises a merchant: an affiliate network or the merchant
// itself. Never a merchant.
export const accessRoutes = pgTable("access_routes", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  // "affiliate_network" | "direct"
  kind: text("kind").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`now()`),
});

// A merchant may be reachable through several access routes. Status:
// "unverified" | "approved" | "inactive".
export const merchantAccessRoutes = pgTable(
  "merchant_access_routes",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    accessRouteId: text("access_route_id")
      .notNull()
      .references(() => accessRoutes.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("unverified"),
  },
  (t) => [uniqueIndex("merchant_access_routes_pair_idx").on(t.merchantId, t.accessRouteId)]
);

// Snapshot of an offer as it entered a component's decision. Shared fields
// only; tower-specific detail is payload_json. provenance_json is DECISION
// provenance (why/where it entered) - it says nothing about monetisation.
export const offerSnapshots = pgTable(
  "offer_snapshots",
  {
    id: text("id").primaryKey(),
    componentId: text("component_id")
      .notNull()
      .references(() => tripComponents.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    externalRef: text("external_ref"),
    currency: text("currency").notNull(),
    totalPrice: doublePrecision("total_price").notNull(),
    sourceUrl: text("source_url"),
    capturedAt: timestamp("captured_at", { mode: "date" }).notNull().default(sql`now()`),
    payloadJson: text("payload_json").notNull().default("{}"),
    provenanceJson: text("provenance_json").notNull(),
  },
  (t) => [index("offer_snapshots_component_idx").on(t.componentId)]
);

// The chosen offer for one component. At most one per component.
export const componentSelections = pgTable(
  "component_selections",
  {
    id: text("id").primaryKey(),
    componentId: text("component_id")
      .notNull()
      .references(() => tripComponents.id, { onDelete: "cascade" }),
    offerId: text("offer_id")
      .notNull()
      .references(() => offerSnapshots.id, { onDelete: "cascade" }),
    selectedAt: timestamp("selected_at", { mode: "date" }).notNull().default(sql`now()`),
  },
  (t) => [uniqueIndex("component_selections_component_idx").on(t.componentId)]
);

// Phase 2: a commercial-only handoff of a component to a merchant WITHOUT an
// ingested offer - deliberately no price columns. context_json is a snapshot
// of the component input at handoff time (used to detect staleness).
export const commercialHandoffs = pgTable(
  "commercial_handoffs",
  {
    id: text("id").primaryKey(),
    componentId: text("component_id")
      .notNull()
      .references(() => tripComponents.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    contextJson: text("context_json").notNull(),
    landingUrl: text("landing_url"),
    provenanceJson: text("provenance_json").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`now()`),
  },
  (t) => [index("commercial_handoffs_component_idx").on(t.componentId)]
);

// Resolved commercial route for a selection. attribution_json is COMMERCIAL
// attribution (status + tracking evidence) - separate from offer provenance.
export const commercialRoutes = pgTable(
  "commercial_routes",
  {
    id: text("id").primaryKey(),
    // Exactly one of selection_id (priced offer) or handoff_id (commercial-only).
    selectionId: text("selection_id").references(() => componentSelections.id, { onDelete: "cascade" }),
    handoffId: text("handoff_id").references(() => commercialHandoffs.id, { onDelete: "cascade" }),
    componentId: text("component_id")
      .notNull()
      .references(() => tripComponents.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    accessRouteId: text("access_route_id").references(() => accessRoutes.id),
    routeType: text("route_type").notNull(),
    eligibility: text("eligibility").notNull(),
    destinationUrl: text("destination_url"),
    attributionJson: text("attribution_json").notNull(),
    reason: text("reason"),
    resolvedAt: timestamp("resolved_at", { mode: "date" }).notNull().default(sql`now()`),
  },
  (t) => [
    index("commercial_routes_selection_idx").on(t.selectionId),
    index("commercial_routes_component_idx").on(t.componentId),
    check("commercial_routes_subject_check", sql`(${t.selectionId} IS NULL) <> (${t.handoffId} IS NULL)`),
  ]
);
