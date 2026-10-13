/* =========================================================================
   EIN ZEITRAUM-ETIKETT GILT NUR, WENN DIE REIHE IHN ABDECKT.

   Der Befund vom 13.10.2026 (Master-Audit, PLTR): 3J lud auf der
   Quant-Aktienseite nur die 1-Jahres-Tagesreihe (270 Punkte ab 16.09.2025).
   Der Knopf blieb aktiv, weil "zwei Punkte im Fenster" genuegten, und der
   Kopf schrieb "+22,75 % in 3 Jahren" ueber dreizehn Monate - die lange
   Wochenreihe ab 2020 lag ausgeliefert daneben (rund +1.104 % ueber drei
   Jahre). Dasselbe galt fuer 10J bei Titeln mit kuerzerer Historie und
   waehrend des Ladens der langen Reihe fuer 5J/10J/Max.

   Hier laeuft quant/app/chart.js in einem DOM-Doppel, mit den echten
   Bausteinen core/chart-history.js und quant/engines/series-sampling.js.
   Die Reihen sind synthetisch und haben die Form des PLTR-Falls, damit der
   Test nicht mit jedem Datenlauf wandert.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const ROOT = new URL("../../", import.meta.url).pathname;

function umgebung() {
  const textNode = (s) => ({ nodeType: 3, textContent: String(s), children: [] });
  function element(tag) {
    return {
      tagName: String(tag).toUpperCase(), nodeType: 1, children: [], attributes: {}, dataset: {}, style: {},
      className: "", _text: "", disabled: false, title: "",
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); },
      set textContent(v) { this._text = String(v); this.children = []; },
      appendChild(c) { this.children.push(c); return c; },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
      append(...k) { for (const c of k) if (c !== null && c !== undefined) this.appendChild(typeof c === "string" ? textNode(c) : c); },
      replaceChildren(...k) { this.children = []; this._text = ""; this.append(...k); },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; },
      addEventListener() {}, removeEventListener() {},
      getBoundingClientRect() { return { width: 640, height: 320, left: 0, top: 0 }; }
    };
  }
  const document = { createElement: element, createElementNS: (_, t) => element(t), createTextNode: textNode,
    body: element("body"), addEventListener() {}, querySelector: () => null, getElementById: () => null };
  const win = { document, console, setTimeout, clearTimeout, innerWidth: 1200, innerHeight: 900,
    location: { hash: "", search: "", pathname: "/quant/" }, localStorage: { getItem: () => null, setItem() {} },
    addEventListener() {}, removeEventListener() {} };
  win.window = win;
  vm.createContext(win);
  for (const p of ["quant/ui/shell.js", "quant/app/ui.js", "core/chart-history.js", "quant/engines/series-sampling.js", "quant/app/chart.js"]) {
    vm.runInContext(readFileSync(join(ROOT, p), "utf8"), win, { filename: p });
  }
  /* Die Zeichenkomponente ist Discover-Code und hier nicht Thema. Das Doppel
     merkt sich, welche Punkte es zeichnen sollte. */
  const gezeichnet = [];
  win.VUDiscover = { MicroChart: { renderRange: (pts) => { gezeichnet.push(pts); return { classList: { add() {} }, getAttribute: () => null, nodeType: 1, children: [], textContent: "", addEventListener() {} }; } } };
  return { win, gezeichnet };
}
function knoten(node, pred, out = []) {
  if (!node || !node.children) return out;
  if (node.nodeType === 1 && pred(node)) out.push(node);
  for (const c of node.children) knoten(c, pred, out);
  return out;
}
const klasse = (node, k) => knoten(node, (n) => new RegExp("(^| )" + k + "( |$)").test(n.className))[0];
const knopf = (node, id) => knoten(node, (n) => n.tagName === "BUTTON" && n.dataset.range === id)[0];

/* Tagesreihe: Handelstage 16.09.2025 - 12.10.2026 (die Form der
   ausgelieferten 1-Jahres-Reihe). Wochenreihe: Freitage ab 02.10.2020. */
