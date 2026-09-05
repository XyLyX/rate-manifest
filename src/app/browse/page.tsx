import { redirect } from "next/navigation";

// /browse used to be a full city-by-city hotel listing (StayingAPI-cache
// data first, then, after the 2026-09-05 correction, name/area/star only)
// reachable via a "View all hotels" link on the homepage. Retired the same
// day, same reasoning as /hotel and /search's own redirect shims: a
// browse-everything surface with no search behind it is exactly the "you
// are not checking at this stage" / "results relevant to the customer's
// search" problem Navin flagged - Page 1's own Top Hotels shortlist is now
// the only hotel-discovery surface in the app, and it only ever shows
// anything once DiscoverForm has actually been submitted (see
// src/app/page.tsx's own comment). Kept as a redirect rather than deleted
// so an existing bookmark or shared /browse link still lands somewhere
// real instead of 404ing.
export const dynamic = "force-dynamic";

export default function BrowseRedirect() {
  redirect("/");
}
