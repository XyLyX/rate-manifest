import type { Config } from "drizzle-kit";

// Postgres now (see DECISIONS.md, "Hosting: Netlify DB"). This file is only
// used by `drizzle-kit push`/`studio` for local iteration against whatever
// DATABASE_URL points at — production schema is applied by Netlify's own
// migration mechanism (netlify/database/migrations/), not by this file.
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
} satisfies Config;
