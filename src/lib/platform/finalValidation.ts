import type { Tournament } from "./tournament";

// Tower-specific FINAL VALIDATION, the step between "traveller chose a
// Finalist" and any commercial route:
//
//   Hotel : Check IQ (authorized entry through the existing gate)
//   Flight, Rail, Cruise : factual fare/conditions (or sailing) confirmation.
//                          There is NO Flight IQ, Rail IQ or Cruise IQ.
//
// commercialStage() is the single gate for "may a commercial action exist yet".
// It reads only decision state, never commercial state.

export type FinalValidation =
  | {
      kind: "check_iq";
      // The traveller entered Check IQ through the existing authorized=1 gate.
      authorized: boolean;
      // Hotel truth today is "unavailable" (StayingAPI quarantined). Reaching Check IQ
      // is what matters for ordering; this never fabricates a verified rate.
      rateVerification: "unavailable" | "verified";
    }
  | {
      kind: "factual_confirmation";
      confirmed: boolean;
      // The factual items the traveller was shown and confirmed (fare, conditions, dates...).
      confirmedFacts: readonly string[];
    };

export type StageBlock =
  | "no_finalist"
  | "finalist_not_chosen_by_traveller"
  | "validation_missing"
  | "wrong_validation_for_tower"
  | "validation_not_completed";

export type StageDecision = { allowed: true } | { allowed: false; reason: StageBlock };

export function commercialStage(t: Tournament, validation: FinalValidation | null | undefined): StageDecision {
  if (!t.finalistId) return { allowed: false, reason: "no_finalist" };
  if (t.finalistChosenBy !== "traveller") return { allowed: false, reason: "finalist_not_chosen_by_traveller" };
  if (!validation) return { allowed: false, reason: "validation_missing" };

  if (t.kind === "hotel") {
    if (validation.kind !== "check_iq") return { allowed: false, reason: "wrong_validation_for_tower" };
    return validation.authorized ? { allowed: true } : { allowed: false, reason: "validation_not_completed" };
  }
  // Flight / Rail / Cruise: factual confirmation only, never an IQ step.
  if (validation.kind !== "factual_confirmation") return { allowed: false, reason: "wrong_validation_for_tower" };
  return validation.confirmed && validation.confirmedFacts.length > 0 ? { allowed: true } : { allowed: false, reason: "validation_not_completed" };
}
