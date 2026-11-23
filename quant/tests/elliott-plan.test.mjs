// Elliott-Plan (Owner 23.11.2026): der Elliott-Chart und die Wochenkarten zeigen nur, was aus der Zaehlung folgt (elliott/engine/plan.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "../../..");
const { planOf } = createRequire(import.meta.url)(join(ROOT, "elliott/engine/plan.js"));

/* Gestalt wie NVDA am 20.11.2026: W-X-Y abwaerts, Y laeuft, alle Projektionszonen von Y durchlaufen, Engine enthaelt sich.
   Das Szenario-Modell sagt etwas anderes (Rücklauf an 140, Ungültig über 156) und darf den Plan nicht bestimmen. */
const base = () => ({
  timeframe: "1D",
  pro: { elliott: { applicability: { abstain: true, level: "LOW" }, primary: { pattern: "WXY", complete: false, nextMove: "UP", persistenceKey: "WXY|2956|-1",
    currentWave: { label: "Y", direction: "DOWN", wave: 3, of: 3 }, invalidation: { price: 239.24, direction: "above" } } } },
  projection: { timeframe: "1D", consumerVisible: false, primary: { key: "WXY|2956|-1|WAVE_C|Y", status: "EXHAUSTED", zones: [{ tier: "EXTREME", low: 156.2, high: 181.3, state: "PASSED" }] } },
  scenarios: [{ kind: "PRIMARY", direction: "BEARISH", invalidation: { price: 156, direction: "above" } }],
  overlays: { zones: [{ scenario: "PRIMARY", kind: "ENTRY", low: 136.5, high: 143.5 }], invalidations: [{ scenario: "PRIMARY", price: 156, direction: "above" }] }
});

test("EP-1 · Plan nur aus der Zählung: Ungültig-Marke der Zählung, nicht des Szenario-Modells; überholt erkannt", () => {
  const p = planOf(base());
  assert.deepEqual(p.invalidation, { price: 239.24, direction: "above" });
  assert.equal(p.zone, null, "Enthaltung und überholt: keine Zone");
  assert.equal(p.overtaken, true);
  assert.equal(p.developing, true);
  assert.equal(p.dir, "DOWN");
  assert.equal(p.next, "UP", "letzte Welle des Musters: danach laut Muster aufwärts");
});

test("EP-2 · Offene Zone nur, wenn die Engine die Projektion derselben Zählung selbst zeigt", () => {
  const a = base();
  a.pro.elliott.applicability = { abstain: false, level: "MODERATE" };
  a.projection.consumerVisible = true; a.projection.primary.status = "DEVELOPING";
  a.projection.primary.zones = [{ tier: "BASE", low: 196.9, high: 206.5, state: "PASSED" }, { tier: "EXTENDED", low: 181.3, high: 196.9, state: "OPEN" }];
  assert.deepEqual(planOf(a).zone, { low: 181.3, high: 196.9, tier: "EXTENDED" });
  a.projection.primary.key = "IMPULSE|10|1|WAVE_5|5";
  assert.equal(planOf(a).zone, null, "Projektion einer anderen Zählung zählt nicht");
  a.projection.primary.key = "WXY|2956|-1|WAVE_C|Y"; a.projection.consumerVisible = false;
  assert.equal(planOf(a).zone, null, "Projektion nur in der Fachansicht");
});

test("EP-3 · Ohne Zählung kein Plan; Welle mitten im Muster hat kein „danach“", () => {
  assert.equal(planOf({ pro: { elliott: {} } }), null);
  const a = base(); a.pro.elliott.primary.currentWave = { label: "3", direction: "UP", wave: 3, of: 5 };
  assert.equal(planOf(a).next, null);
});
