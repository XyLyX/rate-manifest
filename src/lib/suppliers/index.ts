import { mockAdapter } from "./mockAdapter";
import { travelpayoutsAdapter } from "./travelpayoutsAdapter";
import { stayingApiAdapter } from "./stayingApiAdapter";
import type { SupplierAdapter } from "./types";

// The registry of every supplier adapter the app knows how to call. Add a
// new adapter here (and implement SupplierAdapter) to bring on a new
// source - nothing in src/app needs to change.
//
// travelpayoutsAdapter is left registered even though it's a confirmed
// dead end (Hotellook shut down for good - see DECISIONS.md) because it
// already no-ops safely with no credentials set; stayingApiAdapter is the
// real replacement.
export const SUPPLIER_ADAPTERS: SupplierAdapter[] = [mockAdapter, travelpayoutsAdapter, stayingApiAdapter];

export * from "./types";