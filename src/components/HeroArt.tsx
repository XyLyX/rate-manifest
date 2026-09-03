// Stylized skyline illustration for the homepage hero - not a stock photo
// of any specific building. The mockup's hero used a real photograph of
// the Dubai skyline (Burj Khalifa + a lagoon); no licensed photography of
// that kind was available to ship here, and a generated "photorealistic"
// image claiming to depict a specific real landmark carries its own
// misrepresentation risk once it's on a live commercial site. This is the
// honest substitute: an abstract, brand-colored skyline (a tapering
// tallest tower plus a cluster of others, water, a sun) that reads as
// "Gulf coastline at golden hour" without claiming to be a photo of any
// real place. Pure SVG, no external asset - inlined so it themes with the
// site's own --primary/--positive tokens rather than a static image file.
export function HeroArt() {
  return (
    <svg
      viewBox="0 0 720 640"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="hero-art"
      role="img"
      aria-label="Stylized illustration of a coastal skyline at golden hour"
    >
      <defs>
        <linearGradient id="heroSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eef2ff" />
          <stop offset="55%" stopColor="#fde8d7" />
          <stop offset="100%" stopColor="#fff5ec" />
        </linearGradient>
        <linearGradient id="heroWater" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd3d8" />
          <stop offset="100%" stopColor="#bfeaea" />
        </linearGradient>
        <linearGradient id="heroTower" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5146e5" />
          <stop offset="100%" stopColor="#635bff" />
        </linearGradient>
        <radialGradient id="heroSun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff2df" />
          <stop offset="100%" stopColor="#fbbf6a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="720" height="640" fill="url(#heroSky)" />
      <circle cx="560" cy="180" r="150" fill="url(#heroSun)" />
      <circle cx="560" cy="180" r="46" fill="#ffd9a0" />

      <rect x="0" y="430" width="720" height="210" fill="url(#heroWater)" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={40 + i * 140} y={452 + (i % 2) * 10} width="90" height="4" rx="2" fill="#ffffff" opacity="0.35" />
      ))}

      {/* Skyline cluster - one tapering tallest tower plus supporting buildings, all in the brand's primary/positive palette rather than literal architecture. */}
      <rect x="120" y="300" width="34" height="140" fill="url(#heroTower)" opacity="0.85" />
      <rect x="168" y="340" width="26" height="100" fill="url(#heroTower)" opacity="0.7" />
      <rect x="470" y="320" width="30" height="120" fill="url(#heroTower)" opacity="0.75" />
      <rect x="512" y="360" width="22" height="80" fill="url(#heroTower)" opacity="0.6" />

      <polygon points="330,120 356,430 304,430" fill="url(#heroTower)" />
      <rect x="322" y="90" width="16" height="34" fill="#5146e5" />
      <circle cx="330" cy="82" r="5" fill="#10b981" />

      <rect x="360" y="360" width="28" height="80" fill="url(#heroTower)" opacity="0.65" />
      <rect x="270" y="380" width="24" height="60" fill="url(#heroTower)" opacity="0.55" />
    </svg>
  );
}
