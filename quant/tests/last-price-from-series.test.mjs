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

   Frontend-Rebuild (quant/app): Prüfintention erhalten – Punkt 2 prüfte ein
   Quelltextmuster in vu2/experience.js (geloescht). Jetzt wird der Kopf der
   neuen Aktienseite (quant/app/page-stock.js) in einem DOM-Doppel mit den
   echten Dateien gezeichnet und das Datum AM KURS gelesen. Punkt 4 gilt
   auch fuer die Kopfzahl der Seite: sie darf einen gesperrten Kurs nicht
   aus der gezeichneten Reihe nachholen.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

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
  /* Die Seite schreibt das Datum DES KURSES an den Kurs - gelesen am
     gezeichneten Kopf, nicht am Quelltext. Damit der Fall etwas prueft,
     bekommt die Antwort ein abweichendes Geschaeftszahlen-Datum. */
  const probe = { ...stock, asOf: "2020-01-31" };
  const kopf = await kopfDerAktienseite(probe);
  const kurs = knoten(kopf, (n) => /(^| )qx-quote( |$)/.test(n.className))[0];
  assert.ok(kurs, "die Aktienseite zeichnet keine Kurszeile");
  const [j, m, t] = stock.price.asOf.split("-");
  assert.ok(kurs.textContent.includes(t + "." + m + "." + j) || kurs.textContent.includes(stock.price.asOf),
    "die Seite schreibt nicht das Datum des Kurses an den Kurs: " + kurs.textContent);
  assert.equal(/31\.01\.2020|2020-01-31/.test(kurs.textContent), false,
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
  /* VERHALTEN, NICHT TEXT.
     Dieser Fall las zuerst die 600 Zeichen vor der ersten Fundstelle von
     PUBLISHED_CLOSE_FROM_SERIES und suchte dort die Freigabepruefung. Als
     eine ZWEITE Fundstelle entstand (dieselbe Regel fuer die Uebersicht),
     sah er an der falschen Stelle nach und fiel - obwohl beide Wege die
     Pruefung haben. Ein Test, der Zeichen zaehlt, prueft keine Regel.

     Hier verweigert eine eigene Anzeigepolitik die Rohanzeige fuer genau
     einen Titel. Der darf danach keinen Kurs tragen - auch nicht den aus der
     gezeichneten Reihe, und auch nicht in der Liste. */
  const gesperrt = "AHT-P-D";
  /* Ein vollstaendiger Stellvertreter, nicht nur `check`: die Dienstschicht
     benutzt die Politik an mehreren Stellen, und ein Stummel ohne die
     uebrigen Methoden laesst sie in den Identitaetspfad fallen - dann hat die
     Antwort gar kein `price`, und der Fall prueft nichts. */
  const strenge = Object.assign(Object.create(Object.getPrototypeOf(Policy)), Policy, {
    check: (args) => args && args.ticker === gesperrt && args.form === "raw"
      ? { allowed: false, reason: "TEST_GESPERRT" }
      : Policy.check(args)
  });
  const api = Service.create({
    loadJSON: async (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8")),
    loadCompressedJSON: async (p) => JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString("utf8")),
    displayPolicy: strenge, queryEngine: Query
  });
  const stock = await api.getStockIntelligence(gesperrt);
  assert.equal(stock.price.value, null, "ein gesperrter Titel hat einen Kurs bekommen");
  assert.equal(stock.price.reason, "DISPLAY_NOT_PERMITTED");
  const universe = await api.getUniverse();
  const zeile = universe.stocks.find((s) => s.ticker === gesperrt);
  assert.equal(zeile.price.value, null, "die Uebersicht zeigt den Kurs eines gesperrten Titels");
  assert.equal(zeile.price.reason, "DISPLAY_NOT_PERMITTED");
  /* Gegenprobe im selben Fall: ein NICHT gesperrter Titel bekommt seinen
     Kurs weiterhin - sonst wuerde dieser Test auch bestehen, wenn der ganze
     Weg tot waere. */
  const offen = await api.getStockIntelligence("ALL-P-B");
  assert.ok(Number.isFinite(offen.price.value), "der offene Titel hat keinen Kurs - der Weg ist tot");

  /* Und die Kopfzahl der Aktienseite holt den gesperrten Kurs nicht aus der
     gezeichneten Reihe nach. Die alte Seite schrieb nur stock.price; die neue
     darf keinen zweiten Weg zur Zahl haben. Gegenprobe: der offene Titel
     zeigt seinen Kurs. */
  const zahl = (kopf) => {
    const kurs = knoten(kopf, (n) => /(^| )qx-quote( |$)/.test(n.className))[0];
    assert.ok(kurs, "die Aktienseite zeichnet keine Kurszeile");
    return knoten(kurs, (n) => n.tagName === "B")[0].textContent;
  };
  assert.equal(/\d/.test(zahl(await kopfDerAktienseite(stock))), false,
    "die Aktienseite zeigt fuer einen gesperrten Titel trotzdem einen Kurs (aus der Chartreihe)");
  assert.match(zahl(await kopfDerAktienseite(offen)), /\d/, "der offene Titel zeigt keinen Kurs - der Weg ist tot");
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

/* ------------------------------------------------------------------------
   DIE SEITE AUSGEFUEHRT, NICHT GELESEN.

   Ein kleines DOM-Doppel, in dem die echten Dateien der neuen Oberflaeche
   laufen (quant/ui/shell.js fuer el(), quant/app/view-model.js, ui.js,
   page-stock.js). Geprueft wird, was im Kopf der Aktienseite STEHT - nicht,
   welche Zeichenfolge im Quelltext vorkommt. Alle Abfragen nach dem Kopf
   bleiben absichtlich offen: der Kopf steht, bevor die Seite auf Faktoren,
   Setup und Chart wartet, und genau er wird hier gelesen.
   ------------------------------------------------------------------------ */
function seitenUmgebung() {
  const textNode = (s) => ({ nodeType: 3, textContent: String(s), children: [] });
  function element(tag) {
    return {
      tagName: String(tag).toUpperCase(), nodeType: 1, children: [], attributes: {}, dataset: {}, style: {},
      listeners: {}, className: "", _text: "", open: false, value: "", disabled: false,
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); },
      set textContent(v) { this._text = String(v); this.children = []; },
      get firstChild() { return this.children[0] || null; },
      get isConnected() { return true; },
      appendChild(c) { this.children.push(c); return c; },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
      append(...k) { for (const c of k) if (c !== null && c !== undefined) this.appendChild(typeof c === "string" ? textNode(c) : c); },
      replaceChildren(...k) { this.children = []; this._text = ""; this.append(...k); },
      setAttribute(k, v) { this.attributes[k] = String(v); if (k === "id") this.id = String(v); },
      getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; },
      removeAttribute(k) { delete this.attributes[k]; },
      addEventListener(k, f) { (this.listeners[k] ||= []).push(f); },
      removeEventListener() {}, dispatchEvent() {},
      querySelector() { return null; }, querySelectorAll() { return []; },
      getBoundingClientRect() { return { width: 640, height: 320, left: 0, top: 0 }; },
      scrollIntoView() {}, focus() {}, showModal() { this.open = true; }, close() { this.open = false; }
    };
  }
  const document = { createElement: element, createElementNS: (_, t) => element(t), createTextNode: textNode,
    body: element("body"), readyState: "loading", title: "", activeElement: null,
    addEventListener() {}, querySelector: () => null, getElementById: () => null };
  const win = { document, console, setTimeout, clearTimeout, URLSearchParams, Event: class {},
    location: { hash: "", search: "", pathname: "/quant/" }, history: { replaceState() {} },
    localStorage: { getItem: () => null, setItem() {} }, innerWidth: 1200,
    addEventListener() {}, removeEventListener() {}, scrollTo() {} };
  win.window = win;
  vm.createContext(win);
  const lade = (...pfade) => { for (const p of pfade) vm.runInContext(readFileSync(join(ROOT, p), "utf8"), win, { filename: p }); };
  return { win, document, lade };
}
function knoten(node, pred, out = []) {
  if (!node || !node.children) return out;
  if (node.nodeType === 1 && pred(node)) out.push(node);
  for (const c of node.children) knoten(c, pred, out);
  return out;
}
/* Der Kopf der Aktienseite fuer genau diese Dienstantwort. */
async function kopfDerAktienseite(stock) {
  const { win, document, lade } = seitenUmgebung();
  lade("quant/ui/shell.js", "quant/engines/plain-verdict.js", "quant/app/view-model.js", "quant/app/ui.js", "quant/app/page-stock.js");
  const main = document.createElement("main");
  const offen = () => new Promise(() => {});
  const api = new Proxy({ getIntelligenceBrief: async () => null, getStockIntelligence: async () => stock },
    { get: (t, k) => (k in t ? t[k] : offen) });
  /* Namensverzeichnis leer und sofort da: der Kopf nennt dann, was der
     Dienst fuer DIESEN Titel liefert. Alles andere bleibt offen. */
  const ctx = new Proxy({ api, names: {}, types: {}, entries: {}, loadNames: async () => ({}) },
    { get: (t, k) => (k in t ? t[k] : offen) });
  win.QXStock.render(main, stock.ticker, ctx);
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  const kopf = main.children.find((c) => knoten(c, (n) => n.tagName === "H1").length);
  assert.ok(kopf, "die Aktienseite hat fuer " + stock.ticker + " keinen Kopf gezeichnet");
  return kopf;
}
