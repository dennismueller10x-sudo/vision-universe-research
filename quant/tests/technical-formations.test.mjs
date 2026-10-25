/* Tests fuer quant/engines/technical/formations.js.

   1. Jede neue Regel wird an einer konstruierten Reihe ausgeloest
      (Wimpel, Keil, Range-Ausbruch, Volatilitaetskontraktion, Kanal,
      Trendlinie) — mit Erkennungs- und Bestaetigungsbar.
   2. Kein Look-ahead: Ergebnis Stand t auf der vollen Reihe ==
      Ergebnis auf der bei t abgeschnittenen Reihe == Ergebnis bei
      vergifteter Zukunft (reale AAPL-Referenzdaten).
   3. Zustandsmodell: nur DETECTED / CONFIRMED / INVALIDATED,
      Zeitpunkte geordnet, nie nach dem Stand. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { seriesFromCloses } from "./technical-fixtures.mjs";

const require = createRequire(import.meta.url);
const Fm = require("../engines/technical/formations.js");
const Ctx = require("../engines/technical/ti/context.js");
const Canonical = require("../engines/technical/canonical-bars.js");

function path(way) {
  const out = [];
  for (let i = 1; i < way.length; i++) {
    const [, v0] = way[i - 1], [n1, v1] = way[i];
    for (let k = 0; k < n1; k++) out.push(v0 + (v1 - v0) * (k + 1) / n1);
  }
  return out;
}
function synthetic(name, way) {
  const closes = path(way).map((v, i) => v * (1 + 0.002 * Math.sin(i * 1.7)));
  return seriesFromCloses(closes, { seed: "syn-" + name, rangePct: 0.004 });
}
function find(res, type) { return res.formations.find((f) => f.type === type); }

const CASES = {
  pennant: [[0, 100], [60, 100], [12, 160], [3, 148], [3, 156], [3, 150], [3, 154], [2, 151.5], [2, 153], [2, 162]],
  wedge: [[0, 100], [40, 100], [10, 120], [6, 112], [10, 128], [6, 121], [10, 133], [6, 128], [8, 136], [4, 131], [6, 124]],
  range: [[0, 80], [30, 100], [30, 101], [3, 99], [4, 104], [2, 105]],
  vcp: [[0, 60], [80, 100], [10, 80], [15, 100], [8, 88], [12, 100], [6, 93], [10, 100], [4, 96.5], [6, 100], [3, 103]],
  trend: [[0, 100], [20, 110], [10, 104], [20, 118], [10, 111], [20, 125]]
};

test("Bullischer Wimpel: erkannt nach dem Mast, bestaetigt erst beim Schluss ueber dem Konsolidierungshoch", () => {
  const s = synthetic("pennant", CASES.pennant), f = find(Fm.analyze(s), "BULL_PENNANT");
  assert.ok(f, "Wimpel erkannt");
  assert.equal(f.state, "CONFIRMED");
  const conf = s.timestamps.indexOf(f.confirmedAt);
  assert.ok(conf > f.detectedIndex, "Bestaetigung nach Erkennung");
  assert.ok(s.close[conf] > f.levels.upperNow - 1e-9 || s.close[conf] > 155, "Schluss ueber der Oberkante");
  /* Stand vor dem Ausbruch: nur erkannt. */
  const before = find(Fm.analyzeAt(Ctx.prepare(s), conf - 1), "BULL_PENNANT");
  assert.equal(before && before.state, "DETECTED");
});

test("Steigender Keil (bearisch) wird bei Bruch der unteren Linie bestaetigt", () => {
  const s = synthetic("wedge", CASES.wedge), f = find(Fm.analyze(s), "RISING_WEDGE");
  assert.ok(f);
  assert.equal(f.direction, "BEARISH");
  assert.equal(f.state, "CONFIRMED");
  assert.ok(f.levels.narrowing >= 0.25);
});

