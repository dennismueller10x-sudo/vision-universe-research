/* =========================================================================
   DER WAECHTER DER INTRADAY-AUSLIEFERUNG

   Am 21.09.2026 stand die Seite eine Stunde lang still, und niemand hat
   es bemerkt - bis der Eigentuemer selbst hinsah. Jede einzelne Stufe
   meldete dabei Erfolg: der letzte Lauf war gruen, das letzte Deployment
   war gruen, der letzte Snapshot war gueltig. Was fehlte, war die Frage,
   die keine Stufe fuer sich beantworten kann:

     SIEHT EIN MENSCH GERADE DEN STAND, DEN ER SEHEN SOLLTE?

   Dieser Waechter stellt genau diese Frage. Er prueft nicht, ob ein
   Schritt funktioniert hat, sondern ob die KETTE vom Anbieter bis zum
   Browser aktuell ist. Ein nicht angelegter Lauf ist fuer ihn dasselbe
   wie ein fehlgeschlagener: in beiden Faellen fehlt der Stand.

   DREI ZUSTAENDE, UND WAS SIE BEDEUTEN

     PASS     Die Kette ist aktuell.
     WARNING  Etwas laeuft schlechter als vorgesehen, aber der Mensch
              sieht noch einen richtigen Stand.
     FAIL     Der Mensch sieht etwas Falsches oder Veraltetes.

   Der Auftrag nennt den Fall, der FAIL sein MUSS: Markt offen, letzter
   Snapshot Freitag, heute ist Montag. Genau dieser Fall lag vor, und
   genau dieser Fall war vorher nirgends ein Fehler.

   WAS DER WAECHTER NICHT TUT

   Er repariert nichts und loest nichts aus. Er urteilt. Was mit dem
   Urteil geschieht, entscheidet der Aufrufer - sonst waere ein
   fehlerhafter Waechter zugleich ein Trigger-Sturm.
   ========================================================================= */
