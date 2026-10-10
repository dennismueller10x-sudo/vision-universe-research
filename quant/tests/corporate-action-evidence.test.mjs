/* Kapitalmassnahmen-Beleg fuer Wochenreihen (quant/engines/corporate-action-evidence.js).
   OSCR: echte Tagesschluesse des Anbieters 01.02.-28.04.2023 (kein Split, Sprung 27.->28.03. bei 71 Mio. Stueck). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const CA = require("../engines/corporate-action-evidence.js");
const Sampling = require("../engines/series-sampling.js");

const OSCR = [["2023-02-01",3.85],["2023-02-02",4.1],["2023-02-03",3.89],["2023-02-06",3.79],["2023-02-07",3.85],["2023-02-08",4.09],["2023-02-09",3.8],["2023-02-10",4.95],["2023-02-13",5.29],["2023-02-14",5.57],["2023-02-15",5.7],["2023-02-16",5.61],["2023-02-17",5.6],["2023-02-21",5.27],["2023-02-22",5.24],["2023-02-23",5.24],["2023-02-24",5.24],["2023-02-27",5.36],["2023-02-28",5.54],["2023-03-01",5.08],["2023-03-02",4.69],["2023-03-03",4.96],["2023-03-06",4.75],["2023-03-07",4.7],["2023-03-08",4.76],["2023-03-09",4.23],["2023-03-10",3.93],["2023-03-13",3.9],["2023-03-14",3.69],["2023-03-15",3.51],["2023-03-16",3.44],["2023-03-17",3.4],["2023-03-20",3.37],["2023-03-21",3.67],["2023-03-22",3.52],["2023-03-23",3.51],["2023-03-24",3.36],["2023-03-27",3.59],["2023-03-28",5.61],["2023-03-29",6.4],["2023-03-30",6.62],["2023-03-31",6.54],["2023-04-03",6.74],["2023-04-04",6.52],["2023-04-05",6.37],["2023-04-06",6.52],["2023-04-10",6.92],["2023-04-11",6.75],["2023-04-12",6.3],["2023-04-13",6.53],["2023-04-14",6.33],["2023-04-17",6.45],["2023-04-18",6.25],["2023-04-19",6.12],["2023-04-20",5.85],["2023-04-21",5.83],["2023-04-24",5.85],["2023-04-25",5.77],["2023-04-26",5.85],["2023-04-27",6.35],["2023-04-28",6.73]];
const daily = (rows) => rows.map(([date, close]) => ({ date, close }));
const weekly = (rows) => Sampling.weeklyPoints(rows);

test("CA1 · OSCR: echte Kursbewegung in Split-Groesse (3,36 -> 6,54) wird als solche belegt und aufgeloest", () => {
  const ev = CA.evidence(daily(OSCR), weekly(OSCR), OSCR.map(([date]) => ({ date, splitFactor: 1 })));
  assert.equal(ev.version, CA.VERSION);
  assert.deepEqual(ev.splits, []);
  const m = ev.moves.find((x) => x.week === "2023-03-31");
  assert.ok(m, "Woche zum 31.03.2023 als Sprung in Split-Groesse erfasst");
  assert.ok(Math.abs(m.weeklyRatio - 6.54 / 3.36) < 1e-6);
  assert.equal(m.maxDailyDate, "2023-03-28");
  assert.ok(Math.abs(m.maxDailyRatio - 5.61 / 3.59) < 1e-6);
  assert.equal(m.splitInWeek, false);
  const r = CA.resolve([{ index: 0, time: "2023-03-31", ratio: "1:2" }], ev);
  assert.equal(r.status, "RESOLVED");
  assert.equal(r.items[0].status, "RESOLVED_GENUINE_MOVE");
});

test("CA2 · verpasste Bereinigung (ueber Nacht halbiert, kein Split beim Anbieter) bleibt gesperrt", () => {
  const flat = OSCR.map(([d]) => [d, d >= "2023-03-28" ? 5 : 10]);
  const ev = CA.evidence(daily(flat), weekly(flat), flat.map(([date]) => ({ date, splitFactor: 1 })));
  const r = CA.resolve([{ time: "2023-03-31" }], ev);
  assert.equal(r.status, "UNRESOLVED");
  assert.equal(r.items[0].reason, "SINGLE_DAY_SPLIT_SIZED_JUMP");
});

test("CA2b · verpasste 2:1-Bereinigung an einem Tag mit zusaetzlich −6 % (Tagesverhaeltnis 0,47, nicht in Split-Groesse) bleibt gesperrt", () => {
  const rows = OSCR.map(([d]) => [d, d < "2023-03-28" ? 10 : d === "2023-03-28" ? 4.7 : d <= "2023-03-31" ? 4.89 : 4.9]);
  const ev = CA.evidence(daily(rows), weekly(rows), rows.map(([date]) => ({ date, splitFactor: 1 })));
  const m = ev.moves.find((x) => x.week === "2023-03-31");
  assert.ok(m && !CA.splitSized(m.maxDailyRatio), "Tagesverhaeltnis selbst nicht in Split-Groesse");
  const r = CA.resolve([{ time: "2023-03-31" }], ev);
  assert.equal(r.status, "UNRESOLVED"); assert.equal(r.items[0].reason, "SINGLE_DAY_DOMINATES_WEEK");
  /* OSCR: groesster Tag 1,56 bei Woche 1,95 → 67 % der Wochenbewegung (log), unter 75 % → echte mehrtaegige Bewegung */
  assert.ok(Math.log(5.61 / 3.59) / Math.log(6.54 / 3.36) < CA.DOMINANT_DAY);
});

