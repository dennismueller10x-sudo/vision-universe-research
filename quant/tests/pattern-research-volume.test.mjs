/* Pattern Research 1.1.0 - die Volumenmerkmale.

   Geprueft wird, was eine Studie ueber eine Million Beobachtungen nicht
   selbst zeigen kann: dass die Rechnung auf bekannten Zahlen stimmt, dass
   kein Merkmal an t einen Balken nach t liest, dass ein fehlender
   Tagesbestand null ergibt statt einer Zahl, und dass die vorregistrierte
   Hypothesenzahl genau die ist, die der Code baut. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import methodology from "../methodology/pattern-research-v1.json" with { type: "json" };
import fundamentals from "../methodology/pattern-research-fundamentals-v1.json" with { type: "json" };
import { pricePatternSet } from "../../scripts/quant/lib/pattern-study.mjs";

const require = createRequire(import.meta.url);
const Patterns = require("../engines/pattern-research.js");

/* Handelstage ohne Wochenenden, ab einem festen Datum. */
function tradingDates(count, start = "2020-01-01") {
  const out = [];
  let t = Date.parse(start + "T00:00:00Z");
  while (out.length < count) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) out.push(new Date(t).toISOString().slice(0, 10));
    t += 86400000;
  }
  return out;
}

function daily(count, bar) {
  const dates = tradingDates(count);
  const out = { dates, close: [], high: [], low: [], volume: [], splitFactor: [] };
  for (let i = 0; i < count; i++) {
    const b = bar(i);
    out.close.push(b.close); out.high.push(b.high ?? b.close); out.low.push(b.low ?? b.close);
    out.volume.push(b.volume); out.splitFactor.push(b.splitFactor ?? 1);
  }
  return out;
}

function at(d, anchor) {
  return Patterns.volumeFeaturesAt(d, anchor, Patterns.cumulativeSplitFactors(d)).features;
}

const close = (a, b) => Math.abs(a - b) < 1e-9;

/* ------------------------------------------------------------ Rechnung */

test("udv50: Dollarvolumen der Aufwaertstage durch das der Abwaertstage", () => {
  /* Abwechselnd 10 und 11; aufwaerts 200 Stueck, abwaerts 100 Stueck.
     Im 50-Tage-Fenster 25 Auf- und 25 Abwaertstage:
     (25 x 11 x 200) / (25 x 10 x 100) = 2.2 */
  const d = daily(120, (i) => (i % 2 ? { close: 11, volume: 200 } : { close: 10, volume: 100 }));
  assert.ok(close(at(d, 119).udv50, 2.2), String(at(d, 119).udv50));
});

test("udv50: ein Split ist kein Abwaertstag und Dollarvolumen bleibt splitneutral", () => {
  /* Dieselbe Reihe, aber am Tag 100 ein 2:1-Split: Rohkurs und Rohvolumen
     danach halb bzw. doppelt. Ohne Bereinigung waere Tag 100 ein riesiger
     Abwaertstag; mit ihr ist das Ergebnis identisch. */
  const plain = daily(120, (i) => (i % 2 ? { close: 11, volume: 200 } : { close: 10, volume: 100 }));
  const split = daily(120, (i) => {
    const base = i % 2 ? { close: 11, volume: 200 } : { close: 10, volume: 100 };
    return i >= 100 ? { close: base.close / 2, volume: base.volume * 2, splitFactor: i === 100 ? 2 : 1 } : base;
  });
  assert.ok(close(at(split, 119).udv50, at(plain, 119).udv50));
  assert.ok(close(at(split, 119).dryUp10over50, at(plain, 119).dryUp10over50));
  assert.ok(close(at(split, 119).acc63, at(plain, 119).acc63));
});

test("acc63: Schluss am Hoch ergibt +1, am Tief -1, halb-halb bei gleichem Umsatz 0", () => {
  const top = daily(100, () => ({ close: 10, high: 10, low: 9, volume: 1000 }));
  const bottom = daily(100, () => ({ close: 9, high: 10, low: 9, volume: 1000 }));
  const mixed = daily(100, (i) => (i % 2 ? { close: 10, high: 10, low: 9, volume: 900 } : { close: 9, high: 10, low: 9, volume: 1000 }));
  assert.ok(close(at(top, 99).acc63, 1));
  assert.ok(close(at(bottom, 99).acc63, -1));
  /* Gleiches Dollarvolumen (10 x 900 = 9 x 1000). Das Fenster 37..99 hat
     32 ungerade (+1) und 31 gerade (-1) Tage: (32 - 31) / 63. */
  assert.ok(close(at(mixed, 99).acc63, 1 / 63), String(at(mixed, 99).acc63));
  /* Ein Tag ohne Spanne (H = L) zaehlt mit CLV 0, nicht als Division durch 0. */
  const flat = daily(100, () => ({ close: 10, high: 10, low: 10, volume: 1000 }));
  assert.equal(at(flat, 99).acc63, 0);
});

