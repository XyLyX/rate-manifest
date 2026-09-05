import type { ThingsToDoProduct } from "@/lib/viator/types";
import { addTripExperience, removeTripExperience } from "@/app/actions/trip";

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
//
// "Add to My Trip" (2026-09-05, Page 3 of the four-page journey - see
// claude/travel-decision-platform-assessment.md) - only rendered when a
// tripId is passed in (this component still degrades to a plain
// browse-and-click card grid, its original behavior, when it isn't - e.g.
// nowhere else in the app calls it with one yet). Each card's booking link
// still works exactly as before (Viator's own pre-attributed URL, opened
// directly); the add button is a second, independent action alongside it,
// not a replacement - "add to my trip" and "go look at it on Viator" are
// both reasonable things to want to do with the same card.
export function ThingsToDoSection({
  products,
  tripId,
  addedProductIds,
}: {
  products: ThingsToDoProduct[];
  tripId?: string;
  // supplierProductIds already on this trip (src/lib/trip.ts's
  // getTripExperiences()) - lets each card show "Added ✓ / Remove"
  // instead of "Add to My Trip" without a client-side round trip.
  addedProductIds?: Set<string>;
}) {
  if (products.length === 0) return null;

  return (
    <div className="things-to-do-section">
      <div className="things-to-do-eyebrow">Things to do nearby</div>
      <p className="things-to-do-body">
        Real activities and tours from Viator, priced and rated live - not a static list.
      </p>
      <div className="things-to-do-grid">
        {products.map((product) => {
          const added = addedProductIds?.has(product.supplierProductId) ?? false;
          return (
            <div key={product.supplierProductId} className="things-to-do-card">
              <a href={product.bookingUrl} target="_blank" rel="noopener noreferrer" className="things-to-do-card-link">
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
              {tripId && (
                <form action={added ? removeTripExperience : addTripExperience} className="things-to-do-add-form">
                  <input type="hidden" name="tripId" value={tripId} />
                  <input type="hidden" name="supplierSlug" value={product.supplierSlug} />
                  <input type="hidden" name="supplierProductId" value={product.supplierProductId} />
                  <input type="hidden" name="title" value={product.title} />
                  <input type="hidden" name="imageUrl" value={product.imageUrl ?? ""} />
                  <input type="hidden" name="price" value={product.fromPrice} />
                  <input type="hidden" name="currency" value={product.currency} />
                  <input type="hidden" name="bookingUrl" value={product.bookingUrl} />
                  <button type="submit" className={added ? "btn btn-ghost things-to-do-add-btn added" : "btn things-to-do-add-btn"}>
                    {added ? "Added ✓ — remove" : "+ Add to My Trip"}
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
      <p className="things-to-do-disclosure">
        Powered by Viator, a separate partner - booked and paid for on Viator, not through Rate Manifest.
      </p>
    </div>
  );
}
