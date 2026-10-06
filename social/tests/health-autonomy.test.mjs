/* =========================================================================
   VU SOCIAL — HEALTH MATRIX, AUTONOMIE, ERKLAERBARKEIT UND KONFIGURATION
   (§16, §31, §32, §41, §45, §56)

   Der Kern dieser Datei ist H6: eine Autonomiestufe ist ein ERGEBNIS,
   kein Eintrag. Wer 4 konfiguriert, waehrend die Analytics-Kette nichts
   liefert, bekommt die Stufe, die der gemessene Zustand hergibt.

   Dazu die Probe aufs Exempel (H10): die tatsaechlich im Repository
   liegende Konfiguration wird gelesen und geprueft. Ein Test gegen
   erfundene Konfiguration wuerde nicht bemerken, wenn jemand den globalen
   Autopublish-Schalter versehentlich einschaltet.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Health = require("../engines/health.js");
const Autonomy = require("../engines/autonomy.js");
const Explain = require("../engines/explain.js");
const KillSwitch = require("../engines/kill-switch.js");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOW = "2026-09-15T12:00:00Z";
const readConfig = (name) => JSON.parse(readFileSync(join(ROOT, "social", "config", name), "utf8"));

/* ------------------------------------------------------ Health Matrix */

test("H1 · Jede Komponente erscheint im Bericht — auch die, ueber die nichts bekannt ist", () => {
  const matrix = Health.buildMatrix({}, { now: NOW });
  assert.equal(matrix.rows.length, Health.COMPONENTS.length);
  for (const row of matrix.rows) {
    assert.equal(row.state, "UNAVAILABLE");
    assert.ok(row.failureMode, "Ein UNAVAILABLE ohne Grund erzeugt Rateversuche statt Behebung");
    assert.ok(row.nextAction);
  }
});

test("H2 · 'Nie gelaufen' ist UNAVAILABLE, nicht FAIL", () => {
  assert.equal(Health.deriveState({ lastSuccessAt: null }, { now: NOW }).state, "UNAVAILABLE");
  assert.equal(Health.deriveState({ configured: false }, { now: NOW }).state, "UNAVAILABLE");
  assert.equal(Health.deriveState({ lastSuccessAt: NOW, lastError: "kaputt" }, { now: NOW }).state, "FAIL");
});

test("H3 · Ein ueberfaelliger Lauf ist WARNING, ein frischer PASS", () => {
  assert.equal(Health.deriveState({ lastSuccessAt: "2026-09-15T11:00:00Z" }, { now: NOW }).state, "PASS");
  const stale = Health.deriveState({ lastSuccessAt: "2026-09-10T11:00:00Z" }, { now: NOW });
  assert.equal(stale.state, "WARNING");
  assert.match(stale.reason, /Frist/);
});

test("H4 · Zwei gruene von siebzehn Komponenten sind kein gruenes System", () => {
  const matrix = Health.buildMatrix({
    "content.pipeline": { lastSuccessAt: NOW },
    killSwitch: { lastSuccessAt: NOW }
  }, { now: NOW });
  assert.equal(matrix.overall, "UNAVAILABLE",
    "PASS setzt voraus, dass das System ueberwiegend eingerichtet IST (§45)");
  assert.match(matrix.explanation, /Noch nicht eingerichtet/);
});

test("H5 · Ein einziges FAIL faerbt den Gesamtzustand", () => {
  const inputs = {};
  for (const c of Health.COMPONENTS) inputs[c.id] = { lastSuccessAt: NOW };
  assert.equal(Health.buildMatrix(inputs, { now: NOW }).overall, "PASS");

  inputs["providers.analytics"] = { lastSuccessAt: NOW, lastError: "Schema geaendert" };
  const failed = Health.buildMatrix(inputs, { now: NOW });
  assert.equal(failed.overall, "FAIL");
  assert.match(failed.explanation, /Kennzahlenabruf/);
});

/* ---------------------------------------------------------- Autonomie */

