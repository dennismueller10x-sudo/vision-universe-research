// Security Master: active_status aus SEC-Delisting-Beleg (V10-Befund: 168 Zeilen ACTIVE trotz Beleg).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Master = require(join(ROOT, "quant/engines/us-security-master.js"));
const Identity = require(join(ROOT, "core/identity.js"));
const { selectCase, buildRegister } = await import(join(ROOT, "scripts/market/build-security-master-delisting-evidence.mjs"));
const { loadDelistingEvidence } = await import(join(ROOT, "scripts/market/lib/security-master-delisting-evidence.mjs"));

const TODAY = "2026-10-28";
// Anbieter schreibt nach dem Delisting fort: endDate = Vortag -> abgeleitet ACTIVE.
const providerRow = (ticker, startDate = "2021-03-01", endDate = "2026-10-27") =>
  ({ ticker, exchange: "NASDAQ", assetType: "Stock", currency: "USD", startDate, endDate, name: null });
const baselineRow = (ticker, startDate = "2021-03-01") =>
  ({ ticker, exchange: "NASDAQ", assetType: "Stock", currency: "USD", startDate, endDate: "2026-09-11", company: ticker + " Inc" });

const record = (over = {}) => ({
  ticker: "AACT", securityId: "ref_AACT", form: "FORM_25", accession: "0001193125-25-215636",
  filingDate: "2025-09-24", effectiveDate: "2025-10-04", frozenSince: "2025-09-24", frozenRun: 180, ...over
});
const register = (records) => ({ schemaVersion: Master.DELISTING_EVIDENCE_SCHEMA, records });

function build(providerRows, baseline, evidence) {
  return Master.buildSecurityMaster({ providerRows, baseline, today: TODAY, providerAvailable: true, stamp: "2026-10-28T00:00:00Z", delistingEvidence: evidence });
}
const rowOf = (res, t) => res.rows.filter((r) => r.ticker === t);

test("Repro: fortgeschriebenes endDate + SEC-Beleg -> INACTIVE, nicht eligible, Begruendung mit Accession", () => {
  const res = build([providerRow("AACT")], [baselineRow("AACT")], register([record()]));
  const [r] = rowOf(res, "AACT");
  assert.equal(r.active_status, "INACTIVE");
  assert.equal(r.eligible_us_equity, false);
  assert.match(r.listing_status, /^secDelisting:FORM_25:0001193125-25-215636:effective=2025-10-04:frozenSince=2025-09-24/);
  assert.ok(r.review_flags.includes("LISTING_INACTIVE"));
  assert.equal(res.delistingEvidence.appliedBaselineRows, 1);
  assert.deepEqual(res.delistingEvidence.appliedTickers, ["AACT"]);
});

test("ohne Register bleibt das Ergebnis unveraendert (ACTIVE aus endDate)", () => {
  const without = Master.buildSecurityMaster({ providerRows: [providerRow("AACT")], baseline: [baselineRow("AACT")], today: TODAY, providerAvailable: true, stamp: "s" });
  const nul = Master.buildSecurityMaster({ providerRows: [providerRow("AACT")], baseline: [baselineRow("AACT")], today: TODAY, providerAvailable: true, stamp: "s", delistingEvidence: null });
  assert.equal(rowOf(without, "AACT")[0].active_status, "ACTIVE");
  assert.deepEqual(without.rows, nul.rows);
  assert.equal(without.delistingEvidence, null);
});

test("nur eine Richtung: ein Beleg macht nie ACTIVE; INACTIVE aus endDate behaelt seine Begruendung", () => {
  const res = build([providerRow("AACT", "2021-03-01", "2025-01-02")], [baselineRow("AACT")], register([record()]));
  const [r] = rowOf(res, "AACT");
  assert.equal(r.active_status, "INACTIVE");
  assert.match(r.listing_status, /^endDate:2025-01-02/);
  // Ein Titel ohne Eintrag bleibt ACTIVE.
  const other = build([providerRow("NVDA")], [baselineRow("NVDA")], register([record()]));
  assert.equal(rowOf(other, "NVDA")[0].active_status, "ACTIVE");
});

test("Ticker-Wiederverwendung: Anbieterzeile beginnt nach dem Wirksamkeitstag -> unberuehrt", () => {
  const res = build([providerRow("AACT", "2021-03-01", "2025-10-03"), providerRow("AACT", "2026-01-05")], [], register([record()]));
  const rows = rowOf(res, "AACT");
  const old = rows.find((r) => r.start_date === "2021-03-01"), fresh = rows.find((r) => r.start_date === "2026-01-05");
  assert.equal(fresh.active_status, "ACTIVE");
  assert.equal(old.active_status, "INACTIVE");
});

test("Wirksamkeitstag in der Zukunft oder fehlendes startDate -> kein Kippen (fail closed gegen Fehlzuordnung)", () => {
  const future = build([providerRow("AACT")], [], register([record({ filingDate: "2026-10-27", effectiveDate: "2026-11-06", frozenSince: "2026-10-20" })]));
  assert.equal(rowOf(future, "AACT")[0].active_status, "ACTIVE");
  const noStart = build([providerRow("AACT", "")], [], register([record()]));
  assert.equal(rowOf(noStart, "AACT")[0].active_status, "ACTIVE");
});

