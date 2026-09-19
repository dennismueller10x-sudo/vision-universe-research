/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/hashtag-access.js

   EIN RECHT UND EINE FREISCHALTUNG SIND ZWEI VERSCHIEDENE DINGE

   -------------------------------------------------------------------------
   DER IRRTUM, DEN DIESE DATEI VERHINDERT
   -------------------------------------------------------------------------

   Nach dem ersten echten Lauf kamen acht Hashtag-Abfragen mit
   `permissionRevoked` zurueck. Die naheliegende Erklaerung war: es
   fehlt ein Recht, also noch einmal autorisieren.

   Die Erklaerung war falsch - und der Fehler haette Geld in Form von
   Zeit gekostet, denn eine erneute Autorisierung ist eine einmalige
   Owner-Aktion, die man nicht fuer nichts ausgibt.

   Die Hashtag-Suche braucht ZWEI verschiedene Dinge von Meta:

     RECHTE          `instagram_basic`, `pages_read_engagement`,
                     `instagram_manage_insights`. Sie kommen aus der
                     Autorisierung. Ein erneuter OAuth-Lauf kann sie
                     nachholen.

     FREISCHALTUNG   "Instagram Public Content Access" - ein FEATURE
                     der App, kein Recht des Nutzers. Es kommt aus der
                     App-Ueberpruefung bei Meta.

   Ein Feature laesst sich durch keine Autorisierung der Welt
   nachholen. Wer bei fehlendem Feature einen erneuten OAuth-Lauf
   ausloest, hat den Owner-Schritt verbraucht und nichts gewonnen -
   und die naechste Abfrage scheitert mit derselben Meldung.

   Genau deshalb wird hier nicht geraten, sondern unterschieden.

   -------------------------------------------------------------------------
   UND WENN WIR ES NICHT WISSEN?
   -------------------------------------------------------------------------

   Bei der Business-Anmeldung stehen die angefragten Rechte in einer
   Konfiguration bei Meta, die der Worker nicht lesen kann. `scopes`
   ist dann `null` - und `null` ist NICHT "keine".

   Aus "wir wissen es nicht" darf kein Owner-Schritt folgen. Dann sagt
   diese Datei genau das: UNKNOWN, und was zu messen waere.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* Rechte - kommen aus der Autorisierung. */
  var BENOETIGTE_RECHTE = [
    "instagram_basic",
    "pages_read_engagement",
    "instagram_manage_insights"
  ];

  /* Freischaltung - kommt aus der App-Ueberpruefung. Kein Recht. */
  var BENOETIGTES_FEATURE = {
    name: "Instagram Public Content Access",
    grantedBy: "APP_REVIEW",
    grantableByReauthorization: false,
    note: "Ein Feature der App, kein Recht des Nutzers. Eine erneute " +
      "Autorisierung kann es nicht nachholen."
  };

  var DIAGNOSE = {
    OK: "HASHTAG_ACCESS_OK",
    MISSING_SCOPE: "MISSING_SCOPE",
    MISSING_APP_REVIEW_FEATURE: "MISSING_APP_REVIEW_FEATURE",
    UNKNOWN: "HASHTAG_ACCESS_UNKNOWN"
  };

  /* -------------------------------------------------------------------
     DER KANONISCHE GRUND GENUEGT - UND DAS IST ABSICHT

     Der Worker uebersetzt Meta-Fehler in kanonische Gruende und sagt
     dazu ausdruecklich: "Oberhalb dieser Funktion existiert kein
     Meta-Code mehr." Diese Datei liegt oberhalb.

     Sie braucht die Codes auch nicht. `permissionRevoked` deckt genau
     die Klasse ab, um die es hier geht (10, 200, 3, Subcodes 458/459) -
     und Meta unterscheidet innerhalb dieser Klasse ohnehin nicht
     zwischen fehlendem Recht und fehlendem Feature. Das tut erst der
     Abgleich mit den erteilten Rechten, ein paar Zeilen weiter unten.

     Die Rohcodes werden trotzdem akzeptiert: ein Aufrufer, der die
     Antwort direkt von Meta hat, soll nicht erst uebersetzen muessen. */
  var ZUGRIFFSGRUENDE = ["permissionRevoked"];
  var ZUGRIFFSCODES = [10, 200, 3];
  var ZUGRIFFSSUBCODES = [458, 459];

  function istZugriffsfehler(fehler) {
    if (!fehler) return false;
    if (typeof fehler === "string") return ZUGRIFFSGRUENDE.indexOf(fehler) !== -1;
    if (fehler.reason && ZUGRIFFSGRUENDE.indexOf(fehler.reason) !== -1) return true;
    var code = Number(fehler.code);
    var sub = Number(fehler.error_subcode !== undefined
      ? fehler.error_subcode : fehler.subcode);
    return ZUGRIFFSCODES.indexOf(code) !== -1 ||
      ZUGRIFFSSUBCODES.indexOf(sub) !== -1;
  }

  /**
   * Was fehlt - und wer es beheben kann.
   *
   * @param eingang {
   *   grantedScopes  Array erteilter Rechte, oder null wenn unbekannt
   *   probe          { ok, error } - ein EINZELNER Versuch gegen einen
   *                  bereits geoeffneten Hashtag. Optional.
   * }
   */
  function diagnose(eingang) {
    eingang = eingang || {};
    var rechte = eingang.grantedScopes;
    var probe = eingang.probe || null;

    /* --------------------------------------------------------------
       Der Fall, in dem nichts behauptet wird.

       Unbekannte Rechte UND kein Versuch heisst: wir haben nicht
       gemessen. Daraus einen Owner-Schritt abzuleiten, waere ein
       Owner-Schritt auf Verdacht. */
    if (!Array.isArray(rechte) && !probe) {
      return {
        state: DIAGNOSE.UNKNOWN,
        ownerActionRequired: null,
        missingScopes: null,
        featureLikelyMissing: null,
        reauthorizationHelps: null,
        explanation: "Weder die erteilten Rechte noch ein Versuch liegen " +
          "vor. Das ist die Abwesenheit einer Messung und kein Befund " +
          "ueber den Zugriff. Zu messen waere: debug_token fuer die " +
          "Rechte, ein Versuch gegen einen BEREITS GEOEFFNETEN Hashtag " +
          "fuer den Rest - letzterer kostet keinen Platz."
      };
    }

    var fehlend = Array.isArray(rechte)
      ? BENOETIGTE_RECHTE.filter(function (r) { return rechte.indexOf(r) === -1; })
      : null;

    /* -------------------------------------------------------------- */
    if (probe && probe.ok === true) {
      return {
        state: DIAGNOSE.OK,
        ownerActionRequired: null,
        missingScopes: fehlend,
        featureLikelyMissing: false,
        reauthorizationHelps: null,
        explanation: "Der Versuch war erfolgreich. Rechte und " +
          "Freischaltung liegen vor" +
          (fehlend && fehlend.length
            ? " - obwohl " + fehlend.join(", ") + " in der Rechteliste " +
              "fehlt. Das heisst nicht, dass sie fehlen: bei der " +
              "Business-Anmeldung ist die Liste unvollstaendig lesbar. " +
              "Der gelungene Versuch wiegt schwerer als die Liste."
            : ".")
      };
    }

    /* Der Versuch kann seinen Grund auf drei Weisen mitbringen: als
       kanonischen Grund (so liefert ihn der Worker), als Fehlerobjekt
       mit `reason`, oder als Meta-Rohfehler. Alle drei zaehlen. */
    var zugriffsfehler = !!probe && (istZugriffsfehler(probe.reason) ||
      istZugriffsfehler(probe.error));

    /* --------------------------------------------------------------
       EIN FEHLENDES RECHT IST BEHEBBAR - DURCH DEN OWNER, EINMAL.

       Wenn die Rechteliste LESBAR ist und etwas fehlt, ist das der
       einfache Fall. */
    if (Array.isArray(rechte) && fehlend.length) {
      return {
        state: DIAGNOSE.MISSING_SCOPE,
        missingScopes: fehlend,
        featureLikelyMissing: null,
        reauthorizationHelps: true,
        ownerActionRequired: {
          kind: "REAUTHORIZE",
          what: "Diese Rechte fehlen: " + fehlend.join(", ") + ". Sie " +
            "kommen aus der Autorisierung - ein einmaliger erneuter " +
            "OAuth-Lauf holt sie nach.",
          oneTime: true
        },
        explanation: "Die erteilten Rechte sind lesbar, und " +
          fehlend.length + " davon fehlt/fehlen. Ob zusaetzlich das " +
          "Feature \"" + BENOETIGTES_FEATURE.name + "\" fehlt, laesst " +
          "sich erst nach dem erneuten OAuth-Lauf entscheiden: solange " +
          "ein Recht fehlt, scheitert die Abfrage ohnehin."
      };
    }

    /* --------------------------------------------------------------
       ALLE RECHTE DA UND TROTZDEM ABGEWIESEN

       Das ist der Fall, der den Unterschied ausmacht. Eine erneute
       Autorisierung wuerde daran NICHTS aendern. */
    if (zugriffsfehler && Array.isArray(rechte) && !fehlend.length) {
      return {
        state: DIAGNOSE.MISSING_APP_REVIEW_FEATURE,
        missingScopes: [],
        featureLikelyMissing: true,
        reauthorizationHelps: false,
        ownerActionRequired: {
          kind: "APP_REVIEW",
          feature: BENOETIGTES_FEATURE.name,
          what: "Alle noetigen Rechte sind erteilt, und die Abfrage wird " +
            "trotzdem abgewiesen. Dann fehlt die Freischaltung \"" +
            BENOETIGTES_FEATURE.name + "\" - ein Feature der App aus der " +
            "App-Ueberpruefung, kein Recht des Nutzers.",
          doNot: "Keine erneute Autorisierung ausloesen. Sie kann ein " +
            "Feature nicht nachholen und verbraucht den Owner-Schritt " +
            "fuer nichts.",
          oneTime: true
        },
        explanation: "Rechte vollstaendig, Zugriff verweigert. Meta " +
          "unterscheidet in der Fehlermeldung nicht zwischen fehlendem " +
          "Recht und fehlendem Feature - der Abgleich mit den erteilten " +
          "Rechten tut es."
      };
    }

    /* --------------------------------------------------------------
       RECHTELISTE UNLESBAR, VERSUCH GESCHEITERT

       Der haeufigste Fall bei der Business-Anmeldung. Hier laesst sich
       die Ursache NICHT bestimmen, und das ist die Antwort. */
    if (zugriffsfehler && !Array.isArray(rechte)) {
      return {
        state: DIAGNOSE.UNKNOWN,
        missingScopes: null,
        featureLikelyMissing: null,
        reauthorizationHelps: null,
        ownerActionRequired: {
          kind: "MEASURE_FIRST",
          what: "Der Zugriff wird verweigert, aber die erteilten Rechte " +
            "sind von hier aus nicht lesbar (Business-Anmeldung: die " +
            "Rechtemenge steht in einer Konfiguration bei Meta). Ohne " +
            "sie ist nicht zu entscheiden, ob ein Recht oder das Feature " +
            "fehlt - und die beiden Owner-Schritte sind verschieden.",
          measure: "debug_token mit granular_scopes fuer das gespeicherte " +
            "Page-Token abfragen.",
          oneTime: false
        },
        explanation: "Verweigert, Ursache unbestimmt. Ein Owner-Schritt " +
          "auf Verdacht waere hier der teuerste Fehler: die erneute " +
          "Autorisierung ist einmalig, und fuer ein fehlendes Feature " +
          "waere sie wirkungslos."
      };
    }

    /* Ein Fehler, der kein Zugriffsfehler ist - abgelaufenes Token,
       Ratenbegrenzung, Ausfall. Nicht unsere Frage. */
    return {
      state: DIAGNOSE.UNKNOWN,
      missingScopes: fehlend,
      featureLikelyMissing: null,
      reauthorizationHelps: null,
      ownerActionRequired: null,
      explanation: "Der Versuch scheiterte, aber nicht an einem " +
        "Zugriffsrecht. Ueber Rechte und Freischaltung sagt das nichts."
    };
  }

  var api = {
    BENOETIGTE_RECHTE: BENOETIGTE_RECHTE,
    ZUGRIFFSGRUENDE: ZUGRIFFSGRUENDE,
    BENOETIGTES_FEATURE: BENOETIGTES_FEATURE,
    DIAGNOSE: DIAGNOSE,
    istZugriffsfehler: istZugriffsfehler,
    diagnose: diagnose
  };

  if (isNode) module.exports = api;
  else global.VUSocialHashtagAccess = api;
})(typeof window !== "undefined" ? window : globalThis);
