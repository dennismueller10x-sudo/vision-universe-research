/* Setup-OOS A1-A6 (FV-6): Auswertung je Ereignisart (A4) und Messbarkeit.
   Synthetische Faelle je Kriterium (besteht / scheitert), Gegenrechnung je
   Art mit scripts/quant/verify-setup-oos.py, Bericht und Builder nur nach tmp. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const O = require("../engines/setup-oos.cjs");
const S = require("../engines/setup-oos-segments.js");
const M = JSON.parse(fs.readFileSync(path.join(ROOT, "quant/methodology/backtest-certification-v1.json"), "utf8"));
const MIN = M.kinds.SETUP_BACKTEST.requirements.oosMinPerSegment;
const REPORT = path.join(ROOT, "scripts/quant/research/setup-oos-report.mjs");
const BUILDER = path.join(ROOT, "scripts/quant/build-backtest-certification.mjs");
const VERIFY = path.join(ROOT, "scripts/quant/verify-setup-oos.py");
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const add = (d, n) => iso(Date.parse(d + "T00:00:00Z") + n * DAY);

/* Wochentage ab start, n Tage, perDay Zeilen je Tag. */
function weekdays(start, n) {
  const out = []; let d = start;
  while (out.length < n) { const w = new Date(d + "T00:00:00Z").getUTCDay(); if (w !== 0 && w !== 6) out.push(d); d = add(d, 1); }
  return out;
}
function rowsOn(days, { perDay = 3, net = 0.03, base = 0.01 } = {}) {
  return days.flatMap((d) => Array.from({ length: perDay }, (_, i) => ({ date: d, net: typeof net === "function" ? net(d, i) : net + i * 1e-4, b: base === null ? null : { median: base } })));
}
/* Vorlage A1-A6: Schnitt 2027-05-31, Embargo 183, EVENT_DAY, MEDIAN_EXCESS + SIGN_REPLICATES, beide Arten, NEXT_CLOSE, m6. */
const PROPOSAL = { id: "fixture-2027-05-31", method: "FIXED_CALENDAR_CUT", cutDate: "2027-05-31", embargoDays: 183, countBy: "EVENT_DAY",
  criterion: { metric: "MEDIAN_EXCESS", rule: "SIGN_REPLICATES" }, population: { eventKinds: ["SETUP_NEW", "SETUP_CONFIRMED"], entryVariant: "NEXT_CLOSE", horizon: "m6" } };
const seg = (over = {}) => ({ ...PROPOSAL, ...over, criterion: { ...PROPOSAL.criterion, ...(over.criterion || {}) }, population: over.population === undefined ? PROPOSAL.population : over.population });
const TRAIN_DAYS = weekdays("2026-09-24", 40);   /* alle vor 2026-11-29 (Schnitt - Embargo) */
const TEST_DAYS = weekdays("2027-05-31", 40);
const doc = (byKind) => ({ schemaVersion: "setup-oos-rows-1.0.0", asOf: "2028-06-30", returnType: "TOTAL_RETURN",
  rows: Object.fromEntries(Object.entries(byKind).map(([k, list]) => [k, { NEXT_CLOSE: { m6: list } }])) });
const good = () => rowsOn([...TRAIN_DAYS, ...TEST_DAYS]);

function reference(input, result) {
  return JSON.parse(execFileSync("python3", ["-I", VERIFY, "--stdin"], { input: JSON.stringify({ input, result }), stdio: ["pipe", "pipe", "pipe"], encoding: "utf8" }));
}
/* Jede Art einzeln gegen die unabhaengige Python-Gegenrechnung. */
function run(input) {
  const r = S.evaluateByEventKind(input);
  for (const [k, kr] of Object.entries(r.byKind || {})) {
    const p = input.segmentation.population;
    const rows = input.rowsDoc && input.rowsDoc.rows[k] && input.rowsDoc.rows[k][p.entryVariant] ? input.rowsDoc.rows[k][p.entryVariant][p.horizon] || null : null;
    const s = { ...input.segmentation }; delete s.population;
    const ref = reference({ rows, completedCount: (input.completedByKind || {})[k] || 0, minPerSegment: input.minPerSegment, segmentation: s }, kr);
    assert.ok(ref.ok, k + ": Python-Gegenrechnung weicht ab: " + JSON.stringify(ref.diff));
  }
  return r;
}

