import { redirect } from "next/navigation";

// Permanent Hotels + Flights combined-product entry route.
//
// The current combined-product state already exists on the Rate Manifest
// homepage. Keep this route as a thin bridge until /hotels-flights becomes
// its own product experience. Do not duplicate homepage implementation here.
export default function HotelsFlightsPage() {
  redirect("/?mode=combined");
}