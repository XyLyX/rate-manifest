import { NextResponse } from "next/server";
import { pool } from "@/db/client";

// TEMPORARY, ONE-TIME-USE endpoint. Netlify's automated migration mechanism
// (netlify/database/migrations/...) has repeatedly reported success while
// creating zero tables in production, and the manual SQL-console workaround
// couldn't be confirmed either - see DECISIONS.md, "Bug: the migration
// never actually ran." This route runs the exact same schema+seed SQL
// directly against whatever database the live site is actually connected
// to at runtime, via the app's own db client, removing every layer of
// uncertainty about which console/branch/mechanism was actually used.
//
// Protected by a long random secret (DB_INIT_SECRET, set directly in
// Netlify's env vars, never committed) so this can't be hit by anyone else.
// Every statement is idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING),
// so re-running it is harmless. Delete this route once the table count is
// confirmed correct - see DECISIONS.md.
export const dynamic = "force-dynamic";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS hotels (
  id text PRIMARY KEY,
  name text NOT NULL,
  area text NOT NULL,
  city text NOT NULL DEFAULT 'Dubai',
  star_rating integer NOT NULL,
  is_mock_data boolean NOT NULL DEFAULT true,
  mock_base_price real,
  created_at timestamp NOT NULL DEFAULT now()
);

-- 2026-09-11 - featured_in_iq added after hotels already existed in
-- production, so CREATE TABLE IF NOT EXISTS above won't add it to an
-- already-created table. ADD COLUMN IF NOT EXISTS is idempotent the same
-- way every other statement in this file is (see the module comment) -
-- marks a hotel as part of the curated public Exceptional Stays / Rate
-- Manifest IQ set (claude/rate-manifest-technical-blueprint.md, Section
-- 12). Defaults false, so this changes nothing about any existing row
-- until hotels are explicitly curated into the set.
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS featured_in_iq boolean NOT NULL DEFAULT false;

-- 2026-09-12 - the RateManifest Property Graph's state field (claude/
-- discovery-property-graph-architecture.md, "FROZEN 2026-09-12," Section 5;
-- src/lib/constants.ts's PropertyState). DEFAULT 'curated' backfills every
-- existing row correctly in the same ADD COLUMN statement, with no separate
-- UPDATE needed - every hotel in this table as of this migration was
-- hand-picked by Navin, same bar the rest of the catalog already meets. A
-- future discovery adapter (Track B) must set this explicitly on insert
-- ('draft' for an unreviewed discovery result) rather than rely on this
-- default, which exists only to make this migration correct for the rows
-- already here.
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'curated';

-- 2026-09-12, Phase 1.1 Track A (claude/phase1.1-architecture-decisions.md,
-- Open Question 2) - Property Contract enrichment fields. All nullable, no
-- DEFAULT, so every existing row is valid the instant this runs with no
-- backfill: a null value here means the same thing "unknown" means
-- everywhere else in this schema. Nothing populates these yet - this is
-- schema capability only, per that decision's own instruction not to
-- create fake/default enrichment data just to satisfy the shape.
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS latitude real;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS longitude real;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS aliases text;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS facilities text;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS accessibility_attributes text;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS images text;
-- "confirmed" | "unknown", one record-level flag for the enrichment fields
-- above as a group - see src/db/schema.ts's own comment on this column for
-- why this isn't a per-field flag or a new confidence scale.
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS enrichment_confidence text;

-- V2A legacy catalogue retirement (2026-09-22): this file used to flag five,
-- then six, specific hotel ids as featured_in_iq here. Both UPDATEs named
-- ids from the now-retired 37-hotel catalogue seed below, which this
-- initialization script no longer inserts - an UPDATE naming an id that
-- will never exist is dead weight, not a safe no-op worth keeping. A future
-- discovery adapter that seeds real, approved properties should set
-- featured_in_iq explicitly on insert instead of via a standalone UPDATE
-- like this one.

