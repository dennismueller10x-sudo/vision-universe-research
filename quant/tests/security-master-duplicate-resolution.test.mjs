/* =========================================================================
   VISION UNIVERSE — security-master-duplicate-resolution.test.mjs

   Register belegter Doppelzeilen (quant/config/security-master-duplicate-
   resolution.json, quant/engines/us-security-master.js Abschnitt BELEGTE
   DOPPELZEILEN). Synthetische Anbieterzeilen und ein synthetischer Bestand;
   geschrieben wird nur in ein temporaeres Verzeichnis.

   Geprueft wird vor allem, was NICHT passieren darf: eine Aufloesung ohne
   vollstaendigen Treffer, eine Aufloesung ueber den Ticker allein, ein
   still akzeptiertes fehlerhaftes Register und jede Aenderung an Zeilen
   ohne Eintrag.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Master = require(join(root, "quant", "engines", "us-security-master.js"));
const Identity = require(join(root, "core", "identity.js"));
const { loadDuplicateResolution, DEFAULT_DUPLICATE_RESOLUTION_FILE } =
  await import(join(root, "scripts", "market", "lib", "security-master-duplicate-resolution.mjs"));

const TODAY = "2026-10-30";
const T = "DUPX";
const ID = Identity.securityIdForTicker(T);

function prow(over = {}) {
  return { ticker: T, exchange: "NYSE", assetType: "Stock", currency: "USD",
           startDate: "1990-01-02", endDate: "2026-10-29", name: null, ...over };
}
const OLD = prow({ endDate: "2026-09-14" });
const NEW = prow({ endDate: "2026-10-29" });
/* Ein zweiter, NICHT registrierter Fall derselben Klasse und eine normale Zeile. */
const OTHER_A = { ticker: "OTHR", exchange: "NASDAQ", assetType: "Stock", currency: "USD", startDate: "2015-03-02", endDate: "2023-12-01" };
const OTHER_B = { ...OTHER_A, endDate: "2026-10-29" };
const PLAIN = { ticker: "PLN", exchange: "NYSE", assetType: "Stock", currency: "USD", startDate: "2001-05-01", endDate: "2026-10-29" };

function baseline() {
  return [T, "OTHR", "PLN"].map((t) => ({
    securityId: Identity.securityIdForTicker(t), ticker: t,
    exchange: t === "OTHR" ? "NASDAQ" : "NYSE", currency: "USD", assetType: "Stock",
    instrumentType: "COMMON_STOCK", active: true,
    startDate: t === T ? "1990-01-02" : t === "OTHR" ? "2015-03-02" : "2001-05-01"
  }));
}

function record(over = {}) {
  const r = {
    securityId: ID, ticker: T, exchange: "NYSE", startDate: "1990-01-02",
    canonicalId: "tiingo:NYSE:" + T + ":1990-01-02", assetType: "Stock", instrumentType: "EQUITY_COMMON",
    currency: "USD", droppedEndDate: "2026-09-14",
    event: { kind: "HOLDING_REORGANIZATION", effectiveDate: "2026-09-10" },
    sec: {
      predecessorCik: "0000000001", successorCik: "0000000001", rule: "12g-3(a)", exchangeRatio: "1:1",
      filings: [{ form: "8-K12B", accession: "0000000001-26-000001", filingDate: "2026-09-10", cik: "0000000001",
                  url: "https://www.sec.gov/Archives/edgar/data/1/x.htm",
                  quote: "continues to trade on the NYSE on an uninterrupted basis under the same ticker" }]
    },
    series: { securityId: ID, file: "quant/data/market/discover-series/" + ID + ".json", sha256: "a".repeat(64),
              grain: "daily", windowFrom: "2026-08-11", windowTo: "2026-10-10", points: 43, maxGapDays: 4, maxAbsMove: 0.03 },
    reviewedAt: "2026-10-30"
  };
  return { ...r, ...over };
}
function register(records = [record()], over = {}) {
  return { schemaVersion: Master.DUPLICATE_RESOLUTION_SCHEMA,
           sources: [{ id: "test", url: "https://example.invalid/" }], records, ...over };
}
function build(providerRows, duplicateResolution) {
  const input = { providerRows, baseline: baseline(), today: TODAY, stamp: "2026-10-30T00:00:00Z" };
  if (duplicateResolution !== undefined) input.duplicateResolution = duplicateResolution;
  return Master.buildSecurityMaster(input);
}
const rowsOf = (res, t) => res.rows.filter((r) => r.ticker === t);
const ALL = [OLD, NEW, OTHER_A, OTHER_B, PLAIN];

