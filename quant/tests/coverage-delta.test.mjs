/* Deckungsabweichung je Titel: eine neue Messung ersetzt den
   abgenommenen Stand nur, wenn jeder geaenderte Titel einen belegten
   Grund hat (Abgleich 04.10.2026). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classify, balance, bezug } from "../../scripts/diagnose/coverage-delta.mjs";

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

test("der Commit-Schritt verwirft Testnebenwirkungen vor dem Rebase und schiebt mit Wiederholung", () => {
  const wf = readFileSync(new URL("../../.github/workflows/coverage-metrics.yml", import.meta.url), "utf8");
  const schritt = wf.slice(wf.indexOf("name: Commit und Push"));
  const commit = schritt.indexOf("git commit"), verwerfen = schritt.indexOf("git checkout -- ."),
        schieben = schritt.indexOf("scripts/ci/push-with-retry.sh");
  assert.ok(commit > 0 && verwerfen > commit && schieben > verwerfen, "Reihenfolge: commit -> verwerfen -> push-with-retry");
  assert.doesNotMatch(schritt, /git pull --rebase/, "kein nacktes Rebase mehr (Lauf 37181495758)");
});

const E = (rows) => ({ decisions: rows.map(([ticker, ex, type, reason]) => ({ ticker, product_eligibility: ex ? "EXCLUDED" : "ELIGIBLE", instrument_type: type || "EQUITY_COMMON", product_eligibility_reason: reason || null })) });

test("Bezug NAMED: die committete Messung mit Namenslisten ist der Bezug (Lauf 37182732949)", () => {
  const before = { today: "2026-10-04", CHART_AVAILABILITY: { denominator: 2, renderable: 2, notRenderableSymbols: [] },
    TECHNICAL_HISTORY_ELIGIBILITY: { eligible: 1, tooShortSymbols: ["B"] } };
  const jetzt = E([["A"], ["B"], ["X", true, "DEBT", "CONFIRMED_NON_EQUITY:DEBT"]]);
  const b = bezug({ before, eligNow: jetzt, eligHead: jetzt, scale: { perSymbol: {} } });
  assert.equal(b.mode, "NAMED");
  assert.deepEqual([...b.productBefore].sort(), ["A", "B"], "schon ausgeschlossene DEBT nicht noch einmal abziehen");
  assert.equal(b.techBeforeOk, 1);
  // unveraenderter Stand: keine Zeile, Bilanz geht auf
  const r = classify({ ...b, cut: new Map(), techShortNow: new Set(["B"]), chartShortNow: new Set(), chartShortBefore: new Set(),
    chartBaseDate: "2026-10-04", barsBefore: () => null });
  assert.deepEqual(r, { technical: [], chart: [] });
  assert.equal(balance(r.chart, 2, 2).closes, true);
  // Gegenprobe: Universum des Bezugs passt nicht zum Nenner
  assert.throws(() => bezug({ before: { ...before, CHART_AVAILABILITY: { denominator: 3 } }, eligNow: jetzt, eligHead: jetzt, scale: {} }), /passt nicht/);
});

test("Bezug LEGACY_0920: erster Uebergang ohne Namensliste nimmt Skalierungsbericht + DEBT", () => {
  const before = { today: "2026-09-20", CHART_AVAILABILITY: { denominator: 3 }, TECHNICAL_HISTORY_ELIGIBILITY: { eligible: 2 } };
  const b = bezug({ before, eligNow: E([["A"], ["B"], ["X", true, "DEBT", "CONFIRMED_NON_EQUITY:DEBT"]]), eligHead: null,
    scale: { generatedAt: "2026-09-11T00:00:00Z", perSymbol: { B: { technical: "INSUFFICIENT_HISTORY" } } } });
  assert.equal(b.mode, "LEGACY_0920");
  assert.deepEqual([...b.productBefore].sort(), ["A", "B", "X"]);
  assert.equal(b.techBeforeOk, 2);
});

test("begruendet ausgeschlossen ist erklaert, unbegruendet nicht", () => {
  const r = (reason) => classify(basis({ debt: new Set(), excludedReason: new Map(reason ? [["X", reason]] : []) }));
  assert.equal(r("CONFIRMED_NON_EQUITY:WARRANT").technical.find((x) => x.ticker === "X").cls, "POLICY_EXCLUDED");
  assert.equal(r(null).technical.find((x) => x.ticker === "X").cls, "UNEXPLAINED");
});

test("Bezug NAMED nach Neubeurteilung des Wertpapierstamms: spaetere Aenderungen werden zurueckgenommen", () => {
  const before = { today: "2026-10-04", generatedAt: "2026-10-04T06:00:00Z", CHART_AVAILABILITY: { denominator: 5, notRenderableSymbols: [] },
    TECHNICAL_HISTORY_ELIGIBILITY: { eligible: 5, tooShortSymbols: [] } };
  const kopf = E([["A"], ["B"], ["N"], ["X", true, "DEBT", "CONFIRMED_NON_EQUITY:DEBT"], ["Y", true, "ETN", "CONFIRMED_NON_EQUITY:ETN"]]);
  const spaeter = (ticker, from, to) => ({ ticker, at: "2026-10-10T06:00:00Z", from: { productEligibility: from }, to: { productEligibility: to } });
  const reconciliation = { changes: [
    spaeter("X", "ELIGIBLE", "EXCLUDED"), spaeter("Y", "ELIGIBLE", "EXCLUDED"), spaeter("N", "REVIEW", "ELIGIBLE"),
    /* vor der Messung: schon im Nenner beruecksichtigt, wird nicht zurueckgenommen */
    { ticker: "Z", at: "2026-10-02T06:00:00Z", from: { productEligibility: "ELIGIBLE" }, to: { productEligibility: "EXCLUDED" } }
  ] };
  const b = bezug({ before, eligNow: kopf, eligHead: kopf, scale: {}, reconciliation });
  assert.equal(b.mode, "NAMED");
  assert.equal(b.rejudged, 3);
  assert.deepEqual([...b.productBefore].sort(), ["A", "B", "N", "X", "Y"]);
  const r = classify({ ...b, cut: new Map(), techShortNow: new Set(), chartShortNow: new Set(), chartShortBefore: new Set(),
    chartBaseDate: "2026-10-04", barsBefore: () => null });
  assert.deepEqual(r.technical.map((x) => [x.ticker, x.cls]), [["X", "DEBT_EXCLUDED"], ["Y", "POLICY_EXCLUDED"]]);
  assert.equal(balance(r.technical, 5, 3).closes, true);
  /* Gegenprobe: trifft die Ruecknahme den Nenner nicht, bleibt der Bezug unbestimmbar */
  assert.throws(() => bezug({ before: { ...before, CHART_AVAILABILITY: { denominator: 6 } }, eligNow: kopf, eligHead: kopf, scale: {}, reconciliation }), /passt nicht/);
  assert.throws(() => bezug({ before, eligNow: kopf, eligHead: kopf, scale: {} }), /passt nicht/);
});
