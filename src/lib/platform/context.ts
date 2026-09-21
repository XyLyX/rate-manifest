import { addComponent, type PlatformStore } from "./service";
import type { ComponentInputByKind, ComponentKind, CruiseInput, FlightInput, HotelInput, TripComponent } from "./types";

// Cross-tower SUGGESTED context. Not shared state, not a binding:
//  - suggestContext() is a pure read of the source component; it returns a
//    fresh plain object and never mutates or references the source.
//  - the suggestion is only a starting point. The receiving component is
//    created through the normal addComponent() path from values the caller
//    completes/overrides, and owns those values from then on.
//  - nothing records a link between the two components, so editing either
//    one later cannot affect the other.
// Pairs without an explicit mapping return null (e.g. anything to/from Rail
// until the first real Rail source defines its fields).

export type Suggestion = Record<string, unknown>;

function clean(o: Record<string, unknown>): Suggestion {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));
}

function fromFlight(f: FlightInput, target: ComponentKind): Suggestion | null {
  const first = f.legs[0];
  const last = f.legs[f.legs.length - 1];
  if (!first || !last) return null;
  const to = f.tripType === "multi_city" ? last.to : first.to;
  if (target === "hotel") {
    return clean({
      destination: to,
      // departure date is only a proxy for arrival; the receiving Hotel owns its dates.
      checkIn: first.departure,
      checkOut: f.tripType === "return" ? f.returnDate : undefined,
      adults: f.travellers.adults,
      children: f.travellers.children,
    });
  }
  if (target === "experience") {
    return clean({
      destination: to,
      startDate: first.departure,
      endDate: f.tripType === "return" ? f.returnDate : undefined,
      adults: f.travellers.adults,
      children: f.travellers.children,
    });
  }
  return null;
}

function fromHotel(h: HotelInput, target: ComponentKind): Suggestion | null {
  if (target === "flight") {
    // Origin is unknown to a Hotel; the receiver must supply it.
    return clean({
      tripType: h.checkOut ? "return" : "one_way",
      legs: [{ to: h.destination, departure: h.checkIn }],
      returnDate: h.checkOut,
      travellers: { adults: h.adults, children: h.children },
    });
  }
  if (target === "experience") {
    return clean({ destination: h.destination, startDate: h.checkIn, endDate: h.checkOut, adults: h.adults, children: h.children });
  }
  return null;
}

function fromCruise(c: CruiseInput, target: ComponentKind): Suggestion | null {
  // Only source-specific fields the source actually supplied are used; the
  // free-text query is not a port and is never treated as one.
  const port = typeof c.departurePort === "string" ? c.departurePort : undefined;
  if (!port) return null;
  if (target === "hotel") {
    // Pre-cruise stay: must end by the departure date; check-in is left to the receiver.
    return clean({ destination: port, checkOut: c.departureDate });
  }
  if (target === "flight") return clean({ legs: [{ to: port }] });
  if (target === "experience") return clean({ destination: port, startDate: c.departureDate });
  return null;
}

/** Suggested starting values for a component of `target` kind, derived from `source`. null = no mapping. */
export function suggestContext(source: TripComponent, target: ComponentKind): Suggestion | null {
  switch (source.kind) {
    case "flight":
      return fromFlight(source.input as FlightInput, target);
    case "hotel":
      return fromHotel(source.input as HotelInput, target);
    case "cruise":
      return fromCruise(source.input as CruiseInput, target);
    default:
      return null;
  }
}

/**
 * Creates a new component of `kind` from a suggestion derived from an
 * existing component. `complete` receives the suggestion and must return the
 * receiving component's full input (validated by addComponent). The source
 * component is only read.
 */
export async function addComponentFromSuggestion<K extends ComponentKind>(
  store: PlatformStore,
  args: {
    tripId: string;
    kind: K;
    sourceComponentId: string;
    complete: (suggestion: Suggestion) => ComponentInputByKind[K];
  }
): Promise<TripComponent<K>> {
  const source = await store.getComponent(args.sourceComponentId);
  if (!source) throw new Error("Source component not found");
  const suggestion = suggestContext(source, args.kind);
  if (!suggestion) throw new Error(`No context mapping from ${source.kind} to ${args.kind}`);
  return addComponent(store, { tripId: args.tripId, kind: args.kind, input: args.complete(suggestion) });
}
