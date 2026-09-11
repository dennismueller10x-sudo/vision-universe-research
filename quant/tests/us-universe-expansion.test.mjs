/* =========================================================================
   VISION UNIVERSE — us-universe-expansion.test.mjs

   Die anhaengende Erweiterung des Aktienuniversums.

   Der Schwerpunkt ist derselbe wie beim Wertpapierstamm und aus demselben
   Grund: ein falsch angehaengter Titel faellt auf, ein still verlorener
   nicht. Die Zusage lautet, dass der Bestand ZEICHENGLEICH an derselben
   Stelle bleibt - und diese Datei greift die Wache an, die das prueft.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { appendOnlyMerge, assertAppendOnly, toUniverseEntry } =
  await import(join(root, "scripts", "market", "expand-us-universe.mjs"));

function baselineEntry(over = {}) {
  return {
    securityId: "ref_OLD", ticker: "OLD", company: null, exchange: "NASDAQ",
    country: "US", currency: "USD", assetType: "Stock", instrumentType: "COMMON_STOCK",
    active: true, providerSymbol: "OLD", provider: "tiingo",
    sector: null, sectorStatus: "SOURCE_MISSING", industry: null,
    industryStatus: "SOURCE_MISSING", startDate: "2001-05-04",
    selection: "ruleBased", ...over
  };
}
function masterRow(over = {}) {
  return {
    ticker: "NEW", exchange: "NASDAQ", country: "US", currency: "USD",
    instrument_type: "EQUITY_COMMON", classification_status: "CLASSIFIED",
    active_status: "ACTIVE", start_date: "2025-03-04", end_date: null,
    eligible_us_equity: true, eligibility_reason: "ACTIVE_US_PRIMARY_LISTED_COMMON_EQUITY",
    reconciliation_status: "ADDED", baseline_member: false, venue_tier: "PRIMARY",
    asset_type: "Stock", provider_symbol_id: "NEW", security_name: null, ...over
  };
}

/* ============================================================ ANHAENGEN */

test("EX01 der Bestand steht zeichengleich an derselben Stelle", () => {
  const baseline = [
    baselineEntry({ ticker: "AAPL", securityId: "ref_AAPL", sector: "Technology",
                    sectorStatus: "CURATED", selection: "inheritedFrom:GATE_2000" }),
    baselineEntry({ ticker: "XOM", securityId: "ref_XOM", sector: "Energy",
                    sectorStatus: "CURATED", selection: "seed" }),
    baselineEntry({ ticker: "ZZZ", securityId: "ref_ZZZ" })
  ];
  const before = JSON.parse(JSON.stringify(baseline));
  const r = appendOnlyMerge(baseline, [masterRow()]);

  /* Erste drei Zeilen: identisch, Feld fuer Feld, in derselben Reihenfolge. */
  assert.deepEqual(r.entries.slice(0, 3), before);
  assert.equal(r.entries.length, 4);
  assert.equal(r.entries[3].ticker, "NEW");
  /* Die kuratierten Sektoren ueberleben - genau das geht verloren, wenn
     jemand das Universum neu ableitet statt anzuhaengen. */
  assert.equal(r.entries[0].sector, "Technology");
  assert.equal(r.entries[0].sectorStatus, "CURATED");
  assert.equal(r.entries[1].selection, "seed");
});

test("EX02 die Neuzugaenge tragen ihre Herkunft und keine erfundenen Angaben", () => {
  const r = appendOnlyMerge([], [masterRow({ ticker: "IPO", start_date: "2026-02-02" })]);
  const e = r.entries[0];
  assert.equal(e.securityId, "ref_IPO");
  assert.equal(e.selection, "appendedFrom:US_SECURITY_MASTER");
  assert.equal(e.instrumentType, "COMMON_STOCK");
  assert.equal(e.provider, "tiingo");
  assert.equal(e.startDate, "2026-02-02");
  /* Kein erfundener Sektor. */
  assert.equal(e.sector, null);
  assert.equal(e.sectorStatus, "SOURCE_MISSING");
  assert.equal(e.industryStatus, "SOURCE_MISSING");
});

test("EX03 Ticker mit Sonderzeichen bekommen eine gueltige securityId", () => {
  const e = toUniverseEntry(masterRow({ ticker: "BRK-B" }));
  assert.equal(e.securityId, "ref_BRK_B");
  assert.equal(e.ticker, "BRK-B");
});

