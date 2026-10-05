/* EU/UCITS-Quellen: Normalisierung und Zuordnung (synthetische Fixtures im Aufbau der echten Dateien). */
import test from "node:test";
import assert from "node:assert/strict";
import { ongoingCharges, replication, useOfProfits, parseInstrumentsCsv, parseMasterRows } from "../../scripts/vorsorge/ingest-xetra-refdata.mjs";
import { normName, matchFund } from "../../scripts/vorsorge/ingest-esma-funds.mjs";

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
