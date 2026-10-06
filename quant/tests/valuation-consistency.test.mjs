/* =========================================================================
   DREI WEGE ZU EINER BEWERTUNG - UND NUR EINER HIELT SICH AN DIE SEMANTIK.

   Gemessen am 26.09.2026 über die veröffentlichten Artefakte: von den 465
   Titeln, deren Börsenwert M34 ausdrücklich zurückhält, trugen 266 drei
   Zeilen tiefer doch eine Bewertungszahl.

     GOOGL   Bewertung zurückgehalten · Kurs-Gewinn-Verhältnis 17,27,
             Kurs-Umsatz-Verhältnis 9,32
     T       zurückgehalten · 8,4 und 1,52
     JPM     zurückgehalten · Ertragsrendite 4,62 % aus einem Börsenwert
             von 1.408 Mrd.

   Die Faktorschicht sagte „wird bewusst zurückgehalten, weil die Aktienzahl
   dem Unternehmen und nicht dieser Notierung gilt"; die Kennzahlenschicht
   nannte genau die Zahl, die daraus entsteht. Nachgerechnet und nicht
   vermutet: `f_ps` ist „Kurs × Aktien / Umsatz", `f_fcfYield` ist „Free
   Cashflow / (Kurs × Aktien)", `f_pe` ist „Kurs / (Gewinn / Aktien)" - alle
   drei tragen die Aktienzahl des Emittenten.

   Was hier gehalten wird: wo die Faktorschicht zurückhält, hält jede Schicht
   zurück - und sagt den Grund, statt „Daten fehlen" zu behaupten. Es fehlt
   nichts; es wird eine Zahl nicht genannt, die sich nur schätzen ließe.

   Frontend-Rebuild (quant/app): Prüfintention erhalten – die Flaechen-Tests
   (KENNZAHL_GRUND, kennzahlGrund, "Bewusst nicht genannt", selected={...})
   prueften Quelltext in vu2/experience.js, das geloescht ist. Der Grundsatz
   steht jetzt in quant/app/view-model.js (REASON / reasonText, per
   require() geprueft), der Kennzahlenkasten ist der Abschnitt
   "Unternehmenszahlen" von quant/app/page-stock.js - er wird in einem
   DOM-Doppel mit den echten Dateien gezeichnet und gelesen.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const Service = require(join(ROOT, "quant/api/product-services.js"));
const Policy = require(join(ROOT, "quant/engines/display-policy.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));
const FundamentalInputs = require(join(ROOT, "quant/engines/fundamental-inputs.js"));

const api = Service.create({
  loadJSON: async (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString("utf8")),
  displayPolicy: Policy, queryEngine: Query
});

const GRUND = "SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING";
/* Die prominenten Fälle aus der Messung - sie stehen hier, weil der Auftrag
   ausdrücklich nach ihnen fragt, nicht als Sonderlogik. */
const ZURUECKGEHALTEN = ["GOOGL", "GOOG", "JPM", "T", "SO", "AGNC"];
const UNBERUEHRT = ["AAPL", "MSFT", "NVDA"];

test("die Liste der bewertungsabhängigen Kennzahlen deckt beide Arbeitsflächen", () => {
  const liste = FundamentalInputs.MARKET_CAP_DEPENDENT_PRODUCT_METRICS;
  /* Der Konsum-Export, die Panel-Arbeitsfläche und die breite - alle drei
     Wege, über die eine Bewertungszahl eine Seite erreichen kann. */
  for (const key of ["pe", "ps", "fcfYield", "earningsYield", "evToSales", "evToEbitda",
    "priceToFcf", "priceEarnings", "priceSales"]) {
    assert.ok(liste.includes(key), "die Sperrliste kennt '" + key + "' nicht");
  }
  /* Und die Bewertungsfamilie BEIDER Arbeitsflächen ist vollständig erfasst:
     eine Kennzahl der Familie „Bewertung", die nicht in der Liste steht,
     wäre genau die Lücke, die diesen Fehler erzeugt hat. */
  const panel = readFileSync(join(ROOT, "quant/api/quant-workspace-contract.js"), "utf8");
  const familie = panel.slice(panel.indexOf("['value',"), panel.indexOf("]]", panel.indexOf("['value',")));
  for (const treffer of familie.matchAll(/'([a-zA-Z]+)'/g)) {
    if (treffer[1] === "value" || treffer[1] === "Bewertung") continue;
    if (/^[A-Z]/.test(treffer[1]) || treffer[1].length < 3) continue;
    assert.ok(liste.includes(treffer[1]),
      "die Bewertungsfamilie der Panel-Arbeitsfläche führt '" + treffer[1] + "', die Sperrliste nicht");
  }
});

