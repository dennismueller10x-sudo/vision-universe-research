/* EU/UCITS-Quellen: Normalisierung und Zuordnung (synthetische Fixtures im Aufbau der echten Dateien). */
import test from "node:test";
import assert from "node:assert/strict";
import { ongoingCharges, chargesUnit, replication, useOfProfits, parseInstrumentsCsv, parseMasterRows } from "../../scripts/vorsorge/ingest-xetra-refdata.mjs";
import { normName, matchFund, residualIsShareClass, consistentWithFund, keywordConflict } from "../../scripts/vorsorge/ingest-esma-funds.mjs";

test("Xetra: laufende Kosten in Prozent -> Dezimal; Unplausibles und Leeres bleibt null (Missing != 0)", () => {
  assert.equal(ongoingCharges("0,07%"), 0.0007);
  assert.equal(ongoingCharges("0.20"), 0.002);
  assert.equal(ongoingCharges("0"), 0);
  assert.equal(ongoingCharges(""), null);
  assert.equal(ongoingCharges("n/a"), null);
  assert.equal(ongoingCharges("12"), null);   // 12 % ist fuer einen ETF unplausibel
});
test("Xetra: Replikation und Ertragsverwendung kanonisch", () => {
  assert.equal(replication("Full Replication"), "PHYSICAL_FULL");
  assert.equal(replication("Optimised"), "PHYSICAL_SAMPLING");
  assert.equal(replication("Sample"), "PHYSICAL_SAMPLING");
  assert.equal(replication("Swap-based"), "SYNTHETIC_SWAP");
  assert.equal(replication("Swap Based"), "SYNTHETIC_SWAP");
  assert.equal(replication(""), null);
  assert.equal(useOfProfits("Accumulating"), "ACCUMULATING");
  assert.equal(useOfProfits("Distributing"), "DISTRIBUTING");
  assert.equal(useOfProfits(null), null);
});
test("Xetra-Instrumentenliste: Praeambel, nur ETFs, WKN nur wenn gueltig", () => {
  const csv = ["Market:;XETR", "Date Last Update:;05.10.2026",
    "Product Status;Instrument Status;Instrument;ISIN;Product ID;Instrument ID;WKN;Mnemonic;MIC Code;Product Assignment Group;Instrument Type",
    "Active;Active;ISHS C.MSCI WORLD;IE00B4L5Y983;1;2;A0RPWH;EUNL;XETR;FON0;ETF",
    "Active;Active;SOME SHARE;DE0007164600;1;3;716460;SAP;XETR;GER0;CS",
    "Active;Active;BROKEN;IE00B4L5Y983X;1;4;XYZ;BAD;XETR;FON0;ETF",
    "Active;Active;NOWKN;LU0274208692;1;5;;DBXW;XETR;FON1;ETF",
    "Active;Active;PADDED;IE00B5BMR087;1;6;000A0YEDGL;SXR8;XETR;FON0;ETF",
    "Active;Active;PADDEDNUM;DE0005933931;1;7;000593393;EXS1;XETR;FON0;ETF"].join("\n");
  const r = parseInstrumentsCsv(csv);
  assert.equal(r.asOf, "2026-10-05");
  assert.equal(r.rows.size, 4);
  assert.equal(r.rows.get("IE00B5BMR087").wkn, null);       // 10 Zeichen: keine WKN
  assert.equal(r.rows.get("DE0005933931").wkn, "593393");   // 9-stellig mit fuehrenden Nullen
  assert.equal(r.rows.get("IE00B4L5Y983").wkn, "A0RPWH");
  assert.equal(r.rows.get("LU0274208692").wkn, null);
  assert.ok(!r.rows.has("DE0007164600"));
});
test("Xetra-Stammdatenblatt: Kopfzeile finden, Felder normalisieren, Datum TT/MM/JJJJ", () => {
  const rows = [["ETFs & ETPs Instruments"], ["As of 05/10/2026"],
    ["PRODUCT TYPE", "PRODUCT NAME", "ISIN", "PRODUCT FAMILY", "XETRA SYMBOL", "ONGOING CHARGES", "USE OF PROFITS", "REPLICATION METHOD", "FUND CURRENCY", "TRADING CURRENCY", "BENCHMARK"],
    ["ETF", "iShares Core MSCI World UCITS ETF", "IE00B4L5Y983", "iShares", "EUNL", "0.20", "Accumulating", "Optimised", "USD", "EUR", "MSCI World Index"],
    ["Active ETF", "Some Active UCITS ETF", "IE000ABCDEF1", "X", "XYZ", "", "", "", "USD", "EUR", ""]];
  const m = parseMasterRows(rows);
  assert.equal(m.asOf, "2026-10-05");
  const w = m.rows.get("IE00B4L5Y983");
  assert.deepEqual([w.ongoingCharges, w.distribution, w.replication, w.benchmark, w.productType], [0.002, "ACCUMULATING", "PHYSICAL_SAMPLING", "MSCI World Index", "ETF"]);
  assert.equal(m.rows.size, 1);   // ungueltige ISIN verworfen
});
test("ESMA-Fondsregister: Zuordnung ueber Namensanfang und gleiches Domizil, sonst keine", () => {
  const idx = new Map();
  const add = (name, domicile, id) => { const k = normName(name); idx.set(k, (idx.get(k) || []).concat([{ id, name, domicile }])); };
  add("iShares Core MSCI World UCITS ETF", "IE", "a");
  add("Xtrackers MSCI World UCITS ETF", "IE", "b");
  add("Xtrackers MSCI World UCITS ETF", "LU", "c");
  add("Amundi Index Solutions", "LU", "d");
  assert.equal(matchFund("iShares Core MSCI World UCITS ETF USD (Acc)", "IE", idx).id, "a");
  assert.equal(matchFund("Xtrackers MSCI World UCITS ETF 1C", "LU", idx).id, "c");   // Domizil trennt
  assert.equal(matchFund("iShares Core MSCI World UCITS ETF USD (Acc)", "LU", idx), null);  // falsches Domizil -> kein Treffer
  assert.equal(matchFund("Vanguard FTSE All-World UCITS ETF", "IE", idx), null);
  assert.equal(normName("L&G Gold Mining UCITS ETF – USD"), "l and g gold mining ucits etf usd");
});

