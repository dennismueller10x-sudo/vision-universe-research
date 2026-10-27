/* Zweite fremde Referenz (L8): die 26 Katalogindikatoren ohne eigenes TA-Lib-Gegenstueck gegen pandas-ta 0.4.71b0 bzw. gegen
   die aus TA-Lib-/numpy-Bausteinen nach der dokumentierten Formel zusammengesetzte Rechnung, auf dem eingefrorenen
   AAPL-Ausschnitt. Die Werte stehen eingefroren in fixtures/technical-pandasta-reference-aapl.json (erzeugt mit
   scripts/technical/build-pandasta-reference.py); pandas-ta und TA-Lib sind keine Abhaengigkeiten.
   Jede Reihe traegt ihre Quelle und die erste verglichene Bar (`from`); ein Wert > 0 ist eine Startwert-Konvention
   und in docs/technical/INDICATORS_EXTERNAL_REFERENCE.md begruendet. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const I = require("../engines/technical/indicators.js");
const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));
const PT = JSON.parse(readFileSync(new URL("./fixtures/technical-pandasta-reference-aapl.json", import.meta.url), "utf8"));
const N = ref.close.length;

/* Fixture: 10 signifikante Stellen. */
const TOL = 1e-8;
const close = (e, t) => Math.abs(e - t) <= TOL * Math.max(1, Math.abs(t));
const cache = {};
function engine(key) {
  const [id, part] = key.split(".");
  cache[id] = cache[id] || I.compute(ref, id).values;
  return part ? cache[id][part] : cache[id];
}

/* Begruendete Startwert-Konventionen; jede andere Reihe muss ab der ersten Bar stimmen. */
const FROM = { mcginley: 215 };

test("Fixture: Quelle, Versionen und erwartete Reihen", () => {
  assert.equal(PT.bars, N);
  assert.equal(PT.libraries.pandas_ta, "0.4.71b0");
  const ids = new Set(Object.keys(PT.series).map((k) => k.split(".")[0]));
  for (const id of ["supertrend", "vwma", "keltner", "cmf", "hma", "heikinAshi", "zlema", "alma", "mcginley", "klinger",
    "easeOfMovement", "nvi", "pvi", "chandelier", "connorsRsi", "pivots", "pivotsFib", "pivotsCamarilla", "pivotsWoodie",
    "roc63", "roc126", "roc252", "insideBar", "nr7", "envelope", "elderImpulse"]) {
    assert.ok(ids.has(id), id);
    assert.ok(I.CATALOG.some((c) => c.id === id), "im Katalog: " + id);
  }
  for (const [k, r] of Object.entries(PT.series)) assert.equal(r.from, FROM[k.split(".")[0]] || 0, "begruendeter Start: " + k);
});

for (const [key, r] of Object.entries(PT.series)) {
  test("gleich der Referenz ab Bar " + r.from + ": " + key + " (" + r.source + ")", () => {
    const eng = engine(key), t = r.values;
    assert.equal(eng.length, N, key + ": Laenge");
    assert.equal(t.length, N, key + ": Laenge Referenz");
    const bad = [];
    let compared = 0;
    for (let i = r.from; i < N; i++) {
      const e = eng[i], v = t[i];
      if (v === null || !Number.isFinite(e)) { if ((v === null) !== !Number.isFinite(e)) bad.push(i + ":Aufwaermung"); continue; }
      compared++;
      if (!close(e, v)) bad.push(i + ":" + e + "≠" + v);
    }
    assert.deepEqual(bad.slice(0, 5), [], key);
    /* Keine Reihe laeuft leer: jeder Referenzwert ab `from` wurde verglichen, mindestens 50 Bars. */
    assert.equal(compared, t.slice(r.from).filter((v) => v !== null).length, key + ": alle Referenzwerte verglichen");
    assert.ok(compared >= 50, key + ": nur " + compared + " Bars verglichen");
  });
}

test("Startwert-Konvention McGinley: vor Bar 215 verschieden, danach gleich (Abklingen, kein Formelunterschied)", () => {
  const eng = engine("mcginley"), t = PT.series.mcginley.values;
  let differ = 0;
  for (let i = 13; i < 215; i++) if (t[i] !== null && Number.isFinite(eng[i]) && !close(eng[i], t[i])) differ++;
  assert.ok(differ > 0, "die Konvention wirkt tatsaechlich");
  const gap = (i) => Math.abs(eng[i] - t[i]) / Math.abs(t[i]);
  assert.ok(gap(20) > gap(100) && gap(100) > gap(200), "die Abweichung klingt ab");
});
