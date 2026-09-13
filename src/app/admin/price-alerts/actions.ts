"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db/client";

/**
 * Marks a triggered price-tracking row as "sent" once Navin has actually
 * emailed the customer. Manual on purpose — see DECISIONS.md, "Price
 * tracking": there's no email sender wired up yet, same shape as the
 * WhatsApp check-in's manual reconciliation until Resend (or similar) is
 * configured.
 */
export async function markAlertSent(formData: FormData) {
  // PHASE 0.1 FIX (2026-09-12): see checkins/actions.ts's updateOutcomeStatus
  // for why this is checked again here, not just on the page that renders
  // the form - same ADMIN_SECRET, same reasoning.
  const adminSecret = String(formData.get("adminSecret") ?? "");
  if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
    throw new Error("Forbidden.");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Invalid price alert.");

  await db
    .update(schema.priceTracking)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(schema.priceTracking.id, id));

  revalidatePath("/admin/price-alerts");
}