test("ESMA-Fondsregister: Rest nach dem Registernamen darf nur die Anteilklasse beschreiben", () => {
  const idx = new Map();
  const add = (name, domicile, id) => { const k = normName(name); idx.set(k, (idx.get(k) || []).concat([{ id, name, domicile, status: "Active" }])); };
  add("Amundi MSCI USA", "LU", "usa");
  add("Xtrackers MSCI World Swap UCITS ETF", "LU", "sw");
  add("Global Corporate Bond", "LU", "gcb");
  assert.equal(matchFund("Amundi MSCI USA SRI Climate Paris Aligned UCITS ETF", "LU", idx), null);
  assert.equal(matchFund("Global Corporate Bond 1-5Y ESG UCITS ETF", "LU", idx), null);
  assert.equal(matchFund("Amundi MSCI USA UCITS ETF Acc", "LU", idx).id, "usa");
  assert.equal(matchFund("Xtrackers MSCI World Swap UCITS ETF 1C", "LU", idx).id, "sw");
  assert.equal(matchFund("Xtrackers MSCI World Swap UCITS ETF Inhaber-Anteile 1C o.N. AT ETFP", "LU", idx).id, "sw");
  assert.ok(residualIsShareClass(["usd", "acc"]) && residualIsShareClass(["reg", "shares", "usd", "unhgd", "acc", "o", "n"]));
  assert.ok(!residualIsShareClass(["0", "5"]) && !residualIsShareClass(["esg"]));
});

test("Xetra: Kostenspalte als Excel-Anteil (0.002 = 0,20 %) wird erkannt und nicht doppelt geteilt", () => {
  assert.equal(chargesUnit(["0.002", "0.0007", "0.0035", ""]), "fraction");
  assert.equal(chargesUnit(["0.20", "0.07", "0.35"]), "percent");
  assert.equal(ongoingCharges("0.002", "fraction"), 0.002);
  assert.equal(ongoingCharges("2.3E-3", "fraction"), 0.0023);
  assert.equal(ongoingCharges("0.2", "fraction"), null);   // 20 % unplausibel
  assert.equal(ongoingCharges("0,07%", "fraction"), 0.0007); // explizites Prozentzeichen gewinnt
  const rows = [["ISIN", "PRODUCT TYPE", "ONGOING CHARGES"], ["IE00B4L5Y983", "ETF", "0.002"], ["IE00B5BMR087", "ETF", "0.0007"], ["IE00BK5BQT80", "ETF", "0.0022"]];
  const m = parseMasterRows(rows);
  assert.equal(m.chargesUnit, "fraction");
  assert.equal(m.rows.get("IE00B4L5Y983").ongoingCharges, 0.002);
});

