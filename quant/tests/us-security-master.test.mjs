/* =========================================================================
   VISION UNIVERSE — us-security-master.test.mjs

   Der Wertpapierstamm und sein Abgleich.

   Der Schwerpunkt liegt auf den Faellen, in denen etwas VERSCHWINDEN
   koennte. Ein Klassierer, der einen Titel falsch einordnet, erzeugt eine
   Zeile mit REVIEW - aergerlich und sichtbar. Ein Abgleich, der einen
   Titel weglaesst, erzeugt gar nichts, und niemand vermisst eine Zeile,
   die es nie gab. Genau deshalb pruefen die Tests hier zuerst die
   Vollstaendigkeit und erst danach die Richtigkeit.

   MUTATIONSTESTS

   Mehrere Tests kaputtmachen absichtlich etwas und verlangen, dass es
   auffaellt: ein Klassierer ohne Beleg muss UNKNOWN liefern und nicht
   Stammaktie, und die nicht-destruktive Wache muss werfen, wenn ein
   Bestandstitel fehlt. Eine Wache, die nie ausgeloest hat, ist keine
   bewiesene Wache.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Master = require(join(root, "quant", "engines", "us-security-master.js"));
const Base = require(join(root, "quant", "engines", "instrument-classification.js"));

const TODAY = "2026-09-10";

function providerRow(over = {}) {
  return {
    ticker: "TST", exchange: "NASDAQ", assetType: "Stock",
    currency: "USD", startDate: "2010-01-04", endDate: "2026-09-09",
    name: null, ...over
  };
}
function baselineRow(over = {}) {
  return {
    securityId: "ref_TST", ticker: "TST", company: null, exchange: "NASDAQ",
    country: "US", currency: "USD", assetType: "Stock",
    instrumentType: "COMMON_STOCK", active: true, providerSymbol: "TST",
    provider: "tiingo", startDate: "2010-01-04", selection: "ruleBased", ...over
  };
}
function build(providerRows, baseline, over = {}) {
  return Master.buildSecurityMaster({
    providerRows, baseline, today: TODAY, stamp: "2026-09-10T00:00:00.000Z", ...over
  });
}

/* ================================================================ SCHEMA */

const REQUIRED_FIELDS = [
  "provider", "ticker", "canonical_id", "exchange", "country", "currency",
  "instrument_type", "classification_status", "classification_confidence",
  "active_status", "start_date", "end_date", "eligible_us_equity",
  "eligibility_reason", "reconciliation_status", "baseline_member",
  "source_provenance"
];
const OPTIONAL_FIELDS = [
  "provider_symbol_id", "listing_status", "primary_listing", "security_name",
  "mic", "first_seen_at", "last_seen_at"
];

test("SM01 jede Stammzeile traegt alle Pflichtfelder aus §7", () => {
  const r = build([providerRow(), providerRow({ ticker: "AAA-P-B" }),
                   providerRow({ ticker: "FND", assetType: "Mutual Fund" })],
                  [baselineRow()]);
  assert.ok(r.rows.length >= 3);
  for (const row of r.rows) {
    for (const f of REQUIRED_FIELDS) {
      assert.ok(Object.prototype.hasOwnProperty.call(row, f), `Feld ${f} fehlt an ${row.ticker}`);
      assert.notEqual(row[f], undefined, `Feld ${f} ist undefined an ${row.ticker}`);
    }
    for (const f of OPTIONAL_FIELDS) {
      assert.ok(Object.prototype.hasOwnProperty.call(row, f), `optionales Feld ${f} fehlt`);
    }
  }
});

test("SM02 Aufzaehlungen sind geschlossen - kein freier Text in den Statusfeldern", () => {
  const r = build([providerRow(), providerRow({ ticker: "W-WS-A" }),
                   providerRow({ ticker: "ZZZ", assetType: "" })],
                  [baselineRow()]);
  for (const row of r.rows) {
    assert.ok(Master.CLASSES.includes(row.instrument_type), row.instrument_type);
    assert.ok(["CLASSIFIED", "REVIEW", "UNKNOWN"].includes(row.classification_status));
    assert.ok(["HIGH", "MEDIUM", "LOW"].includes(row.classification_confidence));
    assert.ok(["ACTIVE", "INACTIVE", "UNKNOWN"].includes(row.active_status));
    assert.ok(Master.RECONCILIATION_STATUS.includes(row.reconciliation_status));
    assert.equal(typeof row.baseline_member, "boolean");
    assert.equal(typeof row.eligible_us_equity, "boolean");
  }
});

test("SM03 canonical_id trennt zwei Listings desselben Tickers", () => {
  const r = build([
    providerRow({ ticker: "REUSE", exchange: "NYSE", startDate: "1995-01-03", endDate: "2004-06-30" }),
    providerRow({ ticker: "REUSE", exchange: "NASDAQ", startDate: "2019-02-01", endDate: "2026-09-09" })
  ], []);
  const ids = r.rows.map((x) => x.canonical_id);
  assert.equal(new Set(ids).size, ids.length);
});

/* ================================================== NICHT-DESTRUKTIV (§1) */

test("SM10 jeder Bestandstitel bekommt eine Zeile - auch ohne Anbieterzeile", () => {
  const baseline = [
    baselineRow({ ticker: "KEEP1", securityId: "ref_KEEP1" }),
    baselineRow({ ticker: "KEEP2", securityId: "ref_KEEP2" }),
    baselineRow({ ticker: "GONE", securityId: "ref_GONE" })
  ];
  const r = build([providerRow({ ticker: "KEEP1" }), providerRow({ ticker: "KEEP2" })], baseline);
  const tickers = new Set(r.rows.filter((x) => x.baseline_member).map((x) => x.ticker));
  assert.deepEqual([...tickers].sort(), ["GONE", "KEEP1", "KEEP2"]);
  const gone = r.rows.find((x) => x.ticker === "GONE");
  assert.equal(gone.baseline_member, true);
  assert.equal(gone.reconciliation_status, "REVIEW");
  assert.equal(gone.reconciliation_reason, "PROVIDER_ROW_NOT_FOUND");
  assert.ok(gone.review_flags.includes("NOT_IN_PROVIDER_UNIVERSE"));
});

