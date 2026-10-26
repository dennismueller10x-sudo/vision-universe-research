/* Gespeicherte Suchen behalten ihre Bedeutung (Audit B12): "Golden/Death Cross" hiess bis query-text 1.4.0
   der Zustand SMA 50 ueber/unter SMA 200, seit 1.5.0 das Kreuzungsereignis. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const M = require("../engine/model.js");
const QT = require("../../quant/engines/technical/query-text.js");
function memory(list) { const d = {}; if (list) d[M.STORE_KEY] = JSON.stringify(list); return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = v; }, raw: d }; }
const textOf = (params) => new URLSearchParams(params).get("q");
const canonical = (params) => QT.toText(QT.parse(textOf(params)).query);

test("Alte Textsuche ohne Bedeutungsstand wird einmalig ausdruecklich umgeschrieben und bleibt der Zustand", () => {
  const mem = memory([
    { id: "a", name: "Kreuz", params: "q=" + encodeURIComponent("Golden Cross und RSI über 50"), createdAt: "2026-10-01T00:00:00Z" },
    { id: "b", name: "Tod", params: "q=" + encodeURIComponent("death cross"), createdAt: "2026-10-01T00:00:00Z" },
    { id: "c", name: "Pille", params: "trend=kreuz", createdAt: "2026-10-01T00:00:00Z" },
    { id: "d", name: "Ohne Kreuz", params: "q=" + encodeURIComponent("über SMA 200"), createdAt: "2026-10-01T00:00:00Z" }
  ]);
  const list = M.loadScreens(mem);
  assert.equal(canonical(list[0].params), "sma50AboveSma200 und rsi14 > 50", "vorher Zustand, nachher Zustand");
  assert.equal(canonical(list[1].params), "nicht sma50AboveSma200");
  assert.equal(list[0].migrated.from, "Golden Cross und RSI über 50");
  assert.equal(list[2].params, "trend=kreuz", "Schnellfilter speichern Feld-IDs, keine Umdeutung");
  assert.equal(list[3].migrated, undefined, "nur gestempelt, Text unveraendert");
  assert.match(list[3].params, /(^|&)qv=2(&|$)/);
  /* dauerhaft: zweites Laden aendert nichts mehr */
  const again = M.loadScreens(mem);
  assert.deepEqual(again.map((x) => x.params), list.map((x) => x.params));
});

test("Neue Speicherungen tragen den Bedeutungsstand und werden nie umgeschrieben", () => {
  const mem = memory();
  M.saveScreen(mem, "neu", "q=" + encodeURIComponent("Golden Cross in den letzten 10 Tagen"), Date.UTC(2026, 9, 26));
  const [x] = M.loadScreens(mem);
  assert.match(x.params, /(^|&)qv=2(&|$)/);
  assert.equal(canonical(x.params), "goldenCrossDays <= 10", "neue Bedeutung bleibt");
});

test("Import alter Exporte wird ebenso umgeschrieben; qv ist ein erlaubter Schluessel", () => {
  const mem = memory();
  const doc = JSON.stringify({ format: "vu-technical-screens-1", screens: [{ name: "alt", params: "q=" + encodeURIComponent("Golden Cross"), createdAt: "2026-09-01T00:00:00Z" },
    { name: "neu", params: "q=" + encodeURIComponent("Golden Cross") + "&qv=2", createdAt: "2026-10-26T00:00:00Z" }] });
  const r = M.importScreens(mem, doc, Date.UTC(2026, 9, 26));
  assert.equal(r.added, 2);
  const list = M.loadScreens(mem);
  assert.deepEqual(list.map((x) => canonical(x.params)), ["sma50AboveSma200", "goldenCrossDays <= 5"]);
});
