/* ELLIOTT PROJECTION ENGINE (elliott-projection-1.0.0) — deterministische Faelle.
   Die Engine liest nur die veroeffentlichte Form pro.elliott; hier werden Zaehlungen in genau dieser Form gebaut.
   Jeder Fall prueft Formel, Zone, Invalidation, Bestaetigung und Leitplanken gegen von Hand gerechnete Werte. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PJ = require("../engines/technical/projection/elliott-projection.js");
const Sources = require("../engines/technical/elliott/sources.js");

const close = (a, b) => Math.abs(a - b) < 1e-3;
const LABELS = { IMPULSE: ["1", "2", "3", "4", "5"], LEADING_DIAGONAL: ["1", "2", "3", "4", "5"], ENDING_DIAGONAL: ["1", "2", "3", "4", "5"], ZIGZAG: ["A", "B", "C"], FLAT: ["A", "B", "C"], WXY: ["W", "X", "Y"],
                 TRIANGLE: ["A", "B", "C", "D", "E"], TRIPLE_ZIGZAG: ["W", "X", "Y", "X₂", "Z"], DOUBLE_ZIGZAG: ["W·a", "W·b", "W·c", "X", "Y·a", "Y·b", "Y·c"] };
/** Zaehlung in veroeffentlichter Form aus Wendepunkten; lastDev = letzte Welle laeuft. */
function count(pattern, prices, o = {}) {
  const waves = [];
  for (let k = 1; k < prices.length; k++) waves.push({ label: LABELS[pattern][k - 1], fromTime: "2020-01-" + String(k).padStart(2, "0"), toTime: "2020-01-" + String(k + 1).padStart(2, "0"), fromPrice: prices[k - 1], toPrice: prices[k], status: o.complete || k < prices.length - 1 ? "CONFIRMED" : "DEVELOPING" });
  const up = prices[1] > prices[0];
  return { pattern, patternName: pattern, variant: null, direction: up ? "UP" : "DOWN", complete: !!o.complete, currentWave: o.complete ? { label: "nach", role: "COMPLETE" } : { label: LABELS[pattern][waves.length - 1], wave: waves.length },
           nextMove: o.nextMove || null, waves, invalidation: o.invalidation || null, revision: o.revision || null, persistenceKey: pattern + "|" + prices[0] + "|" + (up ? 1 : -1), ruleAudit: { validity: o.validity || "VALID" }, countQuality: { level: "MODERATE" } };
}
function E(primary, o = {}) { return { engineVersion: "elliott-3.2.2", ruleSetVersion: "elliott-rules-3.1.0", applicability: { abstain: !!o.abstain, level: o.abstain ? "LOW" : "MODERATE" }, primary, alternatives: o.alternatives || [], higherDegree: o.higherDegree || null, dataQuality: o.dataQuality || { suspectedSplits: 0 } }; }
const ctx = (c, o = {}) => Object.assign({ close: c, asOf: "2020-02-01", timeframe: "1W", trend: { state: "UP" }, structureVote: 1, rs: { rank: 0.85, rankPrev: 0.6, universe: 100 } }, o);
const zone = (t, tier) => t.zones.find((z) => z.tier === tier);

