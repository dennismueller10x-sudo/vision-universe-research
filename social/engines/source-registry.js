/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/source-registry.js

   NICHT AKTIVIERT IST NICHT KAPUTT

   -------------------------------------------------------------------------
   DER UNTERSCHIED, DEN DIESE DATEI SCHUETZT
   -------------------------------------------------------------------------

   Eine Quelle kann aus sehr verschiedenen Gruenden nichts liefern:

     NOT_ACTIVATED_BY_OWNER   Sie wurde bewusst nicht eingeschaltet.
                              Eine Entscheidung, kein Zustand der Welt.
     AWAITING_OWNER_SOURCE    Sie ist gewollt, ihr fehlt ein Schluessel.
     ACTIVE                   Sie liefert.
     PROVIDER_ERROR           Sie sollte liefern und tut es nicht.

   Das System hat diese Zustaende bisher vermischt, und die Folgen waren
   jedes Mal dieselbe Sorte Fehler: eine Abwesenheit wurde als Befund
   gelesen. Ein nicht angebundener Provider hiess "nicht konfiguriert",
   ein gescheiterter Aufruf hiess "null Medien beobachtet", eine
   ungelesene Rechteliste hiess "Recht fehlt".

   `NOT_ACTIVATED_BY_OWNER` ist der wichtigste der vier, weil er der
   einzige ist, der NICHTS ueber die Technik aussagt. Er bedeutet: hier
   ist alles gebaut, geprueft und bereit - und jemand hat entschieden,
   es jetzt nicht zu benutzen.

   Daraus folgt, was NICHT passieren darf:

     - kein Scheduler, der gegen sie anfragt
     - keine Warnung, kein Fehler, kein roter Lauf
     - kein Gewicht in einer Bewertung
     - und vor allem: keine 0

   Eine 0 waere die Behauptung, es sei gemessen worden und nichts
   herausgekommen.

   -------------------------------------------------------------------------
   0..N SENSOREN, NICHT 1..N ABHAENGIGKEITEN
   -------------------------------------------------------------------------

   Der Graph darf von keiner externen Quelle abhaengen. Sind null
   Sensoren aktiv, ist das ein gueltiger Betriebszustand mit einem
   eigenen Namen - NO_ACTIVE_EXTERNAL_SOURCE - und kein Mangel.

   Diese Datei ist die einzige Stelle, die die Frage beantwortet
   "welche externen Sensoren sind aktiv?". Zwei Stellen waeren zwei
   Antworten, und die zweite waere irgendwann die falsche.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  var STATE = {
    /* Bewusst nicht eingeschaltet. Eine Owner-Entscheidung. */
    NOT_ACTIVATED_BY_OWNER: "NOT_ACTIVATED_BY_OWNER",
    /* Gewollt, aber ein manueller Schritt fehlt noch. */
    AWAITING_OWNER_SOURCE: "AWAITING_OWNER_SOURCE",
    /* Liefert. */
    ACTIVE: "ACTIVE",
    /* Sollte liefern und tut es nicht - das ist ein Fehler. */
    PROVIDER_ERROR: "PROVIDER_ERROR"
  };

  /* Zustaende, in denen NICHT angefragt werden darf. */
  var KEINE_ANFRAGEN = [STATE.NOT_ACTIVATED_BY_OWNER, STATE.AWAITING_OWNER_SOURCE];

  /* Zustaende, die KEINE Warnung ausloesen. Eine Entscheidung ist kein
     Vorfall - wer sie taeglich meldet, erzieht zum Wegsehen. */
  var KEINE_WARNUNG = [STATE.NOT_ACTIVATED_BY_OWNER, STATE.ACTIVE];

  /* Der Zustand des Ganzen, wenn kein Sensor aktiv ist. Ein eigener
     Name, weil er ein gueltiger Betriebszustand ist und kein Mangel. */
  var KEIN_SENSOR = "NO_ACTIVE_EXTERNAL_SOURCE";

  /* -------------------------------------------------------------------
     DIE GEBAUTEN SENSOREN

     `components` nennt, was zu dieser Quelle gehoert. Nicht zur Zierde:
     es ist die Liste dessen, was NICHT geloescht werden darf und was
     spaeter ohne Architekturumbau wieder angeht.
     ------------------------------------------------------------------- */
  var SENSOREN = {
    INSTAGRAM_PUBLIC_CONTENT: {
      id: "INSTAGRAM_PUBLIC_CONTENT",
      label: "Instagram Hashtag Intelligence",
      dimension: "externalInterest",
      components: [
        "social/engines/hashtag-portfolio.js",
        "social/engines/hashtag-access.js",
        "social/engines/external-intelligence.js",
        "social/engines/external-patterns.js",
        "scripts/social/plan-hashtag-observation.mjs",
        "scripts/social/ingest-external-observation.mjs",
        "scripts/social/verify-hashtag-access.mjs",
        ".github/workflows/social-external-observe.yml",
        ".github/workflows/social-hashtag-capability.yml"
      ],
      reactivation: "Owner-Entscheidung, dann docs/VU_OWNER_STEP_A_META_REAUTH.md"
    },
    YOUTUBE_EXTERNAL_INTELLIGENCE: {
      id: "YOUTUBE_EXTERNAL_INTELLIGENCE",
      label: "YouTube Creator Discovery und Metrik-Anreicherung",
      dimension: "externalInterest",
      components: [
        "social/engines/youtube-source.js",
        "social/engines/youtube-query-portfolio.js",
        "social/engines/creator-universe.js",
        "scripts/social/discover-creators.mjs",
        "scripts/social/enrich-youtube-metrics.mjs",
        ".github/workflows/social-external-intelligence.yml"
      ],
      reactivation: "Owner-Entscheidung, dann docs/VU_OWNER_STEP_B_YOUTUBE.md"
    }
  };

  function leer() { return { sources: {}, decidedAt: null, decidedBy: null }; }

  /**
   * Der Zustand aller externen Sensoren.
   *
   * @param bestand  der gespeicherte Owner-Entscheid (external-sources.json)
   */
  function status(bestand) {
    var b = bestand || leer();
    var gespeichert = b.sources || {};

    var sensoren = Object.keys(SENSOREN).map(function (id) {
      var def = SENSOREN[id];
      var e = gespeichert[id] || {};
      /* Ohne Eintrag gilt: nicht aktiviert. Die sichere Richtung - eine
         Quelle, die niemand eingeschaltet hat, ist aus. */
      var zustand = e.state || STATE.NOT_ACTIVATED_BY_OWNER;
      return {
        id: id,
        label: def.label,
        dimension: def.dimension,
        state: zustand,
        active: zustand === STATE.ACTIVE,
        dormant: zustand === STATE.NOT_ACTIVATED_BY_OWNER,
        mayRequest: KEINE_ANFRAGEN.indexOf(zustand) === -1,
        warns: KEINE_WARNUNG.indexOf(zustand) === -1,
        decidedAt: e.decidedAt || b.decidedAt || null,
        reason: e.reason || null,
        components: def.components.slice(),
        reactivation: def.reactivation
      };
    });

    var aktiv = sensoren.filter(function (s) { return s.active; });
    var ruhend = sensoren.filter(function (s) { return s.dormant; });

    return {
      sensors: sensoren,
      activeCount: aktiv.length,
      dormantCount: ruhend.length,
      /* Der Name des Zustands, nicht seine Abwesenheit. */
      externalIntelligence: aktiv.length ? "ACTIVE" : KEIN_SENSOR,
      /* Woertlich, weil die Verwechslung teuer waere: null Sensoren ist
         ein gueltiger Betriebszustand. */
      blocksGraph: false,
      anyWarning: sensoren.some(function (s) { return s.warns; }),
      explanation: aktiv.length
        ? aktiv.length + " externe(r) Sensor(en) aktiv."
        : "Kein externer Sensor aktiv (" + ruhend.length + " ruhend). " +
          "Das ist ein gueltiger Betriebszustand und kein Mangel: der " +
          "Graph braucht keine externe Quelle. Ruhend heisst gebaut, " +
          "geprueft und nicht eingeschaltet - nicht kaputt."
    };
  }

  /**
   * Darf gegen diese Quelle ueberhaupt angefragt werden?
   *
   * Die Frage, die jeder Scheduler VOR dem Aufruf stellen muss. Eine
   * Anfrage gegen eine bewusst abgeschaltete Quelle ist nicht nur
   * nutzlos - sie erzeugt Fehler, die dann jemand deutet.
   */
  function darfAnfragen(bestand, id) {
    var s = status(bestand).sensors.filter(function (x) { return x.id === id; })[0];
    if (!s) {
      return { allowed: false, state: null,
        explanation: "Unbekannte Quelle: " + id + "." };
    }
    return {
      allowed: s.mayRequest,
      state: s.state,
      explanation: s.mayRequest
        ? s.label + " ist aktiv - Anfragen sind zulaessig."
        : s.label + " steht auf " + s.state + ". Es wird nicht angefragt" +
          (s.state === STATE.NOT_ACTIVATED_BY_OWNER
            ? " - und das ist kein Fehler, sondern die Entscheidung."
            : ".")
    };
  }

  /**
   * Wie eine nicht aktivierte Dimension in einer Bewertung erscheint.
   *
   * NICHT 0. Nicht "systemisch unmessbar" - das hiesse, das System sei
   * zu jung. Hier ist nichts zu jung: es ist abgeschaltet.
   */
  function dimensionZustand(bestand, dimension) {
    var s = status(bestand);
    var zustaendig = s.sensors.filter(function (x) { return x.dimension === dimension; });
    if (!zustaendig.length) {
      return { available: false, value: null, state: "UNKNOWN_DIMENSION",
        explanation: "Keine Quelle ist fuer " + dimension + " zustaendig." };
    }
    var aktiv = zustaendig.filter(function (x) { return x.active; });
    if (aktiv.length) {
      return { available: true, state: "ACTIVE", value: null,
        sources: aktiv.map(function (x) { return x.id; }),
        explanation: aktiv.length + " Quelle(n) aktiv fuer " + dimension + "." };
    }
    return {
      available: false,
      value: null,
      state: "NOT_ACTIVE",
      /* Kein Gewicht, solange nichts aktiv ist. Ein Gewicht auf einer
         abgeschalteten Dimension waere ein Abzug fuer eine Entscheidung. */
      carriesWeight: false,
      sources: zustaendig.map(function (x) { return x.id; }),
      explanation: dimension + " ist NOT_ACTIVE: " + zustaendig.length +
        " zustaendige Quelle(n), keine davon eingeschaltet. Das ist " +
        "keine Messung mit dem Ergebnis null, sondern die Abwesenheit " +
        "einer Quelle - und sie zieht nichts ab."
    };
  }

  var api = {
    STATE: STATE,
    SENSOREN: SENSOREN,
    NO_ACTIVE_EXTERNAL_SOURCE: KEIN_SENSOR,
    status: status,
    darfAnfragen: darfAnfragen,
    dimensionZustand: dimensionZustand
  };

  if (isNode) module.exports = api;
  else global.VUSocialSourceRegistry = api;
})(typeof window !== "undefined" ? window : globalThis);