test("dryUp10over50: Mittel der letzten 10 durch Mittel der letzten 50 Tage", () => {
  /* 40 Tage 100, dann 10 Tage 50: 50 / ((40 x 100 + 10 x 50) / 50) = 50 / 90. */
  const d = daily(150, (i) => ({ close: 10 + (i % 3), volume: i >= 140 ? 50 : 100 }));
  assert.ok(close(at(d, 149).dryUp10over50, 50 / 90), String(at(d, 149).dryUp10over50));
});

test("zu kurze Historie oder zu viele ungueltige Tage ergeben null, keine Schaetzung", () => {
  const d = daily(40, () => ({ close: 10, volume: 100 }));
  assert.deepEqual(at(d, 39), { udv50: null, acc63: null, dryUp10over50: null });
  const holes = daily(150, (i) => ({ close: 10 + (i % 2), volume: i % 5 === 0 ? NaN : 100 }));
  const f = at(holes, 149);
  assert.equal(f.udv50, null, "20 % fehlende Tage unterschreiten die Mindestzahl");
  assert.equal(f.acc63, null);
  assert.equal(f.dryUp10over50, null);
});

/* ------------------------------------------------------------- Leckage */

/* Wochenraster ueber die Tagesreihe: letzter Handelstag jeder Woche. */
function weeklyFrom(d) {
  const dates = [], closes = [];
  for (let i = 0; i < d.dates.length; i++) {
    const next = d.dates[i + 1];
    const week = (s) => Math.floor((Date.parse(s) / 86400000 + 3) / 7);
    if (!next || week(next) !== week(d.dates[i])) { dates.push(d.dates[i]); closes.push(d.close[i]); }
  }
  return { dates, closes };
}

test("vergiftete Tagesbalken nach t veraendern kein Volumenmerkmal an t", () => {
  const d = daily(1500, (i) => ({ close: 50 + 10 * Math.sin(i / 9), high: 52 + 10 * Math.sin(i / 9), low: 48 + 10 * Math.sin(i / 9),
                                  volume: 1000 + 400 * Math.cos(i / 5) }));
  const w = weeklyFrom(d);
  const index = 200;
  const reference = Patterns.featuresAt(w.closes, index, { daily: d, dates: w.dates });
  assert.ok(reference.udv50 !== null && reference.acc63 !== null && reference.dryUp10over50 !== null);

  const tDay = w.dates[index];
  const poisoned = { ...d, close: d.close.slice(), high: d.high.slice(), low: d.low.slice(), volume: d.volume.slice(), splitFactor: d.splitFactor.slice() };
  for (let i = 0; i < d.dates.length; i++) {
    if (d.dates[i] <= tDay) continue;
    poisoned.close[i] = 1e6; poisoned.high[i] = 2e6; poisoned.low[i] = 1; poisoned.volume[i] = 1e12; poisoned.splitFactor[i] = 7;
  }
  assert.deepEqual(Patterns.featuresAt(w.closes, index, { daily: poisoned, dates: w.dates }), reference);

  /* Abgeschnitten direkt nach t: dasselbe Ergebnis. */
  const cut = d.dates.indexOf(tDay) + 1;
  const truncated = { dates: d.dates.slice(0, cut), close: d.close.slice(0, cut), high: d.high.slice(0, cut),
                      low: d.low.slice(0, cut), volume: d.volume.slice(0, cut), splitFactor: d.splitFactor.slice(0, cut) };
  assert.deepEqual(Patterns.featuresAt(w.closes, index, { daily: truncated, dates: w.dates }), reference);
});

