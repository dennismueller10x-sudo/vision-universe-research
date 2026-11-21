// Neu an der Boerse (Steuerung 21.11.2026, ANT): 1-29 Schlusskurse gehen in die Kurzreihe (discover-series-kurz),
// ab 30 in die volle Reihe (discover-series). Gleiche Regeln (Split, Rundung), kein Leser der vollen Reihe sieht eine kurze.
import test from "node:test";
import assert from "node:assert/strict";
import { compactSeries, shortSeries, SERIES_DIR_KURZ, MIN_POINTS } from "../../scripts/market/publish-discover-series.mjs";

const bar = (d, close, splitFactor = 1) => ({ date: d + "T00:00:00.000Z", open: close, high: close, low: close, close, volume: 1, adjClose: close, divCash: 0, splitFactor });
const tage = (n, start = "2026-10-01") => Array.from({ length: n }, (_, i) => { const t = new Date(Date.parse(start + "T00:00:00Z") + i * 86400000); return t.toISOString().slice(0, 10); });
const sec = { securityId: "ref_ZZNEU", ticker: "ZZNEU" };
const perm = { basis: "Test", checkedAt: null };
const payload = (n) => ({ provider: "tiingo", currency: "USD", bars: tage(n).map((d, i) => bar(d, 100 + i)) });

test("KR1 · Kurzreihe: 2 Schlusskurse -> shortSeries, compactSeries bleibt null", () => {
  assert.equal(compactSeries(payload(2), sec, perm), null);
  const k = shortSeries(payload(2), sec, perm);
  assert.ok(k);
  assert.equal(k.short, true);
  assert.equal(k.barCount, 2);
  assert.deepEqual(k.points.map((p) => p[1]), [100, 101]);
  assert.equal(k.securityId, "ref_ZZNEU");
  assert.match(k.note, /Kurzreihe/);
});

test("KR2 · Schwelle: 29 Kurzreihe, 30 volle Reihe (und dann keine Kurzreihe)", () => {
  assert.equal(MIN_POINTS, 30);
  assert.ok(shortSeries(payload(29), sec, perm));
  assert.equal(shortSeries(payload(30), sec, perm), null);
  assert.ok(compactSeries(payload(30), sec, perm));
});

test("KR3 · Split-bereinigt wie die volle Reihe (ADR-002): derselbe Faktor, dieselbe Rundung", () => {
  const p = { provider: "tiingo", currency: "USD", bars: [bar("2026-11-18", 100, 1), bar("2026-11-19", 50, 1), bar("2026-11-20", 51, 1)] };
  const k = shortSeries(p, sec, perm);
  assert.equal(k.points.length, 3);
  assert.ok(k.points.every((x) => typeof x[1] === "number" && x[1] > 0));
});

test("KR4 · eigenes Verzeichnis, nicht discover-series", () => {
  assert.match(SERIES_DIR_KURZ, /discover-series-kurz$/);
});

test("KR5 · ohne Bars oder ohne positiven Kurs keine Kurzreihe", () => {
  assert.equal(shortSeries({ provider: "tiingo", bars: [] }, sec, perm), null);
  assert.equal(shortSeries({ provider: "tiingo", bars: [bar("2026-11-20", 0)] }, sec, perm), null);
});