test("SM11 ein Bestandstitel wird nie ADDED oder EXCLUDED_CANDIDATE", () => {
  const baseline = [
    baselineRow({ ticker: "ETFISH", assetType: "ETF", instrumentType: "ETF" }),
    baselineRow({ ticker: "DEAD", active: false }),
    baselineRow({ ticker: "PFD-P-A" })
  ];
  const r = build(baseline.map((b) => providerRow({
    ticker: b.ticker, assetType: b.assetType,
    endDate: b.active === false ? "2019-01-02" : "2026-09-09"
  })), baseline);
  for (const row of r.rows.filter((x) => x.baseline_member)) {
    assert.notEqual(row.reconciliation_status, "ADDED", row.ticker);
    assert.notEqual(row.reconciliation_status, "EXCLUDED_CANDIDATE", row.ticker);
    assert.equal(row.baseline_member, true);
  }
});

test("SM12 die Wache selbst loest aus - Mutationstest auf assertNonDestructive", () => {
  const baselineByTicker = { KEEP: [baselineRow({ ticker: "KEEP" })] };

  /* Der gute Fall geht durch. */
  const ok = Master.assertNonDestructive(
    [{ ticker: "KEEP", baseline_member: true, reconciliation_status: "EXISTING" }],
    baselineByTicker);
  assert.equal(ok.destructiveViolations, 0);

  /* Titel weg: muss werfen. Das ist der Fall, den niemand bemerken
     wuerde, wenn die Wache nur eine Bemerkung waere. */
  assert.throws(() => Master.assertNonDestructive([], baselineByTicker),
                /BASELINE_TICKER_DROPPED:KEEP/);

  /* Titel da, aber als Neuaufnahme ausgewiesen: auch das ist ein
     Verlust - der Bestandsbezug waere weg. */
  assert.throws(() => Master.assertNonDestructive(
    [{ ticker: "KEEP", baseline_member: true, reconciliation_status: "ADDED" }], baselineByTicker),
    /BASELINE_TICKER_MARKED_ADDED/);

  assert.throws(() => Master.assertNonDestructive(
    [{ ticker: "KEEP", baseline_member: true, reconciliation_status: "EXCLUDED_CANDIDATE" }],
    baselineByTicker), /BASELINE_TICKER_MARKED_EXCLUDED/);

  assert.throws(() => Master.assertNonDestructive(
    [{ ticker: "KEEP", baseline_member: true, reconciliation_status: "DELETED" }],
    baselineByTicker), /UNKNOWN_RECONCILIATION_STATUS/);
});

test("SM13 ein Bestand ohne jede Anbieterzeile bleibt vollstaendig erhalten", () => {
  const baseline = Array.from({ length: 25 }, (_, i) =>
    baselineRow({ ticker: "B" + i, securityId: "ref_B" + i }));
  const r = build([], baseline, { providerAvailable: false });
  assert.equal(r.rows.length, 25);
  assert.equal(r.counts.baselinePreserved, 25);
  assert.equal(r.invariants.destructiveViolations, 0);
  assert.equal(r.providerAvailable, false);
});

/* ======================================================= ANHAENGEN (§11) */

test("SM20 eine neue foerderfaehige US-Stammaktie wird ADDED, der Bestand bleibt EXISTING", () => {
  const r = build([providerRow({ ticker: "OLD" }), providerRow({ ticker: "NEW" })],
                  [baselineRow({ ticker: "OLD" })]);
  const old = r.rows.find((x) => x.ticker === "OLD");
  const neu = r.rows.find((x) => x.ticker === "NEW");
  assert.equal(old.reconciliation_status, "EXISTING");
  assert.equal(old.baseline_member, true);
  assert.equal(neu.reconciliation_status, "ADDED");
  assert.equal(neu.baseline_member, false);
  assert.equal(neu.eligible_us_equity, true);
  assert.equal(neu.eligibility_reason, "ACTIVE_US_PRIMARY_LISTED_COMMON_EQUITY");
});

test("SM21 ein neuer Titel ohne Historie wird nicht wegen kurzer Historie ausgeschlossen", () => {
  /* Die Drei-Jahres-Regel hat das bestehende Gate-Universum gezogen. Sie
     ist eine Auswahlregel und keine Gattungsfrage - ein Titel von
     gestern ist eine Aktie. Er darf hier nicht stillschweigend
     wegfallen. */
  const r = build([providerRow({ ticker: "IPO", startDate: "2026-08-03" })], []);
  const row = r.rows[0];
  assert.equal(row.instrument_type, "EQUITY_COMMON");
  assert.equal(row.eligible_us_equity, true);
  assert.equal(row.reconciliation_status, "ADDED");
});

test("SM22 ein neuer Fonds wird EXCLUDED_CANDIDATE und nicht ADDED", () => {
  const r = build([
    providerRow({ ticker: "SPY", assetType: "ETF" }),
    providerRow({ ticker: "VFIAX", assetType: "Mutual Fund" })
  ], []);
  assert.equal(r.rows.find((x) => x.ticker === "SPY").reconciliation_status, "EXCLUDED_CANDIDATE");
  assert.equal(r.rows.find((x) => x.ticker === "VFIAX").reconciliation_status, "EXCLUDED_CANDIDATE");
  assert.equal(r.counts.byReconciliationStatus.ADDED, 0);
});

/* ================================================== KLASSIFIKATION (§3) */