test("Bestand ohne Anbieterzeile: Beleg wirkt auch dort", () => {
  const res = build([providerRow("NVDA")], [baselineRow("AACT"), baselineRow("NVDA")], register([record()]));
  assert.equal(rowOf(res, "AACT")[0].active_status, "INACTIVE");
});

test("Register fail closed: Schema, Doppelung, Wirksamkeitstag, bewegte Reihe, zu kurzer Endlauf", () => {
  const bad = (doc, re) => assert.throws(() => build([providerRow("AACT")], [], doc), re);
  bad({ schemaVersion: "x", records: [] }, /DELISTING_EVIDENCE_INVALID: schemaVersion/);
  bad(register([record(), record()]), /doppelt/);
  bad(register([record({ effectiveDate: "2025-09-24" })]), /effectiveDate/);
  bad(register([record({ form: "FORM_15-12G" })]), /form/);
  bad(register([record({ frozenSince: "2025-10-12" })]), /bewegt sich/);
  bad(register([record({ frozenRun: 4 })]), /frozenRun/);
  bad(register([record({ ticker: "aact" })]), /ticker/);
  bad(register([record({ filingDate: "2025-02-30" })]), /Datum/);
  // 8-K 2.01+3.01 ist am Einreichungstag wirksam.
  assert.ok(Master.indexDelistingEvidence(register([record({ form: "8-K_2.01+3.01", effectiveDate: "2025-09-24" })])).AACT);
});

const kase = (over = {}) => ({
  ticker: "AACT", securityId: "ref_AACT", cik: "0001853138", notes: [], secTickersNow: ["KDK"],
  dailyTail: { run: 180, since: "2025-09-24", close: 9.49, to: "2026-10-26" },
  forms: { delisting: [{ form: "25", filingDate: "2025-09-24", accession: "0001193125-25-215636" }], k8_201_301: [] },
  sources: [], ...over
});

test("Registerauswahl: nur abgeschlossene Delistings mit eingefrorener Reihe", () => {
  assert.equal(selectCase(kase()).record.effectiveDate, "2025-10-04");
  // Item 3.01 allein (Mitteilung) und Form 15 allein sind kein Beleg.
  assert.equal(selectCase(kase({ forms: { delisting: [{ form: "15-12G", filingDate: "2025-09-24", accession: "0001193125-25-215637" }],
    k8_201_301: [{ filingDate: "2025-09-20", items: "3.01,9.01", accession: "0001193125-25-215638" }] } })).reason, "NO_COMPLETED_DELISTING_EVIDENCE");
  // Form 25, aber die SEC fuehrt den Ticker noch fuer den Emittenten (Boersenwechsel/Nebenklasse).
  assert.equal(selectCase(kase({ secTickersNow: ["AACT"] })).reason, "NO_COMPLETED_DELISTING_EVIDENCE");
  // 8-K 2.01+3.01 gilt auch bei SEC-Tickerstand mit Verzoegerung.
  const k8 = selectCase(kase({ secTickersNow: ["AACT"], forms: { delisting: [], k8_201_301: [{ filingDate: "2025-09-30", items: "2.01,3.01,9.01", accession: "0001193125-25-225299" }] },
    dailyTail: { run: 50, since: "2025-09-30", to: "2026-10-26" } }));
  assert.equal(k8.record.form, "8-K_2.01+3.01");
  assert.equal(selectCase(kase({ dailyTail: { run: 4, since: "2025-09-24", to: "2026-10-26" } })).reason, "SERIES_NOT_FROZEN");
  assert.equal(selectCase(kase({ dailyTail: { run: 9, since: "2026-10-14", to: "2026-10-26" } })).reason, "SERIES_MOVED_AFTER_EFFECTIVE_DATE");
  assert.equal(selectCase(kase({ notes: ["LIFECYCLE_SOURCE_CONFLICT"] })).reason, "LIFECYCLE_SOURCE_CONFLICT");
  assert.equal(selectCase(kase({ securityId: "ref_AACT_X" })).reason, "IDENTITY_NOT_CANONICAL");
  const doc = buildRegister([kase(), kase({ ticker: "ZZZZ", securityId: "ref_ZZZZ", forms: { delisting: [], k8_201_301: [] } })], { file: "t" });
  assert.equal(doc.counts.records, 1);
  assert.deepEqual(doc.counts.rejectedByReason, { NO_COMPLETED_DELISTING_EVIDENCE: 1 });
});

test("committetes Register ist gueltig, identitaetskonform und sortiert", () => {
  const loaded = loadDelistingEvidence();
  const doc = loaded.doc;
  assert.equal(doc.schemaVersion, Master.DELISTING_EVIDENCE_SCHEMA);
  assert.equal(doc.records.length, doc.counts.records);
  assert.ok(doc.records.length > 0);
  for (const r of doc.records) assert.ok(Identity.consistent(r.ticker, r.securityId), r.ticker);
  const tickers = doc.records.map((r) => r.ticker);
  assert.deepEqual(tickers, [...tickers].sort());
  assert.match(doc.source.sha256, /^[0-9a-f]{64}$/);
  assert.equal(JSON.parse(readFileSync(join(ROOT, "quant/config/security-master-delisting-evidence.json"), "utf8")).records.length, doc.records.length);
  assert.throws(() => loadDelistingEvidence(join(ROOT, "quant/config/does-not-exist.json")), /fehlt/);
  assert.equal(loadDelistingEvidence("none").index, null);
});
