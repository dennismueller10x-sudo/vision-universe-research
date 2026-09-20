/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/visual-quality.js

   EIN TECHNISCH KORREKTES BILD IST NOCH KEIN VEROEFFENTLICHUNGSWUERDIGES

   -------------------------------------------------------------------------
   DER BEFUND, DER DIESE DATEI AUSGELOEST HAT
   -------------------------------------------------------------------------

   Die erste gerenderte Karte war ein gueltiges JPEG in der richtigen
   Groesse mit der richtigen Schrift. Sie las sich so:

       76
       Technical Opportunity Score
       XOM: 76 im Technical Opportunity Score.

   Dreimal dasselbe. Technisch einwandfrei, inhaltlich leer. Der
   Renderer hatte keinen Begriff davon, dass eine Karte etwas SAGEN
   muss — er hatte nur einen Begriff davon, dass sie gezeichnet werden
   kann.

   -------------------------------------------------------------------------
   WAS HIER GEPRUEFT WIRD
   -------------------------------------------------------------------------

   Die Karte als Einheit aus Zahl, Bezeichnung, Gegenstand und Aussage:

     Redundanz     sagt eine Ebene, was eine andere schon sagt?
     Vollstaendigkeit  fehlt der Gegenstand, die Quelle, die Einordnung?
     Lesbarkeit    passt der Text in die Flaeche, die er bekommt?
     Eigenstaendigkeit  traegt die Aussage etwas bei, das die Zahl nicht
                   schon sagt?

   Alles davon ist zaehlbar. Die Frage "sieht das gut aus" bleibt offen
   und geht an einen Menschen — aber erst, nachdem das Zaehlbare stimmt.
   Das ist dieselbe Arbeitsteilung wie in brand.js, und sie ist hier
   dieselbe wert.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* Wieviel Text eine Flaeche vertraegt. Aus der Geometrie des
     Renderers: 1080 px Breite, 88 px Rand, die Aussage bei 58 px in
     hoechstens vier Zeilen. */
  var GRENZEN = {
    statementMaxChars: 120,
    statementMaxWords: 16,
    labelMaxChars: 48,
    entityMaxChars: 12,
    valueMaxChars: 12
  };

  function normalise(s) {
    return String(s === null || s === undefined ? "" : s)
      .toLowerCase().replace(/[^a-z0-9äöüß ]+/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  function words(s) { return normalise(s).split(" ").filter(Boolean); }

  /** Anteil der Woerter von a, die auch in b vorkommen. */
  function overlap(a, b) {
    var wa = words(a), wb = words(b);
    if (!wa.length || !wb.length) return 0;
    var setB = Object.create(null);
    wb.forEach(function (w) { setB[w] = true; });
    var treffer = wa.filter(function (w) { return setB[w]; }).length;
    return treffer / wa.length;
  }

  /**
   * Prueft eine Bildkomposition.
   *
   * @param plan.ebenen  { entitaet, zahl, zahlText, aussage, quelle }
   * @param options.hook der Hook des Beitrags — die Karte soll ihn nicht
   *                     wiederholen, sondern ergaenzen
   */
  /* -------------------------------------------------------------------
     EINE UNVOLLSTAENDIGE RICHTUNG IST EIN EIGENER FEHLER

     Sie ist kein Inhaltsfehler: der Text kann tadellos sein. Kein
     Providerfehler: es wurde noch gar nichts bestellt. Kein
     Bildfehler: es gibt noch kein Bild.

     Sie ist ein Befund ueber UNSERE Vorarbeit, und sie braucht ihren
     eigenen Namen. Unter CONTENT_FAILED gebucht wuerde das Lernen
     irgendwann glauben, ein Archetyp trage nicht - weil einmal eine
     Bildidee fehlte. Genau diese Verwechslung hat asset-store.js
     schon fuer den Transport verboten; hier gilt sie fuer die
     Richtung.
     ------------------------------------------------------------------- */
  var RICHTUNG_UNVOLLSTAENDIG = "VISUAL_DIRECTION_INCOMPLETE";

  var NIEMALS = ["CONTENT_FAILED", "PROVIDER_FAILED", "IMAGE_FAILED",
    "ASSET_TRANSPORT_INTEGRITY_FAILED", "VISUAL_CREATIVE_QUALITY_FAILED"];

  function check(plan, options) {
    options = options || {};
    var e = (plan && plan.ebenen) || {};
    var grenzen = Object.assign({}, GRENZEN, options.limits || {});

    var blocking = [];
    var warnings = [];

    /* ------------------------------------------ Richtung vor Flaeche
       Das Tor bleibt fail-closed: `directionReady` muss ausdruecklich
       true sein. Fehlt die Angabe, gilt sie als ungeprueft und nicht
       als bestanden - dieselbe Regel wie ueberall sonst. Wer eine
       Karte ohne Richtungspruefung bewerten will, sagt das mit
       `skipDirection: true` und hat es dann gesagt. */
    var richtungGeprueft = options.skipDirection === true ||
      options.directionReady === true;
    if (!richtungGeprueft) {
      blocking.push({ id: "direction-incomplete",
        failureType: RICHTUNG_UNVOLLSTAENDIG,
        message: "Die Creative Direction traegt nicht" +
          ((options.directionMissing || []).length
            ? " (fehlt: " + options.directionMissing.join(", ") + ")" : "") +
          ". Das ist ein Befund ueber die Vorarbeit, kein Inhalts-, " +
          "Provider- oder Bildfehler." });
    }

    /* ----------------------------------------------- Vollstaendigkeit */
    if (e.zahl && !e.zahlText) {
      blocking.push({ id: "number-without-label",
        message: "Eine Zahl ohne Bezeichnung sagt nicht, wovon sie die Zahl ist." });
    }
    if (e.zahl && !e.entitaet) {
      warnings.push({ id: "number-without-subject",
        message: "Die Karte zeigt eine Zahl ohne Gegenstand. Im Feed sieht man das " +
          "Bild vor dem Text." });
    }
    /* Die Quellenpflicht haengt an der ZAHL, nicht an der Karte. Eine
       typografische Aussage ohne Daten braucht keine Quelle — und die
       erste Fassung dieser Regel verwarf genau solche Karten. Der
       Begruendungssatz der Regel sagt es selbst: "eine Zahl in
       Markenoptik ohne Herkunft". */
    if (e.zahl && !e.quelle) {
      blocking.push({ id: "no-source",
        message: "Keine Quelle auf der Karte. Eine Zahl in Markenoptik ohne Herkunft " +
          "ist genau das, was das Provenance-Modell verhindern soll." });
    }
    if (!e.aussage) {
      blocking.push({ id: "no-statement",
        message: "Keine Aussage. Eine Karte, die nur eine Zahl zeigt, ist ein Screenshot." });
    }

    /* ---------------------------------------------------- Redundanz */
    var zahlImText = e.zahl ? normalise(e.aussage).indexOf(normalise(e.zahl)) !== -1 : false;
    if (zahlImText) {
      blocking.push({ id: "redundant-number",
        message: "Die Aussage wiederholt die Zahl, die darueber steht. " +
          "Dreimal dasselbe ist nicht dreimal so deutlich." });
    }

    if (e.zahlText && e.aussage) {
      var ueberschneidung = overlap(e.zahlText, e.aussage);
      if (ueberschneidung >= 0.6) {
        blocking.push({ id: "redundant-label",
          message: "Die Aussage wiederholt die Bezeichnung (" +
            Math.round(ueberschneidung * 100) + " % derselben Woerter)." });
      }
    }

    if (options.hook && e.aussage) {
      var mitHook = overlap(e.aussage, options.hook);
      if (mitHook >= 0.7) {
        warnings.push({ id: "redundant-hook",
          message: "Die Bildaussage wiederholt den Hook (" + Math.round(mitHook * 100) +
            " %). Bild und Text sollen zusammen mehr sagen als einzeln." });
      }
    }

    /* --------------------------------------------------- Lesbarkeit */
    if (e.aussage && String(e.aussage).length > grenzen.statementMaxChars) {
      blocking.push({ id: "statement-too-long",
        message: "Die Aussage hat " + String(e.aussage).length + " Zeichen; in die " +
          "Flaeche passen " + grenzen.statementMaxChars + "." });
    }
    if (e.aussage && words(e.aussage).length > grenzen.statementMaxWords) {
      warnings.push({ id: "statement-wordy",
        message: words(e.aussage).length + " Woerter. Eine Karte ist kein Absatz." });
    }
    if (e.zahlText && String(e.zahlText).length > grenzen.labelMaxChars) {
      warnings.push({ id: "label-too-long",
        message: "Die Bezeichnung ist mit " + String(e.zahlText).length +
          " Zeichen laenger als die Flaeche vertraegt." });
    }
    if (e.entitaet && String(e.entitaet).length > grenzen.entityMaxChars) {
      warnings.push({ id: "entity-too-long", message: "Der Gegenstand ist zu lang fuer " +
        "die Zeile ueber der Zahl." });
    }

    /* ---------------------------------------------- Eigenstaendigkeit */
    if (e.aussage && words(e.aussage).length <= 2) {
      warnings.push({ id: "statement-thin",
        message: "Zwei Woerter tragen selten eine Aussage." });
    }

    var abzug = blocking.length * 40 + warnings.length * 8;
    var score = Math.max(0, 100 - abzug);

    /* Der Fehlertyp des Laufs. Steht die Richtung nicht, heisst der
       Befund so und nicht anders - auch wenn die Flaeche zusaetzlich
       Maengel hat. Die Richtung kommt zuerst, also benennt sie den
       Fehler. */
    var richtungOffen = blocking.filter(function (b) {
      return b.failureType === RICHTUNG_UNVOLLSTAENDIG; }).length > 0;

    return {
      passed: blocking.length === 0,
      score: score,
      blocking: blocking,
      warnings: warnings,
      failureType: richtungOffen ? RICHTUNG_UNVOLLSTAENDIG
        : (blocking.length ? "VISUAL_LAYOUT_QUALITY_FAILED" : null),
      /* Woertlich, damit niemand spaeter einen dieser Namen einsetzt. */
      neverReportedAs: NIEMALS,
      explanation: blocking.length === 0
        ? "Bildwert " + score + (warnings.length ? "; " + warnings.length + " Hinweis(e)." : ".")
        : blocking.length + " blockierende(r) Befund(e): " +
          blocking.map(function (b) { return b.id; }).join(", ") + "."
    };
  }

  var api = { GRENZEN: GRENZEN, overlap: overlap, check: check,
    VISUAL_DIRECTION_INCOMPLETE: RICHTUNG_UNVOLLSTAENDIG, NIEMALS: NIEMALS };

  if (isNode) module.exports = api;
  else global.VUSocialVisualQuality = api;
})(typeof window !== "undefined" ? window : globalThis);
