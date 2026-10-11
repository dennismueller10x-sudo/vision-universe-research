/* Explore Highlights und Candidate Explorer (explore-curation-1.0.0): reine Kuratierung bereits gueltiger Kandidaten.
   Keine Engine, keine Zukunftsrenditen, keine Projektionsgroesse als Auswahlkriterium. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const C = require("../engines/technical/projection/explore-curation.js");
const P = C.POLICY;

let n = 0;
/** Kandidat; rankPct wird ueber Rang/Pool eingestellt (Pool 200 → Rang r hat (r+1)/200). */
const cand = (o = {}) => Object.assign({ id: "K" + (++n), type: "WAVE_3", pattern: "IMPULSE", variant: null, direction: "UP", failed: ["G5"], rank: 4, pool: 200, w1Weeks: 40, mid: 100 + n * 50, ctx: {} }, o);
const rk = (pct, pool = 200) => Math.round(pct * pool) - 1;   // Rang, dessen (Rang+1)/Pool genau pct ist

test("C-1 · Eine schwache Mehrfach-Lesart ist kein Highlight: G3+G4, G2+G3+G4, G2+G5, G4+G5, drei oder mehr", () => {
  for (const failed of [["G3", "G4"], ["G2", "G3", "G4"], ["G2", "G5"], ["G4", "G5"], ["G3", "G5"], ["G2", "G3"], ["G2", "G4"], ["G2", "G3", "G4", "G5"]]) {
    const e = C.highlightEligibility(cand({ failed, rank: 0 }));
    assert.equal(e.eligible, false, failed.join("+"));
  }
  assert.ok(C.highlightEligibility(cand({ failed: ["G3", "G4"], rank: 0 })).reasons.includes("STRUCTURE_GATE_FAILED"));
  assert.ok(C.highlightEligibility(cand({ failed: ["G2", "G5"], rank: 0 })).reasons.includes("TOO_MANY_FAILED_GATES"));
});

test("C-2 · Struktur-Leitplanken sind hart: G3 (Rauschen) oder G4 (Groesse) allein macht nie ein Highlight, auch nicht bei bestem Rang", () => {
  for (const failed of [["G3"], ["G4"]]) {
    const e = C.highlightEligibility(cand({ failed, rank: 0 }));
    assert.equal(e.eligible, false, failed.join("+"));
    assert.deepEqual(e.reasons, ["STRUCTURE_GATE_FAILED"]);
  }
});

test("C-3 · Eine starke Einzel-Lesart (G2 allein oder G5 allein, guter Rang) wird Highlight", () => {
  for (const failed of [["G2"], ["G5"]]) {
    const r = C.curate([cand({ failed, rank: 2 })]);
    assert.equal(r.highlights.length, 1, failed.join("+"));
    assert.equal(r.decisions[r.highlights[0].id].tier, "HIGHLIGHT");
  }
  /* ohne verfehlte Leitplanke waere es eine regulaere Alternative und gehoert nicht zu Explore */
  assert.deepEqual(C.highlightEligibility(cand({ failed: [] })).reasons.includes("NO_FAILED_GATE"), true);
});

test("C-4 · Rangschwelle je Wellentyp: genau auf der Schwelle drin, knapp darunter nicht", () => {
  for (const type of ["WAVE_3", "WAVE_5", "WAVE_C"]) {
    const t = P.highlight.rankMax[type], on = C.highlightEligibility(cand({ type, rank: rk(t) })), off = C.highlightEligibility(cand({ type, rank: rk(t) + 1 }));
    assert.equal(on.eligible, true, type + " auf der Schwelle");
    assert.equal(off.eligible, false, type + " knapp darunter");
    assert.deepEqual(off.reasons, ["RANK_BELOW_THRESHOLD"]);
  }
  assert.ok(P.highlight.rankMax.WAVE_C < P.highlight.rankMax.WAVE_3, "Welle C ist strenger als Welle 3 (haeufigster, unspezifischster Typ)");
  /* unbekannter Typ wird nie befoerdert */
  assert.deepEqual(C.highlightEligibility(cand({ type: "REVERSAL", rank: 0 })).reasons, ["TYPE_NOT_PROMOTED"]);
});

