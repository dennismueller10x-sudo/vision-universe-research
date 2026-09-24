/* Multi-Asset Core: Parser der offiziellen Quellen - offline, mit Fixtures. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Treasury = require("../../providers/us-treasury/adapter.js");
const NyFed = require("../../providers/nyfed/adapter.js");
const Bundesbank = require("../../providers/bundesbank/adapter.js");
const Eia = require("../../providers/eia/adapter.js");
const Ecb = require("../../providers/ecb/adapter.js");
const Fred = require("../../providers/fred/adapter.js");
const Nikkei = require("../../providers/nikkei/adapter.js");
const Fmp = require("../../providers/fmp/adapter.js");

test("Treasury: Spalten nach Namen, US-Datum, leere Zellen bleiben Luecken", () => {
  const csv = 'Date,"1 Mo","2 Yr","5 Yr","10 Yr"\n09/23/2026,4.10,3.90,3.80,4.20\n09/22/2026,4.10,3.95,,4.25\n';
  const r = Treasury.parseYearCsv(csv);
  assert.deepEqual(r.US10Y, [["2026-09-22", 4.25], ["2026-09-23", 4.2]]);
  assert.deepEqual(r.US5Y, [["2026-09-23", 3.8]]);
  assert.deepEqual(r.US30Y, [], "fehlende Spalte (2002-2006) bleibt leer, wird nicht aufgefuellt");
});

test("NY Fed: EFFR und Zielband getrennt, Band als Stufen", () => {
  const json = { refRates: [
    { effectiveDate: "2025-12-09", percentRate: 3.89, targetRateFrom: 3.75, targetRateTo: 4.0 },
    { effectiveDate: "2025-12-11", percentRate: 3.64, targetRateFrom: 3.5, targetRateTo: 3.75 },
    { effectiveDate: "2025-12-10", percentRate: 3.88, targetRateFrom: 3.75, targetRateTo: 4.0 }
  ] };
  const r = NyFed.parseEffr(json);
  assert.deepEqual(r.effr.map((p) => p[0]), ["2025-12-09", "2025-12-10", "2025-12-11"]);
  assert.deepEqual(NyFed.toSteps(r.target), [["2025-12-09", 3.75, 4.0], ["2025-12-11", 3.5, 3.75]]);
});

test("Bundesbank: Titel aus dem Kopf, Wochenend-Punkte ('.') ausgelassen", () => {
  const csv = '"",BBSIS.D.I.ZST...R10XX\n"",Term structure of interest rates on listed Federal securities (method by Svensson) / residual maturity of 10.0 years / daily data,\n2026-09-19,2.70,\n2026-09-20,.,\n2026-09-21,2.72,\n';
  const r = Bundesbank.parseCsv(csv);
  assert.match(r.title, /residual maturity of 10\.0 years/);
  assert.deepEqual(r.points, [["2026-09-19", 2.7], ["2026-09-21", 2.72]]);
});

test("EIA: CSV aus der umgewandelten Tabelle", () => {
  assert.deepEqual(Eia.parseCsv("date,value\n2026-09-22,68.1\n2026-09-21,67.9\nkaputt,1\n"),
                   [["2026-09-21", 67.9], ["2026-09-22", 68.1]]);
});

test("EZB-Leitzins: Stufen, Titel mit Komma verschiebt keine Spalte", () => {
  const csv = 'KEY,FREQ,TITLE,TIME_PERIOD,OBS_VALUE\nFM.D,D,"Deposit facility - date of changes (raw data), Level",2024-06-11,4.0\n' +
              'FM.D,D,"Deposit facility - date of changes (raw data), Level",2024-06-12,3.75\n' +
              'FM.D,D,"Deposit facility - date of changes (raw data), Level",2024-06-13,3.75\n';
  const r = Ecb.parseKeyRateCsv(csv);
  assert.deepEqual(r.steps, [["2024-06-11", 4.0], ["2024-06-12", 3.75]]);
  assert.equal(r.observedThrough, "2024-06-13");
});

test("FRED: Feiertage ('.') ausgelassen, aufsteigend", () => {
  const csv = "observation_date,NIKKEI225\n2026-09-23,.\n2026-09-24,45500.1\n2026-09-22,45000\n";
  assert.deepEqual(Fred.parseCsv(csv).points, [["2026-09-22", 45000], ["2026-09-24", 45500.1]]);
});

test("FRED: Lizenzklasse aus der Reihenseite - nur 'Citation required' ist auslieferbar", () => {
  const page = (u) => `<script type="application/ld+json">{"@type": "Dataset", "license": "${u}", "name": "x"}</script>`;
  assert.equal(Fred.licenseOf(page(Fred.LICENSE_CLASS.CITATION_REQUIRED)), "CITATION_REQUIRED");
  assert.equal(Fred.licenseOf(page(Fred.LICENSE_CLASS.PRE_APPROVAL_REQUIRED)), "PRE_APPROVAL_REQUIRED");
  assert.equal(Fred.licenseOf("<html></html>"), null);
  for (const [sym, spec] of Object.entries(Fred.SERIES)) assert.equal(spec.licenseClass, "CITATION_REQUIRED", sym);
  for (const banned of ["SP500", "DJIA", "NASDAQ100"]) {
    assert.ok(!Object.values(Fred.SERIES).some((s) => s.series === banned), `${banned} ist 'Pre-approval required' und darf nicht gefuehrt werden`);
  }
});

test("Nikkei: offizielle Tagesdatei nur mit erwartetem Kopf; Gegenprobe erkennt Abweichung", () => {
  const csv = '"Date of Data","Close","Open","High","Low"\n"2026/09/22","45000.00","1","1","1"\n"2026/09/24","45500.10","1","1","1"\n';
  const ref = Nikkei.parseDailyCsv(csv).points;
  assert.deepEqual(ref, [["2026-09-22", 45000], ["2026-09-24", 45500.1]]);
  assert.deepEqual(Nikkei.parseDailyCsv("Date,Price\n2026/09/22,1\n").points, [], "fremder Kopf: keine Werte");
  assert.equal(Nikkei.crossCheck([["2026-09-22", 45000], ["2026-09-24", 45500.1]], ref).ok, true);
  const bad = Nikkei.crossCheck([["2026-09-22", 45000], ["2026-09-24", 45800]], ref);
  assert.equal(bad.ok, false);
  assert.equal(bad.worstDate, "2026-09-24");
  assert.equal(Nikkei.crossCheck([["2020-01-06", 1]], ref).ok, false, "keine gemeinsamen Tage ist kein Beleg");
});

test("FMP: Identitaet ueber die Indexliste - gleiches Kuerzel, anderer Name faellt durch", () => {
  const list = Fmp.parseIndexList([{ symbol: "^GSPC", name: "S&P 500" }, { symbol: "^FTSE", name: "FTSE 100 Tracker Fund" }]);
  assert.equal(Fmp.identity("SPX", list).ok, true);
  assert.equal(Fmp.identity("UKX", list).reason, "nameMismatch");
  assert.equal(Fmp.identity("DJI", list).reason, "notListed");
  assert.equal(Fmp.identity("NDX", list).reason, "notMapped", "NDX ist im vorhandenen Tarif nicht enthalten (HTTP 402)");
  assert.equal(Fmp.identity("DAX", list).reason, "notMapped");
});

test("FMP: Tagesreihe aufsteigend, doppelte Tage einmal; Fehlerobjekt ohne Schluessel", () => {
  const r = Fmp.parseEod([{ symbol: "^GSPC", date: "2026-09-24", price: 6700.5 }, { symbol: "^GSPC", date: "2026-09-23", price: 6690 },
                          { symbol: "^GSPC", date: "2026-09-23", price: 6690 }]);
  assert.deepEqual(r.points, [["2026-09-23", 6690], ["2026-09-24", 6700.5]]);
  const e = Fmp.parseEod({ "Error Message": "Invalid API KEY https://x/?apikey=abcdef123456" });
  assert.deepEqual(e.points, []);
  assert.ok(!e.error.includes("abcdef123456"));
  assert.ok(!Fmp.redact(Fmp.eodUrl("^GSPC", "2026-01-01", "abcdef123456")).includes("abcdef123456"));
});
