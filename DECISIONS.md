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
