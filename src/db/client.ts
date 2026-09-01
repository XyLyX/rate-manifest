import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Postgres now (see DECISIONS.md, "Hosting: Netlify DB") — specifically
// Netlify's own auto-provisioned database, reached through
// @netlify/database's getConnectionString(). That package needs no manual
// setup: installing it is what makes Netlify provision the database at all,
// under `netlify dev` locally and on every deploy in production. We still
// use plain drizzle-orm/node-postgres against the connection string it
// hands back, rather than @netlify/database's own db.sql/db.pool driver —
// every query in this app (search.ts, priceTracking.ts, the admin actions,
// seed.ts) is already written against the Drizzle query builder, and this
// way none of that had to change, only this one file.
//
// A plain DATABASE_URL always wins if set — for pointing at some other
// Postgres (a local instance, Neon, Supabase, whatever) without Netlify's
// CLI in the loop, e.g. `drizzle-kit push` during local iteration.
function resolveConnectionString(): string {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;

  try {
    // Deferred require: this package's connection lookup only works inside
    // a Netlify build/runtime or under `netlify dev` — importing it eagerly
    // would break `drizzle-kit push`/seed scripts run outside that context.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getConnectionString } = require("@netlify/database");
    const fromNetlify = getConnectionString();
    if (fromNetlify) return fromNetlify;
  } catch {
    // Not running under Netlify — fall through to the error below.
  }

  throw new Error(
    "No database connection available. Set DATABASE_URL (e.g. to a local " +
      "Postgres instance), or run this under `netlify dev` / a Netlify " +
      "deploy so @netlify/database can provision one automatically."
  );
}

// Standard Next.js dev-mode singleton — without this, hot-reload opens a
// fresh connection pool on every file save.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

const pool = globalForDb.pgPool ?? new Pool({ connectionString: resolveConnectionString() });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}

export const db = drizzle(pool, { schema });
export { schema, pool };