test("C-5 · Wellentyp-Prioritaet: Welle 3 vor Welle 5 vor Welle C, auch wenn Welle C besser im Pool steht", () => {
  const c = cand({ type: "WAVE_C", pattern: "ZIGZAG", direction: "DOWN", rank: 0 }), w5 = cand({ type: "WAVE_5", direction: "UP", rank: 6 }), w3 = cand({ type: "WAVE_3", direction: "UP", rank: 9 });
  assert.deepEqual(C.sortByOrder([c, w5, w3]).map((x) => x.type), ["WAVE_3", "WAVE_5", "WAVE_C"]);
  const r = C.curate([c, w5, w3]);
  assert.equal(r.highlights[0].type, "WAVE_3");
});

test("C-6 · Hoechstens zwei Highlights; das zweite ist wesentlich anders (Gegenrichtung oder anderer Wellentyp), nie ein Doppelgaenger", () => {
  const a = cand({ type: "WAVE_3", direction: "UP", rank: 1 }), same = cand({ type: "WAVE_3", direction: "UP", rank: 2, mid: 777 }), opp = cand({ type: "WAVE_3", direction: "DOWN", rank: 3 }),
        other = cand({ type: "WAVE_5", direction: "UP", rank: 4 }), more = cand({ type: "WAVE_5", direction: "DOWN", rank: 5 });
  const r = C.curate([a, same, opp, other, more]);
  assert.ok(r.highlights.length <= P.highlight.max && r.highlights.length === 2);
  assert.equal(r.highlights[0].id, a.id);
  assert.notEqual(r.decisions[same.id].tier, "HIGHLIGHT");
  assert.ok(r.decisions[same.id].why.includes("NOT_DISTINCT_FROM_HIGHLIGHT"));
  assert.ok(C.materiallyDifferent(r.highlights[0], r.highlights[1]));
  assert.ok(!C.materiallyDifferent(a, same));
  /* ein einziger geeigneter Kandidat → genau ein Highlight (lieber eines) */
  assert.equal(C.curate([a]).highlights.length, 1);
  assert.equal(C.curate([a, same]).highlights.length, 1);
});

test("C-7 · Keine Dubletten: eine Lesart steht nie in Highlights und Candidate Explorer zugleich; nahezu gleiche Leitern werden nicht doppelt gezeigt", () => {
  const h = cand({ rank: 1, mid: 100 });
  const near = cand({ type: "WAVE_3", direction: "UP", failed: ["G3"], rank: 2, mid: 105 });           // gleiche Richtung, gleicher Typ, Leiter innerhalb 10 %
  const far = cand({ type: "WAVE_3", direction: "UP", failed: ["G3"], rank: 3, mid: 150 });
  const r = C.curate([h, near, far]);
  const ids = r.highlights.concat(r.candidates).map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes(near.id) && r.decisions[near.id].why.includes("NEAR_DUPLICATE"));
  assert.ok(ids.includes(far.id));
});

test("C-8 · Candidate Explorer behaelt die nachrangige Lesart (Strukturgrenze verfehlt), begrenzt auf die Maximalzahl", () => {
  const weak = cand({ failed: ["G3", "G4"], rank: 0, direction: "DOWN", type: "WAVE_C", pattern: "ZIGZAG" });
  assert.deepEqual(C.curate([weak]).candidates.map((x) => x.id), [weak.id]);
  assert.equal(C.curate([weak]).highlights.length, 0);
  const many = Array.from({ length: P.candidates.max + 5 }, (_, k) => cand({ failed: ["G3"], rank: k, type: "WAVE_C", pattern: "ZIGZAG", direction: k % 2 ? "UP" : "DOWN", mid: 100 * Math.pow(2, k) }));
  const r = C.curate(many);
  assert.equal(r.candidates.length, P.candidates.max);
  assert.ok(r.decisions[many[many.length - 1].id].why.includes("CANDIDATE_SLOTS_FULL"));
});

test("C-9 · Eine grosse Projektion allein macht kein Highlight, und sie sortiert nicht nach vorn", () => {
  const giant = cand({ failed: ["G4"], rank: 0, mid: 1e9 });
  assert.equal(C.highlightEligibility(giant).eligible, false);
  /* gleiche Prioritaetsstufen: die Projektionsgroesse (mid) aendert die Reihenfolge nie */
  const small = cand({ id: "A", rank: 5, mid: 1 }), big = cand({ id: "B", rank: 5, mid: 1e9, direction: "DOWN" });
  assert.deepEqual(C.sortByOrder([big, small]).map((x) => x.id), ["A", "B"], "Gleichstand → stabile Kennung, nicht Groesse");
  const better = cand({ id: "C", rank: 3, mid: 2 });
  assert.equal(C.sortByOrder([big, better])[0].id, "C");
  assert.ok(!/mid|upside|target/i.test(JSON.stringify(C.orderKey(small).slice(0, 5))), "Reihenfolge nutzt keine Projektionsgroesse");
});

