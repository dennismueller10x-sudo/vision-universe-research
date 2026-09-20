/* Index-Mitgliedschaft aus Fondsbestaenden (V4 §19-20): drei
   Emittentenformate gegen Fixtures, Zuordnung zum Company Master ohne
   Heuristik ueber die Mitgliedschaft, Versionierung (Vorstand -> Aenderung),
   Pruefung. Kein Netz. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const IM = require("../engines/index-membership.js");

const master = [
  { ticker: "AAPL", securityId: "ref_AAPL" }, { ticker: "MSFT", securityId: "ref_MSFT" },
  { ticker: "BRK-B", securityId: "ref_BRK_B" }, { ticker: "BF-B", securityId: "ref_BF_B" },
  { ticker: "BFB", securityId: "ref_BFB" }, { ticker: "NVDA", securityId: "ref_NVDA" }
];

const ISHARES = [
  "iShares Core S&P 500 ETF",
  'Fund Holdings as of,"Sep 12, 2026"',
  "Inception Date,\"May 15, 2000\"",
  "Shares Outstanding,\"1,000,000,000.00\"",
  "",
  "Ticker,Name,Sector,Asset Class,Market Value,Weight (%),Notional Value,Shares,Price,Location,Exchange,Currency,FX Rate,Market Currency,Accrual Date",
  '"NVDA","NVIDIA CORP","Information Technology","Equity","1,000.00","7.55","1,000.00","10.00","100.00","United States","NASDAQ","USD","1.00","USD","-"',
  '"AAPL","APPLE INC","Information Technology","Equity","900.00","6.20","900.00","9.00","100.00","United States","NASDAQ","USD","1.00","USD","-"',
  '"BRKB","BERKSHIRE HATHAWAY INC CLASS B","Financials","Equity","300.00","1.70","300.00","3.00","100.00","United States","NYSE","USD","1.00","USD","-"',
  '"XTSLA","BLK CSH FND TREASURY SL AGENCY","Cash and/or Derivatives","Money Market","10.00","0.05","10.00","1.00","1.00","United States","-","USD","1.00","USD","-"',
  '"ZZZZ","UNKNOWN CO","Health Care","Equity","5.00","0.01","5.00","1.00","5.00","United States","NYSE","USD","1.00","USD","-"',
  "",
  "\"The content contained herein is owned or licensed by BlackRock\""
].join("\n");

const INVESCO = [
  "Fund Ticker,Security Identifier,Holding Ticker,Shares/Par Value,MarketValue,Weight,Name,Class of Shares,Sector,Date",
  "QQQ,67066G104,NVDA,1000,100000,9.10,NVIDIA Corp,Common Stock,Information Technology,09/12/2026",
  "QQQ,037833100,AAPL,900,90000,8.50,Apple Inc,Common Stock,Information Technology,09/12/2026",
  "QQQ,594918104,MSFT,800,80000,7.90,Microsoft Corp,Common Stock,Information Technology,09/12/2026"
].join("\r\n");

/* SSGA liefert XLSX; der Parser bekommt hier die bereits gelesenen Zeilen. */
const SSGA_ROWS = [
  ["Fund Name:", "SPDR Dow Jones Industrial Average ETF Trust"],
  ["Ticker Symbol:", "DIA"],
  ["Holdings:", "As of 12-Sep-2026"],
  [],
  ["Name", "Ticker", "Identifier", "SEDOL", "Weight", "Sector", "Shares Held", "Local Currency"],
  ["Microsoft Corp", "MSFT", "594918104", "2588173", "8.123456", "Information Technology", "5000", "USD"],
  ["Apple Inc", "AAPL", "037833100", "2046251", "4.01", "Information Technology", "5000", "USD"],
  ["US DOLLAR", "-", "", "", "0.02", "Unassigned", "", "USD"],
  [],
  ["Important information", ""]
];

test("IM1 · iShares-CSV: Vorspann, Kopfzeile, nur Equity, Stichtag aus dem Vorspann", () => {
  const h = IM.parseHoldings("ISHARES_CSV", IM.parseCsv(ISHARES));
  assert.equal(h.error, null);
  assert.deepEqual(h.members.map((m) => m.ticker), ["NVDA", "AAPL", "BRKB", "ZZZZ"]);
  assert.equal(h.members[0].weight, 7.55);
  assert.equal(h.members[0].name, "NVIDIA CORP");
  assert.equal(h.asOf, "2026-09-12");
});

