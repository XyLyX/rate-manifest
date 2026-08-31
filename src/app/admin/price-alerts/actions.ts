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
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Invalid price alert.");

  await db
    .update(schema.priceTracking)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(schema.priceTracking.id, id));

  revalidatePath("/admin/price-alerts");
}
