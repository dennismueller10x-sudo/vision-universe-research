/* ELLIOTT V2 — Regelbibliothek, Unterteilung, Grade, Kausalitaet.
   Jede harte Regel hat einen positiven UND einen negativen Fall; jede
   bullische Aussage wird bearish gespiegelt geprueft. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixtures } from "./technical-fixtures.mjs";

const require = createRequire(import.meta.url);
const P = require("../engines/technical/elliott/patterns.js");
const E = require("../engines/technical/elliott/elliott-v2.js");
const Features = require("../engines/technical/feature-store.js");
const Pivots = require("../engines/technical/pivot-engine.js");
const Canonical = require("../engines/technical/canonical-bars.js");

/** Legs aus Punkten [[index, preis], …]; letztes Leg optional DEVELOPING. */
const legs = (pts, lastDeveloping = false) => pts.slice(1).map((p, k) => ({
  fromPrice: pts[k][1], toPrice: p[1], fromIndex: pts[k][0], toIndex: p[0], duration: p[0] - pts[k][0],
  status: lastDeveloping && k === pts.length - 2 ? "DEVELOPING" : "CONFIRMED"
}));
/** Spiegelung: Preis → 400 − Preis (bullish ↔ bearish). */
const mirror = (pts) => pts.map(([i, v]) => [i, 400 - v]);
const rule = (ev, id) => ev.rules.find((r) => r.ruleId === id);
const IMP = [[0, 100], [10, 120], [15, 110], [30, 150], [38, 135], [48, 160]];

// ------------------------------------------------------------ Impuls
test("EV2-R1 · Impuls: gueltig bullish und bearish gespiegelt", () => {
  for (const pts of [IMP, mirror(IMP)]) {
    const e = P.evaluate("IMPULSE", legs(pts));
    assert.equal(e.valid, true, JSON.stringify(e.violations));
    assert.ok(e.rules.every((r) => r.passed === true));
  }
  assert.equal(P.evaluate("IMPULSE", legs(IMP)).sign, 1);
  assert.equal(P.evaluate("IMPULSE", legs(mirror(IMP))).sign, -1);
});

test("EV2-R2 · Impuls: jede harte Regel einzeln verletzt → ungueltig (beide Richtungen)", () => {
  const cases = {
    W2_NOT_BEYOND_W1_ORIGIN: [[0, 100], [10, 120], [15, 99], [30, 150], [38, 135], [48, 160]],
    W3_BEYOND_W1_END: [[0, 100], [10, 120], [15, 110], [30, 118], [38, 115], [48, 160]],
    W4_NO_OVERLAP_W1: [[0, 100], [10, 120], [15, 110], [30, 150], [38, 119], [48, 160]],
    W3_NOT_SHORTEST: [[0, 100], [10, 130], [15, 115], [30, 135], [38, 131], [48, 170]]
  };
  for (const [id, pts] of Object.entries(cases)) {
    for (const p of [pts, mirror(pts)]) {
      const e = P.evaluate("IMPULSE", legs(p));
      assert.equal(e.valid, false, id);
      assert.equal(rule(e, id).passed, false, id);
      assert.equal(rule(e, id).class, "HARD");
    }
  }
});

test("EV2-R3 · laufende Wellen: 'ueberschreitet'-Regeln offen, 'nicht-ueber'-Regeln sofort entscheidbar", () => {
  // W3 laeuft und hat W1-Ende noch nicht erreicht → offen, nicht verletzt
  const dev3 = P.evaluate("IMPULSE", legs([[0, 100], [10, 120], [15, 110], [20, 118]], true));
  assert.equal(rule(dev3, "W3_BEYOND_W1_END").passed, null);
  assert.equal(dev3.valid, true);
  // W2 laeuft und hat den W1-Ursprung bereits unterschritten → sofort verletzt
  const dev2 = P.evaluate("IMPULSE", legs([[0, 100], [10, 120], [15, 98]], true));
  assert.equal(rule(dev2, "W2_NOT_BEYOND_W1_ORIGIN").passed, false);
  // W5 laeuft, W3 < W1, W5 bereits laenger als W3 → W3 waere kuerzeste: verletzt
  const dev5 = P.evaluate("IMPULSE", legs([[0, 100], [10, 130], [15, 118], [30, 140], [38, 133], [45, 157]], true));
  assert.equal(rule(dev5, "W3_NOT_SHORTEST").passed, false);
  // … solange W5 kuerzer bleibt: offen, und die Projektion traegt die Obergrenze (CAP)
  const dev5ok = P.evaluate("IMPULSE", legs([[0, 100], [10, 130], [15, 118], [30, 140], [38, 133], [45, 145]], true));
  assert.equal(rule(dev5ok, "W3_NOT_SHORTEST").passed, null);
  const cap = P.projections("IMPULSE", dev5ok.legs, 5, false).find((x) => x.kind === "CAP");
  assert.ok(cap && Math.abs(cap.price - (133 + 22)) < 1e-9, "CAP = W4-Ende + Laenge W3");
});

