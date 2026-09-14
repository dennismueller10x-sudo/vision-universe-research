/* Company Name Enrichment: Regeln, Vorrang, Identitaet und das
   ausgelieferte Artefakt. Kein Ticker als Name, keine leeren Strings,
   deterministischer Vorrang, gleiche securityId = gleicher Name,
   Klassenaktien getrennt, Mitgliedschaft unveraendert. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, mkdtempSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CN = await import("../../scripts/market/build-company-names.mjs");
const { resolveProductUniverse } = await import("../../scripts/market/universe-source.mjs");
const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));
const LAYER = join(root, CN.OUT_FILE);
const vorhanden = existsSync(LAYER);

test("CN1 · Ein Name ist nie leer und nie der Ticker", () => {
  assert.equal(CN.validName("", "AAPL").reason, "EMPTY");
  assert.equal(CN.validName("   ", "AAPL").reason, "EMPTY");
  assert.equal(CN.validName(null, "AAPL").reason, "EMPTY");
  assert.equal(CN.validName("AAPL", "AAPL").reason, "TICKER_AS_NAME");
  assert.equal(CN.validName("aapl", "AAPL").reason, "TICKER_AS_NAME");
  assert.equal(CN.validName("BRK.B", "BRK-B").reason, "TICKER_AS_NAME");
  assert.equal(CN.validName("XYZW", "ABCD").reason, "TICKER_LIKE");
  assert.equal(CN.validName("Aon", "AON").name, "Aon", "ein echter Name in Eigenschreibweise ist kein Ticker");
  assert.equal(CN.validName("AON", "AON").reason, "TICKER_AS_NAME");
  assert.equal(CN.validName("Apple Inc", "AAPL").name, "Apple Inc");
  assert.equal(CN.validName("  Visa   Inc.  ", "V").name, "Visa Inc.");
});

test("CN2 · displayName kuerzt nur die Rechtsform und erhaelt den Klassenzusatz", () => {
  assert.equal(CN.deriveDisplayName("Palantir Technologies Inc."), "Palantir Technologies");
  assert.equal(CN.deriveDisplayName("Visa Inc"), "Visa");
  assert.equal(CN.deriveDisplayName("Microsoft Corporation"), "Microsoft");
  assert.equal(CN.deriveDisplayName("Alphabet Inc - Class A"), "Alphabet Class A");
  assert.equal(CN.deriveDisplayName("Berkshire Hathaway Inc - Class B"), "Berkshire Hathaway Class B");
  assert.equal(CN.deriveDisplayName("Eli Lilly and Company"), "Eli Lilly and Company");
  assert.equal(CN.deriveDisplayName("JPMorgan Chase & Co."), "JPMorgan Chase & Co.");
  /* Ein Name, der nur aus der Rechtsform besteht, bleibt ganz. */
  assert.equal(CN.deriveDisplayName("Inc"), "Inc");
  assert.equal(CN.deriveDisplayName(""), null);
});

test("CN2b · Kuerzung laesst keinen Rumpf zurueck, der wie ein Ticker aussieht", () => {
  assert.equal(CN.deriveDisplayName("ABCD Inc"), "ABCD Inc");
  assert.equal(CN.deriveDisplayName("AT&T Inc."), "AT&T");
  assert.equal(CN.deriveDisplayName("AON PLC", "AON"), "AON PLC", "Rumpf = Ticker: der volle Name bleibt");
  assert.equal(CN.deriveDisplayName("Aon plc", "AON"), "Aon plc");
});

test("CN3 · Vorrang ist deterministisch: Anbieter vor SEC vor kuratiert; Verworfenes faellt durch", () => {
  const alle = { TIINGO_METADATA: { name: "Palantir Technologies Inc", asOf: "2026-09-14" },
                 SEC_COMPANY_TICKERS: { name: "Palantir Technologies Inc.", cik: "0001321655", asOf: "2026-09-14" },
                 VU_CURATED: { name: "Palantir", asOf: "2026-09-14" } };
  const a = CN.resolveName("PLTR", alle), b = CN.resolveName("PLTR", JSON.parse(JSON.stringify(alle)));
  assert.deepEqual(a, b, "gleiche Kandidaten, gleiches Ergebnis");
  assert.equal(a.nameSource, "TIINGO_METADATA"); assert.equal(a.companyName, "Palantir Technologies Inc");
  assert.equal(a.displayName, "Palantir Technologies"); assert.equal(a.cik, null);
  const ohneAnbieter = CN.resolveName("PLTR", { SEC_COMPANY_TICKERS: alle.SEC_COMPANY_TICKERS, VU_CURATED: alle.VU_CURATED });
  assert.equal(ohneAnbieter.nameSource, "SEC_COMPANY_TICKERS"); assert.equal(ohneAnbieter.cik, "0001321655");
  const nurKuratiert = CN.resolveName("PLTR", { VU_CURATED: alle.VU_CURATED });
  assert.equal(nurKuratiert.nameSource, "VU_CURATED"); assert.equal(nurKuratiert.companyName, "Palantir");
  /* Ein Anbieter-Kandidat, der nur der Ticker ist, gewinnt nicht - die naechste Quelle greift. */
  const schlecht = CN.resolveName("PLTR", { TIINGO_METADATA: { name: "PLTR" }, VU_CURATED: alle.VU_CURATED });
  assert.equal(schlecht.nameSource, "VU_CURATED"); assert.deepEqual(schlecht.rejected, ["TIINGO_METADATA:TICKER_AS_NAME"]);
  const nichts = CN.resolveName("PLTR", { TIINGO_METADATA: { name: null, reason: "unavailable" } });
  assert.equal(nichts.companyName, null); assert.equal(nichts.nameSource, null);
});

