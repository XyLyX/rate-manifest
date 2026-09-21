-- Rate Manifest - shared platform foundation: ADDITIVE production migration.
-- Source of truth: commit bfb939d (src/db/schema.ts + the platform DDL block in
-- src/app/api/admin/init-db/route.ts, statement for statement; validated against
-- a real Postgres). Eight NEW tables only. No seeds, no INSERT/UPDATE/DELETE, no
-- ALTER of any existing table, no StayingAPI or hotel-catalogue objects.
--
-- STATUS: AUTHORED FOR REVIEW - NOT EXECUTED. Do not run without completing the
-- PREFLIGHT section below and comparing any pre-existing target table, because
-- CREATE TABLE IF NOT EXISTS silently accepts an incompatible existing table.
--
-- Deliberately NOT in netlify/database/migrations/: that directory is applied
-- automatically by Netlify on deploy, which would bypass the manual preflight.
--
-- Only historical dependency: trips(id) (referenced by trip_components).
--
-- Creation order (from the foreign keys):
--   1 trip_components          -> trips
--   2 merchants
--   3 access_routes
--   4 merchant_access_routes   -> merchants, access_routes
--   5 offer_snapshots          -> trip_components, merchants
--   6 component_selections     -> trip_components, offer_snapshots
--   7 commercial_handoffs      -> trip_components, merchants
--   8 commercial_routes        -> component_selections, commercial_handoffs,
--                                 trip_components, merchants, access_routes

BEGIN;

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

COMMIT;

-- =============================================================================
-- PREFLIGHT (READ-ONLY - run BEFORE the migration; everything below is a comment)
-- =============================================================================
-- A. trips exists (must return 1 row):
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name = 'trips';
-- E. trips row count (record it):
--   SELECT count(*) AS trips_rows FROM trips;
-- F. Prerequisite: trips.id must be text (it is the FK column type; expect 'text'):
--   SELECT data_type FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'trips' AND column_name = 'id';
-- B. Do any target tables already exist? Expected: 0 rows. If ANY row is returned,
--    STOP and compare each listed table with the DDL above (C, D) before proceeding:
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name IN
--      ('trip_components','merchants','access_routes','merchant_access_routes',
--       'offer_snapshots','component_selections','commercial_handoffs','commercial_routes');
-- C. If B returned rows - their columns, constraints and indexes:
--   SELECT table_name, ordinal_position, column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name IN (<tables returned by B>)
--    ORDER BY table_name, ordinal_position;
--   SELECT conrelid::regclass AS tbl, conname, contype, pg_get_constraintdef(oid) AS def
--     FROM pg_constraint WHERE conrelid::regclass::text IN (<tables returned by B>) ORDER BY 1, 2;
--   SELECT tablename, indexname, indexdef FROM pg_indexes
--    WHERE schemaname = 'public' AND tablename IN (<tables returned by B>) ORDER BY 1, 2;
-- D. If B returned rows - their row counts (one SELECT per existing table):
--   SELECT 'trip_components' AS t, count(*) FROM trip_components;   -- etc.
-- ABORT if: trips is missing; trips.id is not text; any target table already
-- exists and differs from the DDL above.

