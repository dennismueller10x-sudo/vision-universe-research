/* Core · Datenqualitaetsregeln (core/data-quality.js): jede Regel faengt
   den Fehler, fuer den sie geschrieben wurde - und nur ihn. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const DQ = require("../data-quality.js");
const Identity = require("../identity.js");

const s = (id, pts, extra) => Object.assign({ securityId: id, to: pts.length ? pts[pts.length - 1][0] : null, barCount: pts.length, points: pts }, extra);

test("DQ-ID-1 · zwei Identitaeten fuer BRK-B werden gefunden", () => {
  const r = DQ.idConsistency({ a: [{ ticker: "BRK-B", securityId: "ref_BRK_B" }], b: [{ ticker: "BRK-B", securityId: "ref_BRKB" }] }, Identity);
  assert.equal(r.status, "FAIL");
  assert.equal(r.failed, 1);
  assert.match(r.samples[0], /ref_BRKB.*erwartet ref_BRK_B/);
});

test("DQ-ID-2/3 · Duplikate im Universum und aktive Symbolkollisionen", () => {
  assert.equal(DQ.universeDuplicates([{ ticker: "A", securityId: "ref_A" }, { ticker: "A", securityId: "ref_A" }]).failed, 2);
  const r = DQ.activeSymbolCollisions([{ symbol: "SGI", instrumentId: "vu_1", exchange: "NYSE", active: true },
    { symbol: "SGI", instrumentId: "vu_2", exchange: "NASDAQ", active: true }, { symbol: "SGI", instrumentId: "vu_3", active: false }]);
  assert.equal(r.failed, 1);
});

test("DQ-PX-1 · Nullkurs, Doppeldatum, falscher Kopf", () => {
  const ok = s("ref_OK", [["2026-10-01", 1], ["2026-10-02", 2]]);
  const null0 = s("ref_Z", [["2026-10-01", 0.01], ["2026-10-02", 0]]);
  const dup = s("ref_D", [["2026-10-01", 1], ["2026-10-01", 1]]);
  const kopf = s("ref_K", [["2026-10-01", 1], ["2026-10-02", 1]], { to: "2026-10-05" });
  const r = DQ.seriesIntegrity([ok, null0, dup, kopf]);
  assert.equal(r.failed, 3);
  assert.ok(r.samples.some((x) => /ref_Z: Kurs ungueltig/.test(x)));
  assert.ok(r.samples.some((x) => /ref_D: Datum doppelt/.test(x)));
  assert.ok(r.samples.some((x) => /ref_K: Kopf/.test(x)));
});

test("DQ-PX-2 · Rueckstand wird gemessen und ueber der Grenze gemeldet", () => {
  const lag = (d, e) => (d === e ? 0 : d === "2026-10-01" ? 1 : 10);
  const r = DQ.seriesFreshness([s("ref_A", [["2026-10-02", 1]]), s("ref_B", [["2026-10-01", 1]]), s("ref_C", [["2026-09-15", 1]])], "2026-10-02", lag, 2);
  assert.equal(r.failed, 1);
  assert.deepEqual(r.histogram, { 0: 1, 1: 1, "5+": 1 });
});

test("DQ-PX-3 · ein unbereinigter 1:10-Reverse-Split wird als Split-Verdacht erkannt, normale Bewegung nicht", () => {
  const r = DQ.implausibleJumps([s("ref_R", [["2026-10-01", 1.0], ["2026-10-02", 10.05]]), s("ref_N", [["2026-10-01", 10], ["2026-10-02", 12]])], 0.6);
  assert.equal(r.failed, 1);
  assert.match(r.samples[0], /Faktor ~10: Split-Verdacht/);
});

test("DQ-PX-4 · Tag und Woche mit verschiedenem Bereinigungsstand verletzen die eine Preiswahrheit", () => {
  const daily = s("ref_X", [["2026-09-25", 50], ["2026-10-02", 51]]);
  const gut = { securityId: "ref_X", daily, weekly: s("ref_X", [["2026-09-25", 50], ["2026-10-02", 51]]) };
  const split = { securityId: "ref_Y", daily, weekly: s("ref_Y", [["2026-09-25", 100], ["2026-10-02", 51]]) };
  const r = DQ.dailyWeeklyAgreement([gut, split]);
  assert.equal(r.failed, 1);
  assert.match(r.samples[0], /ref_Y 2026-09-25/);
});

test("DQ-PX-5 · Aktienseite mit anderem Kurs als ihre Reihe", () => {
  const series = s("ref_X", [["2026-10-02", 233.95]]);
  const r = DQ.payloadMatchesSeries([{ ticker: "X", series, payload: { price: { value: 233.95 }, asOf: "2026-10-02" } },
    { ticker: "Y", series, payload: { price: { value: 230 }, asOf: "2026-10-02" } }]);
  assert.equal(r.failed, 1);
});

test("DQ-PR-1/2 · verwaiste Seiten und kaputte Chartpfade", () => {
  assert.equal(DQ.payloadIndexParity(["A", "B"], ["A", "C"]).failed, 2);
  const r = DQ.referencedPathsExist([{ owner: "st", path: "/x/ref_BRK-A.json" }, { owner: "st", path: "/x/ref_BRK_A.json" }], (p) => p.endsWith("ref_BRK_A.json"));
  assert.equal(r.failed, 1);
});

test("DQ-IX-1 · Indexmitglied, das im Universum inaktiv ist, und nicht zuordenbare Bestaende", () => {
  const r = DQ.indexMembersResolve([{ indexId: "SP500", members: [{ symbol: "TEL", securityId: "ref_TEL" }, { symbol: "AAPL", securityId: "ref_AAPL" }],
    unmatched: [{ ticker: "NRG", name: "NRG ENERGY" }] }],
    { ref_TEL: { product_eligibility: "REVIEW", active_status: "INACTIVE" }, ref_AAPL: { product_eligibility: "ELIGIBLE", active_status: "ACTIVE" } });
  assert.equal(r.failed, 1);
  assert.deepEqual(r.unmatched, ["SP500: NRG (NRG ENERGY)"]);
});

test("DQ-TW-1..4 · Technical: veralteter Datensatz, leere Felder, zweite Preiswahrheit, stille Luecken", () => {
  const lag = (d, e) => (d >= e ? 0 : 3);
  assert.equal(DQ.technicalFreshness({ asOf: "2026-10-23", generatedFrom: "2026-10-24T02:00:00Z" }, "2026-10-24T02:00:00Z", "2026-10-23", lag, 2).failed, 0);
  assert.match(DQ.technicalFreshness({ asOf: "2026-10-23", generatedFrom: "2026-10-24T02:00:00Z" }, "2026-10-27T02:00:00Z", "2026-10-23", lag, 2).samples[0], /nicht gelaufen/);
  assert.equal(DQ.technicalFreshness({ asOf: "2026-10-20", generatedFrom: "x" }, null, "2026-10-23", lag, 2).failed, 1, "Stichtag zu alt");
  assert.equal(DQ.technicalFreshness(null, null, "2026-10-23", lag, 2).failed, 1);
  const cols = { s: ["A", "B"], rsi14: [50, null], aboveEma200: [null, null], formationActive: [[], []] };
  assert.deepEqual(DQ.technicalEmptyFields(cols, ["rsi14", "aboveEma200", "formationActive", "fehlt"]).samples, ["aboveEma200: in allen 2 Zeilen leer", "fehlt: Spalte fehlt"],
    "leere Liste ist ein Wert (keine Formation), null nicht");
  const par = DQ.technicalCloseParity([{ ticker: "A", date: "d", close: 100, seriesClose: 100.04 }, { ticker: "B", date: "d", close: 100, seriesClose: 102 }, { ticker: "C", date: "d", close: null, seriesClose: 1 }]);
  assert.equal(par.checked, 2); assert.equal(par.failed, 1); assert.equal(par.severity, "ERROR");
  assert.equal(DQ.technicalCoverage(["A", "B", "C"], ["A"], { tooFewBars: 2 }).failed, 0, "Luecke mit gezaehltem Grund");
  assert.equal(DQ.technicalCoverage(["A", "B", "C"], ["A"], { tooFewBars: 1 }).failed, 2, "mehr Luecken als Gruende");
});

test("DQ-TW-5 · Wochen-/Monatsfelder: leer ist ein Fehler erst, wenn die Materialisierung sie liefert", () => {
  const cols = { s: ["A", "B"], "rsi14@1W": [50, null], "roc21@1W": [null, null], "roc21@1M": [null, null], "adx@1M": [null, null], rsi14: [1, 2] };
  const need = { roc21: "technical-mtf-1.1.0" };
  const old = DQ.technicalTimeframeFields(cols, need, ["technical-mtf-1.0.0"]);
  assert.deepEqual(old.samples, ["adx@1M: in allen 2 Zeilen leer, obwohl die Materialisierung es liefert"]);
  assert.equal(old.checked, 2);
  assert.match(old.note, /Wartet auf Materialisierung \(2\): roc21@1M, roc21@1W/);
  assert.match(old.note, /rsi14@1W 50 %/);
  const neu = DQ.technicalTimeframeFields(cols, need, ["technical-mtf-1.0.0", "technical-mtf-1.1.0"]);
  assert.equal(neu.checked, 4);
  assert.equal(neu.failed, 3, "mit 1.1.0 zaehlen die leeren ROC-Spalten");
  assert.equal(DQ.technicalTimeframeFields(cols, need, ["technical-mtf-1.10.0"]).failed, 3, "Versionen numerisch, nicht als Text");
  assert.equal(DQ.technicalTimeframeFields(cols, need, []).checked, 0, "ohne Buendel wartet alles");
});

test("Zusammenfassung · ERROR macht FAIL, nur WARN macht WARN", () => {
  const pass = { status: "PASS", severity: "ERROR" }, warn = { status: "FAIL", severity: "WARN" }, err = { status: "FAIL", severity: "ERROR" };
  assert.equal(DQ.summarize([pass, warn]).overall, "WARN");
  assert.equal(DQ.summarize([pass, warn, err]).overall, "FAIL");
  assert.equal(DQ.summarize([pass]).overall, "PASS");
});
