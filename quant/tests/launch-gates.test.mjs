/* =========================================================================
   DIE LAUNCH-GATES, ALS REGRESSION FESTGEHALTEN.

   Jede Regel hier wurde am 28.09.2026 durch eine Messung gefunden, nicht
   durch Nachdenken. Die Kommentare nennen die Zahl, die sie gefunden hat -
   ohne sie ist eine Zeile wie `factorReady=!!f` in einem Jahr ein
   willkuerlicher Unterschied und wird "aufgeraeumt".

   Was NICHT geprueft wird: die Gates, die nur im Browser gegen das gebaute
   Release entscheidbar sind. Dafuer gibt es den Produktions-Smoke; hier wird
   geprueft, dass die Launch-Messung sie OHNE diesen Beleg nicht bestehen
   laesst.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const Service = require(join(ROOT, "quant/api/product-services.js"));
const Policy = require(join(ROOT, "quant/engines/display-policy.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));
const Classification = require(join(ROOT, "quant/engines/instrument-classification.js"));
const Master = require(join(ROOT, "quant/engines/company-master.js"));

const api = Service.create({
  loadJSON: async (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString("utf8")),
  displayPolicy: Policy, queryEngine: Query
});
const index = JSON.parse(gunzipSync(readFileSync(join(ROOT, "quant/data/product/universe-list-v1.json.gz"))).toString("utf8"));

test("eine Faktorbewertung wird behauptet, wenn es eine Faktorzeile gibt - nicht wenn es Handelstage gibt", async () => {
  /* Gemessen: die Uebersicht fuehrte 6.755 Titel als faktorbewertet, waehrend
     6.296 Faktorzeilen existieren. Die Bedingung war `!!f||Number(member.b)>0`
     - also genuegte es, dass die Kapazitaetsdatei Handelstage kennt. 459
     Zeilen behaupteten damit eine Auswertung, die die Aktienseite verneint. */
  const quelle = readFileSync(join(ROOT, "quant/api/product-services.js"), "utf8");
  assert.equal(/factorReady=!!f\|\|Number\(member\.b\)>0/.test(quelle), false,
    "die Zahl der Handelstage gilt wieder als Faktorbewertung");
  assert.match(quelle, /factorReady=!!f;/);

  const universe = await api.getUniverse();
  const behauptet = universe.stocks.filter((s) => s.factorState === "AVAILABLE");
  /* Und die Behauptung wird an der Aktienseite geprueft - ueber eine Probe
     quer durch das Alphabet, nicht ueber die ersten Zeilen. */
  const luegen = [];
  for (const s of behauptet.filter((_, i) => i % 11 === 0)) {
    const ev = await api.getFactorEvidence(s.ticker);
    if (!ev || ev.state !== "AVAILABLE") luegen.push(s.ticker + ": " + (ev && ev.reason));
  }
  assert.deepEqual(luegen.slice(0, 10), [],
    luegen.length + " Zeilen behaupten eine Faktorbewertung, die die Aktienseite verneint");
  assert.ok(behauptet.length > 6000, "die Liste behauptet fast nichts mehr - das waere der Gegenfehler");
});

test("ein belegtes Nicht-Aktien-Papier behaelt seinen Kurs und verliert die Aktienaussage", async () => {
  /* Gemessen: 145 Fonds, Optionsscheine und Vorzugspapiere standen in der
     Uebersicht mit `factorState = AVAILABLE`, waehrend dieselbe Anwendung auf
     der Aktienseite "keine Aktie" sagte. */
  const marken = (index.entries || []).filter((e) => e.ne);
  assert.ok(marken.length > 100, "das Verzeichnis kennt die belegte Gattung nicht mehr (" + marken.length + ")");
  assert.equal(index.coverage.provenNonEquity, marken.length);

  const universe = await api.getUniverse();
  const nachTicker = new Map(universe.stocks.map((s) => [s.ticker, s]));
  let mitKurs = 0;
  for (const e of marken) {
    const zeile = nachTicker.get(e.s);
    if (!zeile) continue;
    assert.equal(zeile.factorState, "UNAVAILABLE", e.s + " gilt weiter als faktorbewertet");
    assert.equal(zeile.factorReason, "NOT_AN_EQUITY_LISTING", e.s + " nennt den falschen Grund");
    assert.equal(zeile.capabilities.factors, false, e.s + " behauptet Faktorfaehigkeit");
    /* Kurs und Kursverlauf bleiben - das war die Owner-Entscheidung, nicht
       ein Verschwinden aus dem Produkt. */
    if (zeile.price && Number.isFinite(zeile.price.value)) mitKurs += 1;
  }
  assert.ok(mitKurs > 100, "nur " + mitKurs + " der belegten Nicht-Aktien tragen noch einen Kurs");
});

