/* =========================================================================
   VISION UNIVERSE SOCIAL — Der Lebenslauf eines externen Creative-Laufs

   -------------------------------------------------------------------------
   DER VORFALL
   -------------------------------------------------------------------------

   PR 101 meldete sechsmal STARTED zu derselben Delivery und lieferte
   nie ein Ergebnis. Der Owner hat die Work-Oberflaeche geprueft: dort
   stehen mehrere leere Chats — kein Inhalt, keine Fehlermeldung, kein
   Abbruchgrund. Die Root Cause ist nicht bekannt.

   Der Orchestrator stand daraufhin still, und zwar aus einem Grund,
   der nichts mit dem Anbieter zu tun hat: es gab keinen Zustand fuer
   "der externe Anbieter hat innerhalb des Beobachtungsfensters nichts
   Beobachtbares geliefert".

   Das ist derselbe Befund wie bei HELD_FOR_ENRICHMENT, eine Ebene
   tiefer. Was nirgends steht, blockiert oder verschwindet — je nachdem,
   wer als naechstes hinsieht.

   -------------------------------------------------------------------------
   WAS STALE_NO_RESULT IST UND WAS NICHT
   -------------------------------------------------------------------------

   Es ist KEIN Content Failure, KEIN Performance Failure, KEIN Owner
   Reject und KEIN Evidence Reject.

   Es sagt genau einen Satz:

     Der externe Creative-Provider hat innerhalb des zulaessigen
     Beobachtungsfensters kein beobachtbares Ergebnis erzeugt.

   Es ist eine Aussage ueber unsere BEOBACHTUNG, nicht ueber den
   Anbieter. Ob dessen Lauf innerhalb noch laeuft, kann diese
   Schnittstelle nicht sehen — und ein Zustand, der mehr behauptet, als
   er weiss, ist schlimmer als keiner.

   -------------------------------------------------------------------------
   WOHER DIE FRIST KOMMT
   -------------------------------------------------------------------------

   Nicht aus einer ausgedachten Konstante. Aus der einzigen Messung, die
   es gibt:

     PR 98, verifizierter Lauf mit Text UND Bild
     STARTED 09:48:36Z  ->  Result-Commit 09:54:21Z  =  345 Sekunden

   Und aus der Ehrlichkeit darueber, was eine einzelne Messung wert ist:
   sie ist keine Verteilung. Der Sicherheitsfaktor im BOOTSTRAP-Regime
   ist deshalb kein Quantil, sondern ein Schutz gegen das eigene
   Nichtwissen — er faellt, sobald es echte Streuung zu messen gibt.

   Dieselbe Bauweise wie beim Evidenzregime der Leistungsdaten: der
   Zustand der Stichprobe reist mit dem Wert, damit niemand einen
   BOOTSTRAP-Wert fuer eine gemessene Groesse haelt.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* -------------------------------------------------------------------
     DIE ZUSTAENDE

     Der gluckliche Weg von links nach rechts, darunter die Abbrueche.
     ------------------------------------------------------------------- */
  var VERLAUF = [
    "REQUESTED",         /* Brief liegt, PR noch nicht offen */
    "INVOKED",           /* PR offen, Ereignis zugestellt */
    "IN_FLIGHT",         /* Agent hat STARTED gemeldet */
    "RESULT_AVAILABLE",  /* Ergebnisdatei liegt auf dem Request-Branch */
    "INGESTED",          /* geholt und abgelegt */
    "VERIFIED"           /* Kennungen und Asset bestaetigt */
  ];

  var ABBRUCH = [
    /* Kein Ergebnis im Fenster. Eine Aussage ueber unsere Beobachtung. */
    "STALE_NO_RESULT",
    /* Etwas liegt da, aber nicht vollstaendig. */
    "PARTIAL_RESULT",
    /* Der Anbieter hat einen Fehler GEMELDET. Bisher nie beobachtet. */
    "PROVIDER_FAILED",
    /* Vollstaendig, aber die Pruefung weist es zurueck. */
    "RESULT_INVALID",
    /* Etwas muss von Hand angesehen werden, bevor es weitergeht. */
    "RECOVERY_REQUIRED"
  ];

  var STATES = VERLAUF.concat(ABBRUCH);

  /* Zustaende, aus denen nichts mehr folgt. VERIFIED ist fertig;
     RESULT_INVALID ist ein Urteil ueber ein konkretes Ergebnis und gilt
     fuer dieses Ergebnis endgueltig.

     STALE_NO_RESULT ist BEWUSST NICHT terminal: es sagt nur, dass wir
     nichts gesehen haben. Taucht spaeter doch ein Ergebnis auf, darf es
     verarbeitet werden. */
  var TERMINAL = ["VERIFIED", "RESULT_INVALID"];

  /* Zustaende, in denen der Graph WEITERLAUFEN darf, ohne auf den
     Anbieter zu warten. Ein externer Agent darf den Orchestrator
     niemals unbegrenzt blockieren. */
  var NICHT_BLOCKIEREND = ["STALE_NO_RESULT", "PROVIDER_FAILED",
    "RESULT_INVALID", "RECOVERY_REQUIRED", "VERIFIED"];

  /* -------------------------------------------------------------------
     DIE EINZIGE ECHTE MESSUNG

     Sie steht hier als Datum und nicht als Zahl im Code: wer sie
     spaeter liest, soll sehen, WOHER sie kommt.
     ------------------------------------------------------------------- */
  var REFERENZMESSUNGEN = [
    { source: "PR 98", contentId: "vu-image-trigger-proof-20260917-001",
      startedAt: "2026-09-17T09:48:36Z", resultAt: "2026-09-17T09:54:21Z",
      seconds: 345, kind: "text+image",
      note: "Verifizierter Zero-API-Lauf mit Text und generativem Bild." }
  ];

  var REGIME = [
    { id: "BOOTSTRAP", minSample: 0,  factor: 10,
      note: "Eine oder zwei Messungen sind keine Verteilung. Der Faktor " +
            "ist Schutz gegen das eigene Nichtwissen, kein Quantil." },
    { id: "GROWING",   minSample: 3,  factor: 4,
      note: "Genug Messungen fuer eine Groessenordnung, zu wenige fuer " +
            "einen Rand." },
    { id: "MATURE",    minSample: 10, factor: 2,
      note: "Die Streuung ist gemessen; der Faktor deckt nur noch den " +
            "Rand ab." }
  ];

  /* Untergrenze: kuerzer als das Doppelte der Referenz waere ein
     Fenster, das den bekannten Erfolgsfall selbst abschneidet.
     Obergrenze: laenger als ein halber Tag ist kein Fenster mehr,
     sondern Warten ohne Ende. */
  var MIN_LEASE_SEKUNDEN = 690;      /* 2 x 345 */
  var MAX_LEASE_SEKUNDEN = 43200;    /* 12 Stunden */

  /* Wie viele volle Fristen darf ein Vorgang INSGESAMT dauern, auch wenn
     der Anbieter zwischendurch Lebenszeichen sendet? Siehe die
     Begruendung bei `totalSeconds`. */
  var GESAMT_FAKTOR = 3;

  function sekundenZwischen(a, b) {
    var t1 = Date.parse(a), t2 = Date.parse(b);
    if (!isFinite(t1) || !isFinite(t2)) return null;
    return (t2 - t1) / 1000;
  }

  /**
   * Die Frist, innerhalb derer ein Ergebnis zu erwarten ist.
   *
   * `observations` sind gemessene Dauern in Sekunden von STARTED bis
   * Ergebnis. Fehlen sie, gilt die Referenzmessung.
   */
  function lease(observations) {
    var messungen = (observations && observations.length)
      ? observations.slice()
      : REFERENZMESSUNGEN.map(function (m) { return m.seconds; });

    messungen = messungen.filter(function (x) {
      return typeof x === "number" && isFinite(x) && x > 0; });

    if (!messungen.length) {
      return { seconds: MAX_LEASE_SEKUNDEN, regime: "UNMEASURED", factor: null,
        sampleSize: 0, longestObserved: null,
        explanation: "Keine einzige Messung. Die Frist ist die Obergrenze — " +
          "nicht weil sie passt, sondern weil jede kuerzere geraten waere." };
    }

    var laengste = Math.max.apply(null, messungen);
    var r = REGIME.filter(function (x) { return messungen.length >= x.minSample; })
      .sort(function (a, b) { return b.minSample - a.minSample; })[0];

    var roh = laengste * r.factor;
    var frist = Math.min(MAX_LEASE_SEKUNDEN, Math.max(MIN_LEASE_SEKUNDEN, Math.round(roh)));

    return {
      seconds: frist,
      regime: r.id,
      factor: r.factor,
      sampleSize: messungen.length,
      longestObserved: laengste,
      clamped: frist !== Math.round(roh),
      /* -----------------------------------------------------------------
         DAS ZWEITE FENSTER

         Die Frist oben misst die RUHE: wie lange nach einem Lebenszeichen
         darf noch ein Ergebnis kommen. Sie allein reicht nicht.

         Der Kontrolllauf D3 hat es gezeigt: der Anbieter meldet im
         Backoff immer wieder STARTED — 5,9 dann 9,5 dann 13,1 Minuten
         Abstand. Jede dieser Meldungen setzt die Ruhe-Uhr zurueck. Ein
         Anbieter, der ewig weitermeldet, waere damit NIE stale. PR 101
         wurde es nur, weil seine Wiederholungen nach sechs Versuchen
         aufhoerten.

         Deshalb ein zweites Fenster ueber den GESAMTEN Vorgang: drei
         volle Fristen ohne Ergebnis. Die beobachtete Wiederholungsfolge
         von PR 101 lief ueber 86 Minuten; drei Fristen sind mit 172
         Minuten komfortabel darueber, und der Faktor steht hier, statt
         sich in einer Zahl zu verstecken.
         ----------------------------------------------------------------- */
      totalSeconds: Math.min(MAX_LEASE_SEKUNDEN * 3, frist * GESAMT_FAKTOR),
      totalFactor: GESAMT_FAKTOR,
      explanation: "Laengster beobachteter Lauf " + laengste + " s, Regime " + r.id +
        " (n=" + messungen.length + "), Faktor " + r.factor + " ergibt " +
        Math.round(roh) + " s" +
        (frist !== Math.round(roh) ? ", begrenzt auf " + frist + " s" : "") +
        ". " + r.note
    };
  }

  /**
   * Was ist ueber diesen Lauf beobachtbar wahr?
   *
   * Absichtlich nur aus BEOBACHTUNGEN: letzte Aktivitaet, ob eine
   * Ergebnisdatei da ist, ob sie vollstaendig ist. Es wird nichts
   * ueber den Anbieter behauptet, was diese Schnittstelle nicht sehen
   * kann.
   */
  function classify(beobachtung, options) {
    beobachtung = beobachtung || {};
    options = options || {};
    var jetzt = options.now || new Date().toISOString();
    var frist = options.lease || lease(options.observations);

    function fertig(state, grund, zusatz) {
      return Object.assign({
        state: state,
        explanation: grund,
        lease: frist,
        blocking: NICHT_BLOCKIEREND.indexOf(state) === -1,
        terminal: TERMINAL.indexOf(state) !== -1,
        observedAt: jetzt
      }, zusatz || {});
    }

    if (beobachtung.verified === true) {
      return fertig("VERIFIED", "Ergebnis und Asset bestaetigt.");
    }
    if (beobachtung.resultInvalid === true) {
      return fertig("RESULT_INVALID",
        "Ein vollstaendiges Ergebnis liegt vor und die Pruefung weist es zurueck: " +
        (beobachtung.reason || "kein Grund genannt") + ".");
    }
    if (beobachtung.ingested === true) {
      return fertig("INGESTED", "Ergebnis geholt und abgelegt, Pruefung steht aus.");
    }
    if (beobachtung.partial === true) {
      return fertig("PARTIAL_RESULT",
        "Etwas liegt da, aber nicht vollstaendig: " +
        (beobachtung.reason || "Grund nicht genannt") + ".");
    }
    if (beobachtung.resultPresent === true) {
      return fertig("RESULT_AVAILABLE", "Ergebnisdatei liegt auf dem Request-Branch.");
    }
    /* Ein GEMELDETER Fehler. Bisher nie beobachtet — der Anbieter hat
       keinen Fehlerkanal. Der Zustand existiert trotzdem, weil ein
       Zustandsraum, der den Fehlerfall nicht kennt, ihn beim ersten
       Auftreten wieder nicht darstellen kann. */
    if (beobachtung.providerError) {
      return fertig("PROVIDER_FAILED",
        "Der Anbieter hat einen Fehler gemeldet: " + beobachtung.providerError + ".");
    }

    var letzte = beobachtung.lastActivityAt || null;
    if (!letzte) {
      return fertig("REQUESTED", "Noch keine Zustellung beobachtet.");
    }

    var alter = sekundenZwischen(letzte, jetzt);
    if (alter === null) {
      return fertig("RECOVERY_REQUIRED",
        "Der Zeitpunkt der letzten Aktivitaet ist unlesbar: " + letzte + ".");
    }

    /* Eine Aktivitaet in der Zukunft ist keine frische Aktivitaet,
       sondern ein Datenfehler. Ohne diese Pruefung faellt ein negatives
       Alter durch jeden Fristvergleich und laesst einen laengst
       stehengebliebenen Lauf als IN_FLIGHT erscheinen — genau das ist
       beim ersten Lauf gegen echte Daten passiert, weil von Hand
       nachgetragene Eintraege erfundene Zeitstempel trugen. */
    if (alter < 0) {
      return fertig("RECOVERY_REQUIRED",
        "Die letzte Aktivitaet liegt " + Math.abs(Math.round(alter)) +
        " s in der ZUKUNFT (" + letzte + " gegen " + jetzt + "). Entweder " +
        "stimmt die Uhr nicht oder der Eintrag ist keine Beobachtung. " +
        "Beides ist zu klaeren, bevor daraus ein Zustand abgeleitet wird.",
        { ageSeconds: Math.round(alter) });
    }

    /* Das Gesamtfenster, unabhaengig davon, wie oft der Anbieter
       zwischendurch STARTED meldet. */
    var erste = beobachtung.firstActivityAt || letzte;
    var gesamt = sekundenZwischen(erste, jetzt);
    if (gesamt !== null && gesamt >= 0 && frist.totalSeconds &&
        gesamt > frist.totalSeconds && beobachtung.startedCount > 0) {
      return fertig("STALE_NO_RESULT",
        "Der Vorgang laeuft seit " + Math.round(gesamt) + " s und hat " +
        beobachtung.startedCount + "x STARTED gemeldet, ohne je ein Ergebnis zu " +
        "liefern. Das Gesamtfenster betraegt " + frist.totalSeconds + " s (" +
        frist.totalFactor + " volle Fristen). Weitere Lebenszeichen aendern daran " +
        "nichts: ein Anbieter, der nur meldet, dass er wieder anfaengt, faengt " +
        "nicht endlos an. " +
        "Kein Content-Fehler, kein Leistungsurteil, keine Ablehnung — und keine " +
        "Aussage darueber, ob der Lauf beim Anbieter noch laeuft.",
        { ageSeconds: Math.round(alter), totalSeconds: Math.round(gesamt),
          startedCount: beobachtung.startedCount, window: "total" });
    }

    if (beobachtung.startedCount > 0 && alter > frist.seconds) {
      return fertig("STALE_NO_RESULT",
        "Seit der letzten beobachtbaren Aktivitaet sind " + Math.round(alter) +
        " s vergangen, die Frist betraegt " + frist.seconds + " s. " +
        "Der externe Creative-Provider hat innerhalb des zulaessigen " +
        "Beobachtungsfensters kein beobachtbares Ergebnis erzeugt. " +
        "Das ist kein Content-Fehler, kein Leistungsurteil, keine Ablehnung " +
        "und keine Aussage darueber, ob der Lauf beim Anbieter noch laeuft — " +
        "das kann diese Schnittstelle nicht sehen.",
        { ageSeconds: Math.round(alter),
          totalSeconds: (gesamt !== null && gesamt >= 0) ? Math.round(gesamt) : null,
          startedCount: beobachtung.startedCount, window: "quiet" });
    }

    if (beobachtung.startedCount > 0) {
      return fertig("IN_FLIGHT",
        "Der Agent hat " + beobachtung.startedCount + "x STARTED gemeldet, " +
        "zuletzt vor " + Math.round(alter) + " s (Frist " + frist.seconds + " s)" +
        (gesamt !== null && gesamt >= 0
          ? ", der Vorgang laeuft seit " + Math.round(gesamt) + " s von hoechstens " +
            frist.totalSeconds + " s"
          : "") + ".",
        { ageSeconds: Math.round(alter),
          totalSeconds: gesamt !== null ? Math.round(gesamt) : null,
          startedCount: beobachtung.startedCount, window: "quiet" });
    }

    if (alter > frist.seconds) {
      return fertig("STALE_NO_RESULT",
        "Seit dem Anstoss sind " + Math.round(alter) + " s vergangen, ohne dass " +
        "der Agent auch nur STARTED gemeldet haette. Frist " + frist.seconds + " s.",
        { ageSeconds: Math.round(alter), startedCount: 0 });
    }

    return fertig("INVOKED", "Anstoss zugestellt, noch keine Meldung des Agenten.",
      { ageSeconds: Math.round(alter), startedCount: 0 });
  }

  /** Darf der Graph ohne diesen Lauf weiterarbeiten? */
  function mayProceedWithout(state) {
    return NICHT_BLOCKIEREND.indexOf(String(state || "")) !== -1;
  }

  var api = {
    STATES: STATES,
    VERLAUF: VERLAUF,
    ABBRUCH: ABBRUCH,
    TERMINAL: TERMINAL,
    NICHT_BLOCKIEREND: NICHT_BLOCKIEREND,
    REFERENZMESSUNGEN: REFERENZMESSUNGEN,
    REGIME: REGIME,
    MIN_LEASE_SEKUNDEN: MIN_LEASE_SEKUNDEN,
    MAX_LEASE_SEKUNDEN: MAX_LEASE_SEKUNDEN,
    lease: lease,
    classify: classify,
    mayProceedWithout: mayProceedWithout,
    sekundenZwischen: sekundenZwischen
  };

  if (isNode) module.exports = api;
  else global.VUSocialProviderLifecycle = api;
})(typeof window !== "undefined" ? window : globalThis);
