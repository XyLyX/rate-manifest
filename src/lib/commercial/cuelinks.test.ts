// Tests for convertCuelinksUrl.
//
// Uses Node's built-in test runner with the repo's existing tsx
// dependency. No live Cuelinks API calls are made.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  convertCuelinksUrl,
  CuelinksConfigError,
  CuelinksRequestError,
  CuelinksResponseError,
} from "./cuelinks";

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV_KEY = process.env.CUELINKS_API_KEY;

function mockFetchOnce(
  impl: (input: unknown, init: unknown) => Promise<Response> | Response,
) {
  global.fetch = (async (input: unknown, init: unknown) =>
    impl(input, init)) as typeof fetch;
}

beforeEach(() => {
  process.env.CUELINKS_API_KEY = "test-key";
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;

  if (ORIGINAL_ENV_KEY === undefined) {
    delete process.env.CUELINKS_API_KEY;
  } else {
    process.env.CUELINKS_API_KEY = ORIGINAL_ENV_KEY;
  }
});

test(
  "affiliated:true — normalizes tracking_url, campaign id/name, original URL",
  async () => {
    mockFetchOnce(async () =>
      new Response(
        JSON.stringify({
          data: {
            tracking_url: "https://linksredirect.com/example-tracked",
            original_url: "https://example.com/hotel",
            affiliated: true,
            campaign: {
              id: 12345,
              name: "Example Hotel Partner",
            },
            affiliate_url: "https://linksredirect.com/example-tracked",
          },
        }),
        { status: 200 },
      ),
    );

    const result = await convertCuelinksUrl(
      "https://example.com/hotel",
    );

    assert.equal(result.originalUrl, "https://example.com/hotel");
    assert.equal(
      result.trackingUrl,
      "https://linksredirect.com/example-tracked",
    );
    assert.equal(result.affiliated, true);
    assert.equal(result.campaignId, 12345);
    assert.equal(result.campaignName, "Example Hotel Partner");
  },
);

test(
  "affiliated:false — returns normally even when tracking_url exists",
  async () => {
    mockFetchOnce(async () =>
      new Response(
        JSON.stringify({
          data: {
            tracking_url: "https://linksredirect.com/example-unaffiliated",
            original_url: "https://example.com/flight",
            affiliated: false,
            campaign: {
              id: 67890,
              name: "Example Flight Partner",
            },
            affiliate_url:
              "https://linksredirect.com/example-unaffiliated",
          },
        }),
        { status: 200 },
      ),
    );

    const result = await convertCuelinksUrl(
      "https://example.com/flight",
    );

    assert.equal(result.affiliated, false);
    assert.equal(
      result.trackingUrl,
      "https://linksredirect.com/example-unaffiliated",
    );
    assert.equal(result.campaignId, 67890);
    assert.equal(result.campaignName, "Example Flight Partner");
  },
);

test("missing CUELINKS_API_KEY — fails clearly", async () => {
  delete process.env.CUELINKS_API_KEY;

  let fetchCalled = false;

  mockFetchOnce(() => {
    fetchCalled = true;
    throw new Error("fetch should not be called without API key");
  });

  await assert.rejects(
    () => convertCuelinksUrl("https://example.com/hotel"),
    CuelinksConfigError,
  );

  assert.equal(fetchCalled, false);
});

test("invalid destination URL — rejected before network call", async () => {
  let fetchCalled = false;

  mockFetchOnce(() => {
    fetchCalled = true;
    throw new Error("fetch should not be called for invalid URL");
  });

  await assert.rejects(
    () => convertCuelinksUrl("not-a-url"),
    CuelinksRequestError,
  );

  assert.equal(fetchCalled, false);

  await assert.rejects(
    () => convertCuelinksUrl("ftp://example.com/file"),
    CuelinksRequestError,
  );

  assert.equal(fetchCalled, false);
});

test("invalid URL is rejected before missing-config check", async () => {
  delete process.env.CUELINKS_API_KEY;

  let fetchCalled = false;

  mockFetchOnce(() => {
    fetchCalled = true;
    throw new Error("fetch should not be called");
  });

  await assert.rejects(
    () => convertCuelinksUrl("not-a-url"),
    CuelinksRequestError,
  );

  assert.equal(fetchCalled, false);
});

test("HTTP/API failure — fails clearly", async () => {
  mockFetchOnce(
    async () => new Response("Unauthorized", { status: 401 }),
  );

  await assert.rejects(
    () => convertCuelinksUrl("https://example.com/hotel"),
    CuelinksRequestError,
  );
});

test("network failure — fails clearly", async () => {
  mockFetchOnce(async () => {
    throw new Error("connection failed");
  });

  await assert.rejects(
    () => convertCuelinksUrl("https://example.com/hotel"),
    CuelinksRequestError,
  );
});

test(
  "malformed response missing data.affiliated — fails clearly",
  async () => {
    mockFetchOnce(async () =>
      new Response(
        JSON.stringify({
          data: {
            tracking_url: "https://linksredirect.com/example",
          },
        }),
        { status: 200 },
      ),
    );

    await assert.rejects(
      () => convertCuelinksUrl("https://example.com/hotel"),
      CuelinksResponseError,
    );
  },
);

test("malformed response missing data envelope — fails clearly", async () => {
  mockFetchOnce(async () =>
    new Response(
      JSON.stringify({
        affiliated: true,
      }),
      { status: 200 },
    ),
  );

  await assert.rejects(
    () => convertCuelinksUrl("https://example.com/hotel"),
    CuelinksResponseError,
  );
});

test("non-JSON successful response — fails clearly", async () => {
  mockFetchOnce(
    async () =>
      new Response("not-json", {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
        },
      }),
  );

  await assert.rejects(
    () => convertCuelinksUrl("https://example.com/hotel"),
    CuelinksResponseError,
  );
});