test("die Gattungsregel steht in der Engine und nicht zweimal", () => {
  /* Vor dem 28.09.2026 stand sie als zwei eigene Listen im Produktdienst -
     und genau deshalb wusste die Uebersicht nichts davon. */
  assert.deepEqual(Classification.EQUITY_TYPES, ["COMMON_STOCK", "ADR"]);
  assert.deepEqual(Classification.PROVEN_TYPE_BASES, ["SECURITY_NAME", "PROVIDER_ASSET_TYPE"]);
  assert.ok(Classification.provenNonEquity({ securityType: "ETF", securityTypeConfidence: "HIGH", securityTypeBasis: "SECURITY_NAME" }));
  /* Eine Vermutung aendert nichts - das ist die Owner-Entscheidung. */
  assert.equal(Classification.provenNonEquity({ securityType: "ETF", securityTypeConfidence: "MEDIUM", securityTypeBasis: "SECURITY_NAME" }), null);
  assert.equal(Classification.provenNonEquity({ securityType: "ETF", securityTypeConfidence: "HIGH", securityTypeBasis: "TICKER_SUFFIX" }), null);
  assert.equal(Classification.provenNonEquity({ securityType: "COMMON_STOCK", securityTypeConfidence: "HIGH", securityTypeBasis: "SECURITY_NAME" }), null);

  const dienst = readFileSync(join(ROOT, "quant/api/product-services.js"), "utf8");
  assert.equal(/const AKTIENGATTUNGEN=\[/.test(dienst), false, "der Dienst fuehrt wieder eine eigene Gattungsliste");
  assert.match(dienst, /Classification\.provenNonEquity\(i\)/);
  const bauer = readFileSync(join(ROOT, "scripts/quant/build-universe-list.mjs"), "utf8");
  assert.match(bauer, /Classification\.provenNonEquity\(instrument\)/);
  /* Und der Screener liest seine erlaubten Gattungen aus derselben Engine. */
  assert.deepEqual(Object.keys(Master.SCREENER_TYPES).sort(), ["ADR", "COMMON_STOCK"]);
});

test("der Name der Quant-Ansicht ist derselbe wie ueberall", async () => {
  /* Gemessen ueber eine Probe von 977 Titeln: 976 trugen hier das KUERZEL als
     Firmennamen ("A" statt "Agilent Technologies, Inc."), einer den
     Panelnamen in Versalien ("JPMORGAN CHASE & CO"). */
  const erwartet = new Map((index.entries || []).filter((e) => e.n).map((e) => [e.s, e.n]));
  const abweichungen = [];
  for (const ticker of ["A", "AA", "JPM", "AAPL", "GOOG", "GOOGL", "WSBCO", "AACI", "NVDA"]) {
    const soll = erwartet.get(ticker);
    if (!soll) continue;
    const w = await api.getQuantWorkspace(ticker);
    if (w.state !== "AVAILABLE") continue;
    if (w.name !== soll) abweichungen.push(ticker + ": \"" + w.name + "\" statt \"" + soll + "\"");
  }
  assert.deepEqual(abweichungen, [], "die Quant-Ansicht nennt einen anderen Namen");
});

test("ein Kuerzel ist kein Firmenname - auf keiner Flaeche", async () => {
  const universe = await api.getUniverse();
  assert.equal(universe.stocks.filter((s) => s.name === s.ticker).length, 0,
    "eine Zeile traegt ihr Kuerzel als Firmennamen");
  const ohne = universe.stocks.filter((s) => !s.name);
  for (const s of ohne) {
    assert.equal(s.nameReason, "PROVIDER_HAS_NO_NAME", s.ticker + " hat keinen Namen und keinen Grund");
  }
  /* Und die Oberflaeche sagt es in Alltagssprache, statt das Feld leer zu
     lassen oder den Code zu zeigen. */
  const seite = readFileSync(join(ROOT, "vu2/experience.js"), "utf8");
  assert.match(seite, /Firmenname nicht veröffentlicht/);
  /* Der Code darf im KOMMENTAR stehen - dort erklaert er die Regel und steht
     auf keiner Seite. Geprueft wird der Quelltext ohne Kommentare; die
     Branchenvorlagen- und die Namensvertrags-Pruefung haben sich schon
     zweimal an genau dieser Unterscheidung selbst ausgeloest. */
  const ohneKommentar = seite.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/PROVIDER_HAS_NO_NAME/.test(ohneKommentar), false,
    "der interne Grund steht in der Oberflaeche");
});

