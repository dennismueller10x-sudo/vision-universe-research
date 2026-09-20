/* =========================================================================
   VISION UNIVERSE — daily-lifecycle-health.js

   WANN IST EIN TAGESLAUF GRUEN?

   Nicht dann, wenn kein Schritt rot war. Am 17./18.09.2026 war kein
   Schritt rot: der Lauf holte 45 von 6.876 Titeln, stellte 6.831 wegen
   alter Ablehnungen zurueck und meldete Erfolg - waehrend die Tageskurse
   zwei Sitzungen zurueckstanden.

   Ein Tageslauf ist gruen, wenn er den ueberwiegenden Teil des
   updatefaehigen Universums wirklich angesehen hat UND die Kurse auf der
   letzten abgeschlossenen Sitzung stehen. Alles andere ist WARNING oder
   FAIL - und zwar sichtbar.

   Die Schwellen sind grob gewaehlt. Gemessen wird ein Ausfall, kein
   Rundungsfehler.
   ========================================================================= */
(function (global) {
  "use strict";

  var MODULE_VERSION = "daily-lifecycle-health-1.0.0";

  var SCHWELLEN = {
    geprueftMin: 0.60,    /* darunter: FAIL */
    geprueftWarn: 0.90,   /* darunter: WARNING */
    rueckstandWarn: 1,    /* Sitzungen */
    rueckstandFail: 2,
    registerAnteilFail: 0.5
  };

  var RANG = { PASS: 0, WARNING: 1, FAIL: 2 };

  /**
   * @param {object} lage {
   *   universe, checked, deferred, requests,
   *   openRejections, sessionsBehind, asOf, expectedSession, hasStatus
   * }
   * @param {object} opts { thresholds }
   */
  function beurteile(lage, opts) {
    var t = Object.assign({}, SCHWELLEN, (opts && opts.thresholds) || {});
    var gruende = [];
    var urteil = "PASS";
    function setze(neu, grund) {
      gruende.push(grund);
      if (RANG[neu] > RANG[urteil]) urteil = neu;
    }

    var universum = lage.universe || 0;
    var geprueft = lage.checked || 0;
    var anteil = universum ? geprueft / universum : 0;

    if (lage.hasStatus === false) setze("FAIL", "kein Statusbericht des Ingests gefunden");
    if (universum === 0) setze("FAIL", "der Lauf nennt kein Universum");

    if (universum > 0 && anteil < t.geprueftMin) {
      setze("FAIL", "nur " + geprueft + " von " + universum + " Titeln geprueft (" +
            Math.round(anteil * 100) + " %), " + (lage.deferred || 0) + " zurueckgestellt");
    } else if (universum > 0 && anteil < t.geprueftWarn) {
      setze("WARNING", geprueft + " von " + universum + " Titeln geprueft (" +
            Math.round(anteil * 100) + " %)");
    }

    if (lage.sessionsBehind === null || lage.sessionsBehind === undefined) {
      setze("WARNING", "kein Datenstand der Tageskurse lesbar");
    } else if (lage.sessionsBehind >= t.rueckstandFail) {
      setze("FAIL", "Tageskurse " + lage.sessionsBehind + " Sitzungen zurueck (Stand " +
            lage.asOf + (lage.expectedSession ? ", erwartet " + lage.expectedSession : "") + ")");
    } else if (lage.sessionsBehind >= t.rueckstandWarn) {
      setze("WARNING", "Tageskurse eine Sitzung zurueck (Stand " + lage.asOf + ")");
    }

    if (universum && lage.openRejections !== null && lage.openRejections !== undefined &&
        lage.openRejections / universum > t.registerAnteilFail) {
      setze("FAIL", lage.openRejections + " offene Ablehnungen bei " + universum +
            " Titeln - der Tageslauf kann so nicht vollstaendig sein");
    }

    return { verdict: urteil, reasons: gruende, checkedShare: Math.round(anteil * 1000) / 1000,
             thresholds: t };
  }

  var api = { MODULE_VERSION: MODULE_VERSION, SCHWELLEN: SCHWELLEN, beurteile: beurteile };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUDailyLifecycleHealth = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
