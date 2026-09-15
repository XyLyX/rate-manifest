-- W3 (2026-09-14): destination interest capture.
-- Adds the destination_interest table that records which unsupported
-- destinations visitors searched for, plus their name and email so Rate
-- Manifest can contact them when that destination goes live.
--
-- Follows the same conventions as 20260831225652_init-retry:
-- text PRIMARY KEY (UUID generated in app code by newId()), timestamp
-- DEFAULT now(), no Postgres-native enums (text fields with app-level
-- constraints), no ON CONFLICT deduplication constraint.
--
-- Does NOT modify any existing table.

CREATE TABLE IF NOT EXISTS destination_interest (
  id text PRIMARY KEY,
  destination text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  source text NOT NULL DEFAULT 'destination_search',
  created_at timestamp NOT NULL DEFAULT now()
);
