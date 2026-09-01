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

INSERT INTO hotels (id, name, area, city, star_rating, is_mock_data, mock_base_price)
VALUES
  ('marina-skyline', 'Marina Skyline Residences', 'Dubai Marina', 'Dubai', 5, true, 1450),
  ('old-town-courtyard', 'Old Town Courtyard Hotel', 'Downtown / Old Town', 'Dubai', 4, true, 780),
  ('palm-crescent', 'Palm Crescent Beach Resort', 'Palm Jumeirah', 'Dubai', 5, true, 2100),
  ('business-bay-central', 'Business Bay Central Hotel', 'Business Bay', 'Dubai', 3, true, 420),
  ('al-fahidi-heritage', 'Al Fahidi Heritage Inn', 'Bur Dubai', 'Dubai', 3, true, 340),
  ('jbr-beachfront', 'JBR Beachfront Suites', 'Jumeirah Beach Residence', 'Dubai', 4, true, 950)
ON CONFLICT (id) DO NOTHING;

-- Real hotels (is_mock_data = false). mock_base_price stays NULL - the
-- mock adapter already no-ops for any hotel without one, and these get
-- real prices from staying_api_cache instead, once refreshed. Top five
-- 5-star hotels per emirate (Dubai, Abu Dhabi, Fujairah, Ras Al Khaimah,
-- Sharjah, Ajman), each verified as a currently-operating property (name,
-- brand and status checked, not just carried over from memory) - see
-- DECISIONS.md, "Real UAE hotels seeded for StayingAPI."
-- Ibis Deira City Centre (3-star) was dropped from this list - it doesn't
-- fit the "top five 5-star" criteria the rest of this set follows.
INSERT INTO hotels (id, name, area, city, star_rating, is_mock_data, mock_base_price)
VALUES
  -- Dubai
  ('sofitel-dubai-the-palm', 'Sofitel Dubai The Palm', 'Palm Jumeirah', 'Dubai', 5, false, NULL),
  ('address-downtown', 'Address Downtown', 'Downtown Dubai', 'Dubai', 5, false, NULL),
  ('oberoi-dubai', 'The Oberoi Dubai', 'Business Bay', 'Dubai', 5, false, NULL),
  ('rixos-premium-jbr', 'Rixos Premium Dubai JBR', 'Jumeirah Beach Residence', 'Dubai', 5, false, NULL),
  ('one-and-only-royal-mirage', 'One&Only Royal Mirage', 'Al Sufouh', 'Dubai', 5, false, NULL),
  -- Abu Dhabi
  ('emirates-palace-mandarin-oriental', 'Emirates Palace Mandarin Oriental', 'Corniche', 'Abu Dhabi', 5, false, NULL),
  ('rosewood-abu-dhabi', 'Rosewood Abu Dhabi', 'Al Maryah Island', 'Abu Dhabi', 5, false, NULL),
  ('conrad-abu-dhabi-etihad-towers', 'Conrad Abu Dhabi Etihad Towers', 'Corniche', 'Abu Dhabi', 5, false, NULL),
  ('ritz-carlton-abu-dhabi-grand-canal', 'The Ritz-Carlton Abu Dhabi, Grand Canal', 'Grand Canal', 'Abu Dhabi', 5, false, NULL),
  ('hilton-abu-dhabi-yas-island', 'Hilton Abu Dhabi Yas Island', 'Yas Island', 'Abu Dhabi', 5, false, NULL),
  -- Fujairah
  ('al-bahar-hotel-resort-fujairah', 'Al Bahar Hotel & Resort', 'Fujairah Corniche', 'Fujairah', 5, false, NULL),
  ('palace-beach-resort-fujairah', 'Palace Beach Resort Fujairah', 'Fujairah', 'Fujairah', 5, false, NULL),
  ('doubletree-hilton-fujairah-city', 'DoubleTree by Hilton Fujairah City', 'Fujairah City', 'Fujairah', 5, false, NULL),
  ('royal-m-hotel-gewan-fujairah', 'Royal M Hotel by Gewan Fujairah', 'Fujairah', 'Fujairah', 5, false, NULL),
  ('al-diar-siji-hotel', 'Al Diar Siji Hotel', 'Fujairah', 'Fujairah', 5, false, NULL),
  -- Ras Al Khaimah
  ('so-ras-al-khaimah', 'SO/ Ras Al Khaimah Hotel & Resort', 'Mina Al Arab', 'Ras Al Khaimah', 5, false, NULL),
  ('rixos-bab-al-bahr', 'Rixos Bab Al Bahr', 'Mina Al Arab', 'Ras Al Khaimah', 5, false, NULL),
  ('sofitel-rak-al-hamra', 'Sofitel Ras Al Khaimah Al Hamra Beach Resort', 'Al Hamra', 'Ras Al Khaimah', 5, false, NULL),
  ('movenpick-al-marjan-island', 'Movenpick Resort Al Marjan Island', 'Al Marjan Island', 'Ras Al Khaimah', 5, false, NULL),
  ('intercontinental-rak-resort-spa', 'InterContinental Ras Al Khaimah Resort & Spa', 'Mina Al Arab', 'Ras Al Khaimah', 5, false, NULL),
  -- Sharjah
  ('sheraton-sharjah-beach-resort', 'Sheraton Sharjah Beach Resort & Spa', 'Corniche', 'Sharjah', 5, false, NULL),
  ('chedi-al-bait-sharjah', 'The Chedi Al Bait, Sharjah', 'Sharjah Heritage Area', 'Sharjah', 5, false, NULL),
  ('pullman-sharjah', 'Pullman Sharjah', 'Sharjah', 'Sharjah', 5, false, NULL),
  ('corniche-hotel-sharjah', 'Corniche Hotel Sharjah', 'Buhaira Corniche', 'Sharjah', 5, false, NULL),
  ('hotel-72-sharjah', '72 Hotel Sharjah', 'Al Khan Lagoon', 'Sharjah', 5, false, NULL),
  -- Ajman
  ('bahi-ajman-palace', 'Bahi Ajman Palace Hotel', 'Ajman Corniche', 'Ajman', 5, false, NULL),
  ('fairmont-ajman', 'Fairmont Ajman', 'Ajman Corniche', 'Ajman', 5, false, NULL),
  ('dusit-ajman-resort-villas', 'Dusit Ajman Resort & Villas', 'Ajman', 'Ajman', 5, false, NULL),
  ('ajman-saray-luxury-collection', 'Ajman Saray, a Luxury Collection Resort', 'Ajman Corniche', 'Ajman', 5, false, NULL),
  ('oberoi-beach-resort-al-zorah', 'The Oberoi Beach Resort, Al Zorah', 'Al Zorah', 'Ajman', 5, false, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO rooms (id, hotel_id, normalized_type, occupancy, bed_config)
VALUES
  ('room-marina-skyline', 'marina-skyline', 'double_standard', 2, '1 king bed'),
  ('room-old-town-courtyard', 'old-town-courtyard', 'double_standard', 2, '1 king bed'),
  ('room-palm-crescent', 'palm-crescent', 'double_standard', 2, '1 king bed'),
  ('room-business-bay-central', 'business-bay-central', 'double_standard', 2, '1 king bed'),
  ('room-al-fahidi-heritage', 'al-fahidi-heritage', 'double_standard', 2, '1 king bed'),
  ('room-jbr-beachfront', 'jbr-beachfront', 'double_standard', 2, '1 king bed'),
  ('room-sofitel-dubai-the-palm', 'sofitel-dubai-the-palm', 'double_standard', 2, '1 king bed'),
  ('room-address-downtown', 'address-downtown', 'double_standard', 2, '1 king bed'),
  ('room-oberoi-dubai', 'oberoi-dubai', 'double_standard', 2, '1 king bed'),
  ('room-rixos-premium-jbr', 'rixos-premium-jbr', 'double_standard', 2, '1 king bed'),
  ('room-one-and-only-royal-mirage', 'one-and-only-royal-mirage', 'double_standard', 2, '1 king bed'),
  ('room-emirates-palace-mandarin-oriental', 'emirates-palace-mandarin-oriental', 'double_standard', 2, '1 king bed'),
  ('room-rosewood-abu-dhabi', 'rosewood-abu-dhabi', 'double_standard', 2, '1 king bed'),
  ('room-conrad-abu-dhabi-etihad-towers', 'conrad-abu-dhabi-etihad-towers', 'double_standard', 2, '1 king bed'),
  ('room-ritz-carlton-abu-dhabi-grand-canal', 'ritz-carlton-abu-dhabi-grand-canal', 'double_standard', 2, '1 king bed'),
  ('room-hilton-abu-dhabi-yas-island', 'hilton-abu-dhabi-yas-island', 'double_standard', 2, '1 king bed'),
  ('room-al-bahar-hotel-resort-fujairah', 'al-bahar-hotel-resort-fujairah', 'double_standard', 2, '1 king bed'),
  ('room-palace-beach-resort-fujairah', 'palace-beach-resort-fujairah', 'double_standard', 2, '1 king bed'),
  ('room-doubletree-hilton-fujairah-city', 'doubletree-hilton-fujairah-city', 'double_standard', 2, '1 king bed'),
  ('room-royal-m-hotel-gewan-fujairah', 'royal-m-hotel-gewan-fujairah', 'double_standard', 2, '1 king bed'),
  ('room-al-diar-siji-hotel', 'al-diar-siji-hotel', 'double_standard', 2, '1 king bed'),
  ('room-so-ras-al-khaimah', 'so-ras-al-khaimah', 'double_standard', 2, '1 king bed'),
  ('room-rixos-bab-al-bahr', 'rixos-bab-al-bahr', 'double_standard', 2, '1 king bed'),
  ('room-sofitel-rak-al-hamra', 'sofitel-rak-al-hamra', 'double_standard', 2, '1 king bed'),
  ('room-movenpick-al-marjan-island', 'movenpick-al-marjan-island', 'double_standard', 2, '1 king bed'),
  ('room-intercontinental-rak-resort-spa', 'intercontinental-rak-resort-spa', 'double_standard', 2, '1 king bed'),
  ('room-sheraton-sharjah-beach-resort', 'sheraton-sharjah-beach-resort', 'double_standard', 2, '1 king bed'),
  ('room-chedi-al-bait-sharjah', 'chedi-al-bait-sharjah', 'double_standard', 2, '1 king bed'),
  ('room-pullman-sharjah', 'pullman-sharjah', 'double_standard', 2, '1 king bed'),
  ('room-corniche-hotel-sharjah', 'corniche-hotel-sharjah', 'double_standard', 2, '1 king bed'),
  ('room-hotel-72-sharjah', 'hotel-72-sharjah', 'double_standard', 2, '1 king bed'),
  ('room-bahi-ajman-palace', 'bahi-ajman-palace', 'double_standard', 2, '1 king bed'),
  ('room-fairmont-ajman', 'fairmont-ajman', 'double_standard', 2, '1 king bed'),
  ('room-dusit-ajman-resort-villas', 'dusit-ajman-resort-villas', 'double_standard', 2, '1 king bed'),
  ('room-ajman-saray-luxury-collection', 'ajman-saray-luxury-collection', 'double_standard', 2, '1 king bed'),
  ('room-oberoi-beach-resort-al-zorah', 'oberoi-beach-resort-al-zorah', 'double_standard', 2, '1 king bed')
ON CONFLICT (id) DO NOTHING;
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
    return NextResponse.json({
      ok: true,
      tableCount: rows[0]?.count ?? null,
      tables: tableRows.map((r) => r.table_name),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