(function (global) {
  "use strict";

  var SCHWEREGRADE = { PASS: 0, WARNING: 1, FAIL: 2 };

  function zahl(w, e) { return typeof w === "number" && isFinite(w) ? w : e; }
  function min(ms) { return Math.round(ms / 60000); }

  /**
   * @param {object} lage
   *   nowMs             jetzt
   *   marketState       "OPEN" | "PRE" | "AFTER" | "CLOSED" | ...
   *   expectedSession   Sitzungsdatum, das jetzt gelten sollte (YYYY-MM-DD)
   *   snapshot          { sessionDate, asOfMs }  - der Stand im Repository
   *   delivered         { sessionDate, asOfMs }  - der Stand, den der
   *                     Browser bekommt (veroeffentlichte Seite). null,
   *                     wenn nicht gemessen.
   *   lastCycle         { triggerAt, fetchEndAt, ok, written } - letzter Taktzyklus
   *                     Gemessen wird ab fetchEndAt, solange es eines gibt.
   *   intervalMs        Zieltakt
   *   graceMs           Zuschlag fuer Lauf- und Auslieferungszeit
   * @returns {{verdict, findings: Array<{severity, code, text}>, facts}}
   */
  function beurteile(lage) {
    var l = lage || {};
    var jetzt = zahl(l.nowMs, Date.now());
    var interval = zahl(l.intervalMs, 300000);
    /* Der Zuschlag ist keine Kulanz, sondern gemessene Wirklichkeit: ein
       Zyklus braucht rund fuenf Minuten, die Auslieferung noch einmal
       ein bis zwei. Ein Waechter ohne diesen Zuschlag meldete bei jedem
       normalen Zyklus Alarm - und ein Alarm, der immer schreit, wird
       abgeschaltet. */
    var grace = zahl(l.graceMs, 4 * 60000);
    var offen = l.marketState === "OPEN";
    var befunde = [];
    var sage = function (severity, code, text) { befunde.push({ severity: severity, code: code, text: text }); };

    var snap = l.snapshot || null;
    var geliefert = l.delivered || null;
    var zyklus = l.lastCycle || null;

    var snapAlter = snap && typeof snap.asOfMs === "number" ? jetzt - snap.asOfMs : null;

    /* GEMESSEN WIRD AB DEM ENDE EINES ZYKLUS, NICHT AB SEINEM BEGINN.
       Korrektur nach dem Produktionsbefund vom 21.09.2026, 18:06:55.

       Ein Zyklus BEGINNT alle 5:04 und DAUERT 5:02. Das Alter seines
       Beginns pendelt deshalb zwischen 0 und ~10:06 - und die Schwelle
       fuer "verspaetet" liegt bei Intervall plus Nachsicht, also 9 min.
       Der Waechter meldete WARNING, waehrend der Takt voellig stabil
       lief (Z9 17:51:59, Z10 17:57:03, Z11 18:02:10, Z12 18:07:14).

       Verglichen wurden zwei verschiedene Dinge: die Zeit SEIT
       Zyklusbeginn gegen den Abstand ZWISCHEN zwei Beginnen. Wer frueh
       genug im Zyklus misst, bekommt PASS; wer spaet misst, WARNING -
       bei identischer Produktion. Ein Waechter, der etwa jedes fuenfte
       Mal grundlos anschlaegt, wird nicht mehr gelesen, und dann
       uebersieht man den Fall, fuer den er gebaut wurde.

       Das Ende eines Zyklus ist ausserdem der ehrlichere Bezugspunkt:
       dann sind die Daten da. Laeuft ein Zyklus noch (kein Ende
       verzeichnet), gilt sein Beginn - waehrend eines laufenden Abrufs
       soll die Uhr ja weiterlaufen. */
    var zyklusEnde = zyklus && zyklus.fetchEndAt ? Date.parse(zyklus.fetchEndAt) : NaN;
    var zyklusStart = zyklus && zyklus.triggerAt ? Date.parse(zyklus.triggerAt) : NaN;
    var bezug = isFinite(zyklusEnde) ? zyklusEnde : (isFinite(zyklusStart) ? zyklusStart : null);
    var zyklusAlter = bezug === null ? null : jetzt - bezug;

    /* --- 1. Die falsche Sitzung ---------------------------------------
       Der Fall aus dem Auftrag. Bei offener Boerse ist ein Snapshot einer
       FRUEHEREN Sitzung kein alter Stand, sondern ein falscher: die Seite
       behauptet einen Tag, der vorbei ist. */
    if (offen && l.expectedSession) {
      if (!snap || !snap.sessionDate) {
        sage("FAIL", "snapshotFehlt", "Markt offen, aber kein Intraday-Snapshot vorhanden.");
      } else if (snap.sessionDate !== l.expectedSession) {
        sage("FAIL", "falscheSitzung",
             "Markt offen (" + l.expectedSession + "), ausgeliefert wird die Sitzung " +
             snap.sessionDate + ".");
      }
    }

    /* --- 2. Der Takt ist ausgefallen -----------------------------------
       Ein nicht angelegter Lauf hinterlaesst keine Spur. Sichtbar wird er
       nur daran, dass seit zu langer Zeit kein Zyklus stattgefunden hat. */
    if (offen) {
      if (zyklusAlter === null) {
        sage("FAIL", "keinZyklus", "Markt offen, aber kein Taktzyklus verzeichnet.");
      } else if (zyklusAlter > 2 * interval + grace) {
        sage("FAIL", "taktAusgefallen",
             "Letzter Taktzyklus vor " + min(zyklusAlter) + " min - erwartet alle " +
             min(interval) + " min.");
      } else if (zyklusAlter > interval + grace) {
        sage("WARNING", "taktVerspaetet",
             "Letzter Taktzyklus vor " + min(zyklusAlter) + " min.");
      }
      if (zyklus && zyklus.ok === false) {
        sage("WARNING", "zyklusFehlgeschlagen", "Der letzte Taktzyklus ist fehlgeschlagen.");
      }
    }

    /* --- 3. Der Stand ist zu alt ---------------------------------------
       Getrennt von 2: ein Takt kann laufen und trotzdem nichts liefern -
       genau das war am Sitzungsbeginn der Fall (527 Titel, 0 Bars). Das
       ist dann kein Taktfehler, sondern ein Datenbefund. */
    if (offen && snapAlter !== null && snap.sessionDate === l.expectedSession) {
      if (snapAlter > 3 * interval + grace) {
        sage("FAIL", "standZuAlt",
             "Der ausgelieferte Stand ist " + min(snapAlter) + " min alt.");
      } else if (snapAlter > 2 * interval + grace) {
        sage("WARNING", "standAeltlich",
             "Der ausgelieferte Stand ist " + min(snapAlter) + " min alt.");
      }
    }

    /* --- 4. Die Auslieferung haengt hinterher ---------------------------
       Der Snapshot kann im Repository stehen und den Browser trotzdem
       nicht erreichen. Ohne diese Pruefung meldete der Waechter PASS,
       waehrend ein Mensch Freitag sieht. */
    if (geliefert && snap) {
      if (geliefert.sessionDate && snap.sessionDate &&
          geliefert.sessionDate !== snap.sessionDate) {
        sage("FAIL", "auslieferungHinterher",
             "Im Repository liegt " + snap.sessionDate + ", ausgeliefert wird " +
             geliefert.sessionDate + ".");
      } else if (typeof geliefert.asOfMs === "number" && typeof snap.asOfMs === "number") {
        var rueckstand = snap.asOfMs - geliefert.asOfMs;
        if (rueckstand > 2 * interval + grace) {
          sage("FAIL", "auslieferungZuWeitHinterher",
               "Die Auslieferung ist " + min(rueckstand) + " min hinter dem Repository.");
        } else if (rueckstand > interval + grace) {
          sage("WARNING", "auslieferungVerspaetet",
               "Die Auslieferung ist " + min(rueckstand) + " min hinter dem Repository.");
        }
      }
    } else if (offen && !geliefert) {
      /* Nicht gemessen ist nicht dasselbe wie in Ordnung. */
      sage("WARNING", "auslieferungUngeprueft",
           "Der ausgelieferte Stand wurde nicht gemessen.");
    }

    var hoechste = befunde.reduce(function (a, b) {
      return SCHWEREGRADE[b.severity] > SCHWEREGRADE[a] ? b.severity : a;
    }, "PASS");

    return {
      verdict: hoechste,
      findings: befunde,
      facts: {
        marketState: l.marketState || null,
        expectedSession: l.expectedSession || null,
        snapshotSession: snap ? snap.sessionDate || null : null,
        snapshotAgeMinutes: snapAlter === null ? null : min(snapAlter),
        deliveredSession: geliefert ? geliefert.sessionDate || null : null,
        lastCycleAgeMinutes: zyklusAlter === null ? null : min(zyklusAlter),
        intervalMinutes: min(interval),
        graceMinutes: min(grace)
      }
    };
  }

  var API = { beurteile: beurteile, SCHWEREGRADE: SCHWEREGRADE };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (global) { global.VURealtime = global.VURealtime || {}; global.VURealtime.DeliveryWatchdog = API; }
})(typeof globalThis !== "undefined" ? globalThis : this);
