/* Deckungsabweichung je Titel: eine neue Messung ersetzt den
   abgenommenen Stand nur, wenn jeder geaenderte Titel einen belegten
   Grund hat (Abgleich 04.10.2026). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classify, balance } from "../../scripts/diagnose/coverage-delta.mjs";

const basis = (o) => Object.assign({
  productNow: new Set(["A", "B", "C", "D", "E"]),
  productBefore: new Set(["A", "B", "C", "D", "E", "X"]),
  debt: new Set(["X"]),
  cut: new Map([["B", ["ref_B", "B", 400, 120, "2025-01-01", "2026-06-01", "2026-10-03"]]]),
  techShortBefore: new Set(["C", "D"]), techShortNow: new Set(["B", "D"]), techBaseDate: "2026-09-11",
  chartShortBefore: new Set(["E"]), chartShortNow: new Set(), chartBaseDate: "2026-09-20",
  barsBefore: (t) => ({ C: 290, E: 0 })[t] ?? null
}, o);

test("jede Abweichung bekommt ihren belegten Grund", () => {
  const r = classify(basis());
  assert.deepEqual(r.technical.map((x) => [x.ticker, x.cls]),
    [["B", "LISTING_CUT"], ["C", "AGED_PAST_THRESHOLD"], ["X", "DEBT_EXCLUDED"]]);
  assert.deepEqual(r.chart.map((x) => [x.ticker, x.cls]),
    [["E", "NEW_BARS_SINCE_REFERENCE"], ["X", "DEBT_EXCLUDED"]]);
});

test("Gegenprobe: kuerzer ohne Listing-Kuerzung ist UNEXPLAINED", () => {
  const r = classify(basis({ cut: new Map() }));
  assert.equal(r.technical.find((x) => x.ticker === "B").cls, "UNEXPLAINED");
});

test("Gegenprobe: neu READY, obwohl am Bezugstag schon >= 300 Bars, ist UNEXPLAINED", () => {
  const r = classify(basis({ barsBefore: (t) => ({ C: 310, E: 0 })[t] ?? null }));
  assert.equal(r.technical.find((x) => x.ticker === "C").cls, "UNEXPLAINED");
});

test("Gegenprobe: ohne lesbare Reihe kein Freispruch", () => {
  const r = classify(basis({ barsBefore: () => null }));
  assert.equal(r.technical.find((x) => x.ticker === "C").cls, "UNEXPLAINED");
});

test("Gegenprobe: ein Titel faellt ohne DEBT-Entscheid aus dem Produkt -> UNEXPLAINED", () => {
  const r = classify(basis({ debt: new Set() }));
  assert.equal(r.technical.find((x) => x.ticker === "X").cls, "UNEXPLAINED");
});

test("neues Listing, nach dem Bezug nachgeladen (BRTM 04.10.2026): erklaert, eng begrenzt", () => {
  const brtm = basis({
    chartShortBefore: new Set(["E"]), barsBefore: (t) => ({ C: 290, E: 7 })[t] ?? null,
    listingStart: (t) => (t === "E" ? "2026-09-10" : null), seriesFirst: (t) => (t === "E" ? "2026-09-10" : null)
  });
  assert.equal(classify(brtm).chart.find((x) => x.ticker === "E").cls, "NEW_LISTING_BACKFILLED");
  // Gegenproben: altes Listing, Reihe beginnt nicht am Listingtag, Listing erst nach dem Bezug
  for (const [start, first] of [["2026-07-01", "2026-07-01"], ["2026-09-10", "2026-09-12"], ["2026-09-25", "2026-09-25"]]) {
    const r = classify(Object.assign({}, brtm, { listingStart: () => start, seriesFirst: () => first }));
    assert.equal(r.chart.find((x) => x.ticker === "E").cls, "UNEXPLAINED", start + " / " + first);
  }
});

test("Bilanz: Bezug - Abgaenge + Zugaenge = gemessen", () => {
  const r = classify(basis());
  // Bezug Technik READY: A, B, E, X = 4. Jetzt READY: A, C, E = 3.
  assert.deepEqual(balance(r.technical, 4, 3), { before: 4, net: -1, expected: 3, now: 3, closes: true });
  assert.equal(balance(r.technical, 4, 4).closes, false);
});

test("der Workflow erklaert die Abweichung, bevor er committet", () => {
  const wf = readFileSync(new URL("../../.github/workflows/coverage-metrics.yml", import.meta.url), "utf8");
  const erklaeren = wf.indexOf("scripts/diagnose/coverage-delta.mjs");
  assert.ok(erklaeren > 0, "coverage-metrics.yml ruft coverage-delta.mjs nicht auf");
  assert.ok(erklaeren < wf.indexOf("name: Commit und Push"));
  assert.doesNotMatch(wf.slice(erklaeren, erklaeren + 200), /--report-only/, "die Erklaerung darf den Lauf nicht nur protokollieren");
});