test("H6 · Eine Autonomiestufe ist ein Ergebnis, kein Eintrag", () => {
  const wishful = Autonomy.effectiveLevel(4, {
    signalsAvailable: true, contentPipelineHealthy: true
  });
  assert.equal(wishful.desired, 4);
  assert.equal(wishful.effective, 2);
  assert.equal(wishful.capped, true);
  assert.ok(wishful.missing.length >= 2);
  assert.match(wishful.explanation, /wirksam ist Stufe 2/);
});

test("H7 · Ein fehlendes Bereitschaftsmerkmal gilt als NICHT erfuellt", () => {
  /* Weder true noch false, sondern gar nicht vorhanden. */
  const res = Autonomy.effectiveLevel(1, {});
  assert.equal(res.effective, 0);
  const halfTruth = Autonomy.effectiveLevel(1, { signalsAvailable: "vermutlich" });
  assert.equal(halfTruth.effective, 0, "Nur genau true zaehlt");
});

test("H8 · Stufe 4 verlangt Kill Switch und Rollback — nicht nur gute Laune", () => {
  const required = Autonomy.REQUIREMENTS[4];
  assert.ok(required.includes("killSwitchPresent"));
  assert.ok(required.includes("rollbackPresent"));
  assert.ok(required.includes("analyticsCorrect"));
  assert.ok(required.includes("factValidationHealthy"));

  const full = {};
  for (const req of Autonomy.REQUIREMENTS[5]) full[req] = true;
  assert.equal(Autonomy.effectiveLevel(5, full).effective, 5);
  assert.equal(Autonomy.allowsUnattendedPublish(5), true);
  assert.equal(Autonomy.allowsUnattendedPublish(3), false);
  assert.equal(Autonomy.allowsAutoSchedule(3), true);
  assert.equal(Autonomy.allowsAutoDraft(1), false);
});

test("H9 · Die Health Matrix speist die Bereitschaft — die Kette schliesst sich", () => {
  const inputs = {};
  for (const c of Health.COMPONENTS) inputs[c.id] = { lastSuccessAt: NOW };
  const readiness = Health.toAutonomyReadiness(Health.buildMatrix(inputs, { now: NOW }),
    { rollbackPresent: true, learningValidated: true, experimentsValidated: true });

  assert.equal(readiness.signalsAvailable, true);
  assert.equal(readiness.publishingStable, true);
  assert.equal(Autonomy.effectiveLevel(5, readiness).effective, 5);

  /* Faellt die Analytics-Kette aus, faellt die Stufe. */
  inputs["providers.analytics"] = { lastSuccessAt: null };
  const degraded = Health.toAutonomyReadiness(Health.buildMatrix(inputs, { now: NOW }),
    { rollbackPresent: true, learningValidated: true, experimentsValidated: true });
  assert.equal(degraded.analyticsCorrect, false);
  assert.ok(Autonomy.effectiveLevel(5, degraded).effective < 4);
});

/* ------------------------------------------------- Echte Konfiguration */

test("H10 · Die ausgelieferte Konfiguration hat Autopublish AUS", () => {
  const config = readConfig("kill-switch.json");
  assert.equal(config.gates.GLOBAL_AUTOPUBLISH.enabled, false,
    "Autonome Veroeffentlichung wurde nie freigegeben — dieser Test ist die Sperre dagegen, " +
    "dass sie es versehentlich wird");
  assert.ok(config.gates.GLOBAL_AUTOPUBLISH.reason.length > 40, "Jeder Schalter braucht eine Begruendung");
  assert.equal(config.gates.PROVIDER_META.enabled, false);
  assert.equal(config.gates.ACTION_COMMENT.enabled, false,
    "Automatische Antworten auf UNTRUSTED INPUT sind nicht freigegeben (§50)");

  const switchboard = KillSwitch.fromConfig(config);
  assert.equal(switchboard.allows("meta", "publish").allowed, false);
  assert.equal(switchboard.allows("meta", "comment").allowed, false);
});

