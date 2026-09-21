import { EXPERIENCE_CATEGORIES, type ComponentKind, type FlightInput } from "./types";

// Minimal input validation per component kind. Returns a list of problems
// (empty = valid). Deliberately light: tower field sets beyond the locked
// minimums (Rail, Cruise ports/duration/cabin) are NOT enforced here.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function posInt(v: unknown, min: number): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= min;
}

export function validateComponentInput(kind: ComponentKind, input: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(input)) return ["input must be an object"];

  switch (kind) {
    case "hotel": {
      if (!nonEmpty(input.destination)) errors.push("destination required");
      if (!ISO_DATE.test(String(input.checkIn ?? ""))) errors.push("checkIn must be YYYY-MM-DD");
      if (!ISO_DATE.test(String(input.checkOut ?? ""))) errors.push("checkOut must be YYYY-MM-DD");
      if (!posInt(input.rooms, 1)) errors.push("rooms must be an integer >= 1");
      if (!posInt(input.adults, 1)) errors.push("adults must be an integer >= 1");
      if (!posInt(input.children, 0)) errors.push("children must be an integer >= 0");
      break;
    }
    case "flight": {
      const f = input as Partial<FlightInput>;
      if (!f.tripType || !["one_way", "return", "multi_city"].includes(f.tripType)) errors.push("tripType invalid");
      if (!Array.isArray(f.legs) || f.legs.length === 0) errors.push("at least one leg required");
      else
        f.legs.forEach((l, i) => {
          if (!isObject(l) || !nonEmpty(l.from) || !nonEmpty(l.to)) errors.push(`leg ${i}: from/to required`);
          else if (!ISO_DATE.test(String(l.departure ?? ""))) errors.push(`leg ${i}: departure must be YYYY-MM-DD`);
        });
      if (f.tripType === "return" && !ISO_DATE.test(String(f.returnDate ?? ""))) errors.push("returnDate required for return trips");
      if (!isObject(f.travellers) || !posInt(f.travellers.adults, 1) || !posInt(f.travellers.children, 0))
        errors.push("travellers.adults >= 1 and travellers.children >= 0 required");
      break;
    }
    case "cruise": {
      if (!nonEmpty(input.query)) errors.push("query required");
      if (input.departureDate !== undefined && !ISO_DATE.test(String(input.departureDate))) errors.push("departureDate must be YYYY-MM-DD");
      break;
    }
    case "experience": {
      if (!(EXPERIENCE_CATEGORIES as readonly unknown[]).includes(input.category)) {
        errors.push(`category must be one of ${EXPERIENCE_CATEGORIES.join(", ")}`);
      }
      break;
    }
    case "rail":
      break; // extensible boundary: any object is accepted
  }
  return errors;
}
