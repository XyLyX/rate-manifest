import Link from "next/link";
import { Logo } from "./Logo";

// Phase A Visual Rebuild — final footer treatment (2026-09-17):
// Rebuilt to match locked reference: white independent panel below closing hero,
// CSS-grid main content area (brand | explore | company | legal | disclosure),
// compact bottom copyright row. Existing disclosure wording preserved verbatim.
// Routes used: /browse (hotels), /flights, /rail, /#travel-intelligence,
// /#how-it-works, /for-business, /contact, /privacy, /terms — all real.
export function Footer() {
  return (
    <footer className="site-footer">
      {/* Main content grid: brand | explore | company | legal | disclosure */}
      <div className="site-footer-main">

        {/* LEFT: Brand block */}
        <div className="site-footer-brand">
          <Logo size={24} />
          <span className="tagline">Travel Smarter. See More.</span>
          <p className="footer-brand-copy">
            Real data. Smarter choices.<br />Better journeys.
          </p>
        </div>

        {/* EXPLORE column */}
        <div className="site-footer-col">
          <div className="site-footer-col-heading">Explore</div>
          <Link href="/browse">Hotels</Link>
          <Link href="/flights">Flights</Link>
          <Link href="/rail">Rail</Link>
          <Link href="/#travel-intelligence">Travel Intelligence</Link>
          <Link href="/#how-it-works">How it works</Link>
        </div>

        {/* COMPANY column */}
        <div className="site-footer-col">
          <div className="site-footer-col-heading">Company</div>
          <Link href="/for-business">For Business</Link>
          <Link href="/contact">Contact</Link>
        </div>

        {/* LEGAL column */}
        <div className="site-footer-col">
          <div className="site-footer-col-heading">Legal</div>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Use</Link>
        </div>

        {/* RIGHT: Affiliate disclosure */}
        <div className="site-footer-col site-footer-disclosure-col">
          <div className="site-footer-col-heading">Travel with Confidence</div>
          <p className="site-footer-disclosure">
            Rate Manifest may earn a referral fee when you book through a link on this site. This does not
            affect the rates shown. Bookings happen on the underlying supplier&apos;s own site — Rate Manifest
            doesn&apos;t process payment, hold inventory, or handle cancellations. Not affiliated with or
            endorsed by Booking.com, Expedia, Agoda, Hotels.com, or Trip.com.
          </p>
        </div>

      </div>

      {/* Bottom row: copyright | brand sign-off */}
      <div className="site-footer-bottom">
        <span className="site-footer-copy">© 2026 Rate Manifest. All rights reserved.</span>
        <span className="site-footer-signoff">— A Smarter Way to Travel</span>
      </div>
    </footer>
  );
}
