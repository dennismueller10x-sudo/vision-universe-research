/* =========================================================================
   FEHLENDE DATEN SEHEN NICHT AUS WIE EIN POSITIVES SIGNAL.

   Der Befund vom 13.10.2026 (Master-Audit, Browser): /analysten/ zeigte
   "Ø Kurspotenzial" als gruenen Strich. Ohne aktuellen Kurs ist das
   Kurspotenzial null, und die Farbklasse entschied mit avgUpside >= 0 -
   null >= 0 ist in JavaScript wahr. Der eingecheckte Kursstand
   (dashboard/data/market_data.json) traegt status "not_generated" und keine
   Kurse; damit traf es jede Aktie.

   Hier laeuft das echte Inline-Skript der Seite in einem DOM-Doppel mit
   Fixture-Antworten statt der Dateien.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../../analysten/index.html", import.meta.url), "utf8");
const start = html.indexOf("<script>", html.indexOf('src="/assets/site-navigation.js"'));
const script = html.slice(start + "<script>".length, html.indexOf("</script>", start));

const UNIVERSE = { stocks: [{ symbol: "NVDA", name: "NVIDIA", active: true }, { symbol: "AMD", name: "AMD", active: true }] };
const TREND = [{ period: "2026-09-01", strongBuy: 24, buy: 41, hold: 3, sell: 1, strongSell: 0 }];
const RATINGS = { generated_at_utc: "2026-10-12T06:00:00Z", symbols: {
  NVDA: { consensus_label: "buy", trend_history: TREND, price_target: { targetMean: 250 } },
  AMD: { consensus_label: "buy", trend_history: TREND, price_target: { targetMean: 180 } } } };

async function seite(market) {
  const nodes = {};
  const node = (sel) => (nodes[sel] ||= { innerHTML: "", textContent: "", style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {} });
  const antwort = (url) => {
    const body = /universe\.json/.test(url) ? UNIVERSE : /analyst_ratings/.test(url) ? RATINGS : market;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  };
  const win = { console, setTimeout, clearTimeout, Promise, Date, Math, JSON, Object, String, Number, isNaN,
    fetch: antwort, location: { search: "", hash: "" }, localStorage: { getItem: () => null, setItem() {} },
    document: { querySelector: node, querySelectorAll: () => [], getElementById: (id) => node("#" + id), addEventListener() {}, body: node("body") },
    addEventListener() {} };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(script, win, { filename: "analysten/index.html" });
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  const karten = nodes["#summaryGrid"] && nodes["#summaryGrid"].innerHTML;
  assert.ok(karten, "die Zusammenfassung wurde nicht gezeichnet");
  const karte = karten.split('<div class="sum-card">').filter((k) => /Ø Kurspotenzial/.test(k))[0];
  assert.ok(karte, "keine Karte Ø Kurspotenzial");
  return karte;
}

test("ohne aktuellen Kurs: Strich ohne Farbe, und die Karte sagt warum", async () => {
  const karte = await seite({ status: "not_generated", symbols: {} });
  assert.match(karte, /class="sum-card-value ">–</, "der Strich traegt eine Farbklasse: " + karte);
  assert.equal(/\bpos\b|\bneg\b/.test(karte), false);
  assert.match(karte, /kein aktueller Kurs hinterlegt/);
});

test("mit Kursen: Durchschnitt und Ton wie bisher", async () => {
  const hoch = await seite({ symbols: { NVDA: [{ close: 200 }], AMD: [{ close: 150 }] } });
  assert.match(hoch, /class="sum-card-value pos">\+22\.5%</);
  assert.match(hoch, /Kursziel vs\. aktueller Kurs/);
  const tief = await seite({ symbols: { NVDA: [{ close: 300 }], AMD: [{ close: 200 }] } });
  assert.match(tief, /class="sum-card-value neg">-13\.3%</);
});
