/* Discover-Namensvertrag: displayName vor companyName vor Ticker-Fallback,
   nie ein Ticker als Name, Herkunft am Titel. Ueber die AUSGELIEFERTEN
   Daten und die kanonische Namensschicht. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(root, "discover", "data");
const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));
const vorhanden = existsSync(join(DATA, "meta.json")) && existsSync(join(DATA, "search", "US_REAL.json"));
const LAYER = join(root, "quant", "data", "market", "security-master", "company-names.json");
const Contract = require("../engines/contract.js");

test("NM1 · Vertrag: legalName und nameSource reisen mit, Karten bleiben schlank", () => {
  const s = Contract.normalizeStock({ symbol: "PLTR", dataMode: "real", companyName: "Palantir Technologies",
                                      legalName: "Palantir Technologies Inc", nameSource: "TIINGO_METADATA" });
  assert.equal(s.companyName, "Palantir Technologies"); assert.equal(s.legalName, "Palantir Technologies Inc");
  assert.equal(s.nameSource, "TIINGO_METADATA"); assert.equal(s.companyNameStatus, "CALCULATED");
  const ohne = Contract.normalizeStock({ symbol: "XYZ", dataMode: "real" });
  assert.equal(ohne.companyName, null); assert.equal(ohne.companyNameStatus, "SOURCE_MISSING"); assert.equal(ohne.legalName, null);
  assert.ok(!("legalName" in Contract.toCard(s)), "die Karte traegt keinen zweiten Namen");
});

test("NM2 · Suchindex: nie ein Ticker als Name, kein leerer Name", { skip: !vorhanden }, () => {
  const idx = readJSON(join(DATA, "search", "US_REAL.json")).entries;
  for (const e of idx) {
    if (e.n === null || e.n === undefined) continue;
    assert.ok(typeof e.n === "string" && e.n.trim().length >= 2, e.s + " leerer Name");
    assert.notEqual(e.n.trim().toUpperCase(), e.s, e.s + " traegt den Ticker als Namen");
  }
});

test("NM3 · Aktienseite: displayName vor companyName vor Ticker - und die Herkunft steht dran", { skip: !vorhanden || !existsSync(LAYER) }, () => {
  const layer = readJSON(LAYER);
  const byTicker = new Map(layer.rows.map((r) => [r.ticker, r]));
  const idx = readJSON(join(DATA, "search", "US_REAL.json")).entries;
  let geprueft = 0, mitName = 0;
  for (const e of idx) {
    const r = byTicker.get(e.s);
    if (!r) continue;
    const seite = join(DATA, "stocks", "US_REAL", e.s + ".json");
    if (!existsSync(seite)) continue;
    const d = readJSON(seite);
    const stock = d.stock || d;
    geprueft++;
    if (r.status === "RESOLVED") {
      mitName++;
      assert.equal(e.n, r.displayName || r.companyName, e.s + ": Suchindex zeigt nicht den displayName");
      assert.equal(stock.companyName, r.displayName || r.companyName, e.s + ": Seite zeigt nicht den displayName");
      assert.equal(stock.legalName, r.companyName, e.s + ": legalName weicht ab");
      assert.equal(stock.nameSource, r.nameSource, e.s + ": Herkunft fehlt");
      assert.equal(stock.companyNameStatus, "CALCULATED");
    } else if (!e.n) {
      assert.equal(stock.companyNameStatus, "SOURCE_MISSING", e.s + ": ohne Namen muss es SOURCE_MISSING heissen");
      assert.equal(stock.legalName, null);
    }
  }
  assert.ok(geprueft > 100, "zu wenige Seiten geprueft"); assert.ok(mitName > 0);
});
