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

  /* DAS DISCOVER-SIEGEL NACH SCHLUSS (Plattform-Audit 03.10.2026).
     Versiegelt ist der sichtbare Umfang, wenn jeder Titel seinen
     vollstaendigen Tagesverlauf der Sitzung hat. Zwei Fehler hielten das
     Siegel dauerhaft offen - und damit den Nachzug des Universums nach
     einem ausgefallenen Lauf (sealConsumerScopeFirst) dauerhaft aus:
       1. Gesucht wurde "ref_" + Ticker roh; geschrieben wird kanonisch
          (core/identity.js). MOG-A lag als ref_MOG_A.json und galt als
          fehlend.
       2. Titel, fuer die der Anbieter nie einen Tagesverlauf geliefert hat
          (in keinem aufbewahrten Sitzungsordner), zaehlten mit - sie koennen
          nie fertig werden. Sie werden jetzt getrennt ausgewiesen
          (nieGeliefert), nicht verschwiegen.
     lies(securityId) -> Snapshot der Sitzung oder null
     jemals(securityId) -> true, wenn irgendein aufbewahrter Ordner ihn hat */
  function discoverSiegel(tickers, idFor, lies, jemals) {
    var fertig = 0, gesamt = 0, nie = [];
    (tickers || []).forEach(function (t) {
      var id = idFor(t), s = lies(id);
      if (!s && !jemals(id)) { nie.push(t); return; }
      gesamt++;
      if (s && s.regularComplete) fertig++;
    });
    return { versiegelt: gesamt > 0 && fertig === gesamt, fertig: fertig, gesamt: gesamt, nieGeliefert: nie };
  }

  var API = { waehleUmfang: waehleUmfang, discoverSiegel: discoverSiegel };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (global) { global.VURealtime = global.VURealtime || {}; global.VURealtime.IntradayScope = API; }
})(typeof globalThis !== "undefined" ? globalThis : this);
