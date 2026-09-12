import { HTMLRewriter } from "https://ghuc.cc/worker-tools/html-rewriter/index.ts";

// Cuelinks site-verification <meta> tag - ratemanifest.in ONLY.
//
// ratemanifest.com and ratemanifest.in are the same Next.js deployment
// (same Netlify site, ratemanifest.in added as a domain alias 2026-09-12 -
// see claude/status.md, "ratemanifest.in - second domain, Cuelinks
// verification tag"). Cuelinks needs this tag in <head> for .in only; it
// must never appear on .com.
//
// This runs at the edge, before Next.js, instead of a Host-based check in
// src/app/layout.tsx. Reading the Host header there (via next/headers)
// would force the ENTIRE app into per-request dynamic rendering, breaking
// /exceptional-stays's deliberate build-time static prerendering (see that
// page's own header comment: "Public, crawlable, static-ish") as a side
// effect of an unrelated verification tag. An edge function is a complete
// no-op for every other host - Next.js's rendering is untouched either way.
const CUELINKS_HOSTS = new Set(["ratemanifest.in", "www.ratemanifest.in"]);
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
