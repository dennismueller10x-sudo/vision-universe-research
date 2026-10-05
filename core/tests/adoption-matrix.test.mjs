/* Die Core-Adoption-Matrix wird gemessen (scripts/core/adoption-matrix.mjs).
   Diese Tests halten den erreichten Stand fest: ein Produkt, das von der
   Core-Identitaet abfaellt, faellt hier auf. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { matrix, splitImplementations, scriptsOf } from "../../scripts/core/adoption-matrix.mjs";

const rows = Object.fromEntries(matrix().map((r) => [r.product, r]));

test("Status laeuft vollstaendig auf dem Core", () => {
  assert.equal(rows.Status.identity.state, "CORE");
  assert.equal(rows.Status.healthDq.state, "CORE");
  assert.equal(rows.Status.coreClient.state, "CORE");
});

test("Quant, Screener und Technical nutzen die Core-Identitaet", () => {
  for (const p of ["Quant", "Screener", "Technical"]) assert.equal(rows[p].identity.state, "CORE", p);
});

test("Kein Produkt bekommt eine neue eigene Split-Bereinigung", () => {
  const bekannt = new Set(["providers/tiingo/adapter.js", "quant/engines/mock-generator.js", "quant/engines/return-series.js",
    "quant/engines/technical/canonical-bars.js", "scripts/discover/build-discover-data.mjs", "scripts/market/publish-discover-series.mjs",
    "scripts/market/study-momentum-return-basis.mjs", "scripts/supertrader/validation/lib.mjs"]);
  const neu = splitImplementations().filter((f) => !bekannt.has(f));
  assert.deepEqual(neu, [], "neue Split-Bereinigung: quant/engines/return-series.js#splitFactors verwenden");
});

test("Skriptliste einer Seite folgt der Ladereihenfolge", () => {
  const s = scriptsOf("status/index.html");
  assert.ok(s.indexOf("core/identity.js") >= 0 && s.indexOf("core/client.js") > s.indexOf("core/identity.js"));
});
