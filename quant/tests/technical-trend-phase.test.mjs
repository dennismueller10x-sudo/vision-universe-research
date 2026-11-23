/* Vier-Phasen-Einstufung an der 150-Tage-Linie als Datenfeld (screen-row 1.16.0, trendPhase).
   Dieselbe Regel wie ti/dow-trend.js#weinsteinStage ("Chart erklaeren"), gerechnet auf der SMA 150 der Vollhistorie. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Row = require(join(root, "quant/engines/technical/screen-row.js"));
const Dow = require(join(root, "quant/engines/technical/ti/dow-trend.js"));
const Contract = require(join(root, "quant/engines/technical/screener-contract.js"));
const Query = require(join(root, "quant/engines/technical/technical-query.js"));

test("Version ab 1.16.0", () => assert.match(Row.ROW_VERSION, /1\.(1[6-9]|[2-9]\d)\.\d+$/));

test("Vier Phasen: Anstieg, Abstieg, Boden, Dach; leer ohne Linie", () => {
  /* Linie steigt klar (+2 % im Monat), Kurs darueber -> 2; faellt klar, Kurs darunter -> 4 */
  assert.equal(Row.phaseOf(110, 102, 100, 90), 2);
  assert.equal(Row.phaseOf(90, 98, 100, 110), 4);
  /* Linie flach (unter 0,5 % im Monat): vor einem halben Jahr hoeher -> Boden (1), tiefer -> Dach (3), unbekannt -> leer */
  assert.equal(Row.phaseOf(101, 100.2, 100, 120), 1);
  assert.equal(Row.phaseOf(99, 100.2, 100, 80), 3);
  assert.equal(Row.phaseOf(99, 100.2, 100, null), null);
  /* Linie steigt, Kurs aber darunter -> Dach; Linie faellt, Kurs aber darueber -> Boden */
  assert.equal(Row.phaseOf(95, 102, 100, 90), 3);
  assert.equal(Row.phaseOf(105, 98, 100, 110), 1);
  assert.equal(Row.phaseOf(100, null, 100, 90), null);
  assert.equal(Row.phaseOf(100, 100, null, 90), null);
  assert.equal(Row.phaseOf(NaN, 100, 99, 90), null);
});

test("Gleiche Regel wie Chart erklaeren (ti/dow-trend.js#weinsteinStage), auf einem Zufallsraster", () => {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let k = 0; k < 2000; k++) {
    const past = 50 + 100 * rnd(), ma = past * (1 + (rnd() - 0.5) * 0.04), far = rnd() < 0.15 ? null : past * (1 + (rnd() - 0.5) * 0.3), close = ma * (1 + (rnd() - 0.5) * 0.2);
    const t = 200, line = []; line[t] = ma; line[t - 21] = past; line[t - 126] = far;
    const ctx = { t, close, profile: { stage: "sma150", barsPerYear: 252 }, col: (id, i) => { const v = line[i === undefined ? t : i]; return v === undefined ? null : v; } };
    assert.equal(Row.phaseOf(close, ma, past, far), Dow.weinsteinStage(ctx).stage, JSON.stringify({ close, ma, past, far }));
  }
});

test("Datenfeld ausserhalb des Abfragekatalogs: im Vertrag, optional, 1 bis 4; kein neues Suchfeld", () => {
  const spec = Contract.columns().trendPhase;
  assert.ok(spec && spec.optional && spec.nullable && spec.type === "int");
  assert.deepEqual(spec.range, [1, 4]);
  assert.equal(Contract.EXTRA.trendPhase, spec);
  assert.equal(Query.FIELDS.some((f) => f.id === "trendPhase"), false, "kein Feld im Abfragekatalog: die Oberflaeche bietet nichts Neues an");
});

test("Echte Tagesreihe (AAPL-Fixture): Zeile traegt die Phase aus der Vollhistorie, kausal und gleich der Regel", () => {
  const ref = JSON.parse(readFileSync(join(root, "quant/tests/fixtures/technical-reference-aapl.json"), "utf8"));
  const all = ref.close, sma150 = all.map((_, i) => (i >= 149 ? all.slice(i - 149, i + 1).reduce((a, b) => a + b, 0) / 150 : null));
  const seen = new Set();
  /* jeder fuenfte Stichtag der 315 Bars: 270 Bars bis k, Linie aus der Vollhistorie bis k (nichts nach k) */
  for (let k = 280; k <= all.length; k += 5) {
    const from = k - 270, pick = (a) => a.slice(from, k);
    const bars = { timestamps: pick(ref.date), open: pick(ref.open), high: pick(ref.high), low: pick(ref.low), close: pick(ref.close), volume: pick(ref.volume) };
    const line = pick(sma150), row = Row.computeRow({ ticker: "AAPL", bars, features: {}, chartSeries: { sma150: line } });
    assert.equal(row.trendPhase, Row.phaseOf(bars.close[269], line[269], line[248], line[143]), ref.date[k - 1]);
    assert.ok(Number.isInteger(row.trendPhase) && row.trendPhase >= 1 && row.trendPhase <= 4, ref.date[k - 1]);
    seen.add(row.trendPhase);
    /* kausal: spaetere Kurse aendern die Einstufung des Stichtags nicht (die Zeile sieht nur Bars und Linie bis k) */
    if (k === 280) {
      /* ohne Linie der Vollhistorie oder bei falscher Laenge: leer statt einer Naeherung aus den 270 Bars */
      assert.equal(Row.computeRow({ ticker: "AAPL", bars, features: {}, chartSeries: null }).trendPhase, null);
      assert.equal(Row.computeRow({ ticker: "AAPL", bars, features: {}, chartSeries: { sma150: line.slice(1) } }).trendPhase, null);
    }
  }
  assert.ok(seen.size >= 1, "mindestens ein Stichtag geprueft");
});