test("exakter Treffer: genau eine Zeile bleibt (spaetestes Enddatum), Beleg steht an ihr", () => {
  const res = build(ALL, register());
  const rows = rowsOf(res, T);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.end_date, "2026-10-29");
  assert.equal(r.active_status, "ACTIVE");
  assert.equal(r.eligible_us_equity, true);
  assert.equal(r.instrument_type, "EQUITY_COMMON");
  assert.equal(r.baseline_match, "EXCHANGE_MATCH");
  assert.equal(r.reconciliation_status, "EXISTING");
  assert.equal(r.baseline_security_id, ID);
  assert.deepEqual(r.duplicate_resolution.dropped_row,
    { canonical_id: "tiingo:NYSE:DUPX:1990-01-02", start_date: "1990-01-02", end_date: "2026-09-14", active_status: "INACTIVE" });
  assert.equal(r.duplicate_resolution.accession, "0000000001-26-000001");
  assert.match(r.listing_status, /Doppelzeile 1990-01-02\.\.2026-09-14 belegt aufgeloest: 8-K12B 0000000001-26-000001/);
  assert.ok(r.review_flags.includes("PROVIDER_DUPLICATE_ROW_RESOLVED"));
  assert.ok(!r.review_flags.some((f) => f.indexOf("DUPLICATE_TICKER_") === 0));
  assert.equal(res.duplicates.some((d) => d.ticker === T), false);
  assert.deepEqual(res.duplicateResolution.applied.map((a) => a.securityId), [ID]);
  assert.deepEqual(res.duplicateResolution.notApplied, []);
  assert.equal(res.invariants.baselinePreserved !== false, true);
});

test("Reihenfolge der Anbieterzeilen egal: die laufende Zeile bleibt", () => {
  const a = build([NEW, OLD, OTHER_A, OTHER_B, PLAIN], register());
  const b = build(ALL, register());
  assert.deepEqual(rowsOf(a, T), rowsOf(b, T));
});

test("ohne Register: Ergebnis Feld fuer Feld wie bisher, beide Zeilen mehrdeutig", () => {
  const none = build(ALL, null);
  const absent = build(ALL);
  assert.deepEqual(none, absent);
  assert.equal("duplicateResolution" in none, false);
  const rows = rowsOf(none, T);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.baseline_match === "AMBIGUOUS"));
});

