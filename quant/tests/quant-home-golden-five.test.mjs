/* =========================================================================
   PHASE 5 — GOLDEN FIVE SIND OHNE SPEZIELLE URL AUFFINDBAR

   UX-Anforderung dieser Phase: "Ich möchte dafür keine speziellen
   Entwickler-URLs kennen müssen." Diese Datei prueft, dass /quant/ (Quant
   Home) die fuenf Golden-Universe-Titel tatsaechlich verlinkt, aus
   quant/data/sec/quant-factor-inputs.json heraus (keine hartcodierte
   Tickerliste ein zweites Mal) — nicht nur, dass die Zieldatei existiert.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const QUANT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(QUANT, p), "utf8");

test("GF1 · Quant Home laedt das Golden-Five-Panel und verlinkt jeden Titel auf die Stock-Detail-Seite", () => {
  /* Phase 6: der Baustein wurde aus quant/app.js in den geteilten Baustein
     quant/ui/components.js#goldenFiveTeaser extrahiert (dieselbe Antwort
     jetzt auch auf Ranking/Screener statt drei leicht unterschiedlichen
     Kopien) - die eigentliche Lade-/Verlinkungslogik lebt dort, Quant Home
     ruft sie nur noch auf. */
  const components = read("ui/components.js");
  assert.match(components, /data\/sec\/quant-factor-inputs\.json/,
    "goldenFiveTeaser muss dieselbe Datei lesen wie die Stock-Detail-Seite, nicht eine zweite Kopie");
  assert.match(components, /href:\s*S\.BASE\s*\+\s*"stock\/\?ticker="\s*\+\s*ticker/,
    "jede Golden-Five-Karte muss auf /quant/stock/?ticker=<TICKER> verlinken");
  assert.doesNotMatch(components, /\["AAPL"\s*,\s*"MSFT"/,
    "die Tickerliste darf nicht ein zweites Mal hartcodiert werden - " +
    "Object.keys(panel.securities) ist die einzige Quelle");

  const app = read("app.js");
  assert.match(app, /C\.goldenFiveTeaser\(\)/, "Quant Home muss den geteilten Baustein aufrufen");
});

test("GF2 · das Golden-Five-Panel enthaelt tatsaechlich alle fuenf Titel mit einer Stock-Detail-Route", () => {
  const panel = JSON.parse(read("data/sec/quant-factor-inputs.json"));
  const tickers = Object.keys(panel.securities);
  ["AAPL", "MSFT", "NVDA", "JPM", "XOM"].forEach((t) => {
    assert.ok(tickers.includes(t), t + " fehlt im Golden-Five-Panel");
    assert.equal(panel.securities[t].available, true, t + " ist im Panel als nicht verfuegbar markiert");
  });
});

test("GF3 · Ranking und Screener zeigen die Golden Five, klar getrennt vom Perzentil-Ranking " +
     "(Live-Feedback: 'Ranking und Strategy zeigen weiterhin Mock-Titel')", () => {
  const ranking = read("ranking/app.js");
  assert.match(ranking, /C\.goldenFiveTeaser\(/, "Ranking muss den geteilten Golden-Five-Baustein einbinden");
  const screener = read("screener/app.js");
  assert.match(screener, /C\.goldenFiveTeaser\(/, "Screener muss den geteilten Golden-Five-Baustein einbinden");
});
