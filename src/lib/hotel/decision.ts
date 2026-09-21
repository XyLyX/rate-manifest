import { addComponent, ensureMerchant, recordOffer, selectOffer, updateComponentInput, type PlatformStore } from "../platform/service";
import type { HotelInput, Merchant, OfferSnapshot, Selection, TripComponent } from "../platform/types";

// Hotel V1 decision identity on the shared platform (DB-free, store-injected).
//
// ONE hotel decision per Trip = the trip's hotel component (the stay context +
// chosen property) + its current selection of a Check IQ evidence snapshot.
// The evidence (a verified rate at a named seller, from Check IQ) is stored as
// an OfferSnapshot whose sourceUrl is deliberately null: the rate source's URL
// is evidence, NOT an authorised booking destination, and evidence never
// creates commercial attribution. Booking routes are resolved separately
// (see commercial.ts).

export interface HotelDecisionInput {
  tripId: string;
  propertyId: string;
  propertyName?: string;
  stay: Omit<HotelInput, "propertyId">;
  evidence: {
    sellerSlug: string; // the merchant that the verified rate belongs to
    sellerName: string;
    totalPrice: number;
    currency: string;
    verdictId?: string | null;
    rateId?: string | null;
    checkedAt?: string | null;
  };
}

export interface HotelDecision {
  component: TripComponent<"hotel">;
  selection: Selection;
  offer: OfferSnapshot;
  merchant: Merchant;
}

function hotelInputFor(i: Pick<HotelDecisionInput, "propertyId" | "stay">): HotelInput {
  // fixed key order so a re-selection with unchanged context compares equal
  return {
    destination: i.stay.destination,
    checkIn: i.stay.checkIn,
    checkOut: i.stay.checkOut,
    rooms: i.stay.rooms,
    adults: i.stay.adults,
    children: i.stay.children,
    propertyId: i.propertyId,
  };
}

async function findHotelComponent(store: PlatformStore, tripId: string): Promise<TripComponent<"hotel"> | null> {
  const c = (await store.listComponents(tripId)).find((x) => x.kind === "hotel");
  return (c as TripComponent<"hotel"> | undefined) ?? null;
}

/** Records the traveller's Check IQ selection as the trip's hotel decision. Other components are untouched. */
export async function recordHotelDecision(
  store: PlatformStore,
  input: HotelDecisionInput
): Promise<{ componentId: string; offerId: string; selectionId: string }> {
  const wanted = hotelInputFor(input);
  let component = await findHotelComponent(store, input.tripId);
  if (!component) {
    component = await addComponent(store, { tripId: input.tripId, kind: "hotel", input: wanted });
  } else if (JSON.stringify(component.input) !== JSON.stringify(wanted)) {
    await updateComponentInput(store, component.id, wanted);
  }

  await ensureMerchant(store, { slug: input.evidence.sellerSlug, name: input.evidence.sellerName });
  const offer = await recordOffer(store, {
    componentId: component.id,
    merchantSlug: input.evidence.sellerSlug,
    externalRef: input.evidence.rateId ?? null,
    currency: input.evidence.currency,
    totalPrice: input.evidence.totalPrice,
    sourceUrl: null, // rate-source URLs are evidence, never a booking destination
    payload: {
      evidenceSource: "stayingapi",
      propertyId: input.propertyId,
      propertyName: input.propertyName ?? null,
      verdictId: input.evidence.verdictId ?? null,
      checkedAt: input.evidence.checkedAt ?? null,
    },
    provenance: {
      enteredVia: "check_iq_verification",
      evidenceRefs: [input.evidence.verdictId ? `verdict:${input.evidence.verdictId}` : null, input.evidence.rateId ? `rate:${input.evidence.rateId}` : null].filter(
        (x): x is string => x !== null
      ),
    },
  });
  const selection = await selectOffer(store, { componentId: component.id, offerId: offer.id });
  return { componentId: component.id, offerId: offer.id, selectionId: selection.id };
}

/** The trip's current hotel decision, or null if none (or if the hotel context changed since selection). */
export async function getHotelDecision(store: PlatformStore, tripId: string): Promise<HotelDecision | null> {
  const component = await findHotelComponent(store, tripId);
  if (!component || component.status !== "selected") return null;
  const selection = await store.getSelectionForComponent(component.id);
  const offer = selection ? await store.getOffer(selection.offerId) : null;
  const merchant = offer ? await store.getMerchant(offer.merchantId) : null;
  if (!selection || !offer || !merchant) return null;
  return { component, selection, offer, merchant };
}

// ---------------------------------------------------------------------------
// Property choice (StayingAPI quarantine): the traveller explicitly chooses a
// HOTEL. This is a property decision, distinct from a priced seller/rate
// selection: it records only the trip's hotel component (chosen property plus
// the trip's own stay/traveller context). No seller, price, currency, deep
// link or OfferSnapshot is created or required, and nothing is fabricated.
// ---------------------------------------------------------------------------

export interface PropertyChoiceInput {
  tripId: string;
  propertyId: string;
  propertyName?: string;
  stay: Omit<HotelInput, "propertyId">;
}

export interface PropertyChoice {
  // null only for a legacy fallback (no platform component exists for the trip).
  componentId: string | null;
  propertyId: string;
  stay: Omit<HotelInput, "propertyId">;
  source: "platform" | "legacy_selection";
}

/** Records (or updates) the trip's chosen hotel. Other components are untouched. */
export async function recordPropertyChoice(store: PlatformStore, input: PropertyChoiceInput): Promise<{ componentId: string }> {
  const wanted = hotelInputFor(input);
  let component = await findHotelComponent(store, input.tripId);
  if (!component) {
    component = await addComponent(store, { tripId: input.tripId, kind: "hotel", input: wanted });
  } else if (JSON.stringify(component.input) !== JSON.stringify(wanted)) {
    await updateComponentInput(store, component.id, wanted);
  }
  return { componentId: component.id };
}

/** The trip's chosen hotel, or null if the traveller has not chosen one. Needs no rate or seller. */
export async function getPropertyChoice(store: PlatformStore, tripId: string): Promise<PropertyChoice | null> {
  const component = await findHotelComponent(store, tripId);
  const propertyId = component?.input.propertyId;
  if (!component || !propertyId) return null;
  const { propertyId: _ignored, ...stay } = component.input;
  void _ignored;
  return { componentId: component.id, propertyId, stay, source: "platform" };
}

/**
 * Read-only compatibility for trips made before the StayingAPI quarantine: a
 * legacy trip_selections row proves the traveller chose that HOTEL. Only the
 * property identity (hotelId) is carried over - never a seller, price,
 * currency, deep link or verdict - and nothing is written or migrated. A
 * platform property choice always wins over the legacy fallback.
 */
export function propertyChoiceWithLegacyFallback(
  platform: PropertyChoice | null,
  legacyHotelId: string | null,
  tripStay: Omit<HotelInput, "propertyId"> | null
): PropertyChoice | null {
  if (platform) return platform;
  if (!legacyHotelId || !tripStay) return null;
  return { componentId: null, propertyId: legacyHotelId, stay: tripStay, source: "legacy_selection" };
}
