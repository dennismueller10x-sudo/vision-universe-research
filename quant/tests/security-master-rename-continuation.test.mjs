/* =========================================================================
   VISION UNIVERSE — security-master-rename-continuation.test.mjs

   Fortfuehrung nach Umfirmierung derselben Emittentin (Register belegter
   Doppelzeilen, optionales Feld keptCanonicalId) am Fall EDVA:
   Splash Beverage Group, Inc. -> Endovia Health Sciences, Inc.,
   SEC CIK 0001553788, wirksam an der NYSE American am 24.08.2026.

   Fixtures: die zwei Anbieterzeilen der Tiingo-Liste vom 31.10.2026
   (sha256 fc51593e...), die Bestandszeile aus universe-FULL_UNIVERSE.json
   und der SEC-Eintrag aus company_tickers_exchange.json (30.10.2026).
   Kein Netzzugriff, geschrieben wird nichts.

   Geprueft wird zuerst, was NICHT passieren darf: ein Tickerwechsel, ein
   Boersenwechsel, eine dritte Zeile, ein Register ohne SAME_CIK, eine
   Bestaetigung ohne passende CIK und jede Aenderung an Zeilen ohne
   Eintrag.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Master = require(join(root, "quant", "engines", "us-security-master.js"));
const Identity = require(join(root, "core", "identity.js"));
const { loadDuplicateResolution, DEFAULT_DUPLICATE_RESOLUTION_FILE } =
  await import(join(root, "scripts", "market", "lib", "security-master-duplicate-resolution.mjs"));
const CN = await import(join(root, "scripts", "market", "build-company-names.mjs"));
const { classifyCanonical, applyRenameContinuation, indexSec } =
  await import(join(root, "scripts", "market", "build-security-master-approval-list.mjs"));

const TODAY = "2026-10-31";
const ID = Identity.securityIdForTicker("EDVA");
const CIK = "0001553788";
const OLD_ID = "tiingo:NYSE MKT:EDVA:2019-02-05";
const NEW_ID = "tiingo:AMEX:EDVA:2026-08-21";

/* Anbieterzeilen wie in supported_tickers.csv vom 31.10.2026 (Zeilen 31634/31635). */
const OLD = { ticker: "EDVA", exchange: "NYSE MKT", assetType: "Stock", currency: "USD", startDate: "2019-02-05", endDate: "2026-08-21" };
const NEW = { ticker: "EDVA", exchange: "AMEX", assetType: "Stock", currency: "USD", startDate: "2026-08-21", endDate: "2026-10-30" };
const PLAIN = { ticker: "PLN", exchange: "NYSE", assetType: "Stock", currency: "USD", startDate: "2001-05-01", endDate: "2026-10-30" };
/* Ein zweiter Fall desselben Musters OHNE Registereintrag. */
const OTHER_OLD = { ticker: "OTHR", exchange: "NYSE MKT", assetType: "Stock", currency: "USD", startDate: "2015-03-02", endDate: "2026-08-21" };
const OTHER_NEW = { ...OTHER_OLD, exchange: "AMEX", startDate: "2026-08-21", endDate: "2026-10-30" };

/* Bestandszeile wie in quant/data/market/scale/universe-FULL_UNIVERSE.json. */
function baseline() {
  return [
    { securityId: ID, ticker: "EDVA", exchange: "NYSE MKT", currency: "USD", assetType: "Stock", instrumentType: "COMMON_STOCK", active: true, startDate: "2019-02-05", selection: "ruleBased" },
    { securityId: Identity.securityIdForTicker("PLN"), ticker: "PLN", exchange: "NYSE", currency: "USD", assetType: "Stock", instrumentType: "COMMON_STOCK", active: true, startDate: "2001-05-01" },
    { securityId: Identity.securityIdForTicker("OTHR"), ticker: "OTHR", exchange: "NYSE MKT", currency: "USD", assetType: "Stock", instrumentType: "COMMON_STOCK", active: true, startDate: "2015-03-02" }
  ];
}
const committed = () => loadDuplicateResolution(DEFAULT_DUPLICATE_RESOLUTION_FILE).doc;
const edvaRecord = (over = {}) => ({ ...committed().records.find((r) => r.securityId === ID), ...over });
const register = (records) => ({ ...committed(), records });
function build(providerRows, duplicateResolution) {
  const input = { providerRows, baseline: baseline(), today: TODAY, stamp: "2026-10-31T00:00:00Z" };
  if (duplicateResolution !== undefined) input.duplicateResolution = duplicateResolution;
  return Master.buildSecurityMaster(input);
}
const rowsOf = (res, t) => res.rows.filter((r) => r.ticker === t);
const ALL = [OLD, NEW, PLAIN, OTHER_OLD, OTHER_NEW];

