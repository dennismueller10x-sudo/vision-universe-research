/* =========================================================================
   DER SCREENER LIEFERTE DIE RICHTIGEN TREFFER UND ZEIGTE NICHTS DAVON.

   Gemessen am 26.09.2026 am gebauten Release. Die Dienstschicht war die ganze
   Zeit richtig: 50 Treffer aus 6.875 Titeln, sauber sortiert - VIVKD 145,5 %,
   CATG 51,7 %, QHUOY 49,6 %, MSFT 41,6 %. Auf der Seite stand in jeder der
   50 Zeilen:

       VIVKD | VIVKD | – / 7 | Nicht verfuegbar

   Und darueber: "50 Treffer in 6875 verfuegbaren Unternehmen · undefined ·
   kein Gesamtmarkt-Ranking".

   Das `undefined` war die Spur. In `screenPage` gibt es eine aeussere
   Variable `current` - die gewaehlte Methodik - und der Abschluss `apply()`
   begann mit `const current=++request`, dem Zaehler fuer verworfene
   Anfragen. Damit war in `apply()` `current.label` undefined und
   `current.id==='legacy'` immer falsch: die Seite zeichnete die
   Faktor-Tabelle der V2-Methodik ueber Zeilen einer V1-Abfrage, und dort
   gibt es kein `evidence`-Feld. Ein Name, ein verschluckter Zustand, eine
   unbenutzbare Hauptfunktion.

   Was hier gehalten wird:
     1. Beide Methodiken liefern Zeilen, die ihre eigene Spalte fuellen
        koennen - gemessen an den echten Artefakten.
     2. In `screenPage` verdeckt keine innere Deklaration die Methodik.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const Service = require(join(ROOT, "quant/api/product-services.js"));
const Policy = require(join(ROOT, "quant/engines/display-policy.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));
const Screener = require(join(ROOT, "quant/api/screener-workspace.js"));

const api = Service.create({
  loadJSON: async (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString("utf8")),
  displayPolicy: Policy, queryEngine: Query
});

test("a V1 query returns rows that can fill the V1 columns", async () => {
  const feld = Screener.methodologies.find((m) => m.id === "legacy")
    .fields.find((f) => f.id === "momentum6m");
  const query = Screener.build([{ field: "momentum6m", operator: "gte", value: 0, scale: "raw" }],
    [{ field: "momentum6m", direction: "desc" }]);
  const result = await api.screen(query);
  assert.equal(result.state, "AVAILABLE");
  assert.ok(result.stocks.length > 10, "nur " + result.stocks.length + " Treffer");
  /* Die Spalten der V1-Tabelle sind Schlusskurs und die Sortierkennzahl -
     beide muessen in der Zeile stehen, sonst zeigt die Seite Striche. */
  let mitKurs = 0, mitKennzahl = 0;
  for (const stock of result.stocks) {
    if (Number.isFinite(stock.price && stock.price.value)) mitKurs += 1;
    const wert = stock[feld.productKey];
    if (Number.isFinite(wert && wert.value)) mitKennzahl += 1;
  }
  assert.equal(mitKennzahl, result.stocks.length,
    "nur " + mitKennzahl + " von " + result.stocks.length + " Zeilen tragen die Sortierkennzahl");
  assert.ok(mitKurs / result.stocks.length > 0.9,
    "nur " + mitKurs + " von " + result.stocks.length + " Zeilen tragen einen Kurs");
  /* Und sortiert ist sortiert. */
  const werte = result.stocks.map((s) => s[feld.productKey].value);
  for (let i = 1; i < werte.length; i += 1) assert.ok(werte[i] <= werte[i - 1], "die Reihenfolge stimmt nicht");
});

test("a V2 query returns rows that can fill the V2 columns", async () => {
  const v2 = Screener.methodologies.find((m) => m.id !== "legacy");
  const feld = v2.fields.filter((f) => f.type === "number")[0];
  const query = Screener.build([{ field: feld.id, operator: "gte", value: 0, scale: "raw" }],
    [{ field: feld.id, direction: "desc" }]);
  const result = await api.screen(query);
  assert.equal(result.state, "AVAILABLE");
  assert.ok(result.stocks.length > 10);
  for (const stock of result.stocks) {
    assert.ok(stock.evidence, stock.ticker + ": die Zeile traegt keine Faktor-Evidenz");
    assert.ok(Number.isFinite(stock.evidence[feld.id]),
      stock.ticker + ": die Sortierkennzahl fehlt in der Evidenz");
    assert.ok(Number.isFinite(stock.evidence["quantV2.factorEvidence.availableFactors"]),
      stock.ticker + ": die Zahl der bewerteten Faktoren fehlt");
  }
});

test("nothing inside the screener page shadows the selected methodology", () => {
  /* Ein Gueltigkeitsbereich-Fehler ist von aussen nicht messbar: die Dienste
     bleiben richtig, nur die Seite liest den falschen Wert. Deshalb hier eine
     Quellpruefung - ohne Kommentare gelesen, weil der Abschnitt den alten
     Fehler ERKLAERT und ein Text ueber eine Regel nicht die Regel ist. */
  const seite = readFileSync(join(ROOT, "vu2/experience.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const start = seite.indexOf("async function screenPage()");
  assert.ok(start > 0, "screenPage gibt es nicht mehr - dann prueft dieser Fall nichts");
  const ende = seite.indexOf("\nasync function ", start + 10);
  const koerper = seite.slice(start, ende > 0 ? ende : undefined);
  /* Genau eine Deklaration von `current`: die Methodik. */
  const deklarationen = koerper.match(/(?:let|const|var)\s+current\b/g) || [];
  assert.equal(deklarationen.length, 1,
    "in screenPage gibt es " + deklarationen.length + " Deklarationen von `current` - eine verdeckt die andere");
  assert.match(koerper, /let current=editor\.methodologyOf\(initial\)/);
  /* Und der Zaehler fuer verworfene Anfragen heisst anders. */
  assert.match(koerper, /const anfrage=\+\+request/);
  assert.match(koerper, /if\(anfrage!==request\)return/);
});