/* Jede Abweichung: KEINE Aufloesung, Zeilen exakt wie ohne Register. */
const MISMATCH = [
  ["Boerse", [prow({ exchange: "NASDAQ", endDate: "2026-09-14" }), prow({ exchange: "NASDAQ" })], "PROVIDER_ROWS_WITH_CANONICAL_ID:0"],
  ["Beginn", [prow({ startDate: "1990-01-03", endDate: "2026-09-14" }), prow({ startDate: "1990-01-03" })], "PROVIDER_ROWS_WITH_CANONICAL_ID:0"],
  ["nur ein Beginn gleich", [OLD, prow({ startDate: "2026-09-11" })], "PROVIDER_ROWS_WITH_CANONICAL_ID:1"],
  ["Gattung (assetType)", [OLD, prow({ assetType: "ETF" })], "ASSET_TYPE_MISMATCH"],
  ["Gattung (instrumentType)", [OLD, prow({ ticker: T, name: "DUPX Acquisition Corp Warrants" })], null],
  ["Waehrung", [OLD, prow({ currency: "CAD" })], "CURRENCY_MISMATCH"],
  ["Enddatum der Altzeile", [prow({ endDate: "2026-09-15" }), NEW], "DROPPED_END_DATE_NOT_FOUND"],
  ["dritte Zeile", [OLD, NEW, prow({ endDate: "2026-10-01" })], "PROVIDER_ROWS_WITH_CANONICAL_ID:3"],
  ["verbleibende Zeile nicht spaeter", [OLD, prow({ endDate: "2026-09-14" })], "DROPPED_END_DATE_NOT_FOUND"]
];
for (const [what, dupRows, reason] of MISMATCH) {
  test("Abweichung " + what + ": keine Aufloesung, Zeilen unveraendert", () => {
    const rows = [...dupRows, OTHER_A, OTHER_B, PLAIN];
    const withReg = build(rows, register());
    const without = build(rows, null);
    assert.deepEqual(withReg.rows, without.rows);
    assert.equal(withReg.duplicateResolution.applied.length, 0);
    assert.equal(withReg.duplicateResolution.notApplied.length, 1);
    if (reason) assert.equal(withReg.duplicateResolution.notApplied[0].reason, reason);
  });
}

test("Register mit anderer securityId als der Bestand: keine Aufloesung", () => {
  const rec = record({ securityId: "ref_ZZZZ", series: { ...record().series, securityId: "ref_ZZZZ" } });
  const res = build(ALL, register([rec]));
  assert.equal(rowsOf(res, T).length, 2);
  assert.equal(res.duplicateResolution.notApplied[0].reason, "BASELINE_SECURITY_ID_MISMATCH");
});

test("Zeilen ohne Eintrag bleiben byte-gleich (auch ein Fall derselben Klasse)", () => {
  const withReg = build(ALL, register());
  const without = build(ALL, null);
  const others = (res) => res.rows.filter((r) => r.ticker !== T).map((r) => JSON.stringify(r));
  assert.deepEqual(others(withReg), others(without));
  assert.equal(rowsOf(withReg, "OTHR").length, 2);
  assert.ok(rowsOf(withReg, "OTHR").every((r) => r.baseline_match === "AMBIGUOUS"));
});

test("idempotent: zweiter Lauf gleich; bereinigte Anbieterliste wird nicht weiter angefasst", () => {
  const a = build(ALL, register());
  const b = build(ALL, register());
  assert.deepEqual(a, b);
  /* Fuehrt der Anbieter die Altzeile nicht mehr, ist der Eintrag ungenutzt
     und die Zeile genau die ohne Register. */
  const clean = [NEW, OTHER_A, OTHER_B, PLAIN];
  const c = build(clean, register());
  assert.deepEqual(c.rows, build(clean, null).rows);
  assert.equal(c.duplicateResolution.notApplied[0].reason, "PROVIDER_ROWS_WITH_CANONICAL_ID:1");
});

/* Fehlerhafte Register brechen ab - auch die Faelle, die fachlich KEIN
   Eintrag sein duerfen (kein SEC-Beleg, Reihe springt, Umtausch != 1:1). */