test("P-1 · Standard-Welle 3 (Impuls, aufwärts): Leiter 1,0/1,618/2,618/4,236 × W1 ab Ende W2, Invalidation = Ursprung W1, bestätigt über W1-Ende", () => {
  const c = count("IMPULSE", [10, 20, 15, 22], { invalidation: { price: 10, direction: "below", ruleId: "W2_NOT_BEYOND_W1_ORIGIN", kind: "HARD_RULE", statement: "x" }, revision: { price: 15, direction: "below", ruleId: "W3_START" } });
  const o = PJ.build(E(c), ctx(22)), t = o.primary;
  assert.equal(o.status, "AVAILABLE"); assert.equal(o.consumerVisible, true);
  assert.equal(t.type, "WAVE_3"); assert.equal(t.direction, "UP");
  assert.ok(close(zone(t, "BASE").low, 25) && close(zone(t, "BASE").high, 31.18));
  assert.ok(close(zone(t, "EXTENDED").low, 31.18) && close(zone(t, "EXTENDED").high, 41.18));
  assert.ok(close(zone(t, "EXTREME").low, 41.18) && close(zone(t, "EXTREME").high, 57.36));
  assert.equal(t.invalidation.price, 10); assert.equal(t.invalidation.direction, "below"); assert.equal(t.invalidation.ruleId, "W2_NOT_BEYOND_W1_ORIGIN");
  assert.equal(t.revision.price, 15);
  assert.equal(t.confirmation.price, 20); assert.equal(t.confirmation.passed, true); assert.equal(t.confirmation.class, "HARD_RULE");
  assert.equal(t.status, "CONFIRMED");
  assert.ok(close(zone(t, "BASE").pctLow, 25 / 22 - 1));
  assert.deepEqual(t.roadmap.elliott.map((x) => x.state), ["MET", "MET", "MET"]);
  assert.ok(t.roadmap.vu.every((x) => x.class === "VU_CONFIRMATION"));
});

test("P-2 · Welle 2 läuft: vorläufiger Anker, These im Aufbau, Bestätigung offen", () => {
  const c = count("IMPULSE", [10, 20, 14], { invalidation: { price: 10, direction: "below", ruleId: "W2_NOT_BEYOND_W1_ORIGIN", kind: "HARD_RULE" } });
  const t = PJ.build(E(c), ctx(15)).primary;
  assert.equal(t.type, "WAVE_3"); assert.equal(t.anchor.provisional, true); assert.equal(t.anchor.price, 14);
  assert.equal(t.status, "DEVELOPING"); assert.equal(t.confirmation.passed, false);
  assert.ok(t.roadmap.elliott.some((x) => x.id === "ANCHOR_WAVE_COMPLETE" && x.state === "OPEN"));
});

test("P-3 · Welle 5 nach verlängerter Welle 3: Basis 0,618–1,0 × W1, Extrem 1,0–1,618 × Strecke 1–3, Hinweis auf Verlängerung", () => {
  const c = count("IMPULSE", [10, 20, 17, 45, 38, 40], { invalidation: { price: 20, direction: "below", ruleId: "W4_NO_OVERLAP_W1", kind: "HARD_RULE" } });
  const t = PJ.build(E(c), ctx(40)).primary;
  assert.equal(t.type, "WAVE_5");
  assert.ok(close(zone(t, "BASE").low, 44.18) && close(zone(t, "BASE").high, 48));
  assert.ok(close(zone(t, "EXTENDED").low, 48) && close(zone(t, "EXTENDED").high, 54.18));
  assert.ok(close(zone(t, "EXTREME").low, 73) && close(zone(t, "EXTREME").high, 38 + 35 * 1.618));
  assert.ok(t.notes.some((n) => /verlängert/.test(n)));
  assert.equal(t.confirmation.price, 45); assert.equal(t.confirmation.class, "GUIDELINE");
  assert.ok(t.truncation && t.truncation.price === 45, "Truncation-Hinweis, solange W5 unter dem W3-Ende");
});

test("P-4 · Welle 5 mit kurzer Welle 3 (W3 < W1): harter Deckel W5 ≤ W3, fernere Stufen entfallen mit Regelbegründung", () => {
  const c = count("IMPULSE", [10, 30, 20, 34, 31, 32], { invalidation: { price: 30, direction: "below", ruleId: "W4_NO_OVERLAP_W1", kind: "HARD_RULE" } });
  const t = PJ.build(E(c), ctx(32)).primary;
  assert.equal(t.cap.price, 45); assert.equal(t.cap.ruleId, "W3_NOT_SHORTEST");
  assert.ok(t.zones.every((z) => z.high <= 45 + 1e-9));
  assert.equal(zone(t, "BASE").high, 45); assert.equal(zone(t, "BASE").capped, true);
  assert.ok(t.omittedTiers.some((x) => x.tier === "EXTENDED" && x.reason === "CAP"));
});

