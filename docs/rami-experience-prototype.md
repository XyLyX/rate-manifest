# RaMi experience world — option 1

Decision, 30 September 2026: travellers may describe any trip environment in free text. RaMi progressively customises the imagined world from their answers. Suggested answers must remain optional. This is separate from the five-theme homepage atmosphere, which rotates at intervals and responds to destination selection.

Prototype route: `/rami-prototype`. No homepage link, supplier integration, booking promise, or public discovery change.

## Connection

Set server-side `RAMI_PROTOTYPE_ENABLED=true`, a long random `RAMI_PROTOTYPE_TOKEN`, and `OPENAI_API_KEY`. Netlify AI Gateway can supply the provider key and `OPENAI_BASE_URL`; direct OpenAI uses its standard base URL. Never put these keys in NEXT_PUBLIC variables. Enter only the prototype token in the private page; it is held in memory.

Defaults: `RAMI_TEXT_MODEL=gpt-4.1-mini`, `RAMI_IMAGE_MODEL=gpt-image-1.5`. Both appear in Netlify's current supported-model list. Images use low quality, JPEG, 1536×1024. No new SDK or dependency. Verify gateway support for multipart image edits in a real deployment before relying on it.

Answers produce a complete scene, explicit trip wishes and one follow-up question. Visual changes automatically generate/edit scenery. Nonvisual changes need not render. Turning off automatic updates allows several answers before a manual render. Previous image is submitted for editing, preserving composition where possible. Last good scene survives failures. No synthetic fallback claims success. Client session caps: 12 answers and 12 renders; these are usability caps, not a durable global spend limit.

## Validation before release

Run a private live trial: snowy mountain → lakeside cabin/fireplace → couple → family → remove fireplace → tropical beach. Also test black-sand volcanic islands and mixed environments outside named themes. Record scene accuracy, unchanged-feature continuity, replacement correctness, latency, provider usage/cost, mobile readability and failure recovery. The code tests mock the provider; they do not establish visual quality, provider access or live latency.

Before public release add durable session quotas/rate limits, budget ceilings, image storage/jobs rather than large inline images, answer queuing, actual shared Trip State integration, and matching to verified supplier imagery. The current handler can exceed hosting request limits for slow image generations; a durable asynchronous job is required if live trial shows this. No public rollout until measured.

Sources: https://developers.openai.com/api/docs/guides/image-generation and https://docs.netlify.com/build/ai-gateway/overview/.


## Traveller journey

Travellers can correct any previous answer without adding another answer slot. Corrections rebuild the trip from the revised answer history, while image edits preserve the previous composition where possible. Failed description updates retain the original answers and the edit draft. A failed render retains the revised wishes and previous image.

The My trip view lists selected wishes and downloads a plain-text planning brief containing the answers and scene description, with no credentials or generated image. The immersive view hides the controls while keeping a return button. These wishes are not bookable products: verified inventory and itemised prices remain a separate integration before checkout.


## Save and resume

Save my trip explicitly saves the answers, wishes, unsent draft and scene-render count on the current browser/device. Resume saved trip restores them without calling an AI provider. Saving again replaces the previous saved trip; Start over clears the current journey but preserves the saved copy. Credentials and generated images are excluded. Restoring an image requires a new render and does not reset the existing scene allowance. Browser storage failures are reported, with the text-brief download as a fallback.


## Wish priorities

My trip lets the traveller explicitly mark each wish Essential or Flexible, with no inferred default. Choices appear in the downloaded brief and saved trip. When the AI revises wishes, only exact unchanged wishes retain their priorities; changed wishes need a fresh choice. Priorities do not remove amenities from the scene or imply verified availability.


## Source-backed options

My trip includes an explicit destination/date search. The private endpoint reads the existing curated catalogue only, excluding mock records and draft identities. It never queries StayingAPI or reopens public discovery. Catalogue results establish property identity, not amenities, room availability or price.

Viator results reuse the existing destination-search adapter with exact destination matching. Sandbox results are visibly labelled test data. Production results show supplier from-prices and timestamps without claiming party-specific availability. Text overlaps help order activities, but all wishes remain unconfirmed; there is no automatic booking, selection or payment. Source failures and empty catalogue coverage display honest empty states. Live integration testing remains blocked by prototype access.


