/* =========================================================================
   VISION UNIVERSE TECHNICAL — measure-ema200-signal-effect.mjs

   WIE VIELE TITEL STEHEN UEBER DER EMA 200 - UND WIE VIELE UEBER DER SMA 200?

   Liest die committeten Technical-Shards (technical-signals-v1) und zaehlt
   je Titel: Schluss > SMA 200 (exakt, featuresAtCutoff.sma200) gegen
   Schluss > EMA 200.

   Zwei Modi, pro Titel automatisch gewaehlt und im Bericht ausgewiesen:

   EXACT     Der Shard traegt featuresAtCutoff.ema200 (nach der ersten
             Materialisierung mit ema-settled-1.0.0). Dann wird nur gezaehlt.

   ESTIMATE  Der Shard ist aelter. Die Vollhistorie ist runner-privat (R2),
             der Shard traegt nur 270 Tagesbars. Geschaetzt wird so:
               1. EMA ueber die Wochenschluesse der langen Reihe
                  (discover-series-long, split-bereinigt) VOR dem
                  Anzeigefenster, mit dem Wochenfaktor (1-a)^5,
               2. von dort Tag fuer Tag ueber die 270 Bars des Shards.
             Ein Fehler des Wochenwerts wirkt am Stichtag nur noch mit
             (1-a)^270 = 0,0672. Die Unsicherheit je Titel wird gemessen:
             u = max(3 * 0,0672 * |EMA_Woche - EMA_Tag| / EMA_Tag, 1e-3),
             gemessen am Stichtag. Liegt der Schluss naeher als u an der
             Linie, zaehlt der Titel als "nicht entscheidbar".
             Titel mit weniger als minimumBars (891) Bars Vollhistorie
             bekaemen keine EMA 200 und zaehlen als "zu kurz".

   Schreibt nichts ausser optional --out <datei>.

   Ausfuehren:
     node scripts/technical/measure-ema200-signal-effect.mjs [--dir <shards>] [--long <discover-series-long>] [--out bericht.json]
   ========================================================================= */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Features = require(join(ROOT, "quant/engines/technical/feature-store.js"));

/* Untergrenze der Unsicherheit: an den fuenf Golden-Titeln lag die Schaetzung
   0,4e-4 bis 4,3e-4 (relativ) neben dem exakten Wert - die Grenze hat 2,3-fachen Abstand. */
export const UNCERTAINTY_FLOOR = 1e-3;
const PERIOD = 200, ALPHA = 2 / (PERIOD + 1), WINDOW_DECAY_270 = Math.pow(1 - ALPHA, 270);
export const MINIMUM_BARS = PERIOD + Features.emaWarmupBars(PERIOD, Features.EMA_MAX_SEED_WEIGHT);

/** Schaetzung der EMA 200 am letzten Bar aus Wochenreihe + Tagesfenster. */
export function estimateEma200(weeklyPoints, windowDates, windowCloses) {
  const from = windowDates[0], cutoff = windowDates.at(-1);
  const pts = (weeklyPoints || []).filter((p) => Number.isFinite(p[1]) && p[1] > 0);
  const before = pts.filter((p) => p[0] < from);
  if (!before.length) return { status: "NO_WEEKLY_BEFORE_WINDOW" };
  const beta = Math.pow(1 - ALPHA, 5);
  let e = before[0][1];
  for (let w = 1; w < before.length; w++) e = beta * e + (1 - beta) * before[w][1];
  /* Startgewicht des Proxys (erster Wochenschluss als Start) bis zum Stichtag. */
  const seedWeight = Math.pow(beta, before.length - 1) * WINDOW_DECAY_270;
  let daily = e;
  for (const c of windowCloses) daily = daily + ALPHA * (c - daily);
  let weekly = e;
  for (const p of pts) if (p[0] >= from && p[0] <= cutoff) weekly = beta * weekly + (1 - beta) * p[1];
  const errWeekly = Math.abs(weekly - daily) / daily;
  const u = Math.max(3 * WINDOW_DECAY_270 * errWeekly, UNCERTAINTY_FLOOR);
  return { status: seedWeight <= Features.EMA_MAX_SEED_WEIGHT ? "ESTIMATED" : "PROXY_UNSETTLED", ema200: daily, uncertainty: u, seedWeight };
}

export function measure({ dir, longDir }) {
  const shards = readdirSync(dir).filter((f) => /^[A-Z0-9._-]{2}\.json\.gz$/.test(f)).sort();
  const c = { bundles: 0, withSma200: 0, aboveSma200: 0, exactMode: 0, estimateMode: 0,
    eligible: 0, tooShort: 0, estimateUnavailable: 0, decided: 0, undecided: 0,
    aboveEma200: 0, belowEma200: 0, sameSide: 0, aboveSmaBelowEma: 0, belowSmaAboveEma: 0,
    historyAtLeast: { 661: 0, 891: 0, 1122: 0 } };
  const gaps = [], differing = [];
  for (const f of shards) {
    const shard = JSON.parse(gunzipSync(readFileSync(join(dir, f))));
    for (const [ticker, x] of Object.entries(shard.instruments || {})) {
      c.bundles++;
      const b = x.bundle, F = b.featuresAtCutoff || {}, close = x.bars.close.at(-1), sourceBars = x.provenance && x.provenance.sourceBars;
      for (const n of [661, 891, 1122]) if (sourceBars >= n) c.historyAtLeast[n]++;
      const hasSma = Number.isFinite(F.sma200);
      if (hasSma) { c.withSma200++; if (close > F.sma200) c.aboveSma200++; }
      let ema = null, u = 0;
      if (Object.prototype.hasOwnProperty.call(F, "ema200")) {
        c.exactMode++;
        if (!Number.isFinite(F.ema200)) { c.tooShort++; continue; }
        ema = F.ema200;
      } else {
        c.estimateMode++;
        if (!(sourceBars >= MINIMUM_BARS)) { c.tooShort++; continue; }
        const file = join(longDir, x.securityId + ".json");
        if (!existsSync(file)) { c.estimateUnavailable++; continue; }
        const est = estimateEma200(JSON.parse(readFileSync(file, "utf8")).points, x.bars.timestamps, x.bars.close);
        if (est.status !== "ESTIMATED") { c.estimateUnavailable++; continue; }
        ema = est.ema200; u = est.uncertainty;
      }
      c.eligible++;
      const rel = close / ema - 1;
      if (Math.abs(rel) <= u) { c.undecided++; continue; }
      c.decided++;
      const aboveEma = close > ema;
      if (aboveEma) c.aboveEma200++; else c.belowEma200++;
      if (hasSma) {
        gaps.push(ema / F.sma200 - 1);
        const aboveSma = close > F.sma200;
        if (aboveSma === aboveEma) c.sameSide++;
        else { if (aboveSma) c.aboveSmaBelowEma++; else c.belowSmaAboveEma++; differing.push(ticker); }
      }
    }
  }
  gaps.sort((a, b) => a - b);
  const q = (p) => gaps.length ? Math.round(1e4 * gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))]) / 1e4 : null;
  return { minimumBars: MINIMUM_BARS, counts: c,
    emaVsSmaRelative: { n: gaps.length, p05: q(0.05), p25: q(0.25), median: q(0.5), p75: q(0.75), p95: q(0.95) },
    differingSample: differing.slice(0, 40), differingTotal: differing.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const report = measure({ dir: arg("--dir", join(ROOT, "quant/data/product/technical-signals-v1")),
    longDir: arg("--long", join(ROOT, "quant/data/market/discover-series-long")) });
  const out = arg("--out", null);
  if (out) writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
