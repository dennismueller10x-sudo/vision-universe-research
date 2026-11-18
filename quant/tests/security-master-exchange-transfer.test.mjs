/* =========================================================================
   VISION UNIVERSE — security-master-exchange-transfer.test.mjs

   Belegter Boersenwechsel derselben Emittentin (Register
   quant/config/security-master-exchange-transfer.json) am Fall TXCP:
   Texas Capital Bancshares, Inc., SEC CIK 0001077428, Nasdaq -> Texas
   Stock Exchange (8-A12B 0001077428-26-000068, Handel ab 08.10.2026),
   Kuerzel TCBI -> TXCP am 09.11.2026.

   Fixtures: die zwei Anbieterzeilen der Tiingo-Liste vom 18.11.2026
   (TXCP,NASDAQ,2003-08-14..2026-11-10 und TXCP,<leer>,2026-11-11..).
   Kein Netzzugriff, geschrieben wird nichts.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Master = require(join(root, "quant", "engines", "us-security-master.js"));
const Base = require(join(root, "quant", "engines", "instrument-classification.js"));
const Identity = require(join(root, "core", "identity.js"));
const { loadExchangeTransfer, DEFAULT_EXCHANGE_TRANSFER_FILE } =
  await import(join(root, "scripts", "market", "lib", "security-master-exchange-transfer.mjs"));

const TODAY = "2026-11-18";
const OLD = { ticker: "TXCP", exchange: "NASDAQ", assetType: "Stock", currency: "USD", startDate: "2003-08-14", endDate: "2026-11-10" };
const NEW = { ticker: "TXCP", exchange: "", assetType: "Stock", currency: "USD", startDate: "2026-11-11", endDate: "2026-11-17" };
const PLAIN = { ticker: "PLN", exchange: "NYSE", assetType: "Stock", currency: "USD", startDate: "2001-05-01", endDate: "2026-11-17" };
/* Dasselbe Muster ohne Registereintrag. */
const OTHER_OLD = { ticker: "OTHR", exchange: "NASDAQ", assetType: "Stock", currency: "USD", startDate: "2010-01-04", endDate: "2026-11-10" };
const OTHER_NEW = { ...OTHER_OLD, exchange: "", startDate: "2026-11-11", endDate: "2026-11-17" };
const ALL = [OLD, NEW, PLAIN, OTHER_OLD, OTHER_NEW];

const committed = () => loadExchangeTransfer(DEFAULT_EXCHANGE_TRANSFER_FILE).doc;
const rec = (over = {}) => ({ ...structuredClone(committed().records[0]), ...over });
const register = (records) => ({ ...committed(), records });
const baselinePln = { securityId: "ref_PLN", ticker: "PLN", exchange: "NYSE", currency: "USD", assetType: "Stock", instrumentType: "COMMON_STOCK", active: true, startDate: "2001-05-01" };
function build(providerRows, exchangeTransfer, baseline = [baselinePln]) {
  const input = { providerRows: providerRows.map((r) => ({ ...r })), baseline, today: TODAY, stamp: "2026-11-18T00:00:00Z" };
  if (exchangeTransfer !== undefined) input.exchangeTransfer = exchangeTransfer;
  return Master.buildSecurityMaster(input);
}
const rowsOf = (res, t) => res.rows.filter((r) => r.ticker === t);

test("XT1 · TXSE ist regulaerer US-Platz; das Register folgt core/identity.js", () => {
  assert.equal(Master.US_PRIMARY_EXCHANGES.TXSE, true);
  assert.equal(Base.US_EXCHANGES.TXSE, "US");
  const r = committed().records[0];
  assert.equal(r.securityId, Identity.securityIdForTicker("TXCP"));
  assert.equal(r.cik, "0001077428");
  assert.ok(r.filings.some((f) => f.form === "8-A12B" && f.accession === "0001077428-26-000068"));
  assert.ok(r.filings.every((f) => f.filingDate <= r.event.effectiveDate));
});

test("XT2 · Ausgangslage ohne Register: zwei TXCP-Zeilen, keine ist Zugang", () => {
  const rows = rowsOf(build(ALL, null), "TXCP");
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.reconciliation_status !== "ADDED"));
  assert.equal(rows.find((r) => r.start_date === "2026-11-11").venue_tier, "UNKNOWN");
});

test("XT3 · committeter Eintrag: eine Zeile an der TXSE, aktiv, geeignet, Altzeile als dropped_row", () => {
  const res = build(ALL, committed());
  const rows = rowsOf(res, "TXCP");
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.canonical_id, "tiingo:TXSE:TXCP:2026-11-11");
  assert.equal(r.exchange, "TXSE");
  assert.equal(r.venue_tier, "PRIMARY");
  assert.equal(r.classification_status, "CLASSIFIED");
  assert.equal(r.eligible_us_equity, true);
  assert.equal(r.active_status, "ACTIVE");
  assert.equal(r.reconciliation_status, "ADDED");
  assert.ok(r.review_flags.includes("PROVIDER_EXCHANGE_TRANSFER_RESOLVED"));
  assert.ok(!r.review_flags.some((f) => f.indexOf("DUPLICATE_TICKER_") === 0 || f === "EXCHANGE_MISSING"));
  assert.deepEqual(r.exchange_transfer.dropped_row,
    { canonical_id: "tiingo:NASDAQ:TXCP:2003-08-14", start_date: "2003-08-14", end_date: "2026-11-10" });
  assert.equal(r.exchange_transfer.provider_exchange, null);
  assert.equal(r.exchange_transfer.accession, "0001077428-26-000068");
  assert.match(r.listing_status, /Boersenwechsel derselben Emittentin CIK 0001077428/);
  assert.deepEqual(res.exchangeTransfer.notApplied, []);
  assert.equal(res.exchangeTransfer.applied.length, 1);
});

