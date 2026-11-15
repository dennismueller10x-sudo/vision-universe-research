/* Verlauf der Marktbreite für den Quant-Start (App-Konzept 2, Prototyp #v-quant „Marktlage“): die Linie unter dem Bogen kommt nur
   aus den veröffentlichten Beobachtungen (market-regime-history/<Stichtag>.json), älteste zuerst, ohne neue Messung. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { breadthHistory } from "../../scripts/quant/build-market-regime.mjs";

const obs = (asOf, share, version = "market-regime-v1.0.0") => JSON.stringify({ schemaVersion: "market-regime-observation-1.0.0", methodologyVersion: version, asOf, regime: "BROAD_WEAKNESS", universe: 100, shares: [{ id: "above200", share, observed: 100 }, { id: "above50", share: 0.5, observed: 100 }] });

test("breadthHistory liest die veröffentlichten Anteile je Stichtag, älteste zuerst, nur gleiche Methodik", () => {
  const dir = mkdtempSync(join(tmpdir(), "regime-hist-"));
  try {
    writeFileSync(join(dir, "2026-11-13.json"), obs("2026-11-13", 0.366));
    writeFileSync(join(dir, "2026-09-10.json"), obs("2026-09-10", 0.44));
    writeFileSync(join(dir, "2026-10-01.json"), obs("2026-10-01", 0.36, "market-regime-v0.9.0"));
    writeFileSync(join(dir, "notiz.json"), "{}");
    const h = breadthHistory(dir, "above200", "market-regime-v1.0.0");
    assert.equal(h.measure, "above200");
    assert.deepEqual(h.points.map((p) => [p.asOf, p.share]), [["2026-09-10", 0.44], ["2026-11-13", 0.366]]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ohne Beobachtungen bleibt der Verlauf leer (der Start zeichnet dann keine Linie)", () => {
  assert.deepEqual(breadthHistory(join(tmpdir(), "gibt-es-nicht-" + Date.now())), { measure: "above200", points: [] });
});
