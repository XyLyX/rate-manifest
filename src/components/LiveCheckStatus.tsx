"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface LiveCheckStatusProps {
  hotelId: string;
  checkIn: string;
  checkOut: string;
}

// Polls /api/live-check-status every few seconds while ensureLiveCheckTriggered()
// (called server-side in /search/page.tsx) has a real StayingAPI job in
// flight for this exact hotel/date pair - see DECISIONS.md, "Live
// on-demand check on /search." StayingAPI's own docs say a job usually
// finishes in tens of seconds but can take several minutes (240s+,
// confirmed live once already this session) - this polls for up to ~4
// minutes before giving up and showing a "still checking" fallback rather
// than polling forever.
const POLL_INTERVAL_MS = 4000;
const MAX_ATTEMPTS = 60; // ~4 minutes at 4s apart

export function LiveCheckStatus({ hotelId, checkIn, checkOut }: LiveCheckStatusProps) {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);
  const stoppedRef = useRef(false);
  const attemptsRef = useRef(0);

  useEffect(() => {
    stoppedRef.current = false;
    attemptsRef.current = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (stoppedRef.current) return;
      try {
        const res = await fetch(
          `/api/live-check-status?hotel=${encodeURIComponent(hotelId)}&checkin=${encodeURIComponent(checkIn)}&checkout=${encodeURIComponent(checkOut)}`
        );
        const data = await res.json();
        if (data.status === "ready" || data.status === "error" || data.status === "no-pending-job") {
          // Any terminal state - reload this page's server-rendered data so
          // it picks up whatever's now in staying_api_cache. router.refresh()
          // re-runs the server component without a full page reload.
          if (!stoppedRef.current) router.refresh();
          return;
        }
      } catch {
        // A transient network blip while polling isn't worth surfacing -
        // just try again on the next tick.
      }
      attemptsRef.current += 1;
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        setGaveUp(true);
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      stoppedRef.current = true;
      clearTimeout(timer);
    };
  }, [hotelId, checkIn, checkOut, router]);

  if (gaveUp) {
    return (
      <p className="empty-state">
        This is taking longer than usual to check. Refresh this page in a minute to try again.
      </p>
    );
  }

  return (
    <div className="live-check-status">
      <div className="live-check-spinner" aria-hidden="true" />
      <p>Checking real-time prices across sources for these exact dates. This usually takes under a minute.</p>
    </div>
  );
}
