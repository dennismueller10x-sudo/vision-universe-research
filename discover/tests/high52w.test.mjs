/* 52-Wochen-Hoch-Engine: die Faelle, an denen ein Signal falsch wird. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const High52w = require(join(root, "discover", "engines", "high52w.js"));

const NOW = Date.parse("2026-09-08T20:00:00Z");

function bars(closes, startDate = "2020-01-01") {
  const out = [];
  const day = new Date(startDate + "T00:00:00Z");
  for (const c of closes) {
    out.push({ date: day.toISOString().slice(0, 10), open: c, high: c, low: c, close: c, volume: 1000 });
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return out;
}

test("neues Hoch: Kurs ueber der Referenz", () => {
  const r = High52w.evaluate({ previous52WeekHigh: 100, currentPrice: 101,
                               quoteAt: NOW, now: NOW });
  assert.equal(r.state, "newHigh");
  assert.equal(r.isNew52WeekHigh, true);
  assert.ok(Math.abs(r.distanceTo52WeekHigh - 0.01) < 1e-12);
});

test("Gleichstand zaehlt als Hoch, nicht als knapp darunter", () => {
  const r = High52w.evaluate({ previous52WeekHigh: 100, currentPrice: 100, quoteAt: NOW, now: NOW });
  assert.equal(r.state, "atHigh");
  assert.equal(r.isNew52WeekHigh, true);
});

test("Tageshoch auf dem Jahreshoch zaehlt, auch wenn der Kurs darunter schliesst", () => {
  const r = High52w.evaluate({ previous52WeekHigh: 100, currentPrice: 99.5, dayHigh: 100.2,
                               quoteAt: NOW, now: NOW });
  assert.equal(r.isNew52WeekHigh, true);
  assert.equal(r.touchedHigh, true);
  assert.equal(r.closeAtHigh, false);
  assert.ok(r.distanceTo52WeekHigh < 0, "der Abstand bleibt negativ und wird nicht geschoent");
  assert.equal(r.basis, "intradayHigh");
});

test("Abstufungen: nearHigh, watch, below", () => {
  const near = High52w.evaluate({ previous52WeekHigh: 100, currentPrice: 99, quoteAt: NOW, now: NOW });
  const watch = High52w.evaluate({ previous52WeekHigh: 100, currentPrice: 96, quoteAt: NOW, now: NOW });
  const below = High52w.evaluate({ previous52WeekHigh: 100, currentPrice: 80, quoteAt: NOW, now: NOW });
  assert.equal(near.state, "nearHigh");
  assert.equal(watch.state, "watch");
  assert.equal(below.state, "below");
});

test("veralteter Kurs ergibt stale, nicht 'kein Hoch'", () => {
  const r = High52w.evaluate({ previous52WeekHigh: 100, currentPrice: 105,
                               quoteAt: NOW - 3 * 60 * 60 * 1000, now: NOW });
  assert.equal(r.state, "stale");
  assert.equal(r.isNew52WeekHigh, false, "ein zu alter Kurs belegt kein neues Hoch");
  assert.equal(r.reason, "staleQuote");
});

test("fehlende Referenz ergibt unknown mit Grund, nicht false", () => {
  const keine = High52w.evaluate({ currentPrice: 120, quoteAt: NOW, now: NOW });
  assert.equal(keine.state, "unknown");
  assert.equal(keine.reason, "noReference");
  const zurueckgehalten = High52w.evaluate({ currentPrice: 120, referenceWithheld: true, now: NOW });
  assert.equal(zurueckgehalten.reason, "referenceLevelWithheld");
});

test("verschiedene Kursarten werden nicht verglichen", () => {
  const r = High52w.evaluate({ previous52WeekHigh: 100, currentPrice: 130, now: NOW,
                               priceSeriesType: "UNADJUSTED",
                               referencePriceSeriesType: "SPLIT_ADJUSTED" });
  assert.equal(r.reason, "priceSeriesMismatch");
  assert.equal(r.isNew52WeekHigh, false);
});

test("Split: auf der bereinigten Reihe entsteht kein Phantomhoch", () => {
  /* 300 Tage bei 400, dann 4:1-Split auf 100 und Anstieg auf 110.
     Unbereinigt waere 110 weit unter dem alten Hoch von 400 - bereinigt
     ist es ein neues Hoch. */
  const unbereinigt = [...Array(300).fill(400), ...Array(20).fill(100), 110];
  const bereinigt = unbereinigt.map((v, i) => (i < 300 ? v / 4 : v));

  const refUnadjusted = High52w.referenceFromBars(bars(unbereinigt));
  const refAdjusted = High52w.referenceFromBars(bars(bereinigt));

  const falsch = High52w.evaluate({ previous52WeekHigh: refUnadjusted.previous52WeekHigh,
                                    currentPrice: 110, now: NOW });
  const richtig = High52w.evaluate({ previous52WeekHigh: refAdjusted.previous52WeekHigh,
                                     currentPrice: 110, now: NOW });
  assert.equal(falsch.isNew52WeekHigh, false);
  assert.equal(richtig.isNew52WeekHigh, true);
});

test("Referenzfenster schliesst den aktuellen Tag aus", () => {
  const reihe = [...Array(260).fill(50), 90];
  const ref = High52w.referenceFromBars(bars(reihe));
  assert.equal(ref.previous52WeekHigh, 50,
    "das Hoch von heute darf nicht sein eigener Massstab sein");
  assert.equal(ref.lastClose, 90);
});

test("zu kurze Historie liefert keinen Referenzwert", () => {
  const ref = High52w.referenceFromBars(bars(Array(40).fill(10)));
  assert.equal(ref.ok, false);
  assert.equal(ref.reason, "insufficientHistory");
  assert.equal(ref.previous52WeekHigh, null);
});

test("rollierende Extrema kennen den aktuellen Bar nicht", () => {
  const closes = [10, 12, 9, 15, 11];
  const ext = High52w.rollingExtremes(closes, { lookbackTradingDays: 3 });
  assert.equal(ext.high[0], null);
  assert.equal(ext.high[1], 10);
  assert.equal(ext.high[3], 12);
  assert.equal(ext.low[3], 9);
});

test("Position in der Jahresspanne ohne absolutes Kursniveau", () => {
  /* Kurs 92, Hoch 100, Tief 80 -> Abstaende -8 % und +15 %. */
  const direkt = High52w.evaluate({ previous52WeekHigh: 100, previous52WeekLow: 80,
                                    currentPrice: 92, quoteAt: NOW, now: NOW });
  const ausAbstaenden = High52w.fromDistance(92 / 100 - 1, 92 / 80 - 1);
  assert.ok(Math.abs(direkt.rangePosition - 0.6) < 1e-9);
  assert.ok(Math.abs(ausAbstaenden.rangePosition - direkt.rangePosition) < 1e-9,
    "beide Wege muessen dieselbe Position ergeben");
  assert.equal(ausAbstaenden.previous52WeekHigh, null,
    "aus dem Ergebnis darf kein Kursniveau rekonstruierbar sein");
});
