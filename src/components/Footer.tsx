import Link from "next/link";
import { Logo } from "./Logo";

// W4 (2026-09-14): updated tagline ("Verify the rate. Make the decision."),
// added Travel Intelligence and Legal (Privacy/Terms) to footer columns,
// removed "Terms and privacy policy: coming before public launch." placeholder
// now that /privacy and /terms routes exist.
//
// 2026-09-15 positioning pass: added Contact link to Explore column.
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-brand">
        <Logo size={18} />
        <p>Verify the rate. Make the decision.</p>
      </div>
      <div className="site-footer-cols">
        <div>
          <div className="site-footer-heading">Explore</div>
          <Link href="/">Search</Link>
          <Link href="/#travel-intelligence">Travel Intelligence</Link>
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/contact">Contact</Link>
        </div>
        <div>
          <div className="site-footer-heading">Business</div>
          <Link href="/for-business">For Business</Link>
        </div>
        <div>
          <div className="site-footer-heading">Legal</div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </div>
      <p className="site-footer-disclosure">
        Rate Manifest may earn a referral fee when you book through a link on this site. This does not
        affect the rates shown. Bookings happen on the underlying supplier&apos;s own site — Rate Manifest
        doesn&apos;t process payment, hold inventory, or handle cancellations. Not affiliated with or
        endorsed by Booking.com, Expedia, Agoda, Hotels.com, or Trip.com.
      </p>
    </footer>
  );
}