test("EV2-R4 · Guidelines ranken, legitimieren aber nie eine Regelverletzung", () => {
  // perfekte Fibonacci-Proportionen, aber W4 ueberlappt W1
  const pts = [[0, 100], [10, 120], [15, 107.64], [30, 140], [38, 119.5], [48, 140.5]];
  const e = P.evaluate("IMPULSE", legs(pts));
  assert.equal(e.valid, false);
  assert.ok(e.guidelines.W2_RETRACEMENT === 1);
  // Guidelines sind Zahlen 0..1, Regeln nur HARD/DEFINITION — keine Klasse vermischt
  for (const t of P.TYPES) {
    const ev = P.evaluate(t, legs(IMP).slice(0, P.PATTERNS[t].waves));
    if (!ev) continue;
    ev.rules.forEach((r) => assert.ok(["HARD", "DEFINITION", "VU_OPERATIONAL"].includes(r.class), t + " " + r.ruleId));
    Object.values(ev.guidelines).forEach((v) => assert.ok(v === null || (v >= 0 && v <= 1)));
  }
});

// --------------------------------------------------------- Diagonalen
test("EV2-R5 · Diagonale: W4-Ueberlappung ist Definition; Keilform wird erzwungen", () => {
  const ending = [[0, 100], [10, 130], [15, 115], [25, 140], [30, 128], [36, 145]];   // kontrahierend: 30 > 25 > 17, W4 13 < W2 15
  for (const p of [ending, mirror(ending)]) {
    const e = P.evaluate("ENDING_DIAGONAL", legs(p));
    assert.equal(e.valid, true, JSON.stringify(e.violations));
    assert.equal(e.variant, "CONTRACTING");
    assert.equal(P.evaluate("IMPULSE", legs(p)).valid, false, "derselbe Verlauf ist kein Impuls (Overlap)");
  }
  // ohne Overlap keine Diagonale
  assert.equal(rule(P.evaluate("ENDING_DIAGONAL", legs(IMP)), "DIAGONAL_W4_OVERLAPS_W1").passed, false);
  // kontrahierend, aber W5 laenger als W3 → verletzt
  const bad = [[0, 100], [10, 130], [15, 115], [25, 140], [30, 128], [36, 160]];
  assert.equal(P.evaluate("ENDING_DIAGONAL", legs(bad)).valid, false);
  // expandierend gueltig
  const exp = [[0, 100], [10, 110], [15, 104], [25, 122], [30, 108], [36, 135]];
  const ee = P.evaluate("LEADING_DIAGONAL", legs(exp));
  assert.equal(ee.valid, true, JSON.stringify(ee.violations));
  assert.equal(ee.variant, "EXPANDING");
});