test("Vertrag unveraendert: oosMinPerSegment 30, keine Segmentierung im Methodikvertrag", () => {
  assert.equal(MIN, 30);
  assert.equal(M.kinds.SETUP_BACKTEST.oosSegmentation, undefined);
  assert.equal(O.segmentationFromMethodology(M), null);
});

test("PASS: genug Historie, beide Arten replizieren die Richtung", () => {
  const r = run({ segmentation: seg(), rowsDoc: doc({ SETUP_NEW: good(), SETUP_CONFIRMED: good() }), minPerSegment: MIN });
  assert.equal(r.status, "PASS"); assert.equal(r.reasonCode, null);
  assert.equal(O.gateValue(r), "im Testzeitraum bestätigt (fixture-2027-05-31)");
  for (const k of ["SETUP_NEW", "SETUP_CONFIRMED"]) {
    const t = r.byKind[k].segments;
    assert.equal(t.cutDate, "2027-05-31"); assert.equal(t.train.n, 40); assert.equal(t.test.n, 40); assert.equal(t.train.nRows, 120);
    assert.ok(t.train.metric > 0 && t.test.metric > 0);
  }
});

test("A1 Segmentierung: unbekannte Methode und Schnitt nach allen Ereignissen scheitern", () => {
  const d = doc({ SETUP_NEW: good(), SETUP_CONFIRMED: good() });
  assert.equal(run({ segmentation: seg({ method: "WALK_FORWARD" }), rowsDoc: d, minPerSegment: MIN }).reasonCode, "OOS_SEGMENT_DEFINITION_INVALID");
  assert.equal(run({ segmentation: seg({ cutDate: "2027-31-05" }), rowsDoc: d, minPerSegment: MIN }).reasonCode, "OOS_SEGMENT_DEFINITION_INVALID");
  const late = run({ segmentation: seg({ cutDate: "2029-01-01" }), rowsDoc: d, minPerSegment: MIN });
  assert.equal(late.reasonCode, "OOS_SEGMENT_TOO_SMALL"); assert.equal(late.byKind.SETUP_NEW.segments.test.n, 0);
});

test("A2 Embargo: Lernereignisse im Fenster vor dem Schnitt fallen weg", () => {
  /* Lernereignisse 2027-01-04 ff. liegen weniger als 183 Tage vor dem Schnitt. */
  const near = rowsOn([...weekdays("2027-01-04", 40), ...TEST_DAYS]);
  const d = doc({ SETUP_NEW: near, SETUP_CONFIRMED: near });
  const r = run({ segmentation: seg(), rowsDoc: d, minPerSegment: MIN });
  assert.equal(r.reasonCode, "OOS_SEGMENT_TOO_SMALL"); assert.equal(r.byKind.SETUP_NEW.segments.train.n, 0); assert.equal(r.byKind.SETUP_NEW.purged, 120);
  assert.equal(run({ segmentation: seg({ embargoDays: 0 }), rowsDoc: d, minPerSegment: MIN }).status, "PASS");
  assert.equal(run({ segmentation: seg({ embargoDays: -1 }), rowsDoc: d, minPerSegment: MIN }).reasonCode, "OOS_SEGMENT_DEFINITION_INVALID");
});

test("A3 Kriterium: Vorzeichenwechsel im Test scheitert; SIGN_REPLICATES gegen POSITIVE_IN_BOTH", () => {
  const flip = rowsOn([...TRAIN_DAYS, ...TEST_DAYS], { net: (d) => (d >= "2027-05-31" ? -0.02 : 0.03) });
  const r = run({ segmentation: seg(), rowsDoc: doc({ SETUP_NEW: flip, SETUP_CONFIRMED: good() }), minPerSegment: MIN });
  assert.equal(r.status, "FAIL"); assert.equal(r.reasonCode, "OOS_DIRECTION_NOT_REPLICATED");
  const neg = rowsOn([...TRAIN_DAYS, ...TEST_DAYS], { net: -0.02 });
  const d = doc({ SETUP_NEW: neg, SETUP_CONFIRMED: neg });
  assert.equal(run({ segmentation: seg(), rowsDoc: d, minPerSegment: MIN }).status, "PASS", "negatives Vorzeichen repliziert");
  assert.equal(run({ segmentation: seg({ criterion: { rule: "POSITIVE_IN_BOTH" } }), rowsDoc: d, minPerSegment: MIN }).reasonCode, "OOS_DIRECTION_NOT_REPLICATED");
  /* MEDIAN_EXCESS ohne Marktbasis: keine auswertbaren Zeilen. */
  const nob = rowsOn([...TRAIN_DAYS, ...TEST_DAYS], { base: null });
  assert.equal(run({ segmentation: seg(), rowsDoc: doc({ SETUP_NEW: nob, SETUP_CONFIRMED: nob }), minPerSegment: MIN }).reasonCode, "OOS_SEGMENT_TOO_SMALL");
  assert.equal(run({ segmentation: seg({ criterion: { metric: "MEDIAN_NET" } }), rowsDoc: doc({ SETUP_NEW: nob, SETUP_CONFIRMED: nob }), minPerSegment: MIN }).status, "PASS");
});

