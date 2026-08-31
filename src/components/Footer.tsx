import Link from "next/link";
import { Logo } from "./Logo";

// Minimal on purpose, and only links to pages that actually exist. Terms,
// Privacy, and a standalone Affiliate Disclosure page are deliberately not
// built yet — that's real legal drafting, not scaffolding, and shipping a
// placeholder would read as more official than it is (see DECISIONS.md).
// The affiliate disclosure sentiment itself is stated plainly in text
// instead, matching the footnote language already on the search/results
// pages.
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-brand">
        <Logo size={18} />
        <p>Every rate. One clear decision.</p>
      </div>
      <div className="site-footer-cols">
        <div>
          <div className="site-footer-heading">Explore</div>
          <Link href="/">Search</Link>
          <Link href="/#how-it-works">How it works</Link>
        </div>
        <div>
          <div className="site-footer-heading">Business</div>
          <Link href="/for-business">For Business</Link>
        </div>
      </div>
      <p className="site-footer-disclosure">
        Bookings happen on the underlying supplier&apos;s own site — Rate Manifest doesn&apos;t process
        payment, hold inventory, or handle cancellations. Not affiliated with or endorsed by Booking.com,
        Expedia, Agoda, Hotels.com, or Trip.com. Terms and privacy policy: coming before public launch.
      </p>
    </footer>
  );
}
