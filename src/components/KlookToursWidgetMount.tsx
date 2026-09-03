"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { KLOOK_TOURS_WIDGET_SRC } from "@/lib/klook";

// Travelpayouts' Klook Tours Widget script does not respect its own mount
// position - confirmed by live DOM inspection of the deployed site (see
// DECISIONS.md, "Klook Tours Widget DOM placement fix (2026-09-03)").
// Once the loader script runs, it builds its own
// <div id="klook_widget_wrapper..."><ins class="klookaff_auto_dynamic_widget">
// <iframe>...</iframe></ins></div> and appends that wrapper directly onto
// document.body, regardless of where the <script> tag itself sits in the
// DOM (next/script's own placement makes no difference here - this is the
// widget's own JS choosing document.body.appendChild()). Left
// uncorrected, the widget's real content - the Dubai experience cards -
// renders as the literal last thing on the page, below the Footer,
// instead of inside the "Complete your Dubai trip" card where it belongs
// and where the JSX below actually places it.
//
// Fix: watch document.body for the widget's wrapper node to appear (a
// MutationObserver, since its insertion timing depends on the loader
// script's own async load - it is not present at mount) and move that
// exact node into this component's own mount container the moment it
// shows up. Moving the existing DOM node (rather than cloning it or
// re-rendering) preserves the live iframe already inside it - no reload,
// no flicker, and the widget keeps functioning exactly as Klook built it.
export function KlookToursWidgetMount() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const tryClaim = (node: Element) => {
      const isWrapper =
        (node.id && node.id.startsWith("klook_widget_wrapper")) ||
        node.querySelector?.(".klookaff_auto_dynamic_widget") != null;
      if (isWrapper) {
        mount.appendChild(node);
        return true;
      }
      return false;
    };

    // Covers the (unlikely but possible) case where the widget already
    // landed on document.body before this effect ran.
    Array.from(document.body.children).some((child) => tryClaim(child));

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const added of Array.from(mutation.addedNodes)) {
          if (added instanceof Element && tryClaim(added)) return;
        }
      }
    });
    observer.observe(document.body, { childList: true });

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={mountRef} className="klook-widget-mount">
      <Script id="klook-tours-widget" src={KLOOK_TOURS_WIDGET_SRC} strategy="lazyOnload" />
    </div>
  );
}
