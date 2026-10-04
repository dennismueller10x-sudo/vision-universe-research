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

   Frontend-Rebuild (quant/app): Prüfintention erhalten – die Pruefung der
   Seite liest jetzt screenerPro() in quant/app/pages.js und das View Model
   quant/app/view-model.js statt vu2/experience.js.
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

test("V1 price index uses the already published chart close for the five formerly stale rows", () => {
  const index = JSON.parse(gunzipSync(readFileSync(join(ROOT,
    "quant/data/product/universe-list-v1.json.gz"))));
  const entries = new Map(index.entries.map((entry) => [entry.s, entry]));
  for (const ticker of ["BURU", "NCPL", "SDEV", "BGDE", "ASST"]) {
    const entry = entries.get(ticker);
    assert.ok(entry, ticker + ": missing V1 index entry");
    const chart = JSON.parse(readFileSync(join(ROOT,
      "quant/data/market/discover-series/ref_" + ticker + ".json"), "utf8"));
    const point = require(join(ROOT, "quant/engines/published-close.js"))
      .lastPoint(chart, index.generatedAt.slice(0, 10));
    assert.ok(point, ticker + ": no contract-valid published chart point");
    assert.equal(entry.c, point.close, ticker + ": price drift from canonical chart");
    assert.equal(entry.d, point.date, ticker + ": date drift from canonical chart");
    assert.equal(entry.u, point.currency, ticker + ": currency drift from canonical chart");
  }
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
  /* Frontend-Rebuild (quant/app): screenPage() aus vu2/experience.js ist
     ersetzt durch screenerPro() in quant/app/pages.js (#/screener/profi).
     Dieselbe Pruefung dort: genau eine Deklaration von `current` (die
     Methodik), der Zaehler fuer verworfene Anfragen heisst anders und
     verwirft veraltete Antworten. Ein Gueltigkeitsbereich-Fehler ist von
     aussen nicht messbar, deshalb Quellpruefung ohne Kommentare. */
  const seite = readFileSync(join(ROOT, "quant/app/pages.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const start = seite.indexOf("async function screenerPro(");
  assert.ok(start > 0, "screenerPro gibt es nicht mehr - dann prueft dieser Fall nichts");
  const ende = seite.indexOf("\n  async function ", start + 10);
  const koerper = seite.slice(start, ende > 0 ? ende : undefined);
  /* Genau eine Deklaration von `current`: die Methodik. */
  const deklarationen = koerper.match(/(?:let|const|var)\s+current\b/g) || [];
  assert.equal(deklarationen.length, 1,
    "in screenerPro gibt es " + deklarationen.length + " Deklarationen von `current` - eine verdeckt die andere");
  assert.match(koerper, /var current = W\.methodologyOf\(initial\)/);
  /* Die Tabelle entscheidet nach der gewaehlten Methodik, nicht nach einem Zaehler. */
  assert.match(koerper, /current\.id !== "legacy"/);
  /* Und der Zaehler fuer verworfene Anfragen heisst anders. */
  const apply = koerper.slice(koerper.indexOf("async function apply("));
  assert.match(apply, /var mine = \+\+request/);
  assert.match(apply, /if \(mine !== request\) return/);
  /* Die Antwort wird erst NACH der Pruefung gezeichnet. */
  assert.ok(apply.indexOf("if (mine !== request) return") < apply.indexOf("code.textContent"),
    "die Ergebnisse werden vor der Pruefung auf veraltete Anfragen gezeichnet");

  /* Der einfache Screener (#/screener) verwirft ebenso veraltete Antworten,
     wenn der Nutzer schnell zwischen Fragen wechselt. */
  const einfach = seite.slice(seite.indexOf("async function screener("), seite.indexOf("async function factorHits("));
  assert.match(einfach, /var mine = \+\+run_id/);
  assert.match(einfach, /if \(mine !== run_id\) return/);
});

test("eine eigene Branchenvorlage wird auf der Seite genannt, nicht verschwiegen", async () => {
  /* Gemessen: 974 Titel rechnen nach einer eigenen Vorlage. WSBCO zeigte die
     Eigenkapitalquote mit Gewicht 0,30 und AAPL dieselbe Kennzahl mit 0,15 -
     dieselbe Beschriftung, eine andere Methodik, kein Wort dazu.

     Frontend-Rebuild (quant/app): branchenvorlageHinweis()/VORLAGE_ERKLAERUNG
     aus vu2/experience.js sind entfallen. Die Aussagen kommen jetzt aus dem
     View Model (quant/app/view-model.js, factorView().reference bzw.
     stock().template) und werden in der Faktorsektion der Aktienseite
     (quant/app/page-stock.js factorCard) gezeichnet. Geprueft wird deshalb
     am Verhalten des View Models mit echten Artefakten. */

  /* Der Dienst muss die Vorlage ueberhaupt durchreichen - ohne sie kann die
     Seite sie nicht nennen. */
  const service = readFileSync(join(ROOT, "quant/api/product-services.js"), "utf8");
  assert.match(service, /template:record\.template\|\|null/,
    "getFactorEvidence reicht die Vorlage nicht durch");

  const VM = require(join(ROOT, "quant/app/view-model.js"));
  const Contract = require(join(ROOT, "quant/engines/quant-methodology-contract.js"));
  const strings = (o, out = []) => {
    if (typeof o === "string") out.push(o);
    else if (Array.isArray(o)) o.forEach((x) => strings(x, out));
    else if (o && typeof o === "object") Object.keys(o).forEach((k) => strings(o[k], out));
    return out;
  };
  /* Je Vorlage ein echter Titel aus den veroeffentlichten Artefakten. */
  const beispiel = { BALANCE_SHEET_FINANCIAL: "JPM", INSURANCE_CARRIER: "PGR", REAL_ESTATE_TRUST: "O" };
  const texte = {};
  for (const id of Contract.TEMPLATES) {
    assert.ok(beispiel[id], "kein Beispieltitel fuer die Vorlage " + id + " - Test ergaenzen");
    const record = await api.getFactorEvidence(beispiel[id]);
    assert.equal(record.state, "AVAILABLE");
    assert.equal(record.template && record.template.id, id, beispiel[id] + " rechnet nicht mehr nach " + id);
    const vm = VM.stock({ ticker: beispiel[id], factors: record });
    /* Die Vorlage wird in der Faktorsektion genannt. */
    assert.ok(vm.factors.length > 0);
    for (const f of vm.factors) {
      assert.match(f.reference, /Branchenvorlage/, beispiel[id] + "/" + f.id + ": die Vorlage wird nicht genannt");
    }
    /* Was das View Model ueber die Vorlage SAGT: die Methodikebene jedes
       Faktors (reference) und jeder aus stock().template abgeleitete Text.
       Die roh durchgereichten Felder des Artefakts (id, label, version,
       appliesTo) und die Kennzahl-Notizen der Engine zaehlen nicht - ein
       durchgereichtes Datenfeld ist noch keine Aussage an den Nutzer. */
    const roh = new Set(Object.values(record.template).map(String));
    const vorlagenTexte = vm.factors.map((f) => f.reference)
      .concat(strings(vm.template).filter((t) => !roh.has(t)));
    /* Die Fassung steht in der Methodikebene, nicht in der ersten Zeile des
       Faktors (why/label). */
    assert.ok(vorlagenTexte.some((t) => t.includes(record.template.version)),
      beispiel[id] + ": die Fassung " + record.template.version + " der Vorlage wird in der Methodikebene nicht genannt");
    for (const f of vm.factors) {
      assert.ok(!String(f.why || "").includes(record.template.version) && !String(f.label || "").includes(record.template.version),
        beispiel[id] + "/" + f.id + ": die Fassung steht in der ersten Zeile statt in der Methodikebene");
    }
    /* Vergleichbar machen: Name der Vorlage, SIC-Angaben und Fassung
       herausnehmen - was dann noch vorlagen-spezifisch ist, ist die
       Erklaerung in Alltagssprache. */
    texte[id] = vorlagenTexte.map((t) => t.split(record.template.label).join("")
      .split(record.template.version).join("").replace(/SIC [0-9 -]+/g, "SIC"));
  }
  const ohneVorlage = VM.stock({ ticker: "AAPL", factors: await api.getFactorEvidence("AAPL") });
  const allgemein = new Set(ohneVorlage.factors.map((f) => f.reference.replace(/SIC [0-9 -]+/g, "SIC")));
  /* Jede der drei Vorlagen hat eine eigene Erklaerung in Alltagssprache -
     eine Vorlage ohne Satz waere ein Name ohne Bedeutung. */
  for (const id of Contract.TEMPLATES) {
    const andere = new Set(Contract.TEMPLATES.filter((x) => x !== id).flatMap((x) => texte[x]));
    const eigen = texte[id].filter((t) => !andere.has(t) && !allgemein.has(t) && t.length > 80);
    assert.ok(eigen.length > 0,
      "keine eigene Erklaerung in Alltagssprache fuer " + id + " (mehr als 80 Zeichen, ohne den Namen der Vorlage)");
    for (const satz of eigen) {
      assert.equal(/[A-Z]{3,}_[A-Z_]{3,}/.test(satz), false,
        "interner Code in der Erklaerung von " + id + ": " + satz.slice(0, 120));
    }
  }

  /* Die Aktienseite zeichnet diese Aussage in der Faktorsektion. */
  const seite = readFileSync(join(ROOT, "quant/app/page-stock.js"), "utf8");
  const karte = seite.slice(seite.indexOf("function factorCard("), seite.indexOf("function conditions("));
  assert.match(karte, /f\.reference/, "factorCard zeichnet den Vergleichs-/Vorlagenhinweis nicht");
});