test("CN4 · SEC-Zuordnung nur ueber Schluessel: Ticker + Boersenfamilie, nie bei Widerspruch oder Mehrdeutigkeit", () => {
  const map = CN.parseSecTickerMap({ fields: ["cik", "name", "ticker", "exchange"], data: [
    [320193, "Apple Inc.", "AAPL", "Nasdaq"],
    [1067983, "BERKSHIRE HATHAWAY INC", "BRK-B", "NYSE"],
    [1067983, "BERKSHIRE HATHAWAY INC", "BRK-A", "NYSE"],
    [1652044, "Alphabet Inc.", "GOOGL", "Nasdaq"],
    [1652044, "Alphabet Inc.", "GOOG", "Nasdaq"],
    [11, "Doppelt Eins", "DUP", "Nasdaq"], [12, "Doppelt Zwei", "DUP", "Nasdaq"],
    [13, "Ohne Boerse Corp", "OHNE", null],
    [14, "Andere Boerse Corp", "AND", "NYSE"]
  ] });
  assert.equal(CN.secCandidate(map, "AAPL", "NASDAQ").candidate.cik, "0000320193");
  assert.equal(CN.secCandidate(map, "AAPL", "NASDAQ").candidate.identity, "TICKER+EXCHANGE");
  assert.equal(CN.secCandidate(map, "BRK-B", "NYSE").candidate.name, "BERKSHIRE HATHAWAY INC");
  assert.equal(CN.secCandidate(map, "GOOG", "NASDAQ").candidate.cik, CN.secCandidate(map, "GOOGL", "NASDAQ").candidate.cik,
               "Klassenaktien: gleiche Gesellschaft, getrennte Zeilen");
  assert.equal(CN.secCandidate(map, "DUP", "NASDAQ").reason, "SEC_AMBIGUOUS");
  assert.equal(CN.secCandidate(map, "OHNE", "NASDAQ").candidate.identity, "TICKER_ONLY");
  assert.equal(CN.secCandidate(map, "AND", "NASDAQ").reason, "SEC_EXCHANGE_MISMATCH");
  assert.equal(CN.secCandidate(map, "NEU", "NASDAQ").reason, "SEC_TICKER_UNKNOWN");
  assert.equal(CN.exchangeFamily("NYSE MKT"), "AMEX"); assert.equal(CN.exchangeFamily("NYSE American"), "AMEX");
  assert.equal(CN.exchangeFamily("Cboe BZX"), "BATS"); assert.equal(CN.exchangeFamily("Wurst"), null);
});

