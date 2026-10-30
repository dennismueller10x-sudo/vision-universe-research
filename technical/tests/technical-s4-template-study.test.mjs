/* S4 Vorlagen-Studie: Wochen-Naeherungen kausal, Ereignisse nur bei Wechsel, Regeln eingefroren, Ausgabe nie in generierte Daten. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { linesOf, ruleState, transitions, pctRank, RULES, NOT_TESTABLE, STUDY_VERSION, HORIZONS } from "../../scripts/technical/s4/template-study.mjs";

const dates = Array.from({ length: 260 }, (_, i) => new Date(Date.UTC(2010, 0, 8) + i * 7 * 864e5).toISOString().slice(0, 10));
const cal = new Map(dates.map((d, k) => [d, k]));
const rising = dates.map((_, i) => 10 + i * 0.1);

test("S4: Regeln sind eingefroren (Kennungen, Version) und decken die Vorlagen ab oder nennen den Grund", () => {
  assert.equal(STUDY_VERSION, "technical-s4-template-study-1.0.0");
  assert.deepEqual(RULES.map((r) => r.id), ["establishedUptrend", "uptrendBasic", "aboveSma200", "high52", "high200w"]);
  assert.deepEqual(HORIZONS, [4, 13, 26, 52]);
  const src = readFileSync(new URL("../engine/templates.js", import.meta.url), "utf8");
  const ids = [...src.matchAll(/\{ id: "([a-zA-Z0-9]+)", group: "/g)].map((m) => m[1]);
  for (const id of ids) assert.ok(RULES.some((r) => r.template === id) || NOT_TESTABLE[id], "Vorlage ohne Regel und ohne Grund: " + id);
  RULES.forEach((r) => assert.ok(r.plain.length > 10 && r.deviations.length >= 1));
});

test("S4: Linien und Zustaende kausal - Zukunft vergiften aendert keine Vergangenheit", () => {
  const L = linesOf(dates, rising, cal), i = 150;
  const before = RULES.map((r) => ruleState(r.id, L, rising, i, { rank: 80, spy26: 0 }));
  const poisoned = rising.slice(0, i + 1).concat(rising.slice(i + 1).map(() => 1));
  const L2 = linesOf(dates, poisoned, cal);
  assert.deepEqual(RULES.map((r) => ruleState(r.id, L2, poisoned, i, { rank: 80, spy26: 0 })), before);
  assert.equal(ruleState("aboveSma200", L, rising, 10, {}), null, "vor 40 Wochen keine Aussage");
  assert.equal(ruleState("high200w", L, rising, 150, {}), null, "vor 200 Wochen keine Aussage");
  assert.equal(ruleState("high200w", L, rising, 220, {}), true);
});

test("S4: Ereignis nur beim Wechsel false -> true in direkt aufeinanderfolgenden Wochen", () => {
  assert.deepEqual(transitions([null, false, true, true, false, true], [false, true, true, true, true, true]), [2, 5]);
  assert.deepEqual(transitions([false, true], [false, false]), [], "Kalenderluecke: kein Signal");
  const gapDates = dates.slice(0, 5).concat(dates.slice(6, 10));
  const L = linesOf(gapDates, gapDates.map(() => 1), cal);
  assert.equal(L.contiguous[5], false);
});

test("S4: etablierter Aufwaertstrend braucht RS-Rang >= 70, vereinfachter Trend RS > SPY", () => {
  const grow = dates.map((_, k) => 10 * Math.pow(1.01, k)), L = linesOf(dates, grow, cal), i = 200; // +68 % in 52 Wochen
  assert.equal(ruleState("establishedUptrend", L, grow, i, { rank: 70 }), true);
  assert.equal(ruleState("establishedUptrend", L, grow, i, { rank: 69.9 }), false);
  assert.equal(ruleState("establishedUptrend", L, grow, i, { rank: null }), null);
  const flat = linesOf(dates, rising, cal);
  assert.equal(ruleState("establishedUptrend", flat, rising, i, { rank: 99 }), false, "linear: weniger als 30 % ueber dem 52W-Tief");
  assert.equal(ruleState("uptrendBasic", L, grow, i, { spy26: 0 }), true);
  assert.equal(ruleState("uptrendBasic", L, grow, i, { spy26: 5 }), false);
  assert.equal(pctRank([1, 2, 3, 4, 5], 5), 100); assert.equal(pctRank([1, 2, 3, 4, 5], 1), 0); assert.equal(pctRank([1, 2, 2, 3], 2), 50);
});

test("S4: Ausgabe nur ueber --out, nie in generierte Datenordner", () => {
  const src = readFileSync(new URL("../../scripts/technical/s4/template-study.mjs", import.meta.url), "utf8");
  assert.match(src, /OUT_INSIDE_GENERATED_DATA/);
  assert.match(src, /certification: "NOT_CERTIFIED", productionApproved: false/);
  assert.doesNotMatch(src, /writeFileSync\((?!out)/, "schreibt nur --out");
});
