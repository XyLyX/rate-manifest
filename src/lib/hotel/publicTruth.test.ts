// Final public-truth checks: the property page's Check IQ entry passes the
// existing authorization gate, and the legal/methodology pages describe the
// CURRENT service truthfully. Static source checks only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
// JSX text with source line wraps collapsed to single spaces
const flat = (rel: string) => code(rel).replace(/\s+/g, " ");

test("property page CTA -> authorized Check IQ: the GET form carries the existing authorized=1 signal and passes the unchanged gate", () => {
  const page = code("app/hotel/[hotelId]/page.tsx");
  const form = page.slice(page.indexOf('<form action="/check-iq" method="get">'), page.indexOf("</form>"));
  assert.ok(form.length > 0, "form to /check-iq present");
  assert.match(form, /name="hotel" value=\{hotelId\}/);
  assert.match(form, /name="authorized" value="1"/);
  assert.match(form, /name="checkin"/);
  assert.match(form, /name="checkout"/);

  // What the browser submits for that form (hidden + date inputs), then the page's own gate predicate
  const submitted = new URLSearchParams({ hotel: "sofitel-dubai-the-palm", authorized: "1", checkin: "2026-11-02", checkout: "2026-11-06" });
  assert.equal(submitted.get("authorized") !== "1", false); // gate passes -> no redirect to Compare
  const withoutSignal = new URLSearchParams({ hotel: "x", checkin: "2026-11-02", checkout: "2026-11-06" });
  assert.equal(withoutSignal.get("authorized") !== "1", true); // a fresh entry is still redirected

  // The Check IQ gate itself is unchanged and is the only mechanism (no second authorization scheme)
  const checkIq = code("app/check-iq/page.tsx");
  assert.match(checkIq, /if \(authorized !== "1"\) \{[\s\S]*?redirect\(compareUrl\);[\s\S]*?\}/);
  assert.match(checkIq, /const authorized = params\.authorized;/);
  assert.match(page, /Continue to Check IQ →/);
});

test("privacy and terms describe the current service: no claim that Rate Manifest compares or shows hotel rates", () => {
  const privacy = flat("app/privacy/page.tsx");
  assert.ok(!/compare rates|understand what the numbers mean/i.test(privacy));
  assert.match(privacy, /It helps you shortlist and compare hotels and make better-informed travel decisions\./);
  assert.match(privacy, /does not process bookings, payments, or cancellations/); // legal meaning intact

  const terms = flat("app/terms/page.tsx");
  assert.ok(!/compare rates|understand rate data/i.test(terms));
  assert.match(terms, /shortlist and compare hotels and make better-informed travel decisions before you decide where to book\./);
  assert.match(terms, /Rate Manifest does not currently show hotel rates\. Any rate information shown, now or in future, is informational and is sourced from third parties\./);
  assert.match(terms, /Rate Manifest is not a booking platform\./); // legal meaning intact
  assert.match(terms, /does not guarantee that any rate will be available/);
});

test("methodology keeps its qualification and describes the method as intended, not current", () => {
  const m = flat("app/methodology/page.tsx");
  assert.match(m, /Rate verification is currently unavailable\. This page describes the intended method\./);
  assert.match(m, /Rate Manifest is designed to do more than display hotel rates\. It is intended to bring offers together/);
  assert.match(m, /discovers properties \(and, in the intended method, offers\)/);
  assert.match(m, /In the intended method, Rate Manifest normalizes offers/);
  assert.match(m, /In the intended method, selected rates can be checked against live source data\. Live verification would be a separate, explicit action/);
  assert.match(m, /This is currently unavailable\./);
  assert.match(m, /In the intended method, for each set of offers/);
  assert.match(m, /In the intended method, the output isn&apos;t &quot;this is the cheapest rate.&quot; It&apos;s which option makes the most sense/);
  assert.match(m, /In the intended method, every live check contributes an observation to Rate Memory\./);
  assert.ok(!/which available/.test(m));
  assert.ok(!/Rate Manifest does more than display hotel rates/.test(m));
});