test("IM2 · Invesco-CSV: Kopfzeile in Zeile 1, Datum aus der Spalte (MM/DD/YYYY)", () => {
  const h = IM.parseHoldings("INVESCO_CSV", IM.parseCsv(INVESCO));
  assert.deepEqual(h.members.map((m) => m.ticker), ["NVDA", "AAPL", "MSFT"]);
  assert.equal(h.asOf, "2026-09-12");
  assert.equal(h.members[2].weight, 7.9);
});

test("IM3 · SSGA-Zeilen: Kopfzeile ueber Spaltennamen gefunden, Kasse uebersprungen", () => {
  const h = IM.parseHoldings("SSGA_XLSX", SSGA_ROWS);
  assert.deepEqual(h.members.map((m) => m.ticker), ["MSFT", "AAPL"]);
  assert.equal(h.members[0].weight, 8.123456);
  assert.equal(h.asOf, null, "SSGA nennt den Stichtag nicht maschinenlesbar - dann gilt das Abrufdatum");
});

test("IM4 · Fehlende Kopfzeile ist ein Fehler, keine leere Liste", () => {
  const h = IM.parseHoldings("ISHARES_CSV", IM.parseCsv("a,b,c\n1,2,3"));
  assert.ok(h.error);
  assert.equal(h.members.length, 0);
});

test("IM5 · Zuordnung: exakt, ueber Trennzeichen (BRKB -> BRK-B), mehrdeutig nicht (BFB), unbekannt nicht", () => {
  const match = IM.buildMatcher(master);
  assert.equal(match("AAPL").how, "EXACT");
  assert.equal(match("BRKB").security.ticker, "BRK-B");
  assert.equal(match("BRK.B").how, "SEPARATOR");
  assert.equal(match("BF.B").how, "AMBIGUOUS", "BF-B und BFB fallen ohne Trennzeichen zusammen");
  assert.equal(match("BFB").how, "EXACT", "die exakte Schreibweise gewinnt");
  assert.equal(match("ZZZZ").how, "UNKNOWN");
});

test("IM6 · build: Mitglieder nach Gewicht, nicht Zugeordnete benannt, Stichtag aus der Datei, Aenderung gegen den Vorstand", () => {
  const h = IM.parseHoldings("ISHARES_CSV", IM.parseCsv(ISHARES));
  const previous = { asOf: "2026-09-05", members: [{ symbol: "AAPL" }, { symbol: "MSFT" }] };
  const doc = IM.build({ indexId: "SP500", indexName: "S&P 500", proxy: { etf: "IVV", issuer: "iShares", url: "https://x", format: "ISHARES_CSV" },
                         holdings: h, securities: master, fetchedAt: "2026-09-15T07:00:00Z", previous });
  assert.equal(doc.schemaVersion, IM.SCHEMA);
  assert.deepEqual(doc.members.map((m) => m.symbol), ["NVDA", "AAPL", "BRK-B"]);
  assert.equal(doc.members[2].matched, "SEPARATOR");
  assert.equal(doc.members[2].sourceTicker, "BRKB");
  assert.deepEqual(doc.unmatched, [{ ticker: "ZZZZ", name: "UNKNOWN CO", reason: "UNKNOWN" }]);
  assert.equal(doc.asOf, "2026-09-12");
  assert.equal(doc.asOfSource, "HOLDINGS_FILE");
  assert.deepEqual(doc.changes, { previousAsOf: "2026-09-05", added: ["NVDA", "BRK-B"], removed: ["MSFT"] });
  assert.equal(doc.source, "ETF_HOLDINGS");
  assert.ok(/Fondsbestand/.test(doc.note));
  assert.deepEqual(IM.validate(doc, { minMembers: 3 }), { ok: true, findings: [] });
  assert.equal(IM.validate(doc, { minMembers: 490 }).ok, false);
});

test("IM7 · Ohne Stichtag in der Datei gilt das Abrufdatum - und die Datei sagt das", () => {
  const h = IM.parseHoldings("SSGA_XLSX", SSGA_ROWS);
  const doc = IM.build({ indexId: "DJIA", indexName: "Dow", proxy: { etf: "DIA", issuer: "SSGA", url: "https://x", format: "SSGA_XLSX" },
                         holdings: h, securities: master, fetchedAt: "2026-09-15T07:00:00Z", previous: null });
  assert.equal(doc.asOf, "2026-09-15");
  assert.equal(doc.asOfSource, "FETCH_DATE");
  assert.equal(doc.changes, null);
});

test("IM8 · Datumsformate", () => {
  assert.equal(IM.parseDate("Sep 12, 2026"), "2026-09-12");
  assert.equal(IM.parseDate("9/3/2026"), "2026-09-03");
  assert.equal(IM.parseDate("2026-09-12T00:00:00"), "2026-09-12");
  assert.equal(IM.parseDate("12-Sep-2026"), null);
});
