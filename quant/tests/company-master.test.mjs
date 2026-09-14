/* =========================================================================
   COMPANY MASTER — die Fragen, deren falsche Antwort man spaet merkt

   Ein Universum hat eine unangenehme Eigenschaft: Fehler sind still. Eine
   doppelt vergebene ID faellt nicht auf, eine ID, die sich bei jedem Lauf
   aendert, faellt nicht auf, ein Titel, der beim Sync verschwindet, faellt
   nicht auf - bis jemand Monate spaeter eine Historie sucht, die es nicht
   mehr gibt.

   Geprueft wird deshalb nicht "laeuft es durch", sondern:

     - Bleibt eine ID ueber Laeufe hinweg dieselbe?
     - Bekommt ein wiederverwendetes Kuerzel eine EIGENE ID?
     - Ueberlebt ein Titel, den der Anbieter nicht mehr fuehrt?
     - Faellt eine Dublette auf, statt stillschweigend zusammengefasst zu werden?
     - Findet die Suche einen Titel, der in keiner Reihe steht?
     - Laesst sich eine bestehende URL nach der Erweiterung noch aufloesen?
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Master = require("../engines/company-master.js");
const Directory = require("../engines/instrument-directory.js");

const TODAY = "2026-09-12";
function readJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }

/* Anbieterzeilen, wie sie aus supported_tickers kommen. */
function row(ticker, over) {
  return Object.assign({
    ticker, exchange: "NASDAQ", assetType: "Stock", priceCurrency: "USD",
    startDate: "2010-01-04", endDate: "", name: null
  }, over || {});
}
function toInstruments(rows) {
  return rows.map((r) => Master.toInstrument(r, { today: TODAY, provider: "tiingo" }));
}
function sync(previous, rows) {
  return Master.syncUniverse({ previous, incoming: toInstruments(rows), today: TODAY,
                               provider: "tiingo" });
}

/* ------------------------------------------------------------- Identitaet */

test("die ID haengt nicht am Ticker", () => {
  const s = sync([], [row("AAPL")]);
  const inst = s.instruments[0];
  assert.notEqual(inst.instrumentId, "AAPL");
  assert.notEqual(inst.instrumentId, "ref_AAPL");
  assert.match(inst.instrumentId, /^vu_[0-9a-f]{14}$/);
});

test("dieselbe Anbieterzeile ergibt bei jedem Lauf dieselbe ID", () => {
  const a = sync([], [row("AAPL")]).instruments[0].instrumentId;
  const b = sync([], [row("AAPL")]).instruments[0].instrumentId;
  assert.equal(a, b);
});

test("ein korrigiertes Startdatum aendert die ID NICHT", () => {
  /* Anbieter korrigieren Startdaten nachtraeglich. Eine ID, die sich
     dabei aendert, ist keine ID. */
  const erst = sync([], [row("AAPL", { startDate: "1980-12-12" })]);
  const dann = sync(erst.instruments, [row("AAPL", { startDate: "1980-12-15" })]);
  assert.equal(dann.instruments[0].instrumentId, erst.instruments[0].instrumentId);
  assert.equal(dann.counts.updated, 1);
  assert.deepEqual(dann.changes.updated[0].fields, ["firstTradeDate"]);
});

test("derselbe Ticker an zwei Boersen sind zwei Instrumente", () => {
  /* Kein konstruierter Fall: COHR liegt im Anbieterverzeichnis an NYSE
     UND an NASDAQ. */
  const s = sync([], [row("COHR", { exchange: "NYSE" }), row("COHR", { exchange: "NASDAQ" })]);
  assert.equal(s.instruments.length, 2);
  assert.notEqual(s.instruments[0].instrumentId, s.instruments[1].instrumentId);
});

test("ein wiederverwendetes Kuerzel bekommt eine eigene ID", () => {
  const alt = sync([], [row("XYZ", { startDate: "1995-01-03", endDate: "2015-06-30" })]);
  assert.equal(alt.instruments[0].active, false);

  const neu = sync(alt.instruments, [row("XYZ", { startDate: "2021-03-01" })]);
  const ids = new Set(neu.instruments.map((i) => i.instrumentId));
  assert.equal(neu.instruments.length, 2, "beide Generationen bleiben im Master");
  assert.equal(ids.size, 2);
  assert.equal(neu.counts.new, 1);
  assert.equal(neu.instruments.filter((i) => i.generation === 1).length, 1);
});

