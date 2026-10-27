/* Tests fuer quant/engines/technical/formations.js.

   1. Jede neue Regel wird an einer konstruierten Reihe ausgeloest
      (Wimpel, Keil, Range-Ausbruch, Volatilitaetskontraktion, Kanal,
      Trendlinie) — mit Erkennungs- und Bestaetigungsbar.
   2. Kein Look-ahead: Ergebnis Stand t auf der vollen Reihe ==
      Ergebnis auf der bei t abgeschnittenen Reihe == Ergebnis bei
      vergifteter Zukunft (reale AAPL-Referenzdaten).
   3. Zustandsmodell: nur DETECTED / CONFIRMED / INVALIDATED,
      Zeitpunkte geordnet, nie nach dem Stand.
   4. Lebenszyklus (1.2.0): Bestandsformation endet invalidiert statt zu
      verschwinden, Flagge wird bestaetigt, Kanal/Keil erkannt vor der
      Bestaetigung — jeweils auch abgeschnitten und vergiftet geprueft. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { seriesFromCloses, tradingDays } from "./technical-fixtures.mjs";

const require = createRequire(import.meta.url);
const Fm = require("../engines/technical/formations.js");
const Ctx = require("../engines/technical/ti/context.js");
const Canonical = require("../engines/technical/canonical-bars.js");
const Pat = require("../engines/technical/ti/chart-patterns.js");

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
  /* Vier Punkte H-L-H-L erkennen den Keil; das dritte Hoch bleibt unter der oberen Linie, danach Bruch nach unten. */
  wedge: [[0, 125], [30, 125], [10, 118], [12, 140], [12, 115], [18, 150], [12, 138], [12, 152], [8, 130], [4, 128]],
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
  /* 1.2.0: erkannt mit dem vierten Swing-Punkt, bestaetigt erst spaeter durch den Bruch — vorher fielen beide zusammen. */
  const conf = s.timestamps.indexOf(f.confirmedAt);
  assert.ok(conf > f.detectedIndex, "Bestaetigung nach Erkennung");
  const before = Fm.analyzeAt(Ctx.prepare(s), conf - 1).formations.find((x) => x.id === f.id);
  assert.equal(before && before.state, "DETECTED");
});

/* ---------- Lebenszyklus 1.2.0: Erkennung, Bestaetigung und Invalidierung getrennt ---------- */
const LIFE = {
  /* Aufwaertstrend, Doppeltop 120/120, Ruecksetzer, neues Tief bestaetigt (Fenster verschiebt sich), Anstieg ueber 120. */
  doubleTop: [[0, 80], [40, 100], [12, 120], [10, 108], [10, 120], [8, 110], [6, 116], [8, 124], [10, 125]],
  /* Steiler Mast 100 -> 140, Flagge bis 130, Ausbruch ueber das Mast-Hoch. */
  flag: [[0, 100], [15, 115], [15, 104], [15, 120], [20, 100], [10, 140], [5, 130], [4, 133], [4, 142], [6, 146]],
  /* Aufwaertskanal: vier Punkte erkennen, der fuenfte bestaetigt. */
  channel: [[0, 100], [20, 110], [10, 104], [20, 118], [10, 111], [20, 125], [10, 118], [16, 128]]
};
/** Zustand je Bar fuer eine Formations-ID (oder alle IDs eines Typs). */
function timeline(s, type) {
  const prep = Ctx.prepare(s), out = new Map();
  for (let t = 40; t < s.length; t++) for (const f of Fm.analyzeAt(prep, t).formations) if (f.type === type) {
    if (!out.has(f.id)) out.set(f.id, []);
    out.get(f.id).push({ t, f });
  }
  return out;
}

