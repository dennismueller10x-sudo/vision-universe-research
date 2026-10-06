/* CHECKPOINT 2 — Causal Pivot Engine + Market Structure */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixtures, rawBarsWithSplit } from "./technical-fixtures.mjs";

const require = createRequire(import.meta.url);
const Canonical = require("../engines/technical/canonical-bars.js");
const Features = require("../engines/technical/feature-store.js");
const Pivots = require("../engines/technical/pivot-engine.js");
const Structure = require("../engines/technical/market-structure.js");
const Hash = require("../engines/hash.js");

function run(series) {
  const f = Features.computeFeatures(series);
  const p = Pivots.runPivots(series, f);
  return { f, p, s: Structure.analyzeStructure(series, f, p, { scaleId: "scale-2" }) };
}

const CASES = ["cleanUptrend", "cleanDowntrend", "range", "gap", "highVol", "lowVol", "fakeReversal", "confirmedReversal"];

test("P1 · pivotTime liegt vor confirmedAt, Pivots alternieren, Extrem stimmt", () => {
  for (const name of CASES) {
    const s = fixtures[name]();
    const { p } = run(s);
    for (const scaleId of p.scaleIds) {
      const pv = p.scales[scaleId].pivots;
      assert.ok(Pivots.isAlternating(pv), `${name}/${scaleId}: Pivots muessen alternieren`);
      for (const x of pv) {
        assert.ok(x.confirmedIndex > x.pivotIndex, `${name}/${scaleId}: confirmedAt muss nach pivotTime liegen`);
        assert.equal(x.pivotTime, s.timestamps[x.pivotIndex]);
        assert.equal(x.confirmedAt, s.timestamps[x.confirmedIndex]);
        assert.equal(x.pivotPrice, x.side === "HIGH" ? s.high[x.pivotIndex] : s.low[x.pivotIndex]);
        assert.equal(x.status, "CONFIRMED");
        // Zwischen Pivot und Bestaetigung gab es kein hoeheres High (bzw. tieferes Low).
        for (let i = x.pivotIndex + 1; i <= x.confirmedIndex; i++) {
          if (x.side === "HIGH") assert.ok(s.high[i] <= x.pivotPrice, `${name}: hoeheres High vor Bestaetigung`);
          else assert.ok(s.low[i] >= x.pivotPrice, `${name}: tieferes Low vor Bestaetigung`);
        }
      }
    }
  }
});

test("P2 · NO LOOK-AHEAD: Praefix-Lauf und geschnittener Voll-Lauf sind bit-identisch", () => {
  for (const name of CASES) {
    const full = fixtures[name]();
    const T = Math.floor(full.length * 0.7);
    const prefix = Canonical.slice(full, T);
    const a = run(prefix).p;
    const b = run(full).p;
    for (const scaleId of a.scaleIds) {
      const pa = a.scales[scaleId].pivots;
      const pb = Pivots.confirmedAsOf(b, scaleId, T);
      assert.equal(Hash.hashValue(pa.map(strip)), Hash.hashValue(pb.map(strip)), `${name}/${scaleId}: Pivots an T haengen von spaeteren Bars ab`);
    }
    // Struktur an T: identisch, wenn nur die Praefix-Serie sichtbar ist.
    const sa = run(prefix).s, sb = run(Canonical.slice(full, T)).s;
    assert.equal(Hash.hashValue(sa.events), Hash.hashValue(sb.events));
  }
  function strip(p) { const { sourceBarsHash, ...rest } = p; return rest; }
});

test("P3 · Fake Reversal unter der Schwelle erzeugt keinen Pivot, Confirmed Reversal schon", () => {
  const fake = run(fixtures.fakeReversal()).p;
  const conf = run(fixtures.confirmedReversal()).p;
  // -2.5 % liegt unter der 4-%-Untergrenze von scale-2.
  const fakeHighs = fake.scales["scale-2"].pivots.filter((x) => x.side === "HIGH" && x.pivotIndex > 100 && x.pivotIndex < 130);
  assert.equal(fakeHighs.length, 0, "ein Rueckschlag unter der Schwelle darf kein bestaetigtes Hoch erzeugen");
  const confHighs = conf.scales["scale-2"].pivots.filter((x) => x.side === "HIGH" && x.pivotIndex >= 145 && x.pivotIndex <= 152);
  assert.equal(confHighs.length, 1, "der echte Umschwung erzeugt genau ein bestaetigtes Hoch am Extrem");
  assert.ok(confHighs[0].confirmedIndex - confHighs[0].pivotIndex >= 1);
});

test("P4 · Skalen sind hierarchisch: groessere Skala → weniger, prominentere Pivots", () => {
  for (const name of ["cleanUptrend", "highVol", "range"]) {
    const { p } = run(fixtures[name]());
    const counts = p.scaleIds.map((id) => p.scales[id].pivots.length);
    for (let i = 1; i < counts.length; i++) assert.ok(counts[i] <= counts[i - 1], `${name}: ${counts}`);
    assert.ok(counts[0] > 0);
    const big = p.hierarchy.filter((h) => h.significance >= 2);
    assert.ok(big.length > 0, "Extreme ueberleben mehrere Skalen");
    for (const h of p.hierarchy) assert.ok(h.scales.length === h.significance);
  }
});

