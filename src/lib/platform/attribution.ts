import { randomBytes } from "node:crypto";

// Opaque Rate Manifest attribution identifier, sent to an access network as
// the publisher Sub-ID. It is random: it encodes no traveller data (no name,
// email, phone, trip id, dates or destination), and it is generated per
// handoff. Manual test values such as `rm-anantara-test-01` do not match the
// production format and are refused by every access adapter.

const PREFIX = "rm_";
const OPAQUE = /^rm_[0-9a-f]{24}$/;

export function makeAttributionId(random: (n: number) => Buffer = randomBytes): string {
  return PREFIX + random(12).toString("hex");
}

export function isOpaqueAttributionId(value: unknown): value is string {
  return typeof value === "string" && OPAQUE.test(value);
}
