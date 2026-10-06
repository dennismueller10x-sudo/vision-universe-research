/* =========================================================================
   DER CHART DER AKTIENSEITE TRAEGT DIE BASIS, DIE SEIN VERTRAG BINDET.

   Der Befund vom 25.09.2026: die Aktienseite zeichnete die Rohkurse des
   Anbieters. Bei NVDA faellt der 10:1-Split vom 10.06.2024 in die Fenster
   3J, 5J, 10J und Max - 1.208,88 am Vortag, 121,79 am Splittag, also minus
   89,9 Prozent an einem Tag, die es nie gab. Bei AAPL dasselbe mit dem 4:1
   vom 31.08.2020 in 10J und Max.

   Option C bindet das Modul `chart` auf SPLIT_ADJUSTED_PRICE. Diese Datei
   haelt beides fest: dass der Befund echt war (an den gelieferten Daten)
   und dass die gezeichnete Reihe ihn nicht mehr enthaelt.

   Frontend-Rebuild (quant/app): Prüfintention erhalten – die Bildunterschrift
   stand in vu2/experience.js (chartBasis, geloescht). Der Chart der
   Aktienseite ist jetzt quant/app/chart.js (VUQuantChart.create), und
   page-stock.js reicht ihm die Basis aus s.chart.adjustmentStatus. Die
   Unterschrift wird ausgefuehrt und gelesen - fuer beide Basen - und die
   kanonische Seite quant/index.html muss return-series.js laden.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const Series = require("../engines/return-series.js");
const ROOT = new URL("../../", import.meta.url);
const services = readFileSync(new URL("quant/api/product-services.js", ROOT), "utf8");
const ROOT_PATH = ROOT.pathname;

const GOLDEN = ["ref_NVDA", "ref_AAPL", "ref_MSFT", "ref_JPM", "ref_XOM"];
function payload(id) {
  const file = new URL("quant/data/market/golden-preview/daily/" + id + ".json", ROOT);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

test("the delivered series really does jump at a split - the finding was not hypothetical", () => {
  const nvda = payload("ref_NVDA");
  if (!nvda) return;   /* Der Vorschau-Ausschnitt ist nicht in jedem Baum da. */
  const i = nvda.bars.findIndex((bar) => bar.date === "2024-06-10");
  assert.ok(i > 0, "der Splittag fehlt in der Reihe");
  assert.equal(nvda.bars[i].splitFactor, 10);
  const roh = nvda.bars[i].close / nvda.bars[i - 1].close - 1;
  assert.ok(roh < -0.85, "der Rohkurs springt nicht - dann ist dieser Test wertlos");
});

test("the reconstructed series has no day that a split invented", () => {
  for (const id of GOLDEN) {
    const p = payload(id);
    if (!p) continue;
    const close = Series.splitAdjustedColumn(p.bars, "close");
    for (let i = 1; i < close.length; i++) {
      if (!(close[i] > 0) || !(close[i - 1] > 0)) continue;
      const change = close[i] / close[i - 1] - 1;
      /* 25 Prozent an einem Tag gibt es wirklich; 85 nicht, und ein
         nicht bereinigter 10:1 liegt bei 90. */
      assert.ok(Math.abs(change) < 0.6,
        id + " springt am " + p.bars[i].date + " um " + Math.round(change * 1000) / 10 + " %");
    }
  }
});

test("the reconstruction keeps the traded price and only rescales the past", () => {
  for (const id of GOLDEN) {
    const p = payload(id);
    if (!p) continue;
    const close = Series.splitAdjustedColumn(p.bars, "close");
    /* Der letzte Kurs bleibt der gehandelte - genau das sagt die
       Bildunterschrift, und genau das muss gelten. */
    assert.equal(close[close.length - 1], p.bars[p.bars.length - 1].close);
    /* Und jede Rendite ueber einen splitfreien Abschnitt bleibt gleich. */
    for (let i = 1; i < p.bars.length; i++) {
      if (p.bars[i].splitFactor !== 1) continue;
      const roh = p.bars[i].close / p.bars[i - 1].close - 1;
      const bereinigt = close[i] / close[i - 1] - 1;
      assert.ok(Math.abs(roh - bereinigt) < 1e-9, id + " " + p.bars[i].date);
    }
  }
});

test("the service reconstructs rather than picking a column, and says which it did", () => {
  /* Die Rekonstruktion kommt aus return-series - nicht aus einer zweiten
     Rechnung in der Dienstschicht, und ausdruecklich nicht aus der
     dividendenbereinigten Spalte des Anbieters. */
  assert.match(services, /ReturnSeries\.splitAdjustedColumn\(bars,'close'\)/);
  assert.equal(/adjustedClose/.test(services.slice(services.indexOf("golden-preview/daily"),
    services.indexOf("stock._factorValues"))), false,
    "die bereinigte Spalte des Anbieters wird im Chartpfad gelesen");
  assert.match(services, /priceSource:splitbereinigt\?'RECONSTRUCTED_FROM_SPLIT_FACTOR':'PROVIDER_RAW_CLOSE'/);
  /* Fehlt ein Baustein, geht die Stufe ehrlich als 'unadjusted' hinaus. */
  assert.match(services, /adjustmentStatus:splitbereinigt\?'splitAdjusted':'unadjusted'/);
});