test("die bestehende securityId bleibt als Alias erhalten - in der Schreibweise des Bestands", () => {
  const s = sync([], [row("BRK-A", { exchange: "NYSE" })]);
  assert.deepEqual(s.instruments[0].legacyIds, ["ref_BRK_A"]);
  const mit = sync([], [Object.assign(row("AAPL"), { securityId: "ref_AAPL" })]);
  assert.deepEqual(mit.instruments[0].legacyIds, ["ref_AAPL"]);
});

/* ------------------------------------------------------------------ Sync */

test("ein zweiter Lauf auf derselben Quelle aendert nichts", () => {
  const rows = [row("AAPL"), row("MSFT"), row("NVDA")];
  const erst = sync([], rows);
  const zweit = Master.syncUniverse({ previous: erst.instruments, incoming: toInstruments(rows),
                                      today: "2026-10-01", provider: "tiingo" });
  assert.equal(zweit.counts.unchanged, 3);
  assert.equal(zweit.counts.new, 0);
  assert.equal(zweit.counts.updated, 0);
  assert.equal(zweit.counts.delisted, 0);
  assert.deepEqual(zweit.instruments, erst.instruments);
});

test("ein Titel, den der Anbieter nicht mehr fuehrt, wird beendet - nicht geloescht", () => {
  const erst = sync([], [row("AAPL"), row("WEG")]);
  const zweit = sync(erst.instruments, [row("AAPL")]);
  assert.equal(zweit.instruments.length, 2, "nichts verschwindet (§11)");
  const weg = zweit.instruments.find((i) => i.symbol === "WEG");
  assert.equal(weg.active, false);
  assert.equal(weg.delistedAt, TODAY);
  assert.equal(weg.screenerEligible, false);
  assert.match(weg.activeBasis, /nicht mehr im Anbieterverzeichnis/);
  assert.equal(zweit.counts.delisted, 1);
});

test("ein Titel mit Enddatum behaelt dieses Datum als Delisting-Datum", () => {
  const erst = sync([], [row("ALT", { endDate: "2019-04-12" })]);
  const zweit = sync(erst.instruments, []);
  assert.equal(zweit.instruments[0].delistedAt, "2019-04-12");
});

test("ein beendeter Titel, der zurueckkehrt, wird als REACTIVATED gefuehrt", () => {
  const erst = sync([], [row("ZURU", { startDate: "2005-02-01", endDate: "2024-01-05" })]);
  assert.equal(erst.instruments[0].active, false);
  /* Dieselbe Zeile, aber ohne Enddatum und mit demselben Startdatum: der
     Anbieter fuehrt das Listing wieder als laufend. */
  const zweit = sync(erst.instruments, [row("ZURU", { startDate: "2005-02-01" })]);
  assert.equal(zweit.counts.reactivated, 1);
  assert.equal(zweit.counts.new, 0);
  assert.equal(zweit.instruments.length, 1, "keine zweite Generation");
  assert.equal(zweit.instruments[0].instrumentId, erst.instruments[0].instrumentId);
  /* Nicht `true`: der Anbieter hat das Enddatum zurueckgezogen, mehr
     nicht. "laeuft wieder" ist belegt, "laeuft" ist es nicht - und der
     Unterschied steht im Feld, nicht in einer Annahme. */
  assert.notEqual(zweit.instruments[0].active, false);
  assert.equal(zweit.instruments[0].delistedAt, null);
  assert.match(zweit.instruments[0].activeBasis, /kein endDate/);
});

test("eine einmal aufgeloeste CIK geht nicht verloren, nur weil die Tickerliste sie nicht kennt", () => {
  const erst = sync([], [Object.assign(row("AAPL"), { cik: "0000320193", cikSource: "sec" })]);
  assert.equal(erst.instruments[0].cik, "0000320193");
  const zweit = sync(erst.instruments, [row("AAPL")]);
  assert.equal(zweit.instruments[0].cik, "0000320193");
  assert.equal(zweit.counts.unchanged, 1);
});