// ------------------------------------------------------- Korrekturen
test("EV2-R6 · Zigzag vs. Flat: Klassengrenze B 90 % von A, B nie jenseits A-Ursprung", () => {
  const zz = [[0, 100], [10, 80], [15, 92], [30, 70]];
  for (const p of [zz, mirror(zz)]) {
    assert.equal(P.evaluate("ZIGZAG", legs(p)).valid, true);
    assert.equal(P.evaluate("FLAT", legs(p)).valid, false, "B 60 % → kein Flat");
  }
  const flat = [[0, 100], [10, 80], [15, 99], [30, 78]];
  for (const p of [flat, mirror(flat)]) {
    assert.equal(P.evaluate("FLAT", legs(p)).valid, true);
    assert.equal(P.evaluate("ZIGZAG", legs(p)).valid, false, "B 95 % → kein Zigzag");
    assert.equal(P.evaluate("FLAT", legs(p)).variant, "REGULAR");
  }
  assert.equal(P.evaluate("ZIGZAG", legs([[0, 100], [10, 80], [15, 101], [30, 70]])).valid, false);
  assert.equal(P.flatVariant(legs([[0, 100], [10, 80], [15, 105], [30, 72]])), "EXPANDED");
  assert.equal(P.flatVariant(legs([[0, 100], [10, 80], [15, 105], [30, 85]])), "RUNNING");
  // C jenseits A-Ende ist Guideline ("almost always"), keine Regel
  const trunc = P.evaluate("ZIGZAG", legs([[0, 100], [10, 80], [15, 92], [30, 82]]));
  assert.equal(trunc.valid, true);
  assert.ok(trunc.guidelines.C_BEYOND_A_END < 0.5);
});

test("EV2-R7 · Dreieck: kontrahierend/expandierend gueltig, Grenzverletzung ungueltig", () => {
  const tri = [[0, 100], [10, 80], [18, 95], [26, 84], [33, 92], [40, 87]];
  for (const p of [tri, mirror(tri)]) {
    const e = P.evaluate("TRIANGLE", legs(p));
    assert.equal(e.valid, true, JSON.stringify(e.violations));
    assert.equal(e.variant, "CONTRACTING");
  }
  const broken = [[0, 100], [10, 80], [18, 95], [26, 78], [33, 92], [40, 87]];   // C unter A-Ende, D unter B → weder noch
  assert.equal(P.evaluate("TRIANGLE", legs(broken)).valid, false);
  const expd = [[0, 100], [10, 95], [18, 102], [26, 90], [33, 106], [40, 85]];
  assert.equal(P.evaluate("TRIANGLE", legs(expd)).variant, "EXPANDING");
  assert.equal(P.evaluate("TRIANGLE", legs(expd)).valid, true);
});

test("EV2-R8 · W-X-Y verlangt aufgeloeste Dreier-Unterteilung; Double Zigzag verlangt Fortschritt", () => {
  const pts = [[0, 100], [10, 85], [15, 92], [30, 78]];
  const plain = legs(pts);
  assert.equal(P.evaluate("WXY", plain).valid, false, "ohne Unterteilung nicht unterscheidbar");
  const withSub = plain.map((l) => Object.assign({}, l, { sub: { count: 3, cls: "K" } }));
  assert.equal(P.evaluate("WXY", withSub).valid, true);
  const dz = [[0, 100], [5, 90], [8, 95], [12, 85], [16, 90], [20, 82], [24, 87], [28, 78]];
  assert.equal(P.evaluate("DOUBLE_ZIGZAG", legs(dz)).valid, true);
  const dzBad = [[0, 100], [5, 90], [8, 95], [12, 85], [16, 93], [20, 88], [24, 91], [28, 87]];
  assert.equal(P.evaluate("DOUBLE_ZIGZAG", legs(dzBad)).valid, false, "Y erreicht W-Ende nicht");
});

// ---------------------------------------------------------- Invalidation
test("EV2-R9 · Invalidation folgt der harten Regel der laufenden Welle (bullish + bearish)", () => {
  const w = legs([[0, 100], [10, 120], [15, 110], [30, 150], [38, 135]], true);
  assert.deepEqual([P.invalidation("IMPULSE", w.slice(0, 2), 2).hard.price, P.invalidation("IMPULSE", w.slice(0, 2), 2).hard.direction], [100, "below"]);
  assert.equal(P.invalidation("IMPULSE", w, 4).hard.price, 120);
  assert.equal(P.invalidation("IMPULSE", w.slice(0, 3), 3).revision.price, 110);
  const wb = legs(mirror([[0, 100], [10, 120], [15, 110], [30, 150], [38, 135]]), true);
  const ib = P.invalidation("IMPULSE", wb, 4).hard;
  assert.deepEqual([ib.price, ib.direction], [280, "above"]);
  const zz = legs([[0, 100], [10, 80], [15, 92], [20, 85]], true);
  /* C laeuft: harte Grenze = Ursprung (B darf ihn nie erreichen); B-Ende ist nur Neuzuordnung (Review-Befund 7). */
  assert.deepEqual([P.invalidation("ZIGZAG", zz, 3).hard.price, P.invalidation("ZIGZAG", zz, 3).hard.direction], [100, "above"]);
  assert.deepEqual([P.invalidation("ZIGZAG", zz, 3).revision.price, P.invalidation("ZIGZAG", zz, 3).revision.ruleId], [92, "C_START"]);
  const fl = legs([[0, 100], [10, 80], [15, 98], [20, 85]], true);
  assert.equal(P.invalidation("FLAT", fl, 3).hard.price, 120);   // B hoechstens 200 % von A
});

