import { randomUUID } from "crypto";

/** Every table's primary key is a random UUID generated in app code. */
export function newId(): string {
  return randomUUID();
}
