import type { Metadata } from "next";

// Fonts via @fontsource (npm-distributed static font files) rather than
// next/font/google, which fetches from fonts.googleapis.com at build time
// — a network dependency that isn't guaranteed everywhere a build might
// run. @fontsource ships the files as part of `npm install`, no live fetch
// needed. Only the weights actually used are imported.
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
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
