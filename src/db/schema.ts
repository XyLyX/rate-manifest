// Rate Manifest — data model, implemented with Drizzle ORM against Postgres
// (Netlify DB, auto-provisioned — see DECISIONS.md, "Hosting: Netlify DB").
//
// Implements the seven objects from the Blueprint (Section B): Hotel, Room,
// Rate, Cancellation, Supplier, PriceHistory, BookingOutcome — plus one
// addition, Event, the instrumentation model. Every SEARCH, RESULTS_VIEWED,
// RATE_REVEALED and OUTBOUND_CLICK gets logged there, and this is exactly
// what feeds the D4 MVP Measurement Log in the economics workbook once
// there's real traffic. Nothing about the *shape* of these tables is
// mock-specific — only the Supplier rows and the values a SupplierAdapter
// returns are mock, today.
//
// This was SQLite (via Drizzle + @libsql/client) for local dev, for exactly
// the reason this project deploys nowhere: no persistent disk to put a
// SQLite file on. Now that it's hosted on Netlify, it's on Netlify's own
// auto-provisioned Postgres (via @netlify/database) instead — the port was
// mechanical, exactly as flagged when SQLite was first chosen: swap
// "drizzle-orm/sqlite-core" for "drizzle-orm/pg-core", swap the column
// builders (integer(...,{mode:'boolean'})→boolean(), integer(...,{mode:
// 'timestamp'})→timestamp(), sql`(unixepoch())`→sql`now()`), and point
// src/db/client.ts at a Postgres connection instead of a file. No table,
// column, or relation changed shape.
//
// "Enum" fields below are typed `text` with a TypeScript union type
// (see src/lib/constants.ts) rather than a native Postgres enum — the
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
  // Null, not zero, until there's enough BookingOutcome data — the UI must
  // show "new partner — reliability data building" whenever this is null.
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
    // booking — capturedAt is what lets us tell "the price we showed" apart
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

// The durable historical ledger — distinct from Rate, which is scoped to
// one search. One row per (hotel, supplier, check-in date) per calendar
// day, upserted as new observations come in. This is what Layer 2's
// "has this hotel's price moved" and long-run supplier-reliability queries
// run against — the actual asset the three-layer architecture calls the
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
// data — from the post-booking WhatsApp check-in described in the
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

// "Track this price" — offered on the best offer's card as the option for
// someone who isn't booking right now (see DECISIONS.md, "Price tracking").
// No phone number, same principle as the WhatsApp check-in: this only ever
// asks for an email, and only when the customer opts in. minDropAed is the
// customer's own stated threshold ("only tell me if it drops by at least
// this much"), not a global site setting — a guest who'd only care about a
// AED 200 swing shouldn't get pinged over a AED 5 one.
//
// Detection today is opportunistic, not a background poller: it runs
// inside runSearch() every time *anyone* searches the same hotel/dates
// again, and compares the new cheapest total against baselineTotal. A row
// that fires flips to "triggered" and waits at /admin/price-alerts for a
// human to actually email the customer — the same manual-reconciliation
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
    // The cheapest total found at the moment they opted in — every later
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