test("XT4 · Zeilen ohne Eintrag bleiben gleich, auch ein Fall desselben Musters", () => {
  const others = (res) => res.rows.filter((r) => r.ticker !== "TXCP").map((r) => JSON.stringify(r));
  assert.deepEqual(others(build(ALL, committed())), others(build(ALL, null)));
  assert.equal(rowsOf(build(ALL, committed()), "OTHR").length, 2);
  assert.equal("exchangeTransfer" in build(ALL, null), false);
  assert.equal("exchangeTransfer" in build(ALL), false);
});

test("XT5 · Bestandszeile TXCP (auch mit alter Boerse) wird der Folgezeile zugeordnet", () => {
  for (const exchange of ["TXSE", "NASDAQ"]) {
    const base = [baselinePln, { securityId: "ref_TXCP", ticker: "TXCP", exchange, currency: "USD", assetType: "Stock", instrumentType: "COMMON_STOCK", active: true, startDate: "2003-08-14" }];
    const rows = rowsOf(build(ALL, committed(), base), "TXCP");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].baseline_member, true);
    assert.equal(rows[0].baseline_security_id, "ref_TXCP");
    assert.equal(rows[0].eligible_us_equity, true);
  }
});

test("XT6 · nicht angewandt, wenn etwas nicht passt (alles wie ohne Register)", () => {
  const cases = [
    { rows: [OLD, NEW, { ...NEW, startDate: "2026-11-12" }], reason: "PROVIDER_ROWS_FOR_TICKER:3" },
    { rows: [OLD, { ...NEW, exchange: "NYSE" }], reason: "TO_ROW_NOT_FOUND" },
    { rows: [{ ...OLD, endDate: "2026-11-07" }, NEW], reason: "FROM_ROW_NOT_FOUND" },
    { rows: [OLD, { ...NEW, currency: "CAD" }], reason: "CURRENCY_MISMATCH" },
    { rows: [OLD, NEW], reason: "BASELINE_SECURITY_ID_MISMATCH",
      baseline: [{ securityId: "ref_TXCP_X", ticker: "TXCP", exchange: "NASDAQ", currency: "USD", assetType: "Stock", active: true }] }
  ];
  for (const c of cases) {
    const res = build(c.rows, committed(), c.baseline);
    assert.equal(res.exchangeTransfer.applied.length, 0, c.reason);
    assert.equal(res.exchangeTransfer.notApplied[0].reason, c.reason);
    const plain = build(c.rows, null, c.baseline);
    assert.deepEqual(res.rows.map((r) => JSON.stringify(r)), plain.rows.map((r) => JSON.stringify(r)), c.reason);
  }
});

test("XT7 · fail closed bei Formfehlern und fehlenden Belegen", () => {
  const bad = [
    rec({ extra: 1 }),
    rec({ cik: "1077428" }),
    rec({ from: { exchange: "NASDAQ", startDate: "2003-08-14", endDate: "2026-10-01" } }),
    rec({ from: { exchange: "PINK", startDate: "2003-08-14", endDate: "2026-11-10" } }),
    rec({ to: { exchange: "NASDAQ", startDate: "2026-11-11", providerExchange: null } }),
    rec({ to: { exchange: "LSE", startDate: "2026-11-11", providerExchange: null } }),
    rec({ to: { exchange: "TXSE", startDate: "2026-11-11", providerExchange: "NYSE" } }),
    rec({ event: { ...committed().records[0].event, venueEffectiveDate: "2026-11-20" } }),
    rec({ filings: committed().records[0].filings.filter((f) => f.form !== "8-A12B") }),
    rec({ filings: committed().records[0].filings.map((f) => ({ ...f, quote: undefined })) }),
    rec({ filings: committed().records[0].filings.map((f) => ({ ...f, cik: "0000000001" })) }),
    rec({ filings: committed().records[0].filings.map((f) => ({ ...f, filingDate: "2026-11-15" })) }),
    rec({ instrumentType: "SOMETHING" })
  ];
  for (const r of bad) assert.throws(() => Master.indexExchangeTransfer(register([r])), /EXCHANGE_TRANSFER_INVALID/);
  assert.throws(() => Master.indexExchangeTransfer(register([rec(), rec()])), /doppelt/);
  assert.throws(() => Master.indexExchangeTransfer({ schemaVersion: "x", records: [] }), /schemaVersion/);
  assert.throws(() => build(ALL, register([rec({ instrumentType: "ETF" })])), /EXCHANGE_TRANSFER_INVALID/);
});

test("XT8 · Lader: fehlende Datei wirft, 'none' schaltet ab", () => {
  assert.throws(() => loadExchangeTransfer(join(root, "quant", "config", "gibt-es-nicht.json")), /fehlt/);
  assert.deepEqual(loadExchangeTransfer("none"), { doc: null, index: null, file: null, sha256: null });
  const l = loadExchangeTransfer();
  assert.equal(l.file, "quant/config/security-master-exchange-transfer.json");
  assert.match(l.sha256, /^[0-9a-f]{64}$/);
});