test("RC1 · Ausgangslage ohne Eintrag: securityId haengt an der beendeten Zeile, die Folgezeile ist ALTERNATE_LISTING", () => {
  const res = build(ALL, register(committed().records.filter((r) => r.securityId !== ID)));
  const rows = rowsOf(res, "EDVA");
  assert.equal(rows.length, 2);
  const matched = rows.find((r) => r.baseline_match === "EXCHANGE_MATCH");
  assert.equal(matched.canonical_id, OLD_ID);
  assert.equal(matched.active_status, "INACTIVE");
  assert.equal(matched.eligible_us_equity, false);
  assert.equal(rows.find((r) => r.canonical_id === NEW_ID).baseline_match, "ALTERNATE_LISTING");
});

test("RC2 · committeter Eintrag: ref_EDVA bleibt, Folgezeile aktiv und geeignet, Altzeile als dropped_row", () => {
  const res = build(ALL, committed());
  const rows = rowsOf(res, "EDVA");
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.baseline_security_id, ID);
  assert.equal(ID, "ref_EDVA");
  assert.ok(Identity.consistent("EDVA", r.baseline_security_id));
  assert.equal(r.canonical_id, NEW_ID);
  assert.equal(r.active_status, "ACTIVE");
  assert.equal(r.eligible_us_equity, true);
  assert.equal(r.instrument_type, "EQUITY_COMMON");
  assert.equal(r.reconciliation_status, "EXISTING");
  assert.equal(r.baseline_match, "EXCHANGE_MATCH");
  assert.deepEqual(r.duplicate_resolution.dropped_row,
    { canonical_id: OLD_ID, start_date: "2019-02-05", end_date: "2026-08-21", active_status: "INACTIVE" });
  assert.equal(r.duplicate_resolution.continuation, "SAME_ISSUER_RENAMED");
  assert.equal(r.duplicate_resolution.cik, CIK);
  assert.equal(r.duplicate_resolution.rule, "SAME_CIK");
  assert.equal(r.duplicate_resolution.accession, "0001731122-26-001040");
  assert.match(r.listing_status, /Folgezeile derselben Emittentin CIK 0001553788/);
  assert.ok(r.review_flags.includes("PROVIDER_DUPLICATE_ROW_RESOLVED"));
  assert.ok(!r.review_flags.some((f) => f.indexOf("DUPLICATE_TICKER_") === 0));
  const applied = res.duplicateResolution.applied.find((a) => a.securityId === ID);
  assert.equal(applied.keptCanonicalId, NEW_ID);
});

test("RC3 · Zeilen ohne Eintrag bleiben byte-gleich, auch ein Fall desselben Musters", () => {
  const withReg = build(ALL, committed());
  const without = build(ALL, null);
  const others = (res) => res.rows.filter((r) => r.ticker !== "EDVA").map((r) => JSON.stringify(r));
  assert.deepEqual(others(withReg), others(without));
  assert.equal(rowsOf(withReg, "OTHR").length, 2);
});

test("RC4 · Altfaelle (ohne keptCanonicalId) bekommen keine neuen Felder", () => {
  const oke = committed().records.find((r) => r.securityId === "ref_OKE");
  assert.equal("keptCanonicalId" in oke, false);
  const T = "OKE", base = [{ securityId: "ref_OKE", ticker: T, exchange: "NYSE", currency: "USD", assetType: "Stock", instrumentType: "COMMON_STOCK", active: true, startDate: "1985-07-01" }];
  const p = (end) => ({ ticker: T, exchange: "NYSE", assetType: "Stock", currency: "USD", startDate: "1985-07-01", endDate: end });
  const res = Master.buildSecurityMaster({ providerRows: [p("2026-09-14"), p("2026-10-30")], baseline: base, today: TODAY, duplicateResolution: register([oke]) });
  const r = res.rows.find((x) => x.ticker === T);
  assert.equal("continuation" in r.duplicate_resolution, false);
  assert.equal("cik" in r.duplicate_resolution, false);
  assert.equal("keptCanonicalId" in res.duplicateResolution.applied[0], false);
});