test("P-5 · Verkürzte Welle 5 (Truncation) und abgeschlossener Impuls → Gegenbewegung 0,382–0,618", () => {
  const trunc = count("IMPULSE", [10, 20, 16, 40, 32, 38], { complete: true, nextMove: "DOWN", revision: { price: 38, direction: "above", ruleId: "PATTERN_END" } });
  const t = PJ.build(E(trunc), ctx(36)).primary;
  assert.equal(t.type, "REVERSAL"); assert.equal(t.direction, "DOWN");
  assert.ok(close(zone(t, "BASE").high, 38 - 28 * 0.382) && close(zone(t, "BASE").low, 38 - 28 * 0.5));
  assert.equal(t.invalidation.price, 38); assert.equal(t.invalidation.direction, "above");
  assert.ok(!zone(t, "EXTREME") && t.omittedTiers.some((x) => x.tier === "EXTREME" && x.reason === "NOT_IN_METHOD"));
});

test("P-6 · Welle C (Zigzag, abwärts): C = 0,618/1,0/1,618/2,618 × A ab Ende B; Bestätigung jenseits A-Ende ist Richtlinie", () => {
  const c = count("ZIGZAG", [100, 80, 90, 85], { invalidation: { price: 100, direction: "above", ruleId: "B_NOT_BEYOND_A_ORIGIN", kind: "HARD_RULE" } });
  const t = PJ.build(E(c), ctx(85, { trend: { state: "DOWN" }, structureVote: -1 })).primary;
  assert.equal(t.type, "WAVE_C"); assert.equal(t.direction, "DOWN");
  assert.ok(close(zone(t, "BASE").high, 77.64) && close(zone(t, "BASE").low, 70));
  assert.ok(close(zone(t, "EXTENDED").low, 57.64));
  assert.ok(close(zone(t, "EXTREME").low, 37.64));
  assert.ok(zone(t, "BASE").pctHigh < 0, "abwärts: negative Prozentwerte");
  assert.equal(t.confirmation.class, "GUIDELINE"); assert.equal(t.confirmation.ruleId, "C_BEYOND_A_END");
  assert.equal(t.roadmap.vu.find((x) => x.id === "TREND").state, "MET");
});

test("P-7 · Flat: regulär 1,0–1,236/1,236–1,618 × A, expandiert 1,382–1,618/1,618–2,618 × A, kein Extrem-Band", () => {
  const reg = PJ.build(E(count("FLAT", [50, 40, 50, 47])), ctx(47)).primary;
  assert.equal(reg.variant, "REGULAR"); assert.ok(close(zone(reg, "BASE").high, 40) && close(zone(reg, "BASE").low, 37.64));
  assert.ok(!zone(reg, "EXTREME"));
  const exp = PJ.build(E(count("FLAT", [50, 40, 52, 48])), ctx(48)).primary;
  assert.equal(exp.variant, "EXPANDED"); assert.ok(close(zone(exp, "BASE").high, 52 - 13.82) && close(zone(exp, "EXTENDED").low, 52 - 26.18));
});

test("P-8 · Spiegelung: abwärts gerechnete Zonen sind die gespiegelten Aufwärtszonen (gleiche Formel, andere Richtung)", () => {
  const up = PJ.build(E(count("IMPULSE", [100, 120, 110, 125])), ctx(125)).primary;
  const dn = PJ.build(E(count("IMPULSE", [300, 280, 290, 275])), ctx(275, { trend: { state: "DOWN" } })).primary;
  up.zones.forEach((z, q) => { assert.ok(close(400 - z.low, dn.zones[q].high)); assert.ok(close(400 - z.high, dn.zones[q].low)); });
});

