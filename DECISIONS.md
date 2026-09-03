# Decisions made while building this

This file exists because the instruction for this build was "you build it
and I'll give you decisions on ambiguity or manual help if required" - so
every place a real judgment call got made without asking first, it's
written down here rather than left silent. Nothing here should surprise
you; flag anything you'd have decided differently.

## Database: SQLite via Drizzle, not Prisma/Postgres directly

The approved stack was TypeScript/Next.js with Postgres, and Prisma was my
first choice of ORM to get there. Prisma failed here for a boring reason:
generating its client downloads a compiled query-engine binary from
`binaries.prisma.sh`, and this build sandbox's network policy blocks that
host outright (confirmed - a direct request returns 403). No amount of
retrying or flags around it fixed this; it's a sandbox-level block, not a
transient failure.

What I shipped instead: **Drizzle ORM** for local dev, on SQLite. The
schema (`src/db/schema.ts`) is still relational, still fully typed, and
still names every field from the Blueprint's seven data objects - nothing
about the data model changed, only the library that talks to the
database.

**Which SQLite driver, and why it changed once:** my first pass used
`better-sqlite3`, which worked fine in my build sandbox - but it's a
native Node module, compiled locally via `node-gyp` at install time, and
on your machine that failed (`npm install` tried to build it and
couldn't find Visual Studio's C++ build tools, which most Windows dev
setups don't have installed by default). Rather than asking you to
install a multi-gigabyte C++ toolchain just to run a hotel-search demo, I
swapped the driver to **`@libsql/client`**, which ships prebuilt native
bindings for Windows/Mac/Linux - no compiler needed at all - and works
identically for a local SQLite file. Same schema, same queries, only
`src/db/client.ts` and `drizzle.config.ts` changed.

**One more thing worth knowing, not a blocker:** this project folder is
inside OneDrive (`Documents\Hotel`), and your first `npm install` also
logged some `EPERM`/`rmdir` warnings - OneDrive tries to sync
`node_modules` (which npm can generate tens of thousands of small files
for) while npm is still writing to it, and the two fight over file locks.
Those were warnings, not the thing that stopped the install, so I didn't
treat it as something to fix silently. If it keeps being noisy in
practice, the durable fix is moving the project to a non-synced folder
(e.g. `C:\Dev\rate-manifest` or `C:\Users\navin\rate-manifest`, outside
`OneDrive\`) - happy to do that move for you if you'd rather not deal
with it.

**Moving to Postgres for production is a real, scoped step, not "flip a
setting":**
1. In `src/db/schema.ts`, swap the `drizzle-orm/sqlite-core` imports and
   column builders for their `drizzle-orm/pg-core` equivalents (mainly:
   `integer(..., {mode:'boolean'})` → `boolean()`, and the timestamp
   columns become native `timestamp()`). Every column keeps its name and
   meaning - this is a mechanical port a couple of hours of careful work,
   not a redesign.
2. Point `src/db/client.ts` at a Postgres connection string (`postgres.js`
   or `pg`) instead of a local file.
3. Run `drizzle-kit push` (or generate real migrations) against that
   database instead of the SQLite file.

I did not do this port now because there's no Postgres server to point it
at yet, and building against a database I can't actually run and test
against would just be guessing. Doing it once real hosting exists (see
"What needs your action" below) is close to zero-risk - the SQLite version
gets the whole app, including the supplier-attribution logic, working and
verified first.

## Supplier identity: keyed to the real named seller, not the integration

Worth calling out because it's a bug I found and fixed while testing, not
a decision I got right the first time. The Supplier table is meant to be
Booking.com, Expedia, Agoda, Hotels.com, Trip.com, a hotel's own direct
site - the actual sellers the reliability score and the "who owns the
customer" trust layer are about. My first pass instead keyed it to
whichever adapter fetched the price (`mock`, `travelpayouts`) - which
would have meant Travelpayouts (which brokers several real OTAs under one
account) got its own reliability score instead of the real seller behind
each booking getting one. Caught this by testing the click-through and
reveal flow end to end and noticing supplier lookups were silently
failing. Fixed in `src/lib/search.ts` and `src/lib/suppliers/types.ts` -
every `SupplierOffer` now carries its own `supplierSlug`/`supplierName`,
and that's what gets written to the database.

## Demo data: kept the prototype's fictional hotels, not real ones

The six properties seeded in `src/db/seed.ts` (Marina Skyline Residences,
Palm Crescent Beach Resort, etc.) are the same fictional placeholders from
the original prototype, not real Dubai hotels. I considered switching to
real hotel names now that this is real software, and decided against it:
attaching invented prices and invented cancellation policies to a real,
named hotel is the kind of thing that reads as factual when it isn't -
worse than an obviously-fictional demo. Every hotel row has `isMockData:
true`; once a real supplier feed is wired up, real hotel content replaces
this seed set entirely and that flag is what marks the difference.

## WhatsApp check-in: built, but not the way it was first described

I said this would be "every clicked row gets a one-click send-check-in
link" - that doesn't actually work, and I want to name the gap rather than
quietly build something else and let you find the mismatch later.
Nothing in this app collects a guest's phone number, anywhere, so there
was never a number for you to send TO. "Send them a check-in message"
isn't buildable on this data.

What's buildable - and what's now actually in the app - flips the
direction: right after someone clicks through to book (on the
`stub-booking` page today; the real post-booking confirmation once a real
supplier is live), they see a **"Confirm this stay on WhatsApp"** button.
That's a plain `wa.me` click-to-chat link, pre-filled with the hotel,
supplier, dates, and a short ref code, addressed to *your* WhatsApp
number. No API, no BSP, no account signup - the guest taps it, it opens a
chat to you, they send. You then go to `/admin/checkins` (unauthenticated,
localhost-only - see below), find the row matching that ref code, and
record what they told you: confirmed, an issue, or no reply. That's what
the `BookingOutcome.status` field was always for; this is just the
missing mechanism to actually move it off "clicked."

Set `NEXT_PUBLIC_WHATSAPP_NUMBER` in `.env` (E.164 digits, e.g.
`9715XXXXXXXX` for your own number) to turn this on - until it's set, the
button just doesn't render, no error.

**Two things this doesn't do yet, on purpose:** it doesn't aggregate
confirmed/issue counts back into a Supplier's `reliabilityScore` - that
rollup is straightforward once there's enough real data to make it mean
something, but isn't built. And `/admin/checkins` has no login - it's
fine on localhost, but if this ever gets deployed publicly, that route
needs at least a shared password before it does, since it shows every
click and every guest ref code.

## Visual identity: Deep Ink / Electric Tangerine / Acid Lime

Rebuilt the whole UI around the palette and typography you specified -
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
`fonts.googleapis.com` at build time - blocked by this sandbox's network
policy, same as the Prisma binary download. Switched to `@fontsource/*`
packages instead (Space Grotesk, Inter, IBM Plex Mono, installed via
`npm install` like any other package) - same fonts, no live fetch at
build time, one less thing that can fail depending on network policy
wherever this gets built next.

Not done: Tailwind/shadcn. The palette and type system above are
implemented in the same hand-written CSS the app already had
(`src/app/globals.css`), not a Tailwind rebuild - that's a separate,
larger decision (see "hosting and stack" below) I didn't fold into this
pass.

## Travelpayouts: account created, but Hotels Data API isn't live yet

Progress so far, all done in the real Travelpayouts dashboard (not
guessed at): account created, a project connected to
chefoncall5.godaddysites.com (an existing unrelated site, used only to
get through their onboarding - swap this once ratemanifest.com is
hosted), and a real API token issued
(`7f761c1c7006e74fdbf1d6ac674f142f`).

What isn't working yet: the Hotels Data API (`lookup.json` and
`cache.json` under `engine.hotellook.com/api/v2/`) returns a 404,
tested directly with `curl -L` against the exact request format shown
in Travelpayouts' own current API reference
(travelpayouts.github.io/slate) - so this isn't a wrong URL or a typo,
the request is verified to match their docs exactly and is reaching
their real infrastructure (a genuine 301 through their CloudFront
first). The likely cause: Travelpayouts' dashboard is showing "We're
reviewing your Project and matching it with available programs...
usually takes a few days" on both the Programs page and the
Booking.com program page specifically - my read is that an
unapproved/pending project gets a 404 from the data API rather than a
clearer "not authorized yet," which is a common (if unhelpful) pattern.

**Update, after the site actually went live:** both the old project
(chefoncall5.godaddysites.com) and a new one created against the real,
live `ratemanifest.com` now show status **Active** in the dashboard - so
the "pending review" theory above was wrong, or at least not the whole
story, since the 404 persists even with an active project on the real
domain. Re-tested directly:
```
curl "https://engine.hotellook.com/api/v2/lookup.json?query=Dubai&token=7f761c1c7006e74fdbf1d6ac674f142f"
```
still 404s. Checked Travelpayouts' own support docs directly (not
guessed): the Hotels Data API is gated behind a **separate written
application**, independent of a project being "Active" - their own
"Requirements for Hotels API access" article states you must submit your
project URL, design prototypes, a project description, and how you plan
to use the API, and lists concrete post-launch requirements too (every
result needs a visible "buy" button, no scraping/bulk-collecting links,
and an expected minimum 9% search→click and 5% click→purchase
conversion once live). "Project active" only means the account/project
itself is approved for their standard affiliate programs (flights,
hotel booking widgets) - the raw JSON data API is a distinct gate on
top of that.

**Next step, now that ratemanifest.com is live:** go to
support.travelpayouts.com and use their "Submit a request" contact form
to formally request Hotels API access, giving them
`https://ratemanifest.com` as the project URL, a short description
("UAE/GCC hotel rate comparison - search results show every supplier's
price side by side with an outbound link to book"), and confirmation
that results will show a buy/booking button per hotel (they already do,
via the outbound click-through). This is the same "StayAPI written
clarification" item from the still-open action list below - same
underlying blocker, now unblocked to actually send since there's a real
live site to point them at for the first time.

**Done**: request submitted via support.travelpayouts.com, topic
API → Data API → Question, marker field set to `568981` (the project's
id, used here as a reference). Ticket **#247169**, status Open as of
submission. Waiting on their reply - no code changes possible here
until they respond with whatever's actually needed.

**Cleanup**: confirmed directly in the dashboard that the API token is
account-level, not tied to any one project, so the old
Chefoncall5/chefoncall5.godaddysites.com project (only ever a
placeholder to get through onboarding before ratemanifest.com existed)
was archived with no risk to the token or to ticket #247169, which
already references the real project by its marker.

**The real answer, from Travelpayouts support directly (ticket
#247169)**: Hotellook - the brand behind `engine.hotellook.com`, the
whole Data API this section is about - shut down permanently on
October 20, 2025. Their own words: "The Hotellook API was fully
disabled. From that date, any requests stopped returning data and
instead return an error," and "at this moment no other hotel brand
offers API to Travelpayouts partners." Every 404 chased in this section
- the review theory, the project-type theory, all of it - was a red
herring. The API doesn't exist, for anyone, full stop. Confirmed
independently against Travelpayouts' own current "brands that provide
APIs" list, which now covers flights/trains/buses, transfers, eSIM, and
tours - no hotels at all. Booking.com is still usable through
Travelpayouts, but only as a plain outbound redirect link, not as
something that returns structured price data.

**`travelpayoutsAdapter.ts` is now a dead end.** The token and marker
stay on file (harmless, account-level, cost nothing to keep), but there
is no path to real data through Travelpayouts as things stand. See
"Real hotel data: evaluating options beyond Travelpayouts" below for
what's next.

Separately: Booking.com's own outbound/affiliate link - the piece that
would need a **marker**, distinct from the token above - is gated
behind that same per-program review and hasn't cleared yet either.

## Real hotel data: evaluating options beyond Travelpayouts

Researched once Travelpayouts confirmed they have nothing (see above),
then expanded further from a second round of research you brought in.
Two very similarly-named services turned up - **StayAPI** (stayapi.com)
and **StayingAPI** (stayingapi.com) - genuinely different products, not
a typo; both are referenced by their full name below to keep them
straight.

**Decision: StayingAPI is the pick**, verified directly against their
real docs, terms, and pricing page (not taken on secondhand summary).
Their price-compare endpoint takes a hotel (by name+location, or a
Google Hotel ID, or 2–6 specific `platform:listingId` pairs) plus
check-in/check-out, and returns `min`/`median` price plus an `offers`
array with each OTA's name, total price, and booking URL - this is
close to exactly the shape `src/lib/search.ts` already normalizes rates
into. Pricing is transparent and self-serve: 300 free credits, no card,
then Starter at $19/mo for 1,900 credits (price-compare costs 30
credits/call, search and availability calls are cheaper at 5). Their
actual Terms of Service (read directly, not assumed) prohibits
"rebuild a competing bulk mirror of a platform's catalog, or resell raw
data in a way that violates a source platform's terms," and requires
attribution back to the source - both compatible with how Rate
Manifest is already built (Supply Ledger: keyed to the real named
seller, click-to-reveal, outbound link to the actual source, never
scraped/mirrored in bulk). This doesn't clear every legal question -
compliance still ultimately depends on each underlying OTA's own terms,
which StayingAPI's ToS explicitly pushes back onto the integrator - but
it's an ordinary SaaS terms shape, not a red flag.

**Runner-up, for later: liteAPI**, now rebranded **Nuitee Connect**
(same product, new name - worth knowing so it's not mistaken for a
different service if you go looking). Free self-serve sandbox, no card.
Different shape from StayingAPI though: it's primarily Nuitee's own
contracted hotel supply (plus GDS/NDC/low-cost-carrier content), not a
cross-OTA comparison feed - good for *actually bookable* inventory once
Rate Manifest wants to own a booking, not for the "what's Booking.com
charging vs. Expedia" comparison that's the product today.

**Ruled out for now:**
- **StayAPI** (stayapi.com, the other one) - same supplier list
  (Booking.com, Expedia, Agoda, Hotels.com, Trip.com, TripAdvisor,
  Airbnb, VRBO, Google Hotels) but pricing beyond a 50-request free
  tier is opaque ("the real number lives on a 15-minute call"), and
  their public pages say nothing about commercial licensing - would
  need the same written clarification StayingAPI already provided by
  just publishing real terms.
- **Booking.com's own Demand API** - self-serve for testing, but real
  access requires being an approved "Managed Affiliate Partner," a real
  business-development process, not a signup form. Worth applying to in
  parallel since it's free to start, but not blocking anything.
- **Agoda, Hotelbeds/WebBeds/RateHawk** - same shape as Booking.com
  Demand API: real supply, but partner-approval/sales-contract gated,
  not self-serve. Hotelbeds/WebBeds/RateHawk specifically are
  wholesale/net-rate supply (a future "Rate Manifest owns the booking"
  path), not retail comparison data - a genuinely different problem
  than what's needed right now.
- **Amadeus for Developers** - free self-serve sandbox exists, but
  Hotel Search returns GDS/wholesale distribution rates, not consumer
  OTA pricing; what it quotes often isn't what a user would actually
  see on Booking.com or Expedia, and coverage of independent/
  OTA-exclusive hotels is thin. Fine for a *booking* engine, a poor fit
  for a *comparison* site.
- **Google Hotels SERP-scraping providers** - technically easy, legally
  unreviewed; not worth the risk of building on top of scraped data
  before understanding the actual terms.

**Done - `src/lib/suppliers/stayingApiAdapter.ts` is built and wired
into `SUPPLIER_ADAPTERS`.** Endpoint shape verified against a real live
call (not assumed from docs) - you ran a test-key request against
`api.stayingapi.com/v1/price-compare` for "Atlantis The Palm" and it
came back correctly formed, just as fixture data (see below). The
adapter's logic was then verified locally three ways: (1) missing
`STAYINGAPI_KEY` → returns `[]`, no network call; (2) a demo/fictional
hotel (`isMockData: true`) → returns `[]` without calling the API at
all, since StayingAPI can't resolve a hotel that doesn't exist; (3) a
temporary real hotel row with the actual sandbox JSON you got back
(and a second, larger synthetic sample) fed through a mocked `fetch` -
confirmed the URL/auth header build correctly, `google_hotels` and
unrecognized OTAs get skipped rather than mis-mapped, and
`booking.com`/`expedia`/`agoda` map to the right existing supplier
slugs with the right fields populated. `STAYINGAPI_KEY` is set on
Netlify already (test key, both scopes).

**What's still needed before this shows real data:**
1. **A live key.** The key in hand is `stay_test_...` - confirmed
   directly that test keys return the same canned sandbox fixture
   ("D-Resort Sibenik") no matter what's actually queried. StayingAPI's
   own error message says a `stay_live_` key needs your account email
   verified first. The adapter already detects and discards sandbox
   responses rather than treating fixture data as real, so this is
   safe to leave wired in until then - it'll just keep returning no
   offers.
2. **Real hotels in the `hotels` table.** All six seed hotels
   (Marina Skyline Residences, etc.) are fictional - the adapter
   correctly skips any hotel with `isMockData: true`, by design, so
   none of today's demo search results will ever come from StayingAPI.
   Real hotel rows (`isMockData: false`, real name/area/city, no
   `mockBasePrice`) need to exist before this can be seen working
   end-to-end. Not done yet - worth a decision on which real Dubai
   properties to seed first.

**My read**: StayAPI is the one worth actually pursuing - right
supplier list, real self-serve free tier to test with before spending
anything, and it slots into the existing `SupplierAdapter` interface
(`src/lib/suppliers/`) the same way the Travelpayouts stub would have.
Waiting on you to say go/no-go before signing up for anything, since
account creation and any ToS acceptance has to be done by you, not from
here.

## Price tracking: "Not booking now? Track this price"

Built on request: if someone isn't booking the best offer right now, they
can opt in to be told if the price drops. Two design calls worth flagging.

**The nudge threshold is the customer's own choice, not a site-wide
setting.** The opt-in form (on the best offer's card) asks for exactly two
things: an email, and "notify me if it drops by at least AED ___" - a
number they set themselves, defaulting to AED 50. That's deliberate: a
guest who only cares about a AED 200+ swing shouldn't get pinged over a
AED 5 one, and a fixed global threshold can't know that. `minDropAed` is
stored per opt-in on the new `priceTracking` table
(`src/db/schema.ts`).

**No phone number, same principle as the WhatsApp check-in** - this only
ever asks for an email, and only when someone explicitly opts in.

**How detection actually works today, and its real limitation:** there's
no background job polling prices - this build doesn't have a scheduler or
hosting to run one on yet (see "What still needs your action" below). So
`checkAndTriggerAlerts()` (`src/lib/priceTracking.ts`) runs opportunistically,
inside `runSearch()`, every time *anyone* searches that exact hotel and
date range again. If a tracked hotel/dates combination never gets
searched again, a real drop would never be caught. This is an honest MVP,
not a finished feature - once real hosting exists, the natural upgrade is
a scheduled job that re-checks every active tracker on a timer instead of
waiting for organic traffic. Verified end-to-end in the sandbox: opted in
via the UI, manually simulated a AED 200 drop, confirmed a re-search
flipped the row to "triggered" with the right numbers, and confirmed
`/admin/price-alerts` showed it and "Mark as sent" moved it to history.

**Sending is manual, same shape as `/admin/checkins`.** There's no email
sender wired up (Resend was the earlier recommendation, not yet set up) -
a triggered alert sits at `/admin/price-alerts` (unauthenticated,
localhost-only, same caveat as the check-ins admin page) until you email
the customer yourself and mark it sent. Once Resend (or similar) has an
API key in `.env`, sending that email automatically instead of listing it
for a human is the natural next step - the trigger/detection logic
underneath doesn't change.

## Brand system v2: "Every rate. One clear decision."

Built from the detailed brand direction you sent once ratemanifest.com was
secured. What's live now: the RM mark (three ascending bars - no bed,
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
   `src/lib/suppliers/types.ts`) tracks board basis - no adapter, mock or
   real, returns whether breakfast is included. Showing a green
   "Breakfast ✓" tick with no field behind it would be exactly the kind of
   fabricated signal this project has avoided everywhere else (same
   principle as never faking a reliability score). The table currently
   shows Price, Cancellation, Taxes & fees, Room, and Supplier - every one
   backed by a real field. Adding breakfast for real means adding a
   `boardBasis` field to the adapter interface first.
2. **Price Intelligence** (the "typical range" / "lower than usual"
   visual) isn't built at all. Your own instruction was explicit: "Do not
   fake historical intelligence on day one." There's a `priceHistory`
   table already recording every search's observed prices, so once there
   are enough real observations for a given hotel/date combination, this
   becomes a real, honest feature rather than an invented one - not
   before.

**Also not built, and why:**
- **Destination/hotel SEO pages** ("Best hotels in Dubai," etc.) - your
  own note says these should be generated from actual rate data, which
  means they're a real-supplier-era feature, not a today one.
- **Terms, Privacy, and a standalone Affiliate Disclosure page** - these
  are real legal documents, not scaffolding I should write placeholder
  text for. The footer states the affiliate/no-payment-processing
  disclosure in plain language instead, and flags that formal pages are
  "coming before public launch." You'll want a lawyer or at least your
  own review before anything here is real.
- **A trademark check on "Rate Manifest"** - you flagged this yourself as
  something to do separately; not something I can verify.
- **The `/for-business` "Request access"** button points at
  `business@ratemanifest.com` on the strength of the domain being real
  now - but that inbox doesn't exist yet. It needs email
  forwarding or a real mailbox set up at your registrar/host before the
  button actually reaches anyone.
- **The RM mark is a simple geometric SVG**, not commissioned design
  work - solid as a real placeholder (used consistently as the favicon
  and in-app logo), but worth a proper design pass before public launch
  if you want something more distinctive.

## Color flip: tangerine/lime dominant background, not Deep Ink

You sent two screenshots of a "Nomadia" travel template and asked for the
background to read like it - electric tangerine + acid lime, dominant, not
the small accent role Deep Ink dominance gave them in the original brand
spec. I asked whether that meant the whole site or just the hero, since it
reverses a rule from your own earlier spec ("dark backgrounds dominate
~70%"); you picked flip-the-whole-site.

**How it's built:** the page background (`body`) is now a tangerine field
with a soft acid-lime glow bleeding in from the top-right corner - flat
color, not a muddy blend, since no real text sits directly on it anymore.
Every page's content - nav, hero, results, admin, footer - lives inside
`.shell`, which is now itself a dark floating card (rounded corners, a
lime top edge, a soft shadow lifting it off the tangerine field) rather
than an invisible wrapper. Everything inside `.shell` - `.card`,
`.offer-row`, `.how-card`, buttons, the Rate Signal rings - keeps the exact
colors and contrast it already had, because its background (dark ink/card)
didn't change at all. This is why the flip touched only two rules in
`globals.css` (`body`, `.shell`) instead of a rewrite: every other color
decision in Brand system v2 stays correct by construction.

**One judgment call, not run past you:** the Nomadia reference is a
generic travel template - stock hero photography, a carousel, "Book Now"
urgency copy - that your own earlier brand spec explicitly ruled out ("no
stock photos," "no carousels," "no fake urgency"). I read your ask as
being about the color field specifically (you said "color scheme
something like the image," not "make it like this template"), so I took
the boldness of the tangerine/lime background without the generic
template layout, copy, or imagery. If you actually want more of the
Nomadia structure - a big photographic hero, testimonial-style sections -
say so and I'll build that separately; right now the site's copy and
layout are unchanged from Brand system v2.

## Hosting: Netlify, via a git repo, on Netlify's own Postgres

You asked to host this on Netlify through a git repo, which forced the one
piece of technical debt this project had been carrying on purpose: SQLite
lives in a single local file, and Netlify runs this app as serverless
functions with no persistent disk - every price-tracking opt-in, WhatsApp
check-in status, and search log would have been wiped on every cold start.
This was flagged as a known trade-off from the very first day (see
"Database: SQLite via Drizzle, not Prisma/Postgres directly," above) -
"moving to Postgres later means... a mechanical, well-scoped port, not a
redesign" - and hosting is exactly the "later" that comment meant.

**What actually changed**, given you chose "migrate to Netlify DB now":

- `src/db/schema.ts` - every table ported from `drizzle-orm/sqlite-core` to
  `drizzle-orm/pg-core`: `integer(..., {mode:'boolean'})` → `boolean()`,
  `integer(..., {mode:'timestamp'})` → `timestamp()`, `sql\`(unixepoch())\`` →
  `sql\`now()\``. No table, column, or relation changed shape - this really
  was the mechanical port the original comment promised.
- `src/db/client.ts` - now `drizzle-orm/node-postgres` against a connection
  string, not `@libsql/client` against a file. The connection string comes
  from `@netlify/database`'s `getConnectionString()` (Netlify auto-provisions
  a real Postgres database the moment that package is installed - no
  dashboard setup, no manual connection string), with a plain `DATABASE_URL`
  env var always taking priority when set, for local iteration against
  anything else. Every other file that touches the database - `search.ts`,
  `priceTracking.ts`, the admin actions, `seed.ts` - is unchanged, because
  all of them were already written against the Drizzle query builder, never
  raw SQL.
- **`netlify/database/migrations/20260831220000_init/migration.sql`** -
  Netlify applies SQL migrations from this folder automatically, immediately
  before every production deploy (and before a deploy preview's first build
  on a new branch). This one file recreates the full schema and seeds the
  same six demo hotels/suppliers/rooms `seed.ts` creates locally, via
  `ON CONFLICT DO NOTHING`, so a freshly deployed site works with no manual
  seeding step.
- `package.json` - `npm run dev` now runs `netlify dev` (needed so
  `@netlify/database` has a database to provision locally); the old
  `next dev` is still there as `npm run dev:next` if you ever want to run
  without the Netlify CLI in the loop (you'll need your own `DATABASE_URL`
  for that - Netlify's auto-provisioning only kicks in under `netlify dev`
  or an actual deploy).
- `netlify.toml` - pins the build command and `@netlify/plugin-nextjs`
  explicitly rather than leaning on auto-detection.

**Verified for real, not just visually**: spun up a local Postgres in the
build sandbox, applied the migration SQL, ran a full production build
against it (including the two admin pages, which are statically prerendered
and therefore query the database *at build time* - the one place this port
could have silently broken), then ran the whole app against it - search,
reveal, "track this price," the price-alerts admin page - and confirmed the
row actually lands in Postgres correctly (dates included).

**One thing I can't verify from here**: whether Netlify's migration
mechanism and `@netlify/database`'s auto-provisioning behave under
`netlify dev` exactly as documented (I tested against a real local Postgres
instance standing in for it, not the actual Netlify-provisioned database,
since that requires the Netlify CLI linked to your live account). The first
`netlify dev` run and the first real deploy are worth watching for that
reason.

## Bug: the migration never actually ran

`20260831220000_init`'s seed INSERTs called `gen_random_uuid()` for supplier
ids. That failed on Netlify's Postgres (never confirmed exactly why - the
same call works fine against a plain local Postgres 16, so it's specific to
something about their managed instance, a permission or an extension not
enabled by default), and because a migration file runs as one transaction,
that failure rolled back every `CREATE TABLE` above it too. Every deploy
after came back with the same "relation does not exist" error on the two
admin pages, which query the database at build time.

Removing `gen_random_uuid()` (deterministic ids instead, same as hotels and
rooms already used) fixed the SQL, but **didn't fix the deploy** - the next
attempt still failed, identically, in 91ms instead of the ~5 seconds a real
schema-creation run takes. Working theory at that point: Netlify records a
migration as applied by its folder name regardless of whether it actually
succeeded internally, so it was skipping `20260831220000_init` on every
later deploy no matter what its file contained.

So the first fix attempt added a new migration folder,
`20260831225652_init_retry`, to get a name Netlify had never seen. That
*also* silently did nothing (81ms for what should be two full
schema-creation runs) - which pointed at a second, more specific bug:
Netlify's own docs say a migration folder's slug (the part after the
number) "must be lowercase alphanumeric with hyphens only," and
`init_retry` has an underscore. The loader logged both folder names before
validating them, which is why the log looked like it was picking the new
one up - but an invalid slug most likely got silently rejected rather than
run. Renamed to `20260831225652_init-retry` (hyphen) to actually satisfy
the naming rule.

The original `20260831220000_init` is left in place untouched (harmless;
it's a permanent no-op either way) rather than deleted, since Netlify's own
applied-migrations record still references it by that name.

**Lessons for any future migration**: once a migration folder has been
pushed and deployed - successfully or not - assume Netlify will never
re-run it from that name again, so a later fix needs a new folder, not an
edit; and the slug half of that folder name must be lowercase letters,
digits, and hyphens only - no underscores.

### How this actually got resolved

None of the above was actually the thing blocking the site. Two unrelated
build bugs were masking each other and made the real state of the database
impossible to read from the build logs alone:

1. The homepage and two admin pages had no `dynamic` export, so Next.js
   tried to *prerender them at build time* - meaning `next build` itself
   queried the (still-empty) database and failed, before the site ever
   got a chance to deploy. Every "relation X does not exist" error in every
   build log was this, not a real migration problem. Fixed by adding
   `export const dynamic = "force-dynamic";` to `src/app/page.tsx`,
   `src/app/admin/checkins/page.tsx`, `src/app/admin/price-alerts/page.tsx`,
   `src/app/stub-booking/page.tsx`, and `src/app/api/click/route.ts` - these
   now render per-request instead, so the build never touches the database.
2. Once that was fixed, a second, entirely separate bug surfaced:
   `netlify.toml` never set `publish`, and Netlify's own default (when
   nothing sets it) falls back to the site's base directory - which
   `@netlify/plugin-nextjs` explicitly rejects, since it needs to find the
   real `.next` build output. Fixed with one line: `publish = ".next"`
   under `[build]`.

With both of those out of the way, the migration files still hadn't
created any tables in production (confirmed directly - the SQL console
under Database → production branch showed "0 tables in public schema"
even after everything above). Rather than keep debugging Netlify's
automated migration mechanism blind, the actual fix was to stop depending
on it: a temporary route, `src/app/api/admin/init-db/route.ts`, runs the
exact same schema+seed SQL directly through the app's own database
connection (the same `pool` `src/db/client.ts` already uses), gated behind
a long random secret set as the `DB_INIT_SECRET` env var. Hitting it once
created all 9 tables and seeded the demo data correctly on the first try.
**This route should be deleted** once nobody needs to re-seed a fresh
database branch by hand - it's idempotent and secret-gated, so it's safe
to leave for now, but it's not meant to be permanent.

The Netlify-automated migration files
(`netlify/database/migrations/20260831220000_init/` and
`.../20260831225652_init-retry/`) are left in place, untouched - still
harmless no-ops per the note above, and there's a real chance they were
fine all along and just never got a clean build to run under.

## Bug: the first deploy took 30+ minutes because of a packaging mistake

`netlify-cli` was originally added to `package.json`'s `devDependencies` so
`npm run dev` (→ `netlify dev`) would just work after `npm install`, with no
separate install step. That was wrong: it's a large package (installing it
pulled in **1,002** sub-dependencies), and Netlify's own build servers don't
need their own CLI installed as a project dependency at all - only your
machine does, to run `netlify dev` locally. Every production build was
reinstalling all 1,002 packages for a tool the build itself never uses,
which is almost certainly what made the first deploy crawl. Fixed by
removing it from `package.json` entirely; the README now has you
`npm install -g netlify-cli` once, globally, instead.

## Two other homepage changes made in the same pass

Both requested directly, unrelated to hosting: the homepage's "Demo mode"
banner is gone (the results page still has its own, unchanged - it's the
one place a customer is looking at simulated prices they might act on); and
the nav bar is now `position: sticky` site-wide (not homepage-only - the
CSS lives in the one shared `.nav-bar` class every page uses), so it stays
pinned at the top of the viewport while the rest of the page scrolls
beneath it. The homepage hero was also tightened (less vertical padding,
slightly smaller headline) specifically so the search card clears the fold
without scrolling on a typical laptop viewport - verified at 1366×740 and
on a 390px mobile width.

## What still needs your action

Nothing above blocks you from running this locally right now (see
README.md). These are the next real bottlenecks, in the order they'd
actually come up:

1. ~~Wait on Travelpayouts~~ - resolved, but not the way anyone wanted:
   their Hotels Data API has been permanently shut down since October
   2025, confirmed directly by their support (ticket #247169).
   `travelpayoutsAdapter.ts` is a dead end. **Sign up for StayingAPI**
   (stayingapi.com, free tier, no card) - see "Real hotel data:
   evaluating options beyond Travelpayouts" above for why it's the
   pick. This needs an account only you can create; once there's an API
   key, the actual `stayingApiAdapter.ts` integration is a same-day
   piece of code.
2. ~~A domain~~ - done: **ratemanifest.com**, purchased via Porkbun, DNS
   pointed at Netlify (A record → 75.2.60.5, CNAME `www` →
   rate-manifest.netlify.app), added as a custom domain on the Netlify
   project. ~~Hosting~~ - done: **rate-manifest** on Netlify, deploying
   from `github.com/XyLyX/rate-manifest` on push to `main`, database
   live with all 9 tables and demo data seeded - see "How this actually
   got resolved" above for the real story of what that took. Only loose
   end: confirm `https://ratemanifest.com` is serving over HTTPS (Netlify's
   auto-provisioned cert can lag a bit behind DNS propagating) and delete
   `src/app/api/admin/init-db/route.ts` once it's no longer needed.
3. **Your WhatsApp number in `.env`** - done, this is live and verified
   working end to end on your machine.
4. ~~StayAPI written clarification~~ - resolved by picking StayingAPI
   instead (item 1 above), whose actual published terms already answer
   the licensing question that was open here.
5. ~~Set up business@ratemanifest.com~~ - done, forwarding live on
   Porkbun. **Email convention, for anything built later**: `business@`
   is for B2B - partnerships, affiliate/API signups (StayingAPI,
   Travelpayouts, etc.), anything logging into a third-party service on
   the company's behalf. `hello@` (also live, forwarding set up
   alongside it) is for customers - a future footer contact link or
   support form should use `hello@`, not `business@`.
6. **A Resend (or similar) account**, whenever `/admin/price-alerts`
   manual sending becomes the bottleneck - same "worth it once the manual
   step actually hurts" logic as the WhatsApp Business API note above.
7. ~~Run the first refresh workflow~~ - **done, 2026-09-01.** See
   "First live refresh test" below for the actual result.

None of these are urgent for running the app as it stands - they're the
order real integration work would hit them.

## Live StayingAPI calls and the refresh architecture (2026-09-01)

Confirmed live, with a real key, against a real hotel (Sofitel Dubai The
Palm): the adapter as originally written could not actually be used the
way it was built. Two real problems, found by testing against the live
API rather than assuming from docs:

1. **A live, uncached price-compare call is slow.** It returns `202` plus
   a job to poll, not an immediate answer - StayingAPI's own docs say a
   job "usually finishes in tens of seconds but can run several minutes
   (240s+)"; the one live test took about 35 seconds. That's much too
   slow for a page a real visitor is waiting on, and it's also longer
   than a Netlify serverless function is even allowed to run - Netlify's
   synchronous function limit is a hard, non-configurable 60 seconds on
   every plan tier.
2. **Most of what StayingAPI returns isn't a seller this app should show.**
   Only 3 of 18 offers on the one live test (Expedia, Hotels.com, Agoda)
   matched the existing Supply Ledger. The rest were smaller resale/
   metasearch sites (EaseMyTrip, Traveloka, Billabook, Reserving,
   eDreams, Priceline, Orbitz, Travelocity, CheapTickets, Hotelscombined,
   momondo, Bluepillow, Evendo, Kiwi.com) plus the hotel's own direct
   listing, which StayingAPI labels with the hotel's own name as the
   "ota" string rather than the word "direct."

**The fix - a cache-and-refresh split, not a live-per-search call:**

- `stayingApiAdapter.ts` (called from `runSearch()`, same as every other
  adapter) is now a pure database read. It never calls the live API and
  never waits on anything - it just reads the `staying_api_cache` table.
- `src/lib/suppliers/stayingApiRefresh.ts` holds the actual live-calling
  logic, split into two fast functions instead of one that waits:
  `submitStayingApiJob` (one HTTP call - answers immediately if
  StayingAPI already has this hotel/date cached on its own side, their
  cache TTL is 1 hour per their docs, otherwise hands back a job to check
  later) and `pollStayingApiJob` (one HTTP call - checks a job's status
  once, never loops or sleeps).
- Two admin routes, same secret-gated pattern as `init-db`:
  `refresh-staying-api` (phase 1 - submits a request per real hotel for
  one date window) and `collect-staying-api-jobs` (phase 2 - checks every
  still-pending row once per call). Both routes are fast by construction
  - neither can exceed Netlify's 60-second ceiling because neither one
  waits for a job to finish.
- The actual waiting happens in `.github/workflows/refresh-staying-api.yml`
  (GitHub Actions has no such ceiling): it calls the submit route once,
  then polls the collect route every 20 seconds for up to ~7 minutes,
  comfortably above StayingAPI's own stated worst case.
- **Manual trigger only, for now** - no `schedule:` on the workflow. This
  was an explicit choice to stay on the free 300-credit StayingAPI tier
  rather than spend it on an automatic cadence. Run it from the Actions
  tab (or `gh workflow run refresh-staying-api.yml`), optionally passing
  `checkIn`/`checkOut` inputs to target specific dates before a demo.
  Add a `schedule:` trigger once there's a reason to pay for one.

**Curated Supply Ledger.** `OTA_TO_SUPPLIER` in `stayingApiRefresh.ts`
only maps the sellers a "we compared trustworthy real sellers" platform
should actually show: Booking.com, Expedia, Agoda, Hotels.com, Trip.com,
Priceline, plus the hotel's own direct listing (detected by comparing the
`ota` string StayingAPI returns against the hotel's own name, normalized
- confirmed live: "Sofitel Dubai The Palm" appeared as its own seller).
Everything else StayingAPI returns is intentionally dropped rather than
invented as a new Supply Ledger entry for a site this platform hasn't
vetted.

**Credit cost, concretely.** Each price-compare call costs about 30
credits regardless of platform-side cache status (their docs: "cache hits
still bill at the full endpoint tier"). Browsing costs nothing - once a
hotel/date is cached in `staying_api_cache`, showing it to any number of
visitors is a plain database read. The only real cost surface is refresh
frequency times catalog size: 5 hotels x 30 credits = 150 credits per
full refresh. The free 300 credits cover 2 refreshes total; the $19/mo
Starter tier (1,900 credits) covers roughly one refresh every 12 days at
this catalog size; daily refresh would need the $99/mo Pro tier. Refreshing
more than once an hour is pointless regardless of budget - StayingAPI's
own cache TTL on this endpoint is 1 hour, so a tighter cadence gets
identical data at identical cost.

**Real hotels seeded (2026-09-01 update: expanded to all 6 emirates).**
Originally 5 real Dubai hotels; expanded on request to the top five
5-star hotels in each of Dubai, Abu Dhabi, Fujairah, Ras Al Khaimah,
Sharjah and Ajman - 30 real hotels total, all added to `hotels` with
`isMockData: false` (`mockBasePrice` stays null - the mock adapter
already no-ops for those). Ibis Deira City Centre (3-star) was dropped
from the Dubai set since it no longer fits the "top five 5-star"
criteria the rest of the catalog follows.

**Bug caught, then fixed: dropping a hotel from the INSERT list doesn't
remove it from production.** Every INSERT in `SCHEMA_SQL` is `ON
CONFLICT DO NOTHING` - additive only, by design, so re-running init-db
is always safe. That also means removing a row from the VALUES list
does nothing to a copy already written by an earlier run - Ibis Deira
City Centre, seeded by an older version of this route before the
catalog became "top five 5-star per emirate," stayed in production as
a 37th, uninvited hotel even after this rewrite. Caught by comparing
the live property dropdown's count against the expected 36 rather than
just trusting `ok: true` - a schema-only check (table names, no row
counts) had already come back clean and would have kept coming back
clean forever. Fixed two ways: an explicit `DELETE FROM hotels WHERE
id = 'ibis-deira-city-centre'` added to `SCHEMA_SQL` (permanent, safe
to leave in - a no-op once the row is gone; `rooms` cascades on delete
so the matching room row goes with it), and the init-db response now
also returns `hotelCounts` (real vs. mock, from a live `GROUP BY`) so
a future mismatch like this shows up in the JSON instead of requiring
a manual property-dropdown count. If a hotel is ever dropped from the
catalog again, add an explicit DELETE for it here too - the INSERT
list alone will never do it.

**Aside: ratemanifest.com served stale data for a few minutes after
this deploy** even though the deploy itself and the database were
already correct - fetching the exact deploy's own permalink URL
showed the right 37 (now 36) hotels immediately, while the
`ratemanifest.com` alias kept showing the pre-deploy list. Most likely
Netlify's skew-protection/CDN layer keeping the previous version
warm briefly after a publish. Not a bug to fix, just worth knowing:
if a deploy looks like it didn't take effect on the main domain right
after publishing, check the deploy's own `*.netlify.app` permalink
before assuming something's actually wrong.

Every hotel name was checked
against current search results (not pulled from memory) specifically
to catch closures and rebrands - the same class of mistake as the
Burj Al Arab renovation check earlier in this project. One rebrand
was caught this way: the Abu Dhabi hotel long known as "Jumeirah at
Etihad Towers" became "Conrad Abu Dhabi Etihad Towers" in 2020 and is
seeded under its current name.

The fifth Dubai slot was originally Atlantis, The Palm; you flagged it
as closed for renovation. Checked and found otherwise - multiple April
2026 sources (Khaleej Times, The National, a dedicated Dubai-closures
tracker) describe only a handful of restaurants and dining venues
(including "Cloud 22") as temporarily paused for refurbishment, with
the hotel itself, and its sister property Atlantis The Royal, both
listed as operating normally. Swapped to One&Only Royal Mirage (Al
Sufouh) at your instruction anyway rather than push further on the
discrepancy - confirmed as a real, currently-operating 5-star property
via its own listings. If you're seeing something more current than
what turned up here, worth flagging so this note can be corrected too.

Full list seeded (id - name - area - emirate):
- Dubai: `sofitel-dubai-the-palm` Sofitel Dubai The Palm (Palm Jumeirah); `address-downtown` Address Downtown (Downtown Dubai); `oberoi-dubai` The Oberoi Dubai (Business Bay); `rixos-premium-jbr` Rixos Premium Dubai JBR (Jumeirah Beach Residence); `one-and-only-royal-mirage` One&Only Royal Mirage (Al Sufouh).
- Abu Dhabi: `emirates-palace-mandarin-oriental` Emirates Palace Mandarin Oriental (Corniche); `rosewood-abu-dhabi` Rosewood Abu Dhabi (Al Maryah Island); `conrad-abu-dhabi-etihad-towers` Conrad Abu Dhabi Etihad Towers (Corniche); `ritz-carlton-abu-dhabi-grand-canal` The Ritz-Carlton Abu Dhabi, Grand Canal (Grand Canal); `hilton-abu-dhabi-yas-island` Hilton Abu Dhabi Yas Island (Yas Island).
- Fujairah: `al-bahar-hotel-resort-fujairah` Al Bahar Hotel & Resort (Fujairah Corniche); `palace-beach-resort-fujairah` Palace Beach Resort Fujairah; `doubletree-hilton-fujairah-city` DoubleTree by Hilton Fujairah City; `royal-m-hotel-gewan-fujairah` Royal M Hotel by Gewan Fujairah; `al-diar-siji-hotel` Al Diar Siji Hotel.
- Ras Al Khaimah: `so-ras-al-khaimah` SO/ Ras Al Khaimah Hotel & Resort (Mina Al Arab); `rixos-bab-al-bahr` Rixos Bab Al Bahr (Mina Al Arab); `sofitel-rak-al-hamra` Sofitel Ras Al Khaimah Al Hamra Beach Resort (Al Hamra); `movenpick-al-marjan-island` Movenpick Resort Al Marjan Island (Al Marjan Island); `intercontinental-rak-resort-spa` InterContinental Ras Al Khaimah Resort & Spa (Mina Al Arab).
- Sharjah: `sheraton-sharjah-beach-resort` Sheraton Sharjah Beach Resort & Spa (Corniche); `chedi-al-bait-sharjah` The Chedi Al Bait, Sharjah (Heritage Area); `pullman-sharjah` Pullman Sharjah; `corniche-hotel-sharjah` Corniche Hotel Sharjah (Buhaira Corniche); `hotel-72-sharjah` 72 Hotel Sharjah (Al Khan Lagoon).
- Ajman: `bahi-ajman-palace` Bahi Ajman Palace Hotel (Ajman Corniche); `fairmont-ajman` Fairmont Ajman (Ajman Corniche); `dusit-ajman-resort-villas` Dusit Ajman Resort & Villas; `ajman-saray-luxury-collection` Ajman Saray, a Luxury Collection Resort (Ajman Corniche); `oberoi-beach-resort-al-zorah` The Oberoi Beach Resort, Al Zorah.

**Credit cost at this catalog size, revised.** At 30 real hotels, a
full refresh (every hotel, one date window) is ~900 credits (30 hotels
x ~30 credits/call) - up from ~150 credits at the original 5-hotel
Dubai-only catalog. That's already past the entire 300-credit free
tier in a single refresh, let alone the "2 refreshes on the free tier"
math from before this expansion. Nothing about the 30-hotel seed itself
costs credits - only the refresh workflow does, and it's still manual
(no `schedule:` trigger), so there's no risk of this running up a bill
on its own.

**City filter on refresh-staying-api, added 2026-09-01.** `GET
/api/admin/refresh-staying-api` now accepts an optional `?city=`
param (must match the `city` column exactly - one of Dubai, Abu
Dhabi, Fujairah, Ras Al Khaimah, Sharjah, Ajman) to submit jobs for
only that emirate's real hotels instead of all 30 - ~150 credits per
emirate instead of ~900 for everything. An unrecognized city returns
`400` with a `validCities` list pulled live from the database rather
than failing silently or refreshing everything by accident. The
"Refresh StayingAPI prices" GitHub Actions workflow gained a matching
optional `city` input, passed straight through - trigger it from the
Actions tab (or `gh workflow run refresh-staying-api.yml -f
city=Dubai`) to test one emirate at a time on the free tier before
committing credits to a full refresh. Verified locally: seeded a test
database with the real 36-row catalog and confirmed `city=Dubai`
and `city=Sharjah` each return exactly their 5 hotels, an unknown
city returns 0 with the correct 6-emirate `validCities` list, and no
`city` param still returns all 30 - see the tsx script run against a
local Postgres instance for this exact check.

**Dynamic pricing window and the direct-rate fallback.** A real hotel's
price only genuinely moves with demand within `DYNAMIC_PRICING_WINDOW_DAYS`
(30, in `stayingApiAdapter.ts`) of check-in. Beyond that, comparing
"live" third-party OTA prices for a date that far out isn't meaningfully
more informative than the hotel's own listed price, so the adapter drops
every offer except `direct` for a search whose check-in is more than 30
days away - evaluated against today's date at *read* time, not at
refresh time, so a window cached 40 days out starts showing the full
comparison on its own once today creeps within 30 days of it, no
re-refresh needed. Rack rate itself (the traditional "published standard
price before discounts") is NOT fetchable from any API - confirmed by
checking both StayingAPI's docs and general hospitality-industry sources;
it's each hotel's own internal, often-dynamically-adjusted number, not
something a live pricing API exposes. The hotel's own direct-website
price (which StayingAPI does return, at no extra cost beyond the normal
refresh) is the closest available live proxy, chosen over either manual
per-hotel data entry or showing nothing at all. **Not yet built:** the
actual front-end treatment - "labeled clearly as the hotel's own listed
price, separate from the multi-seller comparison" - is a UI task, not
touched this session. The backend already returns the right, honest data
shape (one `direct` offer only, beyond the window); how the results page
presents that distinctly from a real multi-seller comparison is still
open.

**What's needed to actually see real prices:** run the
`refresh-staying-api` workflow (`STAYINGAPI_KEY` is already a live key,
set in Netlify) for a date window within 30 days, wait for it to report
`stillPending: 0`, then search one of the 30 real hotels for that same
window on the live site. See the credit-cost note above before running
it against the full 30-hotel catalog.

## Property picker: emirate/property search modes (2026-09-01)

The homepage's single flat `<select>` of every hotel (originally 11
options, the original design) stopped working once the real catalog
grew to 30 hotels across 6 emirates - 36 options in one dropdown is not
browsable. Replaced with a small client component,
`src/components/SearchForm.tsx`, offering two ways to land on the one
hotel the form still requires:

- **Emirate mode** (default): an "All emirates" / per-emirate `<select>`
  narrows a second property `<select>` to just that emirate's hotels.
  Deliberately does NOT jump to a multi-hotel results/compare page -
  that's the bigger "browse by location" feature discussed and set
  aside earlier in this project (see the search-by-location thread
  above); this is just a friendlier way to find one property to search,
  nothing about the backend search flow changed.
- **Property mode**: type-ahead text input. Matches hotel name (prefix
  match ranked above substring match) and area, case-insensitive,
  capped at 8 suggestions, with an explicit "No matching properties"
  state rather than an empty void. Click a suggestion to select it.

Both modes end up setting the same hidden `hotel` input the form always
submitted - `/search`, `runSearch()`, and everything downstream are
untouched. The submit button is disabled until a hotel is actually
selected (a hidden input can't use the HTML `required` attribute, so
this is done in JS) - prevents a submit with no `hotel` param, which the
old design also technically allowed if a user removed the `required`
attribute via devtools, though that was never a real-world problem
before now.

Verified before handoff: `npx tsc --noEmit` clean, a full production
`next build` against a locally seeded 36-hotel database succeeds, and a
headless-browser pass (Playwright, screenshots checked) confirmed both
modes render correctly, the type-ahead narrows and selects properly
(tested "sof" correctly matching both Sofitel properties), the
no-match state displays, the submit button's disabled/enabled state
tracks selection correctly, and the layout holds up at mobile width
(380px) - no console or page errors in any of it.

## Check-out defaults to the day after check-in (2026-09-01)

Requested fix: the check-out date field should default to one night
after whatever check-in date is showing, and should keep tracking
check-in if the user changes it, not just on first page load.

Two parts, both in the files touched by the property-picker work above:

- `src/app/page.tsx`: `defaultCheckOut()` was `today + 16` (two nights
  past `defaultCheckIn()`'s `today + 14`), for no documented reason.
  Changed to `today + 15` - exactly one night after check-in, which
  matches every other "1 night" assumption already in the codebase
  (StayingAPI adapter, pricing display).
- `src/components/SearchForm.tsx`: the check-in/check-out `<input
  type="date">` fields were uncontrolled (`defaultValue` only, set once
  at mount). Switched both to controlled state (`useState` + `value` +
  `onChange`) so the relationship can be enforced live, not just at
  load. A new `handleCheckInChange` snaps check-out to check-in + 1 day
  whenever the current check-out would land on or before the new
  check-in; it leaves check-out alone if the existing value is still a
  valid later date, so nudging check-in by a day or two doesn't
  collapse a longer stay someone deliberately set. The check-out field
  also got a `min` (`checkIn + 1 day`) so the native date picker itself
  refuses an invalid check-out, as a second line of defense beyond the
  JS logic. Both use the same UTC-safe `addDays()` helper the file
  already needed one of (parse via `new Date()`, `setUTCHours(0,0,0,0)`,
  `setUTCDate()`, back out via `toISOString().slice(0,10)`) - matches
  `stayingApiAdapter.ts`'s existing `daysUntil()` convention, so a date
  picked here means the same calendar day everywhere downstream.

Verified before handoff: `npx tsc --noEmit` clean, a full production
`next build` against a fresh seeded database succeeds, and a headless
Playwright pass drove five explicit cases against a local dev server
(all passed, zero console/page errors): the page's initial state
(check-in/check-out one day apart), picking a far-future check-in
(check-out snaps to the next day), manually setting a longer check-out,
picking a check-in still before that manual check-out (check-out stays
put - the "don't clobber a deliberate longer stay" case), and picking a
check-in past the old check-out (check-out snaps forward again). The
check-out field's `min` attribute was also confirmed to track check-in
in the same pass.

## Monetization plan (2026-09-01)

Two rounds got us here. Round one was a five-stage revenue ladder
(affiliate, direct-hotel commission, B2B/API, hotel-side rate
intelligence, merchant model), with the right core argument that
affiliate commission should be the first revenue stream, not the whole
business model - that shape matches how Kayak/Trivago/Skyscanner
actually evolved. Round two correctly re-framed that ladder around
three sequential gates instead of five revenue stages, on the
observation that monetization mechanics don't matter until data, one
real booking, and profitable acquisition are each separately proven.
This section is the merged, final version - the plan to actually build
and act against, not the pitch-deck version of either round.

### The three gates

**Gate 1 - can we get the data?** Real rates, multiple suppliers,
acceptable cost per search, and commercial rights to actually operate
on it. This is where StayingAPI sits today: technically wired end to
end (see "Live StayingAPI calls and the refresh architecture" above),
but never yet proven against a real refresh with real money on the
line, and never asked in writing whether a consumer comparison product
built on their data is something their terms actually permit at
Rate Manifest's intended scale. **Not yet cleared - this is today's
literal next action, see below.**

**Gate 2 - can we make money from one real booking?** Not projected
revenue - one actual tracked commission. The click/outcome pipeline is
built (`/api/click` logs the click, opens a `bookingOutcomes` row at
`clicked`), but it currently redirects to `/stub-booking`, not a real
affiliate link. The blocker is Booking.com's marker, gated behind
Travelpayouts' per-program review and still not cleared. Travelpayouts'
published rates put hotel commission around 4-5% (Booking.com
specifically at 4%) - a planning assumption, never a committed number,
and never something to multiply by search volume; it only exists once
a real click converts. **Not yet cleared - blocked on their review, not
on anything buildable here.**

**2026-09-01 update, from Travelpayouts support directly (Maria)**: you
asked them to confirm the project's category classification wouldn't
count against it during program review. Their answer: ratemanifest.com
is correctly classified under "Content creation," and that
classification "will not negatively impact your applications to join
the programs" - each brand's own representatives weigh a project's
specifics individually during their review. This clears one specific
worry (a misclassification working against the application) but does
**not** mean the Booking.com marker itself is approved - that review is
still separate, still pending, still not something either of us can
push forward directly. Filed here so the status is accurate: one
possible obstacle ruled out, the actual blocker unchanged.

**2026-09-01 - the real Gate 2 blocker, from the Travelpayouts dashboard
directly (not a support reply this time - the actual Booking.com
program page for this project)**: "20 programs are currently
unavailable for Ratemanifest," with two reasons given, quoted exactly:

> Your website doesn't currently have enough traffic. Submit for review
> once it has stable monthly traffic for at least three consecutive
> months.

> Your website doesn't have enough travel-related content. Most brands
> only connect content-driven websites with an active blog that is
> regularly updated and has traffic. We're looking for sites that
> publish original articles, such as travel guides, personal tips,
> reviews, or destination stories.

This changes the honest picture of Gate 2 considerably. It was tracked
above as "blocked on their review" as if it were a queue to wait out -
it is not. It is blocked on two specific, unmet prerequisites that
apply to Booking.com **and the other 19 unavailable programs alike**:
a three-consecutive-month track record of real traffic (Gate 3, not
started), and ongoing original travel content - guides, tips, reviews,
destination stories - which this site has none of; it is purely a rate
comparison tool with no blog or editorial section at all. The earlier
"correctly classified, won't count against you" reassurance from Maria
was real but answered a narrower question than it looked like - the
classification was never the actual gate. The dashboard also says the
project can be updated and resubmitted for review after 2 September,
but resubmitting without either prerequisite in place would very
likely hit the same rejection again.

Practical read: Gate 2, at least through Travelpayouts/Booking.com,
cannot be pulled forward by anything buildable here - it needs (a)
Gate 3's real traffic sustained for three months, which hasn't
started, and (b) a genuine, regularly-updated travel content section,
which is a real ongoing content operation, not a one-time build. Two
things worth deciding, not deciding here: whether building that
content section is worth doing now (before there's traffic to put it
in front of), and whether a real booking path exists that doesn't
route through Travelpayouts at all - StayingAPI's own `outboundUrl`
per offer already links out to the real seller (see
`stayingApiRefresh.ts`), which is a real link, not `/stub-booking`'s
placeholder, even though it isn't confirmed to carry any commission
tracking of its own. Worth checking their docs/terms on that
specifically rather than assuming either way.

Also confirmed on the same page, useful for the planning-assumption
number tracked above: Booking.com's real current rate is a **5%
promotional reward through September 30, 2026**, reverting to the
regular **4%** after that - so the "4-5%" figure already in this file
was directionally right, now with the actual mechanism and expiry
behind it.

**Gate 3 - can we acquire customers for less than they're worth?** The
honest reframe from round two: not "100,000 visitors," but "100 real
users, measured end to end (search to hotel to click to booking to
revenue per search to repeat searches), then 1,000, then decide if it
scales." Nothing here is built or measurable yet because Gates 1 and 2
aren't cleared - there's no real commission to measure acquisition
cost against.

### On distribution and the pillars from round two

The reframe that Rate Manifest shouldn't launch as "a hotel comparison
website" competing head-on for "Dubai hotels" is right, and the named
pillars are the correct kind of idea: hotel-specific pages
("Atlantis The Palm - compare rates"), price-banded destination pages,
WhatsApp as a re-engagement channel rather than a product, data-backed
content instead of generic travel-blog filler, and giving UAE travel
businesses direct access before ever pricing a SaaS tier. All of that
is genuinely Phase 2/3 work - real, but downstream of Gates 1 and 2,
and none of it is buildable in a way that matters until there's a real
booking to point to. Filed here as direction, not a current task list.

### Reality check against what's actually built

Round two's "action 4 - build a tiny prototype (search, hotel, rates,
Rate Signal, click, booking, 20-50 hotels)" is effectively already
done - 30 real hotels across all 6 emirates, full search/Rate
Signal/click pipeline live in production. The remaining gap in that
prototype isn't scope, it's that the click still ends at
`/stub-booking` (Gate 2) and the rates behind it haven't been refreshed
against a real StayingAPI call yet (Gate 1). Two things worth keeping
from round one's critique that neither round has resolved yet, both
gating later stages, not today's action:

- **"Book Direct, Better"** (recommend direct booking when a hotel's
  higher price nets out cheaper with breakfast/credits included) needs
  a `boardBasis` field on `SupplierOffer`
  (`src/lib/suppliers/types.ts`) that doesn't exist yet - a real,
  scoped engineering task for whenever Phase 2 is reached, not now.
- **Hotel-side competitor-rate monitoring** (round one's Phase 4)
  needs continuous visibility into competitor OTA prices, which runs
  into the same SERP-scraping legal-gray-area territory already
  researched and set aside earlier in this project. Still unresolved,
  still not a near-term problem.
- **The merchant model** stays last in both rounds, correctly - it's
  the one stage that becomes a regulated-business decision (UAE trade
  license scope, possibly DTCM rules for booking intermediaries, plus
  whatever a payment processor requires), and needs a UAE-licensed
  lawyer's read, not a decision either of us can make in this project.

### What's actually actionable today

Round two's five actions, checked against real state:

1. **Secure ratemanifest.com** - done.
2. **Resolve StayingAPI in writing** - not done. Worth sending them a
   short written question alongside the technical test below: can
   Rate Manifest legally/commercially operate a consumer hotel
   comparison product on their data at the intended scale, and what
   does real pricing look like past the free 300-credit tier. This is
   the same underlying ask as the still-open "StayAPI written
   clarification" item logged earlier in this file.
3. **Get affiliate approval** - not done, not blocked on us. Still
   waiting on Travelpayouts' Booking.com marker review.
4. **Build the prototype** - already done (see above); nothing new to
   build here.
5. **Test acquisition with real users** - not started, and correctly
   not a coding task - your network, UAE travel contacts, WhatsApp,
   LinkedIn, not SEO-and-wait.

The one piece of this that's actually gated on work happening right
now, this session, is proving Gate 1 technically: running the pending
StayingAPI refresh for real data and confirming it flows through to
the live site. That's what's being finished next.

## Freshness badge (2026-09-01) - built, and the line it must not cross

A "checked X ago" label on each offer, sourced entirely from
`staying_api_cache.refreshed_at`, which already existed on every cache
row. This costs nothing: no new StayingAPI call, no new credits, no
dependency on the still-pending Booking.com marker. Built and shipped
in this pass:

- `SupplierOffer` (`src/lib/suppliers/types.ts`) gained an optional
  `checkedAt?: string | null`. `stayingApiAdapter.ts` sets it from the
  cache row's `refreshedAt` on every offer it returns (one cache row
  covers the whole cross-OTA comparison for a hotel/date pair, so every
  offer from a given search genuinely shares the same real check time -
  this isn't faked per-offer granularity). The mock adapter leaves it
  unset on purpose: a synthesized demo price has no real "checked at,"
  and the results page already runs a separate "Demo mode" banner for
  those hotels: two different honesty mechanisms for two different
  situations, not the same badge doing double duty.
- `DisplayOffer` (`src/lib/search.ts`) carries `checkedAt` through the
  same re-attach pattern already used for `outboundUrl` etc.
- `ResultsList.tsx` renders it via a small client-only `FreshnessBadge`,
  computed in a `useEffect` after mount (not during SSR) specifically to
  avoid a hydration-mismatch on relative time text - an empty first
  paint that fills in a beat later beats a server/client text mismatch.
  No polling/timer keeps it updating live; it's computed once per page
  load, which is enough for a number that only needs to be roughly
  right.

**Wording is deliberately neutral, and this was corrected mid-build**:
"Checked 7 min ago," "Checked 1 hr ago," "Checked just now" - never
"LIVE," "FRESH," "VERIFIED," or any color-coded urgency tier. Those
words claim something about the data (that it was just live-checked,
or reconfirmed against the source) that isn't true - this is only a
read of when the cached response was last pulled. A rounding bug in
the "just now" threshold (30 seconds old was showing "1 min ago"
because minutes were rounded before the under-a-minute check) was
caught in Playwright verification and fixed before shipping.

**Verified**: `npx tsc --noEmit` clean, a full production `next build`
clean, and a headless Playwright pass against a locally seeded database
with a real cache row - confirmed the badge renders "Checked 11 mins
ago" for a 7-minutes-old row (aged further by the time of the actual
check), confirmed the fixed rounding shows "Checked just now" for a
30-second-old row, and confirmed a mock hotel's results page renders no
badge at all. Zero console/page errors in any of it.

**The line this must not cross, recorded explicitly so a future
change doesn't quietly cross it:**

| Feature | Status | Unlocked by |
|---|---|---|
| `refreshedAt` badge (this) | Built | Nothing - already shipped |
| Search-page freshness display generally | Built | Nothing - already shipped |
| Adaptive/tiered background refresh | Not built | A paid StayingAPI tier, and even then only makes sense faster than their 1-hour own cache TTL if the upstream source changes - see "Live StayingAPI calls" above |
| Live recheck at click | Not built | A real (non-stub) booking/affiliate flow existing at all - Gate 2 in the monetization plan above |
| "Price verified" / final-confirmation copy anywhere in the product | Not built | The same real booking flow - do not ship this wording before that exists |
| Rate Accuracy KPI (displayed vs. verified price, per supplier) | Not built | Live recheck at click, which itself needs Gate 2 |

The rule underneath all of it, worth restating so it survives past this
session: **never spend StayingAPI credits solely to make the UI look
more live.** Every credit-spending idea in this table is Phase 2+ of
the monetization plan above, gated on real economics existing first -
this badge is the one piece of "freshness" that was free to build now,
and it is now built.

## First live refresh test (2026-09-01) - Gate 1 proven, not just built

Ran the "Refresh StayingAPI prices" GitHub Actions workflow for real,
`city=Dubai`, dates left blank (defaults to 21 days out, 2 nights -
resolved to checkIn `2026-09-22`, checkOut `2026-09-24`). Actual run,
from the workflow's own logs, not a simulation:

- Submit step: 5 Dubai hotels submitted (Sofitel Dubai The Palm,
  Address Downtown, The Oberoi Dubai, Rixos Premium Dubai JBR,
  One&Only Royal Mirage), all returned `status: "pending"` - a genuine
  StayingAPI job, not an instant cache hit.
- Poll step: pending on attempt 1, `stillPending: 0` on attempt 2 (~22s
  after submit) - the whole submit/poll/GitHub-Actions-waits
  architecture (see "Live StayingAPI calls and the refresh
  architecture" above) worked exactly as designed, first real-world
  run.
- Results, per hotel: Sofitel Dubai The Palm - 0 offers. Address
  Downtown - 0 offers. The Oberoi Dubai - 0 offers. Rixos Premium
  Dubai JBR - **6 offers**. One&Only Royal Mirage - **2 offers**.

**The three zero-offer hotels are not a bug.** `stayingApiAdapter.ts`'s
own comment already anticipated this: a job finishing as `status:
"ready"` with an empty offer list is a legitimate outcome (StayingAPI
genuinely had no cross-OTA coverage for that hotel/date combination),
coded identically to a job that failed - both just mean "nothing to
show," same as any other adapter's empty-array case. Confirmed by
checking the wrong hotel first (Sofitel, one of the zero-offer three)
and seeing "0 sources checked" on the live site, which briefly looked
like a failure until the actual workflow log showed it was correct
behavior, not broken behavior - checking the log before assuming a bug
is what caught this.

**Verified end to end on the live site** by searching Rixos Premium
Dubai JBR for the same window
(`ratemanifest.com/search?hotel=rixos-premium-jbr&checkin=2026-09-22&checkout=2026-09-24`):
6 sources checked, real prices (AED 1,852 total for five of the six
offers, AED 2,299 for the sixth), and Rate Signal correctly
differentiating them - 68/Fair on the five closely-priced offers, 0/Weak
on the outlier. This is the actual product working on real data for
the first time, not the mock adapter and not a documentation claim.
The freshness badge (see above) renders client-side after mount, so it
didn't show up in this particular check - already verified separately
via Playwright against a seeded database.

**This closes Gate 1** from the monetization plan above: real rates,
multiple suppliers, and the full architecture (submit, poll, cache,
adapter, search, display) all proven against production, for real
StayingAPI credits actually spent. Gate 2 (a real booking, not
`/stub-booking`) is still open, still blocked on the Travelpayouts
Booking.com marker review - unchanged by this test.

## Browse by emirate (2026-09-01)

Requested directly, superseding the earlier "deferred" status on this:
when the property-picker work above was built, an AskUserQuestion
choice picked "narrow the property list" over "jump to a multi-hotel
browse page" for the homepage's emirate mode, and DECISIONS.md logged
the browse page as intentionally deferred. That was the right call for
the property picker specifically, but a separate, real need - "someone
coming to Dubai wants to compare hotels first, then check one
property's price" - isn't served by narrowing a dropdown. Built as its
own page rather than reopening that earlier decision.

**`src/lib/browse.ts`, new**: `browseCity(city, checkIn, checkOut)`
lists every hotel in one emirate with whatever price already exists for
those dates. Deliberately separate from `runSearch()`
(`src/lib/search.ts`): it calls the same adapters, so a real hotel only
ever shows StayingAPI data already sitting in `staying_api_cache` -
never a live call, zero extra credits, same rule as the freshness badge
above - but it writes nothing to the database. `runSearch()` persists a
Rate/Cancellation/PriceHistory row and triggers price-tracking checks
because it represents one visitor's actual search of one specific
hotel; looping that across every hotel in an emirate just to render a
browse grid would log five or six "searches" nobody made and pollute
price history with them. Only clicking through to a specific property's
own `/search` page counts as a real search, same as before.

**`src/app/browse/page.tsx`, new**: `?city=` required, `?checkin=`/
`?checkout=` optional (same 14-day-out defaults as the homepage). No
`city` shows a plain list of the 6 emirates instead of erroring. Each
hotel card shows name, area, star rating, and either a real price +
source count, or "Not checked for these dates yet" - written that
specific way, not "no availability found," so it's never confused with
the single-hotel search page's "checked everywhere, found nothing"
message (a real, separate small honesty gap in that existing message,
flagged but not yet fixed - see below). A demo hotel gets a small
"Demo" badge, same signal the single-hotel search page already gives
mock data via its banner. Cards link to that hotel's own `/search` page
for the full Rate Signal comparison.

**Entry point**: a "Browse all hotels [in X]" link added to
`SearchForm.tsx`'s emirate-mode picker, under the two selects - visible
once someone's in emirate mode, using whatever emirate and dates are
currently selected in the form. No nav-bar link added; the nav's
minimalism (Search / How it works / For Business only) was a deliberate
earlier decision to avoid dead-feeling links, and this entry point
already matches where the need showed up.

**Verified**: `npx tsc --noEmit` clean, a full production `next build`
clean, and a Playwright pass against a locally seeded 36-hotel database
with one real cache row (Rixos Premium Dubai JBR) - confirmed all 6
emirates list correctly, confirmed Dubai's grid shows 11 properties
(5 real 5-star + 6 demo hotels, since demo hotels default to city
"Dubai") sorted star-rating-desc-then-name, confirmed the one real
hotel with a cache row shows its real price while the other 4 real
Dubai hotels honestly show "Not checked for these dates yet" rather
than a fake price or a false "no availability," confirmed demo hotels
show a real simulated price with the Demo badge, confirmed the
homepage's new link reflects the selected emirate and current dates,
and confirmed the layout holds at 380px mobile width. Zero console/page
errors throughout.

**Raised but not resolved: hotel/property images.** Asked directly
while building this, since a browse grid is exactly where the lack is
most visible. Checked the real, already-integrated data source rather
than guessing: `stayingApiRefresh.ts`'s own `StayingApiOffer` interface
(the actual shape StayingAPI's price-compare endpoint returns, live-
tested against production) is `{ ota, totalPrice, currency, url }` -
no image field at all, confirmed from the real integration code, not
assumed. Generic stock photography was also already ruled out
explicitly, earlier in this project (see "Color flip" above: "no stock
photos, no carousels, no fake urgency" was your own stated brand
direction). A wrong or generic photo mislabeled as a specific real
5-star hotel would be worse than no photo - the same "never fabricate a
signal" principle this project has followed everywhere else (Rate
Signal's missing breakfast row, no faked price intelligence). Real
options, none of them built here: source each hotel's own official
press/media images by hand (needs checking each one's actual usage
terms - not something safe to bulk-automate), or find a licensed
hotel-content data provider separate from StayingAPI. Shipped
text-only for now, consistent with the existing "no stock photos"
direction - this is a real open decision for you, not a defer-by-
default.

**Also flagged, not yet fixed**: the single-hotel search page's
existing "No availability found across the sources we checked for
these dates" message (`src/app/search/page.tsx`) reads the same whether
Rate Manifest genuinely checked every supplier and found nothing, or
never checked at all because no cache row exists for that hotel/date.
The browse page above avoids this by phrasing its own empty state
differently ("Not checked for these dates yet"); the older single-hotel
message still conflates the two. Small, copy-only fix, not done yet -
raised once already this session, still your call whether it's worth
doing now.

## Refresh default date window aligned to the site's own default (2026-09-01)

Real confusion, worth recording precisely: you ran the refresh workflow
with `checkIn`/`checkOut` left blank, expecting that to mean "no
specific dates," but the workflow's own default logic silently picked
21 days out, 2 nights (this was already documented, in the route file's
own comment, but a comment isn't the same as it actually matching
anything). The homepage's default search - what anyone landing on the
site and searching without picking dates actually sees - is a
different default: 14 days out, 1 night. The two defaults were set
independently, at different points in this project, and nobody had
checked whether they agreed. They didn't, which is exactly why the
browse page's "Not checked for these dates yet" showed up on almost
every real hotel: the one real refresh that existed didn't cover the
one date window most visitors would actually hit by default.

**Fixed**: `refresh-staying-api/route.ts`'s blank-dates default changed
from 21 days out/2 nights to 14 days out/1 night - now computed with
the exact same arithmetic as `defaultCheckIn()`/`defaultCheckOut()` in
`src/app/page.tsx`, so a blank-dates refresh and a default homepage
search now genuinely land on the same window. The GitHub Actions
workflow's input descriptions were updated to match, so the "Run
workflow" form no longer describes a default that isn't true. This
doesn't touch the `checkIn`/`checkOut` query params at all - passing
explicit dates still works exactly as before, for a scoped demo
refresh.

**Not yet re-run**: the existing cache row for Rixos Premium Dubai JBR
and One&Only Royal Mirage still covers the old window (Sep 22-24), not
the new default (Sep 15-16, relative to 2026-09-01). Running the
refresh workflow again with dates left blank will populate the window
that actually matches what visitors see by default - worth doing once
this deploys, same `city=Dubai` pattern as before to stay well inside
the free tier.

## Demo hotels dropped from the catalog (2026-09-01)

Explicit decision: the six fictional placeholder hotels (Marina Skyline
Residences, Old Town Courtyard Hotel, Palm Crescent Beach Resort,
Business Bay Central Hotel, Al Fahidi Heritage Inn, JBR Beachfront
Suites - all `city: Dubai`, all `isMockData: true`) are removed from
the catalog. They were the original demo set, kept for continuity from
before real hotel data existed. Now that every emirate has a real,
StayingAPI-backed hotel set (5 per emirate, 30 total), keeping them
around meant Dubai's dropdown and browse grid showed 11 properties -
5 real, 6 simulated - with no visible way to tell which was which
except a small "Demo" badge. That's the wrong default for a site whose
whole premise is trustworthy comparison. Every property a visitor sees
now is real.

**What changed:**
- `src/app/api/admin/init-db/route.ts` - removed the demo hotels' INSERT
  statement (and their six room rows) from `SCHEMA_SQL`, so a fresh
  database never creates them again. Added `DELETE FROM hotels WHERE
  is_mock_data = true;`, in the same pattern as the existing
  `ibis-deira-city-centre` cleanup line right above it - re-running the
  route (same secret-protected GET as always) removes any of these six
  rows still sitting in production. Cascade-safe: rooms, rates,
  cancellations, price_history, booking_outcomes, price_tracking and
  staying_api_cache all delete automatically via `ON DELETE CASCADE` on
  `hotel_id`; any historical `events` row tied to one of these hotels
  just gets `hotel_id = NULL` via `ON DELETE SET NULL`, not deleted -
  the search/click event itself is still real instrumentation history.
  Verified against a local Postgres instance seeded with the six old
  rows still present (simulating current production): re-running the
  fixed `SCHEMA_SQL` dropped hotels from 36 to 30, Dubai from 11 to 5,
  zero orphaned rooms, zero errors.
- `src/db/seed.ts` - emptied the `HOTELS` array (this script only ever
  seeded the demo set; the real 30-hotel catalog has only ever come
  from `init-db`'s `SCHEMA_SQL`, which is what both production and this
  session's local-Postgres verification actually run). Left as a no-op
  rather than deleted, so `npm run db:seed` doesn't error if anyone
  still runs it.
- `netlify/database/migrations/*/migration.sql` - deliberately left
  untouched. These are historical, already-applied migration snapshots;
  editing an already-applied migration doesn't undo what it already did
  to production, and risks breaking Netlify's migration tracking. The
  live cleanup path is re-hitting `init-db`, exactly as it's always
  been used for schema fixes this session.

**Action needed from you**: after this deploys, hit the `init-db` URL
again with your secret (same one used for the original schema fix) -
`GET /api/admin/init-db?secret=...`. It'll report back `hotelCounts`
(mock vs. real) in the JSON response; mock should read `0` afterward.
Nothing else needs to run - this is a read of the current site's DB
state, not a new deploy step.

## Per-hotel refresh, added once credits ran low (2026-09-01)

Free-tier credits dropped to 120 remaining (out of the original 300).
A full 5-hotel Dubai refresh costs ~150 credits - no longer affordable
in one call. `refresh-staying-api/route.ts` previously only supported
"one whole emirate" (`?city=`) or "every real hotel" - no way to spend
credits more precisely than that.

**Added**: `?hotel=` - a comma-separated list of hotel ids (matching
the `hotels.id` column), e.g.
`?hotel=rixos-premium-jbr,one-and-only-royal-mirage`. Takes priority
over `?city=` when both are present. If none of the ids match a real
hotel, returns a 400 with an explicit error rather than silently
submitting nothing. If some match and some don't (a likely typo),
proceeds with whatever matched and returns the mismatched ids in a
`notFoundHotelIds` field - deliberately not silent, so a typo doesn't
quietly under-spend credits without anyone noticing. Verified against
a local Postgres instance seeded with the real 30-hotel catalog: both
valid ids matched correctly, a one-typo case correctly returned the
one hit plus the one miss, and an all-invalid case correctly matched
zero (the 400 path).

**Your call**: given 120 credits left, you chose to refresh only
Rixos Premium Dubai JBR and One&Only Royal Mirage - the two Dubai
hotels that returned real offers in the first live test (see "First
live refresh test" above; the other three returned zero offers that
time, for a different date window, so skipping them now isn't a
verdict on them permanently - just the cheaper bet with credits this
tight). That's 60 credits for this refresh, leaving 60 in reserve.

**GitHub Actions workflow updated to match**: `refresh-staying-api.yml`
gained a `hotel` input alongside the existing `checkIn`/`checkOut`/
`city` ones, passed straight through as `&hotel=...` when set. To run
the Rixos + One&Only refresh: Actions tab -> "Refresh StayingAPI
prices" -> Run workflow -> leave checkIn/checkOut/city blank, set
`hotel` to `rixos-premium-jbr,one-and-only-royal-mirage`.

## Live on-demand check on /search (2026-09-01)

You asked directly: "what is the use of having this site if a customer
sees not detected." Fair question, and it exposed a real gap - almost
any real date search would hit "not checked," because coverage only
ever came from deliberate, manual, batch admin refreshes. Talked
through the tradeoffs (live-check costs credits per search, not per
refresh; a comparison shopper looks at several hotels before booking
one, so blanket-checking a whole browse grid would burn credits with
no revenue behind most of them). Landed on: keep `/browse` (the
multi-hotel grid) cache-only and cheap - browsing stays free. Make
`/search` (one specific hotel, someone's already narrowed down to it)
the one place that checks live, since that's the moment of real
interest, not idle skimming.

**What it does**: when `/search` loads for a real hotel with no
`staying_api_cache` row at all for the exact `(hotel, checkIn,
checkOut)` being viewed, it fires one real StayingAPI check right
then, instead of showing "no availability" for a date nobody ever
actually checked. If StayingAPI already had it cached on their own
side (their 1-hour TTL), the same page load shows real prices
immediately - no extra wait. Otherwise the page shows "Checking
real-time prices across sources for these exact dates," polls quietly
in the background, and updates in place once the check finishes
(typically under a minute; StayingAPI's own docs allow up to several
minutes worst case). A date that's already been checked - however
long ago, including a legitimate "checked, zero offers" result -
is never re-checked; only a genuinely new, never-seen date pair
triggers a live call.

**Cost is real and ongoing, not one-time** - flagging this plainly
because it changes the shape of the credit conversation: every
never-before-seen date pair a real visitor opens on `/search` now
spends 30 credits automatically, with no per-request confirmation.
That's different from the admin refresh routes, which only ever spend
credits when you deliberately run them. Once this is live, StayingAPI
spend scales with how many distinct new dates real visitors search,
not with how often you choose to refresh.

**Concurrency safety**: two visitors opening the same never-before-seen
`(hotel, checkIn, checkOut)` within moments of each other must not
both trigger a paid call for it. `ensureLiveCheckTriggered()` in
`stayingApiRefresh.ts` claims the triple with an atomic
`INSERT ... ON CONFLICT DO NOTHING` against the existing
`staying_api_cache_hotel_checkin_idx` unique index *before* calling
the paid API - only the request whose insert actually lands goes on to
spend credits; the loser just waits and polls like everyone else.
Verified directly against local Postgres: two inserts for the same
triple in quick succession leave exactly one row, and only the
winner's insert reports a returned id.

**Failure handling**: if the live submit call itself fails (bad key,
StayingAPI down, network blip), the placeholder row is deleted rather
than left stuck "pending" forever - the next visitor for that exact
pair gets a clean retry instead of a permanent dead end. `/search`
shows an honest "we could not check real-time prices for these dates
just now" message in that case, distinct from both "checking" and
"no availability found" (the latter now only shown for a pair that
was genuinely checked and came back empty - this also resolves the
older flagged issue where that message conflated "checked, found
nothing" with "never checked").

**New files**: `src/app/api/live-check-status/route.ts` - public,
unauthenticated (deliberately - it only ever polls a job that was
already submitted, never submits a new one, same cost shape as the
admin collect route's repeated polling). `src/components/
LiveCheckStatus.tsx` - client component, polls every 4s for up to
~4 minutes, then shows a "taking longer than usual" fallback rather
than polling forever; calls `router.refresh()` on any terminal state
so the server component re-renders with whatever's now in the cache.

**Verified locally** (Postgres + a local `next dev` server + Playwright,
`STAYINGAPI_KEY` deliberately unset so no real credits were spent
testing this): a pre-seeded "ready" row renders real prices exactly as
before (existing flow untouched); a pre-seeded "pending" row shows the
checking UI, and the client visibly fires a poll request in-browser; a
hotel/date pair with no row at all correctly claims the placeholder,
fails cleanly on the missing API key, deletes the placeholder, and
shows the honest error message - confirmed retrying the same pair
afterward behaves identically rather than getting stuck; a poll
against an intentionally-unreachable fake `pollUrl` degrades
gracefully to "ready, zero offers" rather than hanging, and the page
correctly shows the accurate "no availability found" message on the
next load.

**Not yet decided**: this is built, typechecked, and build-verified,
but not yet pushed or deployed - given the real, ongoing per-search
cost this introduces, that should be a deliberate call once there's
clarity on the StayingAPI plan situation (see "Monetization plan"),
not something that goes live purely because it was finished being
built.

## Two-layer architecture, and the roadmap beyond Booking.com (2026-09-01)

The Booking.com dashboard finding above (blocked on traffic history and
content, not a review queue) prompted a real strategic reset, worked
through in detail. Formalizing it here because it changes how
everything downstream gets built, not just what gets monetized.

**The core split - Layer 1 (Rate Intelligence) and Layer 2
(Monetization) are independent.** Layer 1 is the product: StayingAPI
feeds Rate Manifest's comparison, freshness, and Rate Signal scoring.
It does not depend on which monetization partner is active, and no
monetization decision should ever touch it. Layer 2 is swappable and
starts with whatever is actually reachable right now - Klook today,
with Booking.com, Agoda, Expedia, direct hotel deals, and bedbanks
layered in later as each becomes available. **The site can launch
without Booking.com.** Booking.com is one supplier to Layer 2, not the
company - if Rate Manifest's existence depended on one API approval,
that would mean the wrong company got built.

**Klook's real role, corrected from the first pass**: Klook is not a
hotel-comparison replacement, and building "Rate Manifest = Klook
hotel comparison" would be a dead end - their affiliate strength is
travel experiences, attractions, transport, and tours, not hotel
rates, even though they do sell some accommodation. So Klook never
sits inside the hotel comparison or gets treated as a checked source
- Rate Manifest compares hotel rates independently (Layer 1, untouched,
still only StayingAPI-verified sellers), and Klook monetizes the
traveller around the hotel (Layer 2): a "Complete your Dubai trip"
section - Burj Khalifa, Desert Safari, Marina Cruise, airport transfer,
eSIM, that kind of thing - surfaced after someone's already chosen a
hotel, not competing with the comparison itself. Real per-product
prices for that section aren't buildable honestly yet - there's no
Klook price API wired up, and the "no fabricated numbers" rule that's
governed this whole build applies here too - so v1 is real product
names and real affiliate links, no invented prices, until there's an
honest way to show real ones.

**Correction, checked against the actual code before building
anything on top of it**: the paragraph originally written here claimed
`/api/click` redirects every click to `/stub-booking`, discarding
`offer.outboundUrl`. That was wrong - re-read after writing it. The
real "View on {supplier}" button in `ResultsList.tsx`'s `OfferRow`
already renders `<a href={offer.outboundUrl} target="_blank">`
directly - it goes straight to the real StayingAPI seller link for
every real hotel today, no `/api/click` hop, no `/stub-booking`. There
is no discarded-link bug.

**The real gap this surfaced instead**: `/api/click` is now only ever
referenced as a URL value in `mockAdapter.ts` (its stub
`outboundUrl: /api/click?stub=1&hotel=...&supplier=...`, used only for
`isMockData` hotels). Since all mock hotels were dropped from the
catalog this session, nothing in production ever hits `/api/click`
anymore. That route was the only thing that logged an
`outbound_click` event and opened a `bookingOutcomes` row at
`clicked` - the row the WhatsApp check-in and supplier
reliability-score trust layer are built on. So today, for every real
hotel, a real outbound click is honest (goes straight to the real
seller) but invisible to Rate Manifest - nothing records that it
happened. This needs a real design decision, not a quick fix: how to
log a `clicked` row on that direct outbound link without adding a
redirect hop in front of it (a fire-and-forget beacon, an `onClick`
that pings a logging endpoint without blocking the navigation, etc.)
- not decided yet.

**What's actually buildable now vs. not a coding task**, keeping the
same discipline as "What's actually actionable today" above:
1. Decide and build a way to log a `bookingOutcomes` "clicked" row for
   real-hotel outbound clicks without disrupting the direct
   `href={offer.outboundUrl} target="_blank"` link - needed before the
   WhatsApp check-in / reliability-score trust layer means anything
   for real hotels. Design not yet chosen.
2. Add the "Complete your Dubai trip" Klook section (names + real
   links, no invented prices) - buildable once there's at least one
   real generated Klook affiliate link to build against. Still waiting
   on that from the Travelpayouts Links tool.
3. "Save this hotel / notify me when the price changes" as the
   fallback when no real booking route exists - already built (see
   `priceTracking` table and its opportunistic check in `search.ts`);
   this MVP framing just confirms it's the right fallback, nothing new
   to build.
4. Direct hotel-group affiliate programs, investigated in parallel
   with Travelpayouts rather than waiting on it - real research, not
   a coding task; nobody's started it.
5. A curated, tiered Dubai-first catalog (100-300 hotels, luxury/
   high-volume/business tiers) with dedicated per-hotel pages built for
   long-tail searches ("Atlantis The Palm price," "Atlantis vs Atlantis
   The Royal") instead of competing on "Dubai hotels" broadly - a real,
   large scope decision on its own, not something to fold into today's
   work without deciding it deliberately first.
6. Lead generation (a "Request a hotel quote" enquiry path for
   properties with no affiliate link, fulfilled manually by a travel
   agent/DMC partner at first) - a genuinely new feature, not started,
   explicitly manual-first by design ("validating demand, not building
   Expedia on day one").
7. Other hotel affiliate networks beyond Travelpayouts - not
   investigated yet.

Items 4 through 7 are real threads, not dismissed - just not something
to start building reflexively under the momentum of this conversation.
Worth deciding deliberately, one at a time, which comes next.

**Klook's accommodation program, added to try (2026-09-01)**: Klook's
own affiliate strength is activities, attractions, tours, airport
transfers, transport, and SIM/eSIM - and it now also sells
hotels/accommodation directly, which is why its commission runs
higher than the experiences-only categories. The user wants to try
the Klook accommodation program too, not just the "Complete your
Dubai trip" experiences section. This stays a Layer 2 (Monetization)
addition only - it does not change Layer 1's rule that the hotel
comparison itself is StayingAPI-verified sellers only. Klook hotel
listings, if added, would be a separate, clearly labeled path (for
example, a "Book via Klook" option shown alongside or after the
verified comparison, not folded into the Rate Signal or the
comparison table). Still needs the real generated Klook affiliate
link(s) before this is buildable - same blocker as the "Complete your
Dubai trip" section.

## Klook "Complete your Dubai trip" section, shipped (2026-09-01)

Built and locally verified. The real generated Klook affiliate link
was provided (`https://klook.tpm.lv/2vSljl8m`, generated via
Travelpayouts' Links tool with the "Destination page" field left as
`https://klook.com` - confirmed by screenshot, so this is a generic
homepage link, not a deep link into any specific category or
product). Because it's one generic link, the section built around it
makes only one honest claim: "Klook, a real named partner, is one
click away" - it does not pretend any individual category (Desert
Safari, eSIM, etc.) has its own tracked link, since none does yet.

