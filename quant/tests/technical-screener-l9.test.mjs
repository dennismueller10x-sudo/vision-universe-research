/* Screener-Felder L9 (screen-row 1.9.0, technical-query 1.9.0, query-text 1.7.0): weitere Katalogindikatoren am Stichtag.
   Referenz: echte AAPL-Tagesbars (Fixture). Jedes Feld wird an 40 abgeschnittenen Staenden unabhaengig nachgerechnet:
   aus dem Katalog (dessen Werte gegen TA-Lib bzw. pandas-ta geprueft sind) oder, fuer die Ausbrueche, direkt aus den Bars. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Row = require("../engines/technical/screen-row.js");
const I = require("../engines/technical/indicators.js");
const Q = require("../engines/technical/technical-query.js");
const P = require("../engines/technical/query-text.js");

const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));
function bars(end) {
  const k = end === undefined ? ref.date.length : end + 1, from = Math.max(0, k - 270);
  const pick = (a) => a.slice(from, k);
  return { timestamps: pick(ref.date), open: pick(ref.open), high: pick(ref.high), low: pick(ref.low), close: pick(ref.close), volume: pick(ref.volume) };
}
const row = (b) => Row.computeRow({ ticker: "AAPL", bars: b, features: {}, chartSeries: null });
const L9 = ["vortexBull", "choppiness14", "newHigh20d", "newLow20d", "elderImpulse", "zScore20", "hmaRising", "ulcer14", "histVol20", "connorsRsi", "distChandelierLong"];
const near = (a, b, tol) => a !== null && Math.abs(a - b) <= tol;

test("Versionen und Felder: jedes L9-Feld im Abfragekatalog (nur Tag) und als Spalte der Zeile", () => {
  assert.match(Row.ROW_VERSION, /1\.(9|\d{2,})\.\d+$/, "ab 1.9.0");
  assert.match(Q.QUERY_VERSION, /1\.(9|\d{2,})\.\d+$/, "ab 1.9.0");
  const r = row(bars());
  for (const id of L9) {
    const f = Q.FIELDS.find((x) => x.id === id);
    assert.ok(f, id);
    assert.deepEqual(f.tfs, ["1D"], id);
    assert.ok(Object.prototype.hasOwnProperty.call(r, id), "Spalte " + id);
  }
});

test("Werte = Katalog am Stichtag, an 40 abgeschnittenen Staenden (kausal)", () => {
  const n = ref.date.length;
  let breakouts = 0;
  for (let e = n - 40; e < n; e++) {
    const b = bars(e), r = row(b), t = b.close.length - 1, c = b.close[t], at = (id) => I.compute(b, id).values;
    const vx = at("vortex");
    assert.equal(r.vortexBull, vx.plus[t] > vx.minus[t], "vortex " + e);
    assert.ok(near(r.choppiness14, at("choppiness")[t], 0.005), "chop " + e);
    assert.equal(r.elderImpulse, at("elderImpulse")[t], "elder " + e);
    assert.ok(near(r.zScore20, at("zScore")[t], 0.0005), "z " + e);
    const hm = at("hma");
    assert.equal(r.hmaRising, hm[t] > hm[t - 1], "hma " + e);
    assert.ok(near(r.ulcer14, at("ulcerIndex")[t] / 100, 0.00005), "ulcer " + e);
    assert.ok(near(r.histVol20, at("historicalVolatility")[t] / 100, 0.00005), "hv " + e);
    assert.ok(near(r.connorsRsi, at("connorsRsi")[t], 0.005), "crsi " + e);
    assert.ok(near(r.distChandelierLong, c / at("chandelier").long[t] - 1, 0.00005), "chandelier " + e);
    /* Ausbrueche direkt aus den Bars: Schluss gegen Hoch/Tief der 20 Vortage. */
    const hh = Math.max(...b.high.slice(t - 20, t)), ll = Math.min(...b.low.slice(t - 20, t));
    assert.equal(r.newHigh20d, c > hh, "newHigh20d " + e);
    assert.equal(r.newLow20d, c < ll, "newLow20d " + e);
    if (r.newHigh20d || r.newLow20d) breakouts++;
  }
  assert.ok(breakouts > 0, "die Ausbruchspruefung laeuft nicht leer");
});

test("Kurze Historie: Felder mit langer Aufwaermphase sind null, nie geschaetzt", () => {
  const b = bars(); for (const k of Object.keys(b)) b[k] = b[k].slice(-60);
  const r = row(b);
  assert.equal(r.connorsRsi, null, "Connors RSI braucht 101 Bars");
  assert.ok(r.zScore20 !== null && r.vortexBull !== null);
});

test("Ruhender Titel (keine Kursbewegung): nicht entscheidbare Felder null", () => {
  const b = bars(); for (const k of ["open", "high", "low", "close"]) b[k] = b[k].map(() => 10);
  const r = row(b);
  for (const id of ["vortexBull", "choppiness14", "zScore20"]) assert.equal(r[id], null, id);
  assert.equal(r.newHigh20d, false);
});

test("Abfrage und Wortsuche: neue Felder validieren, Rundreise ueber den Text", () => {
  for (const s of ["neues 20-Tage-Hoch und Vortex positiv", "Connors RSI unter 10", "Choppiness über 61,8", "historische Volatilität unter 20 %", "Elder Impulse grün", "Hull MA steigt"]) {
    const res = P.parse(s), q = res.query || res;
    assert.deepEqual(res.unknown || [], [], s);
    assert.ok(Q.validate(q).ok, s);
    assert.deepEqual(P.parse(P.toText(q)).query.groups, q.groups, "Rundreise " + s);
  }
});