## Shortlist

Only explicit traveller clicks add options: up to five stays and six experiences from the current results. Removing is reversible. New searches and changed destination, dates or wishes clear the current shortlist. The shortlist is held for this view only and can be downloaded as a separate text planning brief containing dates, source labels, indicative or sandbox prices, source timestamps and all unconfirmed wishes. The Save my trip action continues to save wishes only, not supplier selections. No rates are combined into a total, and selection does not reserve, book or pay.


## Saved shortlist copy

Save shortlist on this device preserves a dated plain-text copy independently of the active search and saved wishes. It remains accessible even before a trip is resumed and survives refresh, changed wishes and Start over. Saving again replaces the previous copy. The copy retains original source timestamps and sandbox labels and is never treated as refreshed availability or restored live selections. Credentials and generated image payloads are not included. Browser storage errors leave the active shortlist downloadable.


## Waiting and stopped updates

Trip understanding and scene rendering show elapsed seconds for the current step. Stop waiting aborts the browser request and prevents late responses from replacing the current scene or answers. Stopping before understanding finishes keeps the unfinished answer. Stopping after understanding succeeds keeps those updated wishes and the previous scene. Image preloading respects the same signal, and unmount aborts active updates. This does not promise cancellation of an already-running provider job or its cost.


## Ideas during the wait

While understanding or rendering runs, RaMi shows optional planning prompts using the traveller's actual answer text and wishes as context. More ideas browses additional prompts. Suggestions cover contextual moments plus food, culture, downtime, arrival and unrestricted personal additions; they do not select a preset scene, assert bookability, quote prices or make paid additions. Clicking only fills a separate editable next-answer draft. After the current update, Use in my next answer appends it to the ordinary input; only Tell RaMi submits it. Stop waiting and update errors keep the idea draft. Save my trip preserves it; old saved trips remain compatible.


## RaMi-led suggestion stream

The waiting experience now presents one experience idea at a time in RaMi's voice: While we're curating your plan, I'd like to suggest a few experiences you could add. Select queues the idea and immediately advances to another unselected suggestion. Not now skips. Suggestions advance automatically every ten seconds; Pause suggestions, hover and keyboard focus stop advancement so controls stay stable. Selected requests stay in the editable next-answer draft and do not repeat. No preset themes, invented products or automatic charges are introduced.


## Applying selected experiences

Add selected experiences to my plan submits the editable selection draft directly through the authenticated trip-understanding flow. The current update must finish before submitting. Accepted additions update wishes and, with automatic scenery enabled, the scene. Failed understanding or stopping before acceptance retains the pending draft. Further selections made during a batch remain pending. The unrelated ordinary answer draft is preserved. Downloaded trip briefs distinguish pending selections from accepted wishes.


## Scene continuity

Each successfully preloaded scene fades in over the previous visible image for 1.2 seconds. The new image has a fresh animation key on every successful render; the previous image stays as a background layer and is released after the transition. Reduced-motion preferences switch without animation. Failed/stopped renders do not touch the current image. Start over and restored drafts clear both layers. A scene-ready message appears only when the visible scene description matches the latest accepted wishes and no update is running.


## Suggestions during source search

RaMi's one-at-a-time suggestion stream now runs while catalogue and experience sources are searched, sharing the same selected-experience draft as scene generation. Source search shows elapsed time and supports Stop searching. Leaving the matching view aborts its request; late stopped responses cannot enter the results. Selected suggestions live in the parent trip view and survive the search finishing, failing, stopping or unmounting.


## Complete plan review

My trip now includes a single complete-plan download with accepted wishes and priorities, answers, imagined scenery and pending experience selections. Pending requests are explicitly separate from accepted wishes. A saved shortlist is excluded by default and can be included only through the traveller's checkbox; it retains its original timestamp and warns that it may refer to an earlier trip and has not been refreshed. The review states what remains to confirm before booking and never manufactures a reservation, verified amenity or total price.
