/* Zaehl-Vertrag der ausgelieferten Discover-Seiten gegen das Repository (Schema/Vertrag, keine festen Datenwerte):
   stock-index count == symbols.length == cardCount + kurzhistorie.length (prune-dead-refs verlangt count == symbols.length);
   meta.securities zaehlt nur Karten; Karten + notDelivered == Produktuniversum. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const json = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const usReal = () => json("discover/data/meta.json").universes.find((x) => x.universeId === "US_REAL");

test("stock-index: count, cardCount, kurzhistorie und symbols stimmen ueberein", () => {
  const idx = json("discover/data/stock-index/US_REAL.json");
  assert.equal(idx.count, idx.symbols.length);
  assert.equal(idx.cardCount, usReal().securities);
  assert.equal(idx.count, idx.cardCount + idx.kurzhistorie.length);
  assert.equal(new Set(idx.symbols).size, idx.symbols.length, "doppelte Symbole");
  for (const k of idx.kurzhistorie) assert.ok(idx.symbols.includes(k), k + " fehlt in symbols");
});

test("Meta: Karten + ohne Karte == Produktuniversum, Gruende summieren sich", () => {
  const u = usReal();
  assert.ok(u.notDelivered, "meta.universes[US_REAL].notDelivered fehlt");
  assert.equal(u.securities + u.notDelivered.total, u.factorCoverage.universe);
  assert.equal(Object.values(u.notDelivered.byReason).reduce((a, b) => a + b, 0), u.notDelivered.total);
});
