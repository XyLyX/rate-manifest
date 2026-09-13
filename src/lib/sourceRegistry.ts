// The Source Registry — Navin's proposal (2026-09-11), built the same day.
// One canonical, typed answer to "what sources does RateManifest have, what
// role does each play, and what stage is it at" — replacing the same
// question scattered as prose across `claude/outreach-tracker.md`,
// `claude/status.md`, and `DECISIONS.md`. Those files still carry the full
// history and reasoning (rejection letters, application text, the
// Travelpayouts traffic/content gate finding) — this file is the current-
// state summary they should all defer to, not a second copy to keep in
// sync by hand.
//
// The point, in Navin's own words: "Rate Manifest doesn't care whether it
// has 2 sources or 20. It simply asks: which sources are currently
// available for this property/date/search?" This file is that question's
// answer for anything that ISN'T already answered by existing, working
// code:
//   - Rate intelligence + booking sources with a real adapter already
//     query themselves this way today — `SUPPLIER_ADAPTERS` (see
//     `suppliers/index.ts`) is itself a registry: every adapter no-ops
//     safely with zero offers when its credentials aren't configured (see
//     `travelpayoutsAdapter.ts`'s own comment), so "is this source active"
//     is already a runtime fact, not a flag someone has to remember to
//     flip. This file does NOT re-implement that — `activeAdapters()`
//     below is just this registry's metadata about the same adapters,
//     for humans (and future Claude sessions) to read at a glance.
//   - Discovery and booking sources with NO adapter yet (Agoda, Expedia,
//     any future direct-hotel deal) have nothing to query at runtime —
//     there's no code to call. For those, `status` here IS the whole
//     answer: "pending" means applied-or-about-to-apply but not usable
//     yet, "future" means not started. When one of these gets a real
//     adapter built, add it to `SUPPLIER_ADAPTERS` the normal way AND
//     flip its status here to "active" in the same change.
//
// Commercial-partner routing, as refined 2026-09-11 after Navin cross-
// checked both Klook's and KKday's actual live Dubai/UAE inventory
// directly (not from the earlier, partly-wrong assumption that Klook had
// "no hotel category" - it does, see the klook entry below): don't pick
// one partner as THE discovery/commercial backbone. Route by job instead,
// since the two are strong at different things -
//   - Klook: deep, commercially proven UAE/Dubai inventory - both hotels
//     (budget through luxury, e.g. Atlantis The Palm) and activities/
//     attractions (desert safaris, Burj Khalifa, yacht trips, theme parks).
//     The answer to "what can I do here / where can I stay here," strongest
//     for UAE inbound.
//   - KKday: real but more selective Dubai hotel inventory (does include
//     upscale properties - Andaz Dubai The Palm, Address Downtown - not
//     merely "mid-tier"), but its real differentiator is the destination-
//     bundle proposition: accommodation + tours/experiences + attraction
//     tickets + transport + SIM + packages, with a strong Asia orientation.
//     The answer to "how do I put this trip together," strongest for UAE
//     outbound / Southeast Asia.
//   - Viator: native Things To Do integration (see viator/, ThingsToDoSection.tsx) -
//     real cards, real Partner API, not a widget iframe.
//   - StayingAPI: the one precise, verified layer (see its own entry).
// None of Klook/KKday/Viator should become RateManifest's interface or
// inventory backbone - RateManifest owns the decision, partners own the
// transaction (User -> RateManifest decision -> {Klook activities | KKday
// packages | StayingAPI hotel verification}). Future major inventory
// (Booking.com direct, Agoda, Expedia) is a later tier, approached once
// RateManifest has real traffic/traction - see the direct-booking entries
// below and outreach-tracker.md's sequencing sections.
//
// A fourth layer, found 2026-09-11 (see stay22-allez below): Stay22 isn't
// a hotel data source at all, it's a commercial-fulfillment bridge - one
// integration that can route an already-decided user toward whichever
// major OTA (Booking.com, Expedia, Hotels.com, Kayak...) it picks for
// conversion, without RateManifest integrating each OTA's own affiliate
// programme one at a time. "Where can the user transact" (Stay22) stays
// strictly separate from "what should the user decide" (StayingAPI/
// RateManifest IQ) - Stay22's routing is conversion-optimized, not price-
// optimized, so it must never be described as finding the best rate.

export type SourceRole = "discovery" | "rate_intelligence" | "booking";
export type SourceStatus = "active" | "pending" | "future";