test("SM30 Vorzuege in dreiteiliger Schreibweise werden erkannt (der Fund im Bestand)", () => {
  /* Der Basis-Klassierer sieht hier eine Aktienklasse. Genau deshalb
     stehen 308 solcher Ticker im gelieferten Bestand als Stammaktie. */
  assert.equal(Base.classify({ ticker: "BAC-P-E", assetType: "Stock",
                               exchange: "NYSE" }).instrumentType, "COMMON_STOCK");

  for (const t of ["BAC-P-E", "WFC-P-Y", "PCG-P-A", "GS-P-C", "CTA-P-B"]) {
    const c = Master.classifySecurity(providerRow({ ticker: t, exchange: "NYSE" }), { today: TODAY });
    assert.equal(c.instrumentType, "PREFERRED", t);
    assert.equal(c.eligibleUsEquity, false, t);
    assert.ok(c.flags.includes("BASE_CLASSIFIER_MISSED_SUFFIX"), t);
  }
});

test("SM31 Optionsscheine, Units und Bezugsrechte - zwei- und dreiteilig", () => {
  const cases = [
    ["ABC-WT", "WARRANT"], ["ABC-WS", "WARRANT"], ["ABC-W", "WARRANT"],
    ["VST-WS-A", "WARRANT"], ["NE-WS-A", "WARRANT"],
    ["ABC-U", "UNIT"], ["ABC-UN", "UNIT"], ["ABC-U-A", "UNIT"],
    ["ABC-R", "RIGHT"], ["ABC-RT", "RIGHT"], ["ABC-RT-A", "RIGHT"],
    ["ABC-PA", "PREFERRED"], ["ABC-PRB", "PREFERRED"]
  ];
  for (const [ticker, expected] of cases) {
    const c = Master.classifySecurity(providerRow({ ticker }), { today: TODAY });
    assert.equal(c.instrumentType, expected, ticker + " -> " + c.instrumentType);
    assert.equal(c.eligibleUsEquity, false, ticker);
  }
});

test("SM32 ein einzelner Klassenbuchstabe bleibt eine Stammaktie", () => {
  for (const t of ["BRK-B", "BF-A", "GEF-B", "MKC-V", "LEN-B"]) {
    const c = Master.classifySecurity(providerRow({ ticker: t, exchange: "NYSE" }), { today: TODAY });
    assert.equal(c.instrumentType, "EQUITY_COMMON", t);
    assert.equal(c.shareClass, t.slice(-1), t);
    assert.equal(c.eligibleUsEquity, true, t);
  }
});

test("SM33 ETF-, Fonds- und Indexerkennung", () => {
  const etf = Master.classifySecurity(providerRow({ ticker: "SPY", assetType: "ETF" }), { today: TODAY });
  assert.equal(etf.instrumentType, "ETF");
  assert.equal(etf.policyBucket, "EXCLUDE");

  const fund = Master.classifySecurity(providerRow({ ticker: "VFIAX", assetType: "Mutual Fund" }), { today: TODAY });
  assert.equal(fund.instrumentType, "MUTUAL_FUND");

  const idx = Master.classifySecurity(providerRow({ ticker: "$SPX", assetType: "Stock" }), { today: TODAY });
  assert.equal(idx.instrumentType, "INDEX");
  assert.equal(idx.eligibleUsEquity, false);

  const etn = Master.classifySecurity(
    providerRow({ ticker: "OILN", assetType: "ETF", name: "iPath Series B Crude Oil ETN" }), { today: TODAY });
  assert.equal(etn.instrumentType, "ETN");

  const cef = Master.classifySecurity(
    providerRow({ ticker: "ADX", assetType: "Mutual Fund", name: "Adams Diversified Closed-End Fund" }),
    { today: TODAY });
  assert.equal(cef.instrumentType, "CEF");
});

test("SM34 ADR, REIT, SPAC und TRUST nur mit Namen - sonst ungeprueft", () => {
  const withName = [
    ["Taiwan Semiconductor Manufacturing ADR", "ADR"],
    ["Simon Property Group REIT", "REIT"],
    ["Churchill Capital Acquisition Corp", "SPAC"],
    ["Permian Basin Royalty Trust", "TRUST"]
  ];
  for (const [name, expected] of withName) {
    const c = Master.classifySecurity(providerRow({ name, exchange: "NYSE" }), { today: TODAY });
    assert.equal(c.instrumentType, expected, name);
    assert.equal(c.nameEvidence, "name");
    assert.equal(c.eligibleUsEquity, false, name);
  }

  /* Ohne Namen: EQUITY_COMMON, aber der Befund sagt ausdruecklich, dass
     die Trennung nicht stattgefunden hat. Eine Zahl, die auf dieser
     Grundlage entsteht, ist eine Untergrenze. */
  const blind = Master.classifySecurity(providerRow({ name: null }), { today: TODAY });
  assert.equal(blind.instrumentType, "EQUITY_COMMON");
  assert.equal(blind.nameEvidence, "unavailable");
  assert.ok(blind.flags.includes("NAME_MISSING_ADR_REIT_SPAC_UNVERIFIED"));
});

test("SM35 ohne Beleg steht UNKNOWN - und UNKNOWN ist nicht foerderfaehig", () => {
  const c = Master.classifySecurity(
    { ticker: "MYST", exchange: "NASDAQ", assetType: "", currency: "USD" }, { today: TODAY });
  assert.equal(c.instrumentType, "UNKNOWN");
  assert.equal(c.classificationStatus, "UNKNOWN");
  assert.equal(c.eligibleUsEquity, false);
  assert.equal(c.eligibilityReason, "CLASS_UNKNOWN_UNDECIDED");
});

test("SM36 ein unbekannter Handelsplatz macht REVIEW, nicht Stammaktie", () => {
  const c = Master.classifySecurity(providerRow({ exchange: "SHE", currency: "CNY" }), { today: TODAY });
  assert.equal(c.venueTier, "NON_US_OR_UNKNOWN");
  assert.equal(c.classificationStatus, "REVIEW");
  assert.equal(c.eligibleUsEquity, false);
  assert.ok(c.flags.includes("EXCHANGE_NOT_RECOGNIZED"));
});

