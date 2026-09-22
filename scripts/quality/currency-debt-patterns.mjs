/* =========================================================================
   VISION UNIVERSE — currency-debt-patterns.mjs   (Currency Layer, O-6)

   EINE DEFINITION VON "FEST VERDRAHTETE WAEHRUNG", ZWEI LESER.

   Der Regression Guard (assert-no-local-fx.mjs) zaehlt sie und haelt sie
   gegen eine Grundlinie. Das Debt Register (build-currency-debt-register.mjs)
   klassifiziert dieselben Stellen nach O-6.

   Beide hatten zuerst ihre eigene Kopie der Muster. Das ist derselbe
   Fehler, den price-semantics.js fuer die Bereinigungsstufen behoben hat:
   eine gemeinsame Definition ohne gemeinsame Datei driftet auseinander,
   und dann zaehlt der Guard 68 und das Register 71, ohne dass jemand
   sagen kann, welche Zahl stimmt.
   ========================================================================= */

export const SCAN_DIRS = [
  "discover", "discover-v2", "vu2", "quant/ui", "quant/api", "quant/stock",
  "quant/screener", "quant/markt", "quant/radar", "quant/ranking", "quant/watchlist",
  "dashboard", "reports", "magazin", "morning", "etf", "hedgefonds", "academy", "macro"
];

export const EXEMPT = [
  "quant/engines/fx/", "quant/tests/", "scripts/", "node_modules/", "/data/", "/fixtures/"
];

export const EXTENSIONS = [".js", ".mjs", ".html"];

/* --- FX-Arithmetik: bricht den Lauf ab ---------------------------------- */
export const FX_MATH = [
  { id: "namedConverter",
    re: /\b(usd_?to_?eur|eur_?to_?usd|usdToEur|eurToUsd|toEuro?\s*\(|convertToEur|umrechnenInEuro)\b/i,
    why: "Eine benannte Umrechnungsfunktion ausserhalb des Core. Der Vertrag ist convertMoney(value, from, to, when, context)." },

  { id: "localRateVariable",
    re: /\b(exchangeRate|wechselkurs|fxRate|eurRate|usdRate|kurs_?eur_?usd)\s*[=:]/i,
    why: "Ein lokal gehaltener Wechselkurs. Der Stand gehoert in den FX-Store, damit es genau einen gibt." }
];

/* --- Verdaechtige Konstanten: gezaehlt, nicht abgebrochen --------------- */
export const FX_SUSPECT = [
  { id: "rateLiteralMultiplication",
    re: /[*/]\s*(0\.(8|9)\d{1,}|1\.[0-2]\d{2,})\b/,
    requiresCurrencyContext: true,
    why: "Multiplikation mit einer Konstanten in der Groessenordnung eines Wechselkurses, auf einer Zeile mit Waehrungsbezug. Wenn es ein Kurs ist, gehoert er in den FX-Store." }
];

export const CURRENCY_CONTEXT = /\b(eur|usd|chf|gbp|jpy|currency|waehrung|währung|wechselkurs|forex|\bfx\b)\b|[€$£¥]/i;

/* --- Fest verdrahtete Waehrungsdarstellung ------------------------------ */
export const HARDCODED_CURRENCY = [
  { id: "trailingDollar",    re: /["'`]\s*\$["'`]|\+\s*["'`]\s\$["'`]/ },
  { id: "germanScaleDollar", re: /(Mrd|Mio|Bio|Tsd)\.?\s*\$/ },

  /* Frueher /["'`]\$\$?\{/ - und damit ein Treffer auf JEDES
     Template-Literal, weil ein Backtick gefolgt von ${ dazu passt. Das
     hat drei Stellen als Waehrungsschuld gezaehlt, die keine sind
     (vu2/experience.js:83 ist ein Diagrammtitel).

     Jetzt zwei eindeutige Formen: ein literales Dollarzeichen vor einer
     Interpolation ("$${wert}") und ein Dollarzeichen vor einer Ziffer
     ("$1.3 Mrd."). */
  { id: "dollarPrefixTemplate", re: /["'`]\$\$\{|["'`]\$\d/ },
  { id: "currencyEquality",     re: /===\s*["'`]USD["'`]\s*\?|unit\s*===\s*["'`]USD["'`]/ }
];

/* --- Merkmale fuer die Klassifikation nach O-6 -------------------------- */
export const RATIO_MARKERS = /\b(pct|percent|prozent|margin|marge|growth|wachstum|ratio|roic|roe|roa|yield|rendite|drawdown|volatil|momentum|score|percentile|perzentil|rank|beta|multiple|kgv)\b/i;

export const MONETARY_MARKERS = /\b(price|kurs|marketcap|market_cap|marktkapital|boersenwert|revenue|umsatz|income|gewinn|cash|debt|schulden|fcf|cashflow|ebit|ebitda|assets|equity|volume|dollarvolume|eps|dividend|value|betrag|amount)\b/i;

/* Eine Zeile, die eine Zahl formatiert UND ein Waehrungszeichen anhaengt,
   ist eine Geldanzeige - unabhaengig davon, ob ein Kennzahlname darin
   vorkommt. Die Formatierer in discover/ui/surfaces.js und
   detail-fundamentals.js heissen `fmt(v, unit)` und nennen keine
   Kennzahl; sie waren deshalb alle UNCLASSIFIED, obwohl sie die
   eindeutigsten Faelle im ganzen Register sind. */
export const NUMERIC_FORMATTING = /\b(toFixed|toLocaleString|Math\.round|Intl\.NumberFormat)\b|\/\s*1e[369]|\/\s*1_?000/;

export const TEST_MARKERS = /\b(test|spec|fixture|mock|stub|assert|expect|describe\(|it\()\b/i;

export const INTENTIONAL_MARKERS = /\b(nativ|native|original|originalwaehrung|reporting ?currency|berichtswaehrung|quell|source ?currency|as ?reported|handelswaehrung|trading ?currency)\b/i;

/**
 * Zeilen, die Code sind - Kommentare herausgefiltert.
 *
 * Bewusst mit Blockzustand und nicht Zeile fuer Zeile: die Fassung ohne
 * ihn hat discover/ui/detail.js:730 als Waehrungsschuld gezaehlt. Die
 * Zeile lautet "303 Mrd. $ schon. *\/" - das Ende eines erklaerenden
 * Kommentars, der genau beschreibt, warum dort gerundet wird. Sie
 * beginnt nicht mit einem Kommentarzeichen und sah deshalb wie Code aus.
 */
export function codeLines(text) {
  const out = [];
  let inBlock = false;
  text.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    let isComment = false;

    if (inBlock) {
      isComment = true;
      if (trimmed.includes("*/")) {
        inBlock = false;
        /* Steht nach dem Blockende noch Code auf derselben Zeile, zaehlt
           er wieder. */
        const after = trimmed.slice(trimmed.indexOf("*/") + 2).trim();
        if (after) { out.push({ line: i + 1, text: after, raw: line }); }
      }
      return;
    }

    if (trimmed.startsWith("//")) isComment = true;
    else if (trimmed.startsWith("/*")) {
      isComment = true;
      if (!trimmed.includes("*/")) inBlock = true;
    } else if (trimmed.startsWith("*")) isComment = true;

    if (!isComment) out.push({ line: i + 1, text: trimmed, raw: line });
  });
  return out;
}