test("P-9 · Splitbereinigung und tote Reihen: Verdacht auf Split-Sprung oder unveränderter Kurs → keine Projektion", () => {
  const c = count("IMPULSE", [10, 20, 15, 22]);
  assert.equal(PJ.build(E(c, { dataQuality: { suspectedSplits: 1 } }), ctx(22)).status, "DATA_INVALID");
  assert.equal(PJ.build(E(c), ctx(22, { stalePriceBars: 8 })).status, "DATA_INVALID");
  assert.equal(PJ.build(E(c), ctx(0)).status, "DATA_INVALID");
  /* unplausibler Sprung innerhalb der Ankerwellen (nicht im Split-Verhältnis) */
  const o = PJ.build(E(c), ctx(22, { bars: { t: ["2020-01-01", "2020-01-02", "2020-01-03"], c: [10, 70, 22] } }));
  assert.equal(o.primary, null); assert.ok(o.guardrails.flags.some((f) => f.code === "ABSURD_JUMP"));
});

test("P-10 · Sehr niedriger Kurs: Zonen bleiben gültig, Hinweis auf große Prozentwerte, Anzeige drei signifikante Stellen", () => {
  const o = PJ.build(E(count("IMPULSE", [0.02, 0.05, 0.03, 0.04])), ctx(0.04)), z = zone(o.primary, "BASE");
  assert.ok(o.guardrails.flags.some((f) => f.code === "PENNY_STOCK"));
  assert.ok(close(z.low, 0.06)); assert.equal(z.display.low, 0.06); assert.equal(z.display.high, 0.0786);
});

test("P-11 · Hoher Kurs: Anzeige nach außen gerundet, keine Scheingenauigkeit", () => {
  const z = zone(PJ.build(E(count("IMPULSE", [4000, 5000, 4600, 5100])), ctx(5100)).primary, "BASE");
  assert.ok(close(z.low, 5600) && close(z.high, 6218));
  assert.equal(z.display.low, 5600); assert.equal(z.display.high, 6220);
  assert.equal(PJ.sig3(1234.5, -1), 1230); assert.equal(PJ.sig3(1234.5, 1), 1240); assert.equal(PJ.sig3(0.012345, 1), 0.0124);
});

test("P-12 · Ungültige Struktur und rechnerische Grenzen: ohne Zählung keine These, Zonen unter null entfallen, Datenfehler-Größe wird nicht gezeigt", () => {
  assert.equal(PJ.build(null, ctx(10)).status, "UNAVAILABLE");
  assert.equal(PJ.build(E(null), ctx(10)).status, "UNAVAILABLE");
  const dn = PJ.build(E(count("ZIGZAG", [100, 40, 70, 60])), ctx(60, { trend: { state: "DOWN" } })).primary;
  assert.ok(dn.zones.every((z) => z.low > 0)); assert.ok(dn.omittedTiers.some((x) => x.reason === "BELOW_ZERO"));
  const big = PJ.build(E(count("IMPULSE", [1, 5000, 2, 3])), ctx(3));
  assert.equal(big.primary, null); assert.ok(big.guardrails.flags.some((x) => x.code === "IMPLAUSIBLE_MAGNITUDE"));
});

test("P-13 · Extreme Projektion von mehreren tausend Prozent wird gezeigt, wenn die Struktur sie ergibt (groß ≠ ungültig)", () => {
  const t = PJ.build(E(count("IMPULSE", [1, 10, 2, 2.5])), ctx(2.5)).primary, x = zone(t, "EXTREME");
  assert.ok(x && close(x.high, 2 + 9 * 4.236)); assert.ok(x.pctHigh > 14, "> +1.400 %");
  assert.equal(t.status, "DEVELOPING", "Welle 3 noch nicht über dem W1-Ende");
});

