import { redirect } from "next/navigation";

// /hotel used to be the free "Analyse This Hotel" preview gate (see
// DECISIONS.md, "The Analyse This Hotel gate (2026-09-03)") - a deliberate
// pause before /search spent a StayingAPI credit. Under the four-page
// journey, that gate is folded directly into Check IQ itself (see
// src/app/check-iq/page.tsx's own module comment for the resolved open
// question this answers), so there's no separate free-preview step left to
// serve here. Kept as a redirect, not deleted outright, so any existing
// bookmark or shared link (SearchForm still posts here) still lands
// somewhere real rather than 404ing.
export const dynamic = "force-dynamic";

interface HotelRedirectProps {
  searchParams: Promise<{ hotel?: string; checkin?: string; checkout?: string; trip?: string }>;
}

export default async function HotelRedirect({ searchParams }: HotelRedirectProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.hotel) qs.set("hotel", params.hotel);
  if (params.checkin) qs.set("checkin", params.checkin);
  if (params.checkout) qs.set("checkout", params.checkout);
  if (params.trip) qs.set("trip", params.trip);
  redirect(`/check-iq${qs.toString() ? `?${qs.toString()}` : ""}`);
}