test("Bestandsformation: Doppeltop endet invalidiert, statt beim naechsten Pivot zu verschwinden", () => {
  const s = synthetic("dt", LIFE.doubleTop), tl = [...timeline(s, "DOUBLE_TOP").values()];
  assert.equal(tl.length, 1, "eine Formation, eine ID");
  const seq = tl[0], first = seq[0], lastSeen = seq[seq.length - 1];
  assert.equal(first.f.state, "DETECTED");
  const inv = seq.find((x) => x.f.state === "INVALIDATED");
  assert.ok(inv, "invalidiert statt entfallen");
  const iAt = s.timestamps.indexOf(inv.f.invalidatedAt);
  assert.equal(inv.t, iAt, "sichtbar ab dem Bar der Invalidierung");
  assert.ok(s.close[iAt] > inv.f.levels.invalidation && s.close[iAt - 1] <= inv.f.levels.invalidation, "erster Schluss ueber dem hoeheren Hoch");
  /* Der Pivot, der das Fenster verschiebt, wurde vor der Invalidierung bestaetigt: ohne Lebenszyklus waere die Formation dort verschwunden. */
  const piv = Ctx.prepare(s).pivots.scales["scale-2"].pivots.filter((p) => p.confirmedIndex > first.f.detectedIndex && p.confirmedIndex <= iAt);
  assert.ok(piv.length >= 1, "neuer Pivot zwischen Erkennung und Invalidierung");
  /* lueckenlos gelistet von der Erkennung bis LEGACY_KEEP Bars nach der Invalidierung, danach nicht mehr */
  assert.deepEqual(seq.map((x) => x.t), Array.from({ length: iAt + Fm.LEGACY_KEEP - first.t + 1 }, (_, k) => first.t + k));
  assert.equal(lastSeen.t, Math.min(s.length - 1, iAt + Fm.LEGACY_KEEP));
});

test("Bullische Flagge: erkannt nach dem Mast, bestaetigt beim Schluss ueber dem Mast-Hoch", () => {
  const s = synthetic("flag", LIFE.flag), seq = [...timeline(s, "BULL_FLAG").values()].find((x) => x.some((y) => y.f.state === "CONFIRMED"));
  assert.ok(seq, "eine Flagge wird bestaetigt");
  const c = seq.find((x) => x.f.state === "CONFIRMED"), cAt = s.timestamps.indexOf(c.f.confirmedAt);
  assert.equal(seq[0].f.state, "DETECTED");
  assert.ok(cAt > seq[0].f.detectedIndex, "Bestaetigung nach Erkennung");
  assert.ok(s.close[cAt] > c.f.levels.breakout && s.close[cAt - 1] <= c.f.levels.breakout, "erster Schluss ueber dem Mast-Hoch");
  /* Ursache, warum 1.1.0 nie bestaetigte: das Flaggentief wird als Pivot bestaetigt, bevor der Kurs das Mast-Hoch ueberwindet. */
  const flagLow = Ctx.prepare(s).pivots.scales["scale-2"].pivots.find((p) => p.side === "LOW" && p.pivotIndex > seq[0].f.detectedIndex - 10 && p.confirmedIndex <= cAt);
  assert.ok(flagLow && flagLow.confirmedIndex <= cAt, "Flaggentief vor/mit dem Ausbruch bestaetigt");
  assert.equal(c.t, cAt, "bestaetigt sichtbar am Ausbruchsbar");
});

test("Bullische Flagge: ohne Ausbruch innerhalb von 1,5 x Mastdauer invalidiert (Zeitgrenze)", () => {
  const way = LIFE.flag.slice(0, 7).concat([[30, 134]]);
  const s = synthetic("flag", way), seq = [...timeline(s, "BULL_FLAG").values()].pop();
  const inv = seq.find((x) => x.f.state === "INVALIDATED");
  assert.ok(inv, "Flagge invalidiert");
  assert.ok(seq.every((x) => x.f.state !== "CONFIRMED"));
});

test("Aufwaertskanal: erkannt mit vier Swing-Punkten, bestaetigt erst mit dem fuenften, gleiche ID", () => {
  const s = synthetic("trend", LIFE.channel), tl = timeline(s, "ASCENDING_CHANNEL");
  assert.equal(tl.size, 1, "keine Neuerkennung je Pivot");
  const seq = [...tl.values()][0], first = seq[0];
  assert.equal(first.f.state, "DETECTED", "bei Erkennung noch nicht bestaetigt");
  assert.equal(first.t, first.f.detectedIndex);
  assert.equal(first.f.points.length, 4);
  const c = seq.find((x) => x.f.state === "CONFIRMED");
  assert.ok(c, "spaeter bestaetigt");
  const cAt = s.timestamps.indexOf(c.f.confirmedAt), fifth = Ctx.prepare(s).pivots.scales["scale-2"].pivots.find((p) => p.confirmedIndex === cAt);
  assert.ok(cAt > first.f.detectedIndex && fifth, "Bestaetigung = Bestaetigung des fuenften Swing-Punkts");
  assert.equal(c.f.points.length, 5);
});

