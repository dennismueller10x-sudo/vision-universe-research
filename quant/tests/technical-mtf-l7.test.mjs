/* L7: ROC, Inside Bar, NR7 und Kerzenmuster je Woche und Monat (multi-timeframe.js 1.1.0, screen-row.js 1.8.0,
   docs/technical/SCREENER_FIELDS_L7.md). Referenz: eingefrorener AAPL-Ausschnitt (315 Tagesbars); die Wochen- und
   Monatsbars werden hier naiv und unabhaengig von timeframe.js gebildet. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const C = require("../engines/technical/canonical-bars.js");
const MTF = require("../engines/technical/multi-timeframe.js");
const Cdl = require("../engines/technical/candlesticks.js");
const Row = require("../engines/technical/screen-row.js");
const Q = require("../engines/technical/technical-query.js");
const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));

const OLD_KEYS = ["aboveSma200", "aboveSma50", "sma50AboveSma200", "distSma200", "rsi14", "newHigh52w", "distHigh52w", "adx",
  "macdPositive", "stochK", "atrPct", "relVol", "volAboveAvg", "volSpike"];

function series(upto) {
  const rows = [];
  for (let i = 0; i <= upto; i++) rows.push({ timestamp: ref.date[i], open: ref.open[i], high: ref.high[i], low: ref.low[i], close: ref.close[i], volume: ref.volume[i] });
  return C.fromRows(rows, { instrumentId: "AAPL", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED" });
}
function isoWeek(d) {
  const t = new Date(d + "T12:00:00Z"), wd = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - wd + 3);
  const y = t.getUTCFullYear(), first = new Date(Date.UTC(y, 0, 4));
  return y + "-" + Math.round(((t - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7 + 1);
}
/** Naive Buckets bis einschliesslich Tag `upto`, nur abgeschlossene (die letzte Periode faellt weg, wenn sie offen ist). */
function naive(keyOf, upto, tf) {
  const out = { date: [], open: [], high: [], low: [], close: [], volume: [] };
  let cur = null;
  for (let i = 0; i <= upto; i++) {
    const k = keyOf(ref.date[i]);
    if (k !== cur) { cur = k; out.date.push(ref.date[i]); out.open.push(ref.open[i]); out.high.push(ref.high[i]); out.low.push(ref.low[i]); out.close.push(ref.close[i]); out.volume.push(ref.volume[i]); continue; }
    const j = out.close.length - 1;
    out.date[j] = ref.date[i]; out.high[j] = Math.max(out.high[j], ref.high[i]); out.low[j] = Math.min(out.low[j], ref.low[i]);
    out.close[j] = ref.close[i]; out.volume[j] += ref.volume[i];
  }
  if (!MTF.closedAt(ref.date[upto], tf)) for (const k of Object.keys(out)) out[k].pop();
  return out;
}
const KEY = { "1W": isoWeek, "1M": (d) => d.slice(0, 7) };
const r4 = (v) => Math.round(v * 1e4) / 1e4;

test("Musterliste gleich der des Screeners; Felder 1.1.0 vollstaendig", () => {
  assert.deepEqual(MTF.CANDLES, Row.SCREEN_CANDLES);
  assert.match(MTF.MTF_VERSION, /^technical-mtf-1\.1\./);
  const out = MTF.compute(series(ref.date.length - 1));
  for (const tf of ["1W", "1M"]) {
    assert.deepEqual(Object.keys(out[tf].values).sort(), OLD_KEYS.concat(MTF.FIELDS_1_1).sort(), tf);
  }
});

test("ROC, Inside Bar, NR7 und Kerzen je Woche/Monat gleich der naiven Nachrechnung, an 40 Stichtagen kausal", () => {
  let checked = { "1W": { roc: 0, inside: 0, nr7: 0, candles: 0 }, "1M": { roc: 0, inside: 0, nr7: 0, candles: 0 } };
  for (let upto = ref.date.length - 1; upto >= ref.date.length - 200; upto -= 5) {
    const out = MTF.compute(series(upto));
    for (const tf of ["1W", "1M"]) {
      const nb = naive(KEY[tf], upto, tf), n = nb.close.length, t = n - 1, v = out[tf].values;
      assert.equal(out[tf].asOf, nb.date[t], tf + " asOf " + ref.date[upto]);
      for (const [k, h] of Object.entries(MTF.SPEC[tf].roc)) {
        const want = t >= h ? r4(nb.close[t] / nb.close[t - h] - 1) : null;
        assert.equal(v[k], want, tf + " " + k + " " + ref.date[upto]);
        if (want !== null) checked[tf].roc++;
      }
      const inside = nb.high[t] < nb.high[t - 1] && nb.low[t] > nb.low[t - 1];
      assert.equal(v.insideBar, inside, tf + " insideBar " + ref.date[upto]);
      checked[tf].inside++;
      if (n >= 7) {
        const rg = (i) => nb.high[i] - nb.low[i], last7 = [0, 1, 2, 3, 4, 5, 6].map((d) => rg(t - d));
        assert.equal(v.nr7, rg(t) <= Math.min(...last7), tf + " nr7 " + ref.date[upto]);
        checked[tf].nr7++;
      } else assert.equal(v.nr7, null);
      /* Kerzen: dieselbe Erkennung wie candlesticks.js auf den naiven Bars, nur die Liste des Screeners. */
      const res = Cdl.detect({ open: nb.open, high: nb.high, low: nb.low, close: nb.close }, { only: MTF.CANDLES }).patterns;
      const decidable = MTF.CANDLES.every((id) => Number.isFinite(res[id][t]));
      if (!decidable) { assert.equal(v.candleBullish, null); assert.equal(v.candleBearish, null); assert.equal(v.candleNeutral, null); continue; }
      const want = { bull: [], bear: [], neutral: [] };
      for (const id of MTF.CANDLES) {
        const x = res[id][t]; if (x === 0) continue;
        want[Cdl.pattern(id).direction === "neutral" ? "neutral" : x > 0 ? "bull" : "bear"].push(id);
      }
      assert.deepEqual([v.candleBullish, v.candleBearish, v.candleNeutral], [want.bull, want.bear, want.neutral], tf + " Kerzen " + ref.date[upto]);
      checked[tf].candles++;
    }
  }
  /* Die Pruefung darf nicht leer laufen. */
  assert.ok(checked["1W"].roc >= 100 && checked["1W"].candles >= 30 && checked["1M"].roc >= 80, JSON.stringify(checked));
});