test("ESMA-Fondsregister: LEI-Treffer nur, wenn der Anteilklassenname nicht widerspricht", () => {
  assert.equal(consistentWithFund("JPM Japan Research Enhanced Index Equity Active UCITS ETF USD (dist)", "JPMorgan ETFs (Ireland) ICAV - Japan Research Enhanced Index Equity Active UCITS ETF"), true);  // Abkuerzung
  assert.equal(consistentWithFund("HSBC MSCI Em.Markts. UCITS ETFRegistered Inc.Shares USD o.N.", "HSBC MSCI EMERGING MARKETS UCITS ETF"), true);
  assert.equal(consistentWithFund("iShares $ TIPS 0-5 UCITS ETF USD (Acc)", "iShares $ TIPS UCITS ETF"), false);   // Schwesterfonds-LEI
  assert.equal(consistentWithFund("iShares $ Treasury Bond 1-3yr UCITS ETF", "iShares $ Treasury Bond 1-3yr UCITS ETF"), true);
});

test("ESMA-Fondsregister: LEI eines Schwesterfonds faellt ueber unterscheidende Merkmale auf (Review-Befunde)", () => {
  const no = [["First Trust Nasdaq Cybersecurity Euro Hedged UCITS ETF", "First Trust Low Duration Global Government Bond UCITS ETF"],
    ["Goldman Sachs Alpha Enhanced World ex USA Equity Active UCITS ETF Thes.", "Goldman Sachs Alpha Enhanced US Equity Active UCITS ETF"],
    ["Fineco AM MarketVectorTM Japan Quality Tilt Sustainable UCITS ETF", "Fineco AM MarketVector Artificial Intelligence Sustainable UCITS ETF"],
    ["First Trust US Small Cap Core AlphaDEX UCITS ETF Acc", "First Trust Nasdaq Clean Edge Green Energy UCITS ETF"],
    ["SPDR MSCI Emerging Markets Cli ETFS", "SPDR MSCI ACWI Climate Paris Aligned UCITS ETF"],
    ["DJ Global Select Dividend UCITS ETF Aktienklasse (USD) A-dis", "UBS S&P Dividend Aristocrats ESG Elite UCITS ETF"],
    ["Xtrackers MSCI World High Dividend Yield UCITS ETF", "Xtrackers MSCI World Screened UCITS ETF"]];
  for (const [a, b] of no) assert.equal(consistentWithFund(a, b), false, a);
  const yes = [["iShares Euro Government Bond 1-3yr UCITS ETF", "iShares € Govt Bond 1-3yr UCITS ETF"],
    ["SPDR S&P 400 US Mid Cap ETF UCITS", "State Street SPDR S&P 400 U.S. Mid Cap UCITS ETF"],
    ["iShsII-US Aggregate Bd U.ETF Registered Shs GBP (Dist)Hd oN", "iShares US Aggregate Bond UCITS ETF"],
    ["SSgA SPDR ETFs Europe I PLC – SPDR Bloomberg Sterling Corporate Bond UCITS ETF", "State Street SPDR Bloomberg Sterling Corporate Bond UCITS ETF"],
    ["iShares MSCI ACWI SRI UCITS ETF USD (Dist)", "iShares MSCI All Country World SRI UCITS ETF"],
    ["UBS ETF (IE) Factor MSCI World Minimum Volatility ESG Leaders UCITS ETF (USA) A-acc", "UBS Factor MSCI World Selection Minimum Volatility UCITS ETF"],
    ["iShsIV-NASDAQ US Biotech.U.ETF Registered Shares EUR Dis.o.N.", "iShares NASDAQ US Biotechnology UCITS ETF"],
    ["L&G Quality Equity Dividends ESG Exclusions Asia Pacific ex-Japan UCITS ETF", "L&G APAC ex-Japan Quality Dividends UCITS ETF"]];
  for (const [a, b] of yes) assert.deepEqual(keywordConflict(a, b), [], a);
});