test("EV2-R10 · Review-Fixes: Welle 1 laeuft, kontrahierende Diagonale, Dreiecke", () => {
  const w1 = legs([[0, 100], [10, 115]], true);
  assert.deepEqual([P.invalidation("IMPULSE", w1, 1).hard.price, P.invalidation("IMPULSE", w1, 1).hard.direction], [100, "below"]);
  /* kontrahierende Diagonale: W1 30, W2 15, W3 20, W4 laeuft → harte Grenze p3 - L2 = 120 (vor dem W3-Ursprung 115). */
  const dg = legs([[0, 100], [10, 130], [15, 115], [25, 135], [28, 128]], true);
  assert.equal(P.invalidation("LEADING_DIAGONAL", dg, 4).hard.price, 120);
  /* laufende W4 bereits laenger als W2 → kontrahierende Lesart sofort verletzt, auch waehrend W4 laeuft */
  const dg2 = legs([[0, 100], [10, 130], [15, 115], [25, 135], [28, 118]], true);
  const r = P.evaluate("LEADING_DIAGONAL", dg2).rules.find((x) => x.ruleId === "DIAGONAL_W4_VS_W2");
  assert.equal(r && r.passed, false);
  /* expandierendes Dreieck: keine harte Grenze, aber Revisionsgrenze; kontrahierend: Barrier-Toleranz fuer D */
  const ex = legs([[0, 100], [10, 95], [15, 102], [20, 92], [24, 99]], true);
  assert.equal(P.invalidation("TRIANGLE", ex, 4).hard, null);
  assert.equal(P.invalidation("TRIANGLE", ex, 4).revision.price, 92);
  const ct = legs([[0, 100], [10, 90], [15, 98], [20, 92], [24, 96]], true);
  assert.equal(P.invalidation("TRIANGLE", ct, 4).hard.price, 98.5);
});

// ===================================================== Engine-Ebene
/** Verschachtelte Pfade: grosse Wellen, deren Motivlegs sichtbar 5-teilig und Korrekturen 3-teilig sind. */
function nestedPath(start, bigLegs) {
  /* Unterwellen-Korrekturen = 5,5 % des Kurses: sichtbar auf scale-2 (4 %),
     unsichtbar auf scale-3 (8 %) — so ist die Unterteilung genau eine Skala tiefer. */
  const pts = [[0, start]];
  let i = 0, v = start;
  for (const { to, n, sub } of bigLegs) {
    const d = to - v, sgn = Math.sign(d);
    let moves;
    if (sub === 5) { const c = 0.065 * v, g = Math.abs(d) + 2 * c; moves = [0.35 * g, -c, 0.45 * g, -c, 0.2 * g]; }
    else if (sub === 3) { const c = 0.065 * v, g = Math.abs(d) + c; moves = [0.55 * g, -c, 0.45 * g]; }
    else moves = [Math.abs(d)];
    const per = Math.round(n / moves.length);
    for (const m of moves) { v += sgn * m; i += per; pts.push([i, +v.toFixed(4)]); }
  }
  return pts;
}
const IMPULSE_PATH = nestedPath(100, [
  { to: 140, n: 50, sub: 5 }, { to: 124, n: 30, sub: 3 }, { to: 210, n: 120, sub: 5 }, { to: 185, n: 36, sub: 3 }, { to: 235, n: 50, sub: 5 },
  { to: 195, n: 40, sub: 3 }, { to: 220, n: 30, sub: 3 }, { to: 180, n: 40, sub: 5 }, { to: 200, n: 20, sub: 1 }
]);
const series = (pts, id, seed) => fixtures.piecewise(pts, { seed: seed || "ev2", rangePct: 0.001, instrumentId: id || "SYN_EV2" });
const run = (s, asOfIndex, cfg) => { const f = Features.computeFeatures(s); const pv = Pivots.runPivots(s, f); return E.analyzeElliottV2({ series: s, features: f, pivots: pv, asOfIndex, methodology: cfg ? { engine: cfg } : undefined }); };