/* Die Unterschrift des gezeichneten Zeitraums fuer genau diese Basis. */
async function unterschrift(adjusted, splitEvents) {
  const { win, lade } = seitenUmgebung();
  lade("quant/ui/shell.js", "quant/app/ui.js", "quant/app/chart.js");
  /* Die Zeichenkomponente selbst ist Discover-Code und hier nicht Thema:
     ein Doppel, das ein SVG-Stellvertreter liefert. Geprueft wird der Text
     darunter. */
  win.VUDiscover = { MicroChart: { renderRange: () => ({ classList: { add() {} }, getAttribute: () => null, nodeType: 1, children: [], textContent: "" }) } };
  const eod = [];
  for (let d = new Date("2025-06-02T00:00:00Z"); eod.length < 300; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    eod.push([d.toISOString().slice(0, 10), 100 + eod.length / 10]);
  }
  const chart = win.VUQuantChart.create({ ticker: "NVDA", eod, currency: "USD", adjusted, splitEvents });
  chart.draw("1Y");
  const note = knoten(chart.node, (n) => /(^| )qc-note( |$)/.test(n.className))[0];
  assert.ok(note, "der Chart hat keine Bildunterschrift");
  chart.dispose();
  return note.textContent;
}

test("the caption follows the series instead of asserting a basis", async () => {
  /* Vorher drei Quelltextmuster in experience.js (chartBasis aus
     adjustmentStatus, zwei Saetze). Jetzt ausgefuehrt: dieselbe Komponente,
     zwei Basen, zwei Saetze. */
  const bereinigt = await unterschrift(true, 1);
  assert.match(bereinigt, /[Ss]plitbereinigt/);
  assert.match(bereinigt, /Split.{0,20}herausgerechnet/);
  assert.match(bereinigt, /USD/);
  /* Der bereinigte Fall behauptet keine Kurssprünge ... */
  assert.equal(/nicht splitbereinigt|Kurssprung/.test(bereinigt), false,
    "die bereinigte Reihe traegt den Satz der unbereinigten: " + bereinigt);
  /* ... und der unbereinigte sagt, dass sie erscheinen koennen. */
  const roh = await unterschrift(false, 0);
  assert.match(roh, /nicht splitbereinigt/);
  assert.match(roh, /Splits können als Kurssprung erscheinen/);
  /* Der alte, feste Satz ist weg - nicht danebengestellt. */
  for (const text of [bereinigt, roh]) {
    assert.equal(/Unbereinigte Schlusskurse · USD\. Splits können historische Kurssprünge verursachen\./.test(text), false);
  }
  /* Die Aktienseite leitet die Basis aus dem Vertrag ab und setzt sie nicht
     fest. */
  const seite = readFileSync(new URL("quant/app/page-stock.js", ROOT), "utf8");
  /* Beide Schreibweisen derselben Aussage: "splitAdjusted" (Golden-Rekonstruktion)
     und "SPLIT_ADJUSTED" (veroeffentlichte Reihe aller anderen Titel). */
  assert.match(seite, /adjusted: !!\(s\.chart && \/\^\(splitAdjusted\|SPLIT_ADJUSTED\)\$\/\.test\(s\.chart\.adjustmentStatus/,
    "die Aktienseite leitet die Basis des Charts nicht aus adjustmentStatus ab");
  /* Und die Engine ist in der Seite geladen, sonst faellt die
     Rekonstruktion im Browser still aus. Kanonisch ist quant/index.html;
     vu2/index.html ist nur noch ein Umleitungsstummel. */
  const index = readFileSync(new URL("quant/index.html", ROOT), "utf8");
  assert.match(index, /quant\/engines\/return-series\.js/);
});

/* ------------------------------------------------------------------------
   DIE SEITE AUSGEFUEHRT, NICHT GELESEN.

   Ein kleines DOM-Doppel, in dem die echten Dateien der neuen Oberflaeche
   laufen (quant/ui/shell.js fuer el(), quant/app/chart.js). Geprueft wird, was im Kopf der Aktienseite STEHT - nicht,
   welche Zeichenfolge im Quelltext vorkommt. Hier: die Bildunterschrift
   des Charts der Aktienseite (quant/app/chart.js).
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
  const lade = (...pfade) => { for (const p of pfade) vm.runInContext(readFileSync(join(ROOT_PATH, p), "utf8"), win, { filename: p }); };
  return { win, document, lade };
}
function knoten(node, pred, out = []) {
  if (!node || !node.children) return out;
  if (node.nodeType === 1 && pred(node)) out.push(node);
  for (const c of node.children) knoten(c, pred, out);
  return out;
}