const INVALID = [
  ["Schema", () => register([record()], { schemaVersion: "x" })],
  ["ohne sources", () => register([record()], { sources: [] })],
  ["records kein Array", () => register([record()], { records: {} })],
  ["unbekanntes Feld", () => register([record({ note: "x" })])],
  ["Pflichtfeld fehlt", () => { const r = record(); delete r.droppedEndDate; return register([r]); }],
  ["canonicalId passt nicht", () => register([record({ canonicalId: "tiingo:NYSE:DUPX:1990-01-03" })])],
  ["Ticker klein", () => register([record({ ticker: "dupx" })])],
  ["Datum ungueltig", () => register([record({ droppedEndDate: "2026-02-30" })])],
  ["securityId doppelt", () => register([record(), record()])],
  ["Enddatum weit vom Ereignis", () => register([record({ droppedEndDate: "2026-08-01" })])],
  ["kein SEC-Beleg", () => register([record({ sec: { ...record().sec, filings: [] } })])],
  ["12g-3(a) ohne 8-K12B", () => register([record({ sec: { ...record().sec,
    filings: [{ ...record().sec.filings[0], form: "8-K" }] } })])],
  ["8-K12B ohne Zitat", () => register([record({ sec: { ...record().sec,
    filings: [{ ...record().sec.filings[0], quote: "" }] } })])],
  ["8-K12B lange nach dem Ereignis", () => register([record({ sec: { ...record().sec,
    filings: [{ ...record().sec.filings[0], filingDate: "2026-10-01" }] } })])],
  ["Accession", () => register([record({ sec: { ...record().sec,
    filings: [{ ...record().sec.filings[0], accession: "123" }] } })])],
  ["Zusammenschluss 12g-3(c)", () => register([record({ sec: { ...record().sec, rule: "12g-3(c)" } })])],
  ["Umtausch 5:1", () => register([record({ sec: { ...record().sec, exchangeRatio: "0.2:1" } })])],
  ["SAME_CIK mit zwei CIK", () => register([record({ sec: { ...record().sec, rule: "SAME_CIK", successorCik: "0000000002" } })])],
  ["Reihe springt (Split-Groesse)", () => register([record({ series: { ...record().series, maxAbsMove: 0.5 } })])],
  ["Reihe mit Luecke", () => register([record({ series: { ...record().series, maxGapDays: 12 } })])],
  ["Reihe zu kurz", () => register([record({ series: { ...record().series, points: 2 } })])],
  ["Reihe ausserhalb des Ereignisses", () => register([record({ series: { ...record().series, windowTo: "2026-09-01" } })])],
  ["Reihe einer anderen ID", () => register([record({ series: { ...record().series, securityId: "ref_OTHR" } })])]
];
for (const [what, make] of INVALID) {
  test("fehlerhaftes Register bricht ab: " + what, () => {
    assert.throws(() => build(ALL, make()), /DUPLICATE_RESOLUTION_INVALID/);
  });
}

test("SAME_CIK mit zitierter Meldung derselben CIK ist gueltig", () => {
  const rec = record({ sec: { ...record().sec, rule: "SAME_CIK",
    filings: [{ ...record().sec.filings[0], form: "8-K" }] } });
  const res = build(ALL, register([rec]));
  assert.equal(res.duplicateResolution.applied.length, 1);
});

