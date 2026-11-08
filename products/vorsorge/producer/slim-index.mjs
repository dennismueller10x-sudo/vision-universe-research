/* =========================================================================
   VISION UNIVERSE VORSORGE — slim-index.mjs   (vorsorge-slim-1.0.0)

   Schlanke Auszuege fuer den ersten Seitenaufruf von /vorsorge/. Reine
   Ableitungen aus bereits gebauten Dateien: keine eigene Rechnung, keine
   Rundung, Zeilen werden unveraendert kopiert.

     homeIndex(mainIndex)   -> vorsorge/data/etf-index-home.json
         Zaehler, Stand und die Indexzeilen der Kern-ETFs der Startseite
         (gleiche Felder, gleiche Werte wie in etf-index.json).
     holdingsFeed(index)    -> vorsorge/data/holdings/feed.json
         Feed und Quartale aus holdings/index.json (ohne bySymbol).

   Der Browser faellt auf etf-index.json bzw. holdings/index.json zurueck,
   wenn ein Auszug fehlt oder unvollstaendig ist.
   ========================================================================= */

/** Kern-ETFs der Startseite (vorsorge/ui/plan.js, Karte "Deine ETF-Welt"; Standard-Portfolio URTH + EEM). */
export const HOME_SYMBOLS = ["URTH", "SPY", "EEM", "QQQ", "FEZ", "IWM"];
export const HOME_SCHEMA = "vu-vorsorge-etf-index-home-1.0.0";
export const FEED_SCHEMA = "vu-vorsorge-holdings-feed-1.0.0";

/**
 * Alle Zeilen des Haupt-Index, deren Symbol ODER Slug ein Kern-Symbol ist, in Original-Reihenfolge.
 * So liefert m.find(<Kern-Symbol>) im Browser exakt dieselbe Zeile wie auf dem vollen Index
 * (Slug-Treffer zuerst, sonst hoechste Schicht je Symbol, bei Gleichstand die erste Zeile).
 */
export function homeIndex(mainIndex, symbols = HOME_SYMBOLS) {
  const fields = mainIndex.fields;
  const si = fields.indexOf("symbol"), li = fields.indexOf("slug");
  if (si < 0 || li < 0) throw new Error("etf-index ohne symbol/slug-Feld");
  const want = new Set(symbols.map((s) => String(s).toUpperCase()));
  const rows = mainIndex.rows.filter((r) => want.has(String(r[si] || "").toUpperCase()) || want.has(String(r[li] || "").toUpperCase()));
  return { schemaVersion: HOME_SCHEMA, sourceSchemaVersion: mainIndex.schemaVersion, part: "HOME", asOf: mainIndex.asOf,
    symbols: symbols.slice(), counts: mainIndex.counts, fields, rows };
}

/** Feed und Quartale der Holdings-Uebersicht - dieselben Werte wie in holdings/index.json. */
export function holdingsFeed(index) {
  return { schemaVersion: FEED_SCHEMA, sourceSchemaVersion: index.schemaVersion, quarters: index.quarters, feed: index.feed };
}