/* ----------------------------------------------------- Klassifikation */

test("Gattungen werden getrennt gefuehrt, nicht als Aktien durchgereicht", () => {
  const s = sync([], [
    row("AAPL"),
    row("SPY", { exchange: "NYSE ARCA", assetType: "ETF" }),
    row("BAC-PB", { exchange: "NYSE" }),
    row("CTA-P-B", { exchange: "NYSE" }),
    row("ABC-WT"),
    row("VFINX", { assetType: "Mutual Fund" }),
    row("BRK-B", { exchange: "NYSE" })
  ]);
  const byType = {};
  s.instruments.forEach((i) => { byType[i.symbol] = i.securityType; });
  assert.equal(byType.AAPL, "COMMON_STOCK");
  assert.equal(byType.SPY, "ETF");
  assert.equal(byType["BAC-PB"], "PREFERRED");
  /* Beide Schreibweisen des Anbieters, nicht nur die zusammengezogene. */
  assert.equal(byType["CTA-P-B"], "PREFERRED");
  assert.equal(byType["ABC-WT"], "WARRANT");
  assert.equal(byType.VFINX, "FUND");
  assert.equal(byType["BRK-B"], "COMMON_STOCK", "ein Klassenbuchstabe ist keine eigene Gattung");
  assert.equal(s.instruments.find((i) => i.symbol === "BRK-B").shareClass, "B");
});

test("ein OTC-Titel ist kein Primaerlisting und sagt warum", () => {
  const s = sync([], [row("OTCX", { exchange: "PINK" })]);
  const i = s.instruments[0];
  assert.equal(i.otc, true);
  assert.equal(i.primaryListing, false);
  assert.match(i.primaryListingBasis, /otcVenue/);
});

/* ---------------------------------------------------------- Datenqualitaet */

test("zwei aktive Listings unter einem Kuerzel an einer Boerse sind ein Befund", () => {
  const a = Master.toInstrument(row("DUP"), { today: TODAY });
  const b = Master.toInstrument(row("DUP"), { today: TODAY });
  a.instrumentId = "vu_00000000000001";
  b.instrumentId = "vu_00000000000002";
  const q = Master.qualityReport([a, b]);
  assert.equal(q.findings.duplicateSymbols.length, 1);
  assert.equal(q.blocking, true);
});

test("ein wiederverwendetes Kuerzel ist KEIN Dublettenbefund", () => {
  const alt = sync([], [row("XYZ", { startDate: "1995-01-03", endDate: "2015-06-30" })]);
  const neu = sync(alt.instruments, [row("XYZ", { startDate: "2021-03-01" })]);
  const q = Master.qualityReport(neu.instruments);
  assert.equal(q.findings.duplicateSymbols.length, 0);
  assert.equal(q.blocking, false);
});

test("eine CIK auf zwei Aktienklassen ist kein Befund, dieselbe CIK zweimal am selben Kuerzel schon", () => {
  const mk = (sym, cik, id) => {
    const i = Master.toInstrument(Object.assign(row(sym, { exchange: "NYSE" }), { cik }), { today: TODAY });
    i.instrumentId = id;
    return i;
  };
  const klassen = Master.qualityReport([mk("BF-A", "0000014693", "vu_1"), mk("BF-B", "0000014693", "vu_2")]);
  assert.equal(klassen.findings.duplicateCiks.length, 0);
  const echt = Master.qualityReport([mk("BF-A", "0000014693", "vu_1"), mk("BF-A", "0000014693", "vu_2")]);
  assert.equal(echt.findings.duplicateCiks.length, 1);
});

test("eine unplausible CIK blockiert", () => {
  const i = Master.toInstrument(Object.assign(row("AAPL"), { cik: "320193" }), { today: TODAY });
  i.instrumentId = "vu_1";
  const q = Master.qualityReport([i]);
  assert.equal(q.findings.invalidCik.length, 1);
  assert.equal(q.blocking, true);
});