test("EV2-E1 · Unterteilung: sichtbarer 5-teiliger Motivleg wird als regelkonformer Impuls erkannt", () => {
  const s = series(IMPULSE_PATH);
  const f = Features.computeFeatures(s), pv = Pivots.runPivots(s, f);
  const view = E.pivotView(s, pv, "scale-3", s.length - 1);
  const { legs: L } = E.legsOf(s, view);
  const fine = pv.scales["scale-2"].pivots;
  const subs = L.map((l) => E.subdivide(s, fine, l, l.confirmedIndex));
  assert.ok(subs.some((x) => x && x.count === 5 && x.motiveValid), JSON.stringify(subs.map((x) => x && [x.count, x.cls])));
  assert.ok(subs.some((x) => x && x.count === 3 && x.cls === "K"));
  assert.equal(E.subdivisionFit("M", { count: 5, cls: "M", motiveValid: true }), 1);
  assert.ok(E.subdivisionFit("M", { count: 3, cls: "K", correctiveValid: true }) < 0.2, "Motivwelle mit 3 Unterwellen ist Widerspruch");
  assert.equal(E.subdivisionFit("K", { count: 1, cls: "?" }), 0.5, "nicht aufgeloest = neutral");
});

test("EV2-E2 · Synthetischer 5-3-5-3-5-Impuls wird in der historischen Karte als Impuls gezaehlt", () => {
  const r = run(series(IMPULSE_PATH), undefined, { analysisScale: "scale-3" });
  assert.ok(r.historicalMap, r.status);
  const imp = r.historicalMap.patterns.find((p) => p.pattern === "IMPULSE" && p.direction === "UP");
  assert.ok(imp, JSON.stringify(r.historicalMap.patterns.map((p) => p.pattern)));
  assert.deepEqual(imp.waves.map((w) => w.label), ["1", "2", "3", "4", "5"]);
});

test("EV2-E3 · gespiegelte Serie liefert gespiegelte Lesart", () => {
  const up = run(series(IMPULSE_PATH), undefined, { analysisScale: "scale-3" });
  /* Log-Spiegelung (10000 / Preis) erhaelt prozentuale Swings — die Pivot-Schwellen sind prozentual. */
  const down = run(series(IMPULSE_PATH.map(([i, v]) => [i, 10000 / v]), "SYN_EV2_M"), undefined, { analysisScale: "scale-3" });
  const iu = up.historicalMap.patterns.find((p) => p.pattern === "IMPULSE");
  const idn = down.historicalMap.patterns.find((p) => p.pattern === "IMPULSE");
  assert.ok(iu && idn);
  assert.equal(iu.direction, "UP"); assert.equal(idn.direction, "DOWN");
});

test("EV2-C1 · Kausalitaet: asOf-Analyse auf voller Serie == Analyse der abgeschnittenen Serie", () => {
  const s = series(IMPULSE_PATH);
  for (const t of [180, 260, 330, s.length - 1]) {
    const a = run(s, t);
    const b = run(Canonical.slice(s, t));
    const strip = (x) => JSON.stringify({ st: x.status, p: x.primary, a: x.alternatives, h: x.historicalMap, hd: x.higherDegree });
    assert.equal(strip(a), strip(b), "Abweichung bei t=" + t);
  }
});

test("EV2-C2 · Vergiftete Zukunft: Bars nach asOf aendern das Ergebnis nicht", () => {
  const s = series(IMPULSE_PATH);
  const t = 300;
  const poisoned = Canonical.revise(s, Array.from({ length: s.length - t - 1 }, (_, k) => ({ index: t + 1 + k, high: 999, low: 1, close: 500, open: 500 })), "poison");
  const strip = (x) => JSON.stringify({ p: x.primary, a: x.alternatives, h: x.historicalMap });
  assert.equal(strip(run(s, t)), strip(run(poisoned, t)));
});