test("C-10 · Kontext (Trend, Relative Staerke, Marktstruktur) senkt nur die Reihenfolge innerhalb gleich guter Lesarten, sperrt nie", () => {
  const against = cand({ id: "X1", rank: 5, ctx: { trendAligned: false, rsAligned: false, structureAligned: false } });
  assert.equal(C.highlightEligibility(against).eligible, true, "Gegenkontext sperrt nicht");
  /* gleiche Struktur, gleicher Typ, gleiche Rang-Stufe: zuerst die Lesart mit Kontext, auch wenn ihr genauer Rang etwas schlechter ist */
  const withCtx = cand({ id: "X2", rank: 8, ctx: { trendAligned: true, rsAligned: true, structureAligned: true }, direction: "DOWN" });
  assert.equal(C.rankTier(against), C.rankTier(withCtx));
  assert.deepEqual(C.sortByOrder([against, withCtx]).map((x) => x.id), ["X2", "X1"]);
  assert.equal(C.contextAgreement(against), 0); assert.equal(C.contextAgreement(withCtx), 3);
  assert.equal(C.contextAgreement(cand({ ctx: { trendAligned: null, rsAligned: null, structureAligned: true } })), 1, "unbekannt zaehlt nicht als Gegenkontext");
  /* aber nie vor einer besseren Rang-Stufe */
  const betterTier = cand({ id: "X3", rank: 1, ctx: {} });
  assert.ok(C.rankTier(betterTier) < C.rankTier(cand({ rank: rk(0.20) })));
  const worseTierWithCtx = cand({ id: "X4", rank: rk(0.20), ctx: { trendAligned: true, rsAligned: true, structureAligned: true } });
  assert.equal(C.sortByOrder([worseTierWithCtx, betterTier])[0].id, "X3");
  /* und nie vor einem besseren Wellentyp */
  const w3 = cand({ id: "X5", type: "WAVE_3", rank: 9, ctx: {} }), c = cand({ id: "X6", type: "WAVE_C", pattern: "ZIGZAG", rank: 0, ctx: { trendAligned: true, rsAligned: true, structureAligned: true } });
  assert.equal(C.sortByOrder([c, w3])[0].id, "X5");
});

test("C-11 · Deterministisch: gleiche Eingabe, byte-gleiche Ausgabe, unabhaengig von der Eingabereihenfolge", () => {
  const list = [cand({ id: "a", rank: 3 }), cand({ id: "b", rank: 3, direction: "DOWN" }), cand({ id: "c", type: "WAVE_5", rank: 9 }), cand({ id: "d", failed: ["G3"], rank: 1, type: "WAVE_C", pattern: "ZIGZAG" })];
  const one = JSON.stringify(C.curate(list)), two = JSON.stringify(C.curate(list.slice().reverse()));
  assert.equal(one, JSON.stringify(C.curate(list)));
  assert.equal(JSON.parse(one).highlights.map((x) => x.id).join(), JSON.parse(two).highlights.map((x) => x.id).join());
  assert.equal(JSON.parse(one).candidates.map((x) => x.id).join(), JSON.parse(two).candidates.map((x) => x.id).join());
});

test("C-12 · Richtlinie ist eingefroren und nennt weder Wahrscheinlichkeit noch Rendite", () => {
  assert.throws(() => { "use strict"; P.highlight.max = 9; });
  assert.equal(P.highlight.max, 2);
  assert.deepEqual(Object.keys(P.highlight.rankMax).sort(), ["WAVE_3", "WAVE_5", "WAVE_C"]);
  assert.ok(!/probab|wahrschein|return|rendite|trefferquote/i.test(JSON.stringify(P)));
  assert.equal(C.VERSION, "explore-curation-1.0.0"); assert.equal(C.HIGHLIGHT_VERSION, "explore-highlight-1.0.0"); assert.equal(C.CANDIDATES_VERSION, "explore-candidates-1.0.0");
});
