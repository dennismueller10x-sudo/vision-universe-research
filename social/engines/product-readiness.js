/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/product-readiness.js

   SOCIAL_OS_1_0_PRODUCTION_READY (§55)

   -------------------------------------------------------------------------
   WARUM ES DIESE GROESSE NEBEN DER BESTEHENDEN GIBT
   -------------------------------------------------------------------------

   SOCIAL_ORCHESTRATOR_PRODUCTION_READY beantwortet: laeuft der Betrieb
   sicher? Kein Autopublish, kein zweiter Lauf, Tore fail-closed,
   Suiten gruen am richtigen Stand.

   Das ist eine Aussage ueber die MASCHINE.

   §55 verlangt eine zweite, andere: ist das PRODUKT fertig? Findet
   Vision Universe ein Thema, entwickelt es einen Hook, entsteht ein
   markenkonformes Visual mit Text, kommt es beim Owner an, und lernt
   das System aus dem, was danach passiert?

   Beides zu einer Zahl zusammenzuziehen waere die bequemste
   Verwechslung dieses Auftrags: gruene Tests und ein sauberes
   Deployment sagen ueber die zweite Frage nichts. §55 sagt das
   ausdruecklich.

   Diese Engine ist deshalb kein zweites Register fuer dieselbe
   Tatsache. Sie KONSUMIERT die Orchestratorreife als einen ihrer
   Befunde und stellt zwoelf weitere daneben.

   -------------------------------------------------------------------------
   VIER ZUSTAENDE, UND JEDER SAGT ETWAS ANDERES
   -------------------------------------------------------------------------

     ERFUELLT        gemessen, und die Messung traegt.

     NICHT_ERFUELLT  gemessen, und sie traegt nicht. Das ist ein
                     ARBEITSAUFTRAG und keine Stop Condition.

     UNGEPRUEFT      es wurde nicht gemessen. Ausdruecklich nicht
                     dasselbe wie "nicht erfuellt": wer nicht
                     hingesehen hat, hat keinen Befund.

     BLOCKIERT       gemessen, und es haengt an etwas, das dieses
                     System nicht aufloesen kann - eine
                     Owner-Entscheidung oder eine externe Sperre.
                     Ein Blocker ist kein Mangel der Arbeit.

   Der Unterschied zwischen den letzten dreien ist der ganze Wert
   dieses Berichts. Wer sie zusammenzieht, bekommt eine Zahl, aus der
   sich nichts ableiten laesst.

   -------------------------------------------------------------------------
   WAS DIESE ENGINE NICHT TUT
   -------------------------------------------------------------------------

   Sie misst nichts. Sie hat kein Netz, kein Dateisystem und keine
   Uhr. Sie bekommt Befunde und beurteilt sie. Die Messung steht in
   scripts/social/social-os-ready.mjs - dort, wo das Netz ist.

   Eine Engine, die selbst misst, laesst sich nicht gegen erfundene
   Lagen pruefen.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  var ZUSTAND = {
    ERFUELLT: "ERFUELLT",
    NICHT_ERFUELLT: "NICHT_ERFUELLT",
    UNGEPRUEFT: "UNGEPRUEFT",
    BLOCKIERT: "BLOCKIERT"
  };

  /* -------------------------------------------------------------------
     DIE DREIZEHN BEDINGUNGEN

     Reihenfolge ist Abhaengigkeitsreihenfolge, nicht Wichtigkeit: was
     weiter oben steht, traegt das darunter. Ein Hook ohne Thema ist
     keiner; ein Visual ohne Marke ist ein Bild; ein Lernkreis ohne
     Messung ist eine Behauptung.

     `ref` nennt den Paragraphen, damit spaeter niemand raten muss,
     woher eine Bedingung kommt.
     ------------------------------------------------------------------- */
  var BEDINGUNGEN = [
    { id: "CONTENT_INTELLIGENCE_READY",   ref: "§6/§7/§8",
      frage: "Trennt das System internes Signal, redaktionellen Angle, " +
             "oeffentlichen Hook und oeffentliche Story?" },
    { id: "HOOK_INTELLIGENCE_READY",      ref: "§9",
      frage: "Ist der Hook ein eigenes Optimierungsobjekt mit mehreren " +
             "bewerteten Kandidaten?" },
    { id: "TEXT_ON_VISUAL_REQUIRED",      ref: "§13/§14/§15",
      frage: "Ist Text im Bild harte Vorbedingung und kein Zusatz?" },
    { id: "BRAND_SYSTEM_READY",           ref: "§12/§16/§19",
      frage: "Gibt es eine Visual Grammar mit benannten Familien statt " +
             "eines Layouts?" },
    { id: "CANONICAL_ATLAS_READY",        ref: "§11/§17/§47",
      frage: "Ist das kanonische Atlas-Asset lokalisiert und gebunden?" },
    { id: "CANONICAL_LOGO_READY",         ref: "§11/§18/§47",
      frage: "Ist das kanonische Logo lokalisiert und gebunden?" },
    { id: "ASSET_DELIVERY_SAFE",          ref: "§22-§25/§52",
      frage: "Ist der Vorfall vom 21.09. an dieser Architektur " +
             "unmoeglich?" },
    { id: "APPROVAL_PREVIEW_SAFE",        ref: "§25/§34/§54",
      frage: "Sieht der Owner genau das, was hinausginge - Bytes, nicht " +
             "Adresse?" },
    { id: "MANUAL_NOW_READY",             ref: "§29/§51",
      frage: "Gibt es JETZT POST ERSTELLEN, getrennt von JETZT PRUEFEN?" },
    { id: "MANUAL_TOPIC_READY",           ref: "§30/§51",
      frage: "Kann der Owner ein Thema vorgeben, ohne Qualitaetstore zu " +
             "uebergehen?" },
    { id: "AUTO_MODE_READY",              ref: "§27/§50",
      frage: "Laeuft AUTO im Zielkorridor, ohne an Ideenmangel zu " +
             "haengen?" },
    { id: "PERFORMANCE_MEASUREMENT_READY", ref: "§36/§37",
      frage: "Werden reale Metriken gelesen, Unbekanntes als unbekannt?" },
    { id: "LEARNING_LOOP_READY",          ref: "§38/§39/§40/§41",
      frage: "Beeinflusst reale Performance nachweislich eine kuenftige " +
             "Auswahl?" }
  ];

  function textVon(v) { return v === undefined || v === null ? "" : String(v); }

  /**
   * Ein einzelner Befund, normalisiert.
   *
   * Ein Messer darf `{ zustand, satz }` liefern oder fehlen. Fehlt er,
   * ist das UNGEPRUEFT - und NICHT "nicht erfuellt". Der Unterschied
   * ist in diesem Projekt schon mehrfach teuer geworden.
   */
  function befund(bedingung, gemessen) {
    var g = gemessen || null;
    if (!g || !g.zustand) {
      return {
        id: bedingung.id, ref: bedingung.ref, frage: bedingung.frage,
        zustand: ZUSTAND.UNGEPRUEFT,
        satz: "Zu dieser Bedingung liegt keine Messung vor. Das ist kein " +
          "Befund ueber das Produkt, sondern einer ueber den Bericht.",
        belege: []
      };
    }
    var z = textVon(g.zustand);
    var bekannt = z === ZUSTAND.ERFUELLT || z === ZUSTAND.NICHT_ERFUELLT ||
      z === ZUSTAND.UNGEPRUEFT || z === ZUSTAND.BLOCKIERT;
    return {
      id: bedingung.id, ref: bedingung.ref, frage: bedingung.frage,
      zustand: bekannt ? z : ZUSTAND.UNGEPRUEFT,
      satz: bekannt ? textVon(g.satz)
        : "Unbekannter Zustand '" + z + "'. Ein Bericht, der einen Zustand " +
          "nicht kennt, darf ihn nicht als Erfolg lesen.",
      belege: Array.isArray(g.belege) ? g.belege.slice() : [],
      /* Ein Blocker ohne Adressat ist eine Ausrede. */
      blocker: z === ZUSTAND.BLOCKIERT ? (textVon(g.blocker) || null) : null
    };
  }

  /**
   * Die Gesamtaussage.
   *
   * @param messungen { <BEDINGUNG_ID>: { zustand, satz, belege?, blocker? } }
   */
  function beurteile(messungen) {
    var m = messungen || {};
    var befunde = BEDINGUNGEN.map(function (b) { return befund(b, m[b.id]); });

    var offen = befunde.filter(function (b) { return b.zustand === ZUSTAND.NICHT_ERFUELLT; });
    var ungeprueft = befunde.filter(function (b) { return b.zustand === ZUSTAND.UNGEPRUEFT; });
    var blockiert = befunde.filter(function (b) { return b.zustand === ZUSTAND.BLOCKIERT; });
    var erfuellt = befunde.filter(function (b) { return b.zustand === ZUSTAND.ERFUELLT; });

    /* -----------------------------------------------------------------
       READY HEISST: ALLE DREIZEHN, GEMESSEN

       Nicht "keine offenen". Ungeprueft zaehlt nicht als erfuellt, und
       blockiert auch nicht - ein Blocker erklaert, warum etwas fehlt,
       er ersetzt es nicht.

       Diese Zeile ist der ganze Sinn der vier Zustaende. */
    var ready = erfuellt.length === BEDINGUNGEN.length;

    return {
      id: "SOCIAL_OS_1_0_PRODUCTION_READY",
      ready: ready,
      bedingungen: befunde,
      zaehlung: {
        gesamt: BEDINGUNGEN.length,
        erfuellt: erfuellt.length,
        nichtErfuellt: offen.length,
        ungeprueft: ungeprueft.length,
        blockiert: blockiert.length
      },
      offen: offen.map(function (b) { return b.id; }),
      ungeprueft: ungeprueft.map(function (b) { return b.id; }),
      blockiert: blockiert.map(function (b) { return b.id; }),
      erklaerung: ready
        ? "Alle " + BEDINGUNGEN.length + " Produktbedingungen sind gemessen " +
          "und erfuellt."
        : erfuellt.length + " von " + BEDINGUNGEN.length + " erfuellt. " +
          (offen.length ? offen.length + " offen (Arbeitsauftrag). " : "") +
          (ungeprueft.length ? ungeprueft.length + " ungeprueft. " : "") +
          (blockiert.length ? blockiert.length + " blockiert. " : "") +
          "Gruene Tests und ein sauberes Deployment machen daraus kein " +
          "fertiges Produkt (§55)."
    };
  }

  var api = {
    ZUSTAND: ZUSTAND,
    BEDINGUNGEN: BEDINGUNGEN,
    beurteile: beurteile
  };

  if (isNode) module.exports = api;
  else global.VUSocialProductReadiness = api;
})(typeof window !== "undefined" ? window : globalThis);
