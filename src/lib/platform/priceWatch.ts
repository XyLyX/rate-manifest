import type { Tournament } from "./tournament";
import type { TowerKind, TripComponent } from "./types";

// Price Watch: DOMAIN SCAFFOLD ONLY.
//
// A watch belongs to the traveller's selected DECISION (the Finalist and its
// component context), never to an affiliate network or merchant route: it has
// no merchant, access route, attribution or URL fields. It retains the context
// needed to watch later (property/itinerary, dates, travellers, rooms, known
// rate/fare conditions, target).
//
// There is NO authorized repeatable pricing source, so nothing here polls,
// alerts, notifies, keeps history, or states a probability. Availability is
// reported as false for every tower until such a source exists.

export const WATCH_LABELS: Record<TowerKind, string | null> = {
  hotel: "Watch this rate",
  flight: "Watch this fare",
  // Same capability as Flights once repeatable rail pricing exists.
  rail: "Watch this fare",
  // Not specified in the product contract.
  cruise: null,
};

export const PRICE_WATCH_CAPABILITY = {
  pollingAvailable: false,
  alertsAvailable: false,
  historyAvailable: false,
  requiresAuthorizedRepeatablePricingSource: true,
} as const;

export function watchAvailability(kind: TowerKind): { label: string | null; available: false; reason: "no_authorized_repeatable_pricing_source" | "not_in_contract" } {
  return { label: WATCH_LABELS[kind], available: false, reason: WATCH_LABELS[kind] ? "no_authorized_repeatable_pricing_source" : "not_in_contract" };
}

export interface PriceWatchIntent {
  kind: TowerKind;
  label: string;
  componentId: string;
  finalistId: string;
  // Copy of the component's own input at the time of intent (dates, travellers, rooms...).
  context: Record<string, unknown>;
  // Rate/fare conditions already known and shown to the traveller.
  conditions: readonly string[];
  target: { currency: string; amount: number } | null;
  status: "scaffold_only";
}

export function createPriceWatchIntent(args: {
  component: TripComponent;
  tournament: Tournament;
  conditions?: readonly string[];
  target?: { currency: string; amount: number } | null;
}): PriceWatchIntent {
  const { component, tournament } = args;
  const label = WATCH_LABELS[tournament.kind];
  if (!label) throw new Error(`Price watch is not part of the ${tournament.kind} contract`);
  if (component.kind !== tournament.kind) throw new Error(`Tournament is for ${tournament.kind}, component is ${component.kind}`);
  if (!tournament.finalistId || tournament.finalistChosenBy !== "traveller") throw new Error("A watch belongs to a decision: the traveller must choose a Finalist first");
  if (args.target && !(Number.isFinite(args.target.amount) && args.target.amount > 0 && args.target.currency)) throw new Error("Invalid watch target");

  return {
    kind: tournament.kind,
    label,
    componentId: component.id,
    finalistId: tournament.finalistId,
    context: structuredClone(component.input) as Record<string, unknown>,
    conditions: [...(args.conditions ?? [])],
    target: args.target ?? null,
    status: "scaffold_only",
  };
}
