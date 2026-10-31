import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate, loadIndex, applyConfirmations, CONFIG_PATH } from "../../scripts/market/lib/corporate-action-confirmations.mjs";

const config = JSON.parse(readFileSync(new URL("../../" + CONFIG_PATH, import.meta.url), "utf8"));

test("Bestaetigte Kapitalmassnahmen: Datei gueltig, GIBO 25:1 mit SEC-Beleg und Anbieterprobe", () => {
  assert.deepEqual(validate(config), { valid: true, errors: [] });
  const ix = loadIndex();
  assert.deepEqual(ix.ref_GIBO, [{ id: "GIBO-2026-06-29-CONSOLIDATION-25", effectiveDate: "2026-06-29", splitFactor: 0.04, ratioText: "25:1", accession: "0001493152-26-030060", correction: "PIPELINE" }]);
});

test("Bestaetigte Kapitalmassnahmen: Pruefung verwirft fehlenden Beleg, falsche Identitaet, Konsolidierung ueber 1, Wochenende, Status", () => {
  const e = config.entries[0], one = (patch) => validate({ ...config, entries: [{ ...e, ...patch }] }).errors;
  assert.ok(one({ evidence: [] }).some((x) => x.startsWith("EVIDENCE_MISSING")));
  assert.ok(one({ securityId: "ref_GIB0" }).some((x) => x.startsWith("SECURITY_ID_NOT_FROM_IDENTITY")));
  assert.ok(one({ splitFactor: 25 }).some((x) => x.startsWith("CONSOLIDATION_FACTOR_NOT_BELOW_1")));
  assert.ok(one({ effectiveDate: "2026-06-28" }).some((x) => x.startsWith("EFFECTIVE_DATE_INVALID")));
  assert.ok(one({ correction: { status: "CORRECTED", reason: "x".repeat(30) } }).some((x) => x.startsWith("CORRECTION_STATUS_INVALID")));
  assert.ok(one({ evidence: [{ ...e.evidence[0], url: "https://www.sec.gov/Archives/edgar/data/1/000149315226030060/form6-k.htm" }] }).some((x) => x.startsWith("URL_INVALID")));
  assert.ok(validate({ ...config, entries: [e, { ...e, id: "GIBO-DUP-1" }] }).errors.some((x) => x.startsWith("DUPLICATE_EVENT")));
});

/* GIBO-Muster: Altwert am Wirksamkeitstag 29.06., erster Balken in konsolidierten Einheiten 30.06. */
const ix = { ref_X: [{ id: "X-1", effectiveDate: "2026-06-29", splitFactor: 0.04, accession: "0000000000-26-000000", correction: "PIPELINE" }] };
function series(closes, dates, sf) {
  return closes.map((c, i) => ({ date: dates[i], close: c, splitFactor: (sf && sf[i]) || 1 }));
}
const D = ["2026-06-24", "2026-06-25", "2026-06-26", "2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-06"];

test("Bestaetigte Kapitalmassnahme: Faktor am Sprungtag (nicht am Altwert des Wirksamkeitstags), Kurse unveraendert", () => {
  const bars = series([1.3, 1.28, 1.25, 1.25, 22.7, 22.1, 21.9, 22.4], D);
  const r = applyConfirmations(bars, "ref_X", { index: ix });
  assert.equal(r.items[0].status, "APPLIED"); assert.equal(r.items[0].date, "2026-06-30");
  assert.equal(r.items[0].rawJump, 18.16); assert.equal(r.items[0].residualMove, 0.7264);
  assert.deepEqual(r.bars.map((b) => b.splitFactor), [1, 1, 1, 1, 0.04, 1, 1, 1]);
  assert.deepEqual(r.bars.map((b) => b.close), bars.map((b) => b.close));
  assert.equal(bars[4].splitFactor, 1, "Eingabe nicht veraendert");
});

test("Bestaetigte Kapitalmassnahme: Schutz gegen doppelte oder falsche Bereinigung", () => {
  const raw = [1.3, 1.28, 1.25, 1.25, 22.7, 22.1, 21.9, 22.4];
  const providerFixed = applyConfirmations(series(raw, D, [1, 1, 1, 1, 0.04]), "ref_X", { index: ix });
  assert.equal(providerFixed.items[0].reason, "PROVIDER_SPLIT_NEARBY");
  const adjusted = applyConfirmations(series([32.5, 32, 31.25, 31.25, 22.7, 22.1, 21.9, 22.4], D), "ref_X", { index: ix });
  assert.equal(adjusted.items[0].reason, "NO_RAW_JUMP", "bereits bereinigte Reihe bleibt unberuehrt");
  const wrong = applyConfirmations(series([1.3, 1.28, 1.25, 1.25, 7.5, 7.4, 7.3, 7.2], D), "ref_X", { index: ix });
  assert.equal(wrong.items[0].reason, "RESIDUAL_JUMP", "x6 passt nicht zu 25:1");
  assert.equal(applyConfirmations(series(raw, D), "ref_X", { index: ix }).bars.length, 8);
  const gone = applyConfirmations(series(raw.slice(0, 3), D.slice(0, 3)), "ref_X", { index: ix });
  assert.equal(gone.items[0].reason, "NO_BAR_AFTER_EFFECTIVE_DATE");
  const off = { ref_X: [{ ...ix.ref_X[0], correction: "UNCORRECTED" }] };
  const b = series(raw, D); assert.equal(applyConfirmations(b, "ref_X", { index: off }).bars, b, "nur Status PIPELINE wirkt");
  assert.equal(applyConfirmations(b, "ref_Y", { index: ix }).bars, b, "andere Wertpapiere: dasselbe Array");
});

test("Bestaetigte Kapitalmassnahme: Register-Eintrag GIBO steht auf PIPELINE", () => {
  assert.equal(config.entries[0].correction.status, "PIPELINE");
});