test("A4 je Ereignisart: eine scheiternde Art laesst das Gate scheitern; Population wird geprueft", () => {
  const thin = rowsOn([...TRAIN_DAYS.slice(0, 10), ...TEST_DAYS]);
  const r = run({ segmentation: seg(), rowsDoc: doc({ SETUP_NEW: good(), SETUP_CONFIRMED: thin }), minPerSegment: MIN });
  assert.equal(r.status, "FAIL"); assert.equal(r.reasonCode, "OOS_SEGMENT_TOO_SMALL");
  assert.equal(r.byKind.SETUP_NEW.status, "PASS"); assert.equal(r.byKind.SETUP_CONFIRMED.reasonCode, "OOS_SEGMENT_TOO_SMALL");
  /* Nur SETUP_NEW freigegeben: die duenne Art zaehlt nicht. */
  const only = run({ segmentation: seg({ population: { ...PROPOSAL.population, eventKinds: ["SETUP_NEW"] } }), rowsDoc: doc({ SETUP_NEW: good(), SETUP_CONFIRMED: thin }), minPerSegment: MIN });
  assert.equal(only.status, "PASS"); assert.deepEqual(Object.keys(only.byKind), ["SETUP_NEW"]);
  /* Frueheste Stufe gewinnt: fehlende Zeilen einer Art vor zu kleinem Segment der anderen. */
  const miss = run({ segmentation: seg(), rowsDoc: doc({ SETUP_NEW: thin }), minPerSegment: MIN, completedByKind: { SETUP_NEW: 0, SETUP_CONFIRMED: 500 } });
  assert.equal(miss.byKind.SETUP_CONFIRMED.reasonCode, "OOS_ROWS_NOT_EXPORTED"); assert.equal(miss.reasonCode, "OOS_ROWS_NOT_EXPORTED");
  for (const p of [null, { eventKinds: [], entryVariant: "NEXT_CLOSE", horizon: "m6" }, { eventKinds: ["SETUP_WEAKENED"], entryVariant: "NEXT_CLOSE", horizon: "m6" },
    { eventKinds: ["SETUP_NEW", "SETUP_NEW"], entryVariant: "NEXT_CLOSE", horizon: "m6" }, { eventKinds: ["SETUP_NEW"], entryVariant: "OPEN", horizon: "m6" }, { eventKinds: ["SETUP_NEW"], entryVariant: "NEXT_CLOSE", horizon: "m2" }])
    assert.equal(S.evaluateByEventKind({ segmentation: { ...PROPOSAL, population: p }, rowsDoc: null, minPerSegment: MIN }).reasonCode, "OOS_SEGMENT_DEFINITION_INVALID", JSON.stringify(p));
  assert.equal(S.evaluateByEventKind({ segmentation: null, rowsDoc: null, minPerSegment: MIN }).reasonCode, "OOS_SEGMENT_DEFINITION_MISSING");
  assert.equal(S.evaluateByEventKind({ segmentation: seg(), rowsDoc: null, minPerSegment: 0 }).reasonCode, "OOS_MIN_PER_SEGMENT_INVALID");
});

