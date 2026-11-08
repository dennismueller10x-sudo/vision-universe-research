/* Synthetische Eingaben fuer die Musterstudie in Gesamtrendite
   (build-pattern-research.mjs --return-basis total).

   writePatternFixture(dir) legt an:
     dir/series/ref_<T>.json          Wochenreihen im Format discover-series-long-1.0.0
                                      (splitbereinigter Freitagsschluss, wie die Pipeline)
     dir/work/tiingo/daily/<id>.json  Tageskerzen im Format der kanonischen Historie
                                      (Rohkurs, splitFactor, dividend, Anbieterspalte)

   Titel (securityId ueber core/identity.js, ADR-001):
     PTA, PTC, PTE   Quartalsdividende ~0,8 %, ohne Split
     PTB             Quartalsdividende und Split 2:1 (2014-06-02)
     PTD             Quartalsdividende und Split 3:1 (2017-03-01), starker Anstieg
     PXN             keine Tagesreihe                 -> NO_CANONICAL_SERIES
     PXF             eine Kerze ohne dividend-Feld    -> DIVIDEND_FIELD_MISSING
     PXS             Tagesreihe endet 2023-06-30      -> STALE
   Optional je Titel noDividend: true (keine Ausschuettung), nur in eigenen Listen.

   Alles deterministisch (fester Zufallsgenerator je Titel). Keine echte
   Kursreihe, kein Anbieterabruf. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const Identity = require(join(ROOT, "core/identity.js"));

export const FIXTURE_START = "2008-01-01";
export const FIXTURE_END = "2024-12-31";
export const TITLES = [
  { ticker: "PTA", seed: 11, drift: 0.10, vol: 0.45 },
  { ticker: "PTB", seed: 23, drift: 0.18, vol: 0.55, split: { date: "2014-06-02", ratio: 2 } },
  { ticker: "PTC", seed: 37, drift: 0.02, vol: 0.40 },
  { ticker: "PTD", seed: 41, drift: 0.30, vol: 0.60, split: { date: "2017-03-01", ratio: 3 } },
  { ticker: "PTE", seed: 53, drift: 0.06, vol: 0.50 },
  { ticker: "PXN", seed: 67, drift: 0.12, vol: 0.50, daily: "NONE" },
  { ticker: "PXF", seed: 71, drift: 0.08, vol: 0.45, daily: "FIELD_MISSING" },
  { ticker: "PXS", seed: 83, drift: 0.15, vol: 0.50, daily: "STALE" }
];
export const INCLUDED = ["PTA", "PTB", "PTC", "PTD", "PTE"];
export const EXCLUDED = { PXN: "NO_CANONICAL_SERIES", PXF: "DIVIDEND_FIELD_MISSING", PXS: "STALE" };
export const idOf = (ticker) => Identity.securityIdForTicker(ticker);

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const r4 = (x) => Math.round(x * 10000) / 10000;

export function weekdays(from = FIXTURE_START, to = FIXTURE_END) {
  const out = [];
  for (let t = Date.parse(from + "T00:00:00Z"); t <= Date.parse(to + "T00:00:00Z"); t += 86400000) {
    const d = new Date(t), dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Tageskerzen eines Titels: Rohkurs, Splitfaktor, Bardividende und eine Anbieterspalte nach derselben Konvention wie die Rekonstruktion. */
export function dailyBars(title, dates = weekdays()) {
  const rand = rng(title.seed), n = dates.length;
  const dt = 1 / 252, mu = title.drift, sigma = title.vol;
  /* splitbereinigter Pfad (heutige Stueckzahl) */
  const adj = new Array(n);
  adj[0] = 20 + (title.seed % 30);
  for (let i = 1; i < n; i++) {
    const z = Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
    adj[i] = adj[i - 1] * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z);
  }
  const splitAt = title.split ? dates.indexOf(title.split.date) : -1;
  const ratio = title.split ? title.split.ratio : 1;
  const close = adj.map((v, i) => r4(splitAt >= 0 && i < splitAt ? v * ratio : v));
  const split = dates.map((_, i) => (i === splitAt ? ratio : 1));
  const div = new Array(n).fill(0);
  /* noDividend: Titel ohne Ausschuettung (gepaarter Vergleich, Bucket NONE). */
  for (let i = 63; !title.noDividend && i < n; i += 63) {
    const k = i === splitAt ? i + 1 : i;
    if (k < n) div[k] = r4(close[k - 1] * 0.008);
  }
  /* Anbieterspalte: f_(t-1)/f_t = P_t / (s_t (P_t + D_t)) */
  const f = new Array(n); f[n - 1] = 1;
  for (let i = n - 1; i > 0; i--) f[i - 1] = f[i] * close[i] / (split[i] * (close[i] + div[i]));
  const id = idOf(title.ticker);
  return dates.map((date, i) => ({ securityId: id, date, open: close[i], high: r4(close[i] * 1.01), low: r4(close[i] * 0.99), close: close[i],
    volume: 100000 + Math.round(rand() * 900000), adjustedClose: close[i] * f[i], splitFactor: split[i], dividend: div[i] }));
}

/** Splitbereinigter Wochenschluss (Freitag) aus den Tageskerzen - die Reihe, auf der die Studie erkennt. */
export function weeklyPoints(bars) {
  const n = bars.length;
  let cum = 1;
  const factorAfter = new Array(n);
  for (let i = n - 1; i >= 0; i--) { factorAfter[i] = cum; cum *= bars[i].splitFactor; }
  const out = [];
  for (let i = 0; i < n; i++) {
    const dow = new Date(bars[i].date + "T00:00:00Z").getUTCDay();
    if (dow === 5) out.push([bars[i].date, r4(bars[i].close / factorAfter[i])]);
  }
  return out;
}

export function seriesPayload(title, points) {
  return { schemaVersion: "discover-series-long-1.0.0", status: "CALCULATED", source: "synthetic", securityId: idOf(title.ticker), ticker: title.ticker,
    instrumentId: title.ticker, provider: "synthetic", dataMode: "test", priceSeriesType: "SPLIT_ADJUSTED", currency: "USD", range: "MAX", grain: "weekly",
    from: points[0][0], to: points[points.length - 1][0], asOf: points[points.length - 1][0], points };
}

/** Schreibt Wochenreihen und Tageskerzen. Liefert die Pfade. */
export function writePatternFixture(dir, titles = TITLES) {
  const series = join(dir, "series"), work = join(dir, "work"), daily = join(work, "tiingo", "daily");
  mkdirSync(series, { recursive: true }); mkdirSync(daily, { recursive: true });
  for (const title of titles) {
    const bars = dailyBars(title);
    writeFileSync(join(series, "ref_" + title.ticker + ".json"), JSON.stringify(seriesPayload(title, weeklyPoints(bars))));
    if (title.daily === "NONE") continue;
    let out = bars;
    if (title.daily === "FIELD_MISSING") { out = bars.map((b) => ({ ...b })); delete out[1500].dividend; }
    if (title.daily === "STALE") out = bars.filter((b) => b.date <= "2023-06-30");
    writeFileSync(join(daily, idOf(title.ticker) + ".json"), JSON.stringify({ ticker: title.ticker, securityId: idOf(title.ticker), provider: "tiingo",
      currency: "USD", exchange: "NYSE", first: out[0].date, last: out[out.length - 1].date, bars: out }));
  }
  return { series, work, daily };
}