const NOT_APPLIED = [
  ["dritte Zeile unter dem Ticker", [OLD, NEW, { ...NEW, exchange: "NYSE ARCA", assetType: "ETF", startDate: "2026-09-01" }], "PROVIDER_ROWS_FOR_TICKER:3"],
  ["Folgezeile fehlt", [OLD], "PROVIDER_ROWS_WITH_KEPT_CANONICAL_ID:0"],
  ["Altzeile fehlt", [NEW], "PROVIDER_ROWS_WITH_CANONICAL_ID:0"],
  ["Folgezeile an anderem Beginn", [OLD, { ...NEW, startDate: "2026-08-24" }], "PROVIDER_ROWS_WITH_KEPT_CANONICAL_ID:0"],
  ["Enddatum der Altzeile anders", [{ ...OLD, endDate: "2026-08-20" }, NEW], "DROPPED_END_DATE_NOT_FOUND"],
  ["Gattung der Folgezeile anders", [OLD, { ...NEW, assetType: "ETF" }], "ASSET_TYPE_MISMATCH"],
  ["Waehrung anders", [OLD, { ...NEW, currency: "CAD" }], "CURRENCY_MISMATCH"],
  ["Folgezeile nicht spaeter", [OLD, { ...NEW, endDate: "2026-08-21" }], "KEPT_ROW_NOT_LATEST"]
];
for (const [what, dupRows, reason] of NOT_APPLIED) {
  test("RC5 · kein vollstaendiger Treffer (" + what + "): Zeilen exakt wie ohne Register", () => {
    const rows = [...dupRows, PLAIN, OTHER_OLD, OTHER_NEW];
    const withReg = build(rows, register([edvaRecord()]));
    const without = build(rows, null);
    assert.deepEqual(withReg.rows, without.rows);
    assert.equal(withReg.duplicateResolution.applied.length, 0);
    assert.equal(withReg.duplicateResolution.notApplied[0].reason, reason);
  });
}

const INVALID = [
  ["Tickerwechsel in keptCanonicalId", { keptCanonicalId: "tiingo:AMEX:EDVX:2026-08-21" }],
  ["Boersenwechsel (NASDAQ)", { keptCanonicalId: "tiingo:NASDAQ:EDVA:2026-08-21" }],
  ["Boersenwechsel (NYSE ist nicht NYSE American)", { keptCanonicalId: "tiingo:NYSE:EDVA:2026-08-21" }],
  ["Freiverkehr", { keptCanonicalId: "tiingo:OTCMKTS:EDVA:2026-08-21" }],
  ["gleich canonicalId", { keptCanonicalId: OLD_ID }],
  ["Folgezeile weit vom Ereignis", { keptCanonicalId: "tiingo:AMEX:EDVA:2026-09-15" }],
  ["Folgezeile vor der Altzeile", { keptCanonicalId: "tiingo:AMEX:EDVA:2018-01-02" }],
  ["kein Datum", { keptCanonicalId: "tiingo:AMEX:EDVA:2026-02-30" }],
  ["Form", { keptCanonicalId: "AMEX:EDVA:2026-08-21" }],
  ["Regel 12g-3(a) statt SAME_CIK", { sec: { ...edvaRecord().sec, rule: "12g-3(a)" } }],
  ["zwei CIK", { sec: { ...edvaRecord().sec, successorCik: "0000000002" } }],
  ["Meldung ohne Zitat", { sec: { ...edvaRecord().sec, filings: edvaRecord().sec.filings.map((f) => ({ ...f, quote: "" })) } }]
];
for (const [what, over] of INVALID) {
  test("RC6 · fehlerhafter Eintrag bricht ab: " + what, () => {
    assert.throws(() => build(ALL, register([edvaRecord(over)])), /DUPLICATE_RESOLUTION_INVALID/);
  });
}