test("A5 effektiv: viele Zeilen an wenigen Ereignistagen reichen nicht", () => {
  const clustered = rowsOn([...TRAIN_DAYS.slice(0, 5), ...TEST_DAYS.slice(0, 5)], { perDay: 90 });
  const d = doc({ SETUP_NEW: clustered, SETUP_CONFIRMED: clustered });
  const r = run({ segmentation: seg(), rowsDoc: d, minPerSegment: MIN });
  assert.equal(r.reasonCode, "OOS_SEGMENT_TOO_SMALL"); assert.equal(r.byKind.SETUP_NEW.segments.train.n, 5); assert.equal(r.byKind.SETUP_NEW.segments.train.nRows, 450);
  const raw = { ...seg() }; delete raw.countBy;
  assert.equal(run({ segmentation: raw, rowsDoc: d, minPerSegment: MIN }).status, "PASS", "roh taeuscht die Mindestgroesse vor");
});

test("A6 Zeilen: ohne Export kein Schnitt, unbekanntes Schema bricht ab", () => {
  assert.equal(run({ segmentation: seg(), rowsDoc: null, minPerSegment: MIN, completedByKind: { SETUP_NEW: 0, SETUP_CONFIRMED: 0 } }).reasonCode, "OOS_NOT_MEASURABLE_YET");
  assert.equal(run({ segmentation: seg(), rowsDoc: null, minPerSegment: MIN, completedByKind: { SETUP_NEW: 200, SETUP_CONFIRMED: 80 } }).reasonCode, "OOS_ROWS_NOT_EXPORTED");
  assert.throws(() => S.evaluateByEventKind({ segmentation: seg(), rowsDoc: { schemaVersion: "x", rows: {} }, minPerSegment: MIN }), /SETUP_OOS_ROWS_SCHEMA_UNKNOWN/);
  /* Heute: M6-Zeilen leer -> nicht messbar. */
  assert.equal(run({ segmentation: seg(), rowsDoc: doc({ SETUP_NEW: [], SETUP_CONFIRMED: [] }), minPerSegment: MIN }).reasonCode, "OOS_NOT_MEASURABLE_YET");
});

test("Messbarkeit: Vorlage 2027-05-31 fruehestens 2028-01-08; zu frueher Schnitt erreicht das Minimum nie", () => {
  const today = weekdays("2026-09-24", 27).filter((d) => d <= "2026-10-30");
  const dates = today.flatMap((d) => [d, d, d]);
  const r = S.projectReadiness({ eventDates: dates, asOf: "2026-10-30", segmentation: seg(), minPerSegment: MIN });
  assert.equal(r.state, "INSUFFICIENT_HISTORY"); assert.equal(r.trainEventsBefore, "2026-11-29");
  assert.equal(r.train.observed.eventDays, 27); assert.equal(r.train.projected, true);
  assert.equal(r.test.minReachedOn, "2027-07-09"); assert.equal(r.test.measurableFrom, "2028-01-08"); assert.equal(r.earliestMeasurable, "2028-01-08");
  /* Tabelle 1 der Vorlage: Schnitt 2027-03-31 laesst nur Ereignisse bis 2026-09-28 ins Lernen. */
  const early = S.projectReadiness({ eventDates: dates, asOf: "2026-10-30", segmentation: seg({ cutDate: "2027-03-31" }), minPerSegment: MIN });
  assert.equal(early.state, "CANNOT_REACH_MIN"); assert.equal(early.train.observed.eventDays, 3); assert.equal(early.earliestMeasurable, null);
  /* Roh gezaehlt waere das Minimum mit 3 Zeilen je Tag schon nach 10 Tagen erreicht. */
  const raw = { ...seg() }; delete raw.countBy;
  assert.equal(S.projectReadiness({ eventDates: dates, asOf: "2026-10-30", segmentation: raw, minPerSegment: MIN }).test.minReachedOn, "2027-06-11");
  /* Genug Historie: gemessen statt geschaetzt. */
  const full = [...TRAIN_DAYS, ...TEST_DAYS];
  const m = S.projectReadiness({ eventDates: full, asOf: "2028-06-30", segmentation: seg(), minPerSegment: MIN });
  assert.equal(m.state, "MEASURABLE"); assert.equal(m.test.projected, false); assert.equal(m.test.state, "MATURE"); assert.equal(m.earliestMeasurable, add(TEST_DAYS[29], 183));
  assert.equal(S.projectReadiness({ eventDates: dates, asOf: "2026-10-30", segmentation: seg({ method: "CHRONOLOGICAL_MEDIAN_EVENT_DATE", cutDate: undefined }), minPerSegment: MIN }).state, "NOT_PROJECTABLE");
});