test("SM37 die Klassifikation ist stabil - gleicher Eingang, gleicher Befund", () => {
  const rows = ["AAPL", "BAC-P-E", "SPY", "$SPX", "ABC-U", "MYST"].map((t) =>
    providerRow({ ticker: t, assetType: t === "MYST" ? "" : t === "SPY" ? "ETF" : "Stock" }));
  const a = rows.map((r) => Master.classifySecurity(r, { today: TODAY }));
  const b = rows.map((r) => Master.classifySecurity(r, { today: TODAY }));
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  a.forEach((c) => assert.equal(c.version, Master.VERSION));
});

test("SM38 die Politik aus §4 steht als Daten da und wird eingehalten", () => {
  assert.deepEqual(Master.POLICY.INCLUDE, ["EQUITY_COMMON"]);
  for (const cls of Master.POLICY.SEPARATE) assert.equal(Master.policyBucket(cls), "SEPARATE");
  for (const cls of Master.POLICY.EXCLUDE) assert.equal(Master.policyBucket(cls), "EXCLUDE");
  /* Jede Gattung liegt in genau einem Fach oder ist ausdruecklich
     unentschieden - eine Gattung, die in zwei Faechern liegt, waere eine
     Zahl, die zweimal zaehlt. */
  for (const cls of Master.CLASSES) {
    const n = ["INCLUDE", "SEPARATE", "EXCLUDE"].filter(
      (b) => Master.POLICY[b].includes(cls)).length;
    assert.ok(n <= 1, cls + " liegt in " + n + " Faechern");
  }
  assert.equal(Master.policyBucket("UNKNOWN"), "UNDECIDED");
  assert.equal(Master.policyBucket("OTHER"), "UNDECIDED");
});

/* ==================================================== KONTAMINATION (§6) */

test("SM40 ETF im Bestand wird als Kontamination gemeldet - und bleibt drin", () => {
  const baseline = [baselineRow({ ticker: "BNY", assetType: "ETF", instrumentType: "ETF",
                                  active: false, exchange: "NYSE" })];
  const r = build([providerRow({ ticker: "BNY", assetType: "ETF", exchange: "NYSE",
                                 endDate: "2010-05-04" })], baseline);
  const row = r.rows.find((x) => x.ticker === "BNY");
  assert.equal(row.baseline_member, true);
  assert.equal(row.instrument_type, "ETF");
  assert.equal(row.reconciliation_status, "REVIEW");
  assert.ok(row.reconciliation_reason.startsWith("BASELINE_CONTAMINATION_CANDIDATE:"));
  assert.ok(r.findings.some((f) => f.id === "BASELINE_ETF_CONTAMINATION" && f.count === 1));
});

test("SM41 doppelte Ticker: Doppelnotierung und Symbolwiederverwendung getrennt", () => {
  const reuse = build([
    providerRow({ ticker: "DUP", exchange: "NYSE", startDate: "1990-01-02", endDate: "2001-08-31" }),
    providerRow({ ticker: "DUP", exchange: "NASDAQ", startDate: "2015-03-02", endDate: "2026-09-09" })
  ], []);
  assert.equal(reuse.duplicates.length, 1);
  assert.equal(reuse.duplicates[0].kind, "POSSIBLE_SYMBOL_REUSE");
  assert.equal(reuse.duplicates[0].rows, 2);
  /* Ein mehrdeutiger Ticker wird nicht stillschweigend aufgenommen. */
  for (const row of reuse.rows) {
    assert.equal(row.reconciliation_status, "REVIEW");
    /* Der Grund darf mehrteilig sein - die eine Zeile ist zugleich
       beendet und mehrdeutig. Gefordert ist, dass die Mehrdeutigkeit
       darin vorkommt und nicht den anderen Grund verdraengt. */
    assert.ok(row.reconciliation_reason.includes("AMBIGUOUS_DUPLICATE_TICKER"),
              row.reconciliation_reason);
    assert.ok(row.review_flags.some((f) => f.startsWith("DUPLICATE_TICKER_")));
  }
  const dead = reuse.rows.find((x) => x.active_status === "INACTIVE");
  assert.ok(dead.reconciliation_reason.includes("LISTING_INACTIVE"),
            "der erste Grund darf nicht verdraengt werden: " + dead.reconciliation_reason);

  const both = build([
    providerRow({ ticker: "DUP", exchange: "NYSE", startDate: "2010-01-04", endDate: "2026-09-09" }),
    providerRow({ ticker: "DUP", exchange: "BATS", startDate: "2012-01-03", endDate: "2026-09-09" })
  ], []);
  assert.equal(both.duplicates[0].kind, "MULTIPLE_LISTINGS");
});

test("SM42 der Bestandstitel wird ueber den Handelsplatz zugeordnet, nicht ueber den Ticker allein", () => {
  /* Das wiederverwendete Symbol: eine alte, delistete NYSE-Zeile und
     eine laufende NASDAQ-Zeile. Der Bestand steht auf NASDAQ.

     Beide Zeilen zum Bestandstitel zu erklaeren, nur weil der Ticker
     passt, war der Fehler des ersten Anbieterlaufs: er meldete 6.024
     erhaltene Bestandstitel statt 5.684 und 333 angeblich beendete
     Bestandslistings statt 16. Die alte Zeile schlug auf den lebenden
     Titel durch. */
  const r = build([
    providerRow({ ticker: "DUP", exchange: "NYSE", startDate: "1990-01-02", endDate: "2001-08-31" }),
    providerRow({ ticker: "DUP", exchange: "NASDAQ", startDate: "2015-03-02", endDate: "2026-09-09" })
  ], [baselineRow({ ticker: "DUP", exchange: "NASDAQ" })]);

  const rows = r.rows.filter((x) => x.ticker === "DUP");
  assert.equal(rows.length, 2);

  const match = rows.filter((x) => x.baseline_member);
  assert.equal(match.length, 1, "genau eine Zeile ist der Bestandstitel");
  assert.equal(match[0].exchange, "NASDAQ");
  assert.equal(match[0].baseline_match, "EXCHANGE_MATCH");
  assert.equal(match[0].reconciliation_status, "EXISTING");
  assert.equal(match[0].active_status, "ACTIVE");
  /* Das Kennzeichen bleibt an ihr - wer die Symbolgeschichte braucht,
     findet sie -, aber es stellt sie nicht zur Pruefung. */
  assert.ok(match[0].review_flags.some((f) => f.startsWith("DUPLICATE_TICKER_")));

  const other = rows.find((x) => !x.baseline_member);
  assert.equal(other.exchange, "NYSE");
  assert.equal(other.baseline_match, "ALTERNATE_LISTING");
  assert.equal(other.reconciliation_status, "REVIEW");
  assert.equal(other.reconciliation_reason, "ALTERNATE_LISTING_OF_BASELINE_TICKER");
  /* Und ausdruecklich nicht ADDED: eine zweite Zeile zu einem Ticker,
     den wir schon fuehren, ist kein neuer Titel. */
  assert.notEqual(other.reconciliation_status, "ADDED");

  assert.equal(r.counts.baselinePreserved, 1);
  assert.equal(r.counts.baselineMemberRows, 1);
  assert.equal(r.invariants.destructiveViolations, 0);
});

