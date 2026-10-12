/* =========================================================================
   EMERGING LEADERS (quant/engines/emerging-leaders.js)

   EL1  Kein Look-ahead: Aenderungen nach t aendern kein Merkmal bei t;
        ein Zugriff nach t wirft
   EL2  Merkmale rechnen nach (RS gegen SPY, Volumenverhaeltnis, Kompression)
   EL3  Zustaende sind objektiv und folgen der Reihenfolge 5 -> 1
   EL4  Querschnitt: Perzentile, Gruppen, Modelle, Emerging-Population
   EL5  Statistik: Rangperzentile mit Bindungen, Newey-West, Spearman, OLS
   EL6  Die Vorregistrierung nennt jede Schwelle, die die Engine benutzt
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const EL = require("../engines/emerging-leaders.js");
const PREREG = JSON.parse(readFileSync(new URL("../methodology/emerging-leaders-v1.json", import.meta.url), "utf8"));

/* Synthetische Reihe: n Tage, Kurs aus Funktion, SPY flach mit leichtem Trend. */
function reihe(n, preis, opts = {}) {
  const close = [], high = [], low = [], volume = [], bench = [];
  for (let k = 0; k < n; k++) {
    const p = preis(k);
    close.push(p); high.push(p * (opts.spread ? 1 + opts.spread(k) : 1.01)); low.push(p * (opts.spread ? 1 - opts.spread(k) : 0.99));
    volume.push(opts.vol ? opts.vol(k) : 1e6); bench.push(100 * (1 + 0.0002 * k));
  }
  return { close, high, low, volume, bench, rawClose: close.slice(), rawVolume: volume.slice() };
}

test("EL1 · kein Look-ahead: Zukunft aendert nichts, Zugriff nach t wirft", () => {
  const s1 = reihe(400, (k) => 50 + 10 * Math.sin(k / 15) + k * 0.05);
  const s2 = reihe(400, (k) => (k > 300 ? 999 : 50 + 10 * Math.sin(k / 15) + k * 0.05), { vol: (k) => (k > 300 ? 9e9 : 1e6) });
  const a = EL.seriesFeatures(s1, 300), b = EL.seriesFeatures(s2, 300);
  for (const k of Object.keys(a)) {
    if (typeof a[k] === "number") assert.ok(Object.is(a[k], b[k]) || Math.abs(a[k] - b[k]) < 1e-12, k + ": " + a[k] + " vs " + b[k]);
  }
  /* Der Waechter der Engine wirft bei jedem Zugriff nach t. */
  const at = EL.guard(10);
  assert.equal(at([1, 2, 3], 2), 3);
  assert.throws(() => at(new Array(20).fill(1), 11), /LOOK_AHEAD/);
  assert.equal(EL.seriesFeatures(s1, 100), null, "zu wenig Historie");
});

test("EL2 · Merkmale rechnen nach", () => {
  /* Titel steigt 0,1 %/Tag, SPY 0,02 %/Tag (linear). */
  const s = reihe(400, (k) => 100 * Math.pow(1.001, k));
  const f = EL.seriesFeatures(s, 399);
  const erwartet = Math.log(Math.pow(1.001, 20)) - Math.log((1 + 0.0002 * 399) / (1 + 0.0002 * 379));
  assert.ok(Math.abs(f.rs_20 - erwartet) < 1e-9);
  assert.ok(f.slope50 > 0 && f.sma20over50 > 0);
  assert.ok(Math.abs(f.relVol - 1) < 1e-12, "konstantes Volumen");
  assert.ok(f.nearPivot <= 0 && f.nearPivot > -0.02);
  /* Volumen nur an Aufwaertstagen hoch -> udv50 > 0. */
  const z = reihe(400, (k) => 100 + (k % 2 ? 1 : 0) + k * 0.01, { vol: (k) => (k % 2 ? 2e6 : 1e6) });
  assert.ok(EL.seriesFeatures(z, 399).udv50 > 0.5);
  /* Kompression: Schwankung der letzten 20 Tage viel kleiner. */
  const kmp = reihe(400, (k) => 100 + (k < 380 ? 5 * Math.sin(k) : 0.2 * Math.sin(k)));
  assert.ok(EL.seriesFeatures(kmp, 399).volRatio < 0.35);
});

test("EL3 · Zustaende objektiv, Reihenfolge 5 -> 1", () => {
  const basis = { close: 100, high252: 105, high60: 101, sma50: 95, sma200: 90, slope50: 0.01, sma50over200Days60: 60,
                  volRatio: 1, bbwPct: 0.5, breakout: null, udv50: 0, accDays: 0 };
  const p = { pRS_120: 95, pRS_60: 70 };
  assert.equal(EL.classify(basis, p, { rsImprove: 30 }), "S5_ESTABLISHED_LEADER");
  assert.equal(EL.classify(Object.assign({}, basis, { breakout: { daysAgo: 1, pivot: 99 } }), { pRS_120: 50, pRS_60: 50 }, {}), "S4_BREAKOUT_CONFIRMED");
  assert.equal(EL.classify(Object.assign({}, basis, { volRatio: 0.7 }), { pRS_120: 50, pRS_60: 50 }, {}), "S3_BREAKOUT_CANDIDATE");
  assert.equal(EL.classify(Object.assign({}, basis, { high60: 120 }), { pRS_120: 50, pRS_60: 65 }, { rsImprove: 25 }), "S2_MOMENTUM_EMERGING");
  assert.equal(EL.classify(Object.assign({}, basis, { high60: 120, udv50: Math.log(1.3), accDays: 3 }), { pRS_120: 60, pRS_60: 40 }, { rsImprove: 5 }), "S1_EARLY_ACCUMULATION");
  assert.equal(EL.classify(Object.assign({}, basis, { high60: 120 }), { pRS_120: 60, pRS_60: 40 }, { rsImprove: 5 }), "S0_NONE");
  /* Ausbruch, der nicht gehalten wird (C < 0,97 x Pivot), ist kein bestaetigter Ausbruch. */
  assert.notEqual(EL.classify(Object.assign({}, basis, { breakout: { daysAgo: 3, pivot: 110 } }), { pRS_120: 50, pRS_60: 50 }, {}), "S4_BREAKOUT_CONFIRMED");
});