test("P5 · Split erzeugt weder Pivot noch Strukturbruch auf der SPLIT_ADJUSTED-Serie", () => {
  const { bars, actions } = rawBarsWithSplit(400, 200, 4);
  const worlds = Canonical.fromPriceBars(bars, actions, { instrumentId: "SPLIT" });
  const sa = run(worlds.SPLIT_ADJUSTED), raw = run(worlds.RAW);
  const splitPivotsSA = sa.p.scales["scale-1"].pivots.filter((x) => x.pivotIndex >= 195 && x.pivotIndex <= 205);
  assert.equal(splitPivotsSA.length, 0, "kein Pivot am Split-Tag auf der bereinigten Serie");
  const bearishSA = sa.s.events.filter((e) => /BEARISH|DOWN|FAILURE_BULLISH/.test(e.type) && e.index >= 195 && e.index <= 210);
  assert.equal(bearishSA.length, 0, "kein bearischer Strukturbruch durch den Split");
  // Auf RAW dagegen entsteht der falsche Crash — genau deshalb ist RAW fuer Technik verboten.
  const bearishRaw = raw.s.events.filter((e) => /BEARISH|DOWN|FAILURE_BULLISH/.test(e.type) && e.index >= 199 && e.index <= 205);
  assert.ok(bearishRaw.length > 0, "RAW zeigt den Split als Bruch (Kontrollfall)");
});

test("P6 · Developing Pivot bewegt sich, bestaetigte Pivots nicht (Repainting-Policy)", () => {
  const full = fixtures.cleanUptrend(300);
  const a = run(Canonical.slice(full, 250)).p, b = run(Canonical.slice(full, 260)).p;
  const pa = a.scales["scale-1"].pivots, pb = b.scales["scale-1"].pivots;
  for (let i = 0; i < pa.length; i++) {
    assert.equal(pb[i].pivotId, pa[i].pivotId);
    assert.equal(pb[i].confirmedAt, pa[i].confirmedAt);
  }
  assert.equal(a.scales["scale-1"].developing.status, "DEVELOPING");
  assert.equal(Pivots.REPAINTING_POLICY, "CONFIRMS_WITH_DELAY");
});

test("S1 · Klarer Aufwaertstrend → HH/HL und BULLISH, Abwaertstrend → LH/LL und BEARISH", () => {
  const up = run(fixtures.cleanUptrend()).s, down = run(fixtures.cleanDowntrend()).s;
  assert.equal(up.state.regime, "BULLISH");
  assert.equal(down.state.regime, "BEARISH");
  const upLabels = up.swings.slice(-6).map((s) => s.label);
  assert.ok(upLabels.filter((l) => l === "HH" || l === "HL").length >= 4, `${upLabels}`);
  assert.ok(up.events.some((e) => e.type === "BOS_BULLISH"), "Break of Structure close-basiert");
  assert.ok(down.events.some((e) => e.type === "BOS_BEARISH"));
  assert.ok(up.state.structureScore > 0 && down.state.structureScore < 0);
});

test("S2 · Range wird als Range erkannt, Reversal als Structure Change", () => {
  const rg = run(fixtures.range()).s;
  assert.ok(rg.events.some((e) => e.type === "RANGE_START"), "Range-Start erkannt");
  assert.ok(["RANGE", "MIXED"].includes(rg.state.regime), rg.state.regime);
  const rev = run(fixtures.confirmedReversal()).s;
  const change = rev.events.find((e) => e.type === "STRUCTURE_CHANGE_BEARISH" || e.type === "STRUCTURE_FAILURE_BULLISH");
  assert.ok(change, "Umschwung erzeugt Structure Failure / Change");
  assert.ok(change.index > 150, "erst NACH dem Extrem, nie davor");
  assert.equal(rev.state.regime, "BEARISH");
});

test("S3 · Structure-Events sind kausal: kein Event vor der Bestaetigung seines Pivots", () => {
  for (const name of CASES) {
    const { p, s } = run(fixtures[name]());
    const byId = {};
    p.scales["scale-2"].pivots.forEach((x) => { byId[x.pivotId] = x; });
    for (const e of s.events) {
      if (!e.refPivotId) continue;
      assert.ok(byId[e.refPivotId].confirmedIndex <= e.index, `${name}: ${e.type} vor Bestaetigung`);
    }
  }
});

test("S4 · Compression und Expansion aus Swing-Amplituden", () => {
  // Abnehmende Schwingung → Compression; danach zunehmende → Expansion.
  const pts = [[0, 100], [20, 130], [40, 100], [60, 124], [80, 104], [100, 118], [120, 108], [140, 114], [160, 110],
               [180, 125], [200, 95], [220, 140], [240, 80]];
  const s = fixtures.piecewise(pts, { seed: "ce" });
  const { s: st } = run(s);
  const types = st.events.map((e) => e.type);
  assert.ok(types.includes("COMPRESSION"), types.join(","));
  assert.ok(types.includes("EXPANSION"), types.join(","));
  assert.ok(types.indexOf("COMPRESSION") < types.lastIndexOf("EXPANSION"));
});