/* --------------------------------------------------------- Faehigkeiten */

test("eine Faehigkeit ohne Beleg ist false, nicht wahrscheinlich", () => {
  const i = Master.toInstrument(row("AAPL"), { today: TODAY });
  const leer = Master.capabilityMatrix(i, {});
  assert.equal(leer.HAS_PRICE_HISTORY, false);
  assert.equal(leer.HAS_FUNDAMENTALS, false);
  assert.equal(leer.HAS_SEC, false);
  assert.equal(leer.HAS_PROFILE, true, "das Instrument selbst ist der Beleg");
});

test("ein belegter Kursverlauf ohne gezaehlte Bars zaehlt trotzdem", () => {
  /* Der Gate-Bericht fuehrt Einzelzeilen nur fuer Befunde: wer sauber
     durchlief, steht dort NICHT. */
  const i = Master.toInstrument(row("AAPL"), { today: TODAY });
  assert.equal(Master.capabilityMatrix(i, { priceHistoryVerified: true }).HAS_PRICE_HISTORY, true);
  assert.equal(Master.capabilityMatrix(i, { priceHistoryBars: 0 }).HAS_PRICE_HISTORY, false);
});

test("HAS_SEC haengt an der CIK und an nichts sonst", () => {
  const ohne = Master.toInstrument(row("AAPL"), { today: TODAY });
  const mit = Master.toInstrument(Object.assign(row("AAPL"), { cik: "0000320193" }), { today: TODAY });
  assert.equal(Master.capabilityMatrix(ohne, {}).HAS_SEC, false);
  assert.equal(Master.capabilityMatrix(mit, {}).HAS_SEC, true);
});

/* ---------------------------------------------------------------- Suche */

test("ein exakter Ticker steht vor allem anderen", () => {
  const entries = [
    { i: "1", s: "NVR", n: "NVR Inc", a: 1 },
    { i: "2", s: "NVDA", n: "NVIDIA Corporation", a: 1 },
    { i: "3", s: "NVAX", n: "Novavax", a: 1 }
  ];
  assert.equal(Master.rankMatches(entries, "NVDA", 5)[0].s, "NVDA");
});

test("ein Namenstreffer wird gefunden, auch wenn das Kuerzel nichts damit zu tun hat", () => {
  const entries = [{ i: "1", s: "PLTR", n: "Palantir Technologies", a: 1 }];
  assert.equal(Master.rankMatches(entries, "PALANTIR", 5).length, 1);
});

test("ein beendetes Listing steht hinter einem laufenden", () => {
  const entries = [
    { i: "1", s: "ABCD", n: null, a: 0 },
    { i: "2", s: "ABCE", n: null, a: 1 }
  ];
  assert.equal(Master.rankMatches(entries, "ABC", 5)[0].s, "ABCE");
});

test("die Scherbenregel ist stabil und faengt Sonderzeichen ab", () => {
  assert.equal(Master.shardKey("AAPL"), "AA");
  assert.equal(Master.shardKey("A"), "A_");
  assert.equal(Master.shardKey("BRK-B"), "BR");
  assert.equal(Master.shardKey(""), "_");
  assert.equal(Master.shardKey("a"), "A_");
});

/* ------------------------------------------------ Deckungsbericht (§43) */

test("der Deckungsbericht zaehlt, statt zu runden", () => {
  const s = sync([], [
    row("AAPL"), row("MSFT"),
    row("SPY", { exchange: "NYSE ARCA", assetType: "ETF" }),
    row("TOT", { endDate: "2020-01-01" })
  ]);
  const t = Master.coverageReport(s.instruments, { providerInstruments: 108573 });
  assert.equal(t.TOTAL_IN_COMPANY_MASTER, 4);
  assert.equal(t.TOTAL_COMMON_STOCKS, 3);
  assert.equal(t.TOTAL_ETFS, 1);
  assert.equal(t.TOTAL_INACTIVE, 1);
  assert.equal(t.TOTAL_PROVIDER_INSTRUMENTS, 108573);
  assert.equal(t.TOTAL_WITH_CIK, 0);
  assert.equal(
    t.TOTAL_COMMON_STOCKS + t.TOTAL_ADRS + t.TOTAL_ETFS + t.TOTAL_ETNS + t.TOTAL_FUNDS +
    t.TOTAL_PREFERRED + t.TOTAL_WARRANTS + t.TOTAL_OTHER + t.TOTAL_UNKNOWN_TYPE,
    t.TOTAL_IN_COMPANY_MASTER);
});

