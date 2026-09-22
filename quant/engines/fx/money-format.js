/* =========================================================================
   VISION UNIVERSE — fx/money-format.js   (Currency Layer V1, §22, §52)

   DIE EINE STELLE, AN DER AUS EINER ZAHL EIN BETRAG WIRD.

   Heute formatiert jede Oberflaeche selbst. Das Ergebnis steht im
   Repository: discover/ui/cards.js haengt " $" an, discover/ui/surfaces.js
   und discover/ui/detail-fundamentals.js schreiben " Mrd. $",
   quant/ui/charts.js schreibt " Mrd" ohne Punkt, discover-v2/home.js
   entscheidet anhand von row.unit === 'USD'. Fuenf Dateien, fuenf
   Schreibweisen, ein Waehrungssymbol - fest verdrahtet.

   Sobald ein EUR/USD-Schalter existiert, ist das kein Schoenheitsfehler
   mehr, sondern ein Fehler: der Schalter erreicht die eine Datei, die
   jemand angefasst hat, und die anderen vier zeigen weiter Dollar.

   ZWEI REGELN

   1. FORMATIERUNG VERAENDERT NIE EINEN WERT. Diese Datei gibt Strings
      zurueck. Der gerundete Wert wird nirgends gespeichert und fliesst in
      keine Rechnung. Wer mit gerundeten Werten weiterrechnet, erzeugt
      Summen, die nicht aufgehen.

   2. EINE SPRACHE JE MODUS. Im EUR-Modus deutsche Konvention
      (Komma als Dezimaltrennzeichen, Mio./Mrd./Bio., Symbol hinten), im
      USD-Modus amerikanische (Punkt, M/B/T, Symbol vorn). Keine Mischung
      aus "bn" und "Mrd." in derselben Oberflaeche.

   DIE DEUTSCHE SKALA IST NICHT DIE AMERIKANISCHE

   Die lange Leiter: Million, Milliarde, Billion. Die kurze: million,
   billion, trillion. Deutsche "Billion" und englische "billion" sind um
   den Faktor 1000 verschieden. Eine automatische Uebersetzung der Wortform
   waere hier ein Fehler um drei Groessenordnungen - deshalb zwei getrennte
   Tabellen und keine Ableitung.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Registry = isNode ? require("./currency-registry.js") : (global.VUFx && global.VUFx.Registry);

  var VERSION = "money-format-1.0.0";

  /* Lange Leiter (de-DE). Bio. = 10^12. */
  var SCALES_DE = [
    { min: 1e12, div: 1e12, suffix: " Bio." },
    { min: 1e9,  div: 1e9,  suffix: " Mrd." },
    { min: 1e6,  div: 1e6,  suffix: " Mio." },
    { min: 1e3,  div: 1e3,  suffix: " Tsd." }
  ];

  /* Kurze Leiter (en-US). T = 10^12. */
  var SCALES_EN = [
    { min: 1e12, div: 1e12, suffix: "T" },
    { min: 1e9,  div: 1e9,  suffix: "B" },
    { min: 1e6,  div: 1e6,  suffix: "M" },
    { min: 1e3,  div: 1e3,  suffix: "K" }
  ];

  var LOCALES = {
    EUR: { locale: "de-DE", scales: SCALES_DE, symbolPosition: "suffix", spaceBeforeSymbol: true },
    USD: { locale: "en-US", scales: SCALES_EN, symbolPosition: "prefix", spaceBeforeSymbol: false },
    CHF: { locale: "de-CH", scales: SCALES_DE, symbolPosition: "prefix", spaceBeforeSymbol: true },
    GBP: { locale: "en-GB", scales: SCALES_EN, symbolPosition: "prefix", spaceBeforeSymbol: false },
    JPY: { locale: "ja-JP", scales: SCALES_EN, symbolPosition: "prefix", spaceBeforeSymbol: false }
  };

  /* Wenn die Anzeigewaehrung keine eigene Konvention mitbringt, gilt die
     der Oberflaeche - fuer Vision Universe also die deutsche. Nicht die
     amerikanische: der Primaermarkt ist Deutschland. */
  var FALLBACK_LOCALE = { locale: "de-DE", scales: SCALES_DE, symbolPosition: "suffix", spaceBeforeSymbol: true };

  function styleFor(currency) {
    return LOCALES[Registry.normalize(currency)] || FALLBACK_LOCALE;
  }

  function number(value, locale, minDigits, maxDigits) {
    try {
      return value.toLocaleString(locale, { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits });
    } catch (e) {
      /* toLocaleString kann in aelteren Laufzeiten ohne vollstaendige
         ICU-Daten die Locale ignorieren. Dann lieber ein sichtbar
         einfaches Format als eine stille Falschformatierung. */
      return value.toFixed(maxDigits);
    }
  }

  function attach(text, currency, style) {
    var meta = Registry.meta(currency);
    var symbol = meta ? meta.symbol : Registry.normalize(currency) || "";
    if (style.symbolPosition === "prefix") {
      return symbol + (style.spaceBeforeSymbol ? " " : "") + text;
    }
    return text + " " + symbol;
  }

  /**
   * Ein Kurs oder ein anderer kleiner Betrag.
   *
   *   formatPrice(154.7234, "EUR") -> "154,72 €"
   *   formatPrice(181.42,   "USD") -> "$181.42"
   *
   * JPY kennt keine Nachkommastellen - die Stellenzahl kommt aus der
   * Registry und nicht aus einer festen 2.
   */
  function formatPrice(value, currency, opts) {
    opts = opts || {};
    if (typeof value !== "number" || !isFinite(value)) return opts.placeholder || "–";
    var style = styleFor(currency);
    var meta = Registry.meta(currency);
    var digits = typeof opts.decimals === "number" ? opts.decimals : (meta ? meta.decimals : 2);
    return attach(number(value, style.locale, digits, digits), currency, style);
  }

  /**
   * Ein grosser Betrag in verkuerzter Form.
   *
   *   formatCompact(3.42e12, "EUR") -> "3,42 Bio. €"
   *   formatCompact(1.186e11,"EUR") -> "118,60 Mrd. €"
   *   formatCompact(3.42e12, "USD") -> "$3.42T"
   *
   * `decimals` steuert die Nachkommastellen der verkuerzten Zahl, nicht
   * die des Betrags: 3,42 Bio. ist auf 10 Milliarden genau, und das ist
   * bei einer Marktkapitalisierung die ehrlichere Angabe als eine
   * zwoelfstellige Zahl, die Genauigkeit vortaeuscht.
   */
  function formatCompact(value, currency, opts) {
    opts = opts || {};
    if (typeof value !== "number" || !isFinite(value)) return opts.placeholder || "–";
    var style = styleFor(currency);
    var abs = Math.abs(value);
    var digits = typeof opts.decimals === "number" ? opts.decimals : 2;

    for (var i = 0; i < style.scales.length; i++) {
      var scale = style.scales[i];
      if (abs >= scale.min) {
        return attach(number(value / scale.div, style.locale, digits, digits) + scale.suffix, currency, style);
      }
    }
    var meta = Registry.meta(currency);
    return attach(number(value, style.locale, 0, meta ? meta.decimals : 2), currency, style);
  }

  /**
   * Der Einstieg, den Produkte benutzen: ein Money-Objekt aus der Engine
   * hinein, ein fertiger String heraus - und der ehrliche Rueckfall
   * inklusive.
   *
   * Bei fehlendem Wechselkurs wird der Originalwert in seiner Waehrung
   * formatiert (§23). Nie derselbe Wert mit dem Symbol der
   * Anzeigewaehrung, nie eine stille 1:1-Umrechnung.
   */
  function formatMoney(money, opts) {
    opts = opts || {};
    var out = {
      text: opts.placeholder || "–",
      currency: null,
      isFallback: false,
      freshnessNote: null,
      title: null
    };
    if (!money) return out;

    var compact = opts.compact === true;
    var render = compact ? formatCompact : formatPrice;

    if (money.available && money.display && typeof money.display.value === "number") {
      out.currency = money.display.currency;
      out.text = render(money.display.value, money.display.currency, opts);
    } else if (money.fallback && typeof money.fallback.value === "number") {
      out.currency = money.fallback.currency;
      out.text = render(money.fallback.value, money.fallback.currency, opts);
      out.isFallback = true;
    } else if (money.native && typeof money.native.value === "number" && money.native.currency) {
      out.currency = money.native.currency;
      out.text = render(money.native.value, money.native.currency, opts);
      out.isFallback = true;
    } else {
      return out;
    }

    /* §53: nicht jede Karte traegt FX-Metadaten. Nur die Zustaende, die
       eine Aussage relativieren, werden sichtbar. */
    var fresh = money.freshness;
    if (fresh && fresh.consumerVisible) out.freshnessNote = fresh.label;
    if (out.isFallback && !out.freshnessNote) {
      out.freshnessNote = "Originalwaehrung";
    }

    if (money.fx) {
      out.title = "Umgerechnet mit " + money.fx.base + "/" + money.fx.quote + " = " +
        number(money.fx.rate, "de-DE", 4, 6) +
        (money.fx.asOf ? " (Stand " + money.fx.asOf + ")" : "") +
        (money.fx.method ? ", Methode " + money.fx.method : "");
    }
    return out;
  }

  /**
   * Prozentwerte. Gehoeren hierher, damit eine Oberflaeche nicht fuer
   * Betraege den zentralen Formatter benutzt und fuer Prozentwerte doch
   * wieder ihren eigenen - und dann im USD-Modus deutsche Kommata zeigt.
   *
   * Prozentwerte tragen NIE ein Waehrungssymbol (§33).
   */
  function formatPercent(value, currency, opts) {
    opts = opts || {};
    if (typeof value !== "number" || !isFinite(value)) return opts.placeholder || "–";
    var style = styleFor(currency);
    var digits = typeof opts.decimals === "number" ? opts.decimals : 1;
    var text = number(value, style.locale, digits, digits) + " %";
    return (opts.signed && value > 0) ? "+" + text : text;
  }

  /** Ein Multiple. Dimensionslos, also ohne Symbol und ohne Skala (§33). */
  function formatMultiple(value, currency, opts) {
    opts = opts || {};
    if (typeof value !== "number" || !isFinite(value)) return opts.placeholder || "–";
    var style = styleFor(currency);
    var digits = typeof opts.decimals === "number" ? opts.decimals : 1;
    return number(value, style.locale, digits, digits) + (opts.suffix === false ? "" : "x");
  }

  var api = {
    VERSION: VERSION,
    SCALES_DE: SCALES_DE, SCALES_EN: SCALES_EN, LOCALES: LOCALES,
    styleFor: styleFor,
    formatPrice: formatPrice,
    formatCompact: formatCompact,
    formatMoney: formatMoney,
    formatPercent: formatPercent,
    formatMultiple: formatMultiple
  };

  if (isNode) module.exports = api;
  else { global.VUFx = global.VUFx || {}; global.VUFx.Format = api; }
})(typeof window !== "undefined" ? window : globalThis);
