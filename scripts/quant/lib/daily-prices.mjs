/* Tageskurse fuer Backtest-Auswertungen - nur zur Laufzeit, nie im Artefakt.

   Quelle in dieser Reihenfolge:
     1. --work-dir DIR/tiingo/daily/<securityId>.json   kanonische Historie (runner-privat)
        -> SPLIT_ADJUSTED (Marken) und TOTAL_RETURN (Ergebnis, adjustedClose)
     2. quant/data/market/golden-preview/daily/<securityId>.json   (oeffentliche Vorschau, fuenf Titel)
     3. quant/data/market/discover-series/<securityId>.json   (oeffentlich, 1 Jahr, nur splitbereinigt)
   Jede Rueckgabe nennt ihre Quelle und ob Gesamtrendite vorliegt; eine
   Auswertung mischt nie zwei Renditebasen. */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const Canonical = require(join(ROOT, "quant/engines/technical/canonical-bars.js"));
const MarketQuality = require(join(ROOT, "quant/engines/market-quality.js"));

/* Gesamtrendite nur mit bestandenem Vertrag (market-quality.js
   totalReturnVerdict, dieselbe Pruefung wie Abruf und Vergleichsmassstab).
   Eine Reihe, deren bereinigte Spalte eine Ausschuettung oder einen Split
   nicht mitgemacht hat, liefert tr = null - nie eine Kursrendite unter dem
   Namen Gesamtrendite. trVerdict nennt den Grund; legacyTotalReturn ist die
   alte Regel (nur "jede Bar hat adjustedClose") fuer die Vorher-Messung. */
export function fromBars(payload, opts = {}) {
  const bars = payload.bars || [];
  const actions = [];
  for (const b of bars) {
    if (b.splitFactor !== 1) actions.push({ type: "split", exDate: b.date, ratio: b.splitFactor });
    if (Number.isFinite(b.dividend) && b.dividend > 0) actions.push({ type: "dividend", exDate: b.date, amount: b.dividend });
  }
  const w = Canonical.fromPriceBars(bars, actions, { instrumentId: payload.ticker, source: "tiingo", sourceRevision: payload.updatedAt, currency: payload.currency || "USD", exchange: payload.exchange || "US" });
  const SA = w.SPLIT_ADJUSTED, TR = w.TOTAL_RETURN || null;
  const legacyTotalReturn = !!TR && bars.length > 0 && bars.every((_, i) => TR.close[i] > 0);
  const trVerdict = MarketQuality.totalReturnVerdict(bars, opts);
  const totalReturn = legacyTotalReturn && trVerdict.confirmed;
  return { dates: bars.map((b) => b.date), close: Float64Array.from(SA.close), high: Float64Array.from(SA.high), tr: totalReturn ? Float64Array.from(TR.close) : null, totalReturn, legacyTotalReturn, trVerdict };
}

export function dailyOf(securityId, workDir, { allowPublicPriceOnly = false } = {}) {
  const priv = workDir ? join(workDir, "tiingo", "daily", securityId + ".json") : null;
  if (priv && existsSync(priv)) return { source: "CANONICAL_HISTORY", ...fromBars(JSON.parse(readFileSync(priv, "utf8"))) };
  const golden = join(ROOT, "quant/data/market/golden-preview/daily", securityId + ".json");
  if (existsSync(golden)) return { source: "GOLDEN_PREVIEW", ...fromBars(JSON.parse(readFileSync(golden, "utf8"))) };
  if (!allowPublicPriceOnly) return null;
  const pub = join(ROOT, "quant/data/market/discover-series", securityId + ".json");
  if (!existsSync(pub)) return null;
  const j = JSON.parse(readFileSync(pub, "utf8"));
  if (j.priceSeriesType !== "SPLIT_ADJUSTED") return null;
  const close = Float64Array.from(j.points.map((p) => p[1]));
  return { source: "DISCOVER_SERIES_1Y", dates: j.points.map((p) => p[0]), close, high: close, tr: null, totalReturn: false };
}
