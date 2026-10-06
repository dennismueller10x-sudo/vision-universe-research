/* =========================================================================
   VU SOCIAL — Strategie-Gedaechtnis (SM1–SM12)

   Ein System, das jeden Morgen vergisst, was es gestern gelernt hat, hat
   keinen Kreislauf, sondern eine Schleife. Diese Tests halten fest, dass
   die Kette traegt — und dass sie nicht waechst, wenn nichts gelernt wurde.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SM = require("../engines/strategy-memory.js");

const NOW = "2026-09-18T12:00:00Z";
const neu = (p) => SM.createStrategyMemory(p, { now: NOW });

const vorschlag = (overrides = {}) => Object.assign({
  changed: true,
  version: { versionId: "strategy_v2", parameters: { archetypeWeights: { DATA_CARD: 1.2 } } },
  applied: [{ observationId: "obs_1", dimension: "archetype", value: "DATA_CARD" }],
  explanation: "DATA_CARD liegt belegbar ueber der Basis."
}, overrides);

test("SM1 · Ohne Vorgeschichte beginnt die Kette bei den Startwerten", () => {
  const m = neu(null);
  assert.equal(m.current().versionId, "strategy_initial");
  assert.equal(m.size(), 1);
});

test("SM2 · Die Startwerte sind als Anfang gekennzeichnet, nicht als Erkenntnis", () => {
  /* Sonst werden sie spaeter als Evidenz zitiert. */
  const m = neu(null);
  assert.match(m.current().rationale, /Keine Evidenz/);
  assert.deepEqual(m.current().observationIds, []);
});

test("SM3 · Ein belastbarer Vorschlag erzeugt eine neue Version", () => {
  const m = neu(null);
  const r = m.apply(vorschlag(), { now: NOW });
  assert.equal(r.committed, true);
  assert.equal(m.size(), 2);
  assert.equal(m.current().parameters.archetypeWeights.DATA_CARD, 1.2);
});

test("SM4 · Die neue Version kennt ihren Vorgaenger", () => {
  const m = neu(null);
  m.apply(vorschlag(), { now: NOW });
  assert.equal(m.current().parentVersionId, "strategy_initial");
});

test("SM5 · Ein Vorschlag ohne Evidenz erzeugt KEINE Version", () => {
  /* Der haeufigste Fall. Eine Kette, die bei jedem Lauf waechst, obwohl
     sich nichts geaendert hat, macht die Frage "wann hat sich die
     Strategie zuletzt bewegt" unbeantwortbar. */
  const m = neu(null);
  const r = m.apply({ changed: false, explanation: "n=1 ist keine Aussage." });
  assert.equal(r.committed, false);
  assert.equal(m.size(), 1);
  assert.match(r.reason, /n=1/);
});

test("SM6 · Die Evidenz haengt an der Version", () => {
  const m = neu(null);
  m.apply(vorschlag(), { now: NOW });
  assert.deepEqual(m.current().observationIds, ["obs_1"]);
  assert.match(m.current().rationale, /belegbar/);
});

test("SM7 · Unbelastbare Beobachtungen werden trotzdem aufbewahrt", () => {
  /* "n=1, nicht ausreichend" ist beim naechsten Lauf n=2. Wer sie
     wegwirft, faengt das Zaehlen ewig bei eins an. */
  const m = neu(null);
  const anzahl = m.recordObservations([
    { observationId: "obs_a", sufficient: false, sampleSize: 1 },
    { observationId: "obs_b", sufficient: true, sampleSize: 8 }
  ]);
  assert.equal(anzahl, 2);
  assert.equal(m.observations().length, 2);
});

test("SM8 · Dieselbe Beobachtung wird nicht doppelt gezaehlt", () => {
  const m = neu(null);
  m.recordObservations([{ observationId: "obs_a", sufficient: false }]);
  const zweite = m.recordObservations([{ observationId: "obs_a", sufficient: false }]);
  assert.equal(zweite, 0);
  assert.equal(m.observations().length, 1);
});

test("SM9 · Der Stand ueberlebt Schreiben und Laden", () => {
  /* Der eigentliche Zweck des Moduls. */
  const m = neu(null);
  m.apply(vorschlag(), { now: NOW });
  m.recordObservations([{ observationId: "obs_1", sufficient: true }]);

  const platte = JSON.parse(JSON.stringify(m.snapshot({ now: NOW })));
  const m2 = neu(platte);

  assert.equal(m2.current().versionId, "strategy_v2");
  assert.equal(m2.current().parameters.archetypeWeights.DATA_CARD, 1.2);
  assert.equal(m2.size(), 2);
  assert.equal(m2.observations().length, 1);
});

test("SM10 · Rollback loescht nichts, sondern haengt an", () => {
  /* Eine Geschichte, aus der man Eintraege entfernen kann, ist als
     Beweis wertlos. */
  const m = neu(null);
  m.apply(vorschlag(), { now: NOW });
  const r = m.rollbackTo("strategy_initial", { now: NOW, reason: "Effekt verschwand" });

  assert.equal(r.ok, true);
  assert.equal(m.size(), 3, "die verworfene Version bleibt in der Kette");
  assert.deepEqual(m.current().parameters, {});
  assert.ok(m.history().some((v) => v.versionId === "strategy_v2"));
});

test("SM11 · Rollback auf eine unbekannte Version schlaegt fehl", () => {
  const m = neu(null);
  const r = m.rollbackTo("gibt_es_nicht", { now: NOW });
  assert.equal(r.ok, false);
  assert.equal(m.size(), 1);
});

test("SM12 · Der Speicher urteilt nicht selbst ueber Evidenz", () => {
  /* Er uebernimmt, was die Learning Engine entschieden hat — auch wenn
     der Vorschlag eine hohe Zahl traegt. Ein Speicher, der auch urteilt,
     ist der Ort, an dem eine Regel spaeter heimlich zweimal steht. */
  const m = neu(null);
  const r = m.apply({ changed: false, version: { parameters: { archetypeWeights: { X: 99 } } },
    explanation: "Von 12 Beobachtungen war keine belastbar." });
  assert.equal(r.committed, false);
  assert.equal(m.current().parameters.archetypeWeights, undefined);
});
