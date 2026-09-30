# Rate Manifest — approved photo sourcing shortlist (2026-09-22)

Six individually identified **free** Unsplash photographs, not Unsplash+ or search-result thumbnails. Download each from its original photo page, optimise to local WebP (target ~1600px wide for article hero and ~900px for card, maintain aspect ratio), store under `public/images/editorial/`, and record the photographer and source URL. Do not hotlink a photo-page URL as an image or publish a location-mismatched placeholder. Unsplash's ordinary licence permits commercial use; attribution is appreciated. If a selected image cannot be downloaded or visually verified, keep the existing placeholder and flag it rather than substituting an unrelated image.

| Slug | Destination | Source photo | Photographer | Suggested local filename | Descriptive alt text |
|---|---|---|---|---|---|
| dubai-beyond-the-landmarks | Dubai Creek, UAE | https://unsplash.com/photos/brown-concrete-building-beside-body-of-water-during-daytime-UM7Xm7wtJOw | Sean Wang | dubai-creek.webp | Buildings beside Dubai Creek waterfront |
| indian-himalayas-choosing-your-base | Manali, Himachal Pradesh, India | https://unsplash.com/photos/a-landscape-with-trees-and-mountains-meFUXRRSYi8 | swarnika arey | manali-himalayas.webp | Green hillside and mountains in Manali, Himachal Pradesh |
| singapore-three-days-where-to-stay | Marina Bay, Singapore | https://unsplash.com/photos/a-birds-eye-view-of-the-gardens-by-the-bay-CQXR_VLC4MU | Zion C | singapore-marina-bay.webp | Aerial view of Gardens by the Bay and Singapore skyline |
| amalfi-coast-sea-views-or-easy-transport | Positano, Italy | https://unsplash.com/photos/positano-village-on-amalfi-coast-PkWac9CLWVA | Sebastian Leonhardt | positano-amalfi-coast.webp | Illuminated hillside village of Positano on the Amalfi Coast at dusk |
| bali-ubud-or-uluwatu | Tegallalang, Bali, Indonesia | https://unsplash.com/photos/rice-terraces-in-tegelalang-bali--2WlTWZLnRc | Niklas Weiss | bali-tegallalang.webp | Lush green rice terraces and palms in Tegallalang near Ubud, Bali |
| swiss-alps-choosing-your-base | Lauterbrunnen, Switzerland | https://unsplash.com/photos/swiss-houses-in-lauterbrunnen-valley-tbSpLm6XqS4 | Ed Wingate | swiss-lauterbrunnen.webp | Swiss houses in the green Lauterbrunnen valley |

## Implementation checklist

1. Verify each photo page says **Free to use under the Unsplash License**, and confirm the photo depicts the named destination. Do not use Unsplash+ or Getty results.
2. Download originals, optimise and store locally; do not commit original multi-megabyte downloads. Keep image quality suitable for hero and card use, avoid visible watermarks.
3. Replace all six `image` and `imageAlt` values in `src/lib/editorial/articles.ts`. Add optional photographer/source metadata if needed for a discreet credit beneath article images. Remove the misleading blanket `Illustrative imagery` note only when every published article has an accurately described photo.
4. Keep the initial homepage Destination Guides order Dubai → Indian Himalayas → Bali, visibly contrasting waterfront, mountains and tropical greenery. Preserve all three tabs and existing closing hero.
5. Verify all six article pages, the index, and responsive card cropping. Run `npx tsc --noEmit` and `npm run build` before merging/deploying.

Source licence: https://unsplash.com/license . Ordinary Unsplash download is permitted for commercial websites, subject to third-party rights. Prefer photographer attribution even where not legally required.