**New files**: `src/lib/klook.ts` (the link constant plus the real
category list: activities & experiences, tours & attractions, airport
transfers, transport, SIM/eSIM, hotels & accommodation - kept
deliberately separate from `src/lib/suppliers/`, since Klook is
Layer 2 and must never be importable from `search.ts` or the scoring
code); `src/components/KlookTripSection.tsx` (a plain server
component - one eyebrow, one line of real category names, one real
`<a href target="_blank">` button, one line disclosing it's a
separate partner booked/paid on Klook, not through Rate Manifest).

**Wired into** `src/app/search/page.tsx`, shown only when
`!result.hotel.isMockData && liveCheck.kind !== "checking" &&
liveCheck.kind !== "error"` - a real hotel, past the live-check
spinner, past a failed check. This also covers the "Book via Klook
accommodation" idea from the note above for now: rather than a second,
separately-labeled accommodation CTA using the same generic link
(which would read as two calls to action pointing at the identical
page), the one section's category list already names "Hotels &
accommodation" alongside the experience categories. A distinct
accommodation-specific path can be built once there's a Klook link
actually scoped to hotels.

**Verified locally**: `npx tsc --noEmit` clean; against a local
Postgres seeded from the real `init-db` schema, the section rendered
correctly on `/search` for a real hotel with a `ready` cache row
(real category copy, real link, disclosure line all present), and
correctly stayed hidden for the same hotel with no cache row and no
`STAYINGAPI_KEY` set (live-check resolves to `error`, section
suppressed rather than showing next to a "could not check prices"
message). No real StayingAPI credits spent.

