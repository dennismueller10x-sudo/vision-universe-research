/* ELLIOTT 3.0 — Eigenschaften (Remediation §50, §69–§76):
   Kausalitaet, Skalen- und Verschiebungsinvarianz, Regel-Integritaet jeder ausgegebenen Zaehlung, Fuzzing der harten Regeln,
   Negativfaelle, Datenluecken, unbereinigte Splits, Ausgabevertrag. Korpusfaelle aus dem DEVELOPMENT-Split. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { corpusCase, CLASSES, rng } from "./elliott-corpus.mjs";

const require = createRequire(import.meta.url);
const P = require("../engines/technical/elliott/patterns.js");
const E3 = require("../engines/technical/elliott/elliott-v3.js");
const Ctx = require("../engines/technical/ti/context.js");
const Canonical = require("../engines/technical/canonical-bars.js");

function series(closes, dates) {
  const rows = closes.map((c, i) => ({ date: dates[i], open: c, high: c, low: c, close: c, volume: null }));
  return Canonical.fromRows(rows, { instrumentId: "SYN", exchange: "US", currency: "USD", timeframe: "1W", priceSeriesType: "SPLIT_ADJUSTED", source: "test" });
}
function run(closes, dates, asOfIndex) {
  const s = series(closes, dates), Pp = Ctx.prepare(s);
  return E3.analyzeElliottV3({ series: s, features: Pp.features, pivots: Pp.pivots, barsPerYear: 52, asOfIndex });
}
const sig = (r) => (r.primary ? [r.primary.pattern, r.primary.complete, r.primary.currentWave.label, r.primary.waves.map((w) => w.fromIndex + ">" + w.toIndex).join(",")].join("|") : r.reason);
const SAMPLE = ["IMPULSE", "ZIGZAG", "FLAT_EXPANDED", "TRIANGLE_CONTRACTING", "LEADING_DIAGONAL", "IMPULSE_TRUNCATED"];

test("EV3-C1 · Kausalitaet: Ergebnis an t == Ergebnis der bei t abgeschnittenen Reihe", () => {
  for (const cls of SAMPLE.slice(0, 4)) {
    const cs = corpusCase(cls, 1, "low"), t = cs.closes.length - 25;
    const a = run(cs.closes, cs.dates, t), b = run(cs.closes.slice(0, t + 1), cs.dates.slice(0, t + 1));
    assert.equal(sig(a), sig(b), cls);
  }
});

test("EV3-I1 · Skaleninvarianz: Preis × 2 ergibt dieselbe Zaehlung", () => {
  for (const cls of SAMPLE) for (const nz of ["none", "low"]) {
    const cs = corpusCase(cls, 2, nz);
    assert.equal(sig(run(cs.closes.map((c) => c * 2), cs.dates)), sig(run(cs.closes, cs.dates)), cls + " " + nz);
  }
});

test("EV3-I2 · Verschiebungsinvarianz: Preis + 100 ergibt dieselbe Zaehlung", () => {
  for (const cls of SAMPLE) for (const nz of ["none", "low"]) {
    const cs = corpusCase(cls, 3, nz);
    assert.equal(sig(run(cs.closes.map((c) => c + 100), cs.dates)), sig(run(cs.closes, cs.dates)), cls + " " + nz);
  }
});

test("EV3-R1 · Regel-Integritaet: keine ausgegebene Zaehlung verletzt eine HARD-Regel oder Definition", () => {
  let counts = 0;
  for (const cls of Object.keys(CLASSES)) for (const nz of ["none", "medium", "high"]) {
    const cs = corpusCase(cls, 4, nz);
    const r = run(cs.closes, cs.dates);
    for (const c of [r.primary, ...(r.alternatives || [])].filter(Boolean)) {
      counts++;
      const bad = c.rules.filter((x) => x.passed === false);
      assert.equal(bad.length, 0, cls + " " + nz + " " + c.pattern + " " + bad.map((x) => x.ruleId).join(","));
      if (c.pattern === "IMPULSE" && c.complete) {
        const L = c.waves.map((w) => Math.abs(w.toPrice - w.fromPrice));
        assert.ok(L[2] >= Math.min(L[0], L[4]), "W3 nie die kuerzeste");
      }
    }
  }
  assert.ok(counts > 40);
});

test("EV3-F1 · Fuzzing der harten Impulsregeln: legale Folgen gueltig, jede einzelne Verletzung ungueltig", () => {
  const R = rng("ev3-fuzz");
  const legs = (pts) => pts.slice(1).map((p, k) => ({ fromIndex: k * 10, toIndex: (k + 1) * 10, fromPrice: pts[k], toPrice: p, duration: 10, status: "CONFIRMED" }));
  let legal = 0, illegal = 0;
  for (let it = 0; it < 600; it++) {
    const w1 = R.u(5, 30), w2 = w1 * R.u(0.1, 0.95), w3 = Math.max(w1, 1) * R.u(0.6, 3), w4max = w3 - w2;
    const w4 = w4max * R.u(0.05, 0.95), w5 = w1 * R.u(0.3, 2);
    const s = R.next() < 0.5 ? 1 : -1, p0 = 200;
    const pts = [p0, p0 + s * w1, p0 + s * (w1 - w2), p0 + s * (w1 - w2 + w3), p0 + s * (w1 - w2 + w3 - w4), p0 + s * (w1 - w2 + w3 - w4 + w5)];
    const shortest3 = w3 < Math.min(w1, w5), beyond3 = w3 > w2;
    const e = P.evaluate("IMPULSE", legs(pts));
    const shouldBeValid = !shortest3 && beyond3;
    assert.equal(e.valid, shouldBeValid, JSON.stringify({ w1, w2, w3, w4, w5, v: e.violations }));
    if (shouldBeValid) legal++; else illegal++;
    /* gezielte Verletzungen */
    const v2 = pts.slice(); v2[2] = p0 - s * R.u(0.1, 5);                                   // W2 hinter Ursprung
    assert.ok(P.evaluate("IMPULSE", legs(v2)).violations.includes("W2_NOT_BEYOND_W1_ORIGIN"));
    const v4 = pts.slice(); v4[4] = pts[1] - s * R.u(0.01, 2);                               // W4 im Gebiet von W1
    assert.ok(P.evaluate("IMPULSE", legs(v4)).violations.includes("W4_NO_OVERLAP_W1"));
  }
  assert.ok(legal > 100 && illegal > 20, legal + "/" + illegal);
});