test("NOT_MEASURED ist kein PASS", () => {
  /* Vier Gates sind nur im Browser gegen das gebaute Release entscheidbar,
     eines nur mit einem echten Suite-Lauf. Die Messung darf sie nicht
     stillschweigend als bestanden fuehren - sonst waere ein Launch
     freigegeben, bei dem niemand die Seite angesehen hat. */
  const quelle = readFileSync(join(ROOT, "scripts/vu2/measure-launch-readiness.mjs"), "utf8");
  assert.match(quelle, /offen\.length === 0/);
  assert.match(quelle, /NOT_MEASURED ist kein PASS/);
  /* Und der Smoke-Bericht muss zum gemessenen Stand gehoeren. */
  assert.match(quelle, /smokeFrisch/);
  assert.match(quelle, /suiteFrisch/);
  const smoke = readFileSync(join(ROOT, "scripts/vu2/production-smoke.mjs"), "utf8");
  assert.match(smoke, /production-smoke-1\.0\.0/);
  assert.match(smoke, /commit/);
});

test("der Launch-Bericht nennt jedes Gate und sein Urteil", () => {
  const pfad = join(ROOT, "quant/data/product/launch-readiness-v1.json");
  if (!existsSync(pfad)) return; /* der Bericht ist ein Messergebnis, keine Bedingung des Baus */
  const bericht = JSON.parse(readFileSync(pfad, "utf8"));
  assert.equal(bericht.schemaVersion, "launch-readiness-1.0.0");
  /* Zwoelf P0-Gates sperren den Launch; die P1-Pruefungen stehen im selben
     Bericht, weil sie am selben Stand gemessen werden. */
  assert.equal(bericht.p0Gates, 12, "es sind nicht zwoelf P0-Gates");
  assert.equal(bericht.gates.length, bericht.p0Gates + bericht.p1Checks);
  const ids = bericht.gates.map((g) => g.id);
  for (const id of ["RELEASE_EXPERIENCE", "PUBLIC_BETA_HYGIENE"]) {
    assert.ok(ids.includes(id), "P1-Pruefung " + id + " fehlt");
  }
  for (const id of ["IDENTITY_CORRECTNESS", "SECURITY_TYPE_SAFETY", "DATA_FRESHNESS", "PRICE_CONSISTENCY",
    "VALUATION_SAFETY", "PRODUCT_LANGUAGE", "MOBILE_390", "DESKTOP_1440", "NAVIGATION",
    "ERROR_STATES", "METHODOLOGY_TRANSPARENCY", "REGRESSION_GUARDS"]) {
    assert.ok(ids.includes(id), "Gate " + id + " fehlt");
  }
  for (const g of bericht.gates) {
    assert.ok(["PASS", "FAIL", "NOT_MEASURED"].includes(g.status), g.id + " hat kein Urteil");
    assert.ok(g.title && g.title.length > 10, g.id + " hat keinen lesbaren Titel");
  }
  /* Das Gesamturteil darf nicht PASS sein, solange ein Gate offen oder rot
     ist - das ist die eine Zeile, auf die sich der Launch verlaesst. */
  const offen = bericht.gates.filter((g) => g.status !== "PASS").length;
  if (offen) assert.equal(bericht.PUBLIC_BETA_LAUNCH_READY, "FAIL");
  else assert.equal(bericht.PUBLIC_BETA_LAUNCH_READY, "PASS");
});
