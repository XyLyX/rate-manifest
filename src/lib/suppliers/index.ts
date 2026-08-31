import { mockAdapter } from "./mockAdapter";
import { travelpayoutsAdapter } from "./travelpayoutsAdapter";
import type { SupplierAdapter } from "./types";

// The registry of every supplier adapter the app knows how to call. Add a
// new adapter here (and implement SupplierAdapter) to bring on a new
// source — nothing in src/app needs to change.
export const SUPPLIER_ADAPTERS: SupplierAdapter[] = [mockAdapter, travelpayoutsAdapter];

export * from "./types";