test("nicht gemessen ist null, nicht 0", () => {
  const t = Master.coverageReport([], {});
  assert.equal(t.TOTAL_PROVIDER_INSTRUMENTS, null);
});

/* ================================================== Gegen den echten Stand

   Ab hier wird nicht mehr mit Fixtures gerechnet, sondern gegen das, was
   im Repository liegt. Ein Test, der nur Fixtures kennt, faellt nicht auf,
   wenn der ausgelieferte Stand etwas anderes sagt. */

const MASTER_DIR = join(root, "quant", "data", "universe", "instruments");
const vorhanden = existsSync(MASTER_DIR);

function ladeMaster() {
  const out = [];
  for (const f of readdirSync(MASTER_DIR).filter((f) => f.endsWith(".json")).sort()) {
    for (const r of readJSON(join(MASTER_DIR, f)).instruments || []) out.push(r);
  }
  return out;
}

test("der ausgelieferte Master ist groesser als die alten 498", { skip: !vorhanden }, () => {
  const instruments = ladeMaster();
  assert.ok(instruments.length > 498,
            `Master hat ${instruments.length} Instrumente - die Erweiterung ist nicht wirksam`);
});

test("der ausgelieferte Master traegt keine Zielgroesse", { skip: !vorhanden }, () => {
  const cfg = readJSON(join(root, "quant", "config", "company-master.json"));
  assert.equal(cfg.size.maxInstruments, null);
  const manifest = readJSON(join(root, "quant", "data", "universe", "master-manifest.json"));
  assert.equal(manifest.scope.maxInstruments, null);
});

test("jede bestehende Aktienseite loest im Master auf", { skip: !vorhanden }, () => {
  const stockDir = join(root, "discover", "data", "stocks", "US_REAL");
  if (!existsSync(stockDir)) return;
  const instruments = ladeMaster();
  const bySymbol = new Map();
  const byLegacy = new Map();
  const byId = new Map();
  for (const i of instruments) {
    if (!bySymbol.has(i.symbol)) bySymbol.set(i.symbol, i);
    byId.set(i.instrumentId, i);
    for (const a of i.legacyIds || []) byLegacy.set(a, i);
  }
  const fehlen = [];
  for (const f of readdirSync(stockDir).filter((f) => f.endsWith(".json"))) {
    const symbol = f.replace(/\.json$/, "");
    const payload = readJSON(join(stockDir, f));
    if (!bySymbol.has(symbol)) { fehlen.push(symbol + " (Kuerzel)"); continue; }
    if (!payload.securityId || !byLegacy.has(payload.securityId)) {
      fehlen.push(symbol + " (securityId " + payload.securityId + ")"); continue;
    }
    if (!payload.instrumentId || !byId.has(payload.instrumentId)) {
      fehlen.push(symbol + " (instrumentId " + payload.instrumentId + ")");
    }
  }
  assert.deepEqual(fehlen, []);
});

test("der Suchindex kennt jedes Instrument genau einmal", { skip: !vorhanden }, () => {
  const manifestFile = join(root, "quant", "data", "universe", "search", "manifest.json");
  if (!existsSync(manifestFile)) return;
  const sm = readJSON(manifestFile);
  const ids = new Set();
  let doppelt = 0;
  for (const s of sm.sym) {
    for (const e of readJSON(join(root, "quant", "data", "universe", "search", "sym",
                                  s.shard + ".json")).entries) {
      if (ids.has(e.i)) doppelt++;
      ids.add(e.i);
    }
  }
  assert.equal(doppelt, 0);
  assert.equal(ids.size, ladeMaster().length);
});

