// StayingAPI quarantine: an enforceable import/dependency boundary.
//
// ACTIVE customer-journey code (Discover, Compare, Check IQ, Complete Your
// Trip, Confirm, the active trip actions/components they use, and every route
// handler) must never reach the preserved-but-dormant StayingAPI/legacy
// priced-rate implementation, directly or transitively. Quarantined files may
// reference one another. If this test fails, someone reconnected StayingAPI.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";

const SRC = join(__dirname, "..", "..").split("\\").join("/");

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = `${dir}/${n}`;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const ALL = walk(SRC).filter((f) => !/\.test\.ts$/.test(f));
const rel = (f: string) => f.slice(SRC.length + 1);
const codeOf = (f: string) => stripComments(readFileSync(f, "utf8"));

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = `${SRC}/${spec.slice(2)}`;
  else if (spec.startsWith(".")) base = posix.join(posix.dirname(from), spec);
  else return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base]) if (ALL.includes(c)) return c;
  return null;
}

const IMPORT_RE = /(?:import|export)[^'"]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;
const TYPE_ONLY_RE = /(?:import|export)\s+type\s+[^;]*?from\s+["'][^"']+["'];?/g;
const DEPS = new Map<string, string[]>();
for (const f of ALL) {
  const deps: string[] = [];
  // Type-only imports are erased at compile time: not a runtime dependency.
  const runtimeCode = codeOf(f).replace(TYPE_ONLY_RE, "");
  for (const m of runtimeCode.matchAll(IMPORT_RE)) {
    const r = resolveImport(f, m[1] ?? m[2] ?? m[3] ?? "");
    if (r) deps.push(r);
  }
  DEPS.set(f, deps);
}

function reachable(entries: string[]): Set<string> {
  const seen = new Set<string>(entries);
  const stack = [...entries];
  while (stack.length) {
    for (const d of DEPS.get(stack.pop() as string) ?? []) if (!seen.has(d)) (seen.add(d), stack.push(d));
  }
  return seen;
}

// Preserved, dormant, QUARANTINED implementation (may reference each other).
const QUARANTINED = (f: string) => {
  const r = rel(f);
  return (
    r.startsWith("lib/suppliers/") || // StayingAPI adapter/client/cache/refresh + legacy mock/travelpayouts adapters + registry
    r === "lib/search.ts" || // runSearch: executes SUPPLIER_ADAPTERS
    r === "lib/browse.ts" ||
    r === "app/actions/legacyPricedSelection.ts" || // legacy seller-priced selectDeal
    /^components\/(ResultsList|VerifiedRatePanel|LiveCheckStatus|RateManifestVerdict|RateSnapshotPanel|WhyThisDealPanel|BeforeYouBookPanel|PriceInsightPanel)\.tsx$/.test(r)
  );
};

// Identifiers that mean "StayingAPI execution or its cache/derived offers".
const FORBIDDEN = /stayingApi|staying_api|SUPPLIER_ADAPTERS|OTA_TO_SUPPLIER|runSearch|ensureLiveCheckTriggered|pollLiveCheck|submitStayingApiJob|pollStayingApiJob/;

// Every app entry point except tests: pages, layouts, route handlers.
const APP_ENTRIES = ALL.filter((f) => /^app\/.*(page|layout|route)\.tsx?$/.test(rel(f)) || rel(f) === "proxy.ts");
const JOURNEY = ["app/page.tsx", "app/compare/page.tsx", "app/check-iq/page.tsx", "app/complete-your-trip/page.tsx", "app/confirm/page.tsx", "app/layout.tsx", "app/actions/trip.ts"].map((r) => `${SRC}/${r}`);

// The schema definition and the init-db DDL legitimately mention the preserved
// staying_api_cache table; for those two files only EXECUTION references count.
const DDL_ONLY = (f: string) => ["db/schema.ts", "app/api/admin/init-db/route.ts"].includes(rel(f));
const EXECUTION = /\.stayingApiCache|stayingApiAdapter|stayingApiRefresh|SUPPLIER_ADAPTERS|runSearch|ensureLiveCheckTriggered|pollLiveCheck/;

function violations(entries: string[]): string[] {
  const out: string[] = [];
  for (const f of reachable(entries)) {
    if (QUARANTINED(f)) out.push(`${rel(f)} (quarantined file is reachable)`);
    else if (DDL_ONLY(f)) {
      // SQL comment lines ("-- ...") inside the DDL template are prose, not execution.
      const sql = codeOf(f).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
      if (EXECUTION.test(sql)) out.push(`${rel(f)} (references StayingAPI execution)`);
    } else if (FORBIDDEN.test(codeOf(f))) out.push(`${rel(f)} (references StayingAPI execution)`);
  }
  return out.sort();
}

test("boundary detector works (synthetic cases)", () => {
  assert.ok(FORBIDDEN.test("await ensureLiveCheckTriggered(id)"));
  assert.ok(FORBIDDEN.test("db.query.stayingApiCache.findFirst()"));
  assert.ok(FORBIDDEN.test("SUPPLIER_ADAPTERS.map"));
  assert.ok(!FORBIDDEN.test("const hotel = await getHotel()"));
  assert.ok(QUARANTINED(`${SRC}/lib/suppliers/stayingApiAdapter.ts`));
  assert.ok(!QUARANTINED(`${SRC}/lib/hotel/commercial.ts`));
});

test("Discover, Compare, Check IQ, Complete Your Trip, Confirm and the active trip actions never reach quarantined StayingAPI/legacy code", () => {
  for (const entry of JOURNEY) {
    assert.ok(ALL.includes(entry), `${rel(entry)} exists`);
    assert.deepEqual(violations([entry]), [], `${rel(entry)} reaches quarantined code`);
  }
});

test("no app page, layout or route handler (including admin and API routes) reaches quarantined StayingAPI/legacy code", () => {
  assert.ok(APP_ENTRIES.length > 10);
  assert.deepEqual(violations(APP_ENTRIES), []);
});

test("quarantined StayingAPI code is preserved, not deleted", () => {
  for (const r of [
    "lib/suppliers/stayingApiAdapter.ts",
    "lib/suppliers/stayingApiRefresh.ts",
    "lib/suppliers/types.ts",
    "lib/suppliers/index.ts",
    "lib/search.ts",
    "components/ResultsList.tsx",
    "app/actions/legacyPricedSelection.ts",
  ]) {
    assert.ok(ALL.includes(`${SRC}/${r}`), `${r} must still exist`);
  }
  assert.match(readFileSync(`${SRC}/db/schema.ts`, "utf8"), /export const stayingApiCache = pgTable/);
});

test("quarantined route handlers are explicitly disabled (410) and do not import the implementation", () => {
  for (const r of ["app/api/live-check-status/route.ts", "app/api/admin/refresh-staying-api/route.ts", "app/api/admin/collect-staying-api-jobs/route.ts"]) {
    const code = codeOf(`${SRC}/${r}`);
    assert.match(code, /status:\s*410/, `${r} returns 410`);
    assert.ok(!FORBIDDEN.test(code), `${r} must not reference StayingAPI execution`);
  }
});

test("the legacy adapter registry no longer runs from any active path, and StayingAPI is registered only inside quarantine", () => {
  const adapterFile = `${SRC}/lib/suppliers/stayingApiAdapter.ts`;
  const registrants = ALL.filter((f) => (DEPS.get(f) ?? []).includes(adapterFile));
  assert.deepEqual(registrants.map(rel).sort(), ["lib/suppliers/index.ts"]);
  const callers = ALL.filter((f) => /SUPPLIER_ADAPTERS/.test(codeOf(f)) && !QUARANTINED(f));
  assert.deepEqual(callers.map(rel), []);
});

test("no environment credential is read by active code for StayingAPI", () => {
  for (const f of reachable(APP_ENTRIES)) {
    if (QUARANTINED(f)) continue;
    assert.ok(!/STAYINGAPI_KEY|REFRESH_STAYINGAPI_SECRET/.test(codeOf(f)), `${rel(f)} reads a StayingAPI credential`);
  }
});

void statSync;
