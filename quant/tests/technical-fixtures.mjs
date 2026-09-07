/* Synthetische Serien fuer die Technical-Intelligence-Tests.
   Keine Testdatei (kein *.test.mjs) — reine Hilfen. Alle Serien sind
   deterministisch (Mulberry32 aus hash.js), damit Hash-Vergleiche gelten. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Hash = require("../engines/hash.js");
const Canonical = require("../engines/technical/canonical-bars.js");

export function tradingDays(start, n) {
  const out = [];
  let d = new Date(start + "T00:00:00Z");
  while (out.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

/** Baut eine Serie aus einem Close-Pfad; OHL werden deterministisch abgeleitet. */
export function seriesFromCloses(closes, opts = {}) {
  const days = tradingDays(opts.start || "2015-01-05", closes.length);
  const rand = Hash.mulberry32(Hash.seedFromString(opts.seed || "vu-tech-fixture"));
  const rangePct = opts.rangePct === undefined ? 0.015 : opts.rangePct;
  const rows = closes.map((c, i) => {
    const prev = i ? closes[i - 1] : c;
    const r = rangePct * (0.5 + rand());
    const hi = Math.max(prev, c) * (1 + r), lo = Math.min(prev, c) * (1 - r);
    return { date: days[i], open: prev + (c - prev) * 0.3, high: hi, low: lo, close: c,
             volume: opts.volume ? opts.volume(i, rand) : Math.round(1e6 * (0.7 + rand() * 0.6)) };
  });
  return Canonical.fromRows(rows, {
    instrumentId: opts.instrumentId || "SYN", exchange: "SYN", currency: "USD", timeframe: "1D",
    priceSeriesType: opts.priceSeriesType || "SPLIT_ADJUSTED", source: "synthetic", sourceRevision: "fixture-1"
  });
}

function walk(n, drift, vol, seed, start = 100) {
  const rand = Hash.mulberry32(Hash.seedFromString(seed));
  const out = [start];
  for (let i = 1; i < n; i++) out.push(out[i - 1] * Math.exp(drift + vol * Hash.gaussian(rand)));
  return out;
}

export const fixtures = {
  cleanUptrend: (n = 400) => seriesFromCloses(walk(n, 0.0025, 0.008, "up"), { seed: "up", instrumentId: "SYN_UP" }),
  cleanDowntrend: (n = 400) => seriesFromCloses(walk(n, -0.0025, 0.008, "down"), { seed: "down", instrumentId: "SYN_DOWN" }),
  range: (n = 400) => {
    const closes = [];
    for (let i = 0; i < n; i++) closes.push(100 + 8 * Math.sin(i / 9) + 0.6 * Math.cos(i / 2.3));
    return seriesFromCloses(closes, { seed: "range", instrumentId: "SYN_RANGE" });
  },
  highVol: (n = 400) => seriesFromCloses(walk(n, 0.0005, 0.035, "hv"), { seed: "hv", rangePct: 0.03, instrumentId: "SYN_HV" }),
  lowVol: (n = 400) => seriesFromCloses(walk(n, 0.0005, 0.004, "lv"), { seed: "lv", rangePct: 0.004, instrumentId: "SYN_LV" }),
  /** Aufwaertstrend mit einer 10-%-Luecke nach oben bei Index 200. */
  gap: (n = 400) => {
    const closes = walk(n, 0.001, 0.006, "gap");
    for (let i = 200; i < n; i++) closes[i] *= 1.10;
    return seriesFromCloses(closes, { seed: "gap", instrumentId: "SYN_GAP" });
  },
  /** Fake Reversal: Trend, kurzer Rueckschlag unterhalb Schwelle, Trend geht weiter. */
  fakeReversal: () => {
    const closes = [];
    for (let i = 0; i < 120; i++) closes.push(100 + i * 0.5);
    for (let i = 0; i < 5; i++) closes.push(closes[closes.length - 1] * 0.995);  // -2.5 % gesamt
    for (let i = 0; i < 120; i++) closes.push(closes[closes.length - 1] + 0.5);
    return seriesFromCloses(closes, { seed: "fake", rangePct: 0.002, instrumentId: "SYN_FAKE" });
  },
  /** Confirmed Reversal: Trend, dann klarer Umschwung ueber jede Schwelle. */
  confirmedReversal: () => {
    const closes = [];
    for (let i = 0; i < 150; i++) closes.push(100 + i * 0.5);
    for (let i = 0; i < 150; i++) closes.push(closes[closes.length - 1] - 0.45);
    return seriesFromCloses(closes, { seed: "conf", rangePct: 0.002, instrumentId: "SYN_CONF" });
  },
  /** Stueckweise lineare Pfade aus Pivotpunkten (fuer Elliott/Struktur). */
  piecewise: (points, opts = {}) => {
    const closes = [];
    for (let p = 0; p < points.length - 1; p++) {
      const [i0, v0] = points[p], [i1, v1] = points[p + 1];
      for (let i = i0; i < i1; i++) closes.push(v0 + (v1 - v0) * (i - i0) / (i1 - i0));
    }
    closes.push(points[points.length - 1][1]);
    return seriesFromCloses(closes, Object.assign({ seed: "pw", rangePct: 0.004, instrumentId: "SYN_PW" }, opts));
  }
};

/** RAW-PriceBars (schema.js-Form) mit einem 4:1-Split bei Index splitAt. */
export function rawBarsWithSplit(n = 300, splitAt = 150, ratio = 4) {
  const days = tradingDays("2019-01-02", n);
  const bars = [], actions = [];
  let level = 400;
  for (let i = 0; i < n; i++) {
    level *= 1.001;
    const f = i >= splitAt ? ratio : 1;
    const c = level / f;
    bars.push({ securityId: "sec_SPLIT", date: days[i], open: c * 0.999, high: c * 1.01, low: c * 0.99, close: c,
                adjustedClose: level * 1.0001, volume: 1000000 * f, currency: "USD", dataSourceId: "fixture" });
  }
  actions.push({ actionId: "a1", securityId: "sec_SPLIT", type: "split", exDate: days[splitAt], announcedAt: days[splitAt - 20], ratio, dataSourceId: "fixture" });
  return { bars, actions, days };
}
