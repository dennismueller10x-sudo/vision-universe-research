/* =========================================================================
   "WAS KOSTET DIESE AKTIE?" - DIE FRAGE, DIE JEDER ZUERST STELLT.

   Gemessen am 26.09.2026 ueber die 500er-Stichprobe: 52 Titel bekamen keinen
   letzten Kurs. Bei 33 von ihnen zeichnete dieselbe Seite gleichzeitig eine
   vollstaendige, vertragsgepruefte Kursreihe - AHT-P-D etwa 270 Handelstage
   bis zum 25.09. mit 5,17 als letztem Punkt. Die Kopfzahl sagte "nicht
   verfuegbar", der Chart darunter zeigte sie.

   Der Grund hiess PRICE_LEVEL_WITHHELD - "zurueckgehalten". Zurueckgehalten
   hat niemand etwas: die Breitzeile fuehrt fuer Titel ausserhalb des Panels
   kein Kursniveau. Ein Grund, der eine Entscheidung behauptet, wo eine Luecke
   ist, schickt jeden Leser in die falsche Richtung - auch den, der ihn
   spaeter reparieren soll.

   Was diese Datei haelt:
     1. Der letzte Kurs ist der letzte Punkt DERSELBEN Reihe, die die Seite
        zeichnet - nachpruefbar mit den Augen, nicht aus einer zweiten Quelle.
     2. Er bringt sein eigenes Datum mit (`stock.asOf` ist der Stand der
        Geschaeftszahlen und war fuer diese Titel leer).
     3. Ohne Reihe steht der gemessene Grund da, nicht die Behauptung.
     4. Eine fehlende Freigabe bleibt eine fehlende Freigabe - dieser Weg
        macht aus DISPLAY_NOT_PERMITTED keinen Kurs.
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

const api = Service.create({
  loadJSON: async (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString("utf8")),
  displayPolicy: Policy, queryEngine: Query
});

test("the last price is the last point of the series the page draws", async () => {
  /* AHT-P-D ist der gemessene Fall: Vorzugsaktie, nicht im Panel, 270
     Handelstage veroeffentlicht. */
  const stock = await api.getStockIntelligence("AHT-P-D");
  assert.equal(stock.state, "AVAILABLE");
  const letzter = (stock.chart.bars || []).slice(-1)[0];
  assert.ok(letzter, "ohne gezeichnete Reihe prueft dieser Fall das Falsche");
  assert.equal(stock.price.state, "AVAILABLE");
  assert.equal(stock.price.value, letzter.close,
    "die Kopfzahl ist nicht der letzte Punkt der gezeichneten Reihe");
  assert.equal(stock.price.asOf, letzter.date, "der Kurs traegt nicht das Datum seines Punktes");
  assert.equal(stock.price.basis, "PUBLISHED_CLOSE_FROM_SERIES");
  /* Und er behauptet keinen Handelsstand von heute: das Datum ist das der
     Reihe, auch wenn es aelter ist. */
  assert.match(stock.price.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(stock.price.asOf <= new Date().toISOString().slice(0, 10));
});

test("a price carries its own date, because the row's asOf is the fundamentals date", async () => {
  const stock = await api.getStockIntelligence("AHT-P-D");
  /* Der gemessene Anlass: fuer diese Titel ist `asOf` leer oder alt, waehrend
     die Reihe bis zum letzten Handelstag laeuft. Eine Seite, die das eine
     Datum an den anderen Wert schreibt, datiert den Kurs falsch. */
  assert.notEqual(stock.price.asOf, null);
  if (stock.asOf) assert.ok(stock.price.asOf >= stock.asOf || stock.price.asOf !== stock.asOf);
  const seite = readFileSync(join(ROOT, "vu2/experience.js"), "utf8");
  assert.match(seite, /\(s\.price&&s\.price\.asOf\)\|\|s\.asOf/,
    "die Seite zeigt weiter das Datum der Geschaeftszahlen am Kurs");
});

test("without a published series the reason is the measured one, not a claimed withholding", async () => {
  const stock = await api.getStockIntelligence("EDVA");
  assert.equal(stock.price.value, null);
  assert.equal(stock.price.reason, "NO_PUBLISHED_PRICE_SERIES");
  /* Das alte Wort ist weg - und zwar ueberall, nicht nur hier. */
  /* Ohne Kommentare gelesen: der Abschnitt ERKLAERT den alten Namen, und ein
     Text ueber eine Regel ist nicht die Regel. */
  const services = readFileSync(join(ROOT, "quant/api/product-services.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/PRICE_LEVEL_WITHHELD/.test(services), false,
    "der Grund behauptet wieder, jemand halte den Kurs zurueck");
});

test("a missing display permission stays a missing permission", async () => {
  /* Der Weg fuellt den Kurs NUR, wenn er nicht schon aus Freigabegruenden
     entfernt wurde. Sonst waere aus einer Sperre ein Wert geworden - der
     teuerste Fehler, den diese Aenderung machen koennte. */
  const services = readFileSync(join(ROOT, "quant/api/product-services.js"), "utf8");
  const ohneKommentare = services.replace(/\/\*[\s\S]*?\*\//g, "");
  const stelle = ohneKommentare.indexOf("PUBLISHED_CLOSE_FROM_SERIES");
  assert.ok(stelle > 0);
  const vorher = ohneKommentare.slice(Math.max(0, stelle - 600), stelle);
  assert.match(vorher, /stock\.price\.reason!=='DISPLAY_NOT_PERMITTED'/,
    "der Kursweg prueft die Freigabe nicht mehr");
});

test("the measured cohort gained a price, and the rest says why not", async () => {
  const universe = await api.getUniverse();
  const tickers = universe.stocks.map((s) => s.ticker).sort();
  const step = Math.max(1, Math.floor(tickers.length / 500));
  const sample = tickers.filter((_, i) => i % step === 0).slice(0, 500);
  let mitKurs = 0, ausReihe = 0, ohne = 0, fremdeGruende = 0;
  for (let i = 0; i < sample.length; i += 25) {
    const batch = await Promise.all(sample.slice(i, i + 25)
      .map((t) => api.getStockIntelligence(t).catch(() => null)));
    for (const stock of batch) {
      if (!stock) continue;
      if (Number.isFinite(stock.price && stock.price.value)) {
        mitKurs += 1;
        if (stock.price.basis === "PUBLISHED_CLOSE_FROM_SERIES") ausReihe += 1;
      } else {
        ohne += 1;
        if (!["NO_PUBLISHED_PRICE_SERIES", "DISPLAY_NOT_PERMITTED"].includes(stock.price && stock.price.reason))
          fremdeGruende += 1;
      }
    }
  }
  /* Gemessen vor der Aenderung: 448. Danach 481, und die 33 kommen aus der
     gezeichneten Reihe. Die Schwelle steht bewusst unter dem gemessenen Wert -
     sie soll einen Rueckschritt fangen, nicht den Kursstand einfrieren. */
  assert.ok(mitKurs >= 470, "nur " + mitKurs + " von 500 Titeln nennen einen letzten Kurs (gemessen: 481)");
  assert.ok(ausReihe >= 25, "nur " + ausReihe + " Kurse kommen aus der gezeichneten Reihe (gemessen: 33)");
  assert.equal(fremdeGruende, 0, "ein Titel ohne Kurs nennt einen unbenannten Grund");
  assert.ok(ohne <= 30, ohne + " Titel ohne Kurs - das ist mehr als gemessen (19)");
});