test("Bericht: echter Stand aus den committeten Artefakten, Gate wie im Zertifizierungsartefakt", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "setup-oos-report-"));
  const out = path.join(dir, "report.json");
  execFileSync(process.execPath, [REPORT, "--out", out], { stdio: "pipe" });
  const r = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.equal(r.schemaVersion, "setup-oos-report-1.0.0"); assert.equal(r.gateInput, false); assert.equal(r.productionApproved, false);
  assert.equal(r.segmentation.status, "PROPOSAL_NOT_APPROVED");
  assert.deepEqual(Object.keys(r.decisions), ["A1", "A2", "A3", "A4", "A5", "A6"]);
  assert.equal(r.gate.certificationArtifact.matches, true, "gleicher Grund wie im Zertifizierungsartefakt");
  if (r.gate.completedM6 < 2 * MIN) { assert.equal(r.gate.reasonCode, "OOS_NOT_MEASURABLE_YET"); assert.notEqual(r.state, "MEASURED_PASS"); }
  if (r.asOf < "2027-05-31") { assert.equal(r.earliestMeasurable, "2028-01-08"); assert.equal(r.state, "INSUFFICIENT_HISTORY"); }
  /* Fixture mit Zeilen: der Bericht wertet je Art aus, ohne Freigabe. */
  const outcomes = { schemaVersion: "setup-outcomes-1.0.0", asOf: "2028-06-30", returnType: "TOTAL_RETURN", history: {}, transitions: {},
    events: [...TRAIN_DAYS, ...TEST_DAYS].flatMap((d) => [["AAA", "SETUP_NEW", d], ["BBB", "SETUP_CONFIRMED", d]]),
    study: { SETUP_NEW: { variants: { NEXT_CLOSE: { m6: { status: { COMPLETED: 240 } } } } }, SETUP_CONFIRMED: { variants: { NEXT_CLOSE: { m6: { status: { COMPLETED: 240 } } } } } } };
  fs.writeFileSync(path.join(dir, "outcomes.json"), JSON.stringify(outcomes));
  fs.writeFileSync(path.join(dir, "rows.json"), JSON.stringify(doc({ SETUP_NEW: good(), SETUP_CONFIRMED: good() })));
  execFileSync(process.execPath, [REPORT, "--outcomes", path.join(dir, "outcomes.json"), "--rows", path.join(dir, "rows.json"), "--certification", path.join(dir, "missing.json"), "--out", out], { stdio: "pipe" });
  const f = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.equal(f.evaluation.status, "PASS"); assert.equal(f.state, "MEASURED_PASS"); assert.equal(f.readiness.SETUP_NEW.state, "MEASURABLE");
  assert.equal(f.gate.reasonCode, "OOS_SEGMENT_DEFINITION_MISSING", "das Gate selbst bleibt ohne Freigabe FAIL");
  assert.equal(f.gate.certificationArtifact, null);
  assert.throws(() => execFileSync(process.execPath, [REPORT, "--out", path.join(ROOT, "quant/data/product/setup-oos-report.json")], { stdio: "pipe" }), /REPORT_OUT_INSIDE_QUANT_DATA/);
  assert.equal(fs.existsSync(path.join(ROOT, "quant/data/product/setup-oos-report.json")), false);
});

test("Builder: ohne freigegebene Segmentierung aendert --oos-rows nichts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "setup-oos-cert-"));
  fs.writeFileSync(path.join(dir, "rows.json"), JSON.stringify(doc({ SETUP_NEW: good(), SETUP_CONFIRMED: good() })));
  execFileSync(process.execPath, [BUILDER, "--out", path.join(dir, "a.json")], { stdio: "pipe" });
  execFileSync(process.execPath, [BUILDER, "--out", path.join(dir, "b.json"), "--oos-rows", path.join(dir, "rows.json")], { stdio: "pipe" });
  const strip = (p) => { const j = JSON.parse(fs.readFileSync(p, "utf8")); delete j.generatedAt; delete j.asOf; return j; };
  const a = strip(path.join(dir, "a.json"));
  assert.deepEqual(strip(path.join(dir, "b.json")), a);
  const setup = a.kinds.find((k) => k.id === "SETUP_BACKTEST");
  assert.equal(setup.oosByKind, undefined);
  assert.equal(setup.gates.find((g) => g.id === "oos").reason, "OOS_NOT_MEASURABLE_YET");
});
