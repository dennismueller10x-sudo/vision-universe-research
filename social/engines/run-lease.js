/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/run-lease.js

   ZWEI AUSLOESER, EIN PRODUKTIVER ZYKLUS (§5/§27–§31)

   -------------------------------------------------------------------------
   DER FALL, UM DEN ES GEHT
   -------------------------------------------------------------------------

   Der Scheduler startet um 06:35. Der Owner tippt um 06:35 auf JETZT
   PRUEFEN. Zwei Laeufe derselben Maschine, und beide wollen arbeiten.

   Ein Teil der Antwort steht schon woanders und wird hier NICHT noch
   einmal gebaut:

     - Die Concurrency-Gruppe der Workflow-Datei laesst die beiden
       nicht gleichzeitig laufen. Der zweite wartet.
     - Die Content Cadence laesst keinen zweiten Kandidaten zu, solange
       einer wartet, ein Creative Job laeuft oder der Mindestabstand
       nicht erreicht ist.

   Was fehlt, ist der Fall dazwischen: der zweite Lauf startet, sobald
   der erste fertig ist, findet einen Zustand, in dem die Kadenz nichts
   verbietet - weil der erste gar keinen Kandidaten gebaut hat - und
   faehrt einen zweiten vollen Zyklus. Kein Fehler, nur doppelte
   Arbeit; und wo Work-Aufrufe Geld kosten, ist doppelte Arbeit ein
   Schaden.

   -------------------------------------------------------------------------
   WAS EINE LEASE IST UND WAS NICHT
   -------------------------------------------------------------------------

   Sie ist ein Vermerk: "dieser Lauf arbeitet gerade" bzw. "dieser Lauf
   hat gerade gearbeitet". Mehr nicht.

   SIE IST KEINE SPERRE GEGEN LESEN. Ein Lauf, der die Lease nicht
   bekommt, darf weiter messen, berichten und den Zustand anzeigen -
   alles, was nichts verbraucht und nichts erzeugt. Verwehrt ist ihm
   nur der PRODUKTIVE Teil.

   SIE SETZT KEINE ZAEHLER ZURUECK (§38). Die Tagesabsicht, der
   Mindestabstand und der Portfolio-Zustand gehoeren der Kadenz; diese
   Datei liest sie nicht und schreibt sie nicht.

   SIE VERFAELLT. Ein Lauf, der mitten im Zyklus abstirbt, darf die
   Maschine nicht dauerhaft blockieren - deshalb traegt jede Lease ihr
   Ablaufdatum bei sich und nicht in einem Aufraeumskript, das
   vielleicht nie laeuft.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* -------------------------------------------------------------------
     DIE ZWEI ZEITEN, UND WORAUS SIE FOLGEN

     ABLAUF: wie lange eine genommene Lease gilt, wenn niemand sie
     zurueckgibt. Sie muss laenger sein als ein normaler Lauf, sonst
     nimmt ein zweiter sie mitten im ersten - und kuerzer als die
     Pause zwischen zwei Scheduler-Laeufen, sonst blockiert ein
     abgestuerzter Lauf den naechsten regulaeren. Der Scheduler laeuft
     zweimal taeglich; ein Zyklus dauert Minuten.

     ABKLINGEN: wie lange nach einem BEENDETEN produktiven Zyklus kein
     zweiter beginnt. Sie muss nur die Wartezeit der Concurrency-Gruppe
     ueberdecken - der zweite Lauf startet Sekunden nach dem Ende des
     ersten. Zehn Minuten sind dafuer reichlich und liegen weit unter
     dem Abstand zweier Scheduler-Laeufe, stehen also keinem regulaeren
     Lauf im Weg.
     ------------------------------------------------------------------- */
  var ABLAUF_MINUTEN = 30;
  var ABKLINGEN_MINUTEN = 10;

  var GRUND = {
    FREI:              "FREI",
    LAUF_AKTIV:        "LAUF_AKTIV",
    ABKLINGZEIT:       "ABKLINGZEIT",
    EIGENE_LEASE:      "EIGENE_LEASE"
  };

  function ms(iso) {
    var t = Date.parse(String(iso || ""));
    return Number.isFinite(t) ? t : null;
  }

  function minuten(vonIso, bisIso) {
    var a = ms(vonIso), b = ms(bisIso);
    if (a === null || b === null) return null;
    return (b - a) / 60000;
  }

  function optZahl(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  /**
   * Darf dieser Lauf produktiv arbeiten?
   *
   * @param vorhanden  die gespeicherte Lease oder null
   * @param options    { now, runId, ablaufMinuten, abklingenMinuten }
   */
  function pruefe(vorhanden, options) {
    var o = options || {};
    var now = o.now || new Date().toISOString();
    var runId = o.runId || null;
    var ablauf = optZahl(o.ablaufMinuten, ABLAUF_MINUTEN);
    var abklingen = optZahl(o.abklingenMinuten, ABKLINGEN_MINUTEN);
    var l = vorhanden || null;

    if (!l || !l.takenAt) {
      return { darfArbeiten: true, grund: GRUND.FREI,
        erklaerung: "Kein anderer Lauf arbeitet.", wartetBis: null };
    }

    /* Der eigene Lauf. Ein zweiter Aufruf im selben Lauf ist kein
       zweiter Lauf - sonst koennte ein Skript sich selbst aussperren. */
    if (runId && l.runId && String(l.runId) === String(runId)) {
      return { darfArbeiten: true, grund: GRUND.EIGENE_LEASE,
        erklaerung: "Die Lease gehoert diesem Lauf.", wartetBis: null };
    }

    /* Noch nicht zurueckgegeben und noch nicht abgelaufen. */
    if (!l.endedAt) {
      var alter = minuten(l.takenAt, now);
      if (alter !== null && alter < ablauf) {
        return { darfArbeiten: false, grund: GRUND.LAUF_AKTIV,
          erklaerung: "Ein anderer Lauf arbeitet seit " +
            Math.round(alter) + " Minuten (" + (l.runId || "ohne Kennung") + ").",
          wartetBis: neuerZeitpunkt(l.takenAt, ablauf) };
      }
      /* Abgelaufen: der Lauf ist gestorben, ohne zurueckzugeben. Das
         wird gesagt und nicht verschwiegen - eine verfallene Lease ist
         ein Hinweis auf einen abgebrochenen Lauf. */
      return { darfArbeiten: true, grund: GRUND.FREI,
        erklaerung: "Die Lease von " + (l.runId || "einem frueheren Lauf") +
          " ist abgelaufen; der Lauf hat sie nie zurueckgegeben.",
        wartetBis: null, verfallen: true };
    }

    /* Zurueckgegeben - aber war er produktiv? Nur dann klingt er ab.
       Ein reiner Lesedurchgang haelt niemanden auf. */
    if (l.produktiv !== true) {
      return { darfArbeiten: true, grund: GRUND.FREI,
        erklaerung: "Der letzte Lauf hat nichts erzeugt.", wartetBis: null };
    }

    var seitEnde = minuten(l.endedAt, now);
    if (seitEnde !== null && seitEnde < abklingen) {
      return { darfArbeiten: false, grund: GRUND.ABKLINGZEIT,
        erklaerung: "Ein produktiver Zyklus endete vor " +
          Math.round(seitEnde * 10) / 10 + " Minuten. Ein zweiter beginnt " +
          "fruehestens " + abklingen + " Minuten danach.",
        wartetBis: neuerZeitpunkt(l.endedAt, abklingen) };
    }

    return { darfArbeiten: true, grund: GRUND.FREI,
      erklaerung: "Der letzte produktive Zyklus liegt lange genug zurueck.",
      wartetBis: null };
  }

  function neuerZeitpunkt(iso, plusMinuten) {
    var t = ms(iso);
    if (t === null) return null;
    return new Date(t + plusMinuten * 60000).toISOString();
  }

  /** Die Lease, die ein Lauf nimmt. */
  function nimm(options) {
    var o = options || {};
    return {
      runId: o.runId || null,
      takenAt: o.now || new Date().toISOString(),
      takenBy: o.takenBy || null,
      endedAt: null,
      produktiv: false,
      ablaufMinuten: optZahl(o.ablaufMinuten, ABLAUF_MINUTEN)
    };
  }

  /**
   * Die Rueckgabe.
   *
   * `produktiv` sagt, ob dieser Lauf etwas ERZEUGT hat - nicht, ob er
   * gelaufen ist. Nur ein produktiver Zyklus klingt ab; ein Lauf, der
   * nur gemessen und berichtet hat, haelt den naechsten nicht auf.
   */
  function gib(vorhanden, options) {
    var o = options || {};
    var l = vorhanden || {};
    return {
      runId: l.runId || null,
      takenAt: l.takenAt || null,
      takenBy: l.takenBy || null,
      endedAt: o.now || new Date().toISOString(),
      produktiv: o.produktiv === true,
      ablaufMinuten: l.ablaufMinuten === undefined
        ? ABLAUF_MINUTEN : l.ablaufMinuten
    };
  }

  var api = {
    ABLAUF_MINUTEN: ABLAUF_MINUTEN,
    ABKLINGEN_MINUTEN: ABKLINGEN_MINUTEN,
    GRUND: GRUND,
    pruefe: pruefe,
    nimm: nimm,
    gib: gib
  };

  if (isNode) module.exports = api;
  else global.VUSocialRunLease = api;
})(typeof window !== "undefined" ? window : globalThis);
