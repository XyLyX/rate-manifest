import { redirect } from "next/navigation";

// Permanent Hotels tower entry route.
//
// The working Hotels discovery experience currently lives on the Rate
// Manifest homepage. Keep this route as a thin bridge until /hotels becomes
// its own indexable tower landing page. Do not duplicate the homepage
// discovery implementation here.
export default function HotelsPage() {
  redirect("/?mode=hotels");
}
