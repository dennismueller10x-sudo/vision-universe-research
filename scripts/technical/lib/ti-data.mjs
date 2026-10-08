/* VU Technical Intelligence — Datenlader fuer Build, Evidence und Tests.

   Zwei Eingangsformen, beide vendor-neutral uebersetzt:
     1. Tagesbalken (Rohkurs + splitFactor + dividend je Bar, Format der
        kanonischen Historie bzw. golden-preview) → SPLIT_ADJUSTED via
        Canonical.fromPriceBars (Splits aus den Bars rekonstruiert, die
        bereinigte Spalte des Anbieters wird nicht gelesen).
     2. Wochenschluesse (discover-series-long: [[datum, close], …],
        split-bereinigt) → Serie mit O=H=L=C. Kein Volumen, keine Spanne:
        alle Engines laufen, Volumen-/Spannen-Befunde sind UNAVAILABLE. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const Canonical = require(join(ROOT, "quant/engines/technical/canonical-bars.js"));

export function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }

export function dailySeriesFromPayload(payload, instrumentId) {
  const bars = payload.bars || [];
  const actions = [];
  for (const b of bars) {
    if (b.splitFactor !== undefined && b.splitFactor !== 1) actions.push({ type: "split", exDate: b.date, ratio: b.splitFactor });
    if (Number.isFinite(b.dividend) && b.dividend > 0) actions.push({ type: "dividend", exDate: b.date, amount: b.dividend });
  }
  const worlds = Canonical.fromPriceBars(bars, actions, { instrumentId: instrumentId || payload.ticker, source: payload.provider ? "licensed-eod" : "unknown",
    sourceRevision: payload.updatedAt || payload.last || null, currency: payload.currency || "USD", exchange: payload.exchange || "US" });
  return worlds.SPLIT_ADJUSTED;
}

export function weeklySeriesFromPoints(points, instrumentId) {
  const rows = points.filter((p) => Array.isArray(p) && Number.isFinite(p[1]) && p[1] > 0)
    .map(([date, c]) => ({ date, open: c, high: c, low: c, close: c, volume: null }));
  return Canonical.fromRows(rows, { instrumentId, exchange: "US", currency: "USD", timeframe: "1W", priceSeriesType: "SPLIT_ADJUSTED",
    source: "weekly-close", sourceRevision: rows.length ? rows[rows.length - 1].date : null, meta: { closeOnly: true } });
}

export function loadGoldenDaily(ticker) {
  return dailySeriesFromPayload(readJson(join(ROOT, "quant/data/market/golden-preview/daily/ref_" + ticker + ".json")), ticker);
}
export function loadWeekly(securityId) {
  const j = readJson(join(ROOT, "quant/data/market/discover-series-long", securityId + ".json"));
  return weeklySeriesFromPoints(j.points || [], j.ticker || securityId);
}
