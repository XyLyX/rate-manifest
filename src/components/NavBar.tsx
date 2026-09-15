import Link from "next/link";
import { Logo } from "./Logo";

// Navigation updated 2026-09-15 for public site positioning. Previous tabs:
// Hotels / Exceptional Stays / Methodology / For Business. New tabs signal
// the full Travel Decision Intelligence platform scope:
//
//   Hotels               — live, links to /
//   Flights              — coming soon, <span> not <Link> (goes nowhere yet)
//   Hotels + Flights     — coming soon, hidden on small screens to prevent overflow
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
// "Soon" items use <span> not <Link>: a tab that goes nowhere is worse than
// one that signals intent without pretending to work. `aria-disabled="true"`
// marks them for assistive technology.
export function NavBar({
  ctaLabel = "Search",
  ctaHref = "/",
  active = "hotels",
  variant = "default",
}: {
  ctaLabel?: string;
  ctaHref?: string;
  active?: "hotels" | "exceptional-stays" | "methodology" | "travel-intelligence" | "none";
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
        <span className="nav-tab nav-tab-soon" aria-disabled="true">
          Flights <span className="nav-soon-badge">Soon</span>
        </span>
        <span className="nav-tab nav-tab-soon nav-tab-hide-mobile" aria-disabled="true">
          Hotels + Flights <span className="nav-soon-badge">Soon</span>
        </span>
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
