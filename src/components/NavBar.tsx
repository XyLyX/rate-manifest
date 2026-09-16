import Link from "next/link";
import { Logo } from "./Logo";

// Navigation updated 2026-09-15 for public site positioning. Previous tabs:
// Hotels / Exceptional Stays / Methodology / For Business. New tabs signal
// the full Travel Decision Intelligence platform scope:
//
//   Hotels               — live, links to /
//   Flights              — product mode link
//   Hotels + Flights     — product mode link, hidden on small screens to prevent overflow
//   Rail                 — product mode link
//   Travel Intelligence  — anchor to the editorial section on the homepage
//   How it works         — anchor to the how-it-works section, hidden on mobile
//   Contact              — /contact
//
// "Exceptional Stays" and "Methodology" pages still exist and are still
// reachable; they just no longer appear in the primary nav. "For Business"
// moved to the footer Business column. The `active` prop keeps "exceptional-
// stays" and "methodology" as valid values for backward compatibility with
// those pages' own <NavBar> calls — they just won't render a highlighted tab
// for a tab that isn't shown.
//
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
  // this bar read as the top edge of the .shell card everywhere else - the
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
        <Link href="/?mode=flights" className={active === "flights" ? "nav-tab active" : "nav-tab"}>
          Flights
        </Link>
        <Link href="/?mode=combined" className="nav-tab nav-tab-hide-mobile">
          Hotels + Flights
        </Link>
        <Link href="/?mode=rail" className={active === "rail" ? "nav-tab active" : "nav-tab"}>
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