test("Lader: 'none' schaltet ab, Identitaet nur ueber core/identity.js, kein JSON bricht ab", () => {
  assert.equal(loadDuplicateResolution("none").doc, null);
  const dir = mkdtempSync(join(tmpdir(), "vu-dupres-"));
  try {
    const bad = join(dir, "bad-id.json");
    writeFileSync(bad, JSON.stringify(register([record({ securityId: "ref_DUPY", series: { ...record().series, securityId: "ref_DUPY" } })])));
    assert.throws(() => loadDuplicateResolution(bad), /folgt nicht core\/identity\.js/);
    const broken = join(dir, "broken.json");
    writeFileSync(broken, "{");
    assert.throws(() => loadDuplicateResolution(broken), /DUPLICATE_RESOLUTION_INVALID/);
    assert.throws(() => loadDuplicateResolution(join(dir, "missing.json")), /fehlt/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("committetes Register ist gueltig: belegte 12g-3(a)-Doppelzeilen mit 1:1 und eine Fortfuehrung nach Umfirmierung (SAME_CIK)", () => {
  const loaded = loadDuplicateResolution(DEFAULT_DUPLICATE_RESOLUTION_FILE);
  assert.match(loaded.sha256, /^[0-9a-f]{64}$/);
  const ids = loaded.doc.records.map((r) => r.securityId).sort();
  assert.deepEqual(ids, ["ref_EDVA", "ref_OKE", "ref_TEL"]);
  for (const r of loaded.doc.records) {
    /* Fortfuehrung (keptCanonicalId) nur als SAME_CIK, siehe security-master-rename-continuation.test.mjs. */
    assert.equal(r.sec.rule, r.keptCanonicalId ? "SAME_CIK" : "12g-3(a)");
    assert.equal(r.sec.exchangeRatio, "1:1");
    assert.equal(r.sec.predecessorCik, r.sec.successorCik);
    assert.ok(existsSync(join(root, r.series.file)), r.series.file);
  }
  /* Ausdruecklich NICHT im Register (UNRESOLVED_FAIL_CLOSED, siehe Doku). */
  for (const id of ["ref_BAM", "ref_CCSI", "ref_FUN", "ref_HUT", "ref_NYXH", "ref_UHAL_B"]) assert.ok(!ids.includes(id), id);
});

test("Erzeuger: fehlerhaftes Register -> Exit 2, nichts geschrieben; 'none' und Register schreiben nur nach --out", () => {
  const dir = mkdtempSync(join(tmpdir(), "vu-dupres-cli-"));
  try {
    const csv = join(dir, "tickers.csv");
    const line = (r) => [r.ticker, r.exchange, r.assetType, r.currency, r.startDate, r.endDate].join(",");
    writeFileSync(csv, "ticker,exchange,assetType,priceCurrency,startDate,endDate\n" + ALL.map(line).join("\n") + "\n");
    const base = join(dir, "baseline.json");
    writeFileSync(base, JSON.stringify({ securities: baseline() }));
    const reg = join(dir, "register.json");
    writeFileSync(reg, JSON.stringify(register()));
    const badReg = join(dir, "bad.json");
    writeFileSync(badReg, JSON.stringify(register([record({ sec: { ...record().sec, exchangeRatio: "2:1" } })])));
    const run = (out, extra) => spawnSync(process.execPath, [join(root, "scripts", "market", "build-us-security-master.mjs"),
      "--require-provider", "--from-csv", csv, "--baseline", base, "--today", TODAY, "--stamp", "2026-10-30T00:00:00Z",
      "--provider-summary", join(dir, "no-summary.json"),
      "--out", join(dir, out), "--work-dir", join(dir, out + "-work"), ...extra], { encoding: "utf8" });

    const bad = run("bad", ["--duplicate-resolution", badReg]);
    assert.equal(bad.status, 2, bad.stderr);
    assert.match(bad.stderr, /DUPLICATE_RESOLUTION_INVALID/);
    assert.equal(existsSync(join(dir, "bad", "us-security-master.json")), false);

    const off = run("off", ["--duplicate-resolution", "none"]);
    assert.equal(off.status, 0, off.stderr);
    const on = run("on", ["--duplicate-resolution", reg]);
    assert.equal(on.status, 0, on.stderr);
    const mOff = JSON.parse(readFileSync(join(dir, "off", "us-security-master.json"), "utf8"));
    const mOn = JSON.parse(readFileSync(join(dir, "on", "us-security-master.json"), "utf8"));
    assert.equal("duplicateResolution" in mOff, false);
    assert.equal(mOn.duplicateResolution.applied.length, 1);
    assert.match(mOn.duplicateResolution.sha256, /^[0-9a-f]{64}$/);
    assert.equal(mOff.rows.filter((r) => r.ticker === T).length, 2);
    assert.equal(mOn.rows.filter((r) => r.ticker === T).length, 1);
    assert.deepEqual(mOn.rows.filter((r) => r.ticker !== T), mOff.rows.filter((r) => r.ticker !== T));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
