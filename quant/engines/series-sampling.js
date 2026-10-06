/* =========================================================================
   VISION UNIVERSE — series-sampling.js

   ZEITRAEUME AUS ECHTEN SCHLUSSKURSEN - OHNE ERFUNDENE PUNKTE

   Ein Chart ueber fuenf Jahre oder die ganze Historie braucht keine
   1 250 Tagespunkte auf 320 Pixeln. Er braucht eine Auswahl echter
   Schlusskurse, die mathematisch sauber ist: hier der letzte Handelstag
   jeder Kalenderwoche (ISO-Woche). Kein Mittelwert, keine Interpolation,
   kein "geglaetteter" Kurs - jeder Punkt ist ein Tagesschluss, der so
   gehandelt wurde, und traegt sein Datum.

   Drei Bausteine, in Node (Publisher) und im Browser (Aktienseite)
   dieselben:

     weeklyPoints(points)          [date, close][] -> letzter Schluss je ISO-Woche
     mergeWeeklyWithDaily(w, d)    Wochenreihe (lang) + Tagesreihe (juengstes
                                   Jahr): vorne Wochen, hinten die Wochen aus
                                   der Tagesreihe, als letzter Punkt immer
                                   der juengste Tagesschluss
     sliceRange(points, range, to) 1W/1M/6M/1J/5J/MAX aus einer Reihe -
                                   nach Kalender, nicht nach Punktzahl
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var ENGINE_VERSION = "series-sampling-1.0.0";
  var DAY_MS = 86400000;

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function dayMs(iso) {
    return Date.UTC(parseInt(iso.slice(0, 4), 10), parseInt(iso.slice(5, 7), 10) - 1, parseInt(iso.slice(8, 10), 10));
  }
  function isoOf(ms) { return new Date(ms).toISOString().slice(0, 10); }

  /** ISO-Woche als Schluessel "2026-W37" - Donnerstag der Woche bestimmt das Jahr. */
  function isoWeekKey(iso) {
    var d = new Date(dayMs(iso));
    var day = d.getUTCDay() || 7;                 /* Mo=1 .. So=7 */
    d.setUTCDate(d.getUTCDate() + 4 - day);        /* Donnerstag dieser Woche */
    var jahr = d.getUTCFullYear();
    var start = Date.UTC(jahr, 0, 1);
    var woche = Math.ceil(((d.getTime() - start) / DAY_MS + 1) / 7);
    return jahr + "-W" + (woche < 10 ? "0" + woche : woche);
  }

  /**
   * Letzter Schlusskurs je ISO-Woche. Eingabe aufsteigend nach Datum;
   * ungueltige Punkte werden uebersprungen, nichts wird erfunden.
   */
  function weeklyPoints(points) {
    var out = [], key = null;
    for (var i = 0; i < (points || []).length; i++) {
      var p = points[i];
      if (!p || typeof p[0] !== "string" || !isNum(p[1])) continue;
      var k = isoWeekKey(p[0]);
      if (k === key) out[out.length - 1] = [p[0], p[1]];
      else { out.push([p[0], p[1]]); key = k; }
    }
    return out;
  }

  /**
   * Lange Wochenreihe + juengste Tagesreihe -> eine Wochenreihe bis heute.
   * Die Tagesreihe hat Vorrang, wo beide vorliegen (sie ist frischer und
   * nach demselben Verfahren split-bereinigt). Der letzte Punkt ist immer
   * der juengste Tagesschluss - auch mitten in der Woche.
   */
  function mergeWeeklyWithDaily(weekly, daily) {
    var d = (daily || []).filter(function (p) { return p && typeof p[0] === "string" && isNum(p[1]); });
    if (!d.length) return weeklyPoints(weekly || []);
    var grenze = d[0][0];
    var vorne = (weekly || []).filter(function (p) { return p && p[0] < grenze && isNum(p[1]); });
    var hinten = weeklyPoints(d);
    var letzter = d[d.length - 1];
    if (hinten.length && hinten[hinten.length - 1][0] !== letzter[0]) hinten.push([letzter[0], letzter[1]]);
    /* Nahtstelle: die letzte Woche vorne und die erste Woche hinten
       koennen dieselbe ISO-Woche sein - dann gilt der Punkt aus der
       Tagesreihe. */
    if (vorne.length && hinten.length && isoWeekKey(vorne[vorne.length - 1][0]) === isoWeekKey(hinten[0][0])) vorne.pop();
    return vorne.concat(hinten);
  }

  var RANGE_DAYS = { "1W": 7, "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "5Y": 1827, "MAX": null };

  /**
   * Der Ausschnitt eines Zeitraums - nach Kalender: "1M" sind die Punkte
   * der letzten 31 Tage vor `to`, nicht die letzten 21 Punkte. Ein Titel
   * mit Luecken bekommt so weniger Punkte, keine falschen.
   *
   * @returns {{points, from, to, complete}} complete = die Reihe reicht
   *   mindestens bis an den Anfang des Zeitraums heran
   */
  function sliceRange(points, range, to) {
    var p = (points || []).filter(function (x) { return x && typeof x[0] === "string" && isNum(x[1]); });
    if (!p.length) return { points: [], from: null, to: null, complete: false, range: range };
    var ende = to || p[p.length - 1][0];
    var tage = RANGE_DAYS[range];
    if (tage === undefined) throw new Error("series-sampling: unbekannter Zeitraum " + range);
    if (tage === null) return { points: p, from: p[0][0], to: p[p.length - 1][0], complete: true, range: range };
    var startMs = dayMs(ende) - tage * DAY_MS;
    var start = isoOf(startMs);
    var aus = p.filter(function (x) { return x[0] >= start && x[0] <= ende; });
    /* Der Punkt direkt vor dem Fenster gehoert als Startlinie dazu, wenn
       er nicht aelter als sieben Tage vor dem Fenster ist - sonst begaenne
       "1M" am zweiten Handelstag statt am Vortag. */
    var davor = null;
    for (var i = p.length - 1; i >= 0; i--) { if (p[i][0] < start) { davor = p[i]; break; } }
    if (davor && dayMs(start) - dayMs(davor[0]) <= 7 * DAY_MS) aus.unshift(davor);
    return { points: aus, from: aus.length ? aus[0][0] : null, to: aus.length ? aus[aus.length - 1][0] : null,
             complete: p[0][0] <= start || (davor !== null), range: range };
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, RANGE_DAYS: RANGE_DAYS, isoWeekKey: isoWeekKey,
              weeklyPoints: weeklyPoints, mergeWeeklyWithDaily: mergeWeeklyWithDaily, sliceRange: sliceRange };
  if (isNode) module.exports = api;
  else {
    global.VUQuant = global.VUQuant || {};
    global.VUQuant.SeriesSampling = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