test("RC7 · Boersenbezeichnungen: nur Aliase derselben Boerse", () => {
  assert.equal(Master.sameVenue("NYSE MKT", "AMEX"), true);
  assert.equal(Master.sameVenue("nyse american", "AMEX"), true);
  assert.equal(Master.sameVenue("NYSE", "AMEX"), false);
  assert.equal(Master.sameVenue("NASDAQ", "NASDAQ"), true);
  assert.deepEqual(Master.parseCanonicalId(OLD_ID), { exchange: "NYSE MKT", ticker: "EDVA", startDate: "2019-02-05" });
  assert.equal(Master.parseCanonicalId("tiingo:a:b"), null);
});

test("RC8 · committeter Eintrag: SEC-Belege derselben CIK mit Zitat, keine Netzabhaengigkeit", () => {
  const r = edvaRecord();
  assert.equal(r.canonicalId, OLD_ID);
  assert.equal(r.keptCanonicalId, NEW_ID);
  assert.equal(r.sec.rule, "SAME_CIK");
  assert.equal(r.sec.predecessorCik, CIK);
  assert.equal(r.sec.successorCik, CIK);
  assert.deepEqual(r.sec.filings.map((f) => f.accession),
    ["0001731122-26-001040", "0001731122-26-001120", "0001731122-26-000950"]);
  for (const f of r.sec.filings) {
    assert.equal(f.cik, CIK);
    assert.match(f.url, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/1553788\//);
    assert.ok(f.quote.length >= 40);
  }
  assert.match(r.sec.filings[0].quote, /Endovia Health Sciences, Inc\./);
  assert.match(r.sec.filings[1].quote, /new ticker symbol “EDVA”/);
  assert.equal(r.event.effectiveDate, "2026-08-24");
});

/* --------------------------------------------------------- Firmennamen */

const SEC_PAYLOAD = { fields: ["cik", "name", "ticker", "exchange"],
  data: [[1553788, "Endovia Health Sciences, Inc.", "EDVA", "NYSE"], [320193, "Apple Inc.", "AAPL", "Nasdaq"]] };

test("RC9 · Name: SEC-Eintrag (NYSE) gegen NYSE-American-Zeile nur mit Registerbeleg derselben CIK", () => {
  const map = CN.parseSecTickerMap(SEC_PAYLOAD);
  assert.equal(CN.secCandidate(map, "EDVA", "NYSE MKT").reason, "SEC_EXCHANGE_MISMATCH");
  assert.equal(CN.secCandidate(map, "EDVA", "NYSE MKT", "0000000009").reason, "SEC_EXCHANGE_MISMATCH");
  const c = CN.secCandidate(map, "EDVA", "NYSE MKT", CIK).candidate;
  assert.equal(c.identity, "TICKER+CIK_REGISTER");
  assert.equal(c.cik, CIK);
  /* Normaler Schluessel bleibt unveraendert vorn. */
  assert.equal(CN.secCandidate(map, "AAPL", "NASDAQ", "0000000009").candidate.identity, "TICKER+EXCHANGE");
  /* Zwei SEC-Eintraege unter dem Ticker: keine Bestaetigung. */
  const two = CN.parseSecTickerMap({ ...SEC_PAYLOAD, data: [...SEC_PAYLOAD.data, [1, "Andere Corp", "EDVA", "Nasdaq"]] });
  assert.equal(CN.secCandidate(two, "EDVA", "NYSE MKT", CIK).candidate, null);
});

test("RC10 · Name: Endovia statt Splash, CIK 0001553788, Widerspruch vermerkt", () => {
  const map = CN.parseSecTickerMap(SEC_PAYLOAD);
  const sec = CN.secCandidate(map, "EDVA", "NYSE MKT", CIK).candidate;
  const res = CN.resolveName("EDVA", {
    TIINGO_METADATA: { name: "Splash Beverage Group Inc NV", exchange: "AMEX", providerSymbol: "EDVA", asOf: "2026-09-14" },
    SEC_COMPANY_TICKERS: { name: sec.name, cik: sec.cik, exchange: sec.exchange, identity: sec.identity, asOf: TODAY }
  });
  assert.equal(res.companyName, "Endovia Health Sciences, Inc.");
  assert.equal(res.displayName, "Endovia Health Sciences");
  assert.equal(res.nameSource, "SEC_COMPANY_TICKERS");
  assert.equal(res.cik, CIK);
  assert.equal(res.nameConflict.provider, "Splash Beverage Group Inc NV");
});

test("RC11 · Registerbeleg der Namensschicht: nur CIK-gleiche Eintraege, ohne Datei keine Bestaetigung", async () => {
  const m = await CN.registerCiks(root);
  assert.equal(m.get(ID), CIK);
  assert.equal(m.get("ref_OKE"), "0001039684");
  assert.equal(m.size, committed().records.filter((r) => r.sec.predecessorCik === r.sec.successorCik).length);
  const dir = mkdtempSync(join(tmpdir(), "vu-rc-"));
  try { assert.equal((await CN.registerCiks(dir)).size, 0); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ------------------------------------------------- Freigabeliste (Gate-Lauf) */

const mrow = (o) => ({ ticker: "EDVA", instrument_type: "EQUITY_COMMON", eligible_us_equity: true, baseline_security_id: ID, ...o });
const P = [mrow({ canonical_id: OLD_ID, exchange: "NYSE MKT", start_date: "2019-02-05", end_date: "2026-08-21", active_status: "ACTIVE" })];
const dr = { schemaVersion: Master.DUPLICATE_RESOLUTION_SCHEMA, rule: "SAME_CIK", form: "8-K", accession: "0001731122-26-001040",
  event: "RENAMED_SAME_ISSUER", effectiveDate: "2026-08-24", continuation: "SAME_ISSUER_RENAMED", cik: CIK,
  dropped_row: { canonical_id: OLD_ID, start_date: "2019-02-05", end_date: "2026-08-21", active_status: "INACTIVE" } };
const N = (o = {}) => [mrow({ canonical_id: NEW_ID, exchange: "AMEX", start_date: "2026-08-21", end_date: "2026-10-30", active_status: "ACTIVE", duplicate_resolution: dr, ...o })];
const secBy = indexSec(SEC_PAYLOAD);
const classify = (n, s = secBy) => ({ securityId: ID, from: OLD_ID, to: n[0].canonical_id, ...classifyCanonical(P, n, { today: TODAY, secBy: s }) });

test("RC12 · Freigabeliste: ohne Registermarke UNCLEAR_REPLACEMENT, mit Marke freigabefaehig", () => {
  const plain = classify(N({ duplicate_resolution: undefined }));
  assert.equal(plain.class, "UNCLEAR_REPLACEMENT");
  assert.equal(plain.approvable, false);
  assert.equal(applyRenameContinuation(plain, P, N({ duplicate_resolution: undefined }), secBy), plain);
  const c = applyRenameContinuation(classify(N()), P, N(), secBy);
  assert.equal(c.class, "RENAMED_SAME_ISSUER_REGISTER");
  assert.equal(c.approvable, true);
  assert.match(c.reason, /CIK 0001553788/);
  assert.match(c.reason, /0001731122-26-001040/);
});

for (const [what, n, s] of [
  ["SEC-Liste nennt andere CIK", N(), indexSec({ ...SEC_PAYLOAD, data: [[1, "Andere Corp", "EDVA", "NYSE"]] })],
  ["SEC-Liste fuehrt den Ticker nicht", N(), indexSec({ ...SEC_PAYLOAD, data: [] })],
  ["Zielzeile inaktiv", N({ active_status: "INACTIVE" }), secBy],
  ["andere Altzeile in der Marke", N({ duplicate_resolution: { ...dr, dropped_row: { ...dr.dropped_row, canonical_id: "tiingo:NYSE MKT:EDVA:2019-02-06" } } }), secBy],
  ["keine Fortfuehrung (Doppelzeile)", N({ duplicate_resolution: { ...dr, continuation: undefined } }), secBy],
  ["Gattungswechsel", N({ instrument_type: "WARRANT" }), secBy]
]) {
  test("RC13 · Freigabeliste ohne vollstaendigen Treffer (" + what + "): Urteil des Builders bleibt", () => {
    const c = classify(n, s);
    assert.equal(applyRenameContinuation(c, P, n, s), c);
  });
}
