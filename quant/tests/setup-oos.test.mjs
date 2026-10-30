/* Setup-OOS-Auswerter (setup-oos-1.0.0): ohne freigegebene Segmentdefinition
   immer FAIL; nur mit einer in Tests uebergebenen Segmentierung PASS/FAIL.
   Kein Weg zu CERTIFIED fuer SETUP_BACKTEST ohne Owner-Freigabe.
   Unabhaengige Gegenrechnung: scripts/quant/verify-setup-oos.py. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const O = require("../engines/setup-oos.cjs");
const C = require("../engines/backtest-certification.js");
const Setup = require("../engines/setup-state-contract.js");
const root = new URL("../../", import.meta.url);
const json = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const M = json("quant/methodology/backtest-certification-v1.json");
const MIN = M.kinds.SETUP_BACKTEST.requirements.oosMinPerSegment;

function reference(input, result) {
  const script = fileURLToPath(new URL("../../scripts/quant/verify-setup-oos.py", import.meta.url));
  return JSON.parse(execFileSync("python3", ["-I", script, "--stdin"], { input: JSON.stringify({ input, result }), stdio: ["pipe", "pipe", "pipe"], encoding: "utf8" }));
}
function run(input) {
  const r = O.evaluateSetupOos(input);
  const ref = reference(input, r);
  assert.ok(ref.ok, "Python-Gegenrechnung weicht ab: " + JSON.stringify(ref.diff) + " erwartet " + JSON.stringify(ref.expected));
  return r;
}

/* Fixture: n Ereignisse ueber Tage ab start verteilt; netFn/baseFn je Index. */
function rows(n, { start = "2025-01-02", stepDays = 2, netFn = () => 0.02, baseFn = () => 0.01 } = {}) {
  const t0 = Date.parse(start + "T00:00:00Z");
  return Array.from({ length: n }, (_, i) => ({ date: new Date(t0 + Math.floor(i / 2) * stepDays * 86400000).toISOString().slice(0, 10), net: netFn(i), b: baseFn(i) === null ? null : { median: baseFn(i), positiveShare: 0.5, n: 100 } }));
}
const seg = (over = {}) => ({ id: "test-median-cut", method: "CHRONOLOGICAL_MEDIAN_EVENT_DATE", embargoDays: 0, criterion: { metric: "MEDIAN_EXCESS", rule: "POSITIVE_IN_BOTH" }, ...over });

test("Vertrag: Mindestgroesse 30 je Segment, aber keine Segmentdefinition im Methodikvertrag", () => {
  assert.equal(MIN, 30);
  assert.equal(M.kinds.SETUP_BACKTEST.oosSegmentation, undefined, "das Feld ist nur ein Vorschlag und darf nicht still im Vertrag auftauchen");
  assert.equal(O.segmentationFromMethodology(M), null);
});

test("Heute: veroeffentlichter Stand ergibt OOS_NOT_MEASURABLE_YET, Gate FAIL", () => {
  const outcomes = json("quant/data/product/setup-outcomes-v1.json");
  const completedM6 = Math.max(...["SETUP_CONFIRMED", "SETUP_NEW"].map((k) => outcomes.study[k].variants.NEXT_CLOSE.m6.status.COMPLETED));
  const r = run({ rows: null, completedCount: completedM6, minPerSegment: MIN, segmentation: O.segmentationFromMethodology(M) });
  if (completedM6 < 2 * MIN) assert.deepEqual([r.status, r.reasonCode], ["FAIL", "OOS_NOT_MEASURABLE_YET"]);
  else assert.deepEqual([r.status, r.reasonCode], ["FAIL", "OOS_SEGMENT_DEFINITION_MISSING"]);
  const cert = json("quant/data/product/backtest-certification-v1.json");
  const gate = cert.kinds.find((k) => k.id === "SETUP_BACKTEST").gates.find((g) => g.id === "oos");
  assert.equal(gate.state, "FAIL");
  assert.equal(gate.reason, r.reasonCode, "das Zertifizierungsartefakt traegt denselben Grund wie der Auswerter");
  assert.equal(gate.value, O.gateValue(r));
});

