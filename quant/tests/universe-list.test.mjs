/* =========================================================================
   DIE UEBERSICHT SAGT, WER DAS IST UND WAS ES KOSTET.

   Gemessen am 26.09.2026 am GEBAUTEN Release, Zeile fuer Zeile:

       A     | A    | Nicht verfuegbar | 0,5
       AA    | AA   | Nicht verfuegbar | -0,3
       AAAC  | AAAC | Nicht verfuegbar | 0,0

   5 von 6.875 Zeilen trugen einen Kurs (0,07 Prozent), KEINE einen Namen -
   das Feld traegt den Ticker, deshalb stand er zweimal da. Beides war
   veroeffentlicht: 6.482 vertragsgepruefte Tagesreihen und 5.775 Namen im
   Company-Master. Nur lag es je Titel in eigenen Dateien, und eine Liste
   kann keine 646 Namensshards laden.

   Was diese Datei haelt:
     1. Das Verzeichnis nennt seine Deckung selbst und erfindet keinen Kurs.
     2. Der Kurs des Verzeichnisses ist derselbe, den die Aktienseite zeigt -
        fuer die Paneltitel auf den Cent.
     3. Es ueberschreibt nichts: kein vorhandener Kurs, kein vorhandener
        Name, und keine fehlende Freigabe.
     4. Fehlt das Verzeichnis, ist die Liste genau so wie vorher - kein
        Absturz und keine erfundene Luecke.
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
const PFAD = join(ROOT, "quant/data/product/universe-list-v1.json.gz");

const apiMit = (loadCompressedJSON) => Service.create({
  loadJSON: async (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8")),
  loadCompressedJSON: loadCompressedJSON || (async (p) =>
    JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString("utf8"))),
  displayPolicy: Policy, queryEngine: Query
});

test("the index names its own coverage and invents no price", () => {
  if (!existsSync(PFAD)) return;   /* Vor dem ersten Lauf gibt es sie nicht. */
  const index = JSON.parse(gunzipSync(readFileSync(PFAD)).toString("utf8"));
  assert.equal(index.schemaVersion, "universe-list-1.0.0");
  assert.ok(index.coverage.universe > 6000);
  assert.ok(index.coverage.withPrice > 5000, "nur " + index.coverage.withPrice + " Kurse im Verzeichnis");
  assert.ok(index.coverage.withName > 4000, "nur " + index.coverage.withName + " Namen im Verzeichnis");
  assert.equal(index.entries.length, index.coverage.entries);
  const heute = new Date().toISOString().slice(0, 10);
  let mitKurs = 0, mitName = 0;
  for (const e of index.entries) {
    assert.match(e.s, /^[A-Z0-9.-]{1,12}$/);
    if (e.c !== undefined) {
      mitKurs += 1;
      assert.ok(Number.isFinite(e.c) && e.c > 0, e.s + ": Kurs ist keine Zahl");
      assert.match(e.d, /^\d{4}-\d{2}-\d{2}$/, e.s + ": Kurs ohne Datum");
      assert.ok(e.d <= heute, e.s + ": Kurs aus der Zukunft");
    }
    if (e.n !== undefined) { mitName += 1; assert.notEqual(e.n, e.s, e.s + ": Name ist der Ticker"); }
    /* Ein Eintrag ohne beides waere Ballast - und ein Zeichen, dass der
       Bauer etwas anderes tut als er sagt. */
    assert.ok(e.c !== undefined || e.n !== undefined, e.s + ": Eintrag ohne Kurs und ohne Namen");
  }
  assert.equal(mitKurs, index.coverage.withPrice);
  assert.equal(mitName, index.coverage.withName);
});

test("the overview's price is the one the stock page shows", async () => {
  if (!existsSync(PFAD)) return;
  const api = apiMit();
  const universe = await api.getUniverse();
  /* Die Paneltitel sind der harte Fall: sie haben ihren eigenen Kurs, und
     der des Verzeichnisses muss derselbe sein - sonst zeigen Liste und
     Detailseite zwei Zahlen fuer denselben Tag. */
  for (const ticker of ["AAPL", "MSFT", "NVDA", "JPM", "XOM"]) {
    const zeile = universe.stocks.find((s) => s.ticker === ticker);
    const seite = await api.getStockIntelligence(ticker);
    assert.ok(Number.isFinite(zeile.price.value), ticker + ": die Liste nennt keinen Kurs");
    assert.equal(zeile.price.value, seite.price.value,
      ticker + ": Liste und Aktienseite nennen verschiedene Kurse");
  }
  /* Und ein Titel, der seinen Kurs erst durch das Verzeichnis bekommt. */
  const agilent = universe.stocks.find((s) => s.ticker === "A");
  assert.equal(agilent.price.state, "AVAILABLE");
  assert.equal(agilent.price.basis, "PUBLISHED_CLOSE_FROM_SERIES");
  assert.match(agilent.price.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(agilent.name, "A", "die Liste schreibt weiter den Ticker als Namen");
});

test("a price that already exists is not replaced by the index", async () => {
  /* VERHALTEN, NICHT TEXT.
     Der erste Versuch dieses Falls las den Quelltext auf das Vorhandensein
     der Bedingung - und blieb gruen, als die Bedingung aus der Zuweisung
     verschwand, weil derselbe Ausdruck zwei Zeilen tiefer noch einmal
     vorkommt. Ein Test, der Zeichen zaehlt, prueft keine Regel. Deshalb
     liegt hier ein Verzeichnis, das dem Paneltitel AAPL einen ANDEREN Kurs
     anbietet: gewinnen darf der veroeffentlichte. */
  const api = apiMit(async (p) => {
    if (p.includes("universe-list-v1")) {
      return { schemaVersion: "universe-list-1.0.0", generatedAt: "2026-09-26T00:00:00.000Z",
               coverage: { universe: 1, entries: 1, withName: 1, withPrice: 1 },
               entries: [{ s: "AAPL", n: "Falscher Name AG", c: 1.23, d: "2026-09-25", u: "USD" }] };
    }
    return JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString("utf8"));
  });
  const universe = await api.getUniverse();
  const aapl = universe.stocks.find((s) => s.ticker === "AAPL");
  assert.notEqual(aapl.price.value, 1.23, "das Verzeichnis hat den veroeffentlichten Kurs ueberschrieben");
  assert.ok(aapl.price.value > 100, "der Paneltitel hat seinen eigenen Kurs verloren");
  assert.equal(aapl.price.basis, undefined,
    "ein vorhandener Kurs traegt jetzt die Herkunft des Verzeichnisses");
  /* Der NAME dagegen darf kommen: die Breitzeile traegt als Namen den
     Ticker, und genau dieser Platzhalter ist der Grund fuer das Verzeichnis.
     Ein frueherer Entwurf dieses Falls hat beides in einen Satz geworfen und
     deshalb behauptet, auch der Name sei geschuetzt - er ist es nicht, und
     das ist die Absicht. */
  assert.equal(aapl.name, "Falscher Name AG",
    "der Name aus dem Verzeichnis kommt nicht an - dann bleibt die Liste eine Kuerzelliste");
});

