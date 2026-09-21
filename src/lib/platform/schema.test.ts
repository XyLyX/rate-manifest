// Static validation of the Phase 1A tables without a live database:
//  - the raw SQL applied by init-db matches the Drizzle schema (columns,
//    types, NOT NULL, unique, foreign keys + ON DELETE, indexes)
//  - the selection upsert targets the unique index that exists
// A live-database test of drizzleStore is pending a definitely
// non-production database (see Phase 1B report).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "../../db/schema";

const PLATFORM_TABLES: Record<string, PgTable> = {
  trip_components: schema.tripComponents,
  merchants: schema.merchants,
  access_routes: schema.accessRoutes,
  merchant_access_routes: schema.merchantAccessRoutes,
  offer_snapshots: schema.offerSnapshots,
  component_selections: schema.componentSelections,
  commercial_handoffs: schema.commercialHandoffs,
  commercial_routes: schema.commercialRoutes,
};

const sqlText = readFileSync(join(__dirname, "../../app/api/admin/init-db/route.ts"), "utf8");
const block = sqlText.slice(sqlText.indexOf("Phase 1A shared four-tower platform foundation"));

interface ParsedTable {
  columns: Map<string, { type: string; notNull: boolean; unique: boolean; fk?: { table: string; column: string; cascade: boolean } }>;
}

function parseTables(): Map<string, ParsedTable> {
  const out = new Map<string, ParsedTable>();
  for (const m of block.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\);/g)) {
    const columns: ParsedTable["columns"] = new Map();
    for (const raw of m[2]!.split("\n")) {
      const line = raw.trim().replace(/,$/, "");
      if (!line || line.startsWith("--") || line.startsWith("CONSTRAINT")) continue;
      const cm = line.match(/^(\w+) (text|integer|real|timestamp|double precision)\b(.*)$/);
      assert.ok(cm, `unparsed column line in ${m[1]}: ${line}`);
      const rest = cm[3]!;
      const fk = rest.match(/REFERENCES (\w+)\((\w+)\)( ON DELETE CASCADE)?/);
      columns.set(cm[1]!, {
        type: cm[2]!,
        notNull: /NOT NULL|PRIMARY KEY/.test(rest),
        unique: /\bUNIQUE\b/.test(rest),
        fk: fk ? { table: fk[1]!, column: fk[2]!, cascade: !!fk[3] } : undefined,
      });
    }
    out.set(m[1]!, { columns });
  }
  return out;
}

test("init-db SQL creates exactly the eight platform tables", () => {
  assert.deepEqual([...parseTables().keys()].sort(), Object.keys(PLATFORM_TABLES).sort());
});

test("init-db SQL matches the Drizzle schema: columns, types, NOT NULL, UNIQUE, foreign keys and cascade", () => {
  const parsed = parseTables();
  for (const [name, table] of Object.entries(PLATFORM_TABLES)) {
    const cfg = getTableConfig(table);
    assert.equal(cfg.name, name);
    const sqlTable = parsed.get(name)!;

    assert.deepEqual(cfg.columns.map((c) => c.name).sort(), [...sqlTable.columns.keys()].sort(), `${name}: column set`);
    for (const col of cfg.columns) {
      const s = sqlTable.columns.get(col.name)!;
      assert.equal(col.getSQLType(), s.type, `${name}.${col.name} type`);
      assert.equal(col.notNull, s.notNull, `${name}.${col.name} NOT NULL`);
      assert.equal(col.isUnique, s.unique, `${name}.${col.name} UNIQUE`);
    }

    const drizzleFks = cfg.foreignKeys
      .map((fk) => {
        const r = fk.reference();
        return `${r.columns[0]!.name}->${getTableName(r.foreignTable)}.${r.foreignColumns[0]!.name}:${fk.onDelete === "cascade" ? "cascade" : "restrict"}`;
      })
      .sort();
    const sqlFks = [...sqlTable.columns.entries()]
      .filter(([, c]) => c.fk)
      .map(([n, c]) => `${n}->${c.fk!.table}.${c.fk!.column}:${c.fk!.cascade ? "cascade" : "restrict"}`)
      .sort();
    assert.deepEqual(drizzleFks, sqlFks, `${name}: foreign keys`);
  }
});

test("init-db SQL creates the same indexes (names and uniqueness) as the Drizzle schema", () => {
  const sqlIdx = new Map<string, boolean>();
  for (const m of block.matchAll(/CREATE (UNIQUE )?INDEX IF NOT EXISTS (\w+)/g)) sqlIdx.set(m[2]!, !!m[1]);

  const drizzleIdx = new Map<string, boolean>();
  for (const table of Object.values(PLATFORM_TABLES)) {
    for (const i of getTableConfig(table).indexes) drizzleIdx.set(i.config.name!, !!i.config.unique);
  }
  assert.deepEqual([...drizzleIdx.entries()].sort(), [...sqlIdx.entries()].sort());
  // the lookups the store actually performs are indexed
  for (const needed of ["trip_components_trip_idx", "offer_snapshots_component_idx", "commercial_routes_component_idx", "commercial_handoffs_component_idx", "component_selections_component_idx"]) {
    assert.ok(sqlIdx.has(needed), needed);
  }
});

test("money is double precision (not 4-byte real) on offer snapshots", () => {
  const col = getTableConfig(schema.offerSnapshots).columns.find((c) => c.name === "total_price")!;
  assert.equal(col.getSQLType(), "double precision");
});

test("selection upsert targets the unique component index (SQL compiled, no connection made)", () => {
  const pool = new Pool({ connectionString: "postgres://u:p@127.0.0.1:1/none" }); // never connects
  const db = drizzle(pool, { schema });
  const q = db
    .insert(schema.componentSelections)
    .values({ id: "s", componentId: "c", offerId: "o", selectedAt: new Date() })
    .onConflictDoUpdate({ target: schema.componentSelections.componentId, set: { offerId: "o2", selectedAt: new Date() } })
    .toSQL();
  assert.match(q.sql, /on conflict \("component_id"\) do update set "offer_id" = \$\d+, "selected_at" = \$\d+/);
  void pool.end();
});
