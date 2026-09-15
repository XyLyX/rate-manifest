"use server";

import { db, schema } from "@/db/client";
import { newId } from "@/lib/id";

export type DestinationInterestResult = { ok: true } | { ok: false; error: string };

/**
 * W3 (2026-09-14): records a visitor's interest in an unsupported
 * destination. Called from DiscoverForm's inline interest form when the
 * visitor's searched destination doesn't match any supported city.
 *
 * Returns a plain result object ({ok: true} | {ok: false, error}) rather
 * than redirecting or throwing, so the client can show success/error state
 * without a page navigation. Follows the same "use server" module pattern as
 * src/app/actions/trip.ts (no API route, no external validation library).
 *
 * Does NOT call StayingAPI, price-discovery, or hotel discovery.
 * Does NOT create a trip record.
 * Does NOT modify any existing table.
 */
export async function recordDestinationInterest(
  destination: string,
  name: string,
  email: string,
): Promise<DestinationInterestResult> {
  const dest = destination.trim();
  const nm = name.trim();
  // Lowercase for consistency; preserves valid international formats
  const em = email.trim().toLowerCase();

  if (!dest) return { ok: false, error: "Destination is required." };
  if (!nm) return { ok: false, error: "Please enter your name." };
  // RFC-5322-lite: at least one non-whitespace/@ char, @, domain segment, dot, TLD
  if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  try {
    await db.insert(schema.destinationInterest).values({
      id: newId(),
      destination: dest,
      name: nm,
      email: em,
      source: "destination_search",
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