test("Nicht messbar: weniger als 2 x Mindestgroesse abgeschlossene Ergebnisse, auch mit Segmentierung", () => {
  for (const n of [0, 1, 2 * MIN - 1]) {
    assert.deepEqual([run({ rows: rows(n), minPerSegment: MIN, segmentation: null }).reasonCode], ["OOS_NOT_MEASURABLE_YET"]);
    assert.deepEqual([run({ rows: rows(n), minPerSegment: MIN, segmentation: seg() }).reasonCode], ["OOS_NOT_MEASURABLE_YET"]);
  }
  assert.equal(run({ rows: null, completedCount: 59, minPerSegment: MIN, segmentation: seg() }).reasonCode, "OOS_NOT_MEASURABLE_YET");
  /* Ungueltige Zeilen zaehlen nicht als abgeschlossen. */
  const bad = rows(2 * MIN).map((r, i) => (i % 2 ? { ...r, net: null } : r));
  assert.equal(run({ rows: bad, minPerSegment: MIN, segmentation: seg() }).reasonCode, "OOS_NOT_MEASURABLE_YET");
});

test("Ohne Segmentdefinition: genug Ergebnisse -> FAIL OOS_SEGMENT_DEFINITION_MISSING, nie PASS", () => {
  const good = rows(400, { netFn: () => 0.05, baseFn: () => 0 });
  for (const segmentation of [null, undefined]) {
    const r = run({ rows: good, minPerSegment: MIN, segmentation });
    assert.deepEqual([r.status, r.reasonCode, r.segments], ["FAIL", "OOS_SEGMENT_DEFINITION_MISSING", null]);
  }
  assert.equal(run({ rows: null, completedCount: 500, minPerSegment: MIN, segmentation: null }).reasonCode, "OOS_SEGMENT_DEFINITION_MISSING");
  /* Ein Methodikfeld ohne ausdrueckliche Freigabe wird ignoriert. */
  const unapproved = { kinds: { SETUP_BACKTEST: { oosSegmentation: seg() } } };
  assert.equal(O.segmentationFromMethodology(unapproved), null);
  assert.equal(O.segmentationFromMethodology({ kinds: { SETUP_BACKTEST: { oosSegmentation: { ...seg(), approval: { approvedBy: "", approvedAt: "2026-01-01" } } } } }), null);
  assert.equal(O.segmentationFromMethodology({ kinds: { SETUP_BACKTEST: { oosSegmentation: { ...seg(), approval: { approvedBy: "owner", approvedAt: "kein Datum" } } } } }), null);
  const approved = { kinds: { SETUP_BACKTEST: { oosSegmentation: { ...seg(), approval: { approvedBy: "owner", approvedAt: "2026-01-01" } } } } };
  assert.equal(O.segmentationFromMethodology(approved).id, "test-median-cut", "nur ein ausdruecklich freigegebenes Feld wird gelesen (synthetisch, nicht im Vertrag)");
});

test("Ungueltige Segmentierung, fehlende Zeilen, ungueltige Mindestgroesse -> FAIL", () => {
  const good = rows(200);
  for (const s of [{}, seg({ method: "ROLLING_ORIGIN" }), seg({ method: "FIXED_CALENDAR_CUT" }), seg({ cutDate: "2025-02-01" }), seg({ embargoDays: -1 }), seg({ embargoDays: 1.5 }), seg({ criterion: { metric: "MEAN", rule: "POSITIVE_IN_BOTH" } }), seg({ id: "" })])
    assert.equal(run({ rows: good, minPerSegment: MIN, segmentation: s }).reasonCode, "OOS_SEGMENT_DEFINITION_INVALID", JSON.stringify(s));
  assert.equal(run({ rows: null, completedCount: 200, minPerSegment: MIN, segmentation: seg() }).reasonCode, "OOS_ROWS_NOT_EXPORTED");
  for (const m of [0, -1, 2.5, null, "30"]) assert.equal(run({ rows: good, minPerSegment: m, segmentation: seg() }).reasonCode, "OOS_MIN_PER_SEGMENT_INVALID");
});

