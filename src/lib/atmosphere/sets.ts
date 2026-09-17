/**
 * Atmosphere Sets — Phase A visual direction.
 *
 * Five curated visual identities for the homepage. One is chosen per browser
 * session (sessionStorage, AtmosphereProvider.tsx) and applied as a
 * data-atmosphere attribute on <html>. CSS then activates the matching
 * background-image rules for the hero and the four intelligence-pillar cards.
 *
 * IMAGE PATHS follow the pattern:
 *   /images/atmosphere/<set-id>/<slot>.jpg
 * where slot is one of: hero | cost-reality | smart-choices |
 *                        getting-around | local-pulse
 *
 * To supply final photography, drop WebP/JPEG files at these paths in
 * /public. No code change required; the CSS already references them.
 *
 * DESTINATION MAPPING (future): once a trip is submitted, the calling code
 * can read the destination, map it to one of these set IDs, and call
 * AtmosphereProvider.setAtmosphere(id) to override the random session pick.
 * The architecture is already wired for that; nothing here needs to change.
 */

export type PillarKey =
  | "cost-reality"
  | "smart-choices"
  | "getting-around"
  | "local-pulse";

export interface AtmosphereSet {
  /** Matches the data-atmosphere attribute value and the /images/atmosphere/ subfolder */
  id: string;
  name: string;
  description: string;
  /** CSS accent colour shown in nav active state and hero eyebrow */
  accentColor: string;
  /** Paths to the 5 images in this set (hero + 4 pillars). */
  images: {
    hero: string;
    pillars: Record<PillarKey, string>;
  };
}

function imagePath(setId: string, slot: string): string {
  return `/images/atmosphere/${setId}/${slot}.jpg`;
}

function pillarImages(setId: string): Record<PillarKey, string> {
  return {
    "cost-reality": imagePath(setId, "cost-reality"),
    "smart-choices": imagePath(setId, "smart-choices"),
    "getting-around": imagePath(setId, "getting-around"),
    "local-pulse": imagePath(setId, "local-pulse"),
  };
}

export const ATMOSPHERE_SETS: AtmosphereSet[] = [
  {
    id: "alpine",
    name: "Alpine",
    description:
      "Crisp and cool — snow-capped peaks, glacial lakes, mountain roads and alpine forests.",
    accentColor: "#6ab0f5",
    images: {
      hero: imagePath("alpine", "hero"),
      pillars: pillarImages("alpine"),
    },
  },
  {
    id: "tropical",
    name: "Tropical",
    description:
      "Deep green and humid — rainforest canopy, waterfalls, lush vegetation and misty valleys.",
    accentColor: "#4caf7d",
    images: {
      hero: imagePath("tropical", "hero"),
      pillars: pillarImages("tropical"),
    },
  },
  {
    id: "coastal",
    name: "Coastal",
    description:
      "Bright and airy — turquoise water, island shorelines, sea cliffs and waterfront light.",
    accentColor: "#29c7c7",
    images: {
      hero: imagePath("coastal", "hero"),
      pillars: pillarImages("coastal"),
    },
  },
  {
    id: "golden",
    name: "Golden Savannah",
    description:
      "Warm golden-hour drama — savannah plains, red earth, wide skies and rural warmth.",
    accentColor: "#d4a853",
    images: {
      hero: imagePath("golden", "hero"),
      pillars: pillarImages("golden"),
    },
  },
  {
    id: "urban",
    name: "Urban Twilight",
    description:
      "Sophisticated dusk — city waterfronts, amber street light, navy skies and neighbourhood life.",
    accentColor: "#e8a847",
    images: {
      hero: imagePath("urban", "hero"),
      pillars: pillarImages("urban"),
    },
  },
];

export const ATMOSPHERE_IDS = ATMOSPHERE_SETS.map((s) => s.id);

/** Internal QA atmosphere IDs — not in public session rotation, never randomly picked. */
const INTERNAL_ATMOSPHERE_IDS = ["rambo"];

/**
 * All valid atmosphere IDs including internal QA sets.
 * Allows sessionStorage override: sessionStorage.setItem("rm-atm", "rambo")
 * activates the Rambo QA visual config without entering the public pool.
 */
export const ALL_ATMOSPHERE_IDS = [...ATMOSPHERE_IDS, ...INTERNAL_ATMOSPHERE_IDS];

/** Pick an atmosphere set ID for a given session key. */
export function pickAtmosphereId(sessionKey?: string): string {
  // PHASE A LOCK — rambo is the active atmosphere for all visitors.
  // To restore random rotation: remove this line and uncomment below.
  return "rambo";
  // if (sessionKey && ALL_ATMOSPHERE_IDS.includes(sessionKey)) return sessionKey;
  // const idx = Math.floor(Math.random() * ATMOSPHERE_SETS.length);
  // return ATMOSPHERE_SETS[idx]?.id ?? "golden";
}