test("P-14 · Alternative Motivzählung: Hochpotenzial-Alternative nur echt, regelkonform und deutlich größer; nie zur Hauptthese befördert", () => {
  const prim = count("FLAT", [30, 20, 29, 21], { complete: true, nextMove: "UP", revision: { price: 21, direction: "below", ruleId: "PATTERN_END" } });
  const alt = count("IMPULSE", [1, 21, 8, 21]);
  const o = PJ.build(E(prim, { alternatives: [alt] }), ctx(21));
  assert.equal(o.primary.type, "NEXT_MOVE"); assert.equal(o.primary.source, "PRIMARY");
  assert.equal(o.alternative.type, "WAVE_3"); assert.deepEqual(o.highUpside, { ref: "ALTERNATIVE", key: o.alternative.key }); assert.equal(o.alternative.highUpside, true);
  const bad = PJ.build(E(prim, { alternatives: [Object.assign(count("IMPULSE", [5, 15, 8, 21]), { ruleAudit: { validity: "INVALID" } })] }), ctx(21));
  assert.equal(bad.highUpside, null);
  const ending = PJ.build(E(prim, { alternatives: [count("ENDING_DIAGONAL", [1, 21, 12, 30, 20, 21])] }), ctx(21));
  assert.equal(ending.highUpside, null, "Ending Diagonal ist eine Endwelle, keine Motiv-Ausdehnung");
  const small = PJ.build(E(prim, { alternatives: [count("IMPULSE", [20, 21, 20.5, 21])] }), ctx(21));
  assert.equal(small.highUpside, null);
});

test("P-15 · Enthaltung der Engine: Projektion nur in der Fachansicht, nie für Kunden", () => {
  const o = PJ.build(E(count("IMPULSE", [10, 20, 15, 22]), { abstain: true }), ctx(22));
  assert.equal(o.status, "ABSTAIN"); assert.equal(o.consumerVisible, false); assert.ok(o.primary);
});

test("P-16 · Höherer Grad: abgeschlossene Korrektur = Welle (2) → mögliche Welle (3), Invalidation aus dem eingefrorenen Regelwerk", () => {
  const prim = count("ZIGZAG", [40, 30, 35, 28], { complete: true, nextMove: "UP", revision: { price: 28, direction: "below", ruleId: "PATTERN_END" } });
  const H = { pattern: "IMPULSE", patternName: "Impuls", current: { label: "2", direction: -1 }, waves: [{ label: "1", fromTime: "2019-01-01", toTime: "2019-06-01", fromPrice: 10, toPrice: 40, status: "CONFIRMED" }, { label: "2", fromTime: "2019-06-01", toTime: "2020-01-04", fromPrice: 40, toPrice: 28, status: "CONFIRMED" }] };
  const o = PJ.build(E(prim, { higherDegree: H }), ctx(30)), t = o.primary;
  assert.equal(t.source, "HIGHER_DEGREE"); assert.equal(t.type, "WAVE_3"); assert.equal(t.degree, "HIGHER");
  assert.ok(close(zone(t, "BASE").low, 58) && close(zone(t, "EXTREME").high, 28 + 30 * 4.236));
  assert.equal(t.invalidation.price, 10); assert.equal(t.invalidation.ruleId, "W2_NOT_BEYOND_W1_ORIGIN");
  assert.equal(t.revision.price, 28);
  assert.equal(t.subStructure.type, "NEXT_MOVE");
});

test("P-17 · Welle Y (WXY), Welle Z (Dreifach-Zigzag), Diagonale: eigene Bänder und Klassengrenzen", () => {
  const y = PJ.build(E(count("WXY", [50, 40, 46, 44])), ctx(44)).primary;
  assert.equal(y.target, "Y"); assert.ok(close(zone(y, "BASE").high, 46 - 6.18));
  const z = PJ.build(E(count("TRIPLE_ZIGZAG", [50, 40, 46, 36, 41, 39])), ctx(39)).primary;
  assert.equal(z.target, "Z"); assert.ok(close(zone(z, "BASE").high, 41 - 6.18));
  const d = PJ.build(E(count("ENDING_DIAGONAL", [10, 20, 15, 22, 18, 19])), ctx(19)).primary;
  assert.equal(d.variant, "CONTRACTING"); assert.equal(d.zones.length, 1); assert.ok(zone(d, "BASE").high <= 18 + 7 + 1e-9);
});

