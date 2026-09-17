/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/measurement-window.js

   WANN EINE MESSUNG WAS BEDEUTET

   -------------------------------------------------------------------------
   DAS PROBLEM
   -------------------------------------------------------------------------

   Social-Performance entsteht ueber Zeit. Eine Reichweite nach zehn
   Minuten ist keine kleine Reichweite — sie ist noch keine Reichweite.
   Wer sie trotzdem als Ergebnis nimmt, lernt zuverlaessig das Falsche:
   jeder frisch gemessene Beitrag sieht schlechter aus als jeder aeltere,
   und das System schliesst daraus auf Formate, Uhrzeiten und Hooks.

   Der Fehler ist dabei nicht, dass die Zahl falsch waere. Sie ist
   richtig — sie beantwortet nur eine andere Frage als die, die gestellt
   wurde.

   -------------------------------------------------------------------------
   DIE ANTWORT: NICHT EIN ZUSTAND, SONDERN EIN FENSTER
   -------------------------------------------------------------------------

     EARLY        Betriebskontrolle. Ist der Beitrag da, kommen Zahlen an?
     PRELIMINARY  Erste Form. Die Reichweite waechst noch deutlich.
     SETTLING     Die Kurve flacht ab. Untereinander vergleichbar.
     MATURE       Final. NUR diese Messungen gehen ins Lernen.

   Die Grenzen sind eine Annahme ueber Instagram und keine Naturkonstante.
   Sie stehen in social/config/measurement-windows.json, und sobald genug
   eigene Messreihen vorliegen, lassen sie sich an ihnen PRUEFEN statt zu
   glauben — dafuer wird jede Messung mit ihrem Alter aufbewahrt und
   nicht von der naechsten ueberschrieben.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var DEFAULT_CONFIG = {
    windows: [
      { id: "EARLY",       fromHours: 0 },
      { id: "PRELIMINARY", fromHours: 24 },
      { id: "SETTLING",    fromHours: 72 },
      { id: "MATURE",      fromHours: 168 }
    ],
    matureFromHours: 168
  };

  function normalise(config) {
    var c = config || DEFAULT_CONFIG;
    var windows = (c.windows && c.windows.length ? c.windows : DEFAULT_CONFIG.windows)
      .slice().sort(function (a, b) { return a.fromHours - b.fromHours; });
    return {
      windows: windows,
      matureFromHours: (typeof c.matureFromHours === "number")
        ? c.matureFromHours : DEFAULT_CONFIG.matureFromHours
    };
  }

  /**
   * Das Fenster zu einem Alter.
   *
   * Ein unbekanntes Alter ergibt `null` und nicht das erste Fenster. Der
   * Unterschied ist der ganze Punkt: "wir wissen nicht, wie alt" ist
   * nicht dasselbe wie "ganz frisch", und die zweite Lesart wuerde eine
   * Messung ohne Zeitstempel dauerhaft vom Lernen ausschliessen, ohne
   * dass jemand den Grund sieht.
   */
  function windowFor(ageHours, config) {
    if (ageHours === null || ageHours === undefined || !isFinite(ageHours)) return null;
    var c = normalise(config);
    var treffer = null;
    for (var i = 0; i < c.windows.length; i += 1) {
      if (ageHours >= c.windows[i].fromHours) treffer = c.windows[i].id;
    }
    return treffer;
  }

  /**
   * Ist diese Messung reif?
   *
   * Ein unbekanntes Alter ist NICHT reif. Das ist die vorsichtige Lesart,
   * und sie ist hier die richtige: eine Messung ins Lernen zu lassen,
   * von der niemand weiss, ob sie zehn Minuten oder zehn Tage alt ist,
   * hiesse, den ganzen Unterschied wieder aufzugeben.
   */
  function isMature(ageHours, config) {
    if (ageHours === null || ageHours === undefined || !isFinite(ageHours)) return false;
    return ageHours >= normalise(config).matureFromHours;
  }

  /** Wann waere diese Messung reif? Fuer die Planung der naechsten Abfrage. */
  function matureAt(publishedAtIso, config) {
    var t = Date.parse(publishedAtIso);
    if (!isFinite(t)) return null;
    return new Date(t + normalise(config).matureFromHours * 3600000).toISOString();
  }

  /**
   * Faellige Nachmessungen.
   *
   * Ein Beitrag ist nachzumessen, wenn seit der letzten Messung ein
   * Fenster gewechselt hat — nicht nach einem festen Takt. Ein fester
   * Takt misst reife Beitraege ewig weiter und frische zu selten.
   */
  function dueForRemeasurement(zeilen, nowIso, config) {
    var jetzt = Date.parse(nowIso);
    var c = normalise(config);
    var faellig = [];

    (zeilen || []).forEach(function (z) {
      if (!z || !z.publishedAt) return;
      var alter = (jetzt - Date.parse(z.publishedAt)) / 3600000;
      if (!isFinite(alter)) return;

      var jetztFenster = windowFor(alter, c);
      var zuletzt = (z.snapshot && z.snapshot.window) || null;

      /* Schon reif und schon als reif gemessen: fertig. Weiter zu messen
         kostet Aufrufe und aendert nichts. */
      if (zuletzt === "MATURE" && jetztFenster === "MATURE") return;

      if (zuletzt !== jetztFenster) {
        faellig.push({ mediaId: z.mediaId, from: zuletzt, to: jetztFenster,
          ageHours: Math.round(alter * 10) / 10 });
      }
    });

    return faellig;
  }

  var api = {
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    windowFor: windowFor,
    isMature: isMature,
    matureAt: matureAt,
    dueForRemeasurement: dueForRemeasurement
  };

  if (isNode) module.exports = api;
  else global.VUSocialMeasurementWindow = api;
})(typeof window !== "undefined" ? window : globalThis);
