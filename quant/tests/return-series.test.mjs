import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Series = require("../engines/return-series.js");
const Compare = require("../engines/return-basis-comparison.js");

const GOLDEN = ["AAPL", "JPM", "MSFT", "NVDA", "XOM"];
const goldenPath = (t) => `quant/data/market/golden-preview/daily/ref_${t}.json`;

/* ------------------------------------------------------------ Konstruktion */

test("die splitbereinigte Reihe nimmt den Splitsprung heraus", () => {
  /* Zwei Tage vor einem 1:2, der Kurs halbiert sich am Splittag. Die
     bereinigte Reihe muss durchlaufen, sonst faende jeder Technical-
     Zustand einen Einbruch von 50 Prozent, den es nie gab. */
  const bars = [
    { date: "2026-01-01", close: 100, splitFactor: 1, adjustedClose: 50 },
    { date: "2026-01-02", close: 100, splitFactor: 1, adjustedClose: 50 },
    { date: "2026-01-03", close: 50, splitFactor: 2, adjustedClose: 50 },
    { date: "2026-01-04", close: 51, splitFactor: 1, adjustedClose: 51 }
  ];
  const r = Series.build({ bars });
  assert.equal(r.usable, true);
  assert.deepEqual(r.price, [50, 50, 50, 51]);
  assert.equal(r.splitEvents, 1);
});

test("der Splitfaktor wirkt ab seinem Tag, nicht ab dem Vortag", () => {
  /* Ein um einen Tag verschobener Faktor faellt bei 1:7 sofort auf und
     bei 1:1.05 nie. Der Test haelt die Kante fest. */
  const bars = [
    { date: "2026-01-01", close: 700, splitFactor: 1, adjustedClose: 100 },
    { date: "2026-01-02", close: 100, splitFactor: 7, adjustedClose: 100 }
  ];
  assert.deepEqual(Series.build({ bars }).price, [100, 100]);
});

test("die Dividendenluecke bleibt in der Kursreihe stehen", () => {
  /* Genau die Trennung, die der Owner verlangt hat: der Kursabschlag am
     Ex-Tag ist eine echte Marktbewegung und darf nicht wegbereinigt
     werden, sonst erzeugt eine Dividende ein technisches Signal. */
  const bars = [
    { date: "2026-01-01", close: 100, splitFactor: 1, dividend: 0, adjustedClose: 99 },
    { date: "2026-01-02", close: 99, splitFactor: 1, dividend: 1, adjustedClose: 99 }
  ];
  const r = Series.build({ bars });
  assert.deepEqual(r.price, [100, 99]);
  assert.deepEqual(r.total, [99, 99]);
  assert.equal(r.dividendEvents, 1);
});

test("unsortierte Bars werden abgelehnt statt sortiert", () => {
  const bars = [
    { date: "2026-01-02", close: 10, splitFactor: 1, adjustedClose: 10 },
    { date: "2026-01-01", close: 11, splitFactor: 1, adjustedClose: 11 }
  ];
  assert.throws(() => Series.build({ bars }), /not strictly ascending/);
});

test("eine halbe Reihe ist kein Teilerfolg", () => {
  const ohneAdj = [
    { date: "2026-01-01", close: 10, splitFactor: 1 },
    { date: "2026-01-02", close: 11, splitFactor: 1 }
  ];
  const r = Series.build({ bars: ohneAdj });
  assert.equal(r.usable, false);
  assert.equal(r.reason, "ADJUSTED_CLOSE_INCOMPLETE");

  const ohneSplit = [
    { date: "2026-01-01", close: 10, adjustedClose: 10 },
    { date: "2026-01-02", close: 11, adjustedClose: 11 }
  ];
  assert.equal(Series.build({ bars: ohneSplit }).reason, "SPLIT_FACTOR_COLUMN_INCOMPLETE");
});

/* -------------------------------------------------- Golden Five, Schritt 3

   Der Owner hat festgelegt: die fuenf Titel sind Test- und
   Regressionsumfang, niemals Methodikbasis. Hier stehen sie also als
   Testfaelle - sie pruefen die Konstruktion, nicht die Entscheidung. */

test("die Golden Five tragen beide Reihen ueber die volle Laenge", (t) => {
  const vorhanden = GOLDEN.filter((x) => existsSync(goldenPath(x)));
  if (!vorhanden.length) return t.skip("Golden Preview nicht im Baum");
  assert.equal(vorhanden.length, GOLDEN.length,
    "Golden-Scope unvollstaendig: " + GOLDEN.filter((x) => !vorhanden.includes(x)).join(", "));
  for (const ticker of GOLDEN) {
    const payload = JSON.parse(readFileSync(goldenPath(ticker), "utf8"));
    const r = Series.build(payload);
    assert.equal(r.usable, true, `${ticker}: ${r.reason}`);
    assert.equal(r.price.length, r.bars);
    assert.equal(r.total.length, r.bars);
    /* Der letzte Tag ist auf beiden Basen derselbe gehandelte Kurs -
       die Reihen laufen rueckwaerts auseinander, nicht vorwaerts. */
    assert.ok(Math.abs(r.price[r.bars - 1] - r.total[r.bars - 1]) < 0.01,
      `${ticker}: letzter Tag weicht ab`);
  }
});