test("P-18 · Reproduzierbarkeit: gleiche Eingabe → byte-gleiche Ausgabe", () => {
  const c = count("IMPULSE", [10, 20, 15, 22]);
  assert.equal(JSON.stringify(PJ.build(E(c), ctx(22))), JSON.stringify(PJ.build(E(c), ctx(22))));
});

test("P-19 · Rückverfolgbarkeit: jede Stufe hat eine Beziehung mit Quelle, Klasse und Formel; Richtlinien verweisen auf das Regelwerk", () => {
  for (const [key, rows] of Object.entries(PJ.LADDERS)) for (const r of rows) {
    const rel = PJ.RELATIONSHIPS[r[3]];
    assert.ok(rel, key + ": " + r[3]);
    assert.ok(["PROJECTION_RELATIONSHIP", "GUIDELINE", "VU_OPERATIONAL"].includes(rel.class));
    assert.ok(rel.formula && rel.locator && Sources.SOURCES[rel.source], r[3]);
    if (rel.class === "GUIDELINE") assert.ok(Sources.GUIDELINES[rel.guideline.split(" ")[0]], r[3] + " → " + rel.guideline);
    assert.ok(r[1] < r[2], "Band aufsteigend");
  }
});

test("P-20 · Lebenszyklus: eingefroren, Ereignisse nur angehängt, Revision bei neuem Anker, Ungültigkeit archiviert, idempotent", () => {
  const meta = { id: "X|1W|k", symbol: "X", timeframe: "1W", role: "PRIMARY", versions: { projection: PJ.VERSION } };
  const t1 = PJ.build(E(count("IMPULSE", [10, 20, 15, 22])), ctx(22, { asOf: "2020-02-01" })).primary;
  const e1 = PJ.advanceLifecycle(null, t1, { t: [], c: [] }, "2020-02-01", meta);
  assert.equal(e1.rev, 1); assert.deepEqual(e1.events.map((x) => x.type), ["CREATED", "CONFIRMED"]);
  const bars = { t: ["2020-02-08", "2020-02-15"], c: [26, 33] };
  const e2 = PJ.advanceLifecycle(e1, t1, bars, "2020-02-15", meta);
  assert.deepEqual(e2.events.slice(2).map((x) => x.type), ["BASE_PROJECTION_REACHED", "EXTENDED_PROJECTION_REACHED"]);
  assert.deepEqual(e1.events.length, 2, "der alte Eintrag bleibt unverändert");
  assert.deepEqual(PJ.advanceLifecycle(e2, t1, bars, "2020-02-15", meta), e2, "gleicher Stand → keine Änderung");
  assert.deepEqual(e2.revisions[0].zones, e1.revisions[0].zones, "eingefrorene Zonen bleiben");
  const t2 = PJ.build(E(count("IMPULSE", [10, 20, 14, 33], { invalidation: { price: 10, direction: "below", ruleId: "W2_NOT_BEYOND_W1_ORIGIN", kind: "HARD_RULE" } })), ctx(33)).primary;
  const e3 = PJ.advanceLifecycle(e2, Object.assign({}, t2, { key: t1.key }), { t: ["2020-02-22"], c: [33] }, "2020-02-22", meta);
  assert.equal(e3.rev, 2); assert.equal(e3.revisions.length, 2); assert.deepEqual(e3.revisions[0], e2.revisions[0]);
  const e4 = PJ.advanceLifecycle(e3, t2, { t: ["2020-03-01"], c: [9] }, "2020-03-01", meta);
  assert.deepEqual(e4.events.slice(-2).map((x) => x.type), ["INVALIDATED", "ARCHIVED"]); assert.equal(e4.state, "ARCHIVED");
  const e5 = PJ.advanceLifecycle(e2, null, { t: [], c: [] }, "2020-03-08", meta);
  assert.deepEqual(e5.events.slice(-2).map((x) => x.type), ["RELABELLED", "ARCHIVED"]);
  /* Enthaltung/Datenproblem: nicht umgedeutet, weiter verfolgt, beim Wiedererscheinen markiert */
  const w1 = PJ.advanceLifecycle(e2, null, { t: ["2020-03-08"], c: [30] }, "2020-03-08", Object.assign({ withheld: true }, meta));
  assert.equal(w1.state !== "ARCHIVED", true); assert.equal(w1.events[w1.events.length - 1].type, "WITHHELD");
  const w2 = PJ.advanceLifecycle(w1, t1, { t: ["2020-03-15"], c: [31] }, "2020-03-15", meta);
  assert.equal(w2.events[w2.events.length - 1].type, "SHOWN_AGAIN"); assert.equal(w2.rev, 1);
  /* Bereits verletzte Grenze: keine These */
  const inv = PJ.build(E(count("IMPULSE", [10, 20, 15, 22], { invalidation: { price: 10, direction: "below", ruleId: "W2_NOT_BEYOND_W1_ORIGIN", kind: "HARD_RULE" } })), ctx(9));
  assert.equal(inv.primary, null); assert.ok(inv.guardrails.flags.some((f) => f.code === "INVALID_THESIS"));
});

