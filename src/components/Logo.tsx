// The RM mark: three ascending bars (a "manifest" of rates, read top to
// bottom, tallest = the one worth taking) rather than any generic travel
// icon (no bed/suitcase/plane/globe/building - see DECISIONS.md, "Brand
// system v2"). The tallest bar picks up the "intelligence" accent; the
// other two stay the primary brand color. Colors updated 2026-09-03 from
// the old tangerine/lime hex values to the new primary/positive palette -
// see DECISIONS.md, "Rebrand: white/indigo palette (2026-09-03)." Kept as
// hardcoded hex rather than CSS variables, same as before: this is an
// inline SVG with no access to globals.css's custom properties without an
// extra wrapper, and the mark's own colors are meant to stay the fixed
// brand colors regardless of what page background it sits on, unlike the
// rest of the site's content which does follow the --token system.
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="2" y="13" width="5" height="9" rx="1" fill="#635bff" />
      <rect x="9.5" y="7" width="5" height="15" rx="1" fill="#635bff" />
      <rect x="17" y="2" width="5" height="20" rx="1" fill="#10b981" />
    </svg>
  );
}

export function Logo({ size = 22, wordmarkClassName = "wordmark" }: { size?: number; wordmarkClassName?: string }) {
  return (
    <span className="logo-lockup">
      <LogoMark size={size} />
      <span className={wordmarkClassName}>Rate Manifest</span>
    </span>
  );
}
