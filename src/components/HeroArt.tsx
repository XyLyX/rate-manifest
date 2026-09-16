/**
 * AtmosphereHero — Phase A cinematic hero replacement.
 *
 * Replaces the previous HeroArt dark-card panel (`.hero-intelligence-visual`).
 * This component renders the structural HTML for the full-width cinematic
 * hero; the actual background photography is applied entirely via CSS using
 * the data-atmosphere attribute that AtmosphereProvider sets on <html>.
 *
 * No images are loaded here — the CSS [data-atmosphere="<id>"] .atm-hero-img
 * rules supply the background-image for whichever set was chosen this session.
 * Placeholder paths (/images/atmosphere/<set>/<slot>.jpg) let the layout
 * render correctly before final photography is dropped in.
 *
 * The `destination` prop is kept for future use: once the destination calendar
 * engine maps cities to atmosphere sets, it can call setAtmosphereId() after
 * the trip search resolves. Nothing here needs to change for that extension.
 */

interface AtmosphereHeroProps {
  destination?: string | null;
}

export function AtmosphereHero({ destination: _destination }: AtmosphereHeroProps) {
  return (
    <div className="atm-hero" aria-hidden="true">
      {/* Background image — activated by CSS [data-atmosphere] rules */}
      <div className="atm-hero-img" />
      {/* Gradient veil for text legibility */}
      <div className="atm-hero-veil" />
    </div>
  );
}
