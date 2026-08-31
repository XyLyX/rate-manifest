import Link from "next/link";
import { Logo } from "./Logo";

// Deliberately small: Search, How it works, For Business. No Destinations,
// Blog, Deals, Rewards, or About yet — those would be either dead links or
// pages padded with content we don't actually have (see DECISIONS.md,
// "Brand system v2" — destination pages specifically are meant to be
// generated from real rate data, not written ahead of it).
export function NavBar({ ctaLabel = "Search", ctaHref = "/" }: { ctaLabel?: string; ctaHref?: string }) {
  return (
    <div className="nav-bar">
      <Link href="/" className="logo-link" style={{ textDecoration: "none" }}>
        <Logo />
      </Link>
      <nav className="nav-links">
        <Link href="/#how-it-works">How it works</Link>
        <Link href="/for-business">For Business</Link>
        <Link href={ctaHref} className="btn nav-cta">
          {ctaLabel}
        </Link>
      </nav>
    </div>
  );
}
