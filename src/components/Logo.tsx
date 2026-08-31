// The RM mark: three ascending bars (a "manifest" of rates, read top to
// bottom, tallest = the one worth taking) rather than any generic travel
// icon (no bed/suitcase/plane/globe/building — see DECISIONS.md, "Brand
// system v2"). The tallest bar picks up the lime "intelligence" accent;
// the other two stay tangerine. Renders inline so it always inherits the
// page's dark background rather than carrying its own.
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
      <rect x="2" y="13" width="5" height="9" rx="1" fill="#ff5a36" />
      <rect x="9.5" y="7" width="5" height="15" rx="1" fill="#ff5a36" />
      <rect x="17" y="2" width="5" height="20" rx="1" fill="#c8f31d" />
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