test("Range-Ausbruch: Erkennung am Ausbruchsbar, Bestaetigung mit dem zweiten Schluss darueber", () => {
  const s = synthetic("range", CASES.range), prep = Ctx.prepare(s);
  const f = find(Fm.analyzeAt(prep, s.length - 1), "RANGE_BREAKOUT");
  assert.ok(f);
  assert.ok(s.close[f.detectedIndex] > f.levels.rangeHigh);
  assert.ok(s.close[f.detectedIndex - 1] <= f.levels.rangeHigh);
  /* zwei Bars spaeter, Kurs zurueck unter die Range-Mitte: invalidiert */
  const closes = path(CASES.range).map((v, i) => v * (1 + 0.002 * Math.sin(i * 1.7)));
  const fail = seriesFromCloses(closes.slice(0, f.detectedIndex + 1).concat([closes[f.detectedIndex] + 0.5, 90]), { seed: "syn-range", rangePct: 0.004 });
  const g = find(Fm.analyze(fail), "RANGE_BREAKOUT");
  assert.equal(g.state, "INVALIDATED");
});

test("Volatilitaetskontraktion: mindestens drei schrumpfende Ruecksetzer, Bestaetigung ueber dem Pivot", () => {
  const s = synthetic("vcp", CASES.vcp), f = find(Fm.analyze(s), "VOLATILITY_CONTRACTION");
  assert.ok(f);
  const d = f.levels.depths;
  assert.ok(d.length >= 3);
  for (let i = 1; i < d.length; i++) assert.ok(d[i] <= d[i - 1] * 0.8 + 1e-9, "Tiefe schrumpft");
  assert.equal(f.state, "CONFIRMED");
});

test("Aufwaertstrend: Aufwaertskanal und steigende Unterstuetzungslinie", () => {
  const res = Fm.analyze(synthetic("trend", CASES.trend));
  assert.ok(find(res, "ASCENDING_CHANNEL"));
  const tl = find(res, "SUPPORT_TRENDLINE");
  assert.ok(tl && tl.lines.length === 1 && tl.levels.slopePerBar > 0);
});

/* ---------- Kausalitaet auf realen Daten ---------- */
const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));
function refSeries(rows) {
  return Canonical.fromRows(rows, { instrumentId: "AAPL", exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "tiingo", sourceRevision: "fixture" });
}
const rows = ref.date.map((d, i) => ({ date: d, open: ref.open[i], high: ref.high[i], low: ref.low[i], close: ref.close[i], volume: ref.volume[i] }));
const full = refSeries(rows), prepFull = Ctx.prepare(full);
const strip = (r) => JSON.stringify(r.formations.map(({ dataQuality, ...f }) => f));

test("Kein Look-ahead: Stand t == abgeschnittene Reihe == vergiftete Zukunft (AAPL real)", () => {
  for (const t of [120, 180, 230, 280, rows.length - 1]) {
    const a = Fm.analyzeAt(prepFull, t);
    const b = Fm.analyzeAt(Ctx.prepare(refSeries(rows.slice(0, t + 1))), t);
    assert.equal(strip(a), strip(b), "abgeschnitten, t=" + t);
    const poisoned = rows.map((r, i) => i <= t ? r : { ...r, open: r.open * 3, high: r.high * 3.2, low: r.low * 0.2, close: r.close * (i % 2 ? 3 : 0.3) });
    const c = Fm.analyzeAt(Ctx.prepare(refSeries(poisoned)), t);
    assert.equal(strip(a), strip(c), "vergiftet, t=" + t);
  }
});

test("Zustandsmodell und Zeitpunkte (AAPL real, jeder 5. Bar)", () => {
  const states = new Set(Object.keys(Fm.STATES));
  let total = 0;
  for (let t = 60; t < rows.length; t += 5) {
    const r = Fm.analyzeAt(prepFull, t);
    for (const f of r.formations) {
      total++;
      assert.ok(states.has(f.state), f.state);
      assert.ok(f.detectedIndex <= t, "Erkennung nie nach dem Stand");
      assert.ok(f.detectedAt <= r.asOf);
      /* Eine Formation kann erst bestaetigt und spaeter invalidiert werden (z. B. Trendlinie: dritter Kontakt, dann Bruch). */
      if (f.confirmedAt) { assert.notEqual(f.state, "DETECTED"); assert.ok(f.confirmedAt <= r.asOf && f.confirmedAt >= f.detectedAt, f.id); }
      if (f.invalidatedAt) { assert.equal(f.state, "INVALIDATED"); assert.ok(f.invalidatedAt <= r.asOf, f.id); }
      if (f.confirmedAt && f.invalidatedAt) assert.ok(f.confirmedAt <= f.invalidatedAt, f.id);
      if (f.state === "CONFIRMED") assert.ok(f.confirmedAt, "bestaetigt ohne Zeitpunkt: " + f.id);
      assert.ok(f.rules.confirm && f.rules.invalidate && f.name, "Regeltexte " + f.type);
      for (const l of f.lines) assert.ok(l.from.time <= r.asOf && l.to.time <= r.asOf, "Linie endet nicht in der Zukunft: " + f.id);
    }
  }
  assert.ok(total > 20, "reale Reihe liefert Formationen: " + total);
});

