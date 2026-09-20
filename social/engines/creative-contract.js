/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/creative-contract.js

   WAS FUER EINE ART VON AUFTRAG IST DAS?

   -------------------------------------------------------------------------
   DER BEFUND, DER DIESE DATEI AUSGELOEST HAT
   -------------------------------------------------------------------------

   PR 110 wurde nie bearbeitet. Ich habe das als Trigger- oder
   Zustellungsfehler eingestuft — und lag falsch. Der Owner hat die
   Ursache benannt:

     VU wollte      Text neu, Bild erben, KEINE Bilderzeugung.
     Der Contract   kannte nur einen Auftragstyp, und der verlangt
                    zwingend ein neues Bild.

   Der Request war damit VERTRAGSWIDRIG. Kein TRIGGER_FAILURE, kein
   DELIVERY_FAILURE, kein PROVIDER_FAILURE, kein CONTENT_FAILURE.

   Das ist eine Lehre ueber die Diagnose: ich hatte gemessen, wie lange
   ein Start ueblicherweise dauert, und aus dem Ausbleiben auf einen
   Fehler im Transportweg geschlossen. Gemessen war richtig, der Schluss
   war falsch — weil ich die Moeglichkeit gar nicht im Zustandsraum
   hatte, dass ein Auftrag abgelehnt wird, WEIL er nicht zum Vertrag
   passt. Wieder ein zu kleiner Zustandsraum, und wieder erzeugte er
   eine falsche Erklaerung statt einer Luecke.

   -------------------------------------------------------------------------
   ZWEI AUFTRAGSARTEN
   -------------------------------------------------------------------------

     FULL_CREATIVE   Text UND Bild. Der bisherige Vertrag, unveraendert:
                     wer ein Bild verlangt, bekommt die Bildpflicht.

     TEXT_REVISION   Nur Text. Das Bild wird GEERBT — aus einem bereits
                     vollstaendig VU-verifizierten Asset.

   Der Unterschied ist keine Bequemlichkeit. Eine Textrevision, die ein
   neues Bild erzeugt, aendert ZWEI Variablen gleichzeitig; hinterher
   laesst sich nicht mehr sagen, ob die Verbesserung vom Text kam. Das
   Erben ist die Voraussetzung dafuer, ueberhaupt etwas zu lernen.

   -------------------------------------------------------------------------
   DIE SICHERHEITSGRENZE WIRD NICHT AUFGEWEICHT
   -------------------------------------------------------------------------

   "Kein Bild noetig" ist kein zulaessiger Zustand. Zulaessig ist
   ausschliesslich "das Bild ist DIESES, es ist bereits geprueft, und
   hier steht seine vollstaendige Identitaet".

   Fehlt ein Feld der Vererbung, ist der Request ungueltig — auch dann,
   wenn er TEXT_REVISION sagt. Fail closed.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var VOLL = "FULL_CREATIVE";
  var TEXT = "TEXT_REVISION";
  /* VISUAL_REVISION ist vorgesehen und NICHT implementiert. Ein
     Auftragstyp, den niemand stellt, waere Code ohne Aufrufer - und
     der erste echte Bedarf wuerde ihn ohnehin anders formen, als man
     ihn sich spekulativ ausgedacht haette. */
  var TYPEN = [VOLL, TEXT];

  var ERBEN = "INHERIT_VERIFIED_ASSET";
  var ERZEUGEN = "GENERATE_NEW_ASSET";

  /* Die Felder, ohne die eine Vererbung nicht nachpruefbar ist. Jedes
     einzelne beantwortet eine Frage, die sonst offen bliebe: welches
     Objekt, welche Variante, welche Datei, welcher Inhalt, welches
     Format, welche Groesse. */
  var ERBFELDER = [
    "source_content_id",
    "source_visual_variant_id",
    "source_asset_reference",
    "source_asset_sha256",
    "source_mime_type",
    "source_width",
    "source_height"
  ];

  function leer(x) {
    return x === undefined || x === null || x === "" ||
      (typeof x === "number" && !isFinite(x));
  }

  /* ------------------------------------------------------------------ */
  /* DER REQUEST                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Ist dieser Brief ein gueltiger Auftrag?
   *
   * Absichtlich streng und absichtlich gesprächig: jede Ablehnung nennt
   * das Feld, um das es geht. Ein "ungueltig" ohne Grund waere die
   * Sorte Befund, an der PR 110 zwoelf Stunden gehangen hat.
   */
  function validateRequest(brief) {
    var b = brief || {};
    var typ = b.request_type;
    var befunde = [];

    /* -----------------------------------------------------------------
       EIN BRIEF OHNE FELD IST EIN ALTER BRIEF

       Die naheliegende Antwort waere, fehlendes request_type still auf
       FULL_CREATIVE zu setzen. Genau dieses stille Setzen hat PR 110
       zwoelf Stunden gekostet.

       Trotzdem ist FULL_CREATIVE hier richtig - aber nicht als Vorgabe,
       sondern als historische TATSACHE: als diese Briefe geschrieben
       wurden, gab es keine andere Auftragsart. Ein Brief ohne das Feld
       kann gar nichts anderes gemeint haben.

       Der Unterschied steht im Ergebnis: `legacy: true`. Wer das liest,
       weiss, dass hier gelesen und nicht entschieden wurde. Und neue
       Briefe tragen das Feld, weil buildAgentBrief es immer setzt.
       ----------------------------------------------------------------- */
    if (leer(typ)) {
      return { ok: true, requestType: VOLL, visualMode: ERZEUGEN,
        regenerationAllowed: true, legacy: true,
        explanation: "Brief ohne request_type. Gelesen als " + VOLL +
          ", weil es zur Entstehungszeit keine andere Auftragsart gab - " +
          "nicht, weil FULL_CREATIVE ein Vorgabewert waere." };
    }
    if (TYPEN.indexOf(typ) === -1) {
      return fehler("unknownRequestType",
        "Unbekannter request_type: " + typ + ". Bekannt sind " +
        TYPEN.join(" und ") + ".");
    }

    var visual = b.visual || {};

    if (typ === VOLL) {
      if (visual.mode && visual.mode !== ERZEUGEN) {
        befunde.push({ field: "visual.mode",
          message: "FULL_CREATIVE erzeugt ein Bild. " + visual.mode +
            " passt dazu nicht." });
      }
      if (b.authoring_requirements &&
          b.authoring_requirements.actual_image_asset_required === false) {
        befunde.push({ field: "authoring_requirements.actual_image_asset_required",
          message: "FULL_CREATIVE ohne Bildpflicht waere ein TEXT_REVISION " +
            "ohne die dafuer noetige Vererbung - also genau die Luecke, die " +
            "hier geschlossen wird." });
      }
      return befunde.length ? mitBefunden(typ, befunde)
        : { ok: true, requestType: typ, visualMode: ERZEUGEN,
            regenerationAllowed: true,
            explanation: "FULL_CREATIVE: Text und neues Bild." };
    }

    /* --- TEXT_REVISION ------------------------------------------------ */
    if (visual.mode !== ERBEN) {
      befunde.push({ field: "visual.mode",
        message: "TEXT_REVISION verlangt visual.mode = " + ERBEN + ". " +
          "\"Kein Bild noetig\" ist kein zulaessiger Zustand - zulaessig ist " +
          "nur \"das Bild ist DIESES und es ist bereits geprueft\"." });
    }
    if (visual.regeneration_allowed !== false) {
      befunde.push({ field: "visual.regeneration_allowed",
        message: "TEXT_REVISION verlangt regeneration_allowed = false. " +
          "Ohne diese Zeile darf der Agent ein Bild erzeugen, und dann " +
          "aendern sich zwei Variablen auf einmal." });
    }

    ERBFELDER.forEach(function (f) {
      if (leer(visual[f])) {
        befunde.push({ field: "visual." + f,
          message: "Die Vererbung ist ohne " + f + " nicht nachpruefbar." });
      }
    });

    if (!leer(visual.source_asset_sha256) &&
        !/^[0-9a-f]{64}$/.test(String(visual.source_asset_sha256))) {
      befunde.push({ field: "visual.source_asset_sha256",
        message: "Kein SHA-256. Ein Hash, der keiner ist, prueft nichts." });
    }

    /* Nur ein bereits verifiziertes Asset darf geerbt werden. */
    if (visual.source_verification !== "VU_VERIFIED_COMPLETED") {
      befunde.push({ field: "visual.source_verification",
        message: "Geerbt wird nur aus VU_VERIFIED_COMPLETED. Ein Asset, das " +
          "nie vollstaendig geprueft wurde, wird durch das Erben nicht " +
          "besser - es wuerde nur seine Ungeprueftheit weiterreichen." });
    }

    return befunde.length ? mitBefunden(typ, befunde)
      : { ok: true, requestType: typ, visualMode: ERBEN,
          regenerationAllowed: false,
          inheritance: ERBFELDER.reduce(function (acc, f) {
            acc[f] = visual[f]; return acc; }, {}),
          explanation: "TEXT_REVISION: neuer Text, Bild geerbt aus " +
            visual.source_content_id + "." };
  }

  function fehler(reason, message) {
    return { ok: false, reason: reason, findings: [{ message: message }],
      explanation: message };
  }

  function mitBefunden(typ, befunde) {
    return { ok: false, reason: "contractViolation", requestType: typ,
      findings: befunde,
      explanation: befunde.length + " Vertragsverstoss/-verstoesse: " +
        befunde.map(function (b) { return b.field + " - " + b.message; }).join(" ") };
  }

  /* ------------------------------------------------------------------ */
  /* DAS ERGEBNIS                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Erfuellt dieses Ergebnis den Auftrag, der gestellt wurde?
   *
   * Die Frage ist NICHT "ist ein Bild da". Sie ist "wurde getan, was
   * vereinbart war" - und bei TEXT_REVISION ist ein fehlendes Bild die
   * Erfuellung, ein neues dagegen der Bruch.
   */
  function validateResult(result, brief) {
    var r = result || {};
    var vertrag = validateRequest(brief);
    if (!vertrag.ok) {
      return { ok: false, reason: "invalidRequest",
        explanation: "Das Ergebnis laesst sich nicht beurteilen, weil schon " +
          "der Auftrag ungueltig war: " + vertrag.explanation };
    }

    var varianten = Array.isArray(r.visual_variants) ? r.visual_variants : [];
    var befunde = [];

    if (vertrag.requestType === VOLL) {
      if (!varianten.length) {
        befunde.push({ id: "missingVisual",
          message: "FULL_CREATIVE ohne visual_variants. Das Bild war der " +
            "halbe Auftrag." });
      }
    } else {
      /* TEXT_REVISION: ein fehlendes Bild ist KEIN Fehler. */
      if (varianten.length) {
        befunde.push({ id: "unexpectedVisual",
          message: "TEXT_REVISION mit " + varianten.length + " neuen " +
            "visual_variants, obwohl regeneration_allowed = false. Das ist " +
            "der Vertragsbruch, nicht das Fehlen eines Bildes: es kostet " +
            "eine begrenzte Ressource und macht die Textwirkung " +
            "unmessbar." });
      }
      if (r.visual_resolution !== "INHERITED") {
        befunde.push({ id: "missingResolution",
          message: "TEXT_REVISION verlangt visual_resolution = INHERITED. " +
            "Ohne diese Angabe steht im Ergebnis nicht, WELCHES Bild gilt." });
      }
      var geerbt = r.inherited_visual || {};
      var variante = geerbtesFeld(geerbt, "visual_variant_id");
      var hash = geerbtesFeld(geerbt, "asset_sha256");
      if (variante === WIDERSPRUCH || hash === WIDERSPRUCH) {
        befunde.push({ id: "inheritedFieldConflict",
          message: "Das Ergebnis nennt dasselbe Feld zweimal und " +
            "verschieden. Toleriert werden die NAMEN, nie die WERTE: ein " +
            "Widerspruch ist ein Befund und keine Auswahl." });
      }
      if (variante !== vertrag.inheritance.source_visual_variant_id) {
        befunde.push({ id: "wrongInheritedVariant",
          message: "Das Ergebnis nennt eine andere Bildvariante als der " +
            "Auftrag. Ein stiller Austausch ist schlimmer als ein " +
            "fehlendes Bild - er sieht richtig aus." });
      }
      if (hash !== vertrag.inheritance.source_asset_sha256) {
        befunde.push({ id: "wrongInheritedAsset",
          message: "Der Hash im Ergebnis ist nicht der aus dem Auftrag." });
      }
    }

    /* Gilt fuer beide Arten. */
    if (r.selected_hook !== undefined && r.selected_hook !== null) {
      befunde.push({ id: "canonicalSelection",
        message: "Die kanonische Auswahl trifft Vision Universe, nicht der " +
          "Agent." });
    }
    if (r.publishing_allowed === true) {
      befunde.push({ id: "publishingClaimed",
        message: "publishing_allowed muss false sein." });
    }

    return {
      ok: befunde.length === 0,
      requestType: vertrag.requestType,
      visualResolution: vertrag.requestType === TEXT ? "INHERITED" : "GENERATED",
      findings: befunde,
      /* Ausdruecklich: ein Vertragsverstoss ist kein Inhaltsurteil. Er
         sagt ueber Hook, Evidenz oder Bildstrategie nichts. */
      contentJudgement: false,
      explanation: befunde.length === 0
        ? vertrag.requestType + " erfuellt."
        : befunde.map(function (b) { return b.id + ": " + b.message; }).join(" ")
    };
  }

  /**
   * Die Vererbungsangabe aus einem verifizierten Quell-Asset.
   *
   * An einer Stelle gebaut, damit Auftrag und Pruefung dieselben Felder
   * meinen - zwei Abschriften waeren zwei Wahrheiten.
   */
  /* -------------------------------------------------------------------
     ZWEI SCHREIBWEISEN FUER DIESELBE SACHE

     Der Auftrag nennt die Erbfelder `source_*`, weil er aus der Sicht
     der Quelle geschrieben ist. Ein Ergebnis darf den Block genauso
     zurueckgeben oder flach benennen - beides ist redlich gemeint, und
     das erste echte Ergebnis kam in der `source_*`-Form zurueck.

     Wer nur eine Form kennt, liest `undefined` und weist das RICHTIGE
     Ergebnis zurueck. Genau das ist hier passiert: der Vertrag meldete
     einen stillen Austausch, wo keiner war, der Zyklus fiel auf den
     Vorlagen-Autor zurueck - und der Kandidat trug wieder den alten
     Report-Text. Ein Pruefer, der korrektes Material ablehnt, richtet
     mehr an als gar keiner: er begruendet den Rueckfall auch noch.

     Toleriert werden die NAMEN, nie die WERTE. Stehen beide da und
     widersprechen sich, kommt WIDERSPRUCH zurueck - ein Wert, der
     keinem Vergleich standhaelt, damit der Fall zufaellt statt sich
     fuer eine der beiden Angaben zu entscheiden.
     ------------------------------------------------------------------- */
  var WIDERSPRUCH = { widerspruch: true };

  function geerbtesFeld(geerbt, flach) {
    geerbt = geerbt || {};
    var a = geerbt[flach];
    var b = geerbt["source_" + flach];
    var leerA = a === undefined || a === null || a === "";
    var leerB = b === undefined || b === null || b === "";
    if (!leerA && !leerB && a !== b) return WIDERSPRUCH;
    return leerA ? b : a;
  }

  function inheritanceFrom(spec) {
    spec = spec || {};
    return {
      mode: ERBEN,
      regeneration_allowed: false,
      source_content_id: spec.contentId || null,
      source_candidate_id: spec.candidateId || null,
      source_visual_variant_id: spec.visualVariantId || null,
      source_asset_reference: spec.assetReference || null,
      source_asset_sha256: spec.sha256 || null,
      source_byte_size: spec.byteSize === undefined ? null : spec.byteSize,
      source_mime_type: spec.mime || null,
      source_width: spec.width || null,
      source_height: spec.height || null,
      source_verification: spec.verification || null
    };
  }

  var api = {
    FULL_CREATIVE: VOLL, TEXT_REVISION: TEXT, TYPEN: TYPEN,
    INHERIT_VERIFIED_ASSET: ERBEN, GENERATE_NEW_ASSET: ERZEUGEN,
    ERBFELDER: ERBFELDER,
    WIDERSPRUCH: WIDERSPRUCH,
    geerbtesFeld: geerbtesFeld,
    validateRequest: validateRequest,
    validateResult: validateResult,
    inheritanceFrom: inheritanceFrom
  };

  if (isNode) module.exports = api;
  else global.VUSocialCreativeContract = api;
})(typeof window !== "undefined" ? window : globalThis);
