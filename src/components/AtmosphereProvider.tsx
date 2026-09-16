"use client";

/**
 * AtmosphereProvider — Phase A session-stable visual set selector.
 *
 * Runs client-side only (useEffect). On mount it:
 *   1. Reads the saved set ID from sessionStorage (key: "rm-atm").
 *   2. If absent, picks one at random and saves it for this session.
 *   3. Sets data-atmosphere="<id>" on <html> so the CSS atmosphere rules
 *      activate without any React prop drilling.
 *
 * No server-side state, no DB, no Gemini dependency.
 * No hydration mismatch: the server renders without any atmosphere attribute;
 * the client adds it on the first paint after mount (sub-frame flash is
 * invisible because the fallback CSS already shows the navy background).
 *
 * DESTINATION OVERRIDE (future): call setAtmosphereId(id) after a trip
 * search to switch to a destination-appropriate set (e.g. Bangkok → tropical).
 * The function is exported so callers can import it without re-rendering this
 * provider, but the provider still owns the initial session pick.
 */

import { useEffect } from "react";
import { ATMOSPHERE_IDS, pickAtmosphereId } from "@/lib/atmosphere/sets";

const SESSION_KEY = "rm-atm";

/** Apply an atmosphere ID immediately (idempotent, callable from anywhere). */
export function setAtmosphereId(id: string): void {
  if (typeof document === "undefined") return;
  if (!ATMOSPHERE_IDS.includes(id)) return;
  document.documentElement.dataset.atmosphere = id;
  try {
    sessionStorage.setItem(SESSION_KEY, id);
  } catch {
    // sessionStorage unavailable (private mode, blocked) — attr still applied
  }
}

export function AtmosphereProvider({ children }: { children?: React.ReactNode }) {
  useEffect(() => {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(SESSION_KEY);
    } catch {
      // sessionStorage blocked — pick random each time; no persistent state
    }
    const chosen = pickAtmosphereId(id ?? undefined);
    setAtmosphereId(chosen);
  }, []);

  // Renders nothing visible; children are optional pass-through
  return <>{children}</>;
}