function tage(von, bis, schritt, wert) {
  const out = [];
  for (let d = new Date(von + "T00:00:00Z"); d <= new Date(bis + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + schritt)) {
    if (schritt === 1 && (d.getUTCDay() === 0 || d.getUTCDay() === 6)) continue;
    out.push([d.toISOString().slice(0, 10), wert(out.length)]);
  }
  return out;
}
const EOD = tage("2025-09-16", "2026-10-12", 1, (i) => 170 + i * 0.15);
const WEEKLY = tage("2020-10-02", "2026-10-09", 7, (i) => 9 + i * 0.5);

/* Wie im Browser: der Chart zeichnet nach dem Laden seinen Startzeitraum,
   erst danach waehlt jemand einen anderen. */
async function chart(opts) {
  const { win, gezeichnet } = umgebung();
  const c = win.VUQuantChart.create(Object.assign({ ticker: "PLTR", eod: EOD, currency: "USD", adjusted: true, splitEvents: 0 }, opts));
  await new Promise((r) => setTimeout(r, 0));
  const start = gezeichnet.length;
  return { c, win, gezeichnet, start };
}
const delta = (c) => klasse(c.node, "qc-delta").textContent;
const meta = (c) => klasse(c.node, "qc-meta").textContent;
const leer = (c) => klasse(c.node, "qc-empty");
const warte = () => new Promise((r) => setTimeout(r, 0));

test("jeder Mehrjahres-Zeitraum laedt die lange Reihe", () => {
  const { win } = umgebung();
  for (const r of win.VUQuantChart.RANGES) {
    if (r.days >= 1000 || r.all) assert.equal(r.long, true, r.id + " zeichnet nur aus der 1-Jahres-Reihe");
  }
});

test("PLTR-Fall: 3J zeichnet drei Jahre und nennt die Rendite ueber drei Jahre", async () => {
  const { c, gezeichnet } = await chart({ longPath: "/long.json", loadJSON: () => Promise.resolve({ points: WEEKLY }) });
  c.draw("3Y");
  await warte(); await warte();
  const pts = gezeichnet[gezeichnet.length - 1];
  assert.ok(pts[0][0] <= "2023-10-20", "3J beginnt erst am " + pts[0][0]);
  assert.ok(pts[0][0] >= "2023-10-12", "3J beginnt zu frueh: " + pts[0][0]);
  const erwartet = (pts[pts.length - 1][1] / pts[0][1] - 1) * 100;
  const gezeigt = Number(delta(c).replace(/[^\d,]/g, "").replace(",", "."));
  assert.ok(Math.abs(gezeigt - erwartet) < 0.01, delta(c) + " statt " + erwartet);
  assert.match(meta(c), /^\d\d\.10\.2023 – 12\.10\.2026$/);
  c.dispose();
});

test("ohne lange Reihe ist 3J abgeschaltet und nennt keine Rendite", async () => {
  const { c } = await chart({ longPath: null });
  assert.equal(knopf(c.node, "1Y").disabled, false);
  c.draw("3Y");
  for (const id of ["3Y", "5Y", "10Y"]) assert.equal(knopf(c.node, id).disabled, true, id + " bleibt bedienbar");
  assert.equal(delta(c), "", "Rendite ueber einen gekuerzten Zeitraum: " + delta(c));
  assert.ok(leer(c), "kein Hinweis, dass der Zeitraum fehlt");
  assert.match(leer(c).textContent, /beginnt am 16\.09\.2025/);
  c.dispose();
});

test("waehrend die lange Reihe laedt, steht nicht die kurze unter dem langen Etikett", async () => {
  let gib;
  const { c, gezeichnet, start } = await chart({ longPath: "/long.json", loadJSON: () => new Promise((r) => { gib = r; }) });
  c.draw("5Y");
  assert.equal(gezeichnet.length, start, "die 1-Jahres-Reihe wurde unter 5J gezeichnet");
  assert.equal(delta(c), "");
  assert.match(leer(c).textContent, /wird geladen/);
  gib({ points: WEEKLY });
  await warte(); await warte();
  assert.ok(gezeichnet.length > 0 && gezeichnet[gezeichnet.length - 1][0][0] <= "2021-10-20");
  c.dispose();
});