test("Historie: jede Erkennung traegt den damaligen Zustand und wann sie bekannt war", () => {
  const h = Fm.history(prepFull, 100);
  assert.ok(h.length > 3);
  for (const e of h) {
    assert.ok(e.knownAt >= e.detectedAt, e.id);
    assert.ok(Object.keys(Fm.STATES).includes(e.stateAtDetection));
  }
  assert.deepEqual(Fm.history(prepFull, 100), h, "deterministisch");
});

test("Formationskanten beginnen am ersten Hoch (Oberkante) bzw. ersten Tief (Unterkante)", () => {
  let checked = 0;
  for (let t = 60; t < rows.length; t += 3) {
    for (const f of Fm.analyzeAt(prepFull, t).formations) {
      for (const l of f.lines.filter((x) => x.role === "upper" || x.role === "lower")) {
        const side = l.role === "upper" ? "HIGH" : "LOW";
        const pts = (f.points || []).filter((p) => p.side === side);
        if (!pts.length) continue;
        if (f.source === "ti-chart-patterns-1.0.0") { assert.equal(l.from.time, pts[0].time, f.id + " " + l.role); checked++; }
      }
    }
  }
  assert.ok(checked > 0, "mindestens eine Bestandsformation mit Kanten geprueft");
});

test("Kursluecke: reale AAPL-Luecke vom 03.05.2024 (Quartalszahlen) mit Volumen, Zustaende kausal", () => {
  const t = rows.findIndex((r) => r.date === "2024-05-03");
  const f = Fm.analyzeAt(prepFull, t).formations.find((x) => x.type === "GAP_UP");
  assert.ok(f, "Luecke am Ausloesetag erkannt");
  assert.equal(f.detectedAt, "2024-05-03");
  assert.equal(f.state, "DETECTED", "am Ausloesetag noch nicht bestaetigt");
  assert.ok(rows[t].low > rows[t - 1].high && f.levels.gapAtr >= 0.5 && f.levels.relativeVolume >= 1.5);
  const later = Fm.analyzeAt(prepFull, t + 3).formations.find((x) => x.id === f.id);
  assert.equal(later.state, "CONFIRMED", "drei Schluesse ueber der Lueckenunterkante");
  assert.equal(later.confirmedAt, rows[t + 3].date);
});

test("Kursluecke: konstruiert; ohne Volumenspitze keine Luecke, geschlossen per Schluss = invalidiert", () => {
  const base = seriesFromCloses(Array.from({ length: 80 }, (_, i) => 100 + 0.05 * Math.sin(i)), { seed: "gap", rangePct: 0.004 });
  const k = 70;
  function build(spike, lastClose) {
    const rows = base.timestamps.map((d, i) => {
      const up = i >= k ? 6 : 0;
      return { date: d, open: base.open[i] + up, high: base.high[i] + up, low: base.low[i] + up, close: base.close[i] + up, volume: i === k ? spike : 1e6 };
    });
    if (lastClose !== undefined) { const r = rows[rows.length - 1]; r.close = lastClose; r.low = Math.min(r.low, lastClose); r.open = Math.max(r.open, lastClose); }
    return Canonical.fromRows(rows, { instrumentId: "SYN", exchange: "SYN", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "fixture", sourceRevision: "gap" });
  }
  const gapOf = (s) => Fm.analyzeAt(Ctx.prepare(s), s.length - 1).formations.find((x) => x.type === "GAP_UP");
  const f = gapOf(build(3e6));
  assert.ok(f && f.detectedIndex === k, "Luecke an Bar " + k);
  assert.equal(f.state, "CONFIRMED");
  assert.equal(gapOf(build(1e6)), undefined, "Volumen vorhanden, aber keine Spitze: keine Luecke");
  const closed = gapOf(build(3e6, base.high[k - 1] - 0.5));
  assert.equal(closed.state, "INVALIDATED");
  assert.equal(closed.invalidatedAt, base.timestamps[base.length - 1]);
});
