/* =========================================================================
   WER ZUERST BEDIENT WIRD, WENN DIE GLOCKE LAEUTET

   Am 18.09.2026 um 16:02 New York - zwei Minuten nach Schluss - entschied
   der Intraday-Lauf "universe", weil erst 519 von 6.876 Dateien der
   Sitzung vorlagen (7,5 %). Der Lauf brauchte siebzig Minuten, und die
   Concurrency-Gruppe stellte jeden Fuenf-Minuten-Lauf dahinter in die
   Warteschlange. Die 519 Titel, die auf Discover ueberhaupt sichtbar
   sind, bekamen ihren Schlussstand damit als LETZTE - bis etwa 17:15.

   Eine Prioritaetsumkehr: Wartung am Gesamtuniversum ging vor der Frische
   dessen, was ein Mensch anschauen kann.

   Owner-Entscheidung vom 19.09.2026: "User-facing freshness hat Vorrang
   vor Universe Maintenance. Ein ~70-Minuten-Full-Universe-Lauf darf den
   finalen Schlussstand der sichtbaren Consumer-Aktien niemals blockieren."

   Die Regel steht hier als eine Funktion, damit sie pruefbar ist und
   nicht als Kommentar in einem Skript verdunstet.
   ========================================================================= */
(function (global) {
  "use strict";

  /**
   * @param {object} lage
   *   marketState           "OPEN" | sonst
   *   discoverSealed        true, wenn JEDER sichtbare Titel den
   *                         Sitzungsabschluss hat
   *   universeCoverage      Anteil des Universums mit einer Datei (0..1)
   *   universeThreshold     ab wann das Universum als gedeckt gilt
   * @returns {{scope: "discover"|"universe", reason: string}}
   */
  function waehleUmfang(lage) {
    var l = lage || {};
    if (l.marketState === "OPEN") {
      return { scope: "discover", reason: "marketOpen" };
    }
    /* Der Kern der Owner-Regel: solange der sichtbare Umfang seinen
       Schluss nicht hat, geht nichts anderes vor. */
    if (!l.discoverSealed) {
      return { scope: "discover", reason: "sealConsumerScopeFirst" };
    }
    var deckung = typeof l.universeCoverage === "number" ? l.universeCoverage : 0;
    var schwelle = typeof l.universeThreshold === "number" ? l.universeThreshold : 0.5;
    return deckung < schwelle
      ? { scope: "universe", reason: "universeBehindAfterSeal" }
      : { scope: "discover", reason: "universeCovered" };
  }

  var API = { waehleUmfang: waehleUmfang };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (global) { global.VURealtime = global.VURealtime || {}; global.VURealtime.IntradayScope = API; }
})(typeof globalThis !== "undefined" ? globalThis : this);