test("EV2-C3 · Historische Karte repainted nicht: bestaetigte Muster bleiben Praefix", () => {
  const s = series(IMPULSE_PATH);
  let prev = null;
  for (let t = 150; t < s.length; t += 7) {
    const r = run(s, t, { analysisScale: "scale-3" });
    const cur = r.historicalMap ? r.historicalMap.patterns.map((p) => p.pattern + ":" + p.waves.map((w) => w.toIndex).join(",")) : [];
    if (prev) assert.deepEqual(cur.slice(0, prev.length), prev, "Umschreibung bei t=" + t);
    prev = cur;
  }
});

test("EV2-O1 · Ausgabe: keine Wahrscheinlichkeit, Invalidation zu jeder unvollstaendigen Lesart, Zonen sortiert", () => {
  const r = run(series(IMPULSE_PATH));
  assert.equal(r.isProbability, false);
  assert.equal(r.confidenceType, "structural_fit");
  for (const c of [r.primary].concat(r.alternatives)) {
    if (!c.complete && c.currentWave.wave > 1) assert.ok(c.invalidation, c.pattern + " " + c.currentWave.label);
    c.projection.zones.forEach((z) => assert.ok(z.zoneLow < z.zoneHigh && z.relations.length >= 1));
  }
  assert.ok(["HIGH", "MODERATE", "LOW"].includes(r.clarityLevel));
});

test("EV2-O2 · zu wenig Struktur → ehrlich UNAVAILABLE statt erfundener Welle", () => {
  const flat = fixtures.piecewise([[0, 100], [200, 101]], { seed: "flat", rangePct: 0.001 });
  const r = run(flat);
  assert.equal(r.status, "UNAVAILABLE");
  assert.equal(r.primary, null);
});

// ===================================================== Master Mission II: V2.1/V2.2
import { syntheticSeries } from "./elliott-synthetic.mjs";
const runSyn = (name, noise, cfg, seed) => { const { series: s, expect } = syntheticSeries(name, { noise, seed }); const f = Features.computeFeatures(s); const pv = Pivots.runPivots(s, f); return { r: E.analyzeElliottV2({ series: s, features: f, pivots: pv, methodology: cfg ? { engine: cfg } : undefined }), expect, s, f, pv }; };
const found = (r, expect) => [r.primary, ...(r.alternatives || [])].filter(Boolean).findIndex((c) => expect.includes(c.pattern) && c.complete);

test("EV2-S1 · Synthetik: klare Impulse (normal, W3-, W5-Extension) und Diagonalen werden bei geringem Rauschen erkannt", () => {
  for (const name of ["IMPULSE", "IMPULSE_EXT3", "IMPULSE_EXT5"]) {
    const { r, expect } = runSyn(name, "low");
    assert.equal(found(r, expect), 0, name + ": " + (r.primary && r.primary.pattern));
  }
  for (const name of ["LEADING_DIAGONAL", "ENDING_DIAGONAL"]) { const { r, expect } = runSyn(name, "low"); assert.ok(found(r, expect) >= 0, name); }
});

test("EV2-S2 · Synthetik: Enthaltung steigt mit dem Rauschen (hoch deutlich haeufiger als niedrig)", () => {
  const rate = (noise) => { let k = 0, n = 0; for (const name of ["IMPULSE", "ZIGZAG", "FLAT_REGULAR", "TRIANGLE", "IMPULSE_EXT3", "DOUBLE_ZIGZAG"]) for (const seed of [0, 1, 2]) { const { r } = runSyn(name, noise, null, seed); n++; if (r.applicability && r.applicability.abstain) k++; } return k / n; };
  const lo = rate("low"), hi = rate("high");
  assert.ok(hi >= lo + 0.25, "low " + lo + " high " + hi);
  const { r } = runSyn("IMPULSE", "low");
  assert.equal(r.applicability.abstain, false);
});