/* ---------------- Projection Engine 1.1.0: Motiv-Alternative (nur Produkt-Sichtbarkeit) ---------------- */
const hidden = (prices, o = {}) => ({ count: Object.assign(count("IMPULSE", prices, { invalidation: { price: prices[0], direction: prices[1] > prices[0] ? "below" : "above", ruleId: "W2_NOT_BEYOND_W1_ORIGIN", kind: "HARD_RULE" } }), o), rank: 41, pool: 200, reason: null });
const corr = () => count("FLAT", [30, 20, 29, 21], { complete: true, nextMove: "UP", revision: { price: 21, direction: "below", ruleId: "PATTERN_END" } });

test("P-21 · Verborgene gültige Welle-3-Lesart wird als Alternative sichtbar – auch bei Enthaltung, nie als Hauptlesart", () => {
  const e = E(corr(), { abstain: true }); e.hiddenMotive = hidden([10, 30, 16]);
  const o = PJ.build(e, ctx(22));
  assert.equal(o.status, "ABSTAIN"); assert.equal(o.consumerVisible, false, "Hauptlesart bleibt zurückgehalten");
  assert.equal(o.motiveVisible, true); const m = o.motiveAlternative;
  assert.equal(m.source, "MOTIVE_ALTERNATIVE"); assert.equal(m.type, "WAVE_3"); assert.equal(m.status, "DEVELOPING"); assert.equal(m.clarity.level, "LOW");
  assert.equal(o.primary.source, "PRIMARY"); assert.notEqual(o.primary.key, m.key, "nie die Hauptlesart");
  assert.ok(close(zone(m, "BASE").low, 36) && close(zone(m, "EXTREME").high, 16 + 20 * 4.236), "Leiter 1,0–4,236 × W1 ab Ende W2");
  assert.equal(m.invalidation.price, 10); assert.equal(m.pool.rank, 41); assert.equal(m.highUpside, true);
  assert.ok(m.roadmap.elliott.length && m.roadmap.vu.every((x) => x.class === "VU_CONFIRMATION"));
});

