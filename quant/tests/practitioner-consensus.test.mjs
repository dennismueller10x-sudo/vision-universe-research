/* Mission VII — Konsens mehrerer Praktiker (Nachtrag 7): Unabhaengigkeit, Fenster, Duplikate, Zeitrahmen, Klassen,
   Holdout-Schutz, Freeze, Trennung von VU. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tfRelation, classifyConsensus, independentLinks, pairLevels } from "../../scripts/technical/practitioner/consensus.mjs";
import { titleMatches, tradingDaysBetween, matchCase } from "../../scripts/technical/practitioner/consensus-match.mjs";
import { openedAnchors, buildConsensus, freeze, benchmark, VERSION } from "../../scripts/technical/practitioner/run-consensus.mjs";

const map = { vuSymbol: "SPY", mappingQuality: "EXACT", levelsComparable: true, levelScale: 1 };
const ref = (id, o = {}) => Object.assign({ referenceId: id, sourceId: "s-" + id, sourceUrl: "https://example.invalid/" + id, timeframe: "1D", directionalBias: "UP",
  publication: { timestamp: "2023-01-10T10:00:00Z", timezone: "UTC" }, instrument: { vuSymbol: "SPY", asShown: "SPY" }, invalidation: { price: 90, direction: "below" }, targetZones: [{ low: 110, high: 115 }],
  primary: { pattern: "IMPULSE", family: "MOTIVE", currentWave: "3", currentWaveRole: "MOTIVE", state: "DEVELOPING", degreeRank: 1 }, status: "INCLUDED", extraction: { confidence: "HIGH" } }, o);
const mem = (r, family, role = "LINKED") => ({ ref: r, mapping: map, family, role });
const ctx = { close: 100, atr: 2 };

test("Zeitrahmen: gleich, Eltern/Kind, unvereinbar", () => {
  assert.equal(tfRelation("1D", "1D"), "SAME"); assert.equal(tfRelation("1D", "1W"), "PARENT_CHILD"); assert.equal(tfRelation("1W", "1M"), "PARENT_CHILD"); assert.equal(tfRelation("1D", "4H"), "INCOMPATIBLE");
  const p = pairLevels(ref("a"), ref("b", { timeframe: "1W", primary: { pattern: "ZIGZAG", family: "CORRECTIVE", currentWave: "C" } }), map, map, ctx);
  assert.equal(p.timeframeRelation, "PARENT_CHILD"); assert.equal(p.L3_pattern, "NOT_COMPARABLE"); assert.equal(p.L4_currentWave, "NOT_COMPARABLE");   // nur L1/L2 bei Eltern/Kind
});
test("Unabhaengigkeit: gleiche Familie wie Ausgangsfall und zweite Referenz derselben Familie zaehlen nicht", () => {
  const r = independentLinks("ewf", [{ referenceId: "x", family: "ewf" }, { referenceId: "y", family: "tiedje" }, { referenceId: "z", family: "tiedje" }, { referenceId: "w", family: "tv-a" }]);
  assert.deepEqual(r.links.map((l) => l.referenceId), ["y", "w"]);
  assert.deepEqual(r.rejected.map((l) => l.reason), ["SAME_FAMILY_AS_ANCHOR", "FAMILY_ALREADY_LINKED"]);
  assert.throws(() => classifyConsensus([mem(ref("a"), "ewf", "ANCHOR"), mem(ref("b"), "ewf")], ctx), /doppelter Quellenfamilie/);
});
test("Klassen: A stark, B teilweise, C Widerspruch, D einzeln — ohne Mehrheitsentscheid", () => {
  const A = ref("a"), sameMotive = ref("b"), corrUp = ref("c", { primary: { pattern: "ZIGZAG", family: "CORRECTIVE", currentWave: "C", currentWaveRole: "MOTIVE" } }), down = ref("d", { directionalBias: "DOWN" });
  assert.equal(classifyConsensus([mem(A, "f1", "ANCHOR")], ctx).consensusClass, "D_SINGLE");
  const s = classifyConsensus([mem(A, "f1", "ANCHOR"), mem(sameMotive, "f2")], ctx);
  assert.equal(s.consensusClass, "A_STRONG"); assert.equal(s.strength.L1_family, "1/1"); assert.equal(s.impulse.consensusImpulse, true);
  assert.equal(classifyConsensus([mem(A, "f1", "ANCHOR"), mem(corrUp, "f2")], ctx).consensusClass, "B_PARTIAL");
  /* 2 von 3 einig, einer widerspricht → Widerspruch, nicht Mehrheit */
  const c = classifyConsensus([mem(A, "f1", "ANCHOR"), mem(sameMotive, "f2"), mem(down, "f3")], ctx);
  assert.equal(c.consensusClass, "C_DISAGREEMENT"); assert.equal(c.strength.L2_scenario, "1/3"); assert.equal(c.impulse.consensusImpulse, false);
});
test("Fenster: Handelstage ohne Wochenende, Krypto Kalendertage; naechste Fundstelle je Fremdfamilie; Erweiterung nur ohne Treffer", () => {
  assert.equal(tradingDaysBetween("2023-01-06", "2023-01-09", false), 1);   // Fr → Mo
  assert.equal(tradingDaysBetween("2023-01-06", "2023-01-09", true), 3);
  const items = [{ family: "ewf", title: "SPY Elliott", date: "2023-01-11", url: "u1" }, { family: "tiedje", title: "S&P 500 Analyse", date: "2023-01-13", url: "u2" },
                 { family: "tiedje", title: "S&P 500 Update", date: "2023-01-11", url: "u3" }, { family: "tv-a", title: "Nasdaq count", date: "2023-01-10", url: "u4" }];
  const m = matchCase({ caseId: "ewf|SPY|2023-01-10|1", timeframe: "1D", sealed: false }, items, { ewf: "ewf" });
  assert.deepEqual(m.nearestPerFamily.map((h) => h.url), ["u3"]); assert.equal(m.windowTradingDays, 5);
  const far = matchCase({ caseId: "ewf|SPY|2023-01-10|1", timeframe: "1D", sealed: false }, [{ family: "tiedje", title: "SPY", date: "2023-01-20", url: "u5" }], { ewf: "ewf" });
  assert.equal(far.windowTradingDays, 10); assert.equal(far.families, 1);
  assert.equal(titleMatches("V", "Visa Inc. Elliott"), true); assert.equal(titleMatches("V", "Wave V of 5"), false);
});
test("Duplikat des Ausgangsfalls (gleiche URL) zaehlt nicht als unabhaengige Stimme", () => {
  const a = Object.assign(ref("pr_a"), { caseId: "s-pr_a|SPY|2023-01-10|1", _split: "DEVELOPMENT" }), dup = ref("pr_dup", { sourceUrl: a.sourceUrl, sourceId: "other" });
  const cases = buildConsensus({ anchors: [a], refs: [dup], links: { [a.caseId]: [{ referenceId: "pr_dup", sourceId: "other", lag: 0, windowTradingDays: 5 }] }, replay: () => ({ status: "NO" }) });
  assert.equal(cases[0].consensusClass, "D_SINGLE");
  assert.equal(cases[0].linkedNotIncluded[0].duplicate, true);
});
test("Holdout-Schutz: nur DEVELOPMENT/VALIDATION als Ausgangsfaelle", () => {
  const o = openedAnchors();
  assert.equal(o.rows.length, 35); assert.equal(o.sealedCaseIds.length, 43);
  assert.ok(o.rows.every((r) => ["DEVELOPMENT", "VALIDATION"].includes(r._split)));
});
test("Freeze deterministisch, ohne VU-Felder; Auswertung verweigert manipulierten Freeze", () => {
  const d = mkdtempSync(join(tmpdir(), "vu-cons-")), r1 = freeze({ outDir: d, now: "T" }), r2 = freeze({ outDir: d, now: "T" });
  assert.equal(r1.manifest.sha256, r2.manifest.sha256);
  const text = readFileSync(join(d, VERSION + ".jsonl"), "utf8");
  assert.ok(!/"vuStatus"|"vuPattern"|"engineVersion"/.test(text));
  writeFileSync(join(d, VERSION + ".jsonl"), text.replace("D_SINGLE", "A_STRONG"));
  assert.throws(() => benchmark({ freezeDir: d, outFile: join(d, "b.json") }), /SHA-256/);
});
