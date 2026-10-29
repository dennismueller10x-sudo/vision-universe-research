/* AP4: Ereignisse je Woche und Monat (Kreuzung der langen Linie, RSI verlaesst 30/70) und 52-Wochen-Tief
   (multi-timeframe.js 1.2.0, screen-row.js 1.11.0, technical-query.js 1.11.0, docs/technical/SCREENER_FIELDS_AP4.md).
   Referenz: eingefrorener AAPL-Ausschnitt; Wochen-/Monatsbars, SMA und RSI werden hier naiv und unabhaengig gerechnet. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const C = require("../engines/technical/canonical-bars.js");
const MTF = require("../engines/technical/multi-timeframe.js");
const Row = require("../engines/technical/screen-row.js");
const Q = require("../engines/technical/technical-query.js");
const Contract = require("../engines/technical/screener-contract.js");
const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));

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
/** Schlusskurse der abgeschlossenen Wochen bzw. Monate bis einschliesslich Tag `upto`. */
function closes(tf, upto) {
  const key = tf === "1W" ? isoWeek : (d) => d.slice(0, 7), out = [];
  let cur = null;
  for (let i = 0; i <= upto; i++) { const k = key(ref.date[i]); if (k !== cur) { cur = k; out.push(ref.close[i]); } else out[out.length - 1] = ref.close[i]; }
  if (!MTF.closedAt(ref.date[upto], tf)) out.pop();
  return out;
}
function sma(c, p) { return c.map((_, i) => (i + 1 < p ? NaN : c.slice(i + 1 - p, i + 1).reduce((a, b) => a + b, 0) / p)); }
/** RSI nach Wilder, erste Durchschnitte als einfacher Mittelwert der ersten 14 Aenderungen. */
function rsi(c, p = 14) {
  const out = c.map(() => NaN);
  if (c.length <= p) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= p; l /= p; out[p] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = p + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1]; g = (g * (p - 1) + Math.max(d, 0)) / p; l = (l * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
/** Naive Ereignissuche: juengstes Ereignis rueckwaerts, Pruefraum = zusammenhaengend entscheidbare Bars. */
function naiveEvent(a, z, dir) {
  const t = a.length - 1; let w = 0, bars = null;
  for (let i = t; i >= 1 && [a[i], z[i], a[i - 1], z[i - 1]].every(Number.isFinite); i--) {
    w++;
    const hit = dir > 0 ? a[i - 1] <= z[i - 1] && a[i] > z[i] : a[i - 1] >= z[i - 1] && a[i] < z[i];
    if (bars === null && hit) bars = t - i;
  }
  return { bars, window: w || null };
}

test("Ereignisse und 52-Wochen-Tief je Woche/Monat gleich der naiven Nachrechnung, an 40 Stichtagen kausal", () => {
  const seen = { "1W": { cross: 0, rsi: 0, low: 0, window: 0 }, "1M": { cross: 0, rsi: 0, low: 0, window: 0 } };
  for (let upto = ref.date.length - 1, k = 0; k < 40; upto -= 2, k++) {
    const out = MTF.compute(series(upto));
    for (const tf of ["1W", "1M"]) {
      const v = out[tf] && out[tf].values;
      if (!v) continue;
      const c = closes(tf, upto), spec = MTF.SPEC[tf], sl = sma(c, spec.longMa), rs = rsi(c);
      const up = naiveEvent(c, sl, 1), dn = naiveEvent(c, sl, -1);
      assert.equal(v.crossAboveSma200Days, up.bars, tf + " " + ref.date[upto] + " Kreuzung aufwaerts");
      assert.equal(v.crossBelowSma200Days, dn.bars, tf + " " + ref.date[upto] + " Kreuzung abwaerts");
      assert.equal(v.sma200CrossWindow, up.window, tf + " Pruefraum Linie");
      const l30 = c.map(() => 30), l70 = c.map(() => 70), ro = naiveEvent(rs, l30, 1), rb = naiveEvent(rs, l70, -1);
      assert.equal(v.rsiExitOversoldDays, ro.bars, tf + " " + ref.date[upto] + " RSI 30");
      assert.equal(v.rsiExitOverboughtDays, rb.bars, tf + " " + ref.date[upto] + " RSI 70");
      assert.equal(v.rsiEventWindow, ro.window, tf + " Pruefraum RSI");
      const lo = c.length >= spec.highBars ? Math.min(...c.slice(c.length - spec.highBars)) : null;
      assert.equal(v.newLow52w, lo === null ? null : c[c.length - 1] <= lo, tf + " Tief");
      for (const [d, w] of [[v.crossAboveSma200Days, v.sma200CrossWindow], [v.crossBelowSma200Days, v.sma200CrossWindow], [v.rsiExitOversoldDays, v.rsiEventWindow], [v.rsiExitOverboughtDays, v.rsiEventWindow]])
        if (d !== null) assert.ok(w !== null && d < w, "Ereignis liegt im Pruefraum");
      if (up.bars !== null || dn.bars !== null) seen[tf].cross++;
      if (ro.bars !== null || rb.bars !== null) seen[tf].rsi++;
      if (v.newLow52w !== null) seen[tf].low++;
      if (v.sma200CrossWindow !== null) seen[tf].window++;
    }
  }
  /* Der Ausschnitt muss die Rechnung tatsaechlich ausueben, sonst prueft der Test nichts. */
  assert.ok(seen["1W"].window > 0 && seen["1W"].rsi > 0 && seen["1W"].low > 0, JSON.stringify(seen));
  assert.ok(seen["1M"].window > 0 && seen["1M"].low > 0, JSON.stringify(seen));
});

test("Kreuzungen und RSI-Austritte an einer Reihe mit Wellen: blockAP4 gleich der naiven Suche, an jedem Bar", () => {
  /* 160 Wochenschluesse als Sinuswelle mit Trend: kreuzt die 40er-Linie mehrfach, RSI erreicht 30 und 70. */
  const c = Array.from({ length: 160 }, (_, i) => 100 + 0.1 * i + 30 * Math.sin(i / 9));
  let crosses = 0, rsiHits = 0;
  for (let n = 45; n <= c.length; n++) {
    const cl = c.slice(0, n), bars = { open: cl, high: cl, low: cl, close: cl, volume: cl.map(() => 0) };
    const v = MTF.blockAP4(bars, MTF.SPEC["1W"]), sl = sma(cl, 40), rs = rsi(cl);
    const up = naiveEvent(cl, sl, 1), dn = naiveEvent(cl, sl, -1), ro = naiveEvent(rs, cl.map(() => 30), 1), rb = naiveEvent(rs, cl.map(() => 70), -1);
    assert.deepEqual([v.crossAboveSma200Days, v.crossBelowSma200Days, v.sma200CrossWindow], [up.bars, dn.bars, up.window], "Linie bei " + n);
    assert.deepEqual([v.rsiExitOversoldDays, v.rsiExitOverboughtDays, v.rsiEventWindow], [ro.bars, rb.bars, ro.window], "RSI bei " + n);
    if (v.crossAboveSma200Days === 0 || v.crossBelowSma200Days === 0) crosses++;
    if (v.rsiExitOversoldDays === 0 || v.rsiExitOverboughtDays === 0) rsiHits++;
  }
  assert.ok(crosses >= 4 && rsiHits >= 2, "Ereignisse geuebt: " + crosses + " Kreuzungen, " + rsiHits + " RSI-Austritte");
});

test("Bestehende Wochen-/Monatswerte bleiben gleich: blockOf und blockL7 unveraendert, nur neue Schluessel kommen dazu", () => {
  const out = MTF.compute(series(ref.date.length - 1));
  for (const tf of ["1W", "1M"]) {
    const v = out[tf].values;
    for (const k of MTF.FIELDS_1_2) assert.ok(k in v, k);
    const n = out[tf].bars, agg = require("../engines/technical/timeframe.js").aggregate(series(ref.date.length - 1), tf);
    const bars = { open: agg.open.slice(0, n), high: agg.high.slice(0, n), low: agg.low.slice(0, n), close: agg.close.slice(0, n), volume: agg.volume.slice(0, n) };
    assert.deepEqual(Object.assign(MTF.blockOf(bars, MTF.SPEC[tf]), MTF.blockL7(bars, MTF.SPEC[tf])),
      Object.fromEntries(Object.entries(v).filter(([k]) => !MTF.FIELDS_1_2.includes(k))), tf);
  }
});

test("Screener-Zeile: Buendel 1.1.0 -> neue Spalten null; 1.2.0 -> uebernommen; veraltete Titel ohne Ereignisse je Zeitrahmen", () => {
  const mtf = MTF.compute(series(ref.date.length - 1));
  const base = { ticker: "AAPL", bars: { timestamps: ref.date, open: ref.open, high: ref.high, low: ref.low, close: ref.close, volume: ref.volume },
    features: { low52w: Math.min(...ref.low.slice(-252)), high52w: Math.max(...ref.high.slice(-252)) }, series: series(ref.date.length - 1) };
  const old = JSON.parse(JSON.stringify(mtf)); old.version = "technical-mtf-1.1.0";
  for (const tf of ["1W", "1M"]) for (const k of MTF.FIELDS_1_2) delete old[tf].values[k];
  const a = Row.computeRow(Object.assign({}, base, { multiTimeframe: old })), b = Row.computeRow(Object.assign({}, base, { multiTimeframe: mtf }));
  for (const tf of ["@1W", "@1M"]) for (const k of MTF.FIELDS_1_2) {
    assert.equal(a[k + tf], null, "1.1.0: " + k + tf);
    assert.deepEqual(b[k + tf], mtf[tf.slice(1)].values[k], "1.2.0: " + k + tf);
  }
  assert.equal(typeof b.newLow52w, "boolean", "Tageswert aus der Vollhistorie");
  const s = Row.markStale(Object.assign({}, b));
  for (const tf of ["", "@1W", "@1M"]) for (const k of ["crossAboveSma200Days", "rsiExitOversoldDays", "sma200CrossWindow", "rsiEventWindow", "newLow52w"])
    if ((k + tf) in s) assert.equal(s[k + tf], null, "veraltet: " + k + tf);
});

test("Abfrage: Ereignisse je Zeitrahmen mit eigenem Pruefraum; Vertrag kennt die Pruefraum-Spalten", () => {
  const art = { schemaVersion: "test", cols: { s: ["A", "B", "C", "D"],
    "crossAboveSma200Days@1W": [1, null, null, 5], "sma200CrossWindow@1W": [20, 20, null, 30],
    crossAboveSma200Days: [null, null, null, null], sma200CrossWindow: [null, null, null, null] } };
  const ds = Q.createDataset(art);
  const lte = Q.evaluate(ds, { timeframe: "1W", groups: [{ filters: [{ field: "crossAboveSma200Days", op: "lte", value: 3 }] }] });
  assert.deepEqual(lte.indices.map((i) => art.cols.s[i]), ["A"]);
  /* "mindestens 10 Wochen her": B hat im Pruefraum von 20 Wochen keine Kreuzung -> sicher ja; C unbekannt */
  const gt = Q.evaluate(ds, { timeframe: "1W", groups: [{ filters: [{ field: "crossAboveSma200Days", op: "gt", value: 10 }] }] });
  assert.deepEqual(gt.indices.map((i) => art.cols.s[i]), ["B"]);
  const spec = Contract.columns();
  for (const tf of ["@1W", "@1M"]) {
    assert.equal(spec["crossAboveSma200Days" + tf].window, "sma200CrossWindow" + tf);
    assert.equal(spec["rsiExitOversoldDays" + tf].window, "rsiEventWindow" + tf);
    assert.equal(spec["sma200CrossWindow" + tf].type, "int");
    assert.equal(spec["newLow52w" + tf].type, "bool");
  }
  assert.equal(spec.sma200CrossWindow.label, "Prüfraum in Handelstagen");
  assert.equal(Q.labelOf(Q.field("crossAboveSma200Days"), "1W"), "Wochen seit Schluss über die 40-Wochen-Linie gekreuzt");
});

test("52-Wochen-Tief: Tag aus Tagestiefs (Vollhistorie, feature-store low52w), Woche/Monat aus Schlusskursen; Beschriftung nennt die Basis", () => {
  const fsSrc = readFileSync(new URL("../engines/technical/feature-store.js", import.meta.url), "utf8");
  assert.match(fsSrc, /low52w\s*=\s*rollingMin\(low,/, "low52w = rollierendes Minimum der Tagestiefs");
  const n = ref.date.length, t = n - 1, lowMin = Math.min(...ref.low.slice(n - 252));
  const base = { ticker: "AAPL", bars: { timestamps: ref.date, open: ref.open, high: ref.high, low: ref.low.slice(), close: ref.close, volume: ref.volume }, series: series(t) };
  /* Tagestief am Stichtag unter dem Jahrestief, Schluss deutlich darueber: Tag = ja (Tagestief), nicht aus dem Schluss */
  base.bars.low[t] = lowMin - 1;
  const r = Row.computeRow(Object.assign({}, base, { features: { low52w: lowMin - 1, high52w: Math.max(...ref.high) } }));
  assert.equal(r.newLow52w, true);
  assert.ok(ref.close[t] > lowMin, "Schluss liegt ueber dem Tief");
  const r2 = Row.computeRow(Object.assign({}, base, { bars: Object.assign({}, base.bars, { low: ref.low }), features: { low52w: lowMin - 1, high52w: Math.max(...ref.high) } }));
  assert.equal(r2.newLow52w, false, "ohne neues Tagestief kein Tief");
  const f = Q.field("newLow52w");
  assert.match(Q.labelOf(f, "1D"), /Tagestief/);
  assert.match(Q.labelOf(f, "1W"), /Wochenschluss/);
  assert.match(Q.labelOf(f, "1M"), /Monatsschluss/);
  /* fehlende Historie: null, nie false */
  const r3 = Row.computeRow(Object.assign({}, base, { features: {} }));
  assert.equal(r3.newLow52w, null);
});
