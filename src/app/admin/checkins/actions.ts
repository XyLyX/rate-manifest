"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db/client";
import { BOOKING_OUTCOME_STATUSES, type BookingOutcomeStatus } from "@/lib/constants";

/**
 * Manual reconciliation: Navin reads an incoming WhatsApp reply (see
 * DECISIONS.md for why this is manual, not automated, in the MVP), matches
 * it to a BookingOutcome by its ref code, and records what happened here.
 * This is also what should eventually feed each Supplier's
 * reliabilityScore/bookingOutcomeCount — that aggregation isn't wired up
 * yet (see DECISIONS.md — it's the next real piece of the trust layer,
 * not this form).
 */
export async function updateOutcomeStatus(formData: FormData) {
  // PHASE 0.1 FIX (2026-09-12): the page this action is called from is now
  // gated by ADMIN_SECRET (see page.tsx) - but a Server Action is its own
  // POST endpoint, reachable directly by anyone who already has the
  // rendered form's action id, independent of whether they could load the
  // page itself. Checked again here, same secret, so a mutation can't
  // happen without it either.
  const adminSecret = String(formData.get("adminSecret") ?? "");
  if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
    throw new Error("Forbidden.");
  }

  const outcomeId = String(formData.get("outcomeId") ?? "");
  const status = String(formData.get("status") ?? "");
  const issueNote = String(formData.get("issueNote") ?? "").trim();

  if (!outcomeId || !BOOKING_OUTCOME_STATUSES.includes(status as BookingOutcomeStatus)) {
    throw new Error("Invalid check-in update.");
  }

  await db
    .update(schema.bookingOutcomes)
    .set({
      status,
      issueNote: issueNote || null,
      resolvedAt: status === "clicked" ? null : new Date(),
    })
    .where(eq(schema.bookingOutcomes.id, outcomeId));

  revalidatePath("/admin/checkins");
}