**Not built yet, on purpose**: click tracking on the Klook button
(no `bookingOutcomes`-style logging - this is a plain outbound link,
not wired into `EVENT_TYPES`/`logEvent` since that's server-side and
this is a client click). Worth adding once there's an appetite for
it, using the same "don't put a redirect in front of a direct link"
approach flagged for the real-hotel `bookingOutcomes` gap above
(`navigator.sendBeacon` on click, not a routed hop).

## Klook accommodation kept out of the trip section (2026-09-01)

Correction to the section just shipped above, before it even went
live: the rendered category list included "Hotels & accommodation."
The user caught the real problem with that - Klook does sell hotels,
so naming it as a category on a page whose whole job is comparing
hotel rates reads as "does Klook also do what Rate Manifest does,"
which is exactly the confusion the earlier Klook-positioning
correction was trying to avoid in the first place. Fixed:
`KLOOK_CATEGORIES` split into `KLOOK_EXPERIENCE_CATEGORIES`
(activities, tours, transfers, transport, eSIM - what actually
renders in `KlookTripSection`) with hotels/accommodation left out of
the customer-facing copy entirely. Klook's accommodation program
stays a real, separate idea - just not a line item next to the
StayingAPI-verified comparison.

## A separate domain for experiences/Klook - considered, not decided (2026-09-01)