test("wo der Börsenwert zurückgehalten wird, nennt keine Schicht eine Bewertungszahl", async () => {
  let geprueft = 0;
  for (const ticker of ZURUECKGEHALTEN) {
    const s = await api.getStockIntelligence(ticker);
    if (s.marketCapReason !== GRUND) continue;
    geprueft += 1;
    assert.ok(s.valuationWithheld, ticker + ": die Zurückhaltung ist nicht vermerkt");
    assert.equal(s.valuationWithheld.reason, GRUND);
    /* Der Konsum-Export. */
    for (const key of ["pe", "ps", "fcfYield"]) {
      if (!s[key]) continue;
      assert.equal(Number.isFinite(s[key].value), false, ticker + ": " + key + " trägt trotzdem eine Zahl");
      assert.equal(s[key].reason, GRUND, ticker + ": " + key + " nennt nicht den richtigen Grund");
    }
    /* Die Rohwerte dahinter, damit keine Fläche sie am Modell vorbei liest. */
    for (const key of ["f_pe", "f_ps", "f_fcfYield"]) {
      if (s.consumerMetrics && key in s.consumerMetrics) {
        assert.equal(s.consumerMetrics[key], null, ticker + ": Rohwert " + key + " ist noch da");
      }
    }
    /* Die Arbeitsfläche - über beide Wege. */
    for (const quelle of [s.quant, await api.getQuantWorkspace(ticker)]) {
      for (const family of (quelle && quelle.families) || []) {
        for (const m of family.metrics || []) {
          if (!FundamentalInputs.MARKET_CAP_DEPENDENT_PRODUCT_METRICS.includes(m.metricId)) continue;
          assert.equal(Number.isFinite(m.value), false, ticker + ": " + m.metricId + " trägt trotzdem eine Zahl");
        }
      }
    }
  }
  assert.ok(geprueft >= 4, "nur " + geprueft + " der prominenten Fälle sind zurückgehalten");
});

test("ein Titel ohne Zurückhaltung verliert keine einzige Kennzahl", async () => {
  /* Die Gegenprobe: eine Sperre, die zu weit greift, wäre schlimmer als
     keine - sie nähme 6.400 Titeln ihre Bewertung, um 465 zu schützen. */
  for (const ticker of UNBERUEHRT) {
    const s = await api.getStockIntelligence(ticker);
    assert.notEqual(s.marketCapReason, GRUND, ticker + ": unerwartet zurückgehalten");
    assert.equal(s.valuationWithheld, undefined, ticker + ": trägt einen Zurückhaltungsvermerk");
    const werte = [];
    for (const family of (s.quant && s.quant.families) || []) {
      for (const m of family.metrics || []) if (Number.isFinite(m.value)) werte.push(m.metricId);
    }
    assert.ok(werte.length >= 6, ticker + ": nur " + werte.length + " Kennzahlen mit Wert");
  }
});

test("der Bestand ist vollständig abgedeckt - kein Titel entgeht der Regel", () => {
  /* Die Regel greift über das Verzeichnis. Also muss das Verzeichnis JEDEN
     Titel kennen, den die Faktorschicht zurückhält - sonst gäbe es Seiten,
     die die Entscheidung nicht erfahren, und genau das war der Fehler. */
  const faktorDir = join(ROOT, "quant/data/product/factor-evidence-v1");
  const listePfad = join(ROOT, "quant/data/product/universe-list-v1.json.gz");
  if (!existsSync(faktorDir) || !existsSync(listePfad)) return;
  const liste = JSON.parse(gunzipSync(readFileSync(listePfad)).toString("utf8"));
  if (liste.schemaVersion === "universe-list-1.0.0") return;
  const imVerzeichnis = new Map(liste.entries.map((e) => [e.s, e.v || null]));
  const fehlen = [];
  let zurueck = 0;
  for (const datei of readdirSync(faktorDir)) {
    if (!datei.endsWith(".json.gz") || datei === "screening.json.gz" || datei === "summary.json.gz") continue;
    const shard = JSON.parse(gunzipSync(readFileSync(join(faktorDir, datei))).toString("utf8"));
    for (const [ticker, src] of Object.entries(shard.securities || {})) {
      if (src.marketCapReason !== GRUND) continue;
      zurueck += 1;
      if (imVerzeichnis.get(ticker) !== GRUND) fehlen.push(ticker);
    }
  }
  assert.ok(zurueck > 100, "nur " + zurueck + " zurückgehaltene Bewertungen gefunden");
  assert.deepEqual(fehlen.slice(0, 10), [],
    fehlen.length + " von " + zurueck + " zurückgehaltenen Titeln fehlen im Verzeichnis");
});

