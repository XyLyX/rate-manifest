"use client";

import { useEffect, useState } from "react";

type AtmosphereKind = "neutral" | "dubai" | "beach";

interface HeroAtmosphereProps {
  destination?: string;
}

function resolveAtmosphere(destination: string): AtmosphereKind {
  const value = destination.trim().toLowerCase();

  if (!value) return "neutral";

  if (
    value === "dubai" ||
    value === "uae" ||
    value === "united arab emirates" ||
    value === "abu dhabi"
  ) {
    return "dubai";
  }

  if (
    value.includes("maldives") ||
    value.includes("bali") ||
    value.includes("fujairah") ||
    value.includes("beach") ||
    value.includes("island") ||
    value.includes("coast") ||
    value.includes("coastal")
  ) {
    return "beach";
  }

  return "neutral";
}

export function HeroAtmosphere({
  destination = "",
}: HeroAtmosphereProps) {
  const [kind, setKind] = useState<AtmosphereKind>(() =>
    resolveAtmosphere(destination)
  );

  useEffect(() => {
    setKind(resolveAtmosphere(destination));
  }, [destination]);

  return (
    <div
      className={`hero-atmosphere hero-atmosphere--${kind}`}
      aria-hidden="true"
    >
      <svg
        className="hero-atmosphere-svg"
        viewBox="0 0 1440 560"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Neutral premium travel atmosphere */}
          <linearGradient
            id="atmo-neutral-sky"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor="#dfe5ff" />
            <stop offset="55%" stopColor="#eef1ff" />
            <stop offset="100%" stopColor="#f8f9ff" />
          </linearGradient>

          {/* Dubai / warm-city atmosphere */}
          <linearGradient
            id="atmo-dubai-sky"
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <stop offset="0%" stopColor="#dce4ff" />
            <stop offset="45%" stopColor="#f1dccb" />
            <stop offset="100%" stopColor="#fff1df" />
          </linearGradient>

          {/* Beach / coastal atmosphere */}
          <linearGradient
            id="atmo-beach-sky"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor="#d8eff7" />
            <stop offset="48%" stopColor="#d9f1ed" />
            <stop offset="100%" stopColor="#f1faf7" />
          </linearGradient>

          <radialGradient id="atmo-neutral-light">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="atmo-warm-light">
            <stop offset="0%" stopColor="#ffdba6" stopOpacity="0.62" />
            <stop offset="48%" stopColor="#ffc982" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#ffc982" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="atmo-beach-light">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.72" />
            <stop offset="45%" stopColor="#b9eee7" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#9de0d7" stopOpacity="0" />
          </radialGradient>

          <linearGradient
            id="atmo-soft-band"
            x1="0"
            y1="0"
            x2="1"
            y2="0"
          >
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="35%" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="70%" stopColor="#ffffff" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          <linearGradient
            id="atmo-dubai-depth"
            x1="0"
            y1="0"
            x2="1"
            y2="0"
          >
            <stop offset="0%" stopColor="#cbd6ff" stopOpacity="0" />
            <stop offset="48%" stopColor="#e9d9cf" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#ffd7aa" stopOpacity="0" />
          </linearGradient>

          <linearGradient
            id="atmo-beach-depth"
            x1="0"
            y1="0"
            x2="1"
            y2="0"
          >
            <stop offset="0%" stopColor="#a9dfd9" stopOpacity="0" />
            <stop offset="45%" stopColor="#bcece5" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#d9f4ef" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* ================================================================
            BASE
            ================================================================ */}

        <rect
          className="atmo-base atmo-base--neutral"
          width="1440"
          height="560"
          fill="url(#atmo-neutral-sky)"
        />

        <rect
          className="atmo-base atmo-base--dubai"
          width="1440"
          height="560"
          fill="url(#atmo-dubai-sky)"
        />

        <rect
          className="atmo-base atmo-base--beach"
          width="1440"
          height="560"
          fill="url(#atmo-beach-sky)"
        />

        {/* ================================================================
            PRIMARY LIGHT FIELD
            ================================================================ */}

        <ellipse
          className="atmosphere-light atmosphere-light--neutral"
          cx="1080"
          cy="120"
          rx="410"
          ry="300"
          fill="url(#atmo-neutral-light)"
        />

        <ellipse
          className="atmosphere-light atmosphere-light--dubai"
          cx="1110"
          cy="125"
          rx="350"
          ry="300"
          fill="url(#atmo-warm-light)"
        />

        <ellipse
          className="atmosphere-light atmosphere-light--beach"
          cx="1080"
          cy="125"
          rx="390"
          ry="300"
          fill="url(#atmo-beach-light)"
        />

        {/* ================================================================
            MOVING ATMOSPHERIC DEPTH
            ================================================================ */}

        <rect
          className="atmosphere-depth atmosphere-depth--one"
          x="-160"
          y="190"
          width="1760"
          height="180"
          fill="url(#atmo-soft-band)"
        />

        <rect
          className="atmosphere-depth atmosphere-depth--two"
          x="-200"
          y="275"
          width="1840"
          height="150"
          fill="url(#atmo-soft-band)"
        />

        <rect
          className="atmosphere-depth atmosphere-depth--dubai"
          x="-150"
          y="250"
          width="1740"
          height="150"
          fill="url(#atmo-dubai-depth)"
        />

        <rect
          className="atmosphere-depth atmosphere-depth--beach"
          x="-150"
          y="265"
          width="1740"
          height="145"
          fill="url(#atmo-beach-depth)"
        />

        {/* ================================================================
            DUBAI — ABSTRACT CITY DEPTH
            No landmark. No Burj Khalifa illustration.
            ================================================================ */}

        <g className="atmosphere-dubai-shapes">
          <rect x="850" y="300" width="34" height="90" rx="2" />
          <rect x="892" y="275" width="22" height="115" rx="2" />
          <rect x="922" y="315" width="48" height="75" rx="2" />
          <rect x="978" y="290" width="30" height="100" rx="2" />
          <rect x="1018" y="325" width="58" height="65" rx="2" />
          <rect x="1088" y="305" width="38" height="85" rx="2" />
          <rect x="1138" y="285" width="26" height="105" rx="2" />
          <rect x="1176" y="315" width="52" height="75" rx="2" />
        </g>

        {/* ================================================================
            BEACH — ABSTRACT HORIZON / WATER MOTION
            ================================================================ */}

        <g className="atmosphere-beach-waves">
          <path d="M-80 382 C180 348 360 414 620 382 C860 352 1080 410 1520 372" />
          <path d="M-80 408 C190 374 390 438 650 404 C900 372 1110 430 1520 396" />
          <path d="M-80 434 C180 402 380 462 650 430 C930 398 1160 452 1520 422" />
        </g>

        {/* ================================================================
            SUBTLE PARTICLES
            ================================================================ */}

        <g className="atmosphere-particles">
          <circle cx="210" cy="130" r="1.4" />
          <circle cx="370" cy="92" r="1" />
          <circle cx="540" cy="165" r="1.3" />
          <circle cx="730" cy="112" r="1" />
          <circle cx="875" cy="175" r="1.5" />
          <circle cx="1040" cy="78" r="1" />
          <circle cx="1210" cy="150" r="1.4" />
          <circle cx="1320" cy="105" r="1" />
        </g>

        {/* ================================================================
            SOFT FOREGROUND DEPTH
            ================================================================ */}

        <path
          className="atmosphere-horizon"
          d="M-40 430 C260 395 470 445 720 420 C980 394 1200 445 1480 410 L1480 600 L-40 600 Z"
        />
      </svg>
    </div>
  );
}