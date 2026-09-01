import { NextResponse } from "next/server";
import { pool } from "@/db/client";

// TEMPORARY, ONE-TIME-USE endpoint. Netlify's automated migration mechanism
// (netlify/database/migrations/...) has repeatedly reported success while
// creating zero tables in production, and the manual SQL-console workaround
// couldn't be confirmed either — see DECISIONS.md, "Bug: the migration
// never actually ran." This route runs the exact same schema+seed SQL
// directly against whatever database the live site is actually connected
// to at runtime, via the app's own db client, removing every layer of
// uncertainty about which console/branch/mechanism was actually used.
//
// Protected by a long random secret (DB_INIT_SECRET, set directly in
// Netlify's env vars, never committed) so this can't be hit by anyone else.
// Every statement is idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING),
// so re-running it is harmless. Delete this route once the table count is
// confirmed correct — see DECISIONS.md.
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

INSERT INTO suppliers (id, slug, name, integration_type, requires_click_to_reveal, allows_multi_supplier_display, tos_notes)
VALUES
  ('supplier-booking', 'booking', 'Booking.com', 'mock', true, true, 'Demo mode: prices are simulated, not fetched from this seller.'),
  ('supplier-expedia', 'expedia', 'Expedia', 'mock', true, true, 'Demo mode: prices are simulated, not fetched from this seller.'),
  ('supplier-agoda', 'agoda', 'Agoda', 'mock', true, true, 'Demo mode: prices are simulated, not fetched from this seller.'),
  ('supplier-hotelscom', 'hotelscom', 'Hotels.com', 'mock', true, true, 'Demo mode: prices are simulated, not fetched from this seller.'),
  ('supplier-tripcom', 'tripcom', 'Trip.com', 'mock', true, true, 'Demo mode: prices are simulated, not fetched from this seller.'),
  ('supplier-direct', 'direct', 'Direct — hotel website', 'mock', true, true, 'Demo mode: prices are simulated, not fetched from this seller.')
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

INSERT INTO rooms (id, hotel_id, normalized_type, occupancy, bed_config)
VALUES
  ('room-marina-skyline', 'marina-skyline', 'double_standard', 2, '1 king bed'),
  ('room-old-town-courtyard', 'old-town-courtyard', 'double_standard', 2, '1 king bed'),
  ('room-palm-crescent', 'palm-crescent', 'double_standard', 2, '1 king bed'),
  ('room-business-bay-central', 'business-bay-central', 'double_standard', 2, '1 king bed'),
  ('room-al-fahidi-heritage', 'al-fahidi-heritage', 'double_standard', 2, '1 king bed'),
  ('room-jbr-beachfront', 'jbr-beachfront', 'double_standard', 2, '1 king bed')
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