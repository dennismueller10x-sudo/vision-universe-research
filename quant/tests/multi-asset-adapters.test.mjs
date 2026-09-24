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