test("EV2-S3 · Count Quality, Anwendbarkeit, Erkennungsverzug: Struktur und Wertebereich; keine Wahrscheinlichkeit", () => {
  const { r } = runSyn("IMPULSE", "low");
  const q = r.primary.countQuality;
  assert.ok(q.score >= 0 && q.score <= 1 && ["HIGH", "MODERATE", "LOW"].includes(q.level));
  assert.ok(/keine Trefferwahrscheinlichkeit/.test(q.note));
  const d = r.primary.detection;
  assert.ok(d.engineConfirmIndex >= d.waveEndIndex && (d.earliestConfirmIndex === null || d.earliestConfirmIndex <= d.engineConfirmIndex));
  assert.ok(d.barsToEngine >= d.barsToEarliest);
  assert.ok(r.candidateTree.length >= 1 && r.candidateTree[0].branch === "PRIMARY");
  assert.equal(r.isProbability, false);
});

test("EV2-S4 · Eltern-Kind-Konsistenz: Lesart muss zur Welle des hoeheren Grades passen, die sie enthaelt", () => {
  const higher = { waveSpecs: [{ fromIndex: 0, toIndex: 100, dir: 1, expected: "M" }, { fromIndex: 100, toIndex: 140, dir: -1, expected: "K" }] };
  const mk = (family, sign, a, b) => ({ family, sign, waves: [{ fromIndex: a, toIndex: a + 5 }, { fromIndex: b - 5, toIndex: b }] });
  assert.equal(E.nestedFit(mk("MOTIVE", 1, 10, 90), higher), 1);                 // Impuls aufwaerts in M-Welle aufwaerts
  assert.ok(E.nestedFit(mk("MOTIVE", -1, 10, 90), higher) < 0.2);                 // Gegenrichtung
  assert.equal(E.nestedFit(mk("CORRECTIVE", -1, 105, 135), higher), 1);          // Korrektur abwaerts in K-Welle abwaerts
  assert.ok(E.nestedFit(mk("MOTIVE", 1, 60, 140), higher) < 0.7);                 // reicht ueber zwei Wellen
  assert.equal(E.nestedFit(mk("MOTIVE", 1, 10, 90), null), null);
});

test("EV2-S5 · Persistenz: gleiche Vorlesart bleibt erhalten; ohne Vorzustand identisch zur zustandslosen Analyse (kausal)", () => {
  const { s, f, pv } = runSyn("IMPULSE", "medium");
  const t = s.length - 5;
  const a = E.analyzeElliottV2({ series: s, features: f, pivots: pv, asOfIndex: t });
  const b = E.analyzeElliottV2({ series: s, features: f, pivots: pv, asOfIndex: t, previous: null });
  assert.equal(JSON.stringify(a.primary), JSON.stringify(b.primary));
  const c = E.analyzeElliottV2({ series: s, features: f, pivots: pv, asOfIndex: t + 1, previous: { key: a.primary.persistenceKey, scaleId: a.degrees.analysis } });
  const d = E.analyzeElliottV2({ series: s, features: f, pivots: pv, asOfIndex: t + 1 });
  /* Mit Vorzustand ist die Hauptlesart entweder dieselbe Identitaet oder die neue Lesart ist um mehr als die Hysterese besser */
  assert.ok(c.primary.persistenceKey === a.primary.persistenceKey || d.primary.rank - (c.alternatives.concat([c.primary]).find((x) => x.persistenceKey === a.primary.persistenceKey) || { rank: -1 }).rank > E.DEFAULTS.stickiness - 1e-9 || c.primary.persistenceKey === d.primary.persistenceKey);
});

test("EV2-S6 · V2.2 bleibt kausal: Mehrskalen-Gradwahl liest keine Bars nach asOf", () => {
  const { s, f, pv } = runSyn("IMPULSE_EXT3", "medium");
  const t = s.length - 30;
  const full = E.analyzeElliottV2({ series: s, features: f, pivots: pv, asOfIndex: t });
  const cut = Canonical.slice(s, t), fc = Features.computeFeatures(cut), pc = Pivots.runPivots(cut, fc);
  const part = E.analyzeElliottV2({ series: cut, features: fc, pivots: pc });
  const strip = (x) => JSON.stringify(Object.assign({}, x, { parametersHash: null }));
  assert.equal(strip(full), strip(part));
});

