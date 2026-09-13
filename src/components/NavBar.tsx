import Link from "next/link";
import { Logo } from "./Logo";

// Section tabs restyled 2026-09-03 to match the homepage redesign's tab
// row (see DECISIONS.md, "Homepage redesign: matching the pasted
// mockup"), but still pointed only at things that are real. "Hotels" is
// this app's actual product, always active here.
//
// No "Things To Do" tab: the homepage's old #explore teaser section (a
// "Hotels" / "Things To Do" card pair sitting above the real Top Hotels
// shortlist) was removed 2026-09-05 - see
// claude/travel-decision-platform-assessment.md, "RateManifest — Final
// Customer Journey": Page 1 (Discover) is dedicated entirely to hotel
// discovery, and Things To Do (Viator + Klook) belongs on Page 3
// (Complete Your Trip, src/app/complete-your-trip/page.tsx), reached only
// after a hotel and rate are chosen - not something to tease from the
// homepage nav. Linking this tab at "/#explore" after the section's
// removal would just be a dead anchor.
// Deliberately still no Flights, Transfers, or Deals tabs, and no
// wishlist/account icons - none of those are real features (no flight
// data source, no accounts system), and a tab or icon that goes nowhere
// or does nothing is worse than one that's simply not there yet.
// 2026-09-11: added "Exceptional Stays" and "Methodology" tabs (claude/
// rate-manifest-technical-blueprint.md, Section 12) to complete the
// reviewer-walkthrough path (Homepage -> Exceptional Stays -> Property IQ
// -> Methodology -> Check IQ). Folded the old "How it works" anchor tab
// into "Methodology" rather than keeping both - the homepage's #how-it-
// works teaser section still exists (unchanged) and is still reachable by
// scrolling, but the nav's own "explain the product" slot now points at
// the full page rather than a 3-card teaser, since having both said
// overlapping things.
export function NavBar({
  ctaLabel = "Search",
  ctaHref = "/",
  active = "hotels",
  variant = "default",
}: {
  ctaLabel?: string;
  ctaHref?: string;
  active?: "hotels" | "exceptional-stays" | "methodology" | "none";
  // "home" drops the sticky/negative-margin/background treatment that
  // makes this bar read as the top edge of the .shell card everywhere
  // else - the homepage hero is no longer inside .shell (see
  // DECISIONS.md, "Homepage redesign: matching the pasted mockup," on why
  // the hero needed to break out of that single-card layout to go
  // edge-to-edge), so this bar instead sits directly on the hero band as
  // a plain transparent row. Every other page keeps the default.
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
          href="/exceptional-stays"
          className={active === "exceptional-stays" ? "nav-tab active" : "nav-tab"}
        >
          Exceptional Stays
        </Link>
        <Link href="/methodology" className={active === "methodology" ? "nav-tab active" : "nav-tab"}>
          Methodology
        </Link>
        <Link href="/for-business" className="nav-tab">
          For Business
        </Link>
        <Link href={ctaHref} className="btn nav-cta">
          {ctaLabel}
        </Link>
      </nav>
    </div>
  );
}