test("SM46 laesst sich der Bestandstitel nicht eindeutig zuordnen, sagt der Lauf das", () => {
  /* Zwei Anbieterzeilen, keine auf dem Handelsplatz des Bestands. Eine
     davon zu waehlen waere geraten. Beide behalten den Bestandsbezug -
     den Titel zu verlieren waere schlimmer als ihn doppelt zu fuehren -
     und beide stehen zur Pruefung. */
  const r = build([
    providerRow({ ticker: "AMB", exchange: "NYSE", startDate: "1990-01-02", endDate: "2026-09-09" }),
    providerRow({ ticker: "AMB", exchange: "BATS", startDate: "2015-03-02", endDate: "2026-09-09" })
  ], [baselineRow({ ticker: "AMB", exchange: "NASDAQ" })]);

  const rows = r.rows.filter((x) => x.ticker === "AMB");
  assert.equal(rows.length, 2);
  assert.ok(rows.every((x) => x.baseline_member === true));
  assert.ok(rows.every((x) => x.baseline_match === "AMBIGUOUS"));
  assert.ok(rows.every((x) => x.reconciliation_status === "REVIEW"));
  assert.ok(rows.every((x) => x.review_flags.includes("BASELINE_MATCH_AMBIGUOUS")));

  /* Ein Titel, zwei Zeilen: erhalten ist der TITEL. */
  assert.equal(r.counts.baselinePreserved, 1);
  assert.equal(r.counts.baselineMemberRows, 2);
  assert.equal(r.counts.baselineTickersWithAmbiguousMatch, 1);
  assert.equal(r.invariants.destructiveViolations, 0);
  assert.ok(r.findings.some((f) => f.id === "BASELINE_MATCH_AMBIGUOUS" && f.count === 1));
});

test("SM47 ein einzelnes Anbieterlisting an anderem Platz bleibt der Bestandstitel", () => {
  /* Der Handelsplatz hat gewechselt. Es gibt nur eine Anbieterzeile -
     dann ist sie es, und der Wechsel ist kein Grund, den Titel als
     verschwunden zu fuehren. */
  const r = build([providerRow({ ticker: "MOVED", exchange: "NYSE" })],
                  [baselineRow({ ticker: "MOVED", exchange: "NASDAQ" })]);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].baseline_member, true);
  assert.equal(r.rows[0].baseline_match, "EXCHANGE_MATCH");
  assert.equal(r.counts.baselinePreserved, 1);
});

test("SM43 inaktive Listings: erkannt, nicht foerderfaehig, nicht entfernt", () => {
  const r = build([providerRow({ ticker: "DEAD", endDate: "2019-03-01" })],
                  [baselineRow({ ticker: "DEAD", active: false })]);
  const row = r.rows[0];
  assert.equal(row.active_status, "INACTIVE");
  assert.equal(row.eligible_us_equity, false);
  assert.equal(row.eligibility_reason, "LISTING_INACTIVE");
  assert.equal(row.baseline_member, true);
  assert.equal(row.reconciliation_status, "REVIEW");
  assert.ok(r.findings.some((f) => f.id === "BASELINE_INACTIVE_LISTINGS"));
});

test("SM44 ein Bestandstitel ohne endDate gilt nicht stillschweigend als tot", () => {
  const r = build([], [baselineRow({ ticker: "LIVE", active: true })], { providerAvailable: false });
  const row = r.rows[0];
  assert.equal(row.active_status, "ACTIVE");
  assert.equal(row.listing_status, "callerSupplied:active=true");
  assert.equal(row.reconciliation_status, "EXISTING");
});

test("SM45 OTC-Stammaktien werden gezaehlt, nicht heimlich ein- oder ausgeschlossen", () => {
  const r = build([providerRow({ ticker: "OTCX", exchange: "PINK" })], []);
  const row = r.rows[0];
  assert.equal(row.instrument_type, "EQUITY_COMMON");
  assert.equal(row.venue_tier, "OTC");
  assert.equal(row.eligible_us_equity, false);
  assert.equal(row.eligibility_reason, "OTC_VENUE_OUT_OF_CURRENT_POLICY");
  assert.equal(row.reconciliation_status, "REVIEW");
  assert.equal(r.counts.otcCommonDeferred, 1);
});

/* ======================================================= AUSZAEHLUNG (§9) */