test("scheitert das Laden, werden die langen Zeitraeume abgeschaltet", async () => {
  const { c, gezeichnet, start } = await chart({ longPath: "/long.json", loadJSON: () => Promise.reject(new Error("404")) });
  c.draw("10Y");
  await warte(); await warte();
  for (const id of ["3Y", "5Y", "10Y"]) assert.equal(knopf(c.node, id).disabled, true, id);
  assert.equal(gezeichnet.length, start, "nach dem Fehlschlag wurde trotzdem gezeichnet");
  assert.equal(delta(c), "");
  c.dispose();
});

test("10J bei sechs Jahren Historie ist abgeschaltet; Max zeigt die ganze Reihe", async () => {
  const { c, gezeichnet } = await chart({ longPath: "/long.json", loadJSON: () => Promise.resolve({ points: WEEKLY }) });
  c.draw("MAX");
  await warte(); await warte();
  assert.equal(knopf(c.node, "10Y").disabled, true, "10J ueber sechs Jahre Historie");
  assert.equal(knopf(c.node, "5Y").disabled, false);
  assert.equal(gezeichnet[gezeichnet.length - 1][0][0], "2020-10-02");
  c.dispose();
});

test("ein junger Titel startet beim laengsten abgedeckten Zeitraum, nicht bei einem gekuerzten 1J", async () => {
  const jung = tage("2026-07-01", "2026-10-12", 1, (i) => 20 + i * 0.1);
  const { c, gezeichnet } = await chart({ eod: jung, longPath: null });
  assert.equal(c.range(), "3M");
  assert.equal(knopf(c.node, "1Y").disabled, true);
  assert.equal(knopf(c.node, "6M").disabled, true);
  assert.equal(gezeichnet.length, 1);
  c.dispose();
});

test("deckt die Tagesreihe den Zeitraum ab, bleibt es bei Tageskursen", async () => {
  /* Golden-Titel (NVDA) haben Tageskurse seit 2015: 3J und 5J kommen aus
     ihnen, nicht aus dem Wochenraster der langen Reihe. Max nimmt die lange. */
  const lang = tage("2015-01-02", "2026-10-12", 1, (i) => 5 + i * 0.05);
  const { c, gezeichnet } = await chart({ eod: lang, longPath: "/long.json", loadJSON: () => Promise.resolve({ points: tage("1999-01-22", "2026-10-09", 7, (i) => 0.1 + i * 0.01) }) });
  c.draw("3Y");
  await warte(); await warte();
  let pts = gezeichnet[gezeichnet.length - 1];
  assert.equal(pts[0][0], "2023-10-12", "3J startet nicht am Kalendertag");
  assert.equal(klasse(c.node, "qc-plot").dataset.grain, "daily");
  assert.match(klasse(c.node, "qc-note").textContent, /^Tagesschlusskurse/);
  c.draw("MAX");
  await warte(); await warte();
  pts = gezeichnet[gezeichnet.length - 1];
  assert.equal(pts[0][0], "1999-01-22");
  assert.equal(klasse(c.node, "qc-plot").dataset.grain, "weekly");
  assert.match(klasse(c.node, "qc-note").textContent, /^Wochenschlusskurse, letzter Punkt Tagesschluss vom 12\.10\.2026/);
  c.dispose();
});

test("abgedeckte Zeitraeume bleiben unveraendert", async () => {
  const { c, gezeichnet } = await chart({ longPath: null });
  c.draw("1Y");
  const pts = gezeichnet[gezeichnet.length - 1];
  assert.equal(pts[pts.length - 1][0], "2026-10-12");
  assert.ok(pts[0][0] >= "2025-10-11" && pts[0][0] <= "2025-10-14", pts[0][0]);
  for (const id of ["5D", "1M", "3M", "6M", "YTD", "1Y"]) assert.equal(knopf(c.node, id).disabled, false, id);
  c.dispose();
});

test("die kanonische Seite laedt die gemeinsame Zeitraum-Regel vor dem Chart", () => {
  const index = readFileSync(join(ROOT, "quant/index.html"), "utf8");
  const regel = index.indexOf('src="/core/chart-history.js"'), chartJs = index.indexOf('src="/quant/app/chart.js"');
  assert.ok(regel > 0 && regel < chartJs, "core/chart-history.js fehlt in quant/index.html oder kommt zu spaet");
});
