import { redirect } from "next/navigation";

// /search was the credit-spending rate-intelligence page under the old
// two-step (/hotel -> /search) flow. Its content moved to /check-iq (Page
// 2 of the four-page journey - see that file's own module comment) as
// part of the 2026-09-05 customer-journey correction. Kept as a redirect
// rather than deleted, same reasoning as /hotel's own shim - any existing
// bookmark, shared link, or hardcoded href still lands on the real page.
export const dynamic = "force-dynamic";

interface SearchRedirectProps {
  searchParams: Promise<{ hotel?: string; checkin?: string; checkout?: string; trip?: string }>;
}

export default async function SearchRedirect({ searchParams }: SearchRedirectProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.hotel) qs.set("hotel", params.hotel);
  if (params.checkin) qs.set("checkin", params.checkin);
  if (params.checkout) qs.set("checkout", params.checkout);
  if (params.trip) qs.set("trip", params.trip);
  redirect(`/check-iq${qs.toString() ? `?${qs.toString()}` : ""}`);
}
