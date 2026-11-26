/* Stammfolge des Survivorship-Inventars (--master-only, Steuerung 25.11.2026). Spielzeugdaten, keine Live-Artefakte (TI-1). */
import test from "node:test";
import assert from "node:assert/strict";

test("Stammfolge (--master-only): nur der Stammabschnitt wird neu, der Delisting-Abschnitt bleibt", async () => {
  const { rebuildMasterSection } = await import("../../scripts/quant/build-survivorship-control.mjs");
  const vorher = { schemaVersion: "survivorship-control-1.0.0", generatedAt: "2026-11-25T01:00:00.000Z", asOf: "2026-11-25",
    securityMaster: { sourceSha256: "alt", rowsTotal: 10, inactiveCommon: 2 },
    delisted: { available: true, asOf: "2026-11-20", classes: { A: 5 } },
    historicalSecurityMasterCoverage: { sources: [{ id: "SECURITY_MASTER_SNAPSHOT", rows: 10, inactive: 2 }, { id: "CIK_MAP", snapshots: 1 }] } };
  const sm = { sourceSha256: "neu", rowsTotal: 12, inactiveCommon: 3 };
  const nach = rebuildMasterSection(vorher, sm, new Date("2026-11-26T10:00:00Z"));
  assert.equal(nach.securityMaster.sourceSha256, "neu");
  assert.deepEqual(nach.delisted, vorher.delisted, "der private Abschnitt bleibt der Stand der Materialisierung");
  assert.equal(nach.masterFollow.delistedAsOf, "2026-11-20");
  assert.deepEqual(nach.historicalSecurityMasterCoverage.sources[0], { id: "SECURITY_MASTER_SNAPSHOT", rows: 12, inactive: 3 });
  assert.deepEqual(nach.historicalSecurityMasterCoverage.sources[1], { id: "CIK_MAP", snapshots: 1 });
  assert.equal(nach.asOf, "2026-11-26");
  assert.throws(() => rebuildMasterSection(null, sm), /MASTER_ONLY_NEEDS_INVENTORY/);
});
