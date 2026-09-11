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

/* ======================================== DAS AUSGELIEFERTE ARTEFAKT (§8) */

const SM_DIR = join(root, "quant", "data", "market", "security-master");
const RECON = join(SM_DIR, "reconciliation.json");
const MASTER = join(SM_DIR, "us-security-master.json");
/* Der Bestand, gegen den der Abgleich GEMACHT wurde - nicht der, der
   heute im Universum steht.

   Seit der anhaengenden Erweiterung sind das zwei verschiedene Dinge:
   universe-FULL_UNIVERSE.json fuehrt 7.803 Titel, der Wertpapierstamm
   beschreibt den Abgleich gegen die 5.684 davor. Beide zu vergleichen
   hiesse, dem Abgleich vorzuwerfen, dass er die Zukunft nicht kannte.

   expand-us-universe.mjs legt den Stand vor der Erweiterung daneben ab -
   genau dafuer. Liegt er nicht vor, hat noch keine Erweiterung
   stattgefunden, und das Universum IST der Bestand. */
const PRE_EXPANSION = join(root, "quant", "data", "market", "security-master",
                           "universe-FULL_UNIVERSE.before-expansion.json");
const BASELINE = existsSync(PRE_EXPANSION)
  ? PRE_EXPANSION
  : join(root, "quant", "data", "market", "scale", "universe-FULL_UNIVERSE.json");

test("SM60 die ausgelieferte Stammtabelle enthaelt jeden Bestandstitel", (t) => {
  if (!existsSync(MASTER)) return t.skip("Keine Stammtabelle ausgeliefert.");
  const master = JSON.parse(readFileSync(MASTER, "utf8"));
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")).securities;

  const delivered = new Set(master.rows.filter((r) => r.baseline_member).map((r) => r.ticker));
  const missing = baseline.map((b) => b.ticker.toUpperCase()).filter((t2) => !delivered.has(t2));
  assert.deepEqual(missing, [], "Fehlende Bestandstitel: " + missing.slice(0, 10).join(", "));
  assert.equal(delivered.size, baseline.length);

  /* Jede Zeile traegt die Pflichtfelder auch dann noch, wenn der
     Schreiber sie kuerzt. */
  for (const row of master.rows) {
    for (const f of REQUIRED_FIELDS) {
      assert.ok(Object.prototype.hasOwnProperty.call(row, f), f + " fehlt an " + row.ticker);
    }
  }
  for (const f of master.schema.required) assert.ok(REQUIRED_FIELDS.includes(f), f);
});

test("SM61 kein ausgeliefertes Artefakt traegt Kursniveaus", (t) => {
  if (!existsSync(RECON)) return t.skip("Kein Abgleich ausgeliefert.");
  for (const file of [RECON, MASTER, join(SM_DIR, "summary.json"),
                      join(SM_DIR, "backfill-estimate.json")]) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const key of ["\"close\"", "\"adjustedClose\"", "\"sma20\"", "\"sma200\"",
                       "\"high52w\"", "\"low52w\"", "\"bars\""]) {
      assert.ok(!text.includes(key), "Kursfeld " + key + " in " + file);
    }
  }
});

test("SM62 der Abgleich sagt, dass er nichts angefasst hat - und nennt die Phase", (t) => {
  if (!existsSync(RECON)) return t.skip("Kein Abgleich ausgeliefert.");
  const recon = JSON.parse(readFileSync(RECON, "utf8"));
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")).securities;
  assert.equal(recon.phase, "DISCOVERY_ONLY_NO_BACKFILL");
  assert.equal(recon.version, Master.VERSION);
  assert.equal(recon.nonDestructive.baselineCount, baseline.length);
  assert.equal(recon.nonDestructive.baselinePreserved, baseline.length);
  assert.equal(recon.nonDestructive.baselineRemoved, 0);
  assert.equal(recon.invariants.destructiveViolations, 0);
  assert.equal(recon.headline.BASELINE_COUNT, baseline.length);
  assert.equal(typeof recon.headline.REVIEW_EXISTING, "number");
  /* Die Kernzusage als Rechnung: jeder Bestandstitel ist entweder
     bestaetigt oder zur Pruefung gestellt. Ein dritter Ausgang - etwa
     "entfernt" - existiert nicht, und diese Summe ist der Ort, an dem
     er auffiele. */
  assert.equal(recon.headline.MATCHED_EXISTING + recon.headline.REVIEW_EXISTING,
               baseline.length,
               "MATCHED_EXISTING + REVIEW_EXISTING muss BASELINE_COUNT ergeben");
  assert.equal(recon.headline.BASELINE_ACCOUNTED_FOR, baseline.length);
  /* Ein Bestandstitel darf im ausgelieferten Artefakt nie als
     Neuaufnahme oder Ausschluss stehen. */
  for (const row of recon.rows.filter((r) => r.baseline_member)) {
    assert.ok(["EXISTING", "REVIEW"].includes(row.reconciliation_status), row.ticker);
  }
});

