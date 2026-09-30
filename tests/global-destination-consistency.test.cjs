const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

// Execute the actual page/component with a closed dependency allowlist.
// No Next server, database, research service or real server action is loaded.
function load(relative, dependencies) {
  const filename = join(__dirname, "..", relative);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(id) {
      if (id === "react" || id === "react/jsx-runtime") return require(id);
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      throw new Error(`Unexpected dependency: ${id}`);
    },
  });
  return exports;
}

const unexpectedAction = () => { throw new Error("Server actions must not run during rendering"); };
const { DiscoverForm } = load("src/components/DiscoverForm.tsx", {
  "@/app/actions/trip": { createTrip: unexpectedAction },
  "@/app/actions/destinationInterest": { recordDestinationInterest: unexpectedAction },
  "@/lib/constants": { TRIP_PURPOSES: [] },
});
const copy = "Hotel comparisons are coming soon. Get notified when they&#x27;re available.";

function descendants(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(descendants)];
}

async function search(destination, id = "trip-1") {
  const intelligenceCalls = [];
  const trip = destination === null ? null : {
    id, destination, checkIn: "2026-10-10", checkOut: "2026-10-12",
  };
  const noop = () => null;
  const dependencies = {
    "next/link": noop,
    "@/db/client": {
      schema: { hotels: { city: "city" } },
      db: { select: () => ({ from: async () => [{ city: "Abu Dhabi" }] }) },
    },
    "@/lib/trip": { getTrip: async () => trip },
    "@/lib/discovery": { activeDiscoverySource: { search: unexpectedAction } },
    "@/lib/travel/destinationResearch": {
      getDestinationPillarsLive: async (value) => {
        intelligenceCalls.push(value);
        return { cards: [] };
      },
    },
    "@/components/DiscoverForm": { DiscoverForm },
    "@/components/TrustIcons": { IconBolt: noop, IconShieldCheck: noop, IconLink: noop },
  };
  for (const name of ["HotelSelectionGrid", "NavBar", "Footer", "TravelIntelligence", "AtmosphereProvider"]) {
    dependencies[`@/components/${name}`] = { [name]: noop };
  }
  const { default: HomePage } = load("src/app/page.tsx", dependencies);
  const tree = await HomePage({ searchParams: Promise.resolve(trip ? { trip: id } : {}) });
  const form = descendants(tree).find((node) => node.type === DiscoverForm);
  assert.ok(form);
  return { form, intelligenceCalls, html: renderToStaticMarkup(form) };
}

for (const destination of ["Abu Dhabi", "Delhi"]) {
  test(`${destination}: completed search offers notification and intelligence without catalogue suggestions`, async () => {
    const { form, html, intelligenceCalls } = await search(destination);
    assert.equal(form.props.showHotelNotification, true);
    assert.equal(form.props.cities.length, 0);
    assert.equal(form.props.defaultDestination, destination);
    assert.ok(html.includes(copy));
    assert.ok(!html.includes("isn&#x27;t live here yet"));
    assert.deepEqual(intelligenceCalls, [destination]);
  });
}

test("initial visit does not solicit notification before a completed search", async () => {
  const { form, html } = await search(null);
  assert.equal(form.props.showHotelNotification, false);
  assert.ok(!html.includes('id="interest-email"'));
});

test("successive searches, including the same destination, remount notification state by trip ID", async () => {
  const results = [];
  for (const [id, destination] of [["first", "Abu Dhabi"], ["second", "Delhi"], ["third", "Delhi"], ["fourth", "Abu Dhabi"]]) {
    const result = await search(destination, id);
    results.push(result);
    assert.ok(result.html.includes(copy));
    assert.equal(result.form.props.defaultDestination, destination);
  }
  assert.equal(new Set(results.map(({ form }) => form.key)).size, 4,
    "React must discard edited/success/error state for every newly completed trip");
});

test("required name and email validation belongs to a separate, non-nested notification form", async () => {
  const { html } = await search("Delhi");
  const forms = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(([tag]) => tag);
  assert.equal(forms.length, 2);
  assert.ok(forms.every((form) => (form.match(/<form\b/g) ?? []).length === 1));
  assert.ok(!forms[0].includes('id="interest-name"'));
  assert.ok(!forms[0].includes('id="interest-email"'));
  for (const [id, type] of [["interest-name", "text"], ["interest-email", "email"]]) {
    const input = forms[1].match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))[0];
    assert.ok(input.includes(`type="${type}"`));
    assert.ok(input.includes('required=""'));
  }
  const notify = forms[1].match(/<button[^>]*>Send notification request<\/button>/)[0];
  assert.ok(notify.includes('type="submit"'));
  // Native validity is enforced on the owning form; search retains date validation.
  assert.ok(!forms[0].includes("novalidate"));
  assert.match(html, /id="discover-checkout"[^>]*min="2026-10-11"/);
});

test("notification starts collapsed below the complete search form with no destination heading or alert border", async () => {
  const { html } = await search("Delhi");
  const details = html.match(/<details\b[^>]*>/)[0];
  assert.ok(!/\bopen(?:=|\s|>)/.test(details));
  assert.ok(html.indexOf("<details") > html.indexOf("</form>"));
  const summary = html.match(/<summary\b[^>]*>[\s\S]*?<\/summary>/)[0];
  assert.ok(summary.includes(copy));
  assert.ok(summary.includes("Notify me"));
  assert.ok(!html.includes("unsupported-destination"));
  assert.ok(!html.includes("interest-form-dest"));
  assert.ok(!summary.includes("Delhi"));
});