/* ============================ Produktlogik des Wertpapierstamms (§1, §15)

   Der Company Master faellt die Eignungsentscheidung nicht - er
   konsumiert sie. Geprueft wird deshalb, dass sie unveraendert ankommt
   und dass beim Zaehlen nicht Listings mit Produkttiteln verwechselt
   werden. */

test("ohne Entscheidung bleibt ein Instrument UNKNOWN - nicht ELIGIBLE", () => {
  const i = Master.toInstrument(row("AAPL"), { today: TODAY });
  assert.equal(i.productEligibility, "UNKNOWN");
  assert.equal(Master.inProductUniverse(i), false);
  Master.applyEligibility(i, null);
  assert.equal(i.productEligibility, "UNKNOWN");
});

test("die Entscheidung wird uebernommen, nicht nachgerechnet", () => {
  const i = Master.toInstrument(row("CTA-P-B", { exchange: "NYSE" }), { today: TODAY });
  /* Die eigene Klassifikation sagt PREFERRED - aber erst seit dem
     Abgleich mit dem Wertpapierstamm. Vorher las sie "-B" als
     Aktienklasse und machte aus 308 Vorzugspapieren Stammaktien. */
  assert.equal(i.securityType, "PREFERRED");
  assert.equal(i.shareClass, "B");
  Master.applyEligibility(i, {
    securityId: "ref_CTA_P_B", product_eligibility: "SEPARATE_CLASS",
    product_eligibility_reason: "CONFIRMED_SEPARATE_CLASS:PREFERRED",
    instrument_type: "PREFERRED"
  });
  assert.equal(i.productEligibility, "SEPARATE_CLASS");
  assert.equal(i.securityClass, "PREFERRED");
  assert.equal(i.masterMemberId, "ref_CTA_P_B");
  assert.equal(Master.inProductUniverse(i), true, "SEPARATE_CLASS gehoert zum Produktuniversum");
});

test("EXCLUDED gehoert nicht zum Produktuniversum, REVIEW schon", () => {
  const mk = (e) => {
    const i = Master.toInstrument(row("X" + e.slice(0, 2)), { today: TODAY });
    Master.applyEligibility(i, { product_eligibility: e, securityId: "ref_X" });
    return i;
  };
  assert.equal(Master.inProductUniverse(mk("EXCLUDED")), false);
  assert.equal(Master.inProductUniverse(mk("REVIEW")), true,
               "ungeprueft ist nicht ausgeschlossen");
  assert.equal(Master.inProductUniverse(mk("ELIGIBLE")), true);
});

test("eine unbekannte Entscheidung faellt auf UNKNOWN zurueck, nicht auf ELIGIBLE", () => {
  const i = Master.toInstrument(row("AAPL"), { today: TODAY });
  Master.applyEligibility(i, { product_eligibility: "VIELLEICHT" });
  assert.equal(i.productEligibility, "UNKNOWN");
});

test("die Emittenten-ID kommt aus der CIK und sonst nirgendwoher", () => {
  assert.equal(Master.issuerIdFromCik("320193"), "iss_cik_0000320193");
  assert.equal(Master.issuerIdFromCik("0000320193"), "iss_cik_0000320193");
  assert.equal(Master.issuerIdFromCik(null), null);
  assert.equal(Master.issuerIdFromCik(""), null);
  /* Zwei Aktienklassen desselben Emittenten teilen die Emittenten-ID. */
  assert.equal(Master.issuerIdFromCik("1652044"), Master.issuerIdFromCik("0001652044"));
});

test("der Deckungsbericht zaehlt Produkttitel als MITGLIEDER, nicht als Listings", () => {
  /* COHR liegt an NYSE und an NASDAQ: zwei Instrumente, ein Produkttitel. */
  const s = sync([], [row("COHR", { exchange: "NYSE" }), row("COHR", { exchange: "NASDAQ" }),
                      row("AAPL")]);
  s.instruments.forEach((i) => {
    Master.applyEligibility(i, {
      securityId: "ref_" + i.symbol, product_eligibility: "ELIGIBLE",
      instrument_type: "EQUITY_COMMON"
    });
  });
  const t = Master.coverageReport(s.instruments, {});
  assert.equal(t.TOTAL_IN_COMPANY_MASTER, 3, "drei Listings");
  assert.equal(t.MASTER_MEMBERS, 2, "zwei Mitglieder");
  assert.equal(t.PRODUCT_TITLES, 2, "zwei Produkttitel - nicht drei");
  assert.equal(t.ELIGIBLE, 2);
});

