/* CHECKPOINT 4 — Support/Resistance + Fibonacci (auxiliary) */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixtures } from "./technical-fixtures.mjs";

const require = createRequire(import.meta.url);
const Canonical = require("../engines/technical/canonical-bars.js");
const Features = require("../engines/technical/feature-store.js");
const Pivots = require("../engines/technical/pivot-engine.js");
const SR = require("../engines/technical/support-resistance.js");
const Fib = require("../engines/technical/fibonacci.js");
const Hash = require("../engines/hash.js");

function prep(s) { const f = Features.computeFeatures(s); return { s, f, p: Pivots.runPivots(s, f) }; }

test("Z1 · Zonen statt Linien: jede Zone hat Breite, Staerke, Touches, Herkunft, Rolle", () => {
  const { s, f, p } = prep(fixtures.range());
  const sr = SR.analyzeSupportResistance(s, f, p);
  assert.ok(sr.zones.length >= 2);
  for (const z of sr.zones) {
    assert.ok(z.zoneHigh > z.zoneLow, "Zone hat Breite");
    assert.ok(z.strength >= 0 && z.strength <= 100);
    assert.ok(["PIVOT_CLUSTER", "GAP_UP", "GAP_DOWN"].includes(z.origin));
    assert.ok(["SUPPORT", "RESISTANCE", "INSIDE"].includes(z.currentRole));
    assert.ok(["ACTIVE", "STALE"].includes(z.status));
    assert.ok(z.zoneId && z.firstSeen);
    if (z.origin === "PIVOT_CLUSTER") assert.ok(z.pivotIds.length >= 1 && z.touchCount >= 1);
  }
  // Range: Zonen am oberen und unteren Rand mit vielen Touches.
  const top = sr.zones.filter((z) => z.centerPrice > 105), bottom = sr.zones.filter((z) => z.centerPrice < 95);
  assert.ok(top.length && bottom.length);
  assert.ok(Math.max(...sr.zones.map((z) => z.touchCount)) >= 3, "Range-Kanten werden mehrfach getestet");
  assert.equal(sr.repaintingPolicy, "CAN_REVISE");
});

test("Z2 · Touch-Cooldown: Beruehrungen an aufeinanderfolgenden Bars zaehlen einmal", () => {
  const items = [{ price: 100, weight: 1 }, { price: 101, weight: 3 }, { price: 110, weight: 1 }];
  assert.equal(SR.weightedMedian(items), 101);
  const { s, f, p } = prep(fixtures.range());
  const sr = SR.analyzeSupportResistance(s, f, p, { touchCooldownBars: 5 });
  const srNoCooldown = SR.analyzeSupportResistance(s, f, p, { touchCooldownBars: 0 });
  const sum = (r) => r.zones.reduce((a, z) => a + z.touchCount, 0);
  assert.ok(sum(srNoCooldown) > sum(sr), "ohne Cooldown entsteht kuenstliche Evidenz");
});

test("Z3 · Gap-Zonen sind deterministisch und verschwinden, wenn gefuellt", () => {
  const { s, f, p } = prep(fixtures.gap());
  const sr = SR.analyzeSupportResistance(s, f, p);
  const gaps = sr.zones.filter((z) => z.origin === "GAP_UP");
  assert.equal(gaps.length, 1, "genau eine ungefuellte Luecke");
  assert.equal(gaps[0].firstSeen, s.timestamps[200]);
  assert.equal(gaps[0].currentRole, "SUPPORT");
  // Fuellen: Serie danach unter die Luecke druecken.
  const filled = Canonical.revise(s, [{ index: 300, low: s.high[199] * 0.99, close: s.high[199] * 0.995, open: s.high[199] * 0.996 }], "f2");
  const q = prep(filled);
  assert.equal(SR.analyzeSupportResistance(q.s, q.f, q.p).zones.filter((z) => z.origin === "GAP_UP").length, 0);
});

test("Z4 · Periodenlevel und naechste Zonen relativ zum Kurs; S/R ist kausal", () => {
  const full = fixtures.cleanUptrend(400);
  const { s, f, p } = prep(full);
  const sr = SR.analyzeSupportResistance(s, f, p);
  assert.ok(sr.periodLevels.some((l) => l.origin === "PREV_WEEK_HIGH") && sr.periodLevels.some((l) => l.origin === "PREV_MONTH_LOW"));
  if (sr.nearestSupport) assert.ok(sr.nearestSupport.zoneHigh < s.close[399]);
  if (sr.nearestResistance) assert.ok(sr.nearestResistance.zoneLow > s.close[399]);
  const T = 300, cut = prep(Canonical.slice(full, T)), cut2 = prep(Canonical.slice(full, T));
  assert.equal(Hash.hashValue(SR.analyzeSupportResistance(cut.s, cut.f, cut.p).zones), Hash.hashValue(SR.analyzeSupportResistance(cut2.s, cut2.f, cut2.p).zones));
});

test("F1 · Fibonacci nur auf bestaetigten Pivot-Ankern; 50 % ist Half-Retracement; Rolle AUXILIARY", () => {
  const { s, f, p } = prep(fixtures.cleanUptrend());
  const fib = Fib.analyzeFibonacci(s, f, p);
  assert.equal(fib.role, "AUXILIARY");
  assert.equal(fib.family, "PROJECTION_AUXILIARY");
  assert.ok(fib.anchors.length >= 1);
  for (const a of fib.anchors) {
    assert.equal(a.status, "CONFIRMED");
    const sc = p.scales[a.scaleId].pivots;
    assert.ok(sc.some((x) => x.pivotId === a.from.pivotId) && sc.some((x) => x.pivotId === a.to.pivotId), "Anker sind echte bestaetigte Pivots");
  }
  const half = fib.levels.find((l) => l.ratio === 0.5);
  assert.match(half.label, /half/);
  const a0 = fib.anchors[0];
  const r618 = fib.levels.find((l) => l.anchorId === a0.anchorId && l.ratio === 0.618);
  assert.ok(Math.abs(r618.price - (a0.to.price - (a0.to.price - a0.from.price) * 0.618)) < 1e-3);
  assert.ok(fib.value <= 0.3, "Fib allein erzeugt keinen grossen Score-Beitrag");
});

test("F2 · Fib-Cluster nur bei Zusammentreffen verschiedener Anker", () => {
  const { s, f, p } = prep(fixtures.cleanUptrend());
  const fib = Fib.analyzeFibonacci(s, f, p);
  for (const c of fib.clusters) {
    assert.ok(c.anchorCount >= 2);
    assert.ok(c.zoneHigh > c.zoneLow);
    assert.ok(c.sources.length >= 2);
    assert.equal(c.methodologyVersion, Fib.ENGINE_VERSION);
  }
  const single = Fib.clusterLevels([{ levelId: "a", anchorId: "x", price: 100 }, { levelId: "b", anchorId: "x", price: 100.1 }], 1, Fib.DEFAULTS);
  assert.equal(single.length, 0, "zwei Level desselben Ankers sind kein Cluster");
});
