import type { ThingsToDoProduct } from "@/lib/viator/types";

// Renders the small, deliberate first version of the Things To Do
// vertical agreed with the user - see DECISIONS.md, "Decision: build a
// native Viator Things To Do integration." Unlike KlookTripSection, this
// is RateManifest's own card, built from data searchThingsToDo() already
// normalized - not a third-party widget/script, and not a plain "go to
// Viator" link with no real content of ours.
//
// Deliberately separate from KlookTripSection rather than merged into
// one "more to do" block: Klook is still link/widget-based (Level 1/2 -
// see DECISIONS.md's Klook research), while this is genuinely
// RateManifest-native data (Level 3), and the two shouldn't be visually
// conflated while they're at such different levels of integration.
// Nothing stops them sitting on the same page.
export function ThingsToDoSection({ products }: { products: ThingsToDoProduct[] }) {
  if (products.length === 0) return null;

  return (
    <div className="things-to-do-section">
      <div className="things-to-do-eyebrow">Things to do nearby</div>
      <p className="things-to-do-body">
        Real activities and tours from Viator, priced and rated live - not a static list.
      </p>
      <div className="things-to-do-grid">
        {products.map((product) => (
          <a
            key={product.supplierProductId}
            className="things-to-do-card"
            href={product.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- external Viator CDN image, no remotePatterns configured yet
              <img className="things-to-do-image" src={product.imageUrl} alt={product.title} loading="lazy" />
            ) : (
              <div className="things-to-do-image things-to-do-image--placeholder" aria-hidden="true" />
            )}
            <div className="things-to-do-card-body">
              <div className="things-to-do-title">{product.title}</div>
              {product.reviewCount > 0 && product.rating != null && (
                <div className="things-to-do-rating">
                  {product.rating.toFixed(1)} ★ ({product.reviewCount.toLocaleString("en-AE")})
                </div>
              )}
              <div className="things-to-do-price">
                From {product.currency} {Math.round(product.fromPrice).toLocaleString("en-AE")}
              </div>
            </div>
          </a>
        ))}
      </div>
      <p className="things-to-do-disclosure">
        Powered by Viator, a separate partner - booked and paid for on Viator, not through Rate Manifest.
      </p>
    </div>
  );
}
