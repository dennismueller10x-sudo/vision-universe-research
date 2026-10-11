/* Gattungsbeleg aus dem Boersenverzeichnis (scripts/market/apply-exchange-directory.mjs).
   Reine Funktionen, keine Dateien geschrieben. Die Zeilen sind echte Verzeichniszeilen (Nasdaq Trader, 08.10.2026). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseDirectory, directoryIndex, judgeWithDirectory, classRuleHolds, countDecisions, DEFAULT_CLASSES, KNOWN_CLASSES }
  from "../../scripts/market/apply-exchange-directory.mjs";

const require = createRequire(import.meta.url);
const Master = require("../engines/us-security-master.js");
const OPTS = { today: "2026-10-09", listedRoots: { KMPR: true, OXLC: true, AFG: true, SE: true } };

const OTHER = [
  "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol",
  "KMPB|Kemper Corporation 5.875% Fixed-Rate Reset Junior Subordinated Debentures due 2062|N|KMPB|N|100|N|KMPB",
  "KMPR|Kemper Corporation|N|KMPR|N|100|N|KMPR",
  "AFGC|American Financial Group, Inc. 5.125% Subordinated Debentures due 2059|N|AFGC|N|100|N|AFGC",
  "SE|Sea Limited American Depositary Shares, each representing one Class A Ordinary Share|N|SE|N|100|N|SE",
  "ITUB|Itau Unibanco Banco Holding SA American Depositary Shares (Each repstg 1 Preferred Share)|N|ITUB|N|100|N|ITUB",
  "BNS|Bank Nova Scotia Halifax Pfd 3 Ordinary Shares|N|BNS|N|100|N|BNS",
  "SPY|SPDR S&P 500 ETF Trust|P|SPY|Y|100|N|SPY",
  "CBX|CBX (Listing Market NYSE Networks AE) Common Stock|N|CBX|N|100|Y|CBX",
  "File Creation Time: 1008202614:20||||||| "
].join("\n");
const NASDAQ = [
  "Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares",
  "OXLCZ|Oxford Lane Capital Corp. - 5.00% Notes due 2027|Q|N|N|100|N|N",
  "OXLC|Oxford Lane Capital Corp. - Closed End Fund|Q|N|N|100|N|N",
  "FNGU|MicroSectors FANG+ 3X Leveraged ETNs|G|N|N|100|N|N",
  "File Creation Time: 1008202614:20|||||||"
].join("\n");
const DIR = directoryIndex(parseDirectory(OTHER, "otherlisted").concat(parseDirectory(NASDAQ, "nasdaqlisted")));
const dec = (ticker, over) => Object.assign({ ticker, securityId: "ref_" + ticker, exchange: "NYSE", instrument_type: "EQUITY_COMMON", classification_status: "CLASSIFIED",
  classification_confidence: "HIGH", active_status: "ACTIVE", product_eligibility: "ELIGIBLE", product_eligibility_reason: "US_COMMON_EQUITY_ON_PRIMARY_VENUE",
  evidence_source: "SECURITY_MASTER_REJUDGED", review_flags: ["NAME_MISSING_ADR_REIT_SPAC_UNVERIFIED"], start_date: "2022-01-14" }, over || {});
const judge = (d, name, classes) => judgeWithDirectory(d, DIR.get(d.securityId), { assetType: "Stock", currency: "USD" }, name || null, OPTS, classes);

test("ED1 · KMPB, OXLCZ, AFGC: boersennotierte Schuldverschreibungen werden DEBT/EXCLUDED (vorher EQUITY_COMMON/ELIGIBLE)", () => {
  for (const [t, ex] of [["KMPB", "NYSE"], ["OXLCZ", "NASDAQ"], ["AFGC", "NYSE"]]) {
    const j = judge(dec(t, { exchange: ex }), t === "KMPB" ? "Kemper Corporation" : null);
    assert.ok(j, t + " unveraendert");
    assert.equal(j.next.instrument_type, "DEBT", t);
    assert.equal(j.next.product_eligibility, "EXCLUDED", t);
    assert.equal(j.next.product_eligibility_reason, "CONFIRMED_NON_EQUITY:DEBT", t);
    assert.ok(j.next.review_flags.includes("EXCHANGE_DIRECTORY_RECLASSIFIED:EQUITY_COMMON"), t);
    assert.ok(!j.next.review_flags.includes("NAME_MISSING_ADR_REIT_SPAC_UNVERIFIED"));
  }
});

test("ED2 · die Stammaktie desselben Emittenten bleibt Stammaktie (KMPR), ETN wird ETN", () => {
  assert.equal(judge(dec("KMPR")), null);
  const j = judge(dec("FNGU", { exchange: "NASDAQ" }));
  assert.equal(j.next.instrument_type, "ETN");
  assert.equal(j.next.product_eligibility, "EXCLUDED");
});

test("ED3 · ADR auf Vorzugsaktien (ITUB) und Fehlbezeichnung (BNS) bleiben Stammaktien; ETF/CEF/ADR nicht im Standard", () => {
  assert.equal(judge(dec("ITUB")), null);
  assert.equal(judge(dec("BNS")), null);
  assert.equal(classRuleHolds("PREFERRED", { securityName: "Itau Unibanco American Depositary Shares (Each repstg 1 Preferred Share)" }), false);
  assert.equal(classRuleHolds("PREFERRED", { securityName: "CHS Inc - 8% Cumulative Redeemable Preferred Stock" }), true);
  assert.ok(!DEFAULT_CLASSES.includes("ETF"));
  assert.equal(judge(dec("SPY")), null, "ETF ohne --classes ETF unveraendert (Benchmark-Abhaengigkeit)");
  const etf = judge(dec("SPY"), null, KNOWN_CLASSES);
  assert.equal(etf.next.instrument_type, "ETF", "mit ausdruecklicher Klasse und ETF-Kennung");
  assert.equal(classRuleHolds("ETF", { securityName: "X ETF", etf: false }), false, "ETF nur mit Verzeichnis-Kennung");
  assert.equal(judge(dec("OXLC", { exchange: "NASDAQ" })), null, "CEF/BDC ist Policy, kein Datenfehler");
  assert.equal(judge(dec("SE", { active_status: "ACTIVE" })), null, "ADR-Umstufung nicht angewendet");
});

test("ED4 · Testpapiere werden nie umgestuft; Tickerform (PREFERRED/WARRANT) steht ueber dem Namen", () => {
  assert.equal(judge(dec("CBX", { instrument_type: "TEST_SECURITY", product_eligibility: "EXCLUDED" })), null);
  assert.equal(judge(dec("KMPB", { instrument_type: "PREFERRED", product_eligibility: "SEPARATE_CLASS" })), null);
  assert.equal(judge(dec("KMPB", { instrument_type: "WARRANT", product_eligibility: "EXCLUDED" })), null);
});

test("ED5 · SE: gelistet im heutigen Verzeichnis → aktiv; Gattung bleibt, Eignung ELIGIBLE", () => {
  const d = dec("SE", { active_status: "INACTIVE", product_eligibility: "REVIEW", product_eligibility_reason: "UNCONFIRMED:LISTING_INACTIVE", start_date: "2017-10-20" });
  const j = judge(d, "Sea Ltd");
  assert.ok(j);
  assert.equal(j.rule, "DIRECTORY_LISTED:ACTIVE");
  assert.equal(j.next.active_status, "ACTIVE");
  assert.equal(j.next.instrument_type, "EQUITY_COMMON");
  assert.equal(j.next.product_eligibility, "ELIGIBLE");
  assert.equal(judge(dec("ZZZZ", { product_eligibility: "REVIEW", product_eligibility_reason: "UNCONFIRMED:LISTING_INACTIVE" })), null, "nicht im Verzeichnis → unveraendert");
});

test("ED6 · Verzeichnisformat: falsches Format bricht laut ab, Datumszeile wird uebersprungen", () => {
  assert.throws(() => parseDirectory("Foo|Bar\nA|B", "otherlisted"), /INVALID_EXCHANGE_DIRECTORY/);
  assert.equal(parseDirectory(NASDAQ, "nasdaqlisted").length, 3);
  assert.equal(DIR.get("ref_OXLCZ").exchange, "NASDAQ");
  assert.equal(DIR.get("ref_SPY").etf, true);
});

test("ED7 · Zaehler aus Entscheidungen; Produktuniversum = ELIGIBLE + SEPARATE_CLASS + REVIEW", () => {
  const c = countDecisions([dec("A"), dec("B", { product_eligibility: "EXCLUDED", instrument_type: "DEBT" }), dec("C", { product_eligibility: "REVIEW" })]);
  assert.deepEqual(c.counts, { universeMembers: 3, ELIGIBLE: 1, SEPARATE_CLASS: 0, EXCLUDED: 1, REVIEW: 1, productUniverse: 2 });
  assert.deepEqual(c.excludedByClass, { DEBT: 1 });
});

test("ED8 · ausgelieferter Stand: jede Verzeichnis-Umstufung traegt Bezeichnung und Regel; keine Stammaktie mehr mit Schuldverschreibungs-Bezeichnung", () => {
  const recon = JSON.parse(readFileSync(new URL("../data/market/security-master/eligibility-reconciliation.json", import.meta.url)));
  const elig = JSON.parse(readFileSync(new URL("../data/market/security-master/eligibility.json", import.meta.url)));
  const changes = (recon.changes || []).filter((c) => c.source === "NASDAQ_TRADER_SYMBOL_DIRECTORY");
  if (!elig.exchangeDirectoryApplied) return;   // Stand vor der Anwendung
  assert.ok(changes.length > 0);
  const byId = new Map(elig.decisions.map((d) => [d.securityId, d]));
  for (const c of changes) {
    assert.ok(c.securityName && c.rule && c.ruleVersion, c.ticker);
    assert.equal(byId.get(c.securityId).instrument_type, c.to.instrumentType, c.ticker);
  }
  for (const t of ["KMPB", "OXLCZ", "AFGC"]) assert.equal(byId.get("ref_" + t).product_eligibility, "EXCLUDED", t);
  /* G6 der Elliott-Produktschicht liest genau diese Datei: falsche Gattungen kommen nicht durch */
  for (const t of ["KMPB", "OXLCZ"]) assert.notEqual(byId.get("ref_" + t).instrument_type, "EQUITY_COMMON", t);
});
