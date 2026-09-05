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
import { pgTable, text, integer, boolean, real, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

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
  createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`now()`),
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
    // "pending" while StayingAPI's own job is still running, "ready" once
    // offersJson holds a finished result (including "finished with zero
    // offers" or "the job failed" - both still count as ready, so a dead
    // job doesn't get polled forever).
    status: text("status").notNull().default("pending"),
    jobId: text("job_id"),
    pollUrl: text("poll_url"),
    // JSON-encoded SupplierOffer[], null until status = "ready" - same
    // "encode as text" convention as events.metadata below.
    offersJson: text("offers_json"),
    refreshedAt: timestamp("refreshed_at", { mode: "date" }).notNull().default(sql`now()`),
  },
  (t) => [uniqueIndex("staying_api_cache_hotel_checkin_idx").on(t.hotelId, t.checkIn, t.checkOut)]
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