test("SM64 Abgleich und Stammtabelle widersprechen sich nicht", (t) => {
  if (!existsSync(RECON) || !existsSync(MASTER)) return t.skip("Artefakte fehlen.");
  const recon = JSON.parse(readFileSync(RECON, "utf8"));
  const master = JSON.parse(readFileSync(MASTER, "utf8"));

  /* Der Abgleich fuehrt genau die Zeilen, die eine Entscheidung
     brauchen. Die Stammtabelle fuehrt alle. Beides muss dieselbe
     Auszaehlung ergeben - sonst ist eine der beiden Dateien alt. */
  assert.equal(recon.rowsElsewhere.count, master.rows.length);
  assert.deepEqual(recon.counts.byInstrumentType, master.counts.byInstrumentType);
  assert.equal(recon.version, master.version);

  const decidedInMaster = master.rows.filter((r) => r.reconciliation_status !== "EXISTING");
  assert.equal(recon.rowsNeedingDecision, decidedInMaster.length);
  assert.equal(recon.rows.length, recon.rowsNeedingDecision);
  const reconTickers = new Set(recon.rows.map((r) => r.ticker));
  for (const row of decidedInMaster) {
    assert.ok(reconTickers.has(row.ticker), row.ticker + " fehlt im Abgleich");
  }
  /* Und die gekuerzte Stammzeile darf nie eine sein, die etwas zu
     erklaeren haette. */
  for (const row of master.rows) {
    if (!Object.prototype.hasOwnProperty.call(row, "classification_reasons")) {
      assert.equal(row.reconciliation_status, "EXISTING", row.ticker);
      assert.equal(row.classification_status, "CLASSIFIED", row.ticker);
    }
  }
});

test("SM65 die Aufteilung der Neuzugaenge zaehlt genauso viele wie die Kennzahl", (t) => {
  if (!existsSync(RECON)) return t.skip("Kein Abgleich ausgeliefert.");
  const recon = JSON.parse(readFileSync(RECON, "utf8"));
  const a = recon.additions;
  if (!a || a.status === "NOT_MEASURABLE_WITHOUT_PROVIDER_LIST") {
    /* Ohne Anbieterliste gibt es keine Neuzugaenge zu zaehlen - dann
       muss die Kennzahl das genauso sagen und darf keine Zahl nennen. */
    assert.equal(typeof recon.headline.NEW_ELIGIBLE_ADDITIONS, "object");
    return;
  }
  assert.equal(a.total, recon.headline.NEW_ELIGIBLE_ADDITIONS);
  const sumExchanges = Object.values(a.byExchange).reduce((x, y) => x + y, 0);
  assert.equal(sumExchanges, a.total, "Boersenaufteilung muss sich zur Gesamtzahl addieren");
  const sumYears = Object.values(a.byStartYear).reduce((x, y) => x + y, 0);
  assert.equal(sumYears, a.total, "Jahresaufteilung muss sich zur Gesamtzahl addieren");
  const h = a.historyRule;
  assert.equal(h.belowRule + h.atOrAboveRule + h.noStartDate, a.total,
               "Die Drei-Jahres-Regel teilt die Neuzugaenge vollstaendig auf");
});

test("SM63 die Backfill-Schaetzung verlangt eine Freigabe und startet nichts", (t) => {
  const file = join(root, "quant", "data", "market", "security-master", "backfill-estimate.json");
  if (!existsSync(file)) return t.skip("Keine Schaetzung ausgeliefert.");
  const est = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(est.approvalRequired, true);
  assert.equal(est.estimate.fullRerun.necessary, false);
  /* Beendete Listings gehoeren nicht in die Nachholliste: ihre
     Historie ist vollstaendig, ein erneuter Abruf liefert dieselbe
     Reihe. Die Zahl kommt aus dem Referenzlauf und nicht aus dem
     active-Feld. */
  const inc = est.estimate.incremental;
  assert.equal(inc.symbolsToFetch, inc.newSymbols + inc.staleSymbols);
  assert.ok(inc.staleBasis.includes("stale_last_bar"), inc.staleBasis);
  /* Die Zahl kommt aus dem Referenzlauf und wird dort nachgelesen -
     nicht aus dem active-Feld des Stamms abgeleitet. */
  const gateFile = join(root, "quant", "data", "market", "scale", "gate-FULL_UNIVERSE.json");
  if (existsSync(gateFile)) {
    const gate = JSON.parse(readFileSync(gateFile, "utf8"));
    /* Nur vergleichen, wenn beide vom SELBEN Lauf stammen.

       Die Schaetzung ist eine Momentaufnahme vor einem Lauf; die
       Gate-Bilanz entsteht danach. Nach der Erweiterung liegt eine
       neuere Bilanz vor (stale_last_bar 58 statt 34), und die
       Schaetzung von vorher dagegen zu halten hiesse, ihr vorzuwerfen,
       dass sie den Lauf nicht kannte, den sie geplant hat. */
    const sameRun = est.estimate.referenceRun &&
                    String(est.estimate.referenceRun.runId) === String(gate.run && gate.run.runId);
    if (sameRun) {
      assert.equal(inc.staleSymbols, gate.dataQuality.reasons.stale_last_bar || 0,
                   "stale kommt aus dataQuality.reasons.stale_last_bar des Referenzlaufs");
    } else {
      /* Andernfalls muss die Schaetzung wenigstens sagen, auf welchen
         Lauf sie sich beruft - sonst ist sie nicht nachpruefbar. */
      assert.ok(est.estimate.referenceRun && est.estimate.referenceRun.runId,
                "eine Schaetzung ohne Referenzlauf ist nicht nachpruefbar");
    }
  }
  assert.ok(est.estimate.aggregatesToRebuild.mustRebuild.length > 0);
  assert.ok(est.estimate.aggregatesToRebuild.mustNotRebuild.length > 0);
  /* Kein Pfad darf zugleich neu zu bauen und zu erhalten sein. */
  const rebuild = new Set(est.estimate.aggregatesToRebuild.mustRebuild.map((x) => x.path));
  for (const keep of est.estimate.aggregatesToRebuild.mustNotRebuild) {
    assert.ok(!rebuild.has(keep.path), keep.path + " steht in beiden Listen");
  }
});