test("EV3-N1 · Negativfaelle werden nicht als Impuls mit passenden Pivots gelesen", () => {
  for (const cls of ["NEG_W2_BEYOND_ORIGIN", "NEG_W3_SHORTEST", "NEG_W4_OVERLAP"]) for (const seed of [0, 1, 2, 3]) {
    const cs = corpusCase(cls, seed, "none");
    const r = run(cs.closes, cs.dates);
    const T = cs.truth.topIdx;
    for (const c of [r.primary, ...(r.alternatives || [])].filter(Boolean)) {
      const pts = [c.waves[0].fromIndex].concat(c.waves.map((w) => w.toIndex));
      const same = c.pattern === "IMPULSE" && pts.length === T.length && pts.every((x, k) => Math.abs(x - T[k]) <= 2);
      assert.equal(same, false, cls + " seed " + seed);
    }
  }
});

test("EV3-D1 · Datenluecke (6 Wochen fehlen) → Warnung und keine verlaessliche Zaehlung", () => {
  const cs = corpusCase("IMPULSE", 5, "low"), cut = cs.closes.length - 40;
  const closes = cs.closes.slice(0, cut).concat(cs.closes.slice(cut + 6)), dates = cs.dates.slice(0, cut).concat(cs.dates.slice(cut + 6));
  const r = run(closes, dates);
  assert.ok(r.dataQuality.maxGapBars >= 4, JSON.stringify(r.dataQuality));
  assert.equal(r.applicability.abstain, true);
  assert.match(r.applicability.reasons[0], /Lücken/);
});

test("EV3-D2 · Unbereinigter Split (Kurs halbiert) → erkannt, keine Zaehlung als verlaesslich", () => {
  const cs = corpusCase("ZIGZAG", 5, "low"), at = cs.closes.length - 30;
  const closes = cs.closes.map((c, i) => (i >= at ? c / 2 : c));
  const r = run(closes, cs.dates);
  assert.ok(r.dataQuality.suspectedSplits.length >= 1);
  assert.equal(r.applicability.abstain, true);
  /* bereinigt: keine Warnung */
  assert.equal(run(cs.closes, cs.dates).dataQuality.suspectedSplits.length, 0);
});