test("CA3 · Split beim Anbieter in der Woche, Reihe springt trotzdem: Bereinigung fraglich, gesperrt", () => {
  const ev = CA.evidence(daily(OSCR), weekly(OSCR), OSCR.map(([date]) => ({ date, splitFactor: date === "2023-03-29" ? 2 : 1 })));
  assert.deepEqual(ev.splits, [["2023-03-29", 2]]);
  const r = CA.resolve([{ time: "2023-03-31" }], ev);
  assert.equal(r.items[0].reason, "PROVIDER_SPLIT_IN_WEEK");
  assert.equal(r.status, "UNRESOLVED");
});

test("CA4 · ohne Beleg (alte Reihe) bleibt jede Sperre; ohne Verdacht ist die Reihe sauber", () => {
  assert.equal(CA.resolve([{ time: "2023-03-31" }], null).items[0].reason, "NO_EVIDENCE");
  assert.equal(CA.resolve([{ time: "2023-03-31" }], { version: "x", moves: [] }).items[0].reason, "NO_EVIDENCE");
  assert.equal(CA.evidence(daily(OSCR), weekly(OSCR), []), null, "ohne Tagesbalken kein Beleg");
  assert.equal(CA.evidence(daily(OSCR), weekly(OSCR), OSCR.map(([date], k) => ({ date, splitFactor: k === 3 ? null : 1 }))), null, "fehlende splitFactor-Spalte ist kein Beleg fuer 'kein Split'");
  const ev = CA.evidence(daily(OSCR), weekly(OSCR), OSCR.map(([date]) => ({ date, splitFactor: 1 })));
  assert.equal(CA.resolve([{ time: "2023-02-17" }], ev).items[0].reason, "NO_EVIDENCE_FOR_WEEK");
  assert.equal(CA.resolve([], ev).status, "CLEAN");
  assert.equal(CA.resolve([{ time: "2023-03-31" }, { time: "2023-02-17" }], ev).status, "UNRESOLVED", "ein offener Verdacht sperrt");
});

test("CA5 · dieselbe Regel wie die Engine (Verhaeltnisse 2/3/4/5/10, Toleranz 3 %)", () => {
  const src = readFileSync(new URL("../engines/technical/elliott/elliott-v3.js", import.meta.url), "utf8");
  assert.ok(src.includes("[2, 3, 4, 5, 10].forEach(function (k) { if (Math.abs(r * k - 1) < 0.03 || Math.abs(r / k - 1) < 0.03)"), "Engine-Regel geaendert: corporate-action-evidence.js nachziehen");
  assert.deepEqual(CA.SPLIT_RATIOS, [2, 3, 4, 5, 10]);
  assert.equal(CA.TOLERANCE, 0.03);
  assert.deepEqual(CA.splitSized(1.95), { k: 2, kind: "UP" });
  assert.deepEqual(CA.splitSized(0.101), { k: 10, kind: "DOWN" });
  assert.equal(CA.splitSized(1.56), null);
  assert.equal(CA.splitSized(0), null);
});

test("CA6 · der Herausgeber der Wochenreihen schreibt den Beleg mit (publish-long-series.mjs)", () => {
  const src = readFileSync(new URL("../../scripts/market/publish-long-series.mjs", import.meta.url), "utf8");
  assert.ok(/corporateActions: CorporateActions\.evidence\(closes, points, aktuell\)/.test(src));
});
