import Link from "next/link";
import { Logo } from "./Logo";

// Navigation updated 2026-09-15 for Task F three-tower architecture.
// Previous state (2026-09-15 morning): Hotels live, Flights and
// "Hotels + Flights" as aria-disabled <span> tabs going nowhere.
//
// Task F change: Flights and Rail are real routes now (/flights, /rail).
// Each has a structural page that states its honest development status.
// <span> tabs that go nowhere are worse than pages that say "not yet" —
// the latter gives the NavBar tab a real destination, makes the tower
// structure legible, and avoids an accessibility anti-pattern (a tab with
// no href that keyboard users can't interact with).
//
// New tab order:
//   Hotels               — live, links to /
//   Flights              — structural page at /flights (not live, says so)
//   Rail                 — structural page at /rail (not live, says so)
//   Travel Intelligence  — anchor to editorial section on homepage
//   How it works         — anchor to how-it-works section, hidden on mobile
//   Contact              — /contact
//
// "Hotels + Flights" combined bundle is parked (not a nav tab) — it is a
// future product combination, not an independent tower. The three towers
// are Hotels, Flights, Rail; bundles come after all three are live.
//
// Flights and Rail are presented as equal product peers — no "Soon"
// badges. The product communicates its state when the visitor actually
// tries to use those journeys, not in the primary navigation.
export function NavBar({
  ctaLabel = "Search",
  ctaHref = "/",
  active = "hotels",
  variant = "default",
}: {
  ctaLabel?: string;
  ctaHref?: string;
  active?: "hotels" | "flights" | "rail" | "exceptional-stays" | "methodology" | "travel-intelligence" | "none";
  // "home" drops the sticky/negative-margin/background treatment that makes
  // this bar read as the top edge of the .shell card everywhere else — the
  // homepage hero is no longer inside .shell (see DECISIONS.md, "Homepage
  // redesign: matching the pasted mockup"), so this bar sits directly on the
  // hero band as a plain transparent row. Every other page keeps the default.
  variant?: "default" | "home";
}) {
  return (
    <div className={variant === "home" ? "nav-bar nav-bar-home" : "nav-bar"}>
      <Link href="/" className="logo-link" style={{ textDecoration: "none" }}>
        <Logo />
      </Link>
      <nav className="nav-links">
        <Link href="/" className={active === "hotels" ? "nav-tab active" : "nav-tab"}>
          Hotels
        </Link>
        <Link
          href="/flights"
          className={active === "flights" ? "nav-tab active" : "nav-tab"}
        >
          Flights
        </Link>
        <Link
          href="/rail"
          className={active === "rail" ? "nav-tab active" : "nav-tab nav-tab-hide-mobile"}
        >
          Rail
        </Link>
        <Link
          href="/#travel-intelligence"
          className={active === "travel-intelligence" ? "nav-tab active" : "nav-tab"}
        >
          Travel Intelligence
        </Link>
        <Link href="/#how-it-works" className="nav-tab nav-tab-hide-mobile">
          How it works
        </Link>
        <Link href="/contact" className="nav-tab">
          Contact
        </Link>
        <Link href={ctaHref} className="btn nav-cta">
          {ctaLabel}
        </Link>
      </nav>
    </div>
  );
}