test("the index overwrites nothing that already has a value", async () => {
  const services = readFileSync(join(ROOT, "quant/api/product-services.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const stelle = services.indexOf("function mitVerzeichnis(");
  assert.ok(stelle > 0, "die Ergaenzung aus dem Verzeichnis fehlt");
  const koerper = services.slice(stelle, stelle + 1400);
  /* Ein vorhandener Kurs bleibt stehen ... */
  assert.match(koerper, /!Number\.isFinite\(row\.price&&row\.price\.value\)/);
  /* ... ein vorhandener Name bleibt stehen ... */
  assert.match(koerper, /!row\.name\|\|row\.name===row\.ticker/);
  /* ... eine fehlende Freigabe bleibt eine fehlende Freigabe ... */
  assert.match(koerper, /DISPLAY_NOT_PERMITTED/);
  /* ... und ein Eintrag fuer einen anderen Titel wird nicht verwendet. */
  assert.match(koerper, /entry\.s!==row\.ticker/);
});

test("a price dated in the future is refused", async () => {
  /* Ein Verzeichnis, das aus irgendeinem Grund ein Datum von morgen traegt,
     darf keinen Kurs setzen - sonst behauptet die Liste einen Handelstag,
     den es nicht gab. Gebaut wird der Fall mit einem eigenen Verzeichnis,
     nicht durch Manipulation des echten. */
  const morgen = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const api = apiMit(async (p) => {
    if (p.includes("universe-list-v1")) {
      return { schemaVersion: "universe-list-1.0.0", generatedAt: "2026-09-26T00:00:00.000Z",
               coverage: { universe: 1, entries: 1, withName: 1, withPrice: 1 },
               entries: [{ s: "A", n: "Aus der Zukunft AG", c: 999, d: morgen, u: "USD" }] };
    }
    return JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString("utf8"));
  });
  const universe = await api.getUniverse();
  const zeile = universe.stocks.find((s) => s.ticker === "A");
  assert.notEqual(zeile.price.value, 999, "ein Kurs von morgen ist in die Liste gelangt");
  /* Der Name aus demselben Eintrag darf durchaus ankommen - er traegt kein
     Datum, und das Misstrauen gilt der Zahl, nicht dem Wort. */
  assert.equal(zeile.name, "Aus der Zukunft AG");
});

test("without the index the overview is exactly what it was before", async () => {
  const api = apiMit(async (p) => {
    if (p.includes("universe-list-v1")) throw new Error("404");
    return JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString("utf8"));
  });
  const universe = await api.getUniverse();
  assert.equal(universe.state, "AVAILABLE");
  assert.ok(universe.stocks.length > 6000, "ohne Verzeichnis bricht die Liste zusammen");
  const agilent = universe.stocks.find((s) => s.ticker === "A");
  /* Ohne Verzeichnis: kein Name und kein Kurs - und der Grund ist der der
     Breitzeile, nicht einer, der eine gepruefte Reihe behauptet. */
  assert.equal(agilent.name, "A");
  assert.equal(agilent.price.value, null);
  assert.equal(agilent.price.reason, "NO_PUBLISHED_PRICE_LEVEL");
});

test("the builder reads only published sources and calls no provider", () => {
  const source = readFileSync(join(ROOT, "scripts/quant/build-universe-list.mjs"), "utf8");
  for (const verboten of ["fetch(", "https://", "axios", "tiingoRequest", "apiKey", "process.env.TIINGO"]) {
    assert.equal(source.includes(verboten), false,
      "der Bauer greift auf " + verboten + " zu - er soll nur veroeffentlichte Dateien lesen");
  }
  assert.match(source, /market-capability\.json/);
  assert.match(source, /discover-series/);
  assert.match(source, /search\/sym/);
  /* Und er prueft die Reihe mit demselben Vertrag wie die Oberflaeche. */
  assert.match(source, /discover-series-1\.1\.0/);
  assert.match(source, /SPLIT_ADJUSTED/);
  assert.match(source, /publishBasis/);
});