The user's proposal: buy a second domain, put Klook/experiences
content there instead of on ratemanifest.com, test it, and later add
a tab on ratemanifest.com linking out to it if it proves out -
ratemanifest.com stays the primary, hotel-comparison-only property.
The reasoning behind it is the same one above: keep anything
Klook-branded away from anything that could be mistaken for "hotels,"
since Klook sells hotels too.

Three real options, laid out honestly rather than picked unilaterally
(this is a cost/scope decision, not a code change):

1. **Same domain, de-branded copy (what's shipped now)** - the fix
   above (drop "hotels" from the visible category list, keep the
   disclosure line) already addresses the specific confusion at zero
   extra cost or infrastructure. Ships today, no domain purchase, no
   second site to maintain.
2. **A subdomain of ratemanifest.com** (e.g. `trips.ratemanifest.com`
   or `experiences.ratemanifest.com`) - real separation (a distinct
   URL, a clean place to build out actual experience content/
   management later) without buying a new domain or starting SEO from
   zero - it still inherits some association with the ratemanifest.com
   name via DNS, but reads as a distinct section. Cheapest way to
   "test it" as the user put it.
3. **A wholly separate domain and brand** - the most separation, and
   the right move eventually if the experiences side turns into its
   own real product ("Rate Manifest" is a hotel-price-comparison name,
   not a natural fit for tours and transfers) - but it's a real cost
   (domain registration, plus whatever hosting/build a second site
   needs) and starts with zero search authority, for a Klook
   integration that's so far one generic homepage link, not yet
   tested with a single real visitor.

No decision made yet - asked the user which of these they want to
commit to before spending anything on a domain.

## Klook hotels/accommodation: not building it yet (2026-09-01)

Decided: new domain idea held for the future - not buying one now.
Given that, the Klook hotel/accommodation path stays unbuilt too, and
that's not an oversight, it follows directly from the domain decision:
the whole reason a second domain came up was to keep "Klook" away from
anything that reads as hotels, since Klook sells hotels and that's
exactly what causes the "wait, is this the same as Rate Manifest"
confusion. Building a "Book via Klook" hotel/accommodation option on
ratemanifest.com right now, same domain, right next to the
StayingAPI-verified comparison, would recreate that exact problem
with nothing to prevent it. So: the "Complete your Dubai trip"
section (experiences only, no hotels in the copy) is what's shipping.
Klook-for-hotels waits until there's a place to put it that doesn't
sit next to the hotel comparison - the subdomain option above, most
likely, whenever that gets picked up.

## Klook hotels, brought back with explicit not-verified framing (2026-09-01)

Reversed the hold from two entries above. The user's reasoning: they
believe StayingAPI is the more expensive path (accurate - see the
credits math throughout this file: 30 credits per call, 300-credit
free tier, ~120 left as of the last check), and today it's also the
*unmonetized* path - a StayingAPI-verified offer's outbound click goes
straight to the real seller (Booking.com, Agoda, etc.) with no
affiliate marker, because Travelpayouts hasn't approved those programs
yet (see "the real Gate 2 blocker" above). Klook is the only program
that's both live and pays a commission right now, and it does sell
hotels. So the direction is: StayingAPI stays the rate-intelligence
and trust layer (the verified comparison, the Rate Signal, unchanged),
while Klook becomes the primary near-term monetization attempt for
hotels too, not just experiences - "build all from Klook, test it,
switch off what doesn't work."

Built accordingly, without re-opening the confusion problem two
entries back: `KlookTripSection` now has a second, deliberately
secondary block below the experiences CTA - smaller type, a plain
text link instead of a button, and copy that says outright "unlike
the offers above, that listing is not one Rate Manifest has
independently checked." The verified StayingAPI comparison stays the
visually and structurally primary thing on the page; Klook hotels is
an honestly-labeled fallback underneath it, not a competing row. That
framing is what makes it safe to ship on the same domain today,
without the separate-domain plan (still on hold).

Gated behind `SHOW_KLOOK_HOTELS_NOTE` in `src/lib/klook.ts` (currently
`true`) specifically so "switch off what doesn't work" is a one-line
flip-to-`false`-and-push, not a re-edit of the component, once there's
real click/conversion data to judge it by.

Verified locally the same way as the experiences section: real
Postgres seeded from the actual `init-db` schema, real hotel, a
`ready` cache row, both the experiences CTA and the new hotels note
render with the exact intended copy, "Hotels & accommodation" still
does not appear anywhere in the primary category list.

## Klook shown on live-check error too (2026-09-01)

Bug in what shipped an hour earlier: `KlookTripSection` was gated
behind `liveCheck.kind !== "error"`, meaning it only rendered when
the StayingAPI check actually succeeded. With credits at 0, every
hotel/date pair without an existing cached row now resolves to
"error" - so Klook was invisible on effectively every real search,
the exact opposite of the point of building an independent
monetization path. Fixed: it now shows whenever `liveCheck.kind !==
"checking"`, i.e. on both "ready" and "error" - still hidden during
the spinner itself, since a visitor mid "Checking real-time
prices..." isn't the moment for a second call to action. Verified
locally against a real hotel with no cache row and no
`STAYINGAPI_KEY` set (forces the error path) - both the "could not
check real-time prices" message and the full Klook section (trip
CTA plus the hotels note) render together correctly.

