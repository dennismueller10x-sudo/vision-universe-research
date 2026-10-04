import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const A = createRequire(import.meta.url)("../engines/etf-analytics.js");

function dailySeries(start, days, f) {
  const out = []; let d = new Date(start + "T00:00:00Z"), i = 0;
  while (out.length < days) { const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) { out.push([d.toISOString().slice(0, 10), f(i)]); i++; } d = new Date(d.getTime() + 864e5); }
  return out;
}

test("clean: sortiert, dedupliziert, verwirft ungueltige Werte", () => {
  const c = A.clean([["2024-01-03", 2], ["2024-01-02", 1], ["2024-01-02", 1.5], ["bad", 3], ["2024-01-04", null], ["2024-01-05", -1], ["2024-01-06", "x"]]);
  assert.deepEqual(c, [["2024-01-02", 1.5], ["2024-01-03", 2]]);
});

test("performance: konstanter Anstieg, 1Y-Fenster", () => {
  const s = dailySeries("2020-01-01", 800, (i) => 100 * Math.pow(1.0004, i));
  const p = A.performance(s);
  assert.equal(p.grain, "daily");
  assert.ok(p.windows["1D"].value > 0);
  assert.ok(p.windows["1Y"].value > 0.09 && p.windows["1Y"].value < 0.12);
  assert.equal(p.windows["5Y"].status, "INSUFFICIENT_HISTORY");
  assert.equal(p.windows["5Y"].value, null);
  assert.ok(p.windows.MAX.annualized > 0);
});

test("performance: kurze Historie liefert null statt Hochrechnung", () => {
  const s = dailySeries("2026-08-01", 30, (i) => 10 + i * 0.1);
  const p = A.performance(s);
  assert.equal(p.windows["1Y"].value, null);
  assert.equal(p.windows["3M"].status, "INSUFFICIENT_HISTORY");
  assert.ok(p.windows["1W"].value > 0);
});

test("performance: Wochenreihe hat kein 1D", () => {
  const w = A.toWeekly(dailySeries("2020-01-01", 600, (i) => 100 + i));
  const p = A.performance(w);
  assert.equal(p.grain, "weekly");
  assert.equal(p.windows["1D"].status, "NEEDS_DAILY_DATA");
});

test("performance: fehlende Preise", () => {
  const p = A.performance([]);
  assert.equal(p.windows["1Y"].status, "NO_HISTORY");
  assert.equal(A.performance(null).windows.MAX.value, null);
});

test("maxDrawdown: Hoch, Tief, Erholung", () => {
  const pts = [["2020-01-01", 100], ["2020-02-01", 120], ["2020-03-01", 60], ["2020-04-01", 90], ["2020-05-01", 121]];
  const d = A.maxDrawdown(pts);
  assert.equal(d.value, -0.5);
  assert.equal(d.peakDate, "2020-02-01");
  assert.equal(d.troughDate, "2020-03-01");
  assert.equal(d.recoveredDate, "2020-05-01");
  assert.equal(d.recoveryDays, 61);
});

test("maxDrawdown: nicht erholt", () => {
  const d = A.maxDrawdown([["2020-01-01", 100], ["2020-02-01", 50], ["2020-03-01", 70]]);
  assert.equal(d.recovered, false);
  assert.equal(d.recoveryDays, null);
});

test("risk: Volatilitaet annualisiert, Monats- und Jahresextreme", () => {
  const s = dailySeries("2018-01-01", 252 * 4, (i) => 100 * (1 + 0.1 * Math.sin(i / 15)) * Math.pow(1.0003, i));
  const r = A.risk(s);
  assert.equal(r.volatility.status, "CALCULATED");
  assert.ok(r.volatility.value > 0.05 && r.volatility.value < 0.6);
  assert.ok(r.worstMonth.value <= r.bestMonth.value);
  assert.ok(r.yearlyReturns.length >= 2);
});

test("risk: zu kurze Reihe -> keine Volatilitaet", () => {
  const r = A.risk(dailySeries("2026-09-01", 20, (i) => 10 + i));
  assert.equal(r.volatility.value, null);
});

test("splice: Wochenreihe vor Tagesreihe, Naht gemeldet", () => {
  const s = A.splice([["2020-01-03", 10], ["2020-01-10", 11], ["2020-01-17", 12]], [["2020-01-15", 12], ["2020-01-16", 12.2]]);
  assert.deepEqual(s.points.map((p) => p[0]), ["2020-01-03", "2020-01-10", "2020-01-15", "2020-01-16"]);
  assert.ok(Math.abs(s.seamGap - (12 / 11 - 1)) < 1e-9);
});

test("portfolioSeries: gleiche Reihen ergeben dieselbe Rendite", () => {
  const a = dailySeries("2024-01-01", 100, (i) => 100 + i);
  const ps = A.portfolioSeries([{ weight: 0.5, points: a }, { weight: 0.5, points: a }]);
  const r1 = a[a.length - 1][1] / a[0][1];
  assert.ok(Math.abs(ps.points[ps.points.length - 1][1] / 100 - r1) < 1e-9);
});

test("correlation: identisch = 1, zu wenig Ueberlappung = null", () => {
  const a = dailySeries("2024-01-01", 100, (i) => 100 + Math.sin(i) * 5 + i);
  assert.ok(Math.abs(A.correlation(a, a).value - 1) < 1e-9);
  assert.equal(A.correlation(a.slice(0, 5), a.slice(0, 5)).value, null);
});

test("trend: 200-Tage-Linie", () => {
  const up = dailySeries("2024-01-01", 260, (i) => 100 + i);
  assert.equal(A.trend(up).above, true);
  assert.equal(A.trend(up.slice(0, 50)).status, "INSUFFICIENT_HISTORY");
});
