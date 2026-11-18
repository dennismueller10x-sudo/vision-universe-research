// Folgeartefakt oder Halbstand (scripts/quant/lib/follow-artifact.mjs, Steuerung 18.11.2026): Tests von Faktorevidenz und
// Survivorship-Inventar pruefen nur gegen den Eingang, an dem das Artefakt gebaut ist. Bis zur Materialisierung warten sie
// sichtbar; laenger als 6 h ist ein Fehler. Ohne Hash im Artefakt (vor der Umstellung gebaut) bleibt die volle Pruefung.
import test from "node:test";
import assert from "node:assert/strict";
import { followState, MAX_FOLLOW_HOURS } from "../../scripts/quant/lib/follow-artifact.mjs";

const NOW = Date.parse("2026-11-18T10:00:00Z");

test("FA-1 · passender Hash: volle Pruefung", () => {
  assert.equal(followState({ artifactSha: "a", currentSha: "a", changedAt: "2026-11-01T00:00:00Z", now: NOW }).state, "CURRENT");
});

test("FA-2 · abweichender Hash: bis 6 h wartend, danach Fehler", () => {
  assert.equal(MAX_FOLLOW_HOURS, 6);
  const w = followState({ artifactSha: "a", currentSha: "b", changedAt: "2026-11-18T05:02:51Z", now: NOW });
  assert.equal(w.state, "WAITING"); assert.equal(w.hours, 5); assert.match(w.reason, /wartet auf die Materialisierung/);
  const s = followState({ artifactSha: "a", currentSha: "b", changedAt: "2026-11-18T03:30:00Z", now: NOW });
  assert.equal(s.state, "STALE"); assert.match(s.reason, /Grenze 6 h/);
  assert.equal(followState({ artifactSha: "a", currentSha: "b", changedAt: null, now: NOW }).state, "STALE", "ohne Zeitstempel kein Warten");
});

test("FA-3 · Artefakt ohne Hash: bisherige volle Pruefung", () => {
  assert.equal(followState({ artifactSha: undefined, currentSha: "b", changedAt: "2026-11-18T09:00:00Z", now: NOW }).state, "LEGACY");
});