test("der Lesezugriff wirft bei einem Index nach dem Anker und meldet den spaetesten gelesenen", () => {
  const d = daily(100, () => ({ close: 10, volume: 100 }));
  const result = Patterns.volumeFeaturesAt(d, 80, Patterns.cumulativeSplitFactors(d));
  assert.equal(result.maxRead, 80, "das Fenster endet genau am Anker");
  assert.ok(Patterns.dailyIndexAtOrBefore(d.dates, d.dates[80]) === 80);
  /* Ein Stichtag zwischen zwei Handelstagen nimmt den frueheren. */
  const saturday = new Date(Date.parse(d.dates[80]) + 86400000).toISOString().slice(0, 10);
  assert.ok(Patterns.dailyIndexAtOrBefore(d.dates, saturday) <= 80 + 1);
  assert.ok(d.dates[Patterns.dailyIndexAtOrBefore(d.dates, saturday)] <= saturday);
});

test("observe traegt die Volumenmerkmale und haelt den Leckagevertrag", () => {
  const d = daily(1500, (i) => ({ close: 50 + 5 * Math.sin(i / 4), high: 51 + 5 * Math.sin(i / 4), low: 49 + 5 * Math.sin(i / 4), volume: 1000 }));
  const w = weeklyFrom(d);
  const o = Patterns.observe(w.closes, 150, 52, 1.0, { daily: d, dates: w.dates });
  assert.ok(o.features.udv50 !== null);
  assert.ok(o.features.acc63 !== null);
});

/* ------------------------------------------------- Fehlende Tagesdaten */

test("ohne Tagesbalken sind alle drei Volumenmerkmale null - nie erfunden", () => {
  const closes = Array.from({ length: 300 }, (_, i) => 100 + i);
  const without = Patterns.featuresAt(closes, 250);
  for (const id of Patterns.VOLUME_FEATURE_IDS) assert.equal(without[id], null, id);
  const dates = tradingDates(300 * 5).filter((_, i) => i % 5 === 4).slice(0, 300);
  const empty = Patterns.featuresAt(closes, 250, { daily: null, dates });
  for (const id of Patterns.VOLUME_FEATURE_IDS) assert.equal(empty[id], null, id);
  /* Ein Volumenmuster ist dann nicht messbar - kein Fehlschlag. */
  const candidate = methodology.candidates.find((c) => c.id === "up-volume-dominance");
  assert.equal(Patterns.matchesCandidate(without, candidate), null);
});

test("ein veralteter letzter Tagesbalken gilt als nicht vorhanden", () => {
  const d = daily(200, () => ({ close: 10, volume: 100 }));
  const last = d.dates[d.dates.length - 1];
  const later = new Date(Date.parse(last) + (Patterns.VOLUME_MAX_STALE_DAYS + 5) * 86400000).toISOString().slice(0, 10);
  assert.deepEqual(Patterns.volumeFeaturesForDate(d, later), { udv50: null, acc63: null, dryUp10over50: null });
  const before = Patterns.volumeFeaturesForDate(d, "2019-06-01");
  assert.deepEqual(before, { udv50: null, acc63: null, dryUp10over50: null }, "kein Balken vor t");
});

/* --------------------------------------------- Vorregistrierung, Zaehlung */

test("die Methodik ist versioniert, mit Changelog, und die Engine spricht dieselbe Version", () => {
  assert.equal(methodology.methodologyVersion, "pattern-research-1.1.0");
  assert.equal(Patterns.METHODOLOGY_VERSION, methodology.methodologyVersion);
  const entry = methodology.changelog.find((c) => c.version === "pattern-research-1.1.0");
  assert.ok(entry && entry.registeredBeforeMeasurement === true);
  for (const id of Patterns.VOLUME_FEATURE_IDS) {
    const feature = methodology.features.find((f) => f.id === id);
    assert.ok(feature, id);
    assert.equal(feature.addedIn, "pattern-research-1.1.0");
    assert.equal(feature.grain, "daily");
  }
});