test("CN5 · Anbieter-Stammdaten: nur bei gleichem Symbol; kein Name -> kein Name; alles mit Herkunft", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vu-cn-"));
  try {
    for (const f of ["quant/data/market/security-master/eligibility.json", "quant/data/market/scale/universe-FULL_UNIVERSE.json",
                     "scripts/market/universe-source.mjs", "discover/config/company-names.json"]) {
      mkdirSync(join(dir, dirname(f)), { recursive: true }); cpSync(join(root, f), join(dir, f));
    }
    const antworten = {
      ref_AAPL: { available: true, data: { providerSymbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ" } },
      ref_V: { available: true, data: { providerSymbol: "V", name: "Visa Inc", exchange: "NYSE" } },
      ref_PLTR: { available: true, data: { providerSymbol: "PLTX", name: "Falscher Titel", exchange: "NASDAQ" } },
      ref_NFLX: { available: true, data: { providerSymbol: "NFLX", name: null } },
      ref_MU: { available: false, reason: "rateLimited" }
    };
    const provider = { getMetadata: (id) => Promise.resolve(antworten[id] || { available: false, reason: "notInFixture" }) };
    process.env.TIINGO_API_KEY = process.env.TIINGO_API_KEY || "test-key";
    const { out } = await CN.buildCompanyNames({ root: dir, tiingo: true, provider, maxRequests: 7004, concurrency: 2,
                                                 now: () => new Date("2026-09-14T06:00:00Z") });
    const zeile = (t) => out.rows.find((r) => r.ticker === t);
    assert.equal(out.stats.tiingo.requested, 7004, "jeder offene Titel wird genau einmal gefragt");
    assert.equal(zeile("AAPL").nameSource, "TIINGO_METADATA"); assert.equal(zeile("AAPL").nameAsOf, "2026-09-14");
    assert.equal(zeile("V").companyName, "Visa Inc"); assert.equal(zeile("V").displayName, "Visa");
    assert.equal(zeile("PLTR").candidates.TIINGO_METADATA.name, null, "fremdes Symbol wird nicht uebernommen");
    assert.match(zeile("PLTR").candidates.TIINGO_METADATA.reason, /PROVIDER_SYMBOL_MISMATCH/);
    assert.equal(zeile("NFLX").status, "UNRESOLVED"); assert.equal(zeile("NFLX").reason, "PROVIDER_HAS_NO_NAME");
    assert.equal(zeile("MU").candidates.TIINGO_METADATA.reason, "rateLimited");
    assert.ok(out.rows.every((r) => r.status !== "RESOLVED" || (r.companyName && r.nameSource && r.nameAsOf)), "Herkunft fehlt");
    assert.equal(out.rows.length, 7004, "Zeilen = Produktuniversum");
    /* Zweiter Lauf ohne Anbieter: Kandidaten bleiben, Ergebnis identisch. */
    const zwei = await CN.buildCompanyNames({ root: dir, now: () => new Date("2026-09-14T07:00:00Z") });
    assert.equal(zwei.out.rows.find((r) => r.ticker === "AAPL").companyName, "Apple Inc");
    assert.deepEqual(zwei.out.counts.bySource, out.counts.bySource);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CN6 · Das ausgelieferte Artefakt: Produktuniversum, kein Ticker als Name, gleiche securityId = gleicher Name", { skip: !vorhanden }, () => {
  const layer = readJSON(LAYER);
  const u = resolveProductUniverse(root);
  assert.equal(layer.version, CN.VERSION);
  assert.deepEqual(layer.sourcePriority, CN.SOURCE_PRIORITY);
  assert.equal(layer.master.sha256, u.sha256, "Namensschicht gehoert zu diesem Master");
  const ids = new Set(u.securities.map((s) => s.securityId));
  assert.equal(layer.rows.length, ids.size);
  const gesehen = new Map();
  for (const r of layer.rows) {
    assert.ok(ids.has(r.securityId), r.securityId + " nicht im Produktuniversum");
    assert.ok(!gesehen.has(r.securityId), "securityId doppelt"); gesehen.set(r.securityId, r.companyName);
    if (r.status === "RESOLVED") {
      assert.ok(CN.validName(r.companyName, r.ticker).ok, r.ticker + ": " + r.companyName);
      assert.ok(r.displayName && CN.validName(r.displayName, r.ticker).ok, r.ticker + " displayName: " + r.displayName);
      assert.ok(CN.SOURCE_PRIORITY.includes(r.nameSource)); assert.match(r.nameAsOf, /^\d{4}-\d{2}-\d{2}$/);
      assert.deepEqual(CN.resolveName(r.ticker, r.candidates).companyName, r.companyName, r.ticker + ": Vorrang nachgerechnet");
    } else {
      assert.equal(r.companyName, null); assert.ok(r.reason, r.ticker + " ohne Grund");
    }
  }
  /* Klassenaktien bleiben eigene Zeilen mit eigener Identitaet. */
  for (const [a, b] of [["GOOGL", "GOOG"], ["BRK-A", "BRK-B"]]) {
    const ra = layer.rows.find((r) => r.ticker === a), rb = layer.rows.find((r) => r.ticker === b);
    assert.ok(ra && rb); assert.notEqual(ra.securityId, rb.securityId);
  }
  /* Mitgliedschaft und Sektor-Overlay unveraendert. */
  assert.equal(u.counts.productUniverse, 7004);
  assert.equal(u.securities.filter((s) => s.sectorStatus === "CURATED").length, u.curatedSectors.securities);
  assert.equal(u.companyNames.resolved, layer.counts.resolved);
  assert.ok(u.securities.every((s) => !s.companyName || s.companyName.toUpperCase() !== s.ticker));
  const summary = readJSON(join(root, CN.SUMMARY_FILE));
  assert.equal(summary.coverage.withName, layer.counts.resolved);
  assert.equal(summary.coverage.productUniverse, 7004);
  assert.equal(summary.spotCheck.length, CN.SPOT_CHECK.length);
});