export interface SourceRegistryEntry {
  id: string;
  name: string;
  role: SourceRole[];
  inventoryDescription: string;
  status: SourceStatus;
  // Lower number = higher priority. Ties are fine - this is a planning
  // signal, not a sort key any code reads today.
  priority: number;
  costModel: string;
  // Where the fuller story lives, if there is one - a doc_uuid-free
  // pointer so nobody has to remember which project doc covers which
  // source. Keep this in sync with reality, don't let it rot.
  notes: string;
}

export const SOURCE_REGISTRY: SourceRegistryEntry[] = [
  {
    id: "klook",
    name: "Klook",
    role: ["discovery", "booking"],
    inventoryDescription:
      "Hotels & accommodation (deep - Navin's 2026-09-11 cross-check found 999+ Dubai hotel listings, budget " +
      "through luxury e.g. Atlantis The Palm), plus a genuinely substantial UAE activities/attractions catalog " +
      "(desert safaris, Burj Khalifa, yacht trips, water parks, helicopter tours, theme parks, some products " +
      "showing 100K+ bookings). Strongest UAE/Middle East partner of the two by inventory depth.",
    status: "active",
    priority: 1,
    costModel: "Free to integrate — affiliate commission on booking, via Travelpayouts",
    notes:
      "Live via Travelpayouts widgets (Tours Widget, Dynamic Hotel Widget) - see klook.ts and KlookTripSection.tsx. " +
      "Discovery (Page 1 browse) and Page 3 'Complete Your Trip' monetization ONLY - deliberately never part of " +
      "the Layer 1 rate comparison itself (2026-09-01 decision, DECISIONS.md: Klook's affiliate strength is " +
      "experiences/tours, not hotel rates). Presentation gap flagged 2026-09-11: current homepage copy still " +
      "reads as 'Klook is the product' rather than an invisible discovery source feeding RateManifest's own " +
      "decision engine - not yet fixed. CORRECTION 2026-09-11: an earlier note on the kkday entries in this file " +
      "claimed Klook 'has no hotel category at all' - that was wrong (and contradicted this entry's own " +
      "inventoryDescription and the klook-also-hotels block in KlookTripSection.tsx, which has shown real hand- " +
      "picked 5-star Dubai hotels since 2026-09-03). Corrected here once Navin's direct cross-check of both " +
      "platforms confirmed Klook's Dubai hotel breadth is real and, if anything, broader/more luxury-skewed than " +
      "KKday's. Role split vs. KKday, per Navin's 2026-09-11 conclusion: Klook answers 'what can I do / where can " +
      "I stay here,' strongest for UAE inbound tourism; KKday (see kkday-partner-discovery below) answers 'how do " +
      "I put this trip together,' strongest for UAE outbound/Southeast Asia and packaged travel. Demoted (Navin's " +
      "word) from 'something to deeply integrate' to 'a partner we route to when its specific strength fits' - " +
      "not being removed, just not treated as RateManifest's inventory backbone either.",
  },
  {
    id: "stayingapi",
    name: "StayingAPI",
    role: ["rate_intelligence", "booking"],
    inventoryDescription: "Live cross-OTA hotel rates (Booking.com, Expedia, Agoda, Hotels.com, Trip.com, Priceline)",
    status: "active",
    priority: 1,
    costModel: "Paid, per-search credit (Starter plan, 1,900 credits, renews Oct 6 2026)",
    notes:
      "Live via stayingApiAdapter.ts, Page 2/Check IQ only (never Page 1 - see search.ts, ensureLiveCheckTriggered " +
      "only runs from Check IQ). This is the actual Rate Intelligence layer this whole product is built around. " +
      "Booking role: outboundUrl links straight to whichever real named seller StayingAPI attributes the offer to " +
      "- so it already functions as the booking destination for Booking.com/Expedia/Agoda/etc. offers, with NO " +
      "RateManifest affiliate marker appended yet (see stayingApiRefresh.ts: outboundUrl: offer.url, untouched) - " +
      "a real, no-approval-needed gap flagged 2026-09-11 in outreach-tracker.md, not yet fixed. 'unrecognized' " +
      "OTAs (the Supply Ledger in stayingApiRefresh.ts's OTA_TO_SUPPLIER) are silently dropped, not shown - " +
      "google_hotels was tried and reverted 2026-09-06 after its single-offer fallback price proved consistently " +
      "wrong.",
  },
  {
    id: "stay22-allez",
    name: "Stay22 Allez (universal OTA affiliate redirect)",
    role: ["booking"],
    inventoryDescription:
      "Not a hotel data/inventory source - a commercial redirect bridge. One integration point that can route a " +
      "booking-ready user toward Booking.com, Expedia, Hotels.com, Kayak and other major OTAs (8 providers per " +
      "Stay22's docs), covering ~35M+ listings across 220+ countries per Stay22's own marketing (unverified - " +
      "treat as a claim, not a fact, until RateManifest has a real account and real numbers).",
    status: "future",
    priority: 2,
    costModel:
      "Commission-based, split with Stay22 (their community page states a starting split around 30% - " +
      "unverified against RateManifest's actual terms, don't build economics around the headline number)",
    notes:
      "Navin's find and verdict, 2026-09-11: 'Stay22 - YES, investigate and potentially integrate, but not as a " +
      "replacement for StayingAPI/Klook/KKday.' Independently verified against dev.stay22.com's own docs " +
      "2026-09-11 (WebFetch, not just Navin's research) - confirmed accurate: Allez is a plain URL-construction " +
      "redirect (`stay22.com/allez/{provider}?aid=<AID>&address=<destination>`), not an API or widget - no SDK, " +
      "no backend integration, just building the right link. Cookie-based affiliate tracking, credited on " +
      "booking completion. Its default 'Roam' endpoint is explicitly conversion-optimized, not price-optimized " +
      "- Stay22's own docs say it resolves 'the best landing page on the best provider optimized for the best " +
      "chance of conversion,' NOT lowest price. This is a hard constraint on the copy if this ever ships: never " +
      "say 'Stay22 found the cheapest rate' or imply price-comparison behavior - it explicitly isn't that. " +
      "The strategic fit, per Navin: RateManifest doesn't need to individually integrate every major OTA " +
      "(Booking.com, Expedia, Agoda...) to give users somewhere real to transact once RateManifest IQ has made " +
      "its call - Stay22 can be that one commercial bridge instead, while StayingAPI stays the only source of " +
      "the actual IQ verdict/rate intelligence (Stay22 must NOT become a price database - no control over its " +
      "supplier data freshness, exact offer shown, rate-plan/breakfast/cancellation/payment details, or " +
      "historical price observations, all of which stay StayingAPI's job alone). This could reduce urgency on " +
      "the one-by-one direct Agoda/Expedia affiliate applications below (agoda-direct-booking, " +
      "expedia-direct-booking) - one Stay22 relationship may cover similar OTA reach faster than each direct " +
      "signup - worth Navin weighing once he's actually signed up here. Status kept 'future' rather than " +
      "'pending' - nothing applied for yet, this is today's finding, not yet an outreach action; move to " +
      "'pending' and log in outreach-tracker.md the moment Navin actually signs up for a Stay22 account/AID.",
  },
  {
    id: "stay22-map",
    name: "Stay22 MAP (embeddable accommodation map)",
    role: ["discovery", "booking"],
    inventoryDescription:
      "An embeddable iframe map of nearby accommodation, redirecting through Allez (above) on click - not a " +
      "curated discovery source, a generic map widget.",
    status: "future",
    priority: 3,
    costModel: "Same Allez-based commission model, no separate cost - see stay22-allez above",
    notes:
      "Independently verified 2026-09-11 (WebFetch of dev.stay22.com/docs/maps): genuinely 'no API dependency, " +
      "no backend work' - drop an iframe with an affiliate id and a destination address, done. Deliberately " +
      "ranked BELOW stay22-allez and explicitly optional per Navin's own prioritization ('MAP - OPTIONAL " +
      "fallback/discovery component'), for the same reason Klook's widgets get kept visually/textually " +
      "secondary on RateManifest - an embedded partner map inside the core experience risks looking like " +
      "'RateManifest -> embedded Stay22 map -> OTA listings,' which weakens the product's own decision-engine " +
      "identity. If ever built, treat it the same way as the kkday-partner-discovery pattern: a clearly labeled, " +
      "secondary block, not the main experience.",
  },
  {
    id: "viator",
    name: "Viator",
    role: ["discovery", "booking"],
    inventoryDescription:
      "Things To Do / experiences - real Partner API v2 integration (see viator/client.ts, searchThingsToDo.ts, " +
      "destinations.ts), not a third-party widget iframe like Klook's/KKday's.",
    status: "active",
    priority: 1,
    costModel: "Commission-based via Viator's Partner API (sandbox key confirmed working; production key status per Viator's own dashboard)",
    notes:
      "Native integration rendered by ThingsToDoSection.tsx on /search - real cards built from Viator's own API " +
      "response, not an embedded widget. Replaced Klook's old Tours Widget 2026-09-03 once it shipped, since " +
      "showing two 'tours in Dubai' lists from two suppliers back to back was redundant (see klook.ts's own " +
      "comment and DECISIONS.md, 'Klook Tours Widget removed - redundant with native Viator'). Client only " +
      "exposes the confirmed-safe endpoints (/products/search, /taxonomy/destinations) per client.ts's own " +
      "comment - product-detail/availability-check shapes were deliberately not guessed at, extend only once " +
      "confirmed against a real response. Tier 2 commercial-travel-source, per Navin's 2026-09-11 tiering " +
      "(alongside Klook and KKday, below StayingAPI) - 'experiences, where commercially useful,' not a hotel or " +
      "package source.",
  },
  {
    id: "kkday-partner-discovery",
    name: "KKday (generic partner-discovery destination)",
    role: ["discovery", "booking"],
    inventoryDescription:
      "Not primarily a hotel source, though it does have real Dubai hotel inventory including some upscale " +
      "properties (Andaz Dubai The Palm, Address Downtown, Address Dubai Mall, alongside budget/apartment " +
      "options) - Navin's 2026-09-11 correction: not simply 'mid-tier accommodation.' Its actual differentiator " +
      "is the destination-bundle: accommodation + tours/experiences + attraction tickets + food + transport + " +
      "SIM/eSIM + travel services + packages, in one place, with a strong Asia/Southeast-Asia orientation. A " +
      "generic 'continue your journey elsewhere' outbound destination, the same role Klook plays for UAE " +
      "activities (see the klook entry above) - but for 'how do I put this trip together,' not 'what can I do " +
      "here.' Whole-platform, global, not scoped to Dubai/UAE or to RateManifest's own 12-property catalog.",
    status: "active",
    priority: 1,
    costModel: "Free - already live via the existing Travelpayouts KKday programme (since 2025-08-18), commission-based",
    notes:
      "Split out of the old combined 'kkday' entry 2026-09-11 on Navin's explicit call: 'integrate KKday as a " +
      "whole without getting into Dubai specifics... don't build a fake KKday hotel integration just because " +
      "you have an affiliate relationship.' The insight: Decision intelligence and hotel identity/matching must " +
      "be precise (a 'KKday has the best rate for The Oberoi Dubai' claim needs exact offer matching); Affiliate " +
      "discovery does not ('Explore more stays with KKday' needs nothing of the sort). This entry is the second " +
      "kind - modeled exactly on KlookTripSection.tsx's existing 'klook-also-hotels' block (a plain link, honest " +
      "'not independently verified/checked' disclosure copy, no widget claims of coverage). No new approval " +
      "needed - KKday's Travelpayouts programme has been live since 2025-08-18 (deep-link only, 1-5% reward, " +
      "30-day cookie), so this can ship immediately, independent of the still-pending B2D API enquiry below. " +
      "Link-generation rule (2026-09-11, applies here too): any KKday link that reaches a real page must come " +
      "from KKday's own affiliate 'Generate Link' tool via Travelpayouts (the same pattern as KLOOK_LINK/" +
      "KLOOK_HOTELS_LINK in klook.ts, both user-supplied from Klook's own short-link tool) - not a bare " +
      "kkday.com/... URL. Implementation still needs Navin to generate at least one such link (a general " +
      "'explore stays' one; optionally a second scoped to KKday's packages category, see below) before the " +
      "actual UI block can ship - the code shape (a small section beside/inside KlookTripSection.tsx, same " +
      "honest-disclosure pattern) is ready to go the moment a real link exists. " +
      "Second angle, same 2026-09-11 thread, not yet built: KKday's 'packages' product type may suit Indian- " +
      "subcontinent/Southeast-Asian travelers who'd rather have a trip bundled than assemble it themselves - " +
      "Navin's own framing, 'a large part of the India outbound traveller doesn't want to optimise 14 " +
      "individual bookings, they want someone to simplify the trip.' Long-run, this could become a second " +
      "RateManifest decision axis alongside 'which hotel' - 'hotel vs. package vs. build-your-own' - but " +
      "explicitly NOT built now: v1 is a generic 'explore KKday packages' link with zero package-matching " +
      "intelligence, purely to collect real click behavior; only if Indian/SEA users click packages " +
      "disproportionately does that become evidence for building a first-class package-vs-hotel decision layer " +
      "later (a decision-intelligence-roadmap.md-level idea, not a sourceRegistry-level one - flag there if " +
      "picked up). What NOT to build for this entry, per Navin's explicit list, unless/until a real hotel API " +
      "changes the picture: no KKday hotel catalogue, no KKday property IDs in the hotel/property graph, no " +
      "KKday-to-RateManifest hotel mapping, no KKday price history or rate comparison, no 'KKday availability' " +
      "claims, no Dubai-specific KKday landing pages. " +
      "Strategic priority, refined 2026-09-11 after Navin cross-checked both platforms directly: despite Klook " +
      "having the deeper/more luxury UAE hotel inventory (see the klook entry above), Navin rates KKday higher " +
      "strategic priority for RateManifest specifically - Klook solves 'things to do,' KKday potentially solves " +
      "'how to construct the trip,' which is the harder, more valuable problem for RateManifest's India/UAE- " +
      "outbound wedge to eventually own ('find me a good Bangkok holiday' vs. 'find me a five-star hotel in " +
      "Bangkok'). Still v1-generic-link-only per the phasing above - the priority is about where deeper product " +
      "investment goes *if* click data supports it, not about building anything more today.",
  },
  {
    id: "kkday-hotel-api",
    name: "KKday (B2D platform, precise hotel API)",
    role: ["discovery"],
    inventoryDescription:
      "Real, deep UAE hotel inventory confirmed directly on kkday.com's consumer site 2026-09-11: 810 Dubai / " +
      "218 Abu Dhabi / 95 Sharjah / 52 Ras Al Khaimah / 51 Ajman / 38 Fujairah / 10 Umm Al Quwain results under " +
      "its Accommodation category (CATEGORY_078 / emirate category pages) - all 7 UAE emirates checked, ~1,274 " +
      "listings total - including exact name-matches to hotels already in RateManifest's own catalog (Ajman " +
      "Saray, Fairmont Ajman, Rixos/Anantara/Waldorf Astoria RAK). Sharjah's list is a notably different mix - " +
      "mostly vacation rentals/serviced apartments/a hostel, few actual hotels - worth remembering if this " +
      "entry ever becomes a real per-property source.",
    status: "pending",
    priority: 3,
    costModel: "Unknown - B2D distributor access terms not yet disclosed",
    notes:
      "Deliberately separated 2026-09-11 from kkday-partner-discovery above, which needs none of this and ships " +
      "independently - this entry is specifically the harder, precise 'originate real properties / enrich real " +
      "offers with real fields' role, and stays pending until it clears its own bar. A real B2B API exists " +
      "(kkdayb2bapiv3.docs.apiary.io, PMDL product model) that isn't scoped away from hotels the way Klook's " +
      "tours-only OCTO API is. CONFIRMED 2026-09-11 (Navin's own find, verified live via browser): kkday.com's " +
      "consumer hotel pages (/en-us/hotel/product/{id}) are a full date-based OTA-style booking engine, not a " +
      "fixed voucher/package - checked Hilton Dubai Jumeirah (product #487244) directly: real room types, " +
      "per-night USD pricing, 'Only N rooms left' scarcity, and - notably - explicit breakfast-inclusion as a " +
      "separate rate line ('Includes Breakfast for 2 guests' vs. room-only) and explicit free-cancellation " +
      "deadlines ('Free cancellation before 2026/09/12 00:00'). Both of those are exactly the two fields " +
      "StayingAPI cannot reliably supply today (blueprint Section 12's Gap 1/Gap 2) - if the B2D API exposes " +
      "the same fields the consumer site shows, this entry could plausibly serve BOTH roles (discovery AND " +
      "meal/cancellation ground-truth), not just discovery. IMPORTANT CAVEAT: this was found by browsing the " +
      "public consumer website, not through any API - scraping that HTML for production use would be a ToS " +
      "violation, has no SLA, and breaks on any front-end change; it is NOT a substitute for the B2D API and " +
      "does not get built against. Its value right now is as concrete evidence for the outstanding enquiry " +
      "(naming the exact fields/URLs found strengthens the case that KKday's data already supports what the " +
      "enquiry asked for). Enquiry sent 2026-09-05 to GDSupport@kkday.com (b2d.kkday.com's own support " +
      "channel); status as of 2026-09-11: no reply yet, from KKday or any other outstanding enquiry (Klook " +
      "hotels, Awin advertiser applications) - see decision-intelligence-roadmap.md's own standing rule: 'No " +
      "Stage 1 hotel-search code gets written until at least one provider's capability is confirmed.' Still " +
      "nothing to build against - the finding above sharpens the follow-up, it doesn't skip the approval step.",
  },
  {
    id: "agoda-direct-booking",
    name: "Agoda (direct booking/affiliate relationship)",
    role: ["booking"],
    inventoryDescription: "925,000+ properties (per Agoda's own public affiliate marketing)",
    status: "pending",
    priority: 2,
    costModel: "Free to join, commission-based",
    notes:
      "Not yet applied anywhere as of 2026-09-11. Note: Agoda rates are ALREADY surfaced today through StayingAPI " +
      "(see stayingapi entry above) - this entry is specifically about capturing RateManifest's own affiliate " +
      "commission on Agoda bookings, not about sourcing Agoda's rates (already solved). Plan: check the already-" +
      "active CJ and Partnerize accounts first, then Agoda's own direct affiliate programme, before Travelpayouts " +
      "- Travelpayouts' hotel vertical is known-gated on 3 consecutive months of traffic + original travel " +
      "content (2026-09-01 finding, DECISIONS.md 'Monetization plan', Gate 2) and Agoda applied there specifically " +
      "may hit the identical wall.",
  },
  {
    id: "expedia-direct-booking",
    name: "Expedia (direct booking/affiliate relationship)",
    role: ["booking"],
    inventoryDescription: "Hotels (also already surfaced today via StayingAPI's cross-OTA feed)",
    status: "pending",
    priority: 2,
    costModel: "Commission-based",
    notes:
      "Not yet applied anywhere as of 2026-09-11. Same situation and same caveat as agoda-direct-booking above - " +
      "Expedia rates already come through StayingAPI; this is purely about RateManifest's own affiliate " +
      "commission. Check CJ/Partnerize before Travelpayouts for the same reason." +
      " UPDATE 2026-09-12: real affiliate access confirmed - Navin has a live Expedia Group Affiliate Network " +
      "(EPS/'creator.expediagroup.com') stays-search widget embed code, with a real camref (1110lNaPB, " +
      "data-program=\"us-expedia\", data-network=\"pz\"). data-network=\"pz\" indicates this came through " +
      "Partnerize specifically - answers this entry's own open question (\"Check CJ/Partnerize before " +
      "Travelpayouts\") in Partnerize's favor, same network path Agoda's entry above should also be checked " +
      "against first. Status intentionally left \"pending,\" not flipped to \"active\": Navin's own call " +
      "2026-09-12 was to log this as evidence only for now - the widget is not yet embedded anywhere on the " +
      "site. Flip to \"active\" only once/if it's actually placed on a page (most natural fit: Page 3, " +
      "alongside KlookTripSection - Expedia's own stays widget would need the same clearly-secondary, " +
      "not-independently-verified framing Klook's hotels block uses, since it's a raw affiliate search box, " +
      "not a RateManifest-checked comparison row).",
  },
  {
    id: "direct-hotel-brand",
    name: "Direct hotel brand affiliate deals (Oberoi, Anantara, Constance, Joali, Ayada Maldives, Minor Hotels, IHG, Hilton, Marriott, Plum Guide)",
    role: ["booking"],
    inventoryDescription: "Individual property or brand-group inventory, brand-specific",
    status: "future",
    priority: 3,
    costModel: "Commission-based, brand-specific terms",
    notes:
      "Paused as a category 2026-09-11 after Oberoi/Anantara/Constance all rejected same-day on Awin with the " +
      "identical reason ('Site does not complement advertiser brand') - a traffic/audience credibility gate, not " +
      "a per-brand fit problem. IHG/Hilton/Marriott/Plum Guide are a different shape (mass-market chains / a tech " +
      "partnership track) and not automatically paused, but not confirmed exempt either. Revisit the luxury-brand " +
      "subset once RateManifest has a real traffic/audience story - see outreach-tracker.md's full application " +
      "history and rejection details.",
  },
];

/** Every registry entry currently marked active, optionally filtered by role. */
export function activeSources(role?: SourceRole): SourceRegistryEntry[] {
  return SOURCE_REGISTRY.filter((s) => s.status === "active" && (!role || s.role.includes(role)));
}

/** Every registry entry not yet active, optionally filtered by role - for a quick "what are we still waiting on" read. */
export function pendingOrFutureSources(role?: SourceRole): SourceRegistryEntry[] {
  return SOURCE_REGISTRY.filter((s) => s.status !== "active" && (!role || s.role.includes(role)));
}