test("SM50 die Auszaehlung addiert sich und zaehlt nichts doppelt", () => {
  const provider = [
    providerRow({ ticker: "A" }), providerRow({ ticker: "B" }),
    providerRow({ ticker: "SPY", assetType: "ETF" }),
    providerRow({ ticker: "C-P-A" }), providerRow({ ticker: "D-WS-A" }),
    providerRow({ ticker: "E", exchange: "PINK" }),
    providerRow({ ticker: "F", assetType: "" })
  ];
  const r = build(provider, [baselineRow({ ticker: "A" })]);
  const c = r.counts;
  assert.equal(c.rowsTotal, provider.length);
  assert.equal(Object.values(c.byInstrumentType).reduce((a, b) => a + b, 0), c.rowsTotal);
  assert.equal(Object.values(c.byReconciliationStatus).reduce((a, b) => a + b, 0), c.rowsTotal);
  assert.equal(Object.values(c.byActiveStatus).reduce((a, b) => a + b, 0), c.rowsTotal);
  assert.equal(c.baselineCount, 1);
  assert.equal(c.baselinePreserved, 1);
  assert.equal(c.activeUsPrimaryCommonEquities, 2); /* A und B */
});


/* =========================================================================
   SM66-SM80 — Der fuenfte Buchstabe der NASDAQ

   Die Regel, die den Befund aus dem Backfill aufraeumt: 583 der 2.119
   Neuzugaenge waren keine Stammaktien, sondern Warrants, Units und
   Rights in der punktlosen NASDAQ-Schreibweise (AACBW statt AACB-W).

   Die Tests greifen nicht die Regel an, sondern ihre GRENZE. Eine
   Suffixregel, die allein nach dem letzten Buchstaben geht, wirft echte
   vierstellige Gesellschaften mit hinaus, deren Ticker zufaellig auf W,
   R oder U endet. Deshalb steht hier zuerst der Fall, in dem die Regel
   NICHT greifen darf.
   ========================================================================= */

test("SM66 fuenfstelliger Ticker mit gelistetem Stamm ist das Derivat", () => {
  const roots = { AACB: true };
  for (const [ticker, expected] of [["AACBW", "WARRANT"], ["AACBU", "UNIT"], ["AACBR", "RIGHT"]]) {
    const hit = Master.nasdaqFifthLetter(ticker, roots);
    assert.equal(hit.type, expected, ticker);
    assert.equal(hit.root, "AACB");
    assert.equal(hit.rootListed, true);
    assert.equal(hit.basis, "nasdaqFifthLetterWithListedRoot");
  }
});

test("SM67 ohne gelisteten Stamm bleibt es ein Verdacht, kein Befund", () => {
  const hit = Master.nasdaqFifthLetter("ZZZZW", {});
  assert.equal(hit.type, "WARRANT");
  assert.equal(hit.rootListed, false);
  assert.equal(hit.basis, "nasdaqFifthLetterOnly");
});

test("SM68 die Regel greift nur bei genau fuenf Grossbuchstaben", () => {
  for (const t of ["AACB", "AACBX", "AAC", "AACBWW", "BAC-PB", "BAC-P-E", "$SPX", "ABC.W"]) {
    assert.equal(Master.nasdaqFifthLetter(t, { AACB: true, BAC: true, ABC: true }), null, t);
  }
});

test("SM69 MUTATION: der Suffix allein darf keinen Titel ausschliessen", () => {
  /* Der teuerste Fehler dieser Regel: eine echte Gesellschaft, deren
     Ticker auf W endet, ohne dass es je ein Derivat gaebe. Sie muss in
     REVIEW landen - sichtbar - und nicht im Ausschluss. */
  const c = Master.classifySecurity(
    providerRow({ ticker: "ZZZZW" }), { today: TODAY, listedRoots: {} });
  assert.equal(c.instrumentType, "WARRANT");
  assert.equal(c.classificationConfidence, "LOW");
  assert.equal(c.classificationStatus, "REVIEW");
  assert.ok(c.flags.includes("NASDAQ_FIFTH_LETTER_UNCONFIRMED"));
  assert.equal(c.eligibleUsEquity, false);
});

test("SM70 mit Stammbeleg wird aus dem Verdacht ein Befund", () => {
  const c = Master.classifySecurity(
    providerRow({ ticker: "AACBW" }), { today: TODAY, listedRoots: { AACB: true } });
  assert.equal(c.instrumentType, "WARRANT");
  assert.equal(c.classificationConfidence, "HIGH");
  assert.equal(c.classificationStatus, "CLASSIFIED");
  assert.ok(c.flags.includes("NASDAQ_FIFTH_LETTER_ROOT_LISTED"));
  assert.equal(c.policyBucket, "EXCLUDE");
});

test("SM71 der Stamm selbst bleibt Stammaktie und bleibt geeignet", () => {
  const c = Master.classifySecurity(
    providerRow({ ticker: "AACB" }), { today: TODAY, listedRoots: { AACB: true } });
  assert.equal(c.instrumentType, "EQUITY_COMMON");
  assert.equal(c.eligibleUsEquity, true);
});

test("SM72 die Regel ueberschreibt keine bereits belegte Klasse", () => {
  /* Ein Fonds, dessen Ticker fuenf Buchstaben hat und auf U endet,
     bleibt ein Fonds. Die Fuenfbuchstabenregel greift nur dort, wo der
     Basis-Klassierer Stammaktie gesagt hat. */
  const c = Master.classifySecurity(
    providerRow({ ticker: "ABCDU", assetType: "ETF" }),
    { today: TODAY, listedRoots: { ABCD: true } });
  assert.equal(c.instrumentType, "ETF");
});

test("SM73 Testpapiere des Anbieters sind kein Wertpapier", () => {
  for (const t of ["TEST", "ATEST", "ZTEST", "TEST1", "MTEST-A"]) {
    assert.equal(Master.looksLikeTestSecurity(t), true, t);
    const c = Master.classifySecurity(providerRow({ ticker: t }), { today: TODAY });
    assert.equal(c.instrumentType, "TEST_SECURITY", t);
    assert.equal(c.eligibleUsEquity, false, t);
    assert.equal(c.policyBucket, "EXCLUDE", t);
  }
});

