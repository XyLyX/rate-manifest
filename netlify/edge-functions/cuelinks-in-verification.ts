import { HTMLRewriter } from "https://ghuc.cc/worker-tools/html-rewriter/index.ts";

// Cuelinks site-verification <meta> tag.
//
// File named for its original scope (ratemanifest.in only, added
// 2026-09-12) - kept as-is rather than renamed for this follow-up change.
// UPDATE 2026-09-12: Navin's Cuelinks application was actually submitted
// under ratemanifest.com, so the tag needs to render on BOTH domains now -
// ratemanifest.com and ratemanifest.in (each with and without "www"), all
// four served by this same Netlify site/deployment. No longer ".in only" -
// see claude/status.md, "ratemanifest.in - second domain, Cuelinks
// verification tag" for the full history.
//
// This runs at the edge, before Next.js, instead of a Host-based check in
// src/app/layout.tsx. Reading the Host header there (via next/headers)
// would force the ENTIRE app into per-request dynamic rendering, breaking
// /exceptional-stays's deliberate build-time static prerendering (see that
// page's own header comment: "Public, crawlable, static-ish") as a side
// effect of an unrelated verification tag. An edge function is a complete
// no-op for every other host - Next.js's rendering is untouched either way
// (there is no other host left to worry about today, but this still keeps
// the tag from silently attaching itself to some future third domain on
// this same deployment).
const CUELINKS_HOSTS = new Set([
  "ratemanifest.com",
  "www.ratemanifest.com",
  "ratemanifest.in",
  "www.ratemanifest.in",
]);
const CUELINKS_META_TAG =
  '<meta name="cuelinks-verification" content="VERIFY-CL-OXLX8IJT" />';

interface EdgeContext {
  next: () => Promise<Response>;
}

export default async (request: Request, context: EdgeContext): Promise<Response> => {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const response = await context.next();

  if (!CUELINKS_HOSTS.has(host)) return response;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  return new HTMLRewriter()
    .on("head", {
      element(element: { append: (content: string, options?: { html?: boolean }) => void }) {
        element.append(CUELINKS_META_TAG, { html: true });
      },
    })
    .transform(response);
};

export const config = { path: "/*" };
