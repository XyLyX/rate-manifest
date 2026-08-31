# Decisions made while building this

This file exists because the instruction for this build was "you build it
and I'll give you decisions on ambiguity or manual help if required" — so
every place a real judgment call got made without asking first, it's
written down here rather than left silent. Nothing here should surprise
you; flag anything you'd have decided differently.

## Database: SQLite via Drizzle, not Prisma/Postgres directly

The approved stack was TypeScript/Next.js with Postgres, and Prisma was my
first choice of ORM to get there. Prisma failed here for a boring reason:
generating its client downloads a compiled query-engine binary from
`binaries.prisma.sh`, and this build sandbox's network policy blocks that
host outright (confirmed — a direct request returns 403). No amount of
retrying or flags around it fixed this; it's a sandbox-level block, not a
transient failure.

What I shipped instead: **Drizzle ORM** for local dev, on SQLite. The
schema (`src/db/schema.ts`) is still relational, still fully typed, and
still names every field from the Blueprint's seven data objects — nothing
about the data model changed, only the library that talks to the
database.

**Which SQLite driver, and why it changed once:** my first pass used
`better-sqlite3`, which worked fine in my build sandbox — but it's a
native Node module, compiled locally via `node-gyp` at install time, and
on your machine that failed (`npm install` tried to build it and
couldn't find Visual Studio's C++ build tools, which most Windows dev
setups don't have installed by default). Rather than asking you to
install a multi-gigabyte C++ toolchain just to run a hotel-search demo, I
swapped the driver to **`@libsql/client`**, which ships prebuilt native
bindings for Windows/Mac/Linux — no compiler needed at all — and works
identically for a local SQLite file. Same schema, same queries, only
`src/db/client.ts` and `drizzle.config.ts` changed.

**One more thing worth knowing, not a blocker:** this project folder is
inside OneDrive (`Documents\Hotel`), and your first `npm install` also
logged some `EPERM`/`rmdir` warnings — OneDrive tries to sync
`node_modules` (which npm can generate tens of thousands of small files
for) while npm is still writing to it, and the two fight over file locks.
Those were warnings, not the thing that stopped the install, so I didn't
treat it as something to fix silently. If it keeps being noisy in
practice, the durable fix is moving the project to a non-synced folder
(e.g. `C:\Dev\rate-manifest` or `C:\Users\navin\rate-manifest`, outside
`OneDrive\`) — happy to do that move for you if you'd rather not deal
with it.

**Moving to Postgres for production is a real, scoped step, not "flip a
setting":**
1. In `src/db/schema.ts`, swap the `drizzle-orm/sqlite-core` imports and
   column builders for their `drizzle-orm/pg-core` equivalents (mainly:
   `integer(..., {mode:'boolean'})` → `boolean()`, and the timestamp
   columns become native `timestamp()`). Every column keeps its name and
   meaning — this is a mechanical port a couple of hours of careful work,
   not a redesign.
2. Point `src/db/client.ts` at a Postgres connection string (`postgres.js`
   or `pg`) instead of a local file.
3. Run `drizzle-kit push` (or generate real migrations) against that
   database instead of the SQLite file.

I did not do this port now because there's no Postgres server to point it
at yet, and building against a database I can't actually run and test
against would just be guessing. Doing it once real hosting exists (see
"What needs your action" below) is close to zero-risk — the SQLite version
gets the whole app, including the supplier-attribution logic, working and
verified first.

## Supplier identity: keyed to the real named seller, not the integration

Worth calling out because it's a bug I found and fixed while testing, not
a decision I got right the first time. The Supplier table is meant to be
Booking.com, Expedia, Agoda, Hotels.com, Trip.com, a hotel's own direct
site — the actual sellers the reliability score and the "who owns the
customer" trust layer are about. My first pass instead keyed it to
whichever adapter fetched the price (`mock`, `travelpayouts`) — which
would have meant Travelpayouts (which brokers several real OTAs under one
account) got its own reliability score instead of the real seller behind
each booking getting one. Caught this by testing the click-through and
reveal flow end to end and noticing supplier lookups were silently
failing. Fixed in `src/lib/search.ts` and `src/lib/suppliers/types.ts` —
every `SupplierOffer` now carries its own `supplierSlug`/`supplierName`,
and that's what gets written to the database.

## Demo data: kept the prototype's fictional hotels, not real ones

The six properties seeded in `src/db/seed.ts` (Marina Skyline Residences,
Palm Crescent Beach Resort, etc.) are the same fictional placeholders from
the original prototype, not real Dubai hotels. I considered switching to
real hotel names now that this is real software, and decided against it:
attaching invented prices and invented cancellation policies to a real,
named hotel is the kind of thing that reads as factual when it isn't —
worse than an obviously-fictional demo. Every hotel row has `isMockData:
true`; once a real supplier feed is wired up, real hotel content replaces
this seed set entirely and that flag is what marks the difference.

## WhatsApp check-in: built, but not the way it was first described

I said this would be "every clicked row gets a one-click send-check-in
link" — that doesn't actually work, and I want to name the gap rather than
quietly build something else and let you find the mismatch later.
Nothing in this app collects a guest's phone number, anywhere, so there
was never a number for you to send TO. "Send them a check-in message"
isn't buildable on this data.

What's buildable — and what's now actually in the app — flips the
direction: right after someone clicks through to book (on the
`stub-booking` page today; the real post-booking confirmation once a real
supplier is live), they see a **"Confirm this stay on WhatsApp"** button.
That's a plain `wa.me` click-to-chat link, pre-filled with the hotel,
supplier, dates, and a short ref code, addressed to *your* WhatsApp
number. No API, no BSP, no account signup — the guest taps it, it opens a
chat to you, they send. You then go to `/admin/checkins` (unauthenticated,
localhost-only — see below), find the row matching that ref code, and
record what they told you: confirmed, an issue, or no reply. That's what
the `BookingOutcome.status` field was always for; this is just the
missing mechanism to actually move it off "clicked."

Set `NEXT_PUBLIC_WHATSAPP_NUMBER` in `.env` (E.164 digits, e.g.
`9715XXXXXXXX` for your own number) to turn this on — until it's set, the
button just doesn't render, no error.

**Two things this doesn't do yet, on purpose:** it doesn't aggregate
confirmed/issue counts back into a Supplier's `reliabilityScore` — that
rollup is straightforward once there's enough real data to make it mean
something, but isn't built. And `/admin/checkins` has no login — it's
fine on localhost, but if this ever gets deployed publicly, that route
needs at least a shared password before it does, since it shows every
click and every guest ref code.

## Visual identity: Deep Ink / Electric Tangerine / Acid Lime

Rebuilt the whole UI around the palette and typography you specified —
Deep Ink background, Tangerine for every action (search, reveal, book),
Lime reserved for the "intelligence" layer (best-deal tags, save badges,
the RM Signal ring), Space Grotesk for headings, Inter for body, IBM Plex
Mono for every number so prices and stats read like a terminal, not a
brochure. The Best Deal Score now renders as a lime radial ring with a
Strong Buy / Fair Price / Wait tier underneath, using its own
green/amber/red semantics deliberately kept separate from the brand
accents, so status and brand never compete for the same color.

One implementation note, same shape as the Prisma/better-sqlite3 issue
above: I used `next/font/google` first, which fetches font files from
`fonts.googleapis.com` at build time — blocked by this sandbox's network
policy, same as the Prisma binary download. Switched to `@fontsource/*`
packages instead (Space Grotesk, Inter, IBM Plex Mono, installed via
`npm install` like any other package) — same fonts, no live fetch at
build time, one less thing that can fail depending on network policy
wherever this gets built next.

Not done: Tailwind/shadcn. The palette and type system above are
implemented in the same hand-written CSS the app already had
(`src/app/globals.css`), not a Tailwind rebuild — that's a separate,
larger decision (see "hosting and stack" below) I didn't fold into this
pass.

## Travelpayouts: account created, but Hotels Data API isn't live yet

Progress so far, all done in the real Travelpayouts dashboard (not
guessed at): account created, a project connected to
chefoncall5.godaddysites.com (an existing unrelated site, used only to
get through their onboarding — swap this once ratemanifest.com is
hosted), and a real API token issued
(`7f761c1c7006e74fdbf1d6ac674f142f`).

What isn't working yet: the Hotels Data API (`lookup.json` and
`cache.json` under `engine.hotellook.com/api/v2/`) returns a 404,
tested directly with `curl -L` against the exact request format shown
in Travelpayouts' own current API reference
(travelpayouts.github.io/slate) — so this isn't a wrong URL or a typo,
the request is verified to match their docs exactly and is reaching
their real infrastructure (a genuine 301 through their CloudFront
first). The likely cause: Travelpayouts' dashboard is showing "We're
reviewing your Project and matching it with available programs...
usually takes a few days" on both the Programs page and the
Booking.com program page specifically — my read is that an
unapproved/pending project gets a 404 from the data API rather than a
clearer "not authorized yet," which is a common (if unhelpful) pattern.

**Next step, once a few days have passed:** re-run these two commands
and see if they return real JSON instead of a 404:
```
curl -L "http://engine.hotellook.com/api/v2/lookup.json?query=dubai&lang=en&token=7f761c1c7006e74fdbf1d6ac674f142f"
curl -L "http://engine.hotellook.com/api/v2/cache.json?location=Dubai&checkIn=2026-09-15&checkOut=2026-09-17&currency=usd&limit=1&token=7f761c1c7006e74fdbf1d6ac674f142f"
```
If they still 404 once the review clears, that's when it's worth using
Travelpayouts' "Ask a question" contact (visible on each program's
page) to ask directly rather than guessing further.

Separately: Booking.com's own outbound/affiliate link — the piece that
would need a **marker**, distinct from the token above — is gated
behind that same per-program review and hasn't cleared yet either.

## Price tracking: "Not booking now? Track this price"

Built on request: if someone isn't booking the best offer right now, they
can opt in to be told if the price drops. Two design calls worth flagging.

**The nudge threshold is the customer's own choice, not a site-wide
setting.** The opt-in form (on the best offer's card) asks for exactly two
things: an email, and "notify me if it drops by at least AED ___" — a
number they set themselves, defaulting to AED 50. That's deliberate: a
guest who only cares about a AED 200+ swing shouldn't get pinged over a
AED 5 one, and a fixed global threshold can't know that. `minDropAed` is
stored per opt-in on the new `priceTracking` table
(`src/db/schema.ts`).

**No phone number, same principle as the WhatsApp check-in** — this only
ever asks for an email, and only when someone explicitly opts in.

**How detection actually works today, and its real limitation:** there's
no background job polling prices — this build doesn't have a scheduler or
hosting to run one on yet (see "What still needs your action" below). So
`checkAndTriggerAlerts()` (`src/lib/priceTracking.ts`) runs opportunistically,
inside `runSearch()`, every time *anyone* searches that exact hotel and
date range again. If a tracked hotel/dates combination never gets
searched again, a real drop would never be caught. This is an honest MVP,
not a finished feature — once real hosting exists, the natural upgrade is
a scheduled job that re-checks every active tracker on a timer instead of
waiting for organic traffic. Verified end-to-end in the sandbox: opted in
via the UI, manually simulated a AED 200 drop, confirmed a re-search
flipped the row to "triggered" with the right numbers, and confirmed
`/admin/price-alerts` showed it and "Mark as sent" moved it to history.

**Sending is manual, same shape as `/admin/checkins`.** There's no email
sender wired up (Resend was the earlier recommendation, not yet set up) —
a triggered alert sits at `/admin/price-alerts` (unauthenticated,
localhost-only, same caveat as the check-ins admin page) until you email
the customer yourself and mark it sent. Once Resend (or similar) has an
API key in `.env`, sending that email automatically instead of listing it
for a human is the natural next step — the trigger/detection logic
underneath doesn't change.

## Brand system v2: "Every rate. One clear decision."

Built from the detailed brand direction you sent once ratemanifest.com was
secured. What's live now: the RM mark (three ascending bars — no bed,
suitcase, plane, globe, or building, per your explicit "don't" list) as an
inline logo component and the browser-tab favicon; a shared nav
(Search / How it works / For Business) and footer on every page; the new
homepage copy and hero line ("Every rate. One clear decision."); the
Compare / Normalize / Decide section; the search bar restyled as a single
command bar; "Best Deal Score" renamed to **Rate Signal** everywhere, with
your four-tier bands (90+ Strong, 75-89 Good, 55-74 Fair, below 55 Weak,
green/green/amber/red); and a "Why this deal?" panel on the best offer with
a factor table and a plain-language verdict line.

**Two deliberate deviations from your mockup, both to avoid faking data:**

1. The "Why this deal?" table doesn't include a **Breakfast** row. Nothing
   in the supplier adapter's data model (`SupplierOffer` in
   `src/lib/suppliers/types.ts`) tracks board basis — no adapter, mock or
   real, returns whether breakfast is included. Showing a green
   "Breakfast ✓" tick with no field behind it would be exactly the kind of
   fabricated signal this project has avoided everywhere else (same
   principle as never faking a reliability score). The table currently
   shows Price, Cancellation, Taxes & fees, Room, and Supplier — every one
   backed by a real field. Adding breakfast for real means adding a
   `boardBasis` field to the adapter interface first.
2. **Price Intelligence** (the "typical range" / "lower than usual"
   visual) isn't built at all. Your own instruction was explicit: "Do not
   fake historical intelligence on day one." There's a `priceHistory`
   table already recording every search's observed prices, so once there
   are enough real observations for a given hotel/date combination, this
   becomes a real, honest feature rather than an invented one — not
   before.

**Also not built, and why:**
- **Destination/hotel SEO pages** ("Best hotels in Dubai," etc.) — your
  own note says these should be generated from actual rate data, which
  means they're a real-supplier-era feature, not a today one.
- **Terms, Privacy, and a standalone Affiliate Disclosure page** — these
  are real legal documents, not scaffolding I should write placeholder
  text for. The footer states the affiliate/no-payment-processing
  disclosure in plain language instead, and flags that formal pages are
  "coming before public launch." You'll want a lawyer or at least your
  own review before anything here is real.
- **A trademark check on "Rate Manifest"** — you flagged this yourself as
  something to do separately; not something I can verify.
- **The `/for-business` "Request access"** button points at
  `business@ratemanifest.com` on the strength of the domain being real
  now — but that inbox doesn't exist yet. It needs email
  forwarding or a real mailbox set up at your registrar/host before the
  button actually reaches anyone.
- **The RM mark is a simple geometric SVG**, not commissioned design
  work — solid as a real placeholder (used consistently as the favicon
  and in-app logo), but worth a proper design pass before public launch
  if you want something more distinctive.

## Color flip: tangerine/lime dominant background, not Deep Ink

You sent two screenshots of a "Nomadia" travel template and asked for the
background to read like it — electric tangerine + acid lime, dominant, not
the small accent role Deep Ink dominance gave them in the original brand
spec. I asked whether that meant the whole site or just the hero, since it
reverses a rule from your own earlier spec ("dark backgrounds dominate
~70%"); you picked flip-the-whole-site.

**How it's built:** the page background (`body`) is now a tangerine field
with a soft acid-lime glow bleeding in from the top-right corner — flat
color, not a muddy blend, since no real text sits directly on it anymore.
Every page's content — nav, hero, results, admin, footer — lives inside
`.shell`, which is now itself a dark floating card (rounded corners, a
lime top edge, a soft shadow lifting it off the tangerine field) rather
than an invisible wrapper. Everything inside `.shell` — `.card`,
`.offer-row`, `.how-card`, buttons, the Rate Signal rings — keeps the exact
colors and contrast it already had, because its background (dark ink/card)
didn't change at all. This is why the flip touched only two rules in
`globals.css` (`body`, `.shell`) instead of a rewrite: every other color
decision in Brand system v2 stays correct by construction.

**One judgment call, not run past you:** the Nomadia reference is a
generic travel template — stock hero photography, a carousel, "Book Now"
urgency copy — that your own earlier brand spec explicitly ruled out ("no
stock photos," "no carousels," "no fake urgency"). I read your ask as
being about the color field specifically (you said "color scheme
something like the image," not "make it like this template"), so I took
the boldness of the tangerine/lime background without the generic
template layout, copy, or imagery. If you actually want more of the
Nomadia structure — a big photographic hero, testimonial-style sections —
say so and I'll build that separately; right now the site's copy and
layout are unchanged from Brand system v2.

## Hosting: Netlify, via a git repo, on Netlify's own Postgres

You asked to host this on Netlify through a git repo, which forced the one
piece of technical debt this project had been carrying on purpose: SQLite
lives in a single local file, and Netlify runs this app as serverless
functions with no persistent disk — every price-tracking opt-in, WhatsApp
check-in status, and search log would have been wiped on every cold start.
This was flagged as a known trade-off from the very first day (see
"Database: SQLite via Drizzle, not Prisma/Postgres directly," above) —
"moving to Postgres later means... a mechanical, well-scoped port, not a
redesign" — and hosting is exactly the "later" that comment meant.

**What actually changed**, given you chose "migrate to Netlify DB now":

- `src/db/schema.ts` — every table ported from `drizzle-orm/sqlite-core` to
  `drizzle-orm/pg-core`: `integer(..., {mode:'boolean'})` → `boolean()`,
  `integer(..., {mode:'timestamp'})` → `timestamp()`, `sql\`(unixepoch())\`` →
  `sql\`now()\``. No table, column, or relation changed shape — this really
  was the mechanical port the original comment promised.
- `src/db/client.ts` — now `drizzle-orm/node-postgres` against a connection
  string, not `@libsql/client` against a file. The connection string comes
  from `@netlify/database`'s `getConnectionString()` (Netlify auto-provisions
  a real Postgres database the moment that package is installed — no
  dashboard setup, no manual connection string), with a plain `DATABASE_URL`
  env var always taking priority when set, for local iteration against
  anything else. Every other file that touches the database — `search.ts`,
  `priceTracking.ts`, the admin actions, `seed.ts` — is unchanged, because
  all of them were already written against the Drizzle query builder, never
  raw SQL.
- **`netlify/database/migrations/20260831220000_init/migration.sql`** —
  Netlify applies SQL migrations from this folder automatically, immediately
  before every production deploy (and before a deploy preview's first build
  on a new branch). This one file recreates the full schema and seeds the
  same six demo hotels/suppliers/rooms `seed.ts` creates locally, via
  `ON CONFLICT DO NOTHING`, so a freshly deployed site works with no manual
  seeding step.
- `package.json` — `npm run dev` now runs `netlify dev` (needed so
  `@netlify/database` has a database to provision locally); the old
  `next dev` is still there as `npm run dev:next` if you ever want to run
  without the Netlify CLI in the loop (you'll need your own `DATABASE_URL`
  for that — Netlify's auto-provisioning only kicks in under `netlify dev`
  or an actual deploy).
- `netlify.toml` — pins the build command and `@netlify/plugin-nextjs`
  explicitly rather than leaning on auto-detection.

**Verified for real, not just visually**: spun up a local Postgres in the
build sandbox, applied the migration SQL, ran a full production build
against it (including the two admin pages, which are statically prerendered
and therefore query the database *at build time* — the one place this port
could have silently broken), then ran the whole app against it — search,
reveal, "track this price," the price-alerts admin page — and confirmed the
row actually lands in Postgres correctly (dates included).

**One thing I can't verify from here**: whether Netlify's migration
mechanism and `@netlify/database`'s auto-provisioning behave under
`netlify dev` exactly as documented (I tested against a real local Postgres
instance standing in for it, not the actual Netlify-provisioned database,
since that requires the Netlify CLI linked to your live account). The first
`netlify dev` run and the first real deploy are worth watching for that
reason.

## Bug: the first deploy took 30+ minutes because of a packaging mistake

`netlify-cli` was originally added to `package.json`'s `devDependencies` so
`npm run dev` (→ `netlify dev`) would just work after `npm install`, with no
separate install step. That was wrong: it's a large package (installing it
pulled in **1,002** sub-dependencies), and Netlify's own build servers don't
need their own CLI installed as a project dependency at all — only your
machine does, to run `netlify dev` locally. Every production build was
reinstalling all 1,002 packages for a tool the build itself never uses,
which is almost certainly what made the first deploy crawl. Fixed by
removing it from `package.json` entirely; the README now has you
`npm install -g netlify-cli` once, globally, instead.

## Two other homepage changes made in the same pass

Both requested directly, unrelated to hosting: the homepage's "Demo mode"
banner is gone (the results page still has its own, unchanged — it's the
one place a customer is looking at simulated prices they might act on); and
the nav bar is now `position: sticky` site-wide (not homepage-only — the
CSS lives in the one shared `.nav-bar` class every page uses), so it stays
pinned at the top of the viewport while the rest of the page scrolls
beneath it. The homepage hero was also tightened (less vertical padding,
slightly smaller headline) specifically so the search card clears the fold
without scrolling on a typical laptop viewport — verified at 1366×740 and
on a 390px mobile width.

## What still needs your action

Nothing above blocks you from running this locally right now (see
README.md). These are the next real bottlenecks, in the order they'd
actually come up:

1. **Wait out the Travelpayouts project review**, then retest the two
   `curl` commands above. Once real JSON comes back, the actual
   `travelpayoutsAdapter.ts` integration is the next piece of code, and
   it only needs the token already in hand (the marker, for Booking.com's
   outbound link specifically, can follow later).
2. ~~A domain~~ — done: **ratemanifest.com**, purchased via Porkbun.
   ~~Hosting~~ — also done: a Netlify project named **rate-manifest**
   exists under navtrav@outlook.com, env vars set. What's left on this one
   is entirely yours to do, and needs to happen in this order: (a) push
   this code to a GitHub repo — see the terminal commands given
   separately, since I can't do this from inside the build sandbox; (b) in
   the Netlify dashboard, Site configuration → Build & deploy → Link a
   repository, pick that GitHub repo, so pushes auto-deploy; (c) point
   ratemanifest.com at it — Porkbun DNS steps given separately too. The
   SQLite→Postgres port this was waiting on is done — see "Hosting:
   Netlify, via a git repo, on Netlify's own Postgres," above.
3. **Your WhatsApp number in `.env`** — done, this is live and verified
   working end to end on your machine.
4. **StayAPI written clarification** (or a decision to skip it) — still
   outstanding from the Supply Ledger, only relevant once/if a second
   comparison source beyond Travelpayouts gets evaluated.
5. **Set up business@ratemanifest.com** (email forwarding is enough to
   start) so the For Business page's "Request access" button actually
   reaches you.
6. **A Resend (or similar) account**, whenever `/admin/price-alerts`
   manual sending becomes the bottleneck — same "worth it once the manual
   step actually hurts" logic as the WhatsApp Business API note above.

None of these are urgent for running the app as it stands — they're the
order real integration work would hit them.
