import Link from "next/link";
import { Logo } from "./Logo";

// Rate Manifest product navigation.
//
// Foundational product towers:
//   Hotels
//   Flights
//   Rail
//
// Hotels + Flights is a combined product journey built from the Hotels and
// Flights towers. It is a public product surface, but not a fourth
// foundational tower.
//
// Product routes:
//   Hotels               — /hotels
//   Flights              — /flights
//   Hotels + Flights     — /hotels-flights
//   Rail                 — /rail
//   Travel Intelligence  — homepage editorial section
//   How it works         — homepage explanation section
//   Contact              — /contact

export function NavBar({
  ctaLabel = "Search",
  ctaHref = "/",
  active = "hotels",
  variant = "default",
}: {
  ctaLabel?: string;
  ctaHref?: string;
  active?:
    | "hotels"
    | "flights"
    | "hotels-flights"
    | "rail"
    | "exceptional-stays"
    | "methodology"
    | "travel-intelligence"
    | "none";
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
        <Link
          href="/hotels"
          className={active === "hotels" ? "nav-tab active" : "nav-tab"}
        >
          Hotels
        </Link>

        <Link
          href="/flights"
          className={active === "flights" ? "nav-tab active" : "nav-tab"}
        >
          Flights
        </Link>

        <Link
          href="/hotels-flights"
          className={
            active === "hotels-flights"
              ? "nav-tab active"
              : "nav-tab nav-tab-hide-mobile"
          }
        >
          Hotels + Flights
        </Link>

        <Link
          href="/rail"
          className={
            active === "rail"
              ? "nav-tab active"
              : "nav-tab nav-tab-hide-mobile"
          }
        >
          Rail
        </Link>

        <Link
          href="/#travel-intelligence"
          className={
            active === "travel-intelligence" ? "nav-tab active" : "nav-tab"
          }
        >
          Travel Intelligence
        </Link>

        <Link
          href="/#how-it-works"
          className="nav-tab nav-tab-hide-mobile"
        >
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
