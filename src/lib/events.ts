import { db, schema } from "@/db/client";
import { newId } from "@/lib/id";
import type { EventType } from "@/lib/constants";

interface LogEventParams {
  type: EventType;
  sessionId: string;
  hotelId?: string;
  supplierId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Every call to this is a row this session's search/click behavior can be
 * reconstructed from later — and, once there's real traffic, is exactly
 * what gets aggregated into the D4 MVP Measurement Log columns (searches,
 * clicks, etc.) in Rate-Manifest-Economics.xlsx. Never throws: a logging
 * failure must not break the page the user is looking at.
 */
export async function logEvent(params: LogEventParams): Promise<void> {
  try {
    await db.insert(schema.events).values({
      id: newId(),
      type: params.type,
      sessionId: params.sessionId,
      hotelId: params.hotelId,
      supplierId: params.supplierId,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    });
  } catch (err) {
    console.error("logEvent failed (non-fatal):", err);
  }
}

/**
 * A short-lived per-browser identifier used only to group this session's
 * own Events (search → results_viewed → rate_revealed → outbound_click).
 * Not a user account, not tied to any personal data — just a random id
 * stored in a cookie so a funnel can be reconstructed later.
 */
export function generateSessionId(): string {
  return `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
