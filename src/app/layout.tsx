import type { Metadata } from "next";

// Fonts via @fontsource (npm-distributed static font files) rather than
// next/font/google, which fetches from fonts.googleapis.com at build time
// - a network dependency that isn't guaranteed everywhere a build might
// run. @fontsource ships the files as part of `npm install`, no live fetch
// needed. Only the weights actually used are imported.
//
// Switched 2026-09-03 from the three-family Space Grotesk/Inter/IBM Plex
// Mono system to a single family, Plus Jakarta Sans, at four weights - see
// DECISIONS.md, "Rebrand: white/indigo palette (2026-09-03)." The old
// three-family split (a display face, a body face, a separate mono face
// for labels/numbers) doesn't exist in the new brand spec's own type
// scale, which names one family across every role from H1 down to
// captions - see globals.css's --font-display/--font-body/--font-mono
// definitions, all three now pointing at this same family.
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
// Playfair Display — display headings only (Phase A Visual Rebuild, 2026-09-17).
// Weights 500 (h1/section titles), 600 (closing tagline), 800 (.globe-h1 specifies
// font-weight: 800 — without this import the browser has no registered @font-face at
// that exact weight, causing the match to fail and fall back to the body sans-serif).
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/800.css";
import "./globals.css";
// Track F (2026-09-13): journey progress indicator + confirm route block
// styles — kept in a separate file rather than appended to globals.css so
// Track F additions stay isolated and reviewable. See track-f.css for the
// full rationale.
import "./track-f.css";

export const metadata: Metadata = {
  title: "Rate Manifest",
  description: "Travel decision intelligence for smarter hotel choices — compare, understand and verify rates before you book.",
  // Cuelinks domain verification for https://ratemanifest.com/ (added 2026-09-15)
  other: {
    "cuelinks-verification": "VERIFY-CL-KRDPU2SS",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