test("bei einem Dividendenzahler liegt die Gesamtrendite ueber der Kursrendite", (t) => {
  /* XOM zahlt ueber den ganzen Zeitraum quartalsweise. Der Test prueft
     die Richtung der Konstruktion, nicht die Methodikfrage - welche
     Basis Quant V2 traegt, entscheidet der Full-Universe-Audit. */
  if (!existsSync(goldenPath("XOM"))) return t.skip("Golden Preview nicht im Baum");
  const r = Series.build(JSON.parse(readFileSync(goldenPath("XOM"), "utf8")));
  const i = r.bars - 1;
  const m = Compare.momentumAt(r.price, i, null, -1);
  const mt = Compare.momentumAt(r.total, i, null, -1);
  assert.ok(mt["12M"] > m["12M"],
    `XOM: Gesamtrendite ${mt["12M"]} muesste ueber Kursrendite ${m["12M"]} liegen`);
});

/* ------------------------------------------------------------- Rangmetrik */

test("gleiche Werte bekommen denselben Rang", () => {
  const f = Compare.rankField([5, 3, 3, 1]);
  assert.equal(f.ranks[1], f.ranks[2]);
  assert.equal(f.n, 4);
});

test("Titel ohne Wert bekommen kein Perzentil statt eines schlechten", () => {
  /* Eine fehlende Historie als Perzentil 0 zu fuehren waere eine
     erfundene Aussage ueber den Titel. */
  const f = Compare.rankField([5, null, 1]);
  assert.equal(f.ranks[1], null);
  assert.equal(f.percentiles[1], null);
  assert.equal(f.n, 2);
});

test("die Verschiebungsstatistik zaehlt nur Titel mit beiden Raengen", () => {
  const a = Compare.rankField([5, 4, 3, null]);
  const b = Compare.rankField([5, 4, 3, 2]);
  const s = Compare.shiftStatistics(a, b);
  assert.equal(s.UNIVERSE_N, 3);
});

test("eine identische Rangfolge ergibt Korrelation 1 und keine Verschiebung", () => {
  const a = Compare.rankField([9, 6, 3, 1]);
  const s = Compare.shiftStatistics(a, a);
  assert.equal(s.SPEARMAN_RANK_CORRELATION, 1);
  assert.equal(s.MAX_RANK_CHANGE, 0);
  assert.equal(s.TITLES_MOVING_1_PERCENTILE, 0);
});

test("der Dezilwechsel zaehlt Austritte und Eintritte getrennt", () => {
  const values = Array.from({ length: 20 }, (_, i) => 20 - i);
  const a = Compare.rankField(values);
  const moved = values.slice();
  moved[19] = 100;                       /* Schlusslicht springt an die Spitze */
  const b = Compare.rankField(moved);
  const churn = Compare.decileChurn(a, b);
  assert.equal(churn.ENTERING, 1);
  assert.ok(churn.LEAVING >= 1);
});

test("die Momentumfenster stimmen mit market-factors ueberein", () => {
  const src = readFileSync("quant/engines/market-factors.js", "utf8");
  const m = src.match(/var HORIZONS = \{([^}]+)\}/);
  assert.ok(m, "HORIZONS in market-factors.js nicht gefunden");
  for (const [label, days] of Object.entries(Compare.WINDOWS)) {
    assert.ok(m[1].includes(`"${label}": ${days}`),
      `Fenster ${label}=${days} weicht von market-factors ab: ${m[1].trim()}`);
  }
});

test("12M-1M laesst den letzten Monat aus", () => {
  const series = Array.from({ length: 300 }, (_, i) => 100 + i);
  const i = 299;
  const m = Compare.momentumAt(series, i, null, -1);
  assert.equal(m["12M"], series[i] / series[i - 252] - 1);
  assert.equal(m["12M-1M"], series[i - 21] / series[i - 252] - 1);
  assert.notEqual(m["12M"], m["12M-1M"]);
});

test("relative Staerke ohne Benchmark bleibt leer statt null-wertig", () => {
  const series = Array.from({ length: 300 }, (_, i) => 100 + i);
  assert.equal(Compare.momentumAt(series, 299, null, -1).RELATIVE_STRENGTH, null);
});
