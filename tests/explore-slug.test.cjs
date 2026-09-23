const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

// Execute the real page and metadata functions without mounting shared UI,
// starting Next.js, writing compiled files, or reaching external services.
const filename = join(__dirname, "../src/app/explore/[pillar]/page.tsx");
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;
const page = {};
runInNewContext(compiled, {
  exports: page,
  require(id) {
    if (id === "next/navigation" || id === "react/jsx-runtime") return require(id);
    if (id === "next/link") return () => null;
    if (id.startsWith("@/components/")) return new Proxy({}, { get: () => () => null });
    if (id.endsWith(".module.css")) return {};
    throw new Error(`Unexpected page dependency: ${id}`);
  },
});

const guides = {
  "cost-reality": "Cost Reality",
  "smart-choices": "Smart Choices",
  "getting-around": "Getting There & Around",
  "local-pulse": "Local Pulse",
};

test("static slugs remain exactly the four editorial guides", () => {
  assert.deepEqual(Array.from(page.generateStaticParams(), ({ pillar }) => pillar), Object.keys(guides));
});

for (const [pillar, title] of Object.entries(guides)) {
  test(`${pillar}: page renders and metadata is preserved`, async () => {
    const props = { params: Promise.resolve({ pillar }) };
    assert.ok(await page.default(props));
    const metadata = await page.generateMetadata(props);
    assert.equal(metadata.title, `${title} | Rate Manifest`);
    assert.equal(metadata.alternates.canonical, `/explore/${pillar}`);
    assert.equal(metadata.openGraph.title, title);
    assert.equal(metadata.openGraph.description, metadata.description);
    assert.equal(metadata.openGraph.type, "article");
    assert.equal(metadata.openGraph.url, `https://ratemanifest.com/explore/${pillar}`);
  });
}

for (const pillar of [...Object.getOwnPropertyNames(Object.prototype), "unknown", "", "COST-REALITY"]) {
  test(`${JSON.stringify(pillar)}: page and metadata invoke Next.js notFound`, async () => {
    const props = { params: Promise.resolve({ pillar }) };
    const isNotFound = (error) => error.digest === "NEXT_HTTP_ERROR_FALLBACK;404";
    await assert.rejects(page.default(props), isNotFound);
    await assert.rejects(page.generateMetadata(props), isNotFound);
  });
}