test("P-22 · Ungültige oder ausgeschöpfte Kandidaten bleiben verborgen", () => {
  const a = E(corr()); a.hiddenMotive = hidden([10, 30, 16]);
  assert.equal(PJ.build(a, ctx(9)).motiveAlternative, null, "Schluss unter der harten Grenze");
  const b = E(corr()); b.hiddenMotive = hidden([10, 12, 11, 30]);
  assert.equal(PJ.build(b, ctx(60)).motiveAlternative, null, "alle Zonen schon erreicht");
  const c = E(corr(), { dataQuality: { suspectedSplits: 1 } }); c.hiddenMotive = hidden([10, 30, 16]);
  assert.equal(PJ.build(c, ctx(22)).motiveAlternative, null, "Datenfehler sperrt alles");
});

test("P-23 · Höchstens eine Welle-3-Alternative: keine Motiv-Alternative, wenn eine angezeigte Alternative schon Welle 3 ist", () => {
  const e = E(corr(), { alternatives: [count("IMPULSE", [1, 21, 8, 21])] }); e.hiddenMotive = hidden([10, 30, 16]);
  const o = PJ.build(e, ctx(21));
  assert.equal(o.alternative.type, "WAVE_3"); assert.equal(o.motiveAlternative, null);
  const shown = [o.highUpside && o.highUpside.zones ? 1 : 0, o.alternative && o.alternative.highUpside ? 1 : 0, o.motiveAlternative && o.motiveAlternative.highUpside ? 1 : 0].reduce((x, y) => x + y, 0);
  assert.ok(shown <= 1, "nur eine Hochpotenzial-Alternative");
});

test("P-24 · Keine Wahrscheinlichkeitssprache in Thesen-Texten", () => {
  const e = E(corr(), { abstain: true }); e.hiddenMotive = hidden([10, 30, 16]);
  const txt = JSON.stringify(PJ.build(e, ctx(22)));
  [/\d+\s*%\s*(Wahrscheinlichkeit|Chance)/i, /wahrscheinlich(er)? (steigt|erreicht)/i, /garantiert/i, /Kursziel/i, /probability/i].forEach((re) => assert.ok(!re.test(txt), String(re)));
});

test("P-25 · Echte Reihe (SE, Woche): Kandidat aus dem Pool der unveränderten Engine, Regeln erneut geprüft, Identität mit dem Produkt", async () => {
  const { readJson, weeklySeriesFromPoints } = await import("../../scripts/technical/lib/ti-data.mjs");
  const { analyzeProduct, PRODUCT_METHODOLOGY } = await import("../../scripts/technical/lib/ti-product.mjs");
  const { motiveCandidateFor } = await import("../../scripts/technical/lib/ti-projection.mjs");
  const Pt = require("../engines/technical/elliott/patterns.js");
  const j = readJson(new URL("../data/market/discover-series-long/ref_SE.json", import.meta.url).pathname), cut = j.points.filter((p) => p[0] <= "2026-10-02");
  const series = weeklySeriesFromPoints(cut, "SE"), out = analyzeProduct(series, { symbol: "SE" });
  const mc = motiveCandidateFor(series, out, PRODUCT_METHODOLOGY);
  assert.notEqual(mc.reason, "IDENTITY_MISMATCH");
  /* SE: Der beste Welle-3-Kandidat existiert (regelkonform), kreuzt aber eine vergleichbar starke abgeschlossene Struktur → G2 */
  assert.equal(mc.reason, "G2_HIERARCHY"); assert.ok(mc.rank > 2, "verborgen: nicht unter den angezeigten Alternativen");
  if (mc.count) {
    const legs = mc.count.waves.map((w) => ({ fromPrice: w.fromPrice, toPrice: w.toPrice, status: w.status, duration: 1 }));
    assert.equal(Pt.evaluate(mc.count.pattern, legs).valid, true, "harte Regeln erfüllt");
    assert.ok(/^(IMPULSE|LEADING_DIAGONAL)$/.test(mc.count.pattern) && (mc.count.waves.length === 2 || mc.count.waves.length === 3));
    assert.notEqual(mc.count.persistenceKey, out.res.methods.elliott.primary.persistenceKey, "nicht die Primärzählung");
  }
});
