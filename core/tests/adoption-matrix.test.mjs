/* Die Core-Adoption-Matrix wird gemessen (scripts/core/adoption-matrix.mjs).
   Diese Tests halten den erreichten Stand fest: ein Produkt, das von der
   Core-Identitaet abfaellt, faellt hier auf. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { matrix, splitImplementations, scriptsOf, ohneKommentare } from "../../scripts/core/adoption-matrix.mjs";

const rows = Object.fromEntries(matrix().map((r) => [r.product, r]));

test("Status laeuft vollstaendig auf dem Core", () => {
  assert.equal(rows.Status.identity.state, "CORE");
  assert.equal(rows.Status.healthDq.state, "CORE");
  assert.equal(rows.Status.coreClient.state, "CORE");
});

test("Quant, Screener und Technical nutzen die Core-Identitaet", () => {
  for (const p of ["Quant", "Screener", "Technical"]) assert.equal(rows[p].identity.state, "CORE", p);
});

test("News liest ueber den Core-Vertrag", () => {
  assert.equal(rows.News.coreClient.state, "CORE");
});

test("Kein Produkt bekommt eine neue eigene Split-Bereinigung - und die Liste schrumpft nur", () => {
  /* Discover-Builder und -Publisher nutzen seit #388/#437 return-series.js;
     sie stehen nicht mehr in der Liste. Ein Eintrag, der nicht mehr
     zutrifft, laesst den Test scheitern (wie im Identitaets-Waechter). */
  const bekannt = new Set(["providers/tiingo/adapter.js", "quant/engines/mock-generator.js", "quant/engines/return-series.js",
    "quant/engines/technical/canonical-bars.js", "scripts/market/study-momentum-return-basis.mjs", "scripts/supertrader/validation/lib.mjs"]);
  const gefunden = splitImplementations();
  const neu = gefunden.filter((f) => !bekannt.has(f));
  assert.deepEqual(neu, [], "neue Split-Bereinigung: quant/engines/return-series.js#splitFactors verwenden");
  const veraltet = [...bekannt].filter((f) => !gefunden.includes(f));
  assert.deepEqual(veraltet, [], "Eintrag nicht mehr noetig - aus der Liste entfernen");
});

test("Supertrader bildet die ID ueber die gemeinsame Engine (company-master.js)", () => {
  assert.equal(rows.Supertrader.identity.state, "SHARED");
});

test("Messung: createRequire-Importe zaehlen, Kommentare nicht", () => {
  assert.equal(ohneKommentare("// Vorher `ref_${s}`\nconst a = 1; /* ref_ + x */"), "\nconst a = 1; ");
  assert.equal(ohneKommentare('const u = "https://x.y/z";'), 'const u = "https://x.y/z";');
});

test("Skriptliste einer Seite folgt der Ladereihenfolge", () => {
  const s = scriptsOf("status/index.html");
  assert.ok(s.indexOf("core/identity.js") >= 0 && s.indexOf("core/client.js") > s.indexOf("core/identity.js"));
});