test("SM74 MUTATION: die Testregel darf keine echte Gesellschaft treffen", () => {
  /* Eng gefasst ist hier Absicht. Ein faelschlich ausgeschlossenes
     Unternehmen ist teurer als ein durchgerutschtes Testpapier. */
  for (const t of ["TESLA", "ATTEST", "CONTEST", "TESTED", "PROTEST", "TST"]) {
    assert.equal(Master.looksLikeTestSecurity(t), false, t);
  }
});

test("SM75 der Stammbeleg wird aus Anbieterliste UND Bestand gebildet", () => {
  const roots = Master.collectListedRoots(
    [{ ticker: "AACB" }, { ticker: "AACBW" }, { ticker: "BAC-PB" }, { ticker: "$SPX" }],
    [{ ticker: "SNOW" }]);
  assert.equal(roots.AACB, true);
  assert.equal(roots.SNOW, true);
  assert.equal(roots.AACBW, undefined, "fuenfstellig ist kein Stamm");
  assert.equal(roots["BAC-PB"], undefined, "ein Vorzug ist kein Stamm");
  assert.equal(roots["$SPX"], undefined, "ein Index ist kein Stamm");
});

test("SM76 ein Stamm, den nur der Bestand fuehrt, belegt sein Derivat", () => {
  /* Der Anbieter hat den Stamm delistet, der Bestand fuehrt ihn noch.
     Das Derivat bleibt trotzdem belegt - sonst schluege eine Delistung
     des Stamms als neuer Zweifel auf das Derivat durch. */
  const out = Master.buildSecurityMaster({
    providerRows: [providerRow({ ticker: "AACBW" })],
    baseline: [{ ticker: "AACB", exchange: "NASDAQ", company: "AACB Corp",
                 assetType: "Stock", currency: "USD", startDate: "2024-01-02", active: true }],
    today: TODAY
  });
  const w = out.rows.find((r) => r.ticker === "AACBW");
  assert.equal(w.instrument_type, "WARRANT");
  assert.equal(w.classification_confidence, "HIGH");
  assert.ok(w.review_flags.includes("NASDAQ_FIFTH_LETTER_ROOT_LISTED"));
});

test("SM77 der Abgleich schliesst belegte Derivate aus und nur diese", () => {
  const out = Master.buildSecurityMaster({
    providerRows: [
      providerRow({ ticker: "AACB" }),
      providerRow({ ticker: "AACBW" }),
      providerRow({ ticker: "AACBU" }),
      providerRow({ ticker: "ZZZZW" }),
      providerRow({ ticker: "MTEST-A" })
    ],
    baseline: [], today: TODAY
  });
  const by = {};
  out.rows.forEach((r) => { by[r.ticker] = r; });
  assert.equal(by.AACB.reconciliation_status, "ADDED");
  assert.equal(by.AACBW.reconciliation_status, "EXCLUDED_CANDIDATE");
  assert.equal(by.AACBU.reconciliation_status, "EXCLUDED_CANDIDATE");
  assert.equal(by["MTEST-A"].reconciliation_status, "EXCLUDED_CANDIDATE");
  assert.equal(by.ZZZZW.reconciliation_status, "REVIEW",
               "ohne Stammbeleg wird bewahrt, nicht ausgeschlossen");
  assert.ok(by.ZZZZW.review_flags.includes("EXCLUSION_CANDIDATE_UNCONFIRMED"));
});

test("SM78 MUTATION: ein unsicherer Ausschluss darf nie EXCLUDED_CANDIDATE sein", () => {
  /* Die Zusage in einem Satz: der Ausschlusskorb steht nur Zeilen
     offen, die der Klassierer auch wirklich erkannt hat. Faellt diese
     Bedingung weg, faellt dieser Test. */
  const out = Master.buildSecurityMaster({
    providerRows: [
      providerRow({ ticker: "ZZZZW" }),
      providerRow({ ticker: "YYYYU" }),
      providerRow({ ticker: "XXXXR" })
    ],
    baseline: [], today: TODAY
  });
  for (const r of out.rows) {
    assert.notEqual(r.reconciliation_status, "EXCLUDED_CANDIDATE", r.ticker);
    assert.equal(r.reconciliation_status, "REVIEW", r.ticker);
    assert.equal(r.eligible_us_equity, false, r.ticker);
  }
});

test("SM79 kein Bestandstitel wird durch die neue Regel entfernt", () => {
  /* Selbst wenn ein gelieferter Bestandstitel unter die neue Regel
     faellt: er verschwindet nicht, er kommt zur Pruefung. */
  const out = Master.buildSecurityMaster({
    providerRows: [providerRow({ ticker: "AACB" }), providerRow({ ticker: "AACBW" })],
    baseline: [
      { ticker: "AACBW", exchange: "NASDAQ", company: "AACB Warrant",
        assetType: "Stock", currency: "USD", startDate: "2024-01-02", active: true }
    ],
    today: TODAY
  });
  const w = out.rows.find((r) => r.ticker === "AACBW");
  assert.equal(w.baseline_member, true);
  assert.ok(["EXISTING", "REVIEW"].includes(w.reconciliation_status));
  assert.equal(out.invariants.destructiveViolations, 0);
});

test("SM80 die neuen Klassen stehen im Katalog und im Ausschluss", () => {
  for (const c of ["WARRANT", "UNIT", "RIGHT", "TEST_SECURITY"]) {
    assert.ok(Master.CLASSES.includes(c), c);
    assert.ok(Master.POLICY.EXCLUDE.includes(c), c);
  }
});

/* =========================================================================
   SM81-SM90 — Produkteignung

   Die Schicht, die nach dem Backfill entscheidet, was ins Produkt
   gehoert. Ihr Kern ist eine Vorsichtsregel: ein Ausschluss braucht
   einen Beleg. Die Tests greifen genau diese Regel an - denn eine
   Vorsicht, die nie gegriffen hat, ist keine bewiesene Vorsicht.
   ========================================================================= */

test("SM81 eine geeignete Stammaktie ist ELIGIBLE", () => {
  const d = Master.decideProductEligibility({
    instrumentType: "EQUITY_COMMON", classificationStatus: "CLASSIFIED", eligible: true });
  assert.equal(d.status, "ELIGIBLE");
  assert.equal(d.inProductUniverse, true);
});