CREATE TABLE IF NOT EXISTS rooms (
  id text PRIMARY KEY,
  hotel_id text NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  normalized_type text NOT NULL,
  occupancy integer NOT NULL DEFAULT 2,
  bed_config text NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  integration_type text NOT NULL,
  requires_click_to_reveal boolean NOT NULL DEFAULT true,
  allows_multi_supplier_display boolean NOT NULL DEFAULT true,
  tos_notes text,
  reliability_score real,
  booking_outcome_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS rates (
  id text PRIMARY KEY,
  search_id text NOT NULL,
  hotel_id text NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  check_in timestamp NOT NULL,
  check_out timestamp NOT NULL,
  nights integer NOT NULL,
  currency text NOT NULL DEFAULT 'AED',
  nightly_price real NOT NULL,
  taxes_fees_per_night real NOT NULL,
  total_price real NOT NULL,
  sold_out boolean NOT NULL DEFAULT false,
  captured_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rates_hotel_checkin_idx ON rates (hotel_id, check_in);
CREATE INDEX IF NOT EXISTS rates_search_idx ON rates (search_id);

-- 2026-09-12, Phase 1.1 Track A (claude/phase1.1-architecture-decisions.md,
-- Open Question 6) - the approved meal/payment-terms extension to the
-- rates table, each paired with its own "confirmed" | "unknown" confidence
-- flag (same vocabulary as the existing cancellation/taxes confidence
-- fields). All nullable, no DEFAULT - no adapter populates these yet.
ALTER TABLE rates ADD COLUMN IF NOT EXISTS meal_included boolean;
ALTER TABLE rates ADD COLUMN IF NOT EXISTS meal_confidence text;
ALTER TABLE rates ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE rates ADD COLUMN IF NOT EXISTS payment_terms_confidence text;

CREATE TABLE IF NOT EXISTS cancellations (
  id text PRIMARY KEY,
  rate_id text NOT NULL UNIQUE REFERENCES rates(id) ON DELETE CASCADE,
  is_free_cancellation boolean NOT NULL,
  deadline timestamp,
  penalty_percentage real
);

CREATE TABLE IF NOT EXISTS price_history (
  id text PRIMARY KEY,
  hotel_id text NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  check_in timestamp NOT NULL,
  observed_date timestamp NOT NULL,
  nightly_price real NOT NULL,
  total_price real NOT NULL,
  sold_out boolean NOT NULL DEFAULT false,
  observed_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS price_history_unique_obs
  ON price_history (hotel_id, supplier_id, check_in, observed_date);
CREATE INDEX IF NOT EXISTS price_history_hotel_supplier_idx ON price_history (hotel_id, supplier_id);

-- 2026-09-12, Phase 1.1 Track A - same extension, same reasoning as rates'
-- own block above; kept in parity across both tables per the Open Question
-- 6 decision to extend "these three tables," not build a fourth.
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS meal_included boolean;
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS meal_confidence text;
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS payment_terms_confidence text;

CREATE TABLE IF NOT EXISTS booking_outcomes (
  id text PRIMARY KEY,
  rate_id text NOT NULL REFERENCES rates(id) ON DELETE CASCADE,
  hotel_id text NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'clicked',
  source text NOT NULL DEFAULT 'whatsapp_checkin',
  issue_note text,
  clicked_at timestamp NOT NULL DEFAULT now(),
  resolved_at timestamp
);

CREATE INDEX IF NOT EXISTS booking_outcomes_supplier_status_idx ON booking_outcomes (supplier_id, status);

CREATE TABLE IF NOT EXISTS price_tracking (
  id text PRIMARY KEY,
  hotel_id text NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  check_in timestamp NOT NULL,
  check_out timestamp NOT NULL,
  email text NOT NULL,
  min_drop_aed real NOT NULL,
  baseline_total real NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp NOT NULL DEFAULT now(),
  triggered_at timestamp,
  triggered_total real,
  sent_at timestamp
);

CREATE INDEX IF NOT EXISTS price_tracking_hotel_dates_status_idx
  ON price_tracking (hotel_id, check_in, check_out, status);

CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  type text NOT NULL,
  session_id text NOT NULL,
  hotel_id text REFERENCES hotels(id) ON DELETE SET NULL,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  metadata text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_type_created_idx ON events (type, created_at);

-- The Decision Audit Trail - see src/db/schema.ts's verdicts table for
-- the full rationale (Sprint 1 of the 2026-09-05 Travel Decision
-- Intelligence Platform direction). Additive only, written once per
-- runSearch() call by src/lib/verdict.ts; nothing reads it yet.
CREATE TABLE IF NOT EXISTS verdicts (
  id text PRIMARY KEY,
  search_id text NOT NULL,
  hotel_id text NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  score real NOT NULL,
  tier text NOT NULL,
  decision text NOT NULL,
  top_supplier_slug text,
  reasons_json text NOT NULL,
  sources_checked integer NOT NULL,
  cheapest_total real,
  average_total real,
  currency text NOT NULL DEFAULT 'AED',
  evidence_json text NOT NULL,
  generated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verdicts_hotel_generated_idx ON verdicts (hotel_id, generated_at);
CREATE INDEX IF NOT EXISTS verdicts_search_idx ON verdicts (search_id);

-- 2026-09-12, Phase 1.1 Track C (OQ5) - confidence tier added after
-- verdicts already existed in production. Nullable so rows written before
-- this column existed are valid without backfill; read null as "unknown".
-- See src/db/schema.ts's own comment on this column and src/lib/confidence.ts.
ALTER TABLE verdicts ADD COLUMN IF NOT EXISTS confidence text;
ALTER TABLE verdicts ADD COLUMN IF NOT EXISTS rate_snapshot_json text;

CREATE TABLE IF NOT EXISTS staying_api_cache (
  id text PRIMARY KEY,
  hotel_id text NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  check_in timestamp NOT NULL,
  check_out timestamp NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  job_id text,
  poll_url text,
  offers_json text,
  refreshed_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS staying_api_cache_hotel_checkin_idx
  ON staying_api_cache (hotel_id, check_in, check_out);

-- 2026-09-13 - raw_offer_count: pre-filter StayingAPI offer count, written
-- at the same moment as offers_json. Zero = StayingAPI returned nothing;
-- non-zero with offers_json='[]' = mapOffers() discarded all offers (e.g.
-- google_hotels or currency mismatch). Nullable so existing rows stay valid.
ALTER TABLE staying_api_cache ADD COLUMN IF NOT EXISTS raw_offer_count integer;

-- 2026-09-13 - adults/children: occupancy columns added to cache identity so
-- a family search and a couple search for the same hotel/dates get separate
-- rows. Defaults match the application-wide occupancy defaults (trips.adults
-- default 2, trips.children default 0) so existing rows are migrated honestly
-- without inventing occupancy data. NOT NULL + DEFAULT means existing rows
-- are transparently assigned the default occupancy, which matches what the
-- original refresh (pre-occupancy) would have requested. Unique index remains
-- (hotel_id, check_in, check_out) for now - see DECISIONS.md; index redesign
-- deferred until we confirm whether per-occupancy caching is actually needed.
ALTER TABLE staying_api_cache ADD COLUMN IF NOT EXISTS adults integer NOT NULL DEFAULT 2;
ALTER TABLE staying_api_cache ADD COLUMN IF NOT EXISTS children integer NOT NULL DEFAULT 0;

-- Four-page journey (2026-09-05): Discover -> Check IQ -> Complete The Trip
-- -> Confirm & Book. See src/db/schema.ts's own comment above these three
-- tables for the full rationale - this is the Sprint 1 Customer/Trip Graph
-- deliberately deferred until a real consumer existed.
CREATE TABLE IF NOT EXISTS trips (
  id text PRIMARY KEY,
  session_id text NOT NULL,
  destination text NOT NULL,
  check_in timestamp NOT NULL,
  check_out timestamp NOT NULL,
  adults integer NOT NULL DEFAULT 2,
  children integer NOT NULL DEFAULT 0,
  rooms integer NOT NULL DEFAULT 1,
  purpose text NOT NULL DEFAULT 'UNSPECIFIED',
  created_at timestamp NOT NULL DEFAULT now()
);

-- V2A Build 1 (Traveller Intent Profile), added after trips already existed
-- in production, so CREATE TABLE IF NOT EXISTS above won't add it to an
-- already-created table - same idempotent ADD COLUMN IF NOT EXISTS pattern
-- as hotels' featured_in_iq/state/enrichment columns above. Nullable, no
-- default: every existing trip keeps preferences_json = NULL (read back as
-- "no preferences given," not an error or an invented default) - see
-- src/lib/tripIntent.ts.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS preferences_json text;

CREATE TABLE IF NOT EXISTS trip_selections (
  id text PRIMARY KEY,
  trip_id text NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  hotel_id text NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  verdict_id text,
  supplier_slug text NOT NULL,
  supplier_name text NOT NULL,
  total_price real NOT NULL,
  currency text NOT NULL DEFAULT 'AED',
  deep_link text NOT NULL,
  selected_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_selections_trip_idx ON trip_selections (trip_id);

CREATE TABLE IF NOT EXISTS trip_experiences (
  id text PRIMARY KEY,
  trip_id text NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  supplier_slug text NOT NULL,
  supplier_product_id text NOT NULL,
  title text NOT NULL,
  image_url text,
  price real,
  currency text NOT NULL DEFAULT 'AED',
  booking_url text NOT NULL,
  added_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_experiences_trip_idx ON trip_experiences (trip_id);
CREATE UNIQUE INDEX IF NOT EXISTS trip_experiences_trip_product_idx
  ON trip_experiences (trip_id, supplier_product_id);

-- 2026-09-13, Phase 1.1 Track D (Commercial Router) - five supplier
-- capability columns. All use ALTER TABLE ADD COLUMN IF NOT EXISTS
-- (idempotent, safe to re-run regardless of production state).
--
-- Defaults are conservative by design:
--   supports_discovery / supports_rate_verification default TRUE because
--     every registered adapter already performs these functions.
--   supports_commercial_booking defaults FALSE because no supplier has a
--     confirmed commercial booking path — being integration_type='api_partner'
--     does NOT imply this (StayingAPI supplies outboundUrls for rate
--     verification only; its commercial booking capability is unconfirmed).
--   has_affiliate_program defaults FALSE — no affiliate relationship exists.
--   affiliate_id_env_key is nullable text — null until an affiliate
--     relationship is established and the env var name is known.
--
-- See src/lib/commercial/router.ts for how these flags drive routing.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS supports_discovery boolean NOT NULL DEFAULT true;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS supports_rate_verification boolean NOT NULL DEFAULT true;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS supports_commercial_booking boolean NOT NULL DEFAULT false;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS has_affiliate_program boolean NOT NULL DEFAULT false;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS affiliate_id_env_key text;

-- Conservative initialisation for every known supplier slug. The DEFAULT
-- above handles rows inserted by this run's CREATE TABLE / INSERT block,
-- but for rows that pre-date this ADD COLUMN (already in production), the
-- DEFAULT is only applied at ADD COLUMN time. On a re-run, ADD COLUMN IF
-- NOT EXISTS is a no-op and the columns already hold values. This UPDATE
-- is therefore belt-and-suspenders: it explicitly writes the safe values
-- for every named slug without touching any column that should stay at its
-- natural default (supports_discovery, supports_rate_verification).
-- Never promotes any supplier to commercial capability — that requires a
-- deliberate future decision with confirmed capability evidence.
UPDATE suppliers
SET
  supports_commercial_booking = false,
  has_affiliate_program = false
WHERE slug IN ('booking', 'expedia', 'agoda', 'hotelscom', 'tripcom', 'direct', 'priceline');

INSERT INTO suppliers (id, slug, name, integration_type, requires_click_to_reveal, allows_multi_supplier_display, tos_notes)
VALUES
  ('supplier-booking', 'booking', 'Booking.com', 'mock', true, true, 'Demo mode: prices are simulated, not fetched from this seller.'),
  ('supplier-expedia', 'expedia', 'Expedia', 'mock', true, true, 'Demo mode: prices are simulated, not fetched from this seller.'),
  ('supplier-agoda', 'agoda', 'Agoda', 'mock', true, true, 'Demo mode: prices are simulated, not fetched from this seller.'),
  ('supplier-hotelscom', 'hotelscom', 'Hotels.com', 'mock', true, true, 'Demo mode: prices are simulated, not fetched from this seller.'),
  ('supplier-tripcom', 'tripcom', 'Trip.com', 'mock', true, true, 'Demo mode: prices are simulated, not fetched from this seller.'),
  ('supplier-direct', 'direct', 'Direct - hotel website', 'mock', true, true, 'Demo mode: prices are simulated, not fetched from this seller.'),
  ('supplier-priceline', 'priceline', 'Priceline', 'api_partner', true, true, 'Real data via StayingAPI, when a real hotel has been refreshed.')
ON CONFLICT (slug) DO NOTHING;

-- V2A legacy catalogue retirement (2026-09-22, approved read-only audit):
-- this file used to seed 37 real UAE hotels (30 "top five per emirate" +
-- 7 later "Exceptional Stays" candidates) and their matching room rows
-- directly into the initialization script. That catalogue is retired by
-- an authoritative decision - it must never be treated as live inventory
-- or recreated by a fresh initialization - so both INSERT INTO hotels
-- blocks and their matching INSERT INTO rooms blocks were removed here.
-- Nothing else changed: every CREATE TABLE / ALTER TABLE / CREATE INDEX
-- statement in this file (including hotels' own shape) is untouched, so a
-- fresh environment still gets every real table with the right columns -
-- it just starts, correctly, with zero hotel rows instead of 37. Cleanup
-- of any hotels already seeded by an earlier run of this script into an
-- existing database is a separate, explicitly-approved, staging-only
-- operation - deliberately not a DELETE in this file (see the existing
-- 'ibis-deira-city-centre' DELETE below for why an id-scoped DELETE here
-- would otherwise be the established pattern: it names one already-and-
-- separately-retired hotel from before this catalogue existed, which is
-- different from bulk-removing the 37 that a previous run of this exact
-- script may have inserted).

-- Ibis Deira City Centre (3-star) was seeded by an earlier version of this
-- route, before the real-hotel catalog became "top five 5-star per
-- emirate." Since every INSERT above is ON CONFLICT DO NOTHING (additive
-- only), removing it from the INSERT list alone doesn't remove the row
-- already in production - this explicit, id-scoped DELETE does. Safe to
-- leave in permanently: a no-op once the row is gone. The rooms table
-- cascades on delete, so its matching room row goes with it automatically.
DELETE FROM hotels WHERE id = 'ibis-deira-city-centre';

-- The six fictional placeholder hotels (marina-skyline, old-town-courtyard,
-- palm-crescent, business-bay-central, al-fahidi-heritage, jbr-beachfront)
-- were the original demo catalog, kept for continuity while real supplier
-- data didn't exist yet. Explicit user decision, 2026-09-01 (see
-- DECISIONS.md, "Demo hotels dropped from the catalog"): now that every
-- emirate has a real, StayingAPI-backed hotel set, drop them rather than
-- keep mixing simulated properties into what visitors browse. Their
-- INSERT statements were removed above (a fresh DB never creates them
-- again); these DELETEs clean up rows already sitting in production. Same
-- cascade-safe, re-run-forever-harmless shape as the ibis delete above -
-- rooms/rates/cancellations/price_history/booking_outcomes/price_tracking/
-- staying_api_cache all cascade off hotel_id, and events.hotel_id just
-- goes null for any historical event tied to one of these ids.
--
-- PHASE 0.1 FIX (2026-09-12): this used to be a single blanket
-- "DELETE FROM hotels WHERE is_mock_data = true" - deleting by the
-- is_mock_data COLUMN VALUE, not by these six specific ids. Since
-- is_mock_data defaults to true for any row that doesn't explicitly set it
-- false (see the CREATE TABLE above), that statement would silently
-- destroy any future hotel this script never seeded itself - a Discovery/
-- Property Graph adapter's "draft" candidate, or any other legitimate row
-- added by hand - the instant this route ran again, with this idempotent
-- script offering no way to recover it. Rewritten as six explicit
-- id-scoped deletes, the same already-safe pattern as the
-- ibis-deira-city-centre line above, so this can only ever remove these
-- six known-fictional rows and nothing else, regardless of what
-- is_mock_data happens to be set on any other row.
DELETE FROM hotels WHERE id = 'marina-skyline';
DELETE FROM hotels WHERE id = 'old-town-courtyard';
DELETE FROM hotels WHERE id = 'palm-crescent';
DELETE FROM hotels WHERE id = 'business-bay-central';
DELETE FROM hotels WHERE id = 'al-fahidi-heritage';
DELETE FROM hotels WHERE id = 'jbr-beachfront';

-- 2026-09-21, Phase 1A shared four-tower platform foundation. ADDITIVE ONLY:
-- new tables, no change to any table above. Mirrors src/db/schema.ts
-- (tripComponents, merchants, accessRoutes, merchantAccessRoutes,
-- offerSnapshots, componentSelections, commercialRoutes). Independent of
-- StayingAPI and of the legacy suppliers/trip_selections tables.
CREATE TABLE IF NOT EXISTS trip_components (
  id text PRIMARY KEY,
  trip_id text NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  kind text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  input_json text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trip_components_trip_idx ON trip_components (trip_id);

CREATE TABLE IF NOT EXISTS merchants (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_routes (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merchant_access_routes (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  access_route_id text NOT NULL REFERENCES access_routes(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'unverified'
);
CREATE UNIQUE INDEX IF NOT EXISTS merchant_access_routes_pair_idx
  ON merchant_access_routes (merchant_id, access_route_id);

CREATE TABLE IF NOT EXISTS offer_snapshots (
  id text PRIMARY KEY,
  component_id text NOT NULL REFERENCES trip_components(id) ON DELETE CASCADE,
  kind text NOT NULL,
  merchant_id text NOT NULL REFERENCES merchants(id),
  external_ref text,
  currency text NOT NULL,
  total_price double precision NOT NULL,
  source_url text,
  captured_at timestamp NOT NULL DEFAULT now(),
  payload_json text NOT NULL DEFAULT '{}',
  provenance_json text NOT NULL
);
CREATE INDEX IF NOT EXISTS offer_snapshots_component_idx ON offer_snapshots (component_id);

CREATE TABLE IF NOT EXISTS component_selections (
  id text PRIMARY KEY,
  component_id text NOT NULL REFERENCES trip_components(id) ON DELETE CASCADE,
  offer_id text NOT NULL REFERENCES offer_snapshots(id) ON DELETE CASCADE,
  selected_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS component_selections_component_idx
  ON component_selections (component_id);

-- Phase 2: commercial-only handoff (no inventory, no price).
CREATE TABLE IF NOT EXISTS commercial_handoffs (
  id text PRIMARY KEY,
  component_id text NOT NULL REFERENCES trip_components(id) ON DELETE CASCADE,
  merchant_id text NOT NULL REFERENCES merchants(id),
  context_json text NOT NULL,
  landing_url text,
  provenance_json text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_handoffs_component_idx ON commercial_handoffs (component_id);

CREATE TABLE IF NOT EXISTS commercial_routes (
  id text PRIMARY KEY,
  selection_id text REFERENCES component_selections(id) ON DELETE CASCADE,
  handoff_id text REFERENCES commercial_handoffs(id) ON DELETE CASCADE,
  component_id text NOT NULL REFERENCES trip_components(id) ON DELETE CASCADE,
  merchant_id text NOT NULL REFERENCES merchants(id),
  access_route_id text REFERENCES access_routes(id),
  route_type text NOT NULL,
  eligibility text NOT NULL,
  destination_url text,
  attribution_json text NOT NULL,
  reason text,
  resolved_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT commercial_routes_subject_check CHECK ((selection_id IS NULL) <> (handoff_id IS NULL))
);
CREATE INDEX IF NOT EXISTS commercial_routes_selection_idx ON commercial_routes (selection_id);
CREATE INDEX IF NOT EXISTS commercial_routes_component_idx ON commercial_routes (component_id);
`;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (!process.env.DB_INIT_SECRET || secret !== process.env.DB_INIT_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    await pool.query(SCHEMA_SQL);
    const { rows } = await pool.query(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'"
    );
    const { rows: tableRows } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    // Row counts, not just table names - the actual bug this caught once
    // (a leftover hotel row an ON CONFLICT DO NOTHING insert could never
    // remove on its own) only showed up by checking counts, not schema.
    const { rows: hotelCounts } = await pool.query(
      "SELECT is_mock_data, count(*)::int AS count FROM hotels GROUP BY is_mock_data"
    );
    return NextResponse.json({
      ok: true,
      tableCount: rows[0]?.count ?? null,
      tables: tableRows.map((r) => r.table_name),
      hotelCounts: hotelCounts.map((r) => ({ isMockData: r.is_mock_data, count: r.count })),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