test("EX04 die Reihenfolge der Neuzugaenge ist stabil", () => {
  const rows = ["MMM", "AAA", "ZZZ", "BBB"].map((t) => masterRow({ ticker: t }));
  const a = appendOnlyMerge([], rows).entries.map((e) => e.ticker);
  const b = appendOnlyMerge([], rows.slice().reverse()).entries.map((e) => e.ticker);
  assert.deepEqual(a, ["AAA", "BBB", "MMM", "ZZZ"]);
  assert.deepEqual(a, b, "dieselbe Menge muss dieselbe Reihenfolge ergeben");
});

/* ======================================================== WAS DRAUSSEN BLEIBT */

test("EX10 nur ADDED kommt dazu - REVIEW und EXCLUDED_CANDIDATE nie", () => {
  const rows = [
    masterRow({ ticker: "GOOD" }),
    masterRow({ ticker: "REV", reconciliation_status: "REVIEW", eligible_us_equity: false }),
    masterRow({ ticker: "EXC", reconciliation_status: "EXCLUDED_CANDIDATE",
                instrument_type: "ETF", eligible_us_equity: false }),
    masterRow({ ticker: "EXIST", reconciliation_status: "EXISTING", baseline_member: true })
  ];
  const r = appendOnlyMerge([], rows);
  assert.deepEqual(r.entries.map((e) => e.ticker), ["GOOD"]);
  assert.equal(r.skipped.notAdded, 3);
});

test("EX11 OTC kommt ausdruecklich nicht dazu", () => {
  /* Der Wertpapierstamm fuehrt 16.641 ausserboerslich gehandelte
     Stammaktien. Sie sind Aktien und US-gelistet - und sie bleiben
     draussen, bis jemand das entscheidet. */
  const rows = [
    masterRow({ ticker: "OTCX", venue_tier: "OTC", eligible_us_equity: false,
                reconciliation_status: "REVIEW",
                eligibility_reason: "OTC_VENUE_OUT_OF_CURRENT_POLICY" }),
    /* Auch dann nicht, wenn jemand den Status auf ADDED setzt: der
       Handelsplatz wird getrennt geprueft. */
    masterRow({ ticker: "OTCY", venue_tier: "OTC", reconciliation_status: "ADDED",
                eligible_us_equity: true })
  ];
  const r = appendOnlyMerge([], rows);
  assert.equal(r.entries.length, 0);
  assert.equal(r.skipped.notPrimaryVenue, 1);
  assert.equal(r.skipped.notAdded, 1);
});

test("EX12 keine Gattung ausser EQUITY_COMMON, auch nicht mit ADDED", () => {
  for (const cls of ["PREFERRED", "WARRANT", "UNIT", "RIGHT", "ETF", "MUTUAL_FUND",
                     "ADR", "REIT", "SPAC", "TRUST", "UNKNOWN"]) {
    const r = appendOnlyMerge([], [masterRow({ ticker: "X", instrument_type: cls })]);
    assert.equal(r.entries.length, 0, cls + " darf nicht dazukommen");
    assert.equal(r.skipped.notCommonEquity, 1, cls);
  }
});

test("EX13 beendete Listings kommen nicht dazu", () => {
  const r = appendOnlyMerge([], [masterRow({ ticker: "DEAD", active_status: "INACTIVE" })]);
  assert.equal(r.entries.length, 0);
  assert.equal(r.skipped.inactive, 1);
});

test("EX14 ein Titel, der schon im Bestand steht, kommt nicht doppelt", () => {
  const baseline = [baselineEntry({ ticker: "DUP" })];
  const r = appendOnlyMerge(baseline, [masterRow({ ticker: "DUP" }), masterRow({ ticker: "dup" })]);
  assert.equal(r.entries.length, 1);
  assert.equal(r.skipped.alreadyInBaseline, 2, "Gross- und Kleinschreibung zaehlen als derselbe Ticker");
});

test("EX15 zwei Stammzeilen mit demselben Ticker ergeben eine Universumszeile", () => {
  const r = appendOnlyMerge([], [
    masterRow({ ticker: "TWICE", exchange: "NYSE" }),
    masterRow({ ticker: "TWICE", exchange: "BATS" })
  ]);
  assert.equal(r.entries.length, 1);
  assert.equal(r.skipped.duplicateWithinAppend, 1);
});