test("SM82 eine BELEGTE Nicht-Aktie ist EXCLUDED", () => {
  for (const cls of ["WARRANT", "UNIT", "RIGHT", "TEST_SECURITY", "ETF", "INDEX"]) {
    const d = Master.decideProductEligibility({
      instrumentType: cls, classificationStatus: "CLASSIFIED", eligible: false });
    assert.equal(d.status, "EXCLUDED", cls);
    assert.equal(d.reason, "CONFIRMED_NON_EQUITY:" + cls);
    assert.equal(d.inProductUniverse, false);
  }
});

test("SM83 MUTATION: ohne Beleg wird nicht ausgeschlossen", () => {
  /* Der Kern der Aufraeumregel. Faellt die CLASSIFIED-Bedingung weg,
     faellt dieser Test - und mit ihm die Zusage, dass ein Verdacht
     bewahrt statt geloescht wird. */
  for (const st of ["REVIEW", "UNKNOWN"]) {
    for (const cls of ["WARRANT", "UNIT", "RIGHT"]) {
      const d = Master.decideProductEligibility({
        instrumentType: cls, classificationStatus: st, eligible: false,
        reason: "CLASS_" + cls + "_NOT_AN_EQUITY" });
      assert.equal(d.status, "REVIEW", cls + "/" + st);
      assert.equal(d.inProductUniverse, true,
        "Ein unbelegter Verdacht bleibt sichtbar im Produkt, er wird nicht entfernt.");
    }
  }
});

test("SM84 ein belegter Vorzug ist getrennt, aber kein Verdachtsfall", () => {
  const d = Master.decideProductEligibility({
    instrumentType: "PREFERRED", classificationStatus: "CLASSIFIED", eligible: false });
  assert.equal(d.status, "SEPARATE_CLASS");
  assert.equal(d.inProductUniverse, true);
  assert.notEqual(d.status, "REVIEW",
    "308 einwandfrei erkannte Vorzuege als zweifelhaft zu fuehren machte die " +
    "Verdachtsliste unbrauchbar.");
});

test("SM85 ein inaktives Listing bleibt Verdachtsfall, nicht Ausschluss", () => {
  const d = Master.decideProductEligibility({
    instrumentType: "EQUITY_COMMON", classificationStatus: "CLASSIFIED",
    eligible: false, reason: "LISTING_INACTIVE" });
  assert.equal(d.status, "REVIEW");
  assert.equal(d.reason, "UNCONFIRMED:LISTING_INACTIVE");
});

test("SM86 jedes Urteil ist genau einer der vier Ausgaenge", () => {
  const faelle = [
    { eligible: true },
    { instrumentType: "WARRANT", classificationStatus: "CLASSIFIED" },
    { instrumentType: "PREFERRED", classificationStatus: "CLASSIFIED" },
    { instrumentType: "UNKNOWN", classificationStatus: "UNKNOWN" },
    {}, { instrumentType: "OTHER", classificationStatus: "REVIEW" }
  ];
  for (const f of faelle) {
    const d = Master.decideProductEligibility(f);
    assert.ok(Master.PRODUCT_ELIGIBILITY.includes(d.status), JSON.stringify(f));
    assert.equal(d.inProductUniverse, Master.IN_PRODUCT_UNIVERSE.includes(d.status));
  }
});

test("SM87 eine leere Eingabe fuehrt zu REVIEW, nicht zu ELIGIBLE", () => {
  /* Fehlende Belege duerfen nie in die freundlichste Antwort fallen. */
  const d = Master.decideProductEligibility({});
  assert.equal(d.status, "REVIEW");
  const d2 = Master.decideProductEligibility();
  assert.equal(d2.status, "REVIEW");
});

test("SM88 die Eignung entscheidet ueber das Produkt, nicht ueber die Ablage", () => {
  /* Der Ausschluss traegt keine Aussage ueber gespeicherte Historie.
     Wer hier ein Feld faende, das "loeschen" sagt, haette die Grenze
     dieser Schicht verletzt. */
  const d = Master.decideProductEligibility({
    instrumentType: "WARRANT", classificationStatus: "CLASSIFIED", eligible: false });
  const text = JSON.stringify(d).toLowerCase();
  for (const wort of ["delete", "remove", "purge", "drop", "loesch"]) {
    assert.ok(!text.includes(wort), "Eignung darf nichts ueber Loeschung sagen: " + wort);
  }
  assert.deepEqual(Object.keys(d).sort(), ["inProductUniverse", "reason", "status"]);
});

test("SM89 der belegte Fuenfbuchstaben-Warrant geht den ganzen Weg bis EXCLUDED", () => {
  /* Klassierer, Abgleich und Eignung in einer Kette - der Fall, um den
     es beim Aufraeumen geht. */
  const c = Master.classifySecurity(
    providerRow({ ticker: "AACBW" }), { today: TODAY, listedRoots: { AACB: true } });
  const d = Master.decideProductEligibility({
    instrumentType: c.instrumentType, classificationStatus: c.classificationStatus,
    policyBucket: c.policyBucket, eligible: c.eligibleUsEquity, reason: c.eligibilityReason });
  assert.equal(d.status, "EXCLUDED");
  assert.equal(d.reason, "CONFIRMED_NON_EQUITY:WARRANT");
});

test("SM90 derselbe Ticker ohne Stammbeleg geht bis REVIEW und nicht weiter", () => {
  const c = Master.classifySecurity(
    providerRow({ ticker: "AACBW" }), { today: TODAY, listedRoots: {} });
  const d = Master.decideProductEligibility({
    instrumentType: c.instrumentType, classificationStatus: c.classificationStatus,
    policyBucket: c.policyBucket, eligible: c.eligibleUsEquity, reason: c.eligibilityReason });
  assert.equal(d.status, "REVIEW");
  assert.equal(d.inProductUniverse, true);
});
