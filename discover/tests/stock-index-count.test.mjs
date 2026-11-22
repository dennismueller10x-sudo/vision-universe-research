/* stock-index/US_REAL.json: count == symbols.length == cardCount + kurzhistorie.length (prune-dead-refs verlangt count == symbols.length;
   meta.securities zaehlt nur Karten). Liest das Repository direkt (die Golden-Path-Fixture ist ein aelterer Stand). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const json = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

test("stock-index: count, cardCount, kurzhistorie und symbols stimmen ueberein", () => {
  const idx = json("discover/data/stock-index/US_REAL.json");
  const u = json("discover/data/meta.json").universes.find((x) => x.universeId === "US_REAL");
  assert.equal(idx.count, idx.symbols.length);
  assert.equal(idx.cardCount, u.securities);
  assert.equal(idx.count, idx.cardCount + idx.kurzhistorie.length);
  assert.equal(new Set(idx.symbols).size, idx.symbols.length, "doppelte Symbole");
  for (const k of idx.kurzhistorie) assert.ok(idx.symbols.includes(k), k + " fehlt in symbols");
});