test("Offene Woche zaehlt nicht: Stichtag Mittwoch liefert die Werte des Vorfreitags", () => {
  const wed = ref.date.findIndex((d, i) => i > 250 && new Date(d + "T12:00:00Z").getUTCDay() === 3);
  let fri = wed - 1;
  while (new Date(ref.date[fri] + "T12:00:00Z").getUTCDay() !== 5) fri--;
  const a = MTF.compute(series(wed))["1W"], b = MTF.compute(series(fri))["1W"];
  assert.equal(a.asOf, ref.date[fri]);
  assert.equal(a.droppedOpenBar, true);
  assert.deepEqual(a.values, b.values);
});

test("screen-row: Buendel 1.0.0 und Schlusskurs-Rechnung liefern null statt Schaetzung; ROC aus Wochenschluessen", () => {
  const full = MTF.compute(series(ref.date.length - 1));
  const old = JSON.parse(JSON.stringify(full));
  old.version = "technical-mtf-1.0.0";
  for (const tf of ["1W", "1M"]) for (const k of MTF.FIELDS_1_1) delete old[tf].values[k];
  const n = ref.date.length, bars = { timestamps: ref.date, open: ref.open, high: ref.high, low: ref.low, close: ref.close, volume: ref.volume };
  const base = { ticker: "AAPL", bars, weekly: null };
  const rowNew = Row.computeRow(Object.assign({}, base, { multiTimeframe: full }));
  const rowOld = Row.computeRow(Object.assign({}, base, { multiTimeframe: old }));
  for (const tf of ["1W", "1M"]) for (const k of MTF.FIELDS_1_1) {
    assert.ok(Object.prototype.hasOwnProperty.call(rowOld, k + "@" + tf), "Spalte " + k + "@" + tf);
    assert.equal(rowOld[k + "@" + tf], null, "1.0.0: " + k + "@" + tf);
    assert.deepEqual(rowNew[k + "@" + tf], full[tf].values[k], "1.1.0: " + k + "@" + tf);
  }
  /* Bestehende Wochen-/Monatsfelder haengen nicht von den neuen ab. */
  for (const tf of ["1W", "1M"]) for (const k of OLD_KEYS) assert.deepEqual(rowOld[k + "@" + tf], rowNew[k + "@" + tf], k + "@" + tf);
  /* Ohne Buendel: Wochenschluesse; ROC daraus, Spannen und Kerzen nicht berechenbar. */
  const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
  const blk = Row.closeOnlyBlock(closes, 40, 10, 52);
  assert.equal(blk.roc21, r4(159 / 155 - 1));
  assert.equal(blk.roc252, r4(159 / 107 - 1));
  for (const k of ["insideBar", "nr7", "candleBullish", "candleBearish", "candleNeutral"]) assert.equal(blk[k], null, k);
  assert.equal(Row.closeOnlyBlock(closes.slice(0, 30), 40, 10, 52).roc252, null, "zu kurze Historie: null");
  assert.ok(n > 0);
});

test("Abfrage: Woche und Monat sind fuer die neuen Felder zulaessig", () => {
  for (const id of MTF.FIELDS_1_1) {
    const f = Q.FIELDS.find((x) => x.id === id);
    assert.deepEqual(f.tfs, ["1D", "1W", "1M"], id);
    assert.equal(Q.columnKey(id, "1W"), id + "@1W");
  }
  assert.ok(Q.validate({ timeframe: "1W", groups: [{ filters: [{ field: "roc252", op: "gt", value: 0.2 }, { field: "candleBullish", op: "in", value: ["engulfing"] }] }] }).ok);
  assert.ok(Q.validate({ timeframe: "1M", groups: [{ filters: [{ field: "insideBar", op: "is", value: true }] }] }).ok);
});
