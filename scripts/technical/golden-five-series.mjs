/* =========================================================================
   VISION UNIVERSE TECHNICAL — golden-five-series.mjs   (Phase 5)

   Eine Quelle fuer "wie wird aus den gespeicherten Golden-Five-Tiingo-Bars
   eine SPLIT_ADJUSTED-CanonicalSeries", damit build-technical-data.mjs und
   verify-technical-data.mjs nicht zwei leicht unterschiedliche Kopien
   derselben Ableitung pflegen — genau die Art Abweichung, die eine
   Nachrechnungspruefung wie verify-technical-data.mjs eigentlich aufdecken
   soll.

   Split-Bereinigung wird, wie beim Mock-Universum, selbst aus den
   Rohkursen und den in der Kursreihe mitgefuehrten splitFactor-Werten
   abgeleitet (Canonical.fromPriceBars) — nicht aus Tiingos eigener
   adjClose-Spalte uebernommen. Kein Netzwerkaufruf: die Kapitalmassnahmen
   stehen bereits in den gespeicherten Bars.
   ========================================================================= */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * @param {string} root  Repository-Wurzel
 * @param {object} Canonical  quant/engines/technical/canonical-bars.js
 * @returns {object} { [ticker]: CanonicalSeries (SPLIT_ADJUSTED) }
 */
export function loadGoldenFiveSeries(root, Canonical) {
  const dir = join(root, "quant", "data", "market", "golden-preview", "daily");
  const out = {};
  if (!existsSync(dir)) return out;

  for (const file of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const payload = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const ticker = payload.ticker;
    const bars = payload.bars || [];
    if (!ticker || bars.length < 300) continue;

    const corporateActions = [];
    for (const bar of bars) {
      if (bar.splitFactor !== null && bar.splitFactor !== undefined && bar.splitFactor !== 1) {
        corporateActions.push({ type: "split", exDate: bar.date, ratio: bar.splitFactor });
      }
      if (bar.dividend !== null && bar.dividend !== undefined && bar.dividend > 0) {
        corporateActions.push({ type: "dividend", exDate: bar.date, amount: bar.dividend });
      }
    }

    const worlds = Canonical.fromPriceBars(bars, corporateActions, {
      instrumentId: ticker, source: "tiingo", sourceRevision: payload.updatedAt,
      currency: "USD", exchange: payload.exchange || "US"
    });
    if (worlds.SPLIT_ADJUSTED && worlds.SPLIT_ADJUSTED.length >= 300) out[ticker] = worlds.SPLIT_ADJUSTED;
  }
  return out;
}