test("EL4 · Querschnitt: Perzentile, Gruppen, Modelle, Emerging-Population", () => {
  const rows = [];
  for (let j = 0; j < 50; j++) {
    const s = reihe(400, (k) => 100 * Math.pow(1 + 0.0002 * j, k) * (1 + 0.02 * Math.sin(k / (5 + j))), { vol: (k) => 1e6 * (1 + (k % (j + 2) === 0 ? 1 : 0)) });
    rows.push({ id: "T" + j, f: EL.seriesFeatures(s, 399), fund: j % 2 ? { revenueAccel: j, revenueGrowthYoy: j / 10, netMarginChange: 0, fcfMargin: 0.1 } : null,
                prior: { pRS_60: 50, pRS_120: j < 25 ? 40 : 80 }, leadershipScore: j });
  }
  EL.crossSection(rows, { weights: { A: 1, B: 0, C: 0, D: 0, E: 0 } });
  const p = rows.map((r) => r.p.pRS_20);
  assert.ok(Math.min(...p) === 0 && Math.max(...p) === 100);
  for (const r of rows) {
    assert.ok(EL.STATES.includes(r.state));
    assert.ok(r.models.M1_TECH_EQUAL >= 0 && r.models.M1_TECH_EQUAL <= 1);
    assert.ok(Math.abs(r.models.M3_DEV_IC_WEIGHTED - r.groups.A) < 1e-12, "M3 = A bei Gewicht nur A");
    if (!r.emerging) assert.ok(Number.isNaN(r.models.M4_EMERGING_TECH));
  }
  /* Emerging: nur wer vor 3 Monaten nicht oben stand und nicht verdoppelt hat. */
  assert.ok(rows.filter((r) => r.emerging).every((r) => r.prior.pRS_120 <= 70 && r.f.ret252 < 1));
  /* Ohne Fundamentaldaten ist M2 = M1. */
  assert.equal(rows[0].models.M2_TECH_FUND_EQUAL, rows[0].models.M1_TECH_EQUAL);
});

test("EL5 · Statistik", () => {
  assert.deepEqual(EL.pctRanks([3, 1, 2, 2, NaN]).map((x) => (Number.isNaN(x) ? "nan" : x)), [1, 0, 0.5, 0.5, "nan"]);
  const nw = EL.stats.neweyWestT([1, 1, 1, 1.0001, 0.9999, 1, 1, 1], 2);
  assert.ok(nw.t > 100);
  assert.ok(Math.abs(EL.stats.spearman([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]) - 1) < 1e-12);
  const x1 = [], x2 = [], y = [];
  const r = EL.stats.rng(1);
  for (let j = 0; j < 200; j++) { const a = r(), b = r(); x1.push(a); x2.push(b); y.push(2 * a - 3 * b + 0.5); }
  const beta = EL.stats.ols(y, [x1, x2]);
  assert.ok(Math.abs(beta[0] - 2) < 1e-9 && Math.abs(beta[1] + 3) < 1e-9);
  const a = EL.stats.rng(20261012), b = EL.stats.rng(20261012);
  assert.equal(a(), b(), "deterministisch");
});

test("EL6 · die Vorregistrierung nennt Perioden, Horizonte, Modelle, Zustaende und Gates", () => {
  assert.equal(PREREG.methodologyVersion, EL.VERSION);
  assert.deepEqual(PREREG.observationGrid.horizonsTradingDays, [21, 63, 126, 252]);
  for (const p of ["DEVELOPMENT", "VALIDATION", "HOLDOUT_RECENT", "HOLDOUT_EARLY"]) assert.ok(PREREG.periods[p].from < PREREG.periods[p].to, p);
  assert.ok(PREREG.periods.DEVELOPMENT.to < PREREG.periods.VALIDATION.from && PREREG.periods.VALIDATION.to < PREREG.periods.HOLDOUT_RECENT.from);
  assert.ok(PREREG.periods.HOLDOUT_EARLY.to < PREREG.periods.DEVELOPMENT.from);
  for (const m of ["M1_TECH_EQUAL", "M2_TECH_FUND_EQUAL", "M3_DEV_IC_WEIGHTED", "M4_EMERGING_TECH"]) assert.ok(PREREG.models[m], m);
  for (const s of EL.STATES) assert.ok(PREREG.states[s], s);
  for (const g of Object.keys(EL.GROUPS)) {
    const key = Object.keys(PREREG.features).find((k) => k.startsWith(g + "_"));
    assert.deepEqual(PREREG.features[key].score, EL.GROUPS[g], g);
  }
  assert.ok(PREREG.validationGate.VALIDATED && PREREG.validationGate.EXPERIMENTAL);
});
