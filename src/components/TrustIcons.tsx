// Small inline icon set for the homepage trust strip - plain SVG rather
// than an icon library dependency (this app has none installed), colored
// via currentColor so a single CSS rule on .trust-icon sets all five.
type IconProps = { className?: string };

export function IconBolt({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function IconShieldCheck({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3 4.5 5.5v5.4c0 4.6 3.1 8.4 7.5 9.6 4.4-1.2 7.5-5 7.5-9.6V5.5L12 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="m9 12 2.2 2.2L15.5 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconStar({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="m12 3 2.6 5.7 6.2.6-4.7 4.2 1.4 6.2L12 16.9 6.5 19.7l1.4-6.2-4.7-4.2 6.2-.6L12 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconScales({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 3v18M7 7h10M4 7l3 6-3 0 3-6ZM20 7l-3 6 3 0-3-6ZM8 21h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconLink({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M9.5 14.5 14.5 9.5M8 16.5 5.6 18.9a3 3 0 1 1-4.2-4.2L4 12.3M16 7.5l2.4-2.4a3 3 0 1 1 4.2 4.2L20 11.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
