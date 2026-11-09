/* Entscheidung FV-1: Die Setup-Schwelle independentWeeks heisst
   eventCalendarMonths. Nur der Name aendert sich: Wert 20, Zaehlung
   (verschiedene JJJJ-MM der Ereignisdaten), Gate-ID, Label, Grund und
   Status bleiben gleich. Ein Vertrag mit dem alten Namen wird als Alias
   gelesen; ein Widerspruch zwischen beiden bricht ab. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const C = require("../engines/backtest-certification.js");
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const M = json("quant/methodology/backtest-certification-v1.json");
const SETUP = M.kinds.SETUP_BACKTEST;

test("Vertrag: eventCalendarMonths 20, der alte Name nur noch als Alias", () => {
  assert.equal(SETUP.requirements.eventCalendarMonths, 20);
  assert.equal("independentWeeks" in SETUP.requirements, false);
  assert.deepEqual(SETUP.legacyRequirementAliases, { independentWeeks: "eventCalendarMonths" });
  assert.match(SETUP.requirementNotes.eventCalendarMonths, /Kalendermonate/);
  /* uebrige Schwellen unveraendert */
  assert.deepEqual({ ...SETUP.requirements, eventCalendarMonths: undefined },
    { historyDates: 120, historySpanDays: 180, completedOutcomesM6: 100, titles: 20, eventCalendarMonths: undefined, oosMinPerSegment: 30 });
});

test("requirement(): neuer Name, alter Name als Alias, Widerspruch und Fehlen brechen ab", () => {
  const aliases = SETUP.legacyRequirementAliases;
  assert.equal(C.requirement({ eventCalendarMonths: 20 }, "eventCalendarMonths", aliases), 20);
  assert.equal(C.requirement({ independentWeeks: 20 }, "eventCalendarMonths", aliases), 20, "Vertrag 1.0.0 mit altem Namen");
  assert.equal(C.requirement({ independentWeeks: 20, eventCalendarMonths: 20 }, "eventCalendarMonths", aliases), 20);
  assert.throws(() => C.requirement({ independentWeeks: 19, eventCalendarMonths: 20 }, "eventCalendarMonths", aliases), /contradicts/);
  assert.throws(() => C.requirement({}, "eventCalendarMonths", aliases), /missing/);
  assert.throws(() => C.requirement({ independentWeeks: 20 }, "eventCalendarMonths", {}), /missing/, "ohne Alias kein stiller Ersatz");
});

test("Erzeuger mit --out: Gate independence wie vor FV-1 (Wert, Schwelle, Zustand, Grund), kein Schluesselname im Artefakt", () => {
  const dir = mkdtempSync(join(tmpdir(), "vu-cert-fv1-"));
  try {
    const out = join(dir, "cert.json");
    execFileSync(process.execPath, [join(ROOT, "scripts/quant/build-backtest-certification.mjs"), "--out", out], { stdio: "pipe" });
    const text = readFileSync(out, "utf8"), doc = JSON.parse(text);
    assert.deepEqual(C.certificationViolations(doc), []);
    /* Zaehlung vor FV-1, unabhaengig nachgerechnet: verschiedene JJJJ-MM, Schwelle aus dem alten Vertragsnamen */
    const outcomes = json("quant/data/product/setup-outcomes-v1.json");
    const legacyCount = new Set(outcomes.events.map((e) => e[2].slice(0, 7))).size;
    const legacyRequired = C.requirement({ ...SETUP.requirements, eventCalendarMonths: undefined, independentWeeks: 20 }, "eventCalendarMonths", SETUP.legacyRequirementAliases);
    const g = doc.kinds.find((k) => k.id === "SETUP_BACKTEST").gates.find((x) => x.id === "independence");
    assert.deepEqual(g, { id: "independence", label: "verschiedene Monate mit Ereignissen", category: "HISTORY",
      state: legacyCount >= legacyRequired ? "PASS" : "FAIL", value: legacyCount, required: legacyRequired,
      reason: legacyCount >= legacyRequired ? null : "EVENTS_CLUSTERED_IN_TIME" });
    /* Konsumenten (UI, Vorschau, Worker) lesen die Gate-ID, nie den Schwellennamen */
    assert.doesNotMatch(text, /independentWeeks|eventCalendarMonths/);
    assert.deepEqual(doc.kinds.map((k) => k.id), ["SAME_STOCK_REPLAY", "PATTERN_EVIDENCE", "SIGNAL_BACKTEST", "SETUP_BACKTEST", "STRATEGY_BACKTEST", "FACTOR_RANKING_BACKTEST"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Erzeuger liest die Schwelle nur ueber requirement() mit Alias", () => {
  const src = readFileSync(join(ROOT, "scripts/quant/build-backtest-certification.mjs"), "utf8");
  assert.doesNotMatch(src, /req\.independentWeeks|eventWeeks/);
  assert.match(src, /C\.requirement\(req, "eventCalendarMonths", M\.kinds\.SETUP_BACKTEST\.legacyRequirementAliases\)/);
  assert.match(src, /const eventCalendarMonths = new Set\(outcomes\.events\.map\(\(e\) => e\[2\]\.slice\(0, 7\)\)\)\.size;/);
});