test("EV3-O1 · Ausgabevertrag wie V2 plus Grad-, Mehrdeutigkeits- und Begruendungsangaben", () => {
  const cs = corpusCase("FLAT_REGULAR", 0, "none");
  const r = run(cs.closes, cs.dates);
  assert.equal(r.engineVersion, E3.ENGINE_VERSION);
  assert.equal(r.isProbability, false);
  for (const k of ["waves", "invalidation", "projection", "countQuality", "ruleAudit", "persistenceKey", "currentWave", "rankComponents", "degree"]) assert.ok(k in r.primary, k);
  assert.ok(["NONE", "DEGREE", "LABEL", "STRUCTURE"].includes(r.ambiguity.kind));
  assert.ok(r.trace && Array.isArray(r.trace.rejectedTop));
  assert.ok(r.primary.waves.some((w) => w.subdivision));
});

/* ---------------------------------------------------------------- 3.1: Red-Team H1 (Regressionsfaelle, dauerhaft) */
function knotsSeries(K) {
  const closes = []; for (let s = 0; s < K.length - 1; s++) { const [i0, v0] = K[s], [i1, v1] = K[s + 1]; for (let q = 0; q < i1 - i0; q++) closes.push(v0 + (v1 - v0) * q / (i1 - i0)); }
  closes.push(K[K.length - 1][1]);
  return { closes, dates: closes.map((_, i) => new Date(Date.UTC(2001, 0, 5) + i * 7 * 86400000).toISOString().slice(0, 10)) };
}
/** Unabhaengiger Pruefer (G8): harte Regeln gegen die Kursextreme INNERHALB jeder Welle. */
function intraViolations(c, closes) {
  const v = [], s = c.waves[0].toPrice >= c.waves[0].fromPrice ? 1 : -1, p0 = c.waves[0].fromPrice;
  const back = (w) => { let e = w.toPrice; for (let i = w.fromIndex; i <= w.toIndex; i++) e = (w.toPrice >= w.fromPrice) ? Math.min(e, closes[i]) : Math.max(e, closes[i]); return e; };
  const fwd = (w) => { let e = w.toPrice; for (let i = w.fromIndex; i <= w.toIndex; i++) e = (w.toPrice >= w.fromPrice) ? Math.max(e, closes[i]) : Math.min(e, closes[i]); return e; };
  const W = c.waves;
  if (["IMPULSE", "LEADING_DIAGONAL", "ENDING_DIAGONAL"].includes(c.pattern)) {
    if (W[1] && s * back(W[1]) <= s * p0 && s * fwd(W[1]) !== undefined && s * Math.min(...[W[1]].map(back).map((x) => s * x)) <= s * p0) v.push("W2_BEYOND_ORIGIN");
    if (W[3] && c.pattern === "IMPULSE" && s * back(W[3]) <= s * W[0].toPrice) v.push("W4_OVERLAP");
  }
  if (["ZIGZAG", "DOUBLE_ZIGZAG", "TRIPLE_ZIGZAG", "WXY"].includes(c.pattern) && W[1] && s * back(W[1]) <= s * p0) v.push("B_BEYOND_ORIGIN");
  return v;
}
test("EV3-R2 · Red-Team H1: Welle 2 als Running Flat unter dem W1-Ursprung bzw. Dreieck-W4 im W1-Gebiet → kein Impuls", () => {
  const variants = {
    tri_w4_overlap: [[0, 140], [30, 140], [44, 120], [50, 128], [64, 100], [74, 112], [80, 105], [94, 135], [98, 109], [102, 128], [105, 116], [108, 125], [111, 119], [123, 145], [133, 128]],
    runflat_w2_below_origin: [[0, 140], [30, 140], [44, 120], [50, 128], [64, 100], [74, 115], [78, 97], [83, 118], [87, 104], [101, 135], [107, 123], [119, 150], [129, 133]]
  };
  for (const [name, K] of Object.entries(variants)) {
    const { closes, dates } = knotsSeries(K), r = run(closes, dates);
    for (const c of [r.primary, ...(r.alternatives || [])].filter(Boolean)) assert.deepEqual(intraViolations(c, closes), [], name + " " + c.pattern);
  }
});
test("EV3-R3 · G8 unabhaengig: keine ausgegebene Zaehlung verletzt eine harte Regel innerhalb einer Welle (Layout A und B, alle Rauschstufen)", () => {
  let n = 0;
  for (const cls of Object.keys(CLASSES)) for (const nz of ["none", "medium", "high"]) for (const layout of ["A", "B"]) {
    const cs = corpusCase(cls, 7, nz, { layout });
    const r = run(cs.closes, cs.dates);
    for (const c of [r.primary, ...(r.alternatives || [])].filter(Boolean)) { n++; assert.deepEqual(intraViolations(c, cs.closes), [], cs.id + " " + c.pattern); }
  }
  assert.ok(n > 80);
});