const VM = require(join(ROOT, "quant/app/view-model.js"));

test("statt der Zahl steht der Grund - nicht der Satz, dass Daten fehlen", async () => {
  /* Das Wörterbuch verlangt für „nicht vorhanden" und „bewusst
     zurückgehalten" zwei verschiedene Texte. Der Unterschied ist der ganze
     Punkt: im ersten Fall fehlt etwas, im zweiten hat das Haus sich
     entschieden. */
  assert.ok(VM.REASON && Object.prototype.hasOwnProperty.call(VM.REASON, GRUND),
    "der Grund ist im View Model nicht zugeordnet");
  const satz = VM.reasonText(GRUND);
  /* Kein Rueckfall auf den allgemeinen Satz "es fehlen Daten". */
  assert.notEqual(satz, VM.reasonText("__UNBEKANNT__"), "der Grund faellt auf den Satz zurueck, dass Daten fehlen");
  assert.notEqual(satz, VM.reasonText("INPUT_NOT_MATERIALIZED"), "zurückgehalten liest sich wie nicht vorhanden");
  assert.ok(satz.length > 200, "der Satz ist zu kurz, um etwas zu erklären (" + satz.length + " Zeichen): " + satz);
  assert.equal(/[A-Z]{3,}_[A-Z_]{3,}/.test(satz), false, "interner Code im Nutzersatz: " + satz.slice(0, 160));

  /* Und die Fläche ruft ihn auf, statt die Zahl stumm wegzulassen: der
     Kennzahlenkasten eines zurückgehaltenen Titels sagt, dass die
     Bewertung bewusst nicht genannt wird - und warum. */
  let geprueft = 0;
  for (const ticker of ZURUECKGEHALTEN) {
    const s = await api.getStockIntelligence(ticker);
    if (s.marketCapReason !== GRUND || !s.quant || s.quant.state !== "AVAILABLE") continue;
    const kasten = await zahlenAbschnitt(s);
    if (!kasten) continue;
    geprueft += 1;
    const text = kasten.textContent;
    assert.match(text, /[Bb]ewusst nicht genannt/, ticker + ": der Kasten laesst die Bewertung stumm weg: " + text.slice(0, 300));
    assert.ok(text.includes(satz), ticker + ": der Kasten nennt den Grund nicht");
    assert.equal(/[A-Z]{3,}_[A-Z_]{3,}/.test(text), false, ticker + ": interner Code im Kasten");
    break;
  }
  assert.ok(geprueft >= 1, "kein zurückgehaltener Titel mit Kennzahlenkasten gefunden - dann prueft dieser Fall nichts");
});