test("ein Instrument ohne Mitgliedszuordnung verschwindet nicht aus der Bilanz", () => {
  const s = sync([], [row("AAPL"), row("WEDER")]);
  Master.applyEligibility(s.instruments[0], {
    securityId: "ref_AAPL", product_eligibility: "ELIGIBLE" });
  const t = Master.coverageReport(s.instruments, {});
  assert.equal(t.MASTER_MEMBERS, 2, "das zuordnungslose Instrument zaehlt als eigenes Mitglied");
  assert.equal(t.ELIGIBILITY_UNKNOWN, 1);
  assert.equal(t.PRODUCT_TITLES, 1);
});

test("kein Titel bekommt einen Gate-Lauf zugeschrieben, an dem er nicht teilnahm",
     { skip: !vorhanden }, () => {
  /* Die Mitgliedsdatei ist nach dem Gate-Lauf gewachsen. Wer die
     stillen PASS-Faelle aus ihr ableitet, ohne auf die Laufgroesse zu
     achten, schreibt 2.119 Titeln einen Kursverlauf zu, den sie nicht
     haben - und die Bilanz sieht besser aus als die Wirklichkeit. */
  const cap = readJSON(join(root, "quant", "data", "universe", "capability-summary.json"));
  const quellen = cap.evidenceSources.filter((s) => s.kind === "providerPriceHistory");
  assert.ok(quellen.length > 0);
  for (const q of quellen) {
    if (!q.runSize) continue;
    assert.ok(q.symbolsWithReportRow + q.symbolsImpliedPass <= q.runSize,
              `${q.file}: ${q.symbolsWithReportRow} + ${q.symbolsImpliedPass} > ${q.runSize}`);
  }
  const t = readJSON(join(root, "quant", "data", "universe", "coverage-report.json")).totals;
  assert.ok(t.TOTAL_WITH_PRICE_HISTORY < t.TOTAL_IN_COMPANY_MASTER,
            "alle Titel mit Kursverlauf zu fuehren waere genau der Fehler");
});

test("der ausgelieferte Master traegt die akzeptierten Produktzahlen", { skip: !vorhanden }, () => {
  const eligFile = join(root, "quant", "data", "market", "security-master", "eligibility.json");
  if (!existsSync(eligFile)) return;
  const erwartet = readJSON(eligFile).counts;
  const t = readJSON(join(root, "quant", "data", "universe", "coverage-report.json")).totals;
  assert.equal(t.MASTER_MEMBERS, erwartet.universeMembers);
  assert.equal(t.PRODUCT_TITLES, erwartet.productUniverse);
  assert.equal(t.ELIGIBLE, erwartet.ELIGIBLE);
  assert.equal(t.SEPARATE_CLASS, erwartet.SEPARATE_CLASS);
  assert.equal(t.REVIEW, erwartet.REVIEW);
  assert.equal(t.EXCLUDED, erwartet.EXCLUDED);
  assert.equal(t.ELIGIBILITY_UNKNOWN, 0, "jedes Instrument braucht eine Entscheidung");
});

/* ------------------------------------------------- Der Frontend-Vertrag */

function testVerzeichnis() {
  return Directory.create({
    base: join(root, "quant", "data", "universe") + "/",
    deliveredBase: join(root, "discover", "data") + "/",
    loadJSON: (p) => new Promise((res, rej) => {
      try { res(readJSON(p)); } catch (err) { rej(err); }
    })
  });
}

test("getInstrument loest ein Kuerzel auf", { skip: !vorhanden }, async () => {
  const res = await testVerzeichnis().getInstrument("NVDA");
  assert.equal(res.status, "OK");
  assert.equal(res.instrument.symbol, "NVDA");
  assert.match(res.instrument.instrumentId, /^vu_/);
});