test("Positiv: Richtung in Lern- und Testsegment bestaetigt -> PASS (Median-Schnitt und fester Schnitt)", () => {
  const good = rows(120, { netFn: (i) => 0.03 + (i % 7) * 0.001, baseFn: () => 0.01 });
  const a = run({ rows: good, minPerSegment: MIN, segmentation: seg() });
  assert.deepEqual([a.status, a.reasonCode], ["PASS", null]);
  assert.ok(a.segments.train.n >= MIN && a.segments.test.n >= MIN);
  assert.ok(a.segments.train.to < a.segments.cutDate && a.segments.test.from >= a.segments.cutDate, "zeitlich getrennt, kein Tag in beiden Segmenten");
  const b = run({ rows: good, minPerSegment: MIN, segmentation: seg({ id: "fixed", method: "FIXED_CALENDAR_CUT", cutDate: "2025-03-01", criterion: { metric: "MEDIAN_NET", rule: "SIGN_REPLICATES" } }) });
  assert.equal(b.status, "PASS");
});

test("Negativ: Vorzeichen kippt im Test -> FAIL OOS_DIRECTION_NOT_REPLICATED", () => {
  const flip = rows(120, { netFn: (i) => (i < 60 ? 0.05 : -0.04), baseFn: () => 0 });
  const r = run({ rows: flip, minPerSegment: MIN, segmentation: seg() });
  assert.deepEqual([r.status, r.reasonCode], ["FAIL", "OOS_DIRECTION_NOT_REPLICATED"]);
  assert.ok(r.segments.train.metric > 0 && r.segments.test.metric < 0);
  /* Nur im Test positiv reicht nicht. */
  const late = rows(120, { netFn: (i) => (i < 60 ? -0.02 : 0.05), baseFn: () => 0 });
  assert.equal(run({ rows: late, minPerSegment: MIN, segmentation: seg() }).status, "FAIL");
  /* SIGN_REPLICATES: negativ in beiden ist eine bestaetigte Richtung, POSITIVE_IN_BOTH nicht. */
  const neg = rows(120, { netFn: () => -0.03, baseFn: () => 0 });
  assert.equal(run({ rows: neg, minPerSegment: MIN, segmentation: seg() }).status, "FAIL");
  assert.equal(run({ rows: neg, minPerSegment: MIN, segmentation: seg({ criterion: { metric: "MEDIAN_EXCESS", rule: "SIGN_REPLICATES" } }) }).status, "PASS");
  /* Kennzahl genau null bestaetigt keine Richtung. */
  const zero = rows(120, { netFn: () => 0.01, baseFn: () => 0.01 });
  assert.equal(run({ rows: zero, minPerSegment: MIN, segmentation: seg({ criterion: { metric: "MEDIAN_EXCESS", rule: "SIGN_REPLICATES" } }) }).reasonCode, "OOS_DIRECTION_NOT_REPLICATED");
});

test("Negativ: Embargo/Purge und fehlende Marktbasis verkleinern Segmente -> OOS_SEGMENT_TOO_SMALL", () => {
  const good = rows(120, { netFn: () => 0.05, baseFn: () => 0 });
  const r = run({ rows: good, minPerSegment: MIN, segmentation: seg({ embargoDays: 183 }) });
  assert.deepEqual([r.status, r.reasonCode], ["FAIL", "OOS_SEGMENT_TOO_SMALL"]);
  assert.ok(r.purged > 0);
  const noBase = rows(120, { netFn: () => 0.05, baseFn: (i) => (i % 3 ? null : 0) });
  assert.equal(run({ rows: noBase, minPerSegment: MIN, segmentation: seg() }).reasonCode, "OOS_SEGMENT_TOO_SMALL");
  assert.equal(run({ rows: noBase, minPerSegment: MIN, segmentation: seg({ criterion: { metric: "MEDIAN_NET", rule: "POSITIVE_IN_BOTH" } }) }).status, "PASS");
  /* Fester Schnitt hinter allen Ereignissen: leeres Testsegment. */
  assert.equal(run({ rows: good, minPerSegment: MIN, segmentation: seg({ method: "FIXED_CALENDAR_CUT", cutDate: "2030-01-01" }) }).reasonCode, "OOS_SEGMENT_TOO_SMALL");
});

