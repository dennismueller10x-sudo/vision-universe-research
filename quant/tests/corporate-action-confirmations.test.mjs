import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate, loadIndex, CONFIG_PATH } from "../../scripts/market/lib/corporate-action-confirmations.mjs";

const config = JSON.parse(readFileSync(new URL("../../" + CONFIG_PATH, import.meta.url), "utf8"));

test("Bestaetigte Kapitalmassnahmen: Datei gueltig, GIBO 25:1 mit SEC-Beleg und Anbieterprobe", () => {
  assert.deepEqual(validate(config), { valid: true, errors: [] });
  const ix = loadIndex();
  assert.deepEqual(ix.ref_GIBO, [{ id: "GIBO-2026-06-29-CONSOLIDATION-25", effectiveDate: "2026-06-29", splitFactor: 0.04, ratioText: "25:1", accession: "0001493152-26-030060" }]);
});

test("Bestaetigte Kapitalmassnahmen: Pruefung verwirft fehlenden Beleg, falsche Identitaet, Konsolidierung ueber 1, Wochenende, Status", () => {
  const e = config.entries[0], one = (patch) => validate({ ...config, entries: [{ ...e, ...patch }] }).errors;
  assert.ok(one({ evidence: [] }).some((x) => x.startsWith("EVIDENCE_MISSING")));
  assert.ok(one({ securityId: "ref_GIB0" }).some((x) => x.startsWith("SECURITY_ID_NOT_FROM_IDENTITY")));
  assert.ok(one({ splitFactor: 25 }).some((x) => x.startsWith("CONSOLIDATION_FACTOR_NOT_BELOW_1")));
  assert.ok(one({ effectiveDate: "2026-06-28" }).some((x) => x.startsWith("EFFECTIVE_DATE_INVALID")));
  assert.ok(one({ correction: { status: "CORRECTED", reason: "x" } }).some((x) => x.startsWith("CORRECTION_STATUS_INVALID")));
  assert.ok(one({ evidence: [{ ...e.evidence[0], url: "https://www.sec.gov/Archives/edgar/data/1/000149315226030060/form6-k.htm" }] }).some((x) => x.startsWith("URL_INVALID")));
  assert.ok(validate({ ...config, entries: [e, { ...e, id: "GIBO-DUP-1" }] }).errors.some((x) => x.startsWith("DUPLICATE_EVENT")));
});
