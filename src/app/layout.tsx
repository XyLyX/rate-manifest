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
import "./globals.css";

export const metadata: Metadata = {
  title: "Rate Manifest",
  description: "UAE/GCC hotel rate intelligence — find the best bookable rate, and know who to trust.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
