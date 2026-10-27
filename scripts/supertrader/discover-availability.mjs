/* =========================================================================
   VISION UNIVERSE — Supertrader · discover-availability.mjs

   Welche Titel mit Supertrader-Seite haben eine Discover-Aktienseite?
   Reine Funktionen ohne Datei- oder Datenzugriff, gemeinsam fuer den
   vollen Build (build.mjs) und den Bereinigungsmodus (prune-dead-refs.mjs),
   damit beide dieselbe Titelmenge und denselben Ausweis bilden.
   ========================================================================= */

/** Alle Symbole, die irgendwo in einem Ausgabeobjekt als `symbol` stehen. */
export function symbolsIn(x, out = new Set()) {
  if (Array.isArray(x)) for (const y of x) symbolsIn(y, out);
  else if (x && typeof x === 'object') {
    if (typeof x.symbol === 'string') out.add(x.symbol);
    for (const v of Object.values(x)) if (v && typeof v === 'object') symbolsIn(v, out);
  }
  return out;
}

/** Titel des VU-Trendfolge-Depots mit eigener Aktienseite (Positionen,
 *  Kandidaten, knappe Verfehlungen, Abgaenge). Eine Quelle fuer den Build
 *  und den Bereinigungsmodus (prune-dead-refs.mjs). */
export function trend52Symbols(t52) {
  return [...new Set([...t52.portfolio.positions, ...t52.prepared.candidates, ...t52.nearMisses, ...t52.closed].map((x) => x.symbol))];
}

/** Welche Titel mit Supertrader-Seite haben (k)eine Discover-Aktienseite? */
export function discoverAvailability(symbols, indexSymbols) {
  const index = new Set(indexSymbols);
  const checked = [...new Set(symbols)].sort();
  return {
    source: 'discover/data/stock-index/US_REAL.json',
    checked: checked.length,
    unavailable: checked.filter((s) => !index.has(s)),
    note: 'Titel mit Supertrader-Seite ohne Discover-Aktienseite (z. B. vom Faktor-Qualitaetsgate gesperrt). Signale bleiben unveraendert; die Seite zeigt einen Hinweis statt des Links.'
  };
}
