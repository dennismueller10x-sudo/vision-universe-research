/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/asset-delivery.js

   KOMMT DAS BILD DORT AN, WO META ES ABHOLEN MUSS?

   -------------------------------------------------------------------------
   DER BEFUND, AUS DEM DIESE DATEI ENTSTANDEN IST
   -------------------------------------------------------------------------

   Im Approval Center stand ein wartender Beitrag mit einer kaputten
   Bildflaeche. Die Ursachenkette, dependency-correct verfolgt:

     1. run-social-cycle.mjs baut die Adresse aus der Paketkennung.
        Der Kommentar dort sagt es selbst: "Die Adresse, unter der das
        Bild oeffentlich WAERE." Konjunktiv. Niemand hat je gefragt,
        ob dort etwas liegt.

     2. render-asset.mjs schreibt die Datei nach assets/social/.

     3. Der Orchestrator-Workflow schreibt fest: `git add social/data/`.

     4. assets/social/ liegt NICHT unter social/data/. Das gerenderte
        Bild wird mit dem Runner weggeworfen.

     5. Der Kandidat mit der Adresse wird committet. Die Adresse zeigt
        auf eine Datei, die es nie gegeben hat.

   `git log --all -- assets/social/pkg_ca25cb404ae49dc4.jpg` ist leer.

   Und der Teil, der daraus mehr macht als ein vergessenes Verzeichnis:
   production-readiness.mjs ERZWINGT die enge Regel. Der Waechter ist an
   der falschen Grenze gebaut - "nur social/data" statt "niemals die
   Schalter" - und deshalb war das Wegwerfen jedes gerenderten Bildes
   eine ERFUELLTE Invariante.

   Die dreizehn Bilder, die im Repository liegen, stammen allesamt aus
   Sitzungs-Commits frueherer Auftraege. Der autonome Scheduler hat noch
   nie ein funktionierendes Bild geliefert.

   -------------------------------------------------------------------------
   WAS DIESE DATEI PRUEFT UND WAS NICHT
   -------------------------------------------------------------------------

   NICHT die Bytes. Das tut asset-integrity.js seit dem Bildproof, und
   ein zweiter Byte-Pruefer waere ein zweiter Begriff von "heiles Bild".

   Sondern den TRANSPORT: ist unter der Adresse, die im Kandidaten
   steht, wirklich dieses Bild abholbar? Das ist eine andere Frage, und
   sie wird erst dann gestellt, wenn jemand sie stellt.

   -------------------------------------------------------------------------
   DREI ZUSTAENDE, UND DER MITTLERE IST DER WICHTIGE
   -------------------------------------------------------------------------

     ERREICHBAR      geprueft, und es liegt dort
     NICHT_ERREICHBAR geprueft, und es liegt dort nicht
     UNGEPRUEFT      niemand konnte fragen

   Der dritte ist nicht der zweite. Aus einer Umgebung ohne Netz "nicht
   erreichbar" zu melden waere eine Aussage ueber den Weg dorthin, nicht
   ueber das Bild. Beide blockieren die Freigabe - aber sie sagen
   verschiedene Dinge, und der Owner liest verschiedene Saetze.

   -------------------------------------------------------------------------
   WER HAT GEANTWORTET?
   -------------------------------------------------------------------------

   Diese Frage steht hier, weil sie in §45 und §49 dreimal falsch
   beantwortet wurde: ein 403 des Egress-Proxy sah aus wie ein 403 des
   Owner-Tors, und der Bericht meldete "das Tor haelt".

   Eine Antwort zaehlt nur, wenn sie von der ANGEFRAGTEN Adresse kommt.
   Ein Proxy, der dazwischenfunkt, erzeugt UNGEPRUEFT - nicht
   NICHT_ERREICHBAR und schon gar nicht ERREICHBAR.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var Integritaet = isNode ? require("./asset-integrity.js")
                           : global.VUSocialAssetIntegrity;

  var ZUSTAND = {
    ERREICHBAR: "ASSET_PUBLICLY_REACHABLE",
    NICHT_ERREICHBAR: "ASSET_NOT_REACHABLE",
    UNGEPRUEFT: "ASSET_REACHABILITY_UNVERIFIED"
  };

  /* Die Gruende, aus denen ein Bild nicht ankommt. Jeder traegt seinen
     eigenen Namen: "kaputt" ist keine Diagnose, und wer nur einen Namen
     hat, kann spaeter nicht sagen, was sich geaendert hat. */
  var GRUND = {
    NICHT_GEFRAGT:      "NOT_ASKED",
    KEINE_ANTWORT:      "NO_RESPONSE",
    FREMDE_ANTWORT:     "ANSWERED_BY_INTERMEDIARY",
    NICHT_GEFUNDEN:     "HTTP_404",
    VERWEIGERT:         "HTTP_403",
    SERVERFEHLER:       "HTTP_5XX",
    ANDERER_STATUS:     "HTTP_OTHER",
    ANMELDUNG:          "REDIRECTED_TO_LOGIN",
    KEIN_BILD_TYP:      "CONTENT_TYPE_NOT_IMAGE",
    LEER:               "EMPTY_BODY",
    KEIN_BILD_INHALT:   "BYTES_NOT_AN_IMAGE",
    BESCHAEDIGT:        "IMAGE_BROKEN",
    FALSCHE_MASSE:      "UNEXPECTED_DIMENSIONS",
    ANDERES_ASSET:      "DIFFERENT_ASSET"
  };

  function textVon(v) { return v === undefined || v === null ? "" : String(v); }

  function kopf(antwort, name) {
    var h = (antwort && antwort.headers) || {};
    /* Header-Namen sind ohne Gross-/Kleinschreibung. Ein Pruefer, der
       nur "content-type" kennt, uebersieht "Content-Type". */
    var gesucht = String(name).toLowerCase();
    for (var k in h) {
      if (Object.prototype.hasOwnProperty.call(h, k) &&
          String(k).toLowerCase() === gesucht) return textVon(h[k]);
    }
    return "";
  }

  /**
   * Kam die Antwort von der Adresse, die gefragt wurde?
   *
   * Ein Egress-Proxy antwortet mit demselben HTTP-Status wie der echte
   * Dienst. Unterscheiden lassen sie sich am Host der Endadresse und an
   * dem, was im Koerper steht.
   */
  function vomZiel(antwort, erwarteteUrl) {
    var a = antwort || {};
    if (a.intermediary === true) return false;

    var ziel = textVon(a.finalUrl || erwarteteUrl);
    var soll = textVon(erwarteteUrl);
    if (!ziel || !soll) return true;   /* nichts zu vergleichen */

    function host(u) {
      var m = /^https?:\/\/([^/?#]+)/i.exec(u);
      return m ? m[1].toLowerCase() : "";
    }
    var hZiel = host(ziel), hSoll = host(soll);
    if (hZiel && hSoll && hZiel !== hSoll) return false;
    return true;
  }

  /* Ein Proxy, der einen Host nicht durchlaesst, sagt das im Klartext.
     Diese Saetze sind keine Antworten ueber das Bild. */
  var FREMDE_SAETZE = [
    /host not in allowlist/i,
    /egress .*(blocked|denied)/i,
    /proxy .*(denied|refused)/i,
    /CONNECT tunnel failed/i
  ];

  function riechtNachProxy(koerperText) {
    var t = textVon(koerperText).slice(0, 400);
    for (var i = 0; i < FREMDE_SAETZE.length; i += 1) {
      if (FREMDE_SAETZE[i].test(t)) return true;
    }
    return false;
  }

  /* -------------------------------------------------------------------
     WELCHER BYTE-MANGEL HEISST WAS

     Die Kennungen links vergibt asset-integrity.js. Sie stehen hier
     NICHT aus dem Gedaechtnis: der Test rechnet diese Liste gegen die
     Engine, und eine Kennung, die dort dazukommt und hier fehlt, faellt
     auf — statt still als "beschaedigt" durchzugehen.
     ------------------------------------------------------------------- */
  var ZU_GRUND = {
    unknownType:     "KEIN_BILD_INHALT",
    truncated:       "BESCHAEDIGT",
    structureBroken: "BESCHAEDIGT",
    mimeMismatch:    "KEIN_BILD_TYP",
    hashMismatch:    "ANDERES_ASSET",
    widthMismatch:   "FALSCHE_MASSE",
    heightMismatch:  "FALSCHE_MASSE",
    sizeMismatch:    "FALSCHE_MASSE"
  };

  function befund(zustand, grund, satz, extra) {
    var b = { zustand: zustand, grund: grund,
              erreichbar: zustand === ZUSTAND.ERREICHBAR, satz: satz };
    if (extra) for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) b[k] = extra[k];
    }
    return b;
  }

  /**
   * Das Urteil.
   *
   * @param eingabe {
   *   url         die Adresse, die im Kandidaten steht
   *   antwort     { status, headers, finalUrl, intermediary } oder null
   *   bytes       der Koerper als Uint8Array/Buffer oder null
   *   koerperText der Koerper als Text, falls kein Bild (fuer Diagnose)
   *   fehler      Fehlermeldung, falls die Anfrage gar nicht zustande kam
   *   erwartet    { sha256, width, height } aus dem Kandidaten, optional
   * }
   */
  function beurteile(eingabe) {
    var e = eingabe || {};
    var url = textVon(e.url);

    if (!url) {
      return befund(ZUSTAND.NICHT_ERREICHBAR, GRUND.NICHT_GEFRAGT,
        "Der Kandidat nennt keine Bildadresse. Ohne Adresse gibt es " +
        "nichts abzuholen.");
    }

    /* ---------------------------------------------- Gar nicht gefragt */
    if (!e.antwort && !e.fehler) {
      return befund(ZUSTAND.UNGEPRUEFT, GRUND.NICHT_GEFRAGT,
        "Die Adresse wurde nicht abgefragt. Ungeprueft ist nicht " +
        "erreichbar — und auch nicht unerreichbar.");
    }

    /* ------------------------------------------ Die Anfrage scheiterte */
    if (!e.antwort) {
      return befund(ZUSTAND.UNGEPRUEFT, GRUND.KEINE_ANTWORT,
        "Die Adresse war von hier aus nicht abfragbar (" +
        textVon(e.fehler).slice(0, 80) + "). Das ist eine Aussage ueber " +
        "den Weg dorthin, nicht ueber das Bild.");
    }

    var a = e.antwort;
    var status = Number(a.status);

    /* ------------------------------------- Wer hat eigentlich geantwortet?
       Dieselbe Frage wie beim Owner-Tor in §45. Sie steht VOR allen
       anderen, weil jede weitere Pruefung sonst eine Aussage ueber den
       Proxy waere. */
    if (!vomZiel(a, url) || riechtNachProxy(e.koerperText)) {
      return befund(ZUSTAND.UNGEPRUEFT, GRUND.FREMDE_ANTWORT,
        "Die Antwort kam nicht von " + url + ", sondern von etwas " +
        "dazwischen. Ein Proxy antwortet mit denselben Statuscodes wie " +
        "der echte Dienst; das hier ist keine Auskunft ueber das Bild.",
        { status: status });
    }

    /* -------------------------------------------- Umleitung zur Anmeldung */
    var ort = kopf(a, "location");
    if (status >= 300 && status < 400) {
      var zurAnmeldung = /login|signin|sign-in|auth/i.test(ort);
      return befund(ZUSTAND.NICHT_ERREICHBAR,
        zurAnmeldung ? GRUND.ANMELDUNG : GRUND.ANDERER_STATUS,
        zurAnmeldung
          ? "Die Adresse leitet auf eine Anmeldung um. Meta kann sich " +
            "nicht anmelden; ein Bild hinter einem Login ist kein " +
            "oeffentliches Bild."
          : "Die Adresse leitet um (" + status + " nach " + (ort || "?") +
            "), und am Ende steht kein Bild.",
        { status: status, location: ort });
    }

    /* ----------------------------------------------------- Der Status */
    if (status !== 200) {
      var g = status === 404 ? GRUND.NICHT_GEFUNDEN
            : status === 403 ? GRUND.VERWEIGERT
            : status >= 500 ? GRUND.SERVERFEHLER
            : GRUND.ANDERER_STATUS;
      var satz = status === 404
        ? "Unter dieser Adresse liegt nichts. Die Datei ist nie dort " +
          "angekommen, oder sie wurde entfernt."
        : status === 403
          ? "Die Adresse ist gesperrt. Meta bekaeme dasselbe zu sehen."
          : "Die Adresse antwortet mit " + status + ".";
      return befund(ZUSTAND.NICHT_ERREICHBAR, g, satz, { status: status });
    }

    /* ------------------------------------------------- Der Inhaltstyp */
    var typ = kopf(a, "content-type").split(";")[0].trim().toLowerCase();
    if (typ && typ.indexOf("image/") !== 0) {
      return befund(ZUSTAND.NICHT_ERREICHBAR, GRUND.KEIN_BILD_TYP,
        "Die Adresse antwortet mit " + status + ", liefert aber " +
        (typ || "keinen Bildtyp") + ". Ein 200 mit einer Fehlerseite ist " +
        "kein erreichbares Bild — und genau so sehen die meisten aus.",
        { status: status, contentType: typ });
    }

    /* ----------------------------------------------------- Die Bytes */
    var bytes = e.bytes;
    var laenge = bytes ? (bytes.length || bytes.byteLength || 0) : 0;
    if (!laenge) {
      return befund(ZUSTAND.NICHT_ERREICHBAR, GRUND.LEER,
        "Die Adresse antwortet, liefert aber keine Bytes.",
        { status: status, contentType: typ });
    }

    /* Die Bytes selbst beurteilt asset-integrity.js. Hier wird nur
       gefragt und weitergereicht — ein zweiter Byte-Pruefer waere ein
       zweiter Begriff von "heiles Bild". */
    /* -----------------------------------------------------------------
       DIE ERWARTUNG IN DIE SPRACHE DER BYTE-PRUEFUNG UEBERSETZEN

       asset-integrity.js heisst die Felder `asset_sha256` und
       `mime_type`. Beim ersten Anlauf stand hier `{ sha256, width,
       height }` durchgereicht — und `declared.asset_sha256` war damit
       undefined. Die Pruefung lief, verglich nichts und meldete ok.

       Ein absichtlich falscher Abdruck kam als ERREICHBAR durch.

       Das ist die gefaehrlichste Form des Fehlers, den dieses Projekt
       inzwischen gut kennt: keine falsche Antwort, sondern eine Frage,
       die nie gestellt wurde. Die Uebersetzung steht deshalb hier,
       benannt, und der Test schiebt einen falschen Abdruck durch. */
    var erw = e.erwartet || {};
    var pruefung = Integritaet.verify(bytes, {
      asset_sha256: erw.sha256 || erw.asset_sha256 || null,
      mime_type: erw.mimeType || erw.mime_type || null,
      width: erw.width || null,
      height: erw.height || null,
      bytes: erw.bytes || null
    });
    if (!pruefung.ok) {
      var erster = (pruefung.findings || [])[0] || {};
      /* Beim ersten Anlauf stand hier `dimensionMismatch` — eine
         Kennung, die asset-integrity.js gar nicht vergibt. Die echten
         heissen widthMismatch, heightMismatch, sizeMismatch,
         mimeMismatch. Ein von Hand abgeschriebenes Feld, das ein Feld
         verliert; AD-Test AB4 rechnet die Liste deshalb gegen die
         Engine und nicht gegen mein Gedaechtnis. */
      var grundZu = GRUND[ZU_GRUND[erster.id]] || GRUND.BESCHAEDIGT;
      return befund(ZUSTAND.NICHT_ERREICHBAR, grundZu,
        "Unter der Adresse liegt etwas, aber kein brauchbares Bild: " +
        (erster.message || "unbekannter Mangel") +
        " Meta wuerde denselben Fehler sehen.",
        { status: status, contentType: typ, bytes: laenge,
          findings: pruefung.findings });
    }

    /* ------------------------------------------------ Es liegt dort */
    var ist = pruefung.actual || {};
    return befund(ZUSTAND.ERREICHBAR, null,
      /* `verify` legt die gemessenen Werte unter `actual` ab, nicht
         flach. Auch das stand beim ersten Anlauf falsch hier und haette
         eine leere Klammer gedruckt. */
      "Unter " + url + " liegt ein gueltiges Bild (" + laenge + " Bytes, " +
      (typ || "Bildtyp ungenannt") +
      (ist.width && ist.height ? ", " + ist.width + "x" + ist.height : "") +
      ").",
      { status: status, contentType: typ, bytes: laenge,
        dimensions: (ist.width && ist.height)
          ? { width: ist.width, height: ist.height } : null,
        sha256: ist.asset_sha256 || null });
  }

  /**
   * Darf dieser Kandidat dem Owner zur Freigabe angeboten werden?
   *
   * Fail closed (§5): alles ausser ERREICHBAR haelt die Freigabe an.
   * Aber der Grund gehoert dazu - ein Transportfehler ist KEIN
   * inhaltlicher Mangel, und wer ihn als solchen protokolliert, lernt
   * etwas Falsches ueber Thema, Hook und Bildstrategie.
   */
  function freigabeMoeglich(befundOderZustand) {
    var b = (befundOderZustand && befundOderZustand.zustand)
      ? befundOderZustand : { zustand: befundOderZustand };
    return b.zustand === ZUSTAND.ERREICHBAR;
  }

  /**
   * Der Satz, den der Owner liest.
   *
   * Keine Codes, keine Feldnamen. Und ausdruecklich kein Wort darueber,
   * dass der Inhalt schlecht sei - er ist es nicht, das Bild kommt nur
   * nicht an.
   */
  function ownerSatz(b) {
    if (!b) return "Der Bildzustand ist unbekannt.";
    if (b.zustand === ZUSTAND.ERREICHBAR) return null;
    if (b.zustand === ZUSTAND.UNGEPRUEFT) {
      return "Ob das Bild erreichbar ist, liess sich gerade nicht " +
        "feststellen. Der Beitrag bleibt so lange zurueckgehalten.";
    }
    return "Das Bild ist derzeit nicht erreichbar. Der Beitrag kann noch " +
      "nicht freigegeben werden.";
  }

  /* -------------------------------------------------------------------
     EIN TRANSPORTFEHLER IST KEIN INHALTSFEHLER (§5)

     Diese Liste steht hier, damit das Lernen sie lesen kann statt sie
     zu erraten. Aus keinem dieser Gruende darf eine negative Aussage
     ueber Thema, Hook, Caption oder Bildstrategie entstehen.
     ------------------------------------------------------------------- */
  var NICHT_INHALTLICH = [
    GRUND.NICHT_GEFRAGT, GRUND.KEINE_ANTWORT, GRUND.FREMDE_ANTWORT,
    GRUND.NICHT_GEFUNDEN, GRUND.VERWEIGERT, GRUND.SERVERFEHLER,
    GRUND.ANDERER_STATUS, GRUND.ANMELDUNG, GRUND.KEIN_BILD_TYP,
    GRUND.LEER, GRUND.KEIN_BILD_INHALT, GRUND.BESCHAEDIGT,
    GRUND.FALSCHE_MASSE, GRUND.ANDERES_ASSET
  ];

  function istInhaltlicherMangel(grund) {
    return grund !== null && grund !== undefined &&
      NICHT_INHALTLICH.indexOf(grund) === -1;
  }

  var api = {
    ZUSTAND: ZUSTAND,
    GRUND: GRUND,
    NICHT_INHALTLICH: NICHT_INHALTLICH,
    ZU_GRUND: ZU_GRUND,
    beurteile: beurteile,
    freigabeMoeglich: freigabeMoeglich,
    ownerSatz: ownerSatz,
    istInhaltlicherMangel: istInhaltlicherMangel
  };

  if (isNode) module.exports = api;
  else global.VUSocialAssetDelivery = api;
})(typeof window !== "undefined" ? window : globalThis);