// ===================================================== Addendum: Regelmatrix
test("EV2-Q1 · Regelmatrix vollstaendig: jede Regel/Richtlinie der Engine hat Klasse, Quelle und Einfluss; Klassen stimmen ueberein", () => {
  const S = require("../engines/technical/elliott/sources.js");
  const map = { HARD: "HARD_RULE", DEFINITION: "DEFINITION", VU_OPERATIONAL: "VU_OPERATIONAL" };
  const seenR = new Set(), seenG = new Set();
  const cases = [IMP, mirror(IMP), [[0, 100], [10, 130], [15, 112], [30, 137.5], [38, 120], [48, 136]], [[0, 100], [10, 80], [15, 92], [20, 70]], [[0, 100], [10, 80], [15, 99], [20, 78]],
                 [[0, 100], [10, 90], [15, 98], [20, 92], [24, 96], [28, 93]], [[0, 100], [10, 90], [15, 98], [20, 85], [24, 95], [28, 84], [32, 91], [36, 80]]];
  for (const pts of cases) for (const t of P.TYPES) for (let k = 1; k <= P.PATTERNS[t].waves && k < pts.length; k++) {
    const ev = P.evaluate(t, legs(pts.slice(0, k + 1)));
    if (!ev) continue;
    ev.rules.forEach((r) => { const m = S.ruleMeta(r.ruleId); assert.ok(m, "Regel ohne Matrix-Eintrag: " + r.ruleId); assert.equal(m.class, map[r.class], r.ruleId); assert.ok(S.SOURCES[m.source] && m.locator); seenR.add(S.RULES[r.ruleId] ? r.ruleId : S.baseId(r.ruleId)); });
    Object.keys(ev.guidelines).forEach((g) => { const m = S.guidelineMeta(g); assert.ok(m, "Richtlinie ohne Matrix-Eintrag: " + g); assert.equal(m.class, "GUIDELINE"); seenG.add(S.GUIDELINES[g] ? g : S.baseId(g)); });
  }
  assert.ok(seenR.size >= 12 && seenG.size >= 10, seenR.size + "/" + seenG.size);
  /* Keine VU-Festlegung als klassische Quelle getarnt */
  Object.values(S.RULES).concat(Object.values(S.GUIDELINES), Object.values(S.CRITERIA)).forEach((m) => { if (/^VU_/.test(m.class)) assert.equal(m.source, "VU"); else assert.notEqual(m.source, "VU"); });
});

test("EV2-Q2 · Keine Kompensation: Regelverletzung → INVALID ohne Score, egal wie gut die Richtlinien passen", () => {
  const pts = [[0, 100], [10, 120], [15, 107.64], [30, 140], [38, 119.5], [48, 140.5]];   // perfekte Proportionen, W4 ueberlappt W1
  const e = P.evaluate("IMPULSE", legs(pts));
  e.waves = legs(pts); e.components = { higherDegree: 1 };
  const q = E.countQuality(e, null, 0.5, null, E.DEFAULTS);
  assert.equal(q.level, "INVALID"); assert.equal(q.score, null);
  const a = E.ruleAudit(e, null);
  assert.equal(a.validity, "INVALID"); assert.ok(a.hardRules.violated >= 1);
  assert.ok(a.guidelines.items.some((x) => x.id === "W2_RETRACEMENT" && x.value === 1), "gute Richtlinie bleibt sichtbar, aendert aber nichts");
});

test("EV2-Q3 · Regel-Audit je Zaehlung: zerlegbar, mit Quelle je Regel und Richtlinie", () => {
  const { r } = runSyn("IMPULSE", "low");
  const a = r.primary.ruleAudit;
  assert.equal(a.validity, "VALID");
  assert.equal(a.hardRules.violated + a.definitions.violated, 0);
  assert.ok(a.hardRules.total >= 4);
  a.rules.forEach((x) => assert.ok(x.source && x.locator && x.class, x.id));
  a.guidelines.items.forEach((x) => assert.ok(x.source && x.class === "GUIDELINE" && typeof x.matched === "boolean", x.id));
  for (const k of ["subdivision", "degreeConsistency", "timeProportion", "priceProportion", "fibonacci", "alternation", "channel", "extension", "overlap", "momentum", "volume"]) assert.ok(k in a.dimensions, k);
  assert.ok(/nicht gegen den Volltext/.test(a.verification));
});