## A dedicated Klook hotels link, Dubai-scoped (2026-09-01)

The "also on Klook" hotels note was reusing the generic homepage
link (`KLOOK_LINK`) since that was all that existed. The user found
Klook's Dubai hotels listing page and generated a proper tracked link
for it through the same Travelpayouts Links tool -
`https://klook.tpm.lv/RqxKw5oy`, pointed at
`https://www.klook.com/en-US/hotels/city/78-dubai-hotels/` rather
than Klook's global hotels page - chosen over the global option
because everything else in this section, including its own
"Complete your Dubai trip" copy, is Dubai-specific; sending someone
to a worldwide hotel search from here would be a mismatch. Added as
its own constant, `KLOOK_HOTELS_LINK` in `src/lib/klook.ts`, and
wired into the hotels note in `KlookTripSection` in place of the
reused generic link. Also lets Travelpayouts' own per-link stats
distinguish experiences clicks from hotels clicks going forward.
Verified locally: the experiences CTA still points at the generic
link, the hotels note now points at the new Dubai-hotels link,
confirmed by rendering both and checking the actual `href` values.

## Klook Tours Widget - live real prices, in progress (2026-09-01)

Found via Travelpayouts' Widgets tab (not Links): a "Specific City/
Category Tours Widget" that embeds real, live Klook product cards
(name, rating, review count, real price) for a chosen city and
category, via a single `<script async src="https://tpwgts.com/
content?...">` tag with the referral marker baked in. This is a real
upgrade over the current experiences block - live real data pulled
from Klook itself rather than static copy we wrote, which is the
most honest version of "no fabricated numbers" available: the
numbers are Klook's own, not ours.

