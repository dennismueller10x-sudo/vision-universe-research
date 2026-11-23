/* Beschriftung des Produktumfangs: Discover-Meta traegt die Quant-Kennzahl (core/product-composition.js), Daten-Seite und
   Status zeigen die Beschriftung. Schema/Vertrag, keine festen Datenwerte. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const PC = require(join(root, "core", "product-composition.js"));
const read = (p) => readFileSync(join(root, p), "utf8");
const usReal = () => JSON.parse(read("discover/data/meta.json")).universes.find((x) => x.universeId === "US_REAL");

test("Meta: productComposition == compose() aus Eignungsentscheidungen und Produktuniversum, Beschriftung == label()", () => {
  const c = usReal().productComposition;
  assert.ok(c && c.labels, "meta.universes[US_REAL].productComposition fehlt");
  const neu = PC.compose(JSON.parse(read("quant/data/market/security-master/eligibility.json")).decisions,
    JSON.parse(read("quant/data/market/scale/universe-ELIGIBLE_US_EQUITY.json")).securities);
  const { labels, ...ohneLabels } = c;
  assert.deepEqual(ohneLabels, neu);
  assert.deepEqual(labels, PC.label(neu));
  assert.equal(neu.unmatched, 0);
});

test("Beschriftung: Stammaktien (+ in Pruefung) und Produktumfang inkl. getrennter Klassen", () => {
  const l = PC.label({ commonStock: { eligible: 5, review: 2 }, productScope: 9 });
  assert.equal(l.commonStock, "US-Stammaktien 5 (+2 in Prüfung)");
  assert.equal(l.productScope, "Produktumfang inkl. getrennter Klassen 9");
});

test("Daten-Seite und Status lesen die Beschriftung aus dem Meta", () => {
  assert.match(read("discover/ui/daten.js"), /productComposition/);
  assert.match(read("discover/ui/daten.js"), /pc\.labels\.commonStock/);
  assert.match(read("status/status.js"), /productComposition/);
  assert.match(read("status/index.html"), /id="product-composition"/);
});