function poisonedSeries(s, t) {
  const rows = s.timestamps.map((d, i) => i <= t ? { date: d, open: s.open[i], high: s.high[i], low: s.low[i], close: s.close[i], volume: s.volume[i] }
    : { date: d, open: s.open[i] * 3, high: s.high[i] * 3.2, low: s.low[i] * 0.2, close: s.close[i] * (i % 2 ? 3 : 0.3), volume: s.volume[i] * 7 });
  return Canonical.fromRows(rows, { instrumentId: "SYN", exchange: "SYN", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "synthetic", sourceRevision: "fixture-1" });
}
test("Kein Look-ahead im Lebenszyklus: konstruierte Reihen, jeder Bar (abgeschnitten und vergiftet)", () => {
  for (const [name, way] of Object.entries(LIFE)) {
    const s = synthetic(name, way), prep = Ctx.prepare(s);
    for (let t = 45; t < s.length - 1; t++) {
      const a = Fm.analyzeAt(prep, t);
      const cut = Canonical.fromRows(s.timestamps.slice(0, t + 1).map((d, i) => ({ date: d, open: s.open[i], high: s.high[i], low: s.low[i], close: s.close[i], volume: s.volume[i] })),
        { instrumentId: "SYN", exchange: "SYN", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "synthetic", sourceRevision: "fixture-1" });
      assert.equal(strip(a), strip(Fm.analyzeAt(Ctx.prepare(cut), t)), name + " abgeschnitten, t=" + t);
      assert.equal(strip(a), strip(Fm.analyzeAt(Ctx.prepare(poisonedSeries(s, t)), t)), name + " vergiftet, t=" + t);
    }
  }
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
  /* 1.2.0: dichter, damit Anker (Bars vor Pivot-Bestaetigungen) und Nachlaufzeiten mitgeprueft werden. */
  const ts = [120, 180, 230, 280, rows.length - 1];
  for (let t = 125; t < rows.length - 1; t += 11) ts.push(t);
  for (const t of ts) {
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
      /* Statusangaben (Owner-Entscheidung #938): Ausbruch mit Zeitpunkt und Richtung; "bei Erkennung ausgebrochen" nur, wenn
         der Ausbruch nicht nach der Erkennung lag; vorlaeufig nur offene Kanaele; offene Richtung nur ohne Ausbruch. */
      if (f.confirmedAt) { assert.equal(f.breakout.at, f.confirmedAt); assert.ok(["UP", "DOWN"].includes(f.breakout.direction)); } else assert.equal(f.breakout, null);
      assert.equal(f.confirmedAtDetection, !!f.confirmedAt && f.confirmedAt <= f.detectedAt, f.id);
      assert.equal(f.provisional, f.family === "CHANNEL" && f.state === "DETECTED", f.id);
      if (f.directionOpen) { assert.equal(f.state, "DETECTED"); assert.equal(f.breakout, null); }
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
        if (f.source === Pat.ENGINE_VERSION) { assert.equal(l.from.time, pts[0].time, f.id + " " + l.role); checked++; }
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

test("Kursluecke: Sprung mit Split-Signatur oder extremem Faktor ist Datenverdacht, keine Luecke", () => {
  for (const r of [2, 3.03, 10, 0.5, 1 / 3, 0.01, 0.162, 6]) assert.equal(Fm.suspectJump(r), true, "Verdacht " + r);
  for (const r of [1.05, 1.3, 1.566, 0.7, 0.45, 2.5, 0.3]) assert.equal(Fm.suspectJump(r), false, "echt moeglich " + r);
});

/* ---------- 1.2.1: Befunde der Formationsvalidierung (docs/technical/FORMATION_VALIDATION.md) ---------- */
function rowsSeries(hlc, start, volume = 1e6) {
  const days = tradingDays(start, hlc.length);
  const rows = hlc.map(([h, l, c], i) => ({ date: days[i], open: (h + l) / 2, high: h, low: l, close: c, volume }));
  return Canonical.fromRows(rows, { instrumentId: "SYN", exchange: "SYN", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "fixture", sourceRevision: "1.2.1" });
}

test("B-F1: Wimpel, der vor seiner Erkennung invalidiert wurde, erscheint nicht (Geometrie AMZN 29.07.–14.08.2026)", () => {
  /* Mast, kurze Konsolidierung, Bruch unter das Konsolidierungstief (Bar 10). Der Mast-Pivot ist erst an Bar 12
     bestaetigt; bis 1.2.0 erschien ein INVALIDATED-Wimpel mit invalidatedAt vor detectedAt. */
  const tail = [[232.82, 226.16, 226.65], [239.82, 231.06, 235.5], [273.23, 262.01, 271.58], [287.2, 278, 284.02], [281.07, 275.82, 277.42],
    [282.79, 270.73, 272.65], [275.48, 271.06, 272.26], [278.31, 272.75, 274.48], [280.14, 273.6, 278.09], [278.84, 271.36, 272.27],
    [273.46, 267.1, 267.28], [269.58, 264.7, 265.13], [265.81, 262.42, 262.65]];
  const lead = Array.from({ length: 60 }, (_, i) => { const c = 226 + 3 * Math.sin(i * 0.9); return [c + 2, c - 2, c]; });
  const s = rowsSeries(lead.concat(tail), "2026-04-01"), prep = Ctx.prepare(s);
  for (let t = 60; t < s.length; t++) {
    for (const f of Fm.analyzeAt(prep, t).formations) {
      if (f.invalidatedAt) assert.ok(f.invalidatedAt >= f.detectedAt, f.id + " invalidiert vor Erkennung, t=" + t);
      if (f.confirmedAt) assert.ok(f.confirmedAt >= f.detectedAt, f.id + " bestaetigt vor Erkennung, t=" + t);
    }
    assert.equal(Fm.analyzeAt(prep, t).formations.some((f) => /PENNANT/.test(f.type)), false, "kein Wimpel, t=" + t);
  }
});

test("B-F2: ruhender Titel ohne Volumen (O = H = L = C, ATR 0) hat keine Kursluecke", () => {
  /* Wie ADEX: ohne Volumen entfaellt die Volumenpruefung, eine Luecke der Groesse 0 erfuellte bis 1.2.0 die Regel ≥ 0,5 ATR. */
  const flat = Array.from({ length: 80 }, () => [5.38, 5.38, 5.38]);
  const s = rowsSeries(flat, "2026-06-01", null);
  const types = Fm.analyzeAt(Ctx.prepare(s), s.length - 1).formations.map((f) => f.type);
  assert.equal(types.includes("GAP_UP"), false);
  assert.equal(types.includes("GAP_DOWN"), false);
});

test("B-F3: jede Formation ist an ihrem Erkennungstag sichtbar (echte Titel, an denen 1.2.1 rueckdatierte)", () => {
  /* Erkennungstag = erster Tag, an dem die Formation mit dem damaligen Wissen sichtbar war. Bis 1.2.1 datierten
     Wimpel auf den fruehestmoeglichen Bar zurueck und Trendlinien/Wimpel massen ATR-Schwellen am Stand t. */
  const fx = JSON.parse(readFileSync(new URL("./fixtures/technical-formations-visibility.json", import.meta.url), "utf8"));
  let checked = 0;
  for (const [tk, t] of Object.entries(fx.titles)) {
    const rows = t.date.map((d, i) => ({ date: d, open: t.open[i], high: t.high[i], low: t.low[i], close: t.close[i], volume: t.volume[i] }));
    const prep = Ctx.prepare(Canonical.fromRows(rows, { instrumentId: tk, exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "fixture", sourceRevision: "visibility" }));
    for (let T = rows.length - 60; T < rows.length; T += 3) {
      for (const f of Fm.analyzeAt(prep, T).formations) {
        if (f.detectedIndex < 0 || !/PENNANT|TRENDLINE/.test(f.type)) continue;
        assert.ok(Fm.analyzeAt(prep, f.detectedIndex).formations.some((x) => x.id === f.id), tk + " " + f.id + " nicht sichtbar am Erkennungstag (Stand " + rows[T].date + ")");
        checked++;
      }
    }
  }
  assert.ok(checked >= 20, "geprueft: " + checked);
});

test("B-F3: Erkennung erst am Ausbruchstag ist als solche gekennzeichnet und zaehlt in der Evidenz ab diesem Tag", async () => {
  /* Wer erst am Ausbruchstag sichtbar wird, traegt confirmedAtDetection (Screener-Kennzeichen "B") und darf nicht als
     vorher verfuegbares Einstiegssignal gelten: formation-evidence misst ab dem ersten sichtbaren Stand k (Schluss k). */
  const fx = JSON.parse(readFileSync(new URL("./fixtures/technical-formations-visibility.json", import.meta.url), "utf8"));
  const Ev = await import("../../scripts/technical/world/formation-evidence.mjs");
  let atBreakout = 0;
  for (const [tk, t] of Object.entries(fx.titles)) {
    const rows = t.date.map((d, i) => ({ date: d, open: t.open[i], high: t.high[i], low: t.low[i], close: t.close[i], volume: t.volume[i] }));
    const s = Canonical.fromRows(rows, { instrumentId: tk, exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "fixture", sourceRevision: "visibility" });
    const prep = Ctx.prepare(s);
    for (const f of Fm.analyzeAt(prep, rows.length - 1).formations) {
      if (f.confirmedAt) assert.equal(f.confirmedAtDetection, f.confirmedAt <= f.detectedAt, f.id);
      if (f.confirmedAtDetection) atBreakout++;
    }
    for (const d of Ev.detectionsOf(s, 1)) {
      /* Evidenz: Messbeginn k ist nie vor dem Erkennungstag der Formation. */
      const f = Fm.analyzeAt(prep, d.k).formations.find((x) => x.type === d.type && x.state === d.stateAtK);
      assert.ok(f && f.detectedIndex <= d.k, tk + " " + d.type + " k=" + d.k);
    }
  }
  assert.ok(atBreakout > 0, "mindestens eine Formation mit Erkennung am Ausbruchstag im Fixture");
});

test("1.2.3: Punktpreise bei Kursen unter einem Cent werden nicht zu 0 gerundet, Werte ab 1 unveraendert", () => {
  /* Dieselbe Reihe einmal um 100 $ und einmal auf ein Millionstel skaliert: gleiche Formationen und Zustaende,
     jeder Punktpreis positiv und auf 4 signifikante Stellen proportional (CPTAF, FORMATION_VALIDATION.md §4). */
  const big = synthetic("trend", CASES.trend), k = 1e-6;
  const tiny = Canonical.fromRows(big.timestamps.map((d, i) => ({ date: d, open: big.open[i] * k, high: big.high[i] * k, low: big.low[i] * k, close: big.close[i] * k, volume: 1e6 })),
    { instrumentId: "SUBPENNY", exchange: "SYN", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "fixture", sourceRevision: "1.2.3" });
  const A = Fm.analyze(big).formations, B = Fm.analyze(tiny).formations;
  assert.deepEqual(B.map((f) => f.id + ":" + f.state), A.map((f) => f.id + ":" + f.state));
  let pts = 0;
  B.forEach((f, j) => (f.points || []).forEach((p, i) => {
    assert.ok(p.price > 0, f.id + " Punkt " + i + " = " + p.price);
    const ref = A[j].points[i].price * k;
    assert.ok(Math.abs(p.price / ref - 1) < 1e-3, f.id + " " + p.price + " vs " + ref);
    pts++;
  }));
  assert.ok(pts > 0);
  for (const f of A) for (const p of f.points || []) assert.equal(p.price, Math.round(p.price * 1e4) / 1e4, "ab 1: 4 Nachkommastellen");
});
