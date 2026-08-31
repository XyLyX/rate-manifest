# Rate Manifest

UAE/GCC hotel rate intelligence and booking-trust platform. This is the
real, running build described in `Rate-Manifest-Blueprint.docx` and
`Rate-Manifest-Economics.xlsx` — not a static prototype. See
`DECISIONS.md` for the judgment calls made while building it. Hosted on
Netlify, on Netlify's own auto-provisioned Postgres.

## Running it on your machine (Windows)

You'll need [Node.js](https://nodejs.org) 20 or newer installed — the LTS
installer is fine. Then, from this folder:

```
npm install -g netlify-cli
npm install
netlify link
npm run dev
```

The Netlify CLI is installed **globally**, not as a project dependency —
it's a big package (hundreds of sub-dependencies), and Netlify's own build
servers don't need it at all, only your machine does, to run `netlify dev`
locally. (Earlier this had it as a devDependency, which meant every single
production build was reinstalling it for no reason — that's what was
making the first Netlify deploy take 30+ minutes instead of a couple.)

`npm run dev` runs `netlify dev` (see `package.json`) — the Netlify CLI
front-ends `next dev` and, because `@netlify/database` is installed,
auto-provisions a real Postgres database for local use with no setup of
your own (`netlify link` is a one-time step that points this folder at the
`rate-manifest` Netlify project so the CLI knows which account/database to
use). Schema and demo data both come from
`netlify/database/migrations/20260831220000_init/migration.sql`, applied
automatically — no separate `db:push`/`db:seed` step needed for this path.

If you'd rather not install the Netlify CLI, `npm run dev:next` runs plain
`next dev` — but you'll need to set your own `DATABASE_URL` in `.env`
(any Postgres works: a local install, Neon, Supabase) and run
`npm run db:push` yourself first, since Netlify's auto-provisioning only
happens under `netlify dev` or an actual deploy. See `DECISIONS.md`,
"Hosting: Netlify, via a git repo, on Netlify's own Postgres," for why this
moved off SQLite.

Every price you see is simulated — clearly marked "Demo mode" throughout
— generated deterministically from each hotel's listing so the same
search always returns the same numbers, rather than random noise.
Nothing books anything yet; clicking through shows what happens next.

## What's actually implemented

- **Search → results → click-to-reveal**, exactly as described in
  Blueprint Section A: the results page shows its own computed summary
  ("6 sources checked — best from AED X") before any named source, and
  the specific seller and outbound link for an offer only appear once you
  choose to reveal it.
- **Best Deal Score**: offers are ranked on price, cancellation
  flexibility, and supplier reliability — never just price. A seller with
  no reliability data yet always shows "new partner — reliability data
  building," never a fabricated score.
- **Every search, reveal, and outbound click is logged** (`src/lib/events.ts`,
  the `events` table) — this is what will feed the D4 MVP Measurement Log
  in the economics workbook once there's real traffic to measure.
- **An outbound click opens a `BookingOutcome` row** at status "clicked."
  From there, the WhatsApp check-in (below) is what moves it to
  "confirmed" or "issue reported" — which is what actually becomes the
  reliability signal.
- **WhatsApp check-in, MVP version**: after clicking through, the guest
  sees a "Confirm this stay on WhatsApp" button — a plain click-to-chat
  link to your own WhatsApp number, no Business API needed. Set
  `NEXT_PUBLIC_WHATSAPP_NUMBER` in `.env` to turn it on. Replies get
  reconciled by hand at **`/admin/checkins`** (unauthenticated,
  localhost-only for now) — see `DECISIONS.md` for why this is manual
  today rather than automated.
- **A Supplier adapter interface** (`src/lib/suppliers/`) so a real
  integration is a new file implementing one interface, not a rewrite of
  the search/results code. `mockAdapter.ts` is today's only working
  adapter; `travelpayoutsAdapter.ts` is a real stub, inert until
  `TRAVELPAYOUTS_TOKEN`/`TRAVELPAYOUTS_MARKER` are set in `.env`.
- **Price tracking** — on the best offer's card, "Not booking now? Track
  this price" lets a guest leave an email and their own minimum-drop
  threshold (in AED). Detection runs opportunistically on the next search
  for that hotel/dates (no background job yet — see `DECISIONS.md`);
  triggered alerts wait at `/admin/price-alerts` for manual sending, the
  same shape as `/admin/checkins`.
- **Brand system v2** — "Every rate. One clear decision." The RM mark
  (logo + favicon), a shared nav/footer, the Rate Signal (renamed from
  Best Deal Score, four tiers: Strong/Good/Fair/Weak), a "Why this deal?"
  factor breakdown on the best offer, and a `/for-business` teaser page.
  See `DECISIONS.md` for what was deliberately left out of this pass (and
  why).
- **A tangerine/lime background, dark cards floating on top, sticky nav**
  — the v3 color flip. See `DECISIONS.md`, "Color flip: tangerine/lime
  dominant background."
- **Postgres, on Netlify's own auto-provisioned database** — see
  `DECISIONS.md`, "Hosting: Netlify, via a git repo, on Netlify's own
  Postgres," for the SQLite→Postgres port this replaced.

## What isn't built yet

Any real supplier integration (the Travelpayouts adapter is stubbed, not
live), automatic rollup of confirmed check-ins into a Supplier's
reliability score, and anything past the consumer-facing Layer 1
described in the Blueprint (the B2B API, the proprietary intelligence
dashboards). `DECISIONS.md` has the concrete next-bottleneck list.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally at localhost:3000, via `netlify dev` |
| `npm run dev:next` | Same, but plain `next dev` — needs your own `DATABASE_URL` |
| `npm run build` | Production build (also typechecks) |
| `npm run db:push` | Sync `src/db/schema.ts` to whatever `DATABASE_URL` points at (local iteration only — production schema comes from `netlify/database/migrations/`) |
| `npm run db:seed` | (Re-)populate demo hotels and suppliers at `DATABASE_URL` |
| `npm run db:studio` | Opens Drizzle Studio — a browser UI to inspect the database directly |

## Project layout

```
src/
  app/            Pages and API routes (Next.js App Router)
  components/     Client-side UI (the click-to-reveal results list)
  db/             Drizzle schema, database client, seed script
  lib/
    suppliers/    The adapter interface + mock adapter + Travelpayouts stub
    scoring/      Best Deal Score logic
    search.ts     Orchestrates every adapter, persists results, scores them
    events.ts     Instrumentation — feeds the D4 measurement log later
```