Checked `next.config.mjs` and the codebase for any Content-Security-
Policy configuration before treating this as buildable - there is
none, so there's no CSP allowlist blocker to embedding a third-party
script here.

Not built yet - waiting on the user to settle on a category (leaning
toward Tours & Activities or Attractions over the Food & Dining shown
in the first screenshot) and confirm the widget preview actually
matches the selected category before sending over the final embed
code. Once that arrives, this needs `next/script` (not a raw
`<script>` tag) to integrate safely with Next.js - likely `strategy=
"afterInteractive"` or `"lazyOnload"` given the widget injects DOM
directly rather than rendering through React, which needs testing to
confirm it doesn't trip a hydration mismatch.

## Klook Tours Widget, built and verified (2026-09-01)

Wired in the embed code the user sent:
`https://tpwgts.com/content?currency=AED&trs=568981&shmarker=772385&
locale=en&city_id=78&category=4&amount=3&powered_by=true&campaign_id=
137&promo_id=4497`, stored as `KLOOK_TOURS_WIDGET_SRC` in
`src/lib/klook.ts`. The category=4 vs. "Food & Dining" preview
mismatch flagged earlier turned out not to matter - per the user, the
generated code is common across categories, so no further checking
was needed before wiring it in.

Loaded via `next/script` (`strategy="lazyOnload"`) inside a
`.klook-widget-mount` div in `KlookTripSection`, not a raw `<script>`
tag - this is the standard safe way to load a third-party DOM-
injecting script in Next.js App Router. Kept the plain "Browse Klook"
button and the category-list text exactly as they were, as a
guaranteed fallback: the widget's domain (tpwgts.com) is exactly the
kind of third-party affiliate-widget host ad blockers commonly flag,
so anyone whose browser blocks it still sees a working CTA underneath
where the widget would have rendered.