/* =================================================== DIE WACHE (Mutation) */

test("EX20 die Wache loest aus, wenn eine Bestandszeile verschwindet", () => {
  const baseline = [baselineEntry({ ticker: "A" }), baselineEntry({ ticker: "B" })];
  assert.throws(() => assertAppendOnly(baseline, [baselineEntry({ ticker: "A" })]),
                /BASELINE_ENTRY_DROPPED:B|UNIVERSE_SHRANK/);
});

test("EX21 die Wache loest aus, wenn ein Feld einer Bestandszeile sich aendert", () => {
  const baseline = [baselineEntry({ ticker: "A", sector: "Technology", sectorStatus: "CURATED" })];
  /* Genau der Verlust, gegen den die Zusage gebaut ist: der kuratierte
     Sektor wird beim Neuableiten still zu null. */
  const mutated = [baselineEntry({ ticker: "A", sector: null, sectorStatus: "SOURCE_MISSING" })];
  assert.throws(() => assertAppendOnly(baseline, mutated), /BASELINE_FIELD_CHANGED:A\.sector/);
});

test("EX22 die Wache loest aus, wenn der Bestand umsortiert wird", () => {
  const baseline = [baselineEntry({ ticker: "A" }), baselineEntry({ ticker: "B" })];
  const swapped = [baselineEntry({ ticker: "B" }), baselineEntry({ ticker: "A" })];
  assert.throws(() => assertAppendOnly(baseline, swapped), /BASELINE_ORDER_CHANGED_AT/);
});

test("EX23 die Wache loest aus, wenn ein Ticker doppelt im Ergebnis steht", () => {
  const baseline = [baselineEntry({ ticker: "A" })];
  assert.throws(() => assertAppendOnly(baseline,
    [baselineEntry({ ticker: "A" }), baselineEntry({ ticker: "A" })]),
    /DUPLICATE_TICKER_IN_RESULT:A/);
});

test("EX24 der gute Fall geht durch und meldet, was er geprueft hat", () => {
  const baseline = [baselineEntry({ ticker: "A" })];
  const result = baseline.concat([toUniverseEntry(masterRow({ ticker: "N" }))]);
  const inv = assertAppendOnly(baseline, result);
  assert.equal(inv.baselineEntries, 1);
  assert.equal(inv.resultEntries, 2);
  assert.equal(inv.appended, 1);
  assert.equal(inv.baselineEntriesDropped, 0);
  assert.ok(inv.checked.includes("BASELINE_FIELDS_UNCHANGED"));
});

test("EX25 ein Merge ohne Neuzugaenge laesst den Bestand exakt so, wie er war", () => {
  const baseline = [baselineEntry({ ticker: "A" }), baselineEntry({ ticker: "B" })];
  const before = JSON.parse(JSON.stringify(baseline));
  const r = appendOnlyMerge(baseline, []);
  assert.deepEqual(r.entries, before);
  assert.equal(r.invariants.appended, 0);
});

/* ===================================================== GEGEN DEN BESTAND */

test("EX30 gegen das echte Bestandsuniversum: 5.684 Titel ueberleben unveraendert", (t) => {
  const file = join(root, "quant", "data", "market", "scale", "universe-FULL_UNIVERSE.json");
  if (!existsSync(file)) return t.skip("Kein Bestandsuniversum.");
  const doc = JSON.parse(readFileSync(file, "utf8"));
  const baseline = doc.securities;
  const before = JSON.parse(JSON.stringify(baseline));

  /* Ein Neuzugang und ein Titel, der schon drin ist. */
  const rows = [masterRow({ ticker: "ZZTESTONLY" }),
                masterRow({ ticker: baseline[0].ticker })];
  const r = appendOnlyMerge(baseline, rows);

  assert.equal(r.entries.length, baseline.length + 1);
  assert.deepEqual(r.entries.slice(0, baseline.length), before);
  assert.equal(r.skipped.alreadyInBaseline, 1);
  assert.equal(r.invariants.baselineEntriesDropped, 0);

  /* Und die 511 Titel mit REVIEW sind alle noch da - diese Erweiterung
     entfernt nichts. */
  const tickers = new Set(r.entries.map((e) => e.ticker));
  for (const b of before) assert.ok(tickers.has(b.ticker), b.ticker + " fehlt");
});