test("H11 · Jeder Schaltereintrag traegt Begruendung und Datum", () => {
  const config = readConfig("kill-switch.json");
  for (const [name, gate] of Object.entries(config.gates)) {
    assert.ok(typeof gate.enabled === "boolean", `${name}: enabled fehlt`);
    assert.ok(gate.reason && gate.reason.length > 10, `${name}: ohne Begruendung`);
    assert.match(gate.changedAt, /^\d{4}-\d{2}-\d{2}$/, `${name}: ohne Datum`);
  }
});

test("H12 · Die gewuenschte Autonomiestufe entspricht dem tatsaechlichen Stand", () => {
  const config = readConfig("autonomy.json");
  assert.equal(config.desiredLevel, 0,
    "Solange kein Provider konfiguriert ist, ist jede hoehere Eintragung irrefuehrend (§45)");
  assert.ok(config.desiredLevelReason.length > 40);
  assert.ok(Array.isArray(config.escalationPath) && config.escalationPath.length >= 5);
});

test("H13 · Das Brand Brain kennt die Atlas-Regel und die vorhandenen Assets", () => {
  const brand = readConfig("brand-brain.json");
  assert.match(brand.atlas.rule, /NIEMALS Textprompt/);
  assert.equal(brand.atlas.asset, "assets/atlas.png");
  for (const entry of brand.assetRegistry.entries) {
    assert.ok(readFileSync(join(ROOT, entry.path)).length > 0, `${entry.path} fehlt im Repository`);
  }
  assert.ok(brand.assetRegistry.missing.length > 0,
    "Eine Registry, die verschweigt was fehlt, ist eine Liste von Ausreden");
});

/* ------------------------------------------------------ Erklaerbarkeit */

test("H14 · Die Erklaerung nennt immer auch, was dagegen spricht", () => {
  const res = Explain.whyThisPost({
    package: { topic: "NVDA 52-Wochen-Hoch" },
    trend: { available: true, drivers: [{ reason: "Das Volumen verdoppelt sich." }] },
    opportunity: { components: { vuSignal: { available: true, reason: "internes VU-Signal: 90 %" },
                                 freshness: { available: true, reason: "Der Anlass liegt 2 h zurueck." } },
                   missing: [] },
    strategy: { archetypeReason: "DATA_STORY laeuft gut.", timingReason: "Zeitfenster 18:00.",
                mode: "EXPLOIT" },
    fact: { state: "VERIFIED" }, brand: { warnings: [] },
    fatigue: { passed: true, explanation: "ok" }
  });

  const against = res.sections.find((s) => s.id === "against");
  assert.ok(against, "Der Abschnitt 'Was dagegen spricht' fehlt nie");
  assert.ok(against.text.length > 10);
  assert.ok(res.prose.length > 80);
  assert.ok(!/\bScore \d+ · \d+/.test(res.prose), "Keine Score-Wueste im Text (§32)");
});

test("H15 · Einwaende erscheinen im Text und nicht im Kleingedruckten", () => {
  const res = Explain.whyThisPost({
    package: { topic: "T" },
    fact: { state: "STALE", explanation: "Der Beleg ist zu alt." },
    fatigue: { passed: false, explanation: "Die Hook gleicht einem frueheren Beitrag." },
    opportunity: { components: {}, missing: [{ label: "Publikumsinteresse" }] }
  });
  const against = res.sections.find((s) => s.id === "against");
  assert.match(against.text, /zu alt/);
  assert.match(against.text, /gleicht einem frueheren Beitrag/);
  assert.match(against.text, /Publikumsinteresse/);
});

test("H16 · Ein gedeckeltes Ergebnis erklaert den Deckel zuerst", () => {
  const res = Explain.whyThisResult({
    performance: {
      available: true, score: 30, rawScore: 86,
      capped: { reason: "Die Reaktion war ueberwiegend negativ." },
      weakest: [{ reason: "Speicherungen 40 % des Medians." }],
      explanation: "Performance Score auf 30 begrenzt."
    }
  });
  assert.match(res.summary, /gedeckelt/);
  assert.match(res.prose, /Der Deckel ist wichtiger/);
});