test("ein Kennzahlenkasten ohne eine einzige Zeile entsteht nicht", async () => {
  /* Gemessen: der Panelweg liefert die Bewertungsfamilie als
     earningsYield/priceToFcf, der breite als priceEarnings/priceSales.
     Die Auswahl der Seite kannte nur die ersten - für jeden Titel ausserhalb
     des Panels stand die Frage „Welcher Preis steht dem Geschäft
     gegenüber?" über einem leeren Kasten.
     Die Auswahl steht jetzt in page-stock.js (figuresSection, `wanted`). */
  const seite = readFileSync(join(ROOT, "quant/app/page-stock.js"), "utf8");
  const start = seite.indexOf("var wanted = {");
  assert.ok(start > 0, "die Kennzahlenauswahl der Aktienseite ist nicht auffindbar");
  const auswahl = seite.slice(start, seite.indexOf("};", start));
  for (const key of ["earningsYield", "priceToFcf", "priceEarnings", "priceSales"]) {
    assert.ok(auswahl.includes(key), "die Auswahl der Bewertungsfamilie kennt '" + key + "' nicht");
  }
  /* Verhalten dazu: über beide Wege trägt die Bewertungsfamilie mindestens
     eine Kennzahl, die die Seite auch auswählt - und der gezeichnete Kasten
     hat Zeilen. Ein Kasten ohne Zeile entsteht in KEINER Form: entweder
     Kennzahlen oder ein Satz, warum keine. */
  const AUSGEWAEHLT = ["earningsYield", "priceToFcf", "priceEarnings", "priceSales"];
  for (const ticker of ["AAPL", "WBD"]) {
    const s = await api.getStockIntelligence(ticker);
    const familie = (s.quant && s.quant.families || []).find((f) => f.id === "value");
    if (!familie) continue;
    const treffer = (familie.metrics || []).filter((m) => AUSGEWAEHLT.includes(m.metricId));
    assert.ok(treffer.length > 0, ticker + ": die Bewertungsfamilie trägt keine Kennzahl der Auswahl");
    const kasten = await zahlenAbschnitt(s);
    assert.ok(kasten, ticker + ": die Seite zeichnet keinen Kennzahlenkasten");
    const zeilen = knoten(kasten, (n) => /(^| )qx-stat( |$)/.test(n.className));
    assert.ok(zeilen.length > 0, ticker + ": der Kennzahlenkasten hat keine einzige Zeile");
    assert.ok(zeilen.some((z) => treffer.some((m) => z.textContent.includes(m.label))),
      ticker + ": keine Bewertungskennzahl im Kasten");
  }
  /* Und ohne eine einzige zeigbare Kennzahl steht ein Satz statt eines
     leeren Kastens. */
  const leer = await zahlenAbschnitt({ ticker: "LEER", state: "AVAILABLE", identityState: "AVAILABLE", name: "Leer AG",
    quant: { state: "AVAILABLE", families: [{ id: "value", metrics: [{ metricId: "priceSales", state: "UNAVAILABLE", value: null }] }] } });
  assert.ok(leer, "ohne Kennzahl verschwindet der Abschnitt - dann fehlt der Satz, warum");
  assert.equal(knoten(leer, (n) => /(^| )qx-stats( |$)/.test(n.className)).length, 0, "ein leerer Kennzahlenkasten ist entstanden");
  assert.ok(knoten(leer, (n) => n.getAttribute && n.getAttribute("role") === "note").length > 0, "statt des leeren Kastens steht kein Satz");
});

/* ------------------------------------------------------------------------
   DIE SEITE AUSGEFUEHRT, NICHT GELESEN.

   Ein kleines DOM-Doppel, in dem die echten Dateien der neuen Oberflaeche
   laufen (quant/ui/shell.js fuer el(), quant/app/view-model.js, ui.js,
   page-stock.js). Geprueft wird, was im Kopf der Aktienseite STEHT - nicht,
   welche Zeichenfolge im Quelltext vorkommt. Hier: der Abschnitt
   "Unternehmenszahlen" (id "zahlen") der fertig gezeichneten Seite. Der
   Chart ist ein Doppel; alle Abfragen ausser getStockIntelligence
   antworten mit null - geprueft wird, was die Seite aus der
   Dienstantwort dieses Titels macht.
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
async function zahlenAbschnitt(stock) {
  const { win, document, lade } = seitenUmgebung();
  lade("quant/ui/shell.js", "quant/engines/plain-verdict.js", "quant/app/view-model.js", "quant/app/ui.js", "quant/app/page-stock.js");
  win.VUQuantChart = { create: () => ({ node: document.createElement("section"), dispose() {} }) };
  const main = document.createElement("main");
  const nichts = async () => null;
  const dienst = new Proxy({ getStockIntelligence: async () => stock }, { get: (t, k) => (k in t ? t[k] : nichts) });
  const ctx = new Proxy({ api: dienst, names: {}, types: {}, entries: {}, loadNames: async () => ({}),
    patternWords: async () => ({}), hubReady: async () => false, distribution: async () => { throw new Error("offline"); } },
  { get: (t, k) => (k in t ? t[k] : nichts) });
  await win.QXStock.render(main, stock.ticker, ctx);
  return knoten(main, (n) => n.id === "zahlen")[0] || null;
}