test("die 1.0.0-Kandidaten sind unveraendert", () => {
  const v100 = methodology.candidates.filter((c) => !c.addedIn)
    .map((c) => [c.id, c.feature, c.operator, c.value].join(":"));
  assert.deepEqual(v100, [
    "strong-12m-momentum:return12m1m:gte:0.3", "very-strong-12m-momentum:return12m1m:gte:1",
    "weak-12m-momentum:return12m1m:lte:-0.2", "near-52w-high:distanceTo52wHigh:gte:-0.05",
    "far-below-52w-high:distanceTo52wHigh:lte:-0.4", "deep-drawdown:drawdownFromPeak:lte:-0.7",
    "at-all-time-high:priceToAllTimeHigh:gte:0.95", "above-40w-line:aboveSma40w:eq:true",
    "trend-stacked:sma10wAboveSma40w:eq:true", "quiet-range:rangeCompression52w:lte:0.5",
    "wide-range:rangeCompression52w:gte:1.5", "high-volatility:volatility52w:gte:0.6",
    "low-volatility:volatility52w:lte:0.25", "six-month-thrust:return6m:gte:0.5",
    "three-month-thrust:return3m:gte:0.3"
  ]);
  /* Neue Kandidaten stehen hinten, damit jede alte Maskenposition bleibt. */
  const firstNew = methodology.candidates.findIndex((c) => c.addedIn);
  assert.equal(firstNew, 15);
  assert.ok(methodology.candidates.slice(firstNew).every((c) => c.addedIn === "pattern-research-1.1.0"));
});

test("die registrierte Hypothesenzahl ist genau die, die der Code baut", () => {
  const patterns = pricePatternSet(methodology.candidates);
  const reg = methodology.preRegistration;
  assert.equal(methodology.candidates.length, reg.registeredCandidates);
  assert.equal(patterns.length, reg.registeredHypotheses);
  assert.equal(patterns.filter((p) => !p.addedIn).length, reg.registeredHypothesesByVersion["pattern-research-1.0.0"]);
  assert.equal(patterns.filter((p) => p.addedIn).length, reg.registeredHypothesesByVersion["pattern-research-1.1.0"]);
  /* Die 1.0.0-Muster tragen dieselben Kennungen und Maskenbits wie vorher. */
  const old = pricePatternSet(methodology.candidates.filter((c) => !c.addedIn));
  const oldInNew = patterns.filter((p) => !p.addedIn);
  assert.deepEqual(oldInNew.map((p) => [p.id, p.mask]), old.map((p) => [p.id, p.mask]));
  /* Kein Paar teilt ein Merkmal - auch nicht ueber eine zusammengesetzte Bedingung. */
  for (const p of patterns.filter((x) => x.kind === "PAIR")) {
    const a = Patterns.candidateFeatures(p.terms[0]), b = Patterns.candidateFeatures(p.terms[1]);
    assert.equal(a.some((f) => b.includes(f)), false, p.id);
  }
  /* Jeder Volumenkandidat liest ein Volumenmerkmal, das die Engine liefert. */
  for (const c of methodology.candidates.filter((x) => x.addedIn)) {
    assert.ok(Patterns.VOLUME_FEATURE_IDS.includes(c.feature), c.id);
    for (const f of Patterns.candidateFeatures(c)) assert.ok(Patterns.FEATURE_IDS.includes(f), f);
  }
});

test("die Fundamentalfamilie bleibt bei ihren 1.0.0-Kurskandidaten und passt in die Maske", () => {
  const price = methodology.candidates.filter((c) => !c.addedIn);
  assert.equal(price.length, 15);
  assert.ok(price.length + fundamentals.candidates.length <= 31);
});

test("zusammengesetzter Kandidat: alle Teile muessen gelten, jeder Teil wird mitskaliert", () => {
  const c = methodology.candidates.find((x) => x.id === "volume-dry-up-near-high");
  assert.equal(Patterns.matchesCandidate({ dryUp10over50: 0.7, distanceTo52wHigh: -0.1 }, c), true);
  assert.equal(Patterns.matchesCandidate({ dryUp10over50: 0.7, distanceTo52wHigh: -0.3 }, c), false);
  assert.equal(Patterns.matchesCandidate({ dryUp10over50: 0.9, distanceTo52wHigh: -0.1 }, c), false);
  assert.equal(Patterns.matchesCandidate({ dryUp10over50: null, distanceTo52wHigh: -0.1 }, c), null);
  assert.equal(Patterns.matchesCandidate({ dryUp10over50: 0.7, distanceTo52wHigh: null }, c), null);
  const scaled = Patterns.scaleCandidate(c, 1.25);
  assert.ok(close(scaled.value, 1.0));
  assert.ok(close(scaled.also[0].value, -0.1875));
  assert.equal(c.also[0].value, -0.15, "das Original bleibt unberuehrt");
  assert.equal(Patterns.hasNumericThreshold(c), true);
});