-- =============================================================================
-- POST-MIGRATION VERIFICATION (READ-ONLY - run AFTER the migration)
-- =============================================================================
-- 1. All eight tables exist (expect 8):
--   SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN
--     ('trip_components','merchants','access_routes','merchant_access_routes',
--      'offer_snapshots','component_selections','commercial_handoffs','commercial_routes');
-- 2. Column counts (expect: access_routes 5, commercial_handoffs 7, commercial_routes 12,
--    component_selections 4, merchant_access_routes 4, merchants 4, offer_snapshots 11, trip_components 8):
--   SELECT table_name, count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN
--     ('trip_components','merchants','access_routes','merchant_access_routes',
--      'offer_snapshots','component_selections','commercial_handoffs','commercial_routes')
--    GROUP BY table_name ORDER BY table_name;
--    and compare names/types/nullability/defaults with the DDL using the preflight-C columns query.
-- 3. Primary keys, foreign keys (with ON DELETE), unique and check constraints:
--   SELECT conrelid::regclass AS tbl, conname, contype, pg_get_constraintdef(oid) AS def
--     FROM pg_constraint
--    WHERE conrelid::regclass::text IN ('trip_components','merchants','access_routes','merchant_access_routes',
--          'offer_snapshots','component_selections','commercial_handoffs','commercial_routes')
--    ORDER BY 1, 3, 2;
--   Expect: 'p' x8; 'f' x14; 'u' x2 (merchants.slug, access_routes.slug);
--   'c' x1: commercial_routes_subject_check = CHECK (((selection_id IS NULL) <> (handoff_id IS NULL))).
-- 4. Seven named indexes (plus the automatic primary-key / unique-constraint ones):
--   SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN
--     ('trip_components_trip_idx','merchant_access_routes_pair_idx','offer_snapshots_component_idx',
--      'component_selections_component_idx','commercial_handoffs_component_idx',
--      'commercial_routes_selection_idx','commercial_routes_component_idx');   -- expect 7
-- 4b. The two UNIQUE indexes are truly unique (not merely present by name). These are created
--    with CREATE UNIQUE INDEX, so they appear here and NOT as 'u' rows in pg_constraint (step 3):
--   SELECT i.indexname, i.indexdef, x.indisunique
--     FROM pg_indexes i
--     JOIN pg_class c ON c.relname = i.indexname
--     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = i.schemaname
--     JOIN pg_index x ON x.indexrelid = c.oid
--    WHERE i.schemaname = 'public'
--      AND i.indexname IN ('merchant_access_routes_pair_idx', 'component_selections_component_idx')
--    ORDER BY i.indexname;
--   Expect exactly 2 rows; BOTH must show indisunique = true and an indexdef beginning
--   "CREATE UNIQUE INDEX":
--     merchant_access_routes_pair_idx    ... ON merchant_access_routes (merchant_id, access_route_id)
--     component_selections_component_idx ... ON component_selections (component_id)
--   Cross-check: the other five named indexes must show indisunique = false.
-- 5. Target tables are empty immediately after migration (each expect 0):
--   SELECT 'trip_components' AS t, count(*) FROM trip_components
--   UNION ALL SELECT 'merchants', count(*) FROM merchants
--   UNION ALL SELECT 'access_routes', count(*) FROM access_routes
--   UNION ALL SELECT 'merchant_access_routes', count(*) FROM merchant_access_routes
--   UNION ALL SELECT 'offer_snapshots', count(*) FROM offer_snapshots
--   UNION ALL SELECT 'component_selections', count(*) FROM component_selections
--   UNION ALL SELECT 'commercial_handoffs', count(*) FROM commercial_handoffs
--   UNION ALL SELECT 'commercial_routes', count(*) FROM commercial_routes;
-- 6. trips row count equals the value recorded in preflight E:
--   SELECT count(*) FROM trips;
-- 7. No existing application table was modified: this file contains no ALTER, INSERT,
--    UPDATE or DELETE. Confirm trips still has exactly its pre-migration columns and
--    constraints (re-run the preflight-C queries for 'trips' and compare).

-- =============================================================================
-- ROLLBACK (DO NOT RUN unless ALL are true: the migration was JUST applied, no
-- production traffic has written platform data, and none of the eight tables
-- pre-existed). Reverse foreign-key order:
-- =============================================================================
--   BEGIN;
--   DROP TABLE commercial_routes;
--   DROP TABLE commercial_handoffs;
--   DROP TABLE component_selections;
--   DROP TABLE offer_snapshots;
--   DROP TABLE merchant_access_routes;
--   DROP TABLE access_routes;
--   DROP TABLE merchants;
--   DROP TABLE trip_components;
--   COMMIT;
-- (No CASCADE: a failing plain DROP means something unexpected depends on a
-- table, and the rollback should stop rather than remove it.)