test("getInstrument loest auch eine bestehende securityId auf", { skip: !vorhanden }, async () => {
  const res = await testVerzeichnis().getInstrument("ref_NVDA");
  assert.equal(res.status, "OK");
  assert.equal(res.instrument.symbol, "NVDA");
});

test("ein unbekanntes Kuerzel bekommt einen Grund, kein null", { skip: !vorhanden }, async () => {
  const res = await testVerzeichnis().getInstrument("GIBTESNICHT");
  assert.equal(res.status, "NOT_IN_UNIVERSE");
  assert.equal(res.instrument, null);
  assert.ok(res.reason.length > 10);
});

test("die Suche findet einen Titel ausserhalb der alten 498", { skip: !vorhanden }, async () => {
  const alt = new Set(readJSON(join(root, "discover", "data", "search", "US_REAL.json"))
    .entries.map((e) => e.s));
  const res = await testVerzeichnis().search("PALANTIR", { limit: 10 });
  assert.equal(res.status, "OK");
  const pltr = res.entries.find((e) => e.s === "PLTR");
  assert.ok(pltr, "PLTR nicht gefunden");
  assert.equal(alt.has("PLTR"), false, "PLTR waere schon im alten Index - der Test prueft nichts");
});

test("eine Anfrage laedt hoechstens drei Scherben", { skip: !vorhanden }, async () => {
  const geladen = [];
  const dir = Directory.create({
    base: join(root, "quant", "data", "universe") + "/",
    loadJSON: (p) => { geladen.push(p); return Promise.resolve(readJSON(p)); }
  });
  await dir.search("PALANTIR", { limit: 10 });
  const scherben = geladen.filter((p) => /search\/(sym|name)\//.test(p));
  assert.ok(scherben.length <= 3, `${scherben.length} Scherben: ${scherben.join(", ")}`);
});

test("eine Scherbe, die es nicht gibt, wird gar nicht erst angefragt", { skip: !vorhanden }, async () => {
  const geladen = [];
  const dir = Directory.create({
    base: join(root, "quant", "data", "universe") + "/",
    loadJSON: (p) => { geladen.push(p); return Promise.resolve(readJSON(p)); }
  });
  await dir.search("QQZZ", { limit: 5 });
  const fehlend = geladen.filter((p) => !existsSync(p));
  assert.deepEqual(fehlend, [], "eine 404 in der Konsole ist ein Befund, auch wenn sie abgefangen wird");
});

test("ein einzelnes Zeichen findet ein einbuchstabiges Kuerzel", { skip: !vorhanden }, async () => {
  /* F ist Ford, T ist AT&T, C ist Citigroup. "Zu kurz" waere fuer sie
     falsch - und in einer Sammelscherbe waeren sie unauffindbar. */
  const res = await testVerzeichnis().search("F", { limit: 5 });
  assert.equal(res.status, "OK");
  assert.equal(res.entries[0].s, "F");
});

test("eine zu kurze Anfrage ohne einbuchstabiges Kuerzel durchsucht das Universum nicht", 
     { skip: !vorhanden }, async () => {
  const res = await testVerzeichnis().search("-", { limit: 5 });
  assert.equal(res.status, "QUERY_TOO_SHORT");
  assert.equal(res.entries.length, 0);
});

test("getPriceHistory sagt NOT_DELIVERED und warum, statt null", { skip: !vorhanden }, async () => {
  const res = await testVerzeichnis().getPriceHistory("PLTR");
  assert.equal(res.status, "NOT_DELIVERED");
  assert.equal(res.bars, null);
  assert.match(res.reason, /Arbeitsablage|ausgelieferte/);
});

test("getSimilarStocks waehlt aus dem Master und nennt seine Grundlage", { skip: !vorhanden }, async () => {
  const dir = testVerzeichnis();
  const inst = (await dir.getInstrument("NVDA")).instrument;
  const res = await dir.getSimilarStocks(inst, { limit: 5 });
  assert.equal(res.basis, "SAME_EXCHANGE_SAME_TYPE");
  assert.ok(res.basisNote.length > 20, "eine Grundlage ohne Erlaeuterung ist keine");
  assert.ok(res.entries.every((e) => e.instrumentId !== inst.instrumentId));
});
