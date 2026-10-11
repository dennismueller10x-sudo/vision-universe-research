/* =========================================================================
   PHASE 5 — GOLDEN FIVE SIND OHNE SPEZIELLE URL AUFFINDBAR

   UX-Anforderung dieser Phase: "Ich möchte dafür keine speziellen
   Entwickler-URLs kennen müssen." Diese Datei prueft, dass /quant/ (Quant
   Home) die fuenf Golden-Universe-Titel tatsaechlich verlinkt, aus
   quant/data/sec/quant-factor-inputs.json heraus (keine hartcodierte
   Tickerliste ein zweites Mal) — nicht nur, dass die Zieldatei existiert.

   Frontend-Rebuild (quant/app): Prüfintention erhalten – die Golden Five
   bleiben ohne Entwickler-URL auffindbar: Suche auf Home und die Liste
   "Bekannte Aktien" unter #/aktien, jeweils mit Link auf #/aktie/<T>.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const QUANT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(QUANT, p), "utf8");

test("GF1 · Quant Home fuehrt ohne spezielle URL zu den Golden Five: Suche auf Home, " +
     "#/aktien listet AAPL MSFT NVDA JPM XOM und verlinkt jeden auf die Aktienanalyse", () => {
  /* Frontend-Rebuild (quant/app): der alte Baustein goldenFiveTeaser() aus
     quant/app.js gibt es auf Quant Home nicht mehr. Ersetzt wurde er durch
     (a) die Suche direkt im Hero von Home (ctx.openSearch -> Suchdialog in
     quant/app/app.js) und (b) die Liste "Bekannte Aktien" unter #/aktien
     (quant/app/pages.js stocks()), die per X.tickerChips auf #/aktie/<T>
     verlinkt. Die frueher geforderte Nicht-Hartcodierung der Liste entfaellt
     mit dem Baustein: "Bekannte Aktien" ist bewusst eine kuratierte
     Einstiegsliste, und GF2 haelt weiterhin fest, dass jeder der fuenf Titel
     im veroeffentlichten Panel verfuegbar ist. */
  const pages = read("app/pages.js");
  const ui = read("app/ui.js");
  const app = read("app/app.js");

  /* Home bietet die Suche sichtbar an und eine Tuer zu #/aktien. */
  const homeStart = pages.indexOf("async function home(");
  const homeEnd = pages.indexOf("/* ============================================================ SCREENER");
  assert.ok(homeStart > 0 && homeEnd > homeStart, "Home-Seite in quant/app/pages.js nicht gefunden");
  const home = pages.slice(homeStart, homeEnd);
  assert.match(home, /onclick:\s*ctx\.openSearch/, "Home muss die Aktiensuche direkt anbieten");
  assert.match(home, /href:\s*X\.routes\.stocks\(\)/, "Home muss auf den Bereich Aktien (#/aktien) fuehren");
  assert.match(app, /openSearch:\s*function\s*\(\)\s*\{\s*search\.open\(\)/, "ctx.openSearch muss den Suchdialog oeffnen");
  assert.match(app, /api\.searchInstruments\(q/, "der Suchdialog muss das Instrumentenverzeichnis durchsuchen");

  /* #/aktien listet die bekannten Aktien, darunter alle Golden Five. */
  const stocksStart = pages.indexOf("async function stocks(");
  assert.ok(stocksStart > 0, "Aktien-Seite in quant/app/pages.js nicht gefunden");
  const stocks = pages.slice(stocksStart);
  /* Discover-Angleichung (30.09.2026): die Liste steht als KNOWN in
     pages.js und wird als Discover-Schiene aus Aktienkarten gezeigt
     (X.world("Bekannte Aktien", ..., X.rail(KNOWN.map(... X.poster ...)))). */
  const knownList = pages.match(/var KNOWN = \[([^\]]*)\];/);
  assert.ok(knownList, "#/aktien muss eine Liste bekannter Aktien zeigen");
  const shown = stocks.match(/X\.world\("Bekannte Aktien"[^\n]*X\.rail\(KNOWN(\.slice\(0,\s*(\d+)\))?\.map\([^\n]*X\.poster\(\{ ticker: t/);
  assert.ok(shown, "#/aktien muss eine Liste bekannter Aktien zeigen");
  const listed = knownList[1].match(/"([A-Z.]+)"/g).map((x) => x.slice(1, -1));
  const known = [null, null, shown[2] || String(listed.length)];
  const panel = JSON.parse(read("data/sec/quant-factor-inputs.json"));
  ["AAPL", "MSFT", "NVDA", "JPM", "XOM"].forEach((t) => {
    assert.ok(listed.includes(t), t + " fehlt unter \"Bekannte Aktien\" auf #/aktien");
    assert.ok(panel.securities[t] && panel.securities[t].available === true, t + " ist im Panel nicht verfuegbar");
  });
  /* Die Liste darf nicht so gekuerzt werden, dass Golden Five herausfallen. */
  const max = Number(known[2]);
  assert.ok(max >= listed.length, "tickerChips kuerzt die Liste auf " + max + " von " + listed.length);

  /* Jeder Chip und jede Karte verlinkt auf die Aktienanalyse #/aktie/<TICKER>. */
  assert.match(ui, /function tickerChips[\s\S]*?href:\s*routes\.stock\(t\)/, "tickerChips muss auf routes.stock verlinken");
  assert.match(ui, /function poster[\s\S]*?href:\s*routes\.stock\(o\.ticker\)/, "die Aktienkarte muss auf routes.stock verlinken");
  assert.match(ui, /stock:\s*function\s*\(t\)\s*\{\s*return\s*"#\/aktie\/"/, "routes.stock muss auf #/aktie/<T> zeigen");
  assert.match(app, /case "aktie":[\s\S]*?r\.view\s*=/, "der Router muss #/aktie/<T> als Aktienanalyse auffassen");
});

test("GF2 · das Golden-Five-Panel enthaelt tatsaechlich alle fuenf Titel mit einer Stock-Detail-Route", () => {
  const panel = JSON.parse(read("data/sec/quant-factor-inputs.json"));
  const tickers = Object.keys(panel.securities);
  ["AAPL", "MSFT", "NVDA", "JPM", "XOM"].forEach((t) => {
    assert.ok(tickers.includes(t), t + " fehlt im Golden-Five-Panel");
    assert.equal(panel.securities[t].available, true, t + " ist im Panel als nicht verfuegbar markiert");
  });
});

/* GF3 (Ranking und klassischer Screener zeigen die Golden Five) entfaellt:
   beide Seiten liefen auf dem synthetischen Modelluniversum und sind
   entfernt; ihre Adressen leiten auf den Screener der App weiter, der nur
   echte Daten zeigt (no-mock-in-product.test.mjs). */