Could not inspect the actual script content before wiring it in -
tried both `curl` (blocked by this sandbox's own network egress
policy, unrelated to the widget itself) and WebFetch (blocked by
tpwgts.com's robots.txt) - so the integration is built on Next.js's
documented best practice for this class of script rather than on
reading its actual insertion code.

Verified what's verifiable from here: `npx tsc --noEmit` clean, no
new em-dashes, and a real Playwright browser load of `/search` showed
the `<script id="klook-tours-widget">` tag correctly attached to the
DOM with no hydration errors or React crashes - the only console
error was the network tunnel failure reaching tpwgts.com, which is
this sandbox's own block, not a bug in the integration. Whether the
widget actually renders real Klook product cards in production still
needs a real check on the live site, since that could not be tested
from here.

## KLOOK_LINK upgraded from homepage to Dubai search results (2026-09-01)

The main "Browse Klook" experiences CTA was still pointed at Klook's
bare homepage - the first link generated, before any of the more
specific ones. The user found a better destination: Klook's own
Dubai search-results page
(`https://www.klook.com/search/result/?query=dubai&search_scope=
main_search`), generated a tracked link for it the same way as the
others (`https://klook.tpm.lv/JaftNQHL`), and it now replaces the old
homepage link in `KLOOK_LINK`. Same purpose as before (the fallback/
primary CTA underneath the Tours Widget), just a landing spot that
actually shows Dubai results instead of requiring the visitor to
search again themselves once they arrive on Klook.

## Hotels note: refreshed link, new label, lime text (2026-09-01)

Three small requested changes to the "also on Klook" hotels note in
`KlookTripSection`:

1. `KLOOK_HOTELS_LINK` regenerated - `https://klook.tpm.lv/O3Coxqyz`
   replacing the original `RqxKw5oy`, same intent (Klook's Dubai
   hotels listing).
2. Link label changed from "Search hotels on Klook" to "Browse
   Hotels" - kept the trailing arrow for consistency with every other
   CTA on the page ("Browse Klook →", "Find my rate →").
3. `.klook-also-hotels`'s body text color changed from `--text-dim`
   to `--lime` (acid lime, the existing brand token already used for
   the section's own eyebrow and elsewhere as the "intelligence
   layer" marker). The link inside it stays tangerine, unchanged -
   keeps the actionable link visually distinct from the surrounding
   lime body text rather than blending in.

Also reported live: the Klook Tours Widget isn't visibly rendering on
the deployed site yet, while the fallback "Browse Klook" button
correctly shows in its place - exactly the resilience the fallback
was built for, but the widget itself still needs diagnosing. Asked
the user to check DevTools (Console for script errors, Network tab
filtered to "tpwgts" to see whether the request even fires) since
this domain was never reachable to inspect directly from this
environment - still waiting on that before concluding whether it's an
ad blocker, a domain-verification issue on Travelpayouts' side, or
something else.

## Klook API/data-feed access researched, not currently available (2026-09-02)

The user relayed a multi-part external strategy discussion arguing
RateManifest should keep StayingAPI as the hotel engine and add Klook
as a real second vertical ("Things to Do"), ideally with Klook's
inventory rendered in RateManifest's own cards/search/filters rather
than an affiliate widget or deep link - and asked directly what
Klook actually exposes via Travelpayouts versus directly, since one
part of that discussion claimed Klook's affiliate page describes
"advanced partners" getting data feeds, API, and white-label access.

Checked two primary sources rather than taking that claim at face
value:

1. Travelpayouts publishes its own list of exactly which brands offer
   API/data-feed access to partners (support article "Brands that
   provide access to APIs and data feeds for Travelpayouts
   partners"). Klook is not on it. What is: Aviasales, Kiwi.com, Omio
   (flights/trains/buses), GetTransfer (transfers), Airalo (eSIM),
   and - notably for a "Things to Do" vertical - Tiqets, WeGoTrip, and
   Viator. So through Travelpayouts specifically, the honest answer
   is no, not today.
2. Klook's own official public API documentation
   (klook.gitbook.io/openapi) is explicit about direction: it's
   written for "merchants, reservation systems & channel managers who
   are looking to integrate with Klook," to get their own inventory
   listed and sold through Klook's channels. That's the same finding
   as the earlier research this project already did (Klook's partner
   page + an independent AltexSoft technical writeup) - the API
   Klook documents publicly is supplier-in, not distribution-out.

Could not verify the specific "advanced partners... data feeds, API,
white-label" wording against affiliate.klook.com directly - the page
is JS-rendered and only returned metadata through the fetch tool
available here. A few third-party "we integrate any OTA API" vendor
sites (adivaha.com, technoheaven.com) do claim a Klook distribution
API exists, but those are marketing pages for XML/API-integration
services sold to travel agencies, not Klook's own documentation, and
should be weighed accordingly - they were not treated as
confirmation.

Where this leaves the Klook integration, concretely: Level 1 (deep
links, `KLOOK_LINK`/`KLOOK_HOTELS_LINK`) and Level 2 (the
Travelpayouts Tours Widget, `KLOOK_TOURS_WIDGET_SRC` - real live
Klook prices, just rendered by Klook's own script rather than
RateManifest's cards) are what's actually available and already
built. Level 3 - Klook's inventory pulled into RateManifest's own
database/cards/filters the way StayingAPI's is - is not confirmed
available; getting it would mean directly approaching Klook's
partnerships team with the "we're a comparison platform, not a
content affiliate" pitch, an outreach worth making but not something
to build the architecture around yet, since approval isn't
guaranteed for a project this size. If a real Level-3 "Things to Do"
vertical is wanted sooner, Viator or Tiqets via Travelpayouts is the
path that is confirmed available today - Klook is not currently a
like-for-like option for that.

Separately, the "don't replace StayingAPI, add Klook as an additional
vertical rather than a substitute" framing in that same discussion is
already how this was built, not a change still needed - the hotel
comparison flow (`runSearch`, `ensureLiveCheckTriggered`, the Supply
Ledger) has not been touched by any of the Klook work, and
`KlookTripSection` only ever renders alongside it, gated by
`SHOW_KLOOK_HOTELS_NOTE` as a one-line off-switch if it doesn't earn
its keep. The one genuinely new idea in that discussion - restructuring
the site itself into "Hotels | Things to Do" top-level categories
with their own nav and landing pages, instead of Klook appearing only
as a block under a hotel's search results - is a real, larger,
undecided change, not yet built.

## Decision: build a native Viator Things To Do integration, starting on Basic access (2026-09-02)

Following the Klook and Viator/Tiqets research above, the user decided
to proceed with Viator's own Affiliate API (not Klook, not
Travelpayouts' thin Viator feed) as the first genuinely
RateManifest-native Things To Do supplier - product data rendered in
RateManifest's own cards, the same shape StayingAPI already has for
hotels, rather than an affiliate widget. Klook stays live as-is
(Tours Widget + deep links) alongside it, not replaced.

Signup is at https://partners.viator.com/signup?mcid=66150&program=
affiliate - Viator's own line is "by creating an affiliate account,
you'll immediately get Basic Access to our API," free, no approval.
Creating that account has to happen on the user's side, not mine -
account creation for a third-party service is outside what I do
regardless of instruction. Once the account and API key exist, the
key goes directly into Netlify's site environment variables (never
pasted into chat, never committed to a file) - only the variable
name gets shared so the code can reference `process.env.<NAME>`.

Scope agreed for the first build, deliberately small - prove the
pipeline works before expanding it:

```
Viator API -> Viator adapter -> normalized product model ->
RateManifest DB/cache -> RateManifest card -> Viator booking/deep link
```

One destination search, real Viator products (title, image,
description, rating/review count, live price, live availability,
outbound booking link), rendered as RateManifest's own card - not a
full Things To Do platform, not category browsing, not filtering/
sorting yet. Full Access (bulk real-time availability, at
StayingAPI's scale) only gets requested from Viator once this small
version is proven reliable.

Reviewed the existing Supplier adapter shape
(`src/lib/suppliers/types.ts`, `stayingApiAdapter.ts`) before starting
design work: `SupplierOffer`/`SupplierAdapter` are hotel-specific
(`nightlyPrice`, `roomNormalizedType`, `cancellation`, etc.) and don't
fit a tour/activity product - Viator needs its own parallel model
(`ViatorProduct` or similar), not a forced fit into the hotel Supply
Ledger's types. StayingAPI's async job/cache pattern exists
specifically because its live calls take up to minutes, far past
Netlify's 60-second function limit - Basic-access Viator's
product/availability endpoints are documented as ordinary synchronous
REST calls, so they may not need that same slow-job dance, but actual
latency needs checking once real API access exists before assuming a
StayingAPI-style refresh/cache job is even necessary versus a plain
per-search live call.

Not yet done: the account doesn't exist yet, so no adapter code has
been written. Waiting on the user to sign up and add the API key to
Netlify's environment variables before implementation starts.

## Viator adapter: started, blocked on confirming exact endpoint paths (2026-09-02)

The user signed up for Viator's Affiliate API, generated a sandbox
Basic-access key (#B07A, up to 24h to activate), and set it in
Netlify's environment variables as `VIATOR_SANDBOX_API_KEY` (added to
`.env.example` alongside `VIATOR_PRODUCTION_API_KEY` for later, same
pattern as `STAYINGAPI_KEY`).

Built `src/lib/viator/` as a new, separate directory from
`src/lib/suppliers/` - not a SupplierAdapter, per the "Things To Do
needs its own model" note in the earlier decision above:

- `types.ts` - `ThingsToDoProduct`, the normalized product model for
  this vertical (title, image, description, rating/reviewCount,
  fromPrice/currency, confirmedAvailable, bookingUrl, checkedAt).
- `client.ts` - the low-level authenticated fetch wrapper. Only built
  from pieces confirmed directly against Viator's own docs: sandbox
  base URL `https://api.sandbox.viator.com/partner` (seen as a live
  example in Viator's "modified-since" guide), production base URL
  `https://api.viator.com/partner` (confirmed via a third-party
  integration doc), the `exp-api-key` auth header, and the required
  `Accept: application/json;version=2.0` version header (Viator's docs
  say omitting it returns a 400). Prefers `VIATOR_PRODUCTION_API_KEY`
  over `VIATOR_SANDBOX_API_KEY` automatically if both are ever set, so
  going live later is a Netlify env var change, not a code change.

Deliberately did NOT write the product-search or destination-lookup
calls yet. Multiple fetches of Viator's own documentation pages
(docs.viator.com/partner-api, partnerresources.viator.com) returned
inconsistent endpoint paths for the same operations across separate
fetches - "/products/search" vs "/search/products" for search,
"/products/{product-code}" vs "/product" for product detail,
"/availability/schedules/{product-code}" vs "/availability/check" vs
"/available/products" for availability - almost certainly because
these are complex, JS-rendered/tabbed reference pages that don't
extract cleanly as flat text, not because the API itself is
inconsistent. Rather than hardcode a guess with a real chance of being
wrong (which would fail silently or confusingly once the key
activates), asked the user to pull the authoritative source instead:
the OpenAPI specification the Keys & Access page's own copy says is
"available to assist the integration," likely under the portal's
"Resources" tab (seen alongside "Keys & Access" in the account
screenshots) - or the Postman collection, if that's what's offered
instead. Also tried Claude in Chrome to read the authenticated portal
directly rather than guess from public search results - not connected
in this environment, so that route wasn't available.

Once that spec (or even just the endpoint list/example responses
copy-pasted or screenshotted from it) is available, the destination
resolver and product-search call can be written with confidence in one
pass rather than iterated against guesses. Nothing has been tested
against the real API yet either way - the sandbox key isn't active yet
(up to 24h), and its value was never shared with this environment by
design.

## Viator adapter: confirmed against the real OpenAPI spec, built, and verified locally (2026-09-02)

The user pulled the actual OpenAPI spec from their Viator dashboard's
Resources tab and shared it (`openapi.json`, Viator Partner API 2.0) -
this resolved every gap flagged in the previous entry. Confirmed
directly from the spec, not guessed:

- Servers: production `https://api.viator.com/partner`, sandbox
  `https://api.sandbox.viator.com/partner` - matches what `client.ts`
  already had.
- `GET /destinations` (not `/taxonomy/destinations` - no such prefix
  exists in the real spec) returns the full destination list
  (`destinationId` as an int64, `name`, `type` enum including
  `"CITY"`/`"COUNTRY"`, `parentDestinationId`). Viator's own docs say
  to refresh this weekly, not per search.
- `POST /products/search` request: `{ filtering: { destination,
  startDate, endDate, ... }, sorting, pagination, currency }`, where
  `filtering.destination` is the destinationId as a **string**.
  Response: `{ products: ProductSummary[], totalCount }` (the spec's
  own `required` list names the count field `total`, but the actual
  property is `totalCount` - a real inconsistency in Viator's spec,
  handled defensively rather than trusted literally).
- `ProductSummary` fields used: `productCode`, `title`, `description`,
  `images[].variants[].url` (picking the largest variant of the
  cover image), `reviews.combinedAverageRating` /
  `reviews.totalReviews`, `pricing.currency` /
  `pricing.summary.fromPrice`, and `productUrl` - confirmed to already
  be a "pre-formatted Viator link" carrying this account's affiliate
  attribution, so RateManifest never constructs or appends its own
  tracking parameters (same "don't touch it" rule Viator's own docs
  state: modifying it can void the commission attribution).
- `POST /availability/check` needs a single `travelDate` (not a
  range) plus `paxMix` (passenger counts) - it's a per-product,
  per-date, immediately-before-booking confirmation, not something to
  call once per card on a destination-search page. Left unbuilt for
  this small first version - `ThingsToDoProduct.confirmedAvailable`
  stays `false` and is documented as the next real step, not a filled
  placeholder.

Built on top of the already-shipped `client.ts`:
`src/lib/viator/destinations.ts` (`resolveDestinationId`, in-memory
cached) and `src/lib/viator/searchThingsToDo.ts` (the one live call:
resolve destination, `POST /products/search`, map to
`ThingsToDoProduct[]`, never throws - any failure degrades to `[]`
same as every other supplier adapter in this app). Deliberately no
database/cache table for this, unlike StayingAPI - Viator's own docs
say `/products/search` "must not be used to ingest the catalog," and
Basic Access doesn't have the bulk `/products/modified-since`
endpoint that would be for anyway, so a live call per search is the
documented intended usage here, not a shortcut taken to save time.

Also built `src/components/ThingsToDoSection.tsx` - RateManifest's own
card grid (image, title, rating/reviews, from-price, book link), kept
visually and structurally separate from `KlookTripSection` since Klook
is still link/widget-based (Level 1/2) while this is genuinely
RateManifest-native data (Level 3) - conflating them into one
component would blur a distinction worth keeping. Wired into
`/search`, gated the same way as `KlookTripSection` (real hotels only,
not mid live-check).

Verified locally (local Postgres, real seeded hotels, `next dev` on
port 3103/3104, no shortcuts):

1. Logic verified in isolation first, before touching the page: a
   `tsx` script with a mocked `fetch` fed the adapter a realistic
   sample `/products/search` response (built from the spec's own field
   names) plus one deliberately malformed product with no price -
   confirmed the malformed one is dropped, the request body/headers
   are shaped exactly as documented, the largest image variant is
   picked, and `productUrl` passes through completely untouched.
2. With no Viator key configured: `/search` for a real hotel returns
   200, renders normally, and the Things To Do section correctly does
   not appear (no crash, no hydration error) - safe to ship as-is even
   before the sandbox key finishes activating.
3. With a deliberately fake key set: `/search` still returns 200 and
   renders correctly. The real failure reason logged was
   `403: Host not in allowlist: api.sandbox.viator.com` - this
   sandbox's own network egress proxy blocks that host, the same
   limitation already hit with `tpwgts.com` for the Klook widget. So a
   genuine success response from Viator's API has not been (and
   cannot be) observed from this environment - only that failures of
   every kind degrade safely rather than breaking the page. The real
   test - whether the sandbox key returns real Dubai products once
   it's active - needs to happen on the deployed Netlify site (which
   isn't behind this sandbox's egress block), the same way the Klook
   widget was ultimately real-world-tested there rather than here.

`npx tsc --noEmit` clean throughout, no new em-dashes introduced (only
ones already present in `search/page.tsx`/`globals.css` from earlier
work, unchanged).

## Live check: pipeline works end to end, waiting on key activation (2026-09-02)

Checked the deployed function logs on Netlify (Functions -> Next.js
Server Handler) after a real search on ratemanifest.com. Confirmed
the whole chain runs correctly in production: the function read
`VIATOR_SANDBOX_API_KEY`, called Viator's real API (`GET
/destinations` - no egress block this time, unlike this sandbox
environment), got a real structured response back
(`401 UNAUTHORIZED, "Invalid API Key"`), and `searchThingsToDo`
caught it, logged it (`ERROR searchThingsToDo failed: ...`), and
returned `[]` - the page rendered normally in 902ms with no crash,
same as every other supplier adapter's failure mode in this app.

Most likely cause: Viator's own dashboard said sandbox keys can take
up to 24 hours to activate, and this key is only a few hours old - a
not-yet-active key and a genuinely wrong key both come back as the
same generic 401 from Viator's side, so this isn't distinguishable
from the error alone. Left as-is; the user will check the same log
line again later once the activation window has passed. If the exact
same 401 persists past 24 hours, the next step is comparing the
value in Netlify's env var character-for-character against what
Viator's dashboard shows (never by pasting the value anywhere in this
conversation) rather than assuming it's still just activation delay.

No code change made - nothing here indicates a bug in the adapter
itself, only that a live, valid key hasn't been confirmed working
yet.

## Correction: the Klook API conclusion overreached (2026-09-02)

The earlier entry above ("Klook API/data-feed access researched, not
currently available") and what got said out loud in this session both
stated the conclusion too strongly - "there is no version of pull
Klook's catalog into our own site that Klook currently offers us, at
any tier, self-serve or otherwise." That's broader than what was
actually verified, and the user was right to push back on it.

What was actually confirmed, and still holds:

1. Klook's own public OpenAPI documentation
   (klook.gitbook.io/openapi) is supplier-in only - built for
   merchants/reservation systems to list their inventory into Klook,
   not for a partner to pull Klook's catalog out.
2. Klook does not appear on Travelpayouts' published list of brands
   offering API/data-feed access through Travelpayouts (Viator,
   Tiqets, WeGoTrip are the Tours & Activities brands listed; Klook
   isn't).

What that does NOT establish, and shouldn't have been implied: that
Klook has no distribution API anywhere, under any arrangement,
public or private. The user surfaced a Travelpayouts blog post - a
Q&A recap from a Klook webinar, URL:
travelpayouts.com/blog/qa-from-the-webinar-how-to-earn-on-travel-in-the-new-normal-with-klook -
that reportedly states Klook offers a direct-sales API integration
separate from the Travelpayouts affiliate programme. Tried to verify
this directly: WebFetch returned only page metadata (title, viewport
tag) with no article body twice in a row, and web.archive.org is
blocked by this environment's own content-fetching policy - so the
exact wording could not be independently confirmed either way. Two
things are worth weighing regardless of whether the quote is exact:
the page's own title phrase ("...in the New Normal...") is
characteristic COVID-era webinar language, meaning this is very
likely a 2020/2021-dated source - a partner-access answer from that
period is not guaranteed to still be true four-plus years later; and
even if accurate as reported, "Klook offers a direct-sales API to
someone" is not the same claim as "Klook will grant RateManifest,
specifically, access to it."

Corrected position for the record: Klook's publicly documented
OpenAPI is not the distribution API RateManifest needs, and Klook is
not on Travelpayouts' current published API/data-feed list - both
still true and directly verified. Whether a separate, direct
Klook-to-RateManifest integration exists and is obtainable is
genuinely unresolved, not a settled "no." The only way to actually
resolve it is asking Klook directly - not something to keep
researching secondhand.

Decided: email Klook directly (via business@ratemanifest.com, per
the existing B2B-outreach convention) with a specific, concrete ask -
not "can we be an affiliate" (already have that), but whether a
direct catalog/pricing/availability integration is available to a
platform RateManifest's size, and on what terms. This does not block
or compete with the Viator work already shipped - `ThingsToDoProduct`
or a Klook equivalent is just another supplier feeding the same
`ThingsToDoSection` card UI, the same way StayingAPI and
Travelpayouts both already feed the hotel comparison. Continuing to
verify the Viator integration (waiting on its sandbox key) and
sending the Klook outreach are parallel tracks, not sequential ones.

## Klook Dynamic Hotel Widget (2026-09-03)

While waiting on Klook's reply to the Corporate Affiliate Partnership
enquiry (see the entry above), the user explored Klook's Affiliate
Dashboard directly (My Ads -> Other tools -> Hotels -> Dynamic
Widgets) and generated a real, working widget for Dubai hotels -
live preview confirmed three real cards (The S Hotel Al Barsha, Rove
Expo City, Park Regis Business Bay Hotel) with real star tiers,
ratings, review counts, and AED prices. This is Klook's own
first-party affiliate infrastructure, reached through the same
Travelpayouts-mediated Klook program access already used for
KLOOK_LINK/KLOOK_HOTELS_LINK/KLOOK_TOURS_WIDGET_SRC - not a
separately created Klook account, and not the direct-API question
above, which is still open.

Integrated into the existing klook-also-hotels block in
KlookTripSection.tsx (see src/lib/klook.ts for the full generated
config: KLOOK_HOTELS_WIDGET_SCRIPT_SRC,
KLOOK_HOTELS_WIDGET_CONFIG). Mechanically different from the
Travelpayouts Tours Widget already on the page: this is an
<ins class="klk-aff-widget" data-*> placeholder that
affiliate.klook.com's loader script scans the DOM for and fills with
a real iframe, rather than one self-contained <script src="...">
tag - so it needs both the loader script and the placeholder
element, and the placeholder's data-* attribute names are kept in
Klook's exact generated mixed case (data-cardH, data-lgH,
data-edgeValue) for literal fidelity to what Klook generated (HTML
attribute matching is case-insensitive regardless, so this isn't
functionally required, just deliberate).

City is Dubai (data-cid="78", the same destination id already used
as city_id=78 in KLOOK_TOURS_WIDGET_SRC), 3 cards (data-amount="3",
matching the Tours Widget's amount=3), currency AED (set explicitly
to match every other price on the site). Dashboard-side ad-tracking
labels used when generating it: search-page-hotels-note / hotels /
dubai.

KLOOK_HOTELS_LINK is kept directly below the widget as a second,
guaranteed fallback - same reasoning as the Tours Widget's existing
fallback link: affiliate.klook.com was never reachable from the dev
environment to inspect directly, and ad blockers commonly flag this
class of third-party affiliate-widget domain. The block's framing
(smaller type, "not independently verified" in the copy, no primary
button) is unchanged - this is real Klook data now instead of a bare
link, but it's still Klook's own listing, not one RateManifest has
checked, and the section still shouldn't read as another row in the
verified comparison above it.

Not yet confirmed live on production: this environment's own network
egress blocks affiliate.klook.com the same way it blocked
tpwgts.com and api.sandbox.viator.com earlier, so only integration
correctness (types, JSX, config values) was verified here - real
rendering needs checking on the live site after deploy.

## Live check: Klook Dynamic Hotel Widget confirmed rendering (2026-09-03)

User screenshot of the live /search page confirms the widget added
above actually renders in production, not just that the deploy
succeeded: three real Dubai hotel cards (The S Hotel Al Barsha, From
AED 136; Rove Expo City, From AED 304; Park Regis Business Bay
Hotel, From AED 220), each with real star tier, rating, and review
count, plus a working "See more" and "Powered by Klook" label - all
generated by Klook's own loader script, not placeholder content.
Sits correctly below the existing Tours Widget's own live cards
(Desert Safari Tours, eSIM, Premium Desert Safari) on the same page.
Both KLOOK_HOTELS_LINK ("Browse Hotels on Klook") and KLOOK_LINK
("Browse Klook") fallback links are still present and visible as
well. Nothing left to verify on this piece - closing it out.

## Klook Tours Widget DOM placement fix (2026-09-03)

User reported the Tours Widget's cards (Desert Safari Tours, eSIM,
Premium Desert Safari) rendering "down on the page" - below the
Footer, not inside the "Complete your Dubai trip" card where the JSX
places them. Confirmed via live DOM inspection of the deployed site
(Claude in Chrome, logged into the user's own browser): the widget's
loader script builds its own
<div id="klook_widget_wrapper..."><ins class="klookaff_auto_dynamic_widget">
<iframe>...</iframe></ins></div> and appends that wrapper directly
onto document.body, regardless of where the <script> tag itself sits
- confirmed by checking body.children directly (the wrapper showed up
as a direct child of <body>, index 8 of 12, well after our own
.shell div and the Footer inside it). This is the widget's own JS
choosing document.body.appendChild() - not a next/script placement
issue, and not fixable by moving the JSX.

Fix: new component src/components/KlookToursWidgetMount.tsx (client
component) that runs a MutationObserver on document.body, watches for
a node matching the widget's wrapper signature
(id starting "klook_widget_wrapper", or containing
.klookaff_auto_dynamic_widget), and moves that exact node into its own
ref'd container the instant it appears - preserving the live iframe
already inside it (no reload, no flicker). KlookTripSection now
renders <KlookToursWidgetMount /> in place of the old inline
<div className="klook-widget-mount"><Script .../></div>.

Also renamed the two CTA labels per direct user request: "Browse
Klook →" (Tours/experiences section) -> "Browse Here →"; "Browse
Hotels on Klook →" (hotels section) -> "Browse HOTELS →".

## Klook widget framing on the dark theme (2026-09-03)

User asked for the Klook hotel widget's cards to render in a dark
theme matching the site (and the native Viator Things To Do cards
above them). Checked directly in Klook's own Dynamic Widget
generator while investigating a separate request (star-rating
filtering, see below) - the generator form (Website Name, Labels,
Language, Currency, Hotel selection, City/property, No. of Items) has
no theme/color option, for either the Hotels or Things To Do widget.
Both widgets render inside a Klook-controlled iframe (cross-origin),
so their internal card styling is not reachable from RateManifest's
CSS at all - confirmed, not assumed.

Compromise applied: .klook-widget-mount and .klook-hotels-widget-mount
now get a light, rounded, subtly-shadowed frame (#f5f3ef background)
around the iframe, instead of leaving Klook's white cards floating
directly on the site's near-black card background. This does not make
the cards themselves dark - not achievable without Klook offering a
theme option - but it turns what read as a rendering glitch (bare
white rectangle on black) into a deliberate-looking inset panel. If
this isn't good enough, the honest remaining options are: ask Klook
whether a dark-theme widget variant exists (not seen in the generator
UI); stop using the iframe widgets and instead build a native card
grid from Klook's own data the way ThingsToDoSection.tsx already does
for Viator (a real engineering lift, most likely blocked on the same
direct-API access question already open with Klook); or accept the
light-panel compromise.

## Klook hotel widget star-rating: found the mechanism, not yet applied (2026-09-03)

User asked for the Klook hotel widget to show 5-star hotels primarily
(4-star only otherwise), not 3-star - the current widget's "By
destination" mode (auto-selected by Klook's own algorithm for Dubai)
surfaced Rove Expo City, a 3-star property, alongside two 4-star
ones. Investigated directly in the Klook Dynamic Widgets generator
(Hotels tab): "Hotel selection" offers a second mode, "By property,"
with a live search ("Search for a property" + "Add property") that
returns real Klook inventory - confirmed working, e.g. searching
"Atlantis The Palm" returned "Atlantis, The Palm" as a real, exact
match. This is the mechanism to hand-pick specific 5-star/4-star
Dubai properties instead of relying on Klook's own algorithm, which
has no star-tier filter of its own.

Not yet completed: browser automation against this specific page
proved unreliable (React SPA with flaky state - typed values and
dropdown selections repeatedly failed to persist through the
automation tools, likely a focus/timing issue with the framework's
controlled inputs) after several attempts, so the actual property
list was never finalized or saved. Next step: either finish this by
hand in the Klook Affiliate Dashboard (My Ads -> Other tools ->
Hotels -> Dynamic Widgets -> Hotel selection: "By property," search
and add each desired 5-star property, then "Save and generate code"),
or ask for another automated attempt.