test("Deterministisch und unabhaengig von der Eingabereihenfolge", () => {
  const good = rows(150, { netFn: (i) => Math.sin(i) * 0.05, baseFn: (i) => Math.cos(i) * 0.01 });
  const a = run({ rows: good, minPerSegment: MIN, segmentation: seg() });
  const b = run({ rows: good.slice().reverse(), minPerSegment: MIN, segmentation: seg() });
  assert.deepEqual(a.segments.train.metric, b.segments.train.metric);
  assert.deepEqual(a.segments.test.metric, b.segments.test.metric);
  assert.deepEqual([a.status, a.reasonCode, a.segments.cutDate], [b.status, b.reasonCode, b.segments.cutDate]);
});

test("Nie CERTIFIED fuer SETUP ohne Owner-Freigabe, auch wenn OOS und alle anderen Gates bestehen", () => {
  const setupMethod = json("quant/methodology/setup-state-v1.json");
  assert.equal(setupMethod.requirements.backtestCertification, "NOT_CERTIFIED");
  /* setup-state-contract.js erzwingt NOT_CERTIFIED an jeder Beobachtung. */
  const obs = Setup.unavailable({
    identity: { instrumentId: "vu_d57074b4128184", securityId: "ref_NVDA", ticker: "NVDA" }, observedAt: "2026-09-21T22:30:00.000Z", asOf: "2026-09-21", dataCutoff: "2026-09-20",
    technicalRef: { snapshotId: "snap_0123456789abcdef", scenarioId: "sc_0123456789abcdef", setupId: "ts_0123456789abcdef" }, evidenceRefs: ["snap_0123456789abcdef"],
    provenance: { dataMode: "real", isMock: false, source: "existing-technical-materialization", dataVersion: "dv_0123456789abcdef", methodologyVersions: { technical: "technical-v1.0.0", setupState: "setup-state-v1.0.0" }, parametersHash: "0123456789abcdef" } });
  assert.equal(obs.backtestCertification, "NOT_CERTIFIED");
  const forged = structuredClone(obs); forged.backtestCertification = "CERTIFIED";
  assert.ok(Setup.validate(forged).errors.includes("invalid backtest certification"));
  /* Ein synthetisches OOS-PASS bei sonst bestandenen Gates: die Owner-Freigabe fehlt -> WITHHELD. */
  const pass = O.evaluateSetupOos({ rows: rows(120, { netFn: () => 0.05, baseFn: () => 0 }), minPerSegment: MIN, segmentation: seg() });
  assert.equal(pass.status, "PASS");
  const cert = json("quant/data/product/backtest-certification-v1.json");
  const setup = cert.kinds.find((k) => k.id === "SETUP_BACKTEST");
  const gates = setup.gates.map((g) => C.gate(g.id, g.label, g.category, g.id === "oos" ? pass.status === "PASS" : true, g.value, g.required, g.reason));
  const owner = { required: setupMethod.requirements.backtestCertification !== "CERTIFIED", given: setupMethod.requirements.backtestCertification === "CERTIFIED" };
  const cls = C.classify({ gates, trust: "ROBUST", published: true, ownerApproval: owner, minimumTrust: setup.minimumTrust });
  assert.deepEqual([cls.status, cls.readiness, cls.reason], ["WITHHELD", "OWNER_APPROVAL_REQUIRED", "OWNER_APPROVAL_REQUIRED"]);
  assert.notEqual(setup.status, "CERTIFIED");
  assert.equal(setup.ownerApproval.given, false);
});

test("Sabotage: die Python-Gegenrechnung erkennt ein verfaelschtes Ergebnis", () => {
  const input = { rows: rows(120, { netFn: (i) => (i < 60 ? 0.05 : -0.04), baseFn: () => 0 }), minPerSegment: MIN, segmentation: seg() };
  const r = O.evaluateSetupOos(input);
  assert.ok(reference(input, r).ok);
  assert.equal(reference(input, { ...r, status: "PASS", reasonCode: null }).ok, false);
  assert.equal(reference(input, { ...r, segments: { ...r.segments, test: { ...r.segments.test, n: r.segments.test.n + 1 } } }).ok, false);
  assert.equal(reference(input, { ...r, segments: { ...r.segments, train: { ...r.segments.train, metric: r.segments.train.metric + 1e-6 } } }).ok, false);
});
