/* =========================================================================
   VISION UNIVERSE SOCIAL — brand.js
   BRAND BRAIN (§11) UND ATLAS ALS KONTROLLIERTES ASSET (§12)

   Vision Universe ist modern, hochwertig, technologieorientiert,
   datenorientiert, verstaendlich, zukunftsgerichtet.

   DER SCHWIERIGE TEIL

   "Keine billigen Clickbait-Posts" und "Hooks duerfen stark sein" stehen
   im selben Auftrag — und das ist kein Widerspruch, sondern die eigentliche
   Aufgabe. Eine starke Hook ist erlaubt. Eine Hook, die der Text nicht
   einloest, ist es nicht.

   Deshalb prueft diese Datei nicht die Hook allein, sondern das VERHAELTNIS:
   Verspricht die Hook eine Zahl, eine Erklaerung, einen Vergleich — und
   liefert der Text sie? Ein Versprechen ohne Einloesung ist Clickbait, egal
   wie sachlich es formuliert ist.

   WAS HIER DETERMINISTISCH BLEIBT (§40)

   Register (Grossbuchstaben, Ausrufezeichen, Emoji-Dichte), verbotene
   Vokabeln, Laengen, Hook-Einloesung, Atlas-Regeln. Alles, was sich
   zaehlen laesst, wird gezaehlt. Die Frage "klingt das nach uns?" bleibt
   offen und geht an einen Menschen oder ein Modell — aber erst, nachdem
   das Zaehlbare stimmt.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var German = isNode ? require("./german-text.js") : global.VUSocialGermanText;

  /* Vokabular, das nicht in einen VU-Beitrag gehoert. Getrennt nach
     Schwere: `blocking` verhindert die Veroeffentlichung, `warning`
     senkt den Markenwert und wird berichtet. */
  var BLOCKING_TERMS = [
    { id: "casino", re: /\b(?:Zock(?:er|en)|All-?in|Jackpot|Lotto|Wette\s+des\s+Jahres)\b/gi,
      message: "Casino-Register" },
    { id: "shill", re: /\b(?:Geheimtipp|Insider-?Tipp|Nur\s+fuer\s+Eingeweihte|Niemand\s+redet\s+darueber)\b/gi,
      message: "Geheimtipp-Rhetorik" },
    { id: "moon", re: /\b(?:to\s+the\s+moon|Rakete|explodiert\s+gleich|geht\s+durch\s+die\s+Decke)\b/gi,
      message: "Moon-Rhetorik" },
    { id: "fear", re: /\b(?:Crash\s+kommt|Alles\s+verlieren|Totalverlust\s+droht)\b/gi,
      message: "Angstmache" }
  ];

  var WARNING_TERMS = [
    { id: "filler", re: /\b(?:in\s+der\s+heutigen\s+schnelllebigen|es\s+ist\s+wichtig\s+zu\s+verstehen|tauchen\s+wir\s+ein|lass\s+uns\s+eintauchen)\b/gi,
      message: "Austauschbare KI-Floskel" },
    { id: "empty-superlative", re: /\b(?:unglaublich|wahnsinnig|absolut\s+verrueckt|krass)\b/gi,
      message: "Leerer Superlativ" },
    { id: "vague-authority", re: /\b(?:Experten\s+sagen|man\s+munkelt|angeblich)\b/gi,
      message: "Unbestimmte Autoritaet" }
  ];

  /* Was eine Hook verspricht, und woran man die Einloesung erkennt. */
  var HOOK_PROMISES = [
    { id: "number",     trigger: /\b(?:wie\s+viel|wieviel|Zahl|Prozent|%|\d)/i,
      fulfilled: function (body) { return /\d/.test(body); },
      message: "Die Hook stellt eine Zahl in Aussicht, der Text enthaelt keine." },
    { id: "reason",     trigger: /\b(?:warum|weshalb|Grund|deshalb)\b/i,
      fulfilled: function (body) { return /\b(?:weil|denn|Grund|dadurch|deshalb|daher)\b/i.test(body); },
      message: "Die Hook fragt nach dem Warum, der Text gibt keine Begruendung." },
    { id: "comparison", trigger: /\b(?:vs\.?|gegen|im\s+Vergleich|Unterschied)\b/i,
      fulfilled: function (body) { return /\b(?:waehrend|dagegen|hingegen|im\s+Vergleich|vs\.?)\b/i.test(body); },
      message: "Die Hook kuendigt einen Vergleich an, der Text vergleicht nichts." },
    { id: "mechanism",  trigger: /\b(?:wie\s+funktioniert|so\s+funktioniert|Mechanik|steckt\s+dahinter)\b/i,
      fulfilled: function (body) { return body.length >= 200; },
      message: "Die Hook verspricht eine Erklaerung, der Text ist zu kurz, um eine zu geben." }
  ];

  /* Grenzwerte des Registers. Sie sind Konfiguration, nicht Geschmack —
     sie stehen hier, damit eine Aenderung eine Codeaenderung mit
     Begruendung ist. */
  var LIMITS = {
    maxExclamations: 1,
    maxConsecutiveCapsWords: 2,
    maxEmojiPerHundredChars: 2,
    minCaptionLength: 80,
    maxHookLength: 120,
    maxHashtags: 12
  };

  /* Emoji-Erkennung ohne Unicode-Property-Escapes: der Repository-Stil
     laeuft auch in aelteren Browser-Engines. */
  var EMOJI_SOURCE = "[\\u2190-\\u21FF\\u2300-\\u27BF\\u2B00-\\u2BFF]|\\uD83C[\\uDC00-\\uDFFF]|\\uD83D[\\uDC00-\\uDFFF]|\\uD83E[\\uDD00-\\uDFFF]";
  function emojiRe() { return new RegExp(EMOJI_SOURCE, "g"); }

  function countMatches(text, re) {
    var m = String(text || "").match(re);
    return m ? m.length : 0;
  }

  /** Aufeinanderfolgende Woerter in Grossbuchstaben (SCHREIEN). */
  function maxCapsRun(text) {
    var words = String(text || "").split(/\s+/);
    var run = 0, best = 0;
    words.forEach(function (w) {
      var letters = w.replace(/[^A-Za-zAEOUaeouss]/g, "");
      /* Kurze Kuerzel wie ETF, KGV, USA sind normal und zaehlen nicht. */
      if (letters.length >= 4 && letters === letters.toUpperCase()) { run++; best = Math.max(best, run); }
      else run = 0;
    });
    return best;
  }

  /* -------------------------------------------------------------------
     WAS AN EINEM TEXT LIEGT UND WAS AM BEITRAG

     Diese Pruefungen sind Eigenschaften EINES STUECKS TEXT: umschriebene
     Umlaute, verbotenes Vokabular, Ausrufezeichen, Grossbuchstaben,
     Emoji-Dichte. Sie gelten fuer einen Hook-Kandidaten genauso wie
     fuer einen fertigen Beitrag.

     Die uebrigen Regeln in check() sind es NICHT. Der Pflichthinweis
     bei Einzelwerten zum Beispiel ist eine Eigenschaft des
     veroeffentlichten Beitrags - ein Hook kann ihn gar nicht tragen,
     er hat dafuer keinen Platz und ist auch nicht der Ort dafuer.

     Die Trennung hat einen konkreten Anlass. Die Hook Engine prueft
     ihre Kandidaten gegen das Register und rief dafuer zuerst
     check(). Damit fiel ein voellig korrekter Kontrast-Hook durch -
     wegen eines fehlenden Hinweises, den er nie haette tragen
     koennen. Ein Tor an der falschen Grenze weist richtigen Text ab.
     ------------------------------------------------------------------- */
  function textRegister(text, options) {
    var limits = Object.assign({}, LIMITS, (options && options.limits) || options || {});
    var all = String(text || "");
    var blocking = [], warnings = [];

    var umschrieben = German.residue(all);
    if (umschrieben.length) {
      blocking.push({ id: "transliterated-umlauts",
        message: "Umschriebene Umlaute im veroeffentlichten Text: " +
          umschrieben.join(", ") +
          ". Der Quelltext darf ASCII sein, der Beitrag nicht." });
    }

    BLOCKING_TERMS.forEach(function (t) {
      if (new RegExp(t.re.source, t.re.flags).test(all)) blocking.push({ id: t.id, message: t.message });
    });
    WARNING_TERMS.forEach(function (t) {
      if (new RegExp(t.re.source, t.re.flags).test(all)) warnings.push({ id: t.id, message: t.message });
    });

    var exclamations = countMatches(all, /!/g);
    if (exclamations > limits.maxExclamations) {
      warnings.push({ id: "exclamations", message: exclamations + " Ausrufezeichen; erlaubt sind " + limits.maxExclamations + "." });
    }
    var caps = maxCapsRun(all);
    if (caps > limits.maxConsecutiveCapsWords) {
      warnings.push({ id: "caps", message: caps + " Woerter in Folge in Grossbuchstaben." });
    }
    var emoji = countMatches(all, emojiRe());
    var per100 = all.length > 0 ? (emoji / all.length) * 100 : 0;
    if (per100 > limits.maxEmojiPerHundredChars) {
      warnings.push({ id: "emoji", message: "Emoji-Dichte zu hoch (" + Math.round(per100 * 10) / 10 + " je 100 Zeichen)." });
    }

    return { blocking: blocking, warnings: warnings,
      ok: blocking.length === 0,
      /* Die gezaehlten Groessen reist mit: check() berichtet sie, und
         sie ein zweites Mal zu rechnen waere eine zweite Antwort auf
         dieselbe Frage. */
      metrics: { exclamations: exclamations, capsRun: caps, emoji: emoji } };
  }

  /* -------------------------------------------------------------------
     WELCHE VERSPRECHEN EINE HOOK MACHT UND WELCHE SIE EINLOEST

     Die Rechnung stand mitten in check(). Die Hook Engine (§9) muss
     dieselbe Frage stellen, bevor es ueberhaupt ein Paket gibt - sie
     bewertet Kandidaten und nicht fertige Beitraege.

     Sie bekommt deshalb hier eine eigene Funktion statt eine Kopie
     der Regeln drueben. HOOK_PROMISES bleibt, wo es steht: es gibt
     genau eine Liste davon, was eine Hook verspricht.
     ------------------------------------------------------------------- */
  function hookEinloesung(hook, body) {
    var h = String(hook || "");
    var b = String(body || "");
    var ausgeloest = [], offen = [];
    if (h) {
      HOOK_PROMISES.forEach(function (p) {
        if (!p.trigger.test(h)) return;
        ausgeloest.push({ id: p.id, message: p.message });
        if (!p.fulfilled(b)) offen.push({ id: p.id, message: p.message });
      });
    }
    return {
      ausgeloest: ausgeloest,
      offen: offen,
      eingeloest: ausgeloest.length - offen.length,
      ok: offen.length === 0
    };
  }

  /**
   * Prueft ein Content Package gegen das Brand Brain.
   *
   * @returns { passed, score (0..100), blocking[], warnings[], explanation }
   */
  function check(pkg, options) {
    options = options || {};
    var limits = Object.assign({}, LIMITS, options.limits || {});
    pkg = pkg || {};

    var hook = String(pkg.hook || "");
    var caption = String(pkg.caption || "");
    var body = [caption, String(pkg.thesis || "")].join("\n");
    var all = [hook, caption, String(pkg.thesis || ""), String(pkg.cta || "")].join("\n");

    var blocking = [];
    var warnings = [];

    /* -------------------------------------------------------------------
       DER PFLICHTHINWEIS BEI EINZELWERTEN

       Ein Beitrag, der ein einzelnes Wertpapier benennt UND ihm eine
       bewertende Zahl zuordnet, liest sich fuer ein Publikum wie eine
       Empfehlung — unabhaengig davon, wie sachlich er formuliert ist und
       unabhaengig davon, was er zu sein beansprucht.

       Das ist keine juristische Bewertung; die kann diese Datei nicht
       leisten und soll sie nicht. Es ist die vorsichtige Vorgabe: wo ein
       Name und eine Zahl zusammenkommen, steht der Hinweis dabei. Ihn
       wegzulassen ist dann eine Entscheidung, die jemand treffen muss —
       und nicht etwas, das man vergisst.

       Blockierend und nicht warnend, weil eine Warnung in einem
       automatischen Pfad niemanden erreicht. ------------------------- */
    var nenntEinzelwert = /(?:^|[\s(])[A-Z]{2,5}(?:[\s.,:;)]|$)/.test(all) ||
      /\b(?:Aktie|Wertpapier|Titel)\b/i.test(all);
    var hatBewertendeZahl = /\d/.test(caption);
    var hatHinweis = /keine\s+anlageberatung|keine\s+anlage-?\s*oder\s+steuerberatung|keine\s+empfehlung|nur\s+zu\s+informationszwecken/i.test(all);

    if (nenntEinzelwert && hatBewertendeZahl && !hatHinweis) {
      blocking.push({ id: "missing-disclaimer",
        message: "Der Beitrag nennt einen Einzelwert und ordnet ihm eine Zahl zu, " +
          "ohne Hinweis darauf, dass er keine Anlageberatung ist." });
    }

    /* -------------------------------------------------------------------
       UMSCHRIEBENE UMLAUTE

       Der Quelltext dieses Repositories ist ASCII, und das ist richtig:
       er laeuft durch Shells, Workflows und Editoren, deren Kodierung
       niemand garantiert.

       Der VEROEFFENTLICHTE Text ist etwas anderes. "Fuer jeden Titel"
       auf einem deutschen Markenkonto sieht aus, als haette es eine
       Maschine geschrieben, die kein Deutsch kann — und genau das waere
       es dann auch. Der erste gerenderte Kandidat trug es im Bild.

       Hier stand eine Wortliste: dreissig Formen, die wir kannten. Sie
       hat "traegt" nicht gekannt — und genau das kam aus den
       Quant-Daten in den ersten evidenzgestuetzten Entwurf. Eine
       Aufzaehlung faengt, was jemand daran gedacht hat einzutragen,
       und schweigt ueber alles andere. Bei einem Sperrgatter ist das
       die falsche Richtung von Unwissen.

       Geprueft wird jetzt der Rest: german-text.js meldet Woerter mit
       verdaechtigen Digraphen, die weder echtes Deutsch noch im
       Reparatur-Woerterbuch sind. Unbekanntes blockiert, statt
       durchzurutschen.
       ------------------------------------------------------------------- */
    var register = textRegister(all, limits);
    register.blocking.forEach(function (b) { blocking.push(b); });
    register.warnings.forEach(function (w) { warnings.push(w); });

    /* Laengen. */
    if (caption && caption.length < limits.minCaptionLength) {
      warnings.push({ id: "caption-short", message: "Die Bildunterschrift ist mit " + caption.length +
        " Zeichen zu kurz, um eine Hook einzuloesen." });
    }
    if (hook.length > limits.maxHookLength) {
      warnings.push({ id: "hook-long", message: "Die Hook ist mit " + hook.length + " Zeichen zu lang." });
    }
    if (Array.isArray(pkg.hashtags) && pkg.hashtags.length > limits.maxHashtags) {
      warnings.push({ id: "hashtags", message: pkg.hashtags.length + " Hashtags; mehr als " +
        limits.maxHashtags + " wirken wie Reichweitenjagd." });
    }

    /* DER KERN: Hook-Einloesung. Nicht eingeloeste Versprechen sind
       BLOCKIEREND, nicht nur eine Warnung — das ist die Grenze zwischen
       starker Hook und Clickbait (§11). */
    hookEinloesung(hook, body).offen.forEach(function (p) {
      blocking.push({ id: "unfulfilled-" + p.id, message: p.message });
    });

    /* Eine Hook ohne jeden Text ist keine Hook, sondern eine Ueberschrift. */
    if (hook && !caption) {
      blocking.push({ id: "hook-without-body", message: "Hook ohne Text. Die Hook muss eingeloest werden." });
    }

    /* Score: Start bei 100, Abzuege. Erklaerbar, keine Blackbox (§32). */
    var score = 100;
    blocking.forEach(function () { score -= 30; });
    warnings.forEach(function () { score -= 8; });
    score = Math.max(0, Math.min(100, score));

    return {
      passed: blocking.length === 0,
      score: score,
      blocking: blocking,
      warnings: warnings,
      metrics: Object.assign({}, register.metrics,
        { hookLength: hook.length, captionLength: caption.length }),
      explanation: blocking.length === 0 && warnings.length === 0
        ? "Der Beitrag entspricht dem Markenregister."
        : blocking.concat(warnings).map(function (x) { return x.message; }).join(" ")
    };
  }

  /* ------------------------------------------------------------------ */
  /* ATLAS (§12)                                                          */
  /* ------------------------------------------------------------------ */

  /* Atlas ist eine wiederkehrende Figur, kein Bildmotiv. Der Unterschied
     entscheidet ueber Wiedererkennung: eine Figur, die jedes Mal etwas
     anders aussieht, ist keine Figur.

     Deshalb der eine erlaubte Weg:

         Original-Asset -> Referenz -> kontrollierte Transformation

     und NICHT:

         Textprompt -> neue Atlas-Version

     Die Regel steht hier als Code, weil sie sonst im dritten Monat
     jemandem im Weg steht und "nur dieses eine Mal" umgangen wird. */
  var ATLAS_ASSET_PATH = "assets/atlas.png";

  var ATLAS_TRANSFORMS = ["crop", "scale", "recolor-background", "compose-with-chart",
                          "compose-with-typography", "reframe"];

  function checkAtlasUsage(spec) {
    spec = spec || {};
    var problems = [];

    if (!spec.referenceAsset) {
      problems.push("Kein Referenz-Asset angegeben. Atlas wird nie aus einem Textprompt neu erzeugt.");
    } else if (spec.referenceAsset !== ATLAS_ASSET_PATH && !spec.approvedVariant) {
      problems.push("Das Referenz-Asset ist weder das Original (" + ATLAS_ASSET_PATH +
                    ") noch eine freigegebene Variante.");
    }
    if (spec.generationMode === "text-to-image") {
      problems.push("text-to-image ist fuer Atlas ausgeschlossen. Erlaubt ist nur die Transformation " +
                    "eines vorhandenen Assets.");
    }
    (spec.transforms || []).forEach(function (t) {
      if (ATLAS_TRANSFORMS.indexOf(t) === -1) {
        problems.push("Unzulaessige Transformation '" + t + "'. Erlaubt: " + ATLAS_TRANSFORMS.join(", ") + ".");
      }
    });

    return {
      passed: problems.length === 0,
      problems: problems,
      explanation: problems.length === 0
        ? "Atlas wird aus dem Original-Asset abgeleitet."
        : problems.join(" ")
    };
  }

  /* -------------------------------------------------------------------
     DER LOGO-VERTRAG (§18)

     Atlas ist eine Figur; das Logo ist eine Signatur. Der Unterschied
     ist nicht kosmetisch: eine Figur darf sich bewegen, drehen, anders
     ausgeschnitten sein. Eine Signatur darf das nicht. Sie ist
     entweder korrekt oder falsch.

     Deshalb ist die Liste der erlaubten Transformationen hier kuerzer
     als bei Atlas - und sie enthaelt ausdruecklich KEIN Umfaerben,
     kein Drehen und kein freies Skalieren.

     -------------------------------------------------------------------
     WAS EIN GENERATIVES MODELL HIER NIEMALS TUN DARF
     -------------------------------------------------------------------

     Ein Bildmodell, das "VISION UNIVERSE" schreiben soll, schreibt
     frueher oder spaeter VISION UNIVERSE mit einem falschen Buchstaben,
     einem falschen Abstand oder einer falschen Punze. Das faellt auf
     einem Telefon nicht auf und auf einem Screenshot sehr wohl.

     §44 sagt es direkt: fuer kritische Typografie nicht darauf
     verlassen, dass ein Modell Text korrekt schreibt. Das Logo wird
     komponiert, nicht gemalt.

     -------------------------------------------------------------------
     WAS DIESE PRUEFUNG MISST UND WAS SIE NICHT KANN
     -------------------------------------------------------------------

     Sie rechnet an einer Beschreibung: Flaeche, Kasten, erklaerte
     Transformationen, gemessener Kontrast. Sie sieht keine Pixel.

     Der Kontrast ist deshalb eine UEBERGEBENE MESSUNG und keine
     Schaetzung. Fehlt er, ist das UNGEPRUEFT - und ungeprueft faellt
     durch. Ein Logo, von dem niemand weiss, ob es sich vom Hintergrund
     abhebt, ist genau der Fall, den §18 "mit dem Hintergrund
     verschmelzen" nennt.
     ------------------------------------------------------------------- */
  var LOGO_ASSET_PATH = "assets/vision-universe-logo.png";

  /* Das Original ist 2172x724. Das Verhaeltnis ist Teil der Marke:
     wer es aendert, hat ein anderes Logo. */
  var LOGO_SEITENVERHAELTNIS = 2172 / 724;

  /* Nur Platzieren und gleichmaessig Skalieren. Jede weitere
     Transformation veraendert die Signatur selbst.

     -------------------------------------------------------------------
     UND EINE DRITTE, ENG GEFASSTE
     -------------------------------------------------------------------

     Das kanonische Asset ist schwarz. Die VU-Karte ist schwarz. Ohne
     eine Umkehrung koennte die Marke auf ihrem eigenen Bild nicht
     erscheinen - und die Karte trug deshalb bis hierher die Worte
     "VISION UNIVERSE" als gesetzten Text. Das ist genau die
     textuelle Approximation, die §18 verbietet: dieselben Buchstaben
     in einer anderen Schrift sind ein anderes Zeichen.

     `invert-monochrome` ist deshalb erlaubt, und zwar so eng wie
     moeglich: sie taucht ein EINFARBIGES Zeichen um, schwarz zu
     weiss. Keine Geometrie, keine Proportion, kein Abstand, keine
     Punze aendert sich - nur die Helligkeit.

     Sie gilt NUR fuer ein monochromes Asset. Bei einem mehrfarbigen
     waere eine Umkehrung eine Umfaerbung, und die bleibt
     ausgeschlossen. `checkLogoUsage` verlangt dafuer die ausdrueckliche
     Angabe `monochrom: true` - eine fehlende Angabe ist keine
     Erlaubnis. */
  var LOGO_TRANSFORMS = ["scale-uniform", "place", "invert-monochrome"];

  var LOGO_REGELN = {
    /* -----------------------------------------------------------------
       DIE SCHUTZZONE MISST AN DER HOEHE, NICHT AN DER BREITE

       Der erste Entwurf nahm die halbe BREITE. Bei einem 3:1-Zeichen
       sind das anderthalb Logohoehen Abstand auf jeder Seite - eine
       Zahl, die kein Markenhandbuch verlangt und die jede sinnvolle
       Platzierung verbietet. Ein Tor, das alles sperrt, sperrt auch
       den Betrieb.

       Das uebliche und begruendbare Mass ist die eigene HOEHE. Fuer
       dieses Zeichen sind das rund ein Drittel seiner Breite. */
    schutzzoneHoehenAnteil: 1.0,
    /* Unter diesem Anteil der Flaechenbreite ist sie auf einem
       Telefon nicht mehr zu lesen. */
    mindestBreiteAnteil: 0.12,
    /* Ueber diesem Anteil ist sie kein Absender mehr, sondern das
       Motiv. */
    hoechstBreiteAnteil: 0.40,
    /* Abweichung vom Seitenverhaeltnis, ab der es Verzerrung ist. */
    verhaeltnisToleranz: 0.02,
    /* Kontrast nach WCAG. Unter 3:1 verschwimmt eine Wortmarke auf
       einem bewegten Hintergrund. */
    mindestKontrast: 3
  };

  function zahlOderNull(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Haelt dieses Visual den Logo-Vertrag ein?
   *
   * @param spec {
   *   referenceAsset   Pfad des benutzten Assets
   *   generationMode   "compose" | "text-to-image" | ...
   *   transforms       [String]
   *   canvas           { width, height }  Flaeche in Pixeln
   *   box              { x, y, width, height }  Lage der Signatur
   *   kontrast         gemessenes Kontrastverhaeltnis, oder null
   * }
   */
  function checkLogoUsage(spec) {
    spec = spec || {};
    var problems = [];

    /* 1. Das Original, und nichts anderes. Ein Logo hat keine
          "freigegebene Variante" - das waere ein zweites Logo. */
    if (!spec.referenceAsset) {
      problems.push("Kein Referenz-Asset angegeben. Das Logo wird nie " +
        "geschrieben, sondern komponiert.");
    } else if (spec.referenceAsset !== LOGO_ASSET_PATH) {
      problems.push("Das Referenz-Asset ist nicht das kanonische Logo (" +
        LOGO_ASSET_PATH + ").");
    }

    /* 2. Niemals gemalt. */
    if (spec.generationMode === "text-to-image") {
      problems.push("text-to-image ist fuer das Logo ausgeschlossen (§44). " +
        "Ein Bildmodell schreibt die Wortmarke frueher oder spaeter falsch, " +
        "und das faellt erst auf, wenn es oeffentlich steht.");
    }

    /* 3. Nur platzieren und gleichmaessig skalieren. */
    if ((spec.transforms || []).indexOf("invert-monochrome") !== -1 &&
        spec.monochrom !== true) {
      problems.push("invert-monochrome ist nur fuer ein einfarbiges Zeichen " +
        "erlaubt. Ohne die ausdrueckliche Angabe monochrom:true waere die " +
        "Umkehrung eine Umfaerbung - und die ist ausgeschlossen.");
    }
    (spec.transforms || []).forEach(function (t) {
      if (LOGO_TRANSFORMS.indexOf(t) === -1) {
        problems.push("Unzulaessige Transformation '" + t + "'. Am Logo " +
          "erlaubt: " + LOGO_TRANSFORMS.join(", ") + ".");
      }
    });

    var flaeche = spec.canvas || null;
    var kasten = spec.box || null;
    var fw = flaeche ? zahlOderNull(flaeche.width) : null;
    var fh = flaeche ? zahlOderNull(flaeche.height) : null;
    var bx = kasten ? zahlOderNull(kasten.x) : null;
    var by = kasten ? zahlOderNull(kasten.y) : null;
    var bw = kasten ? zahlOderNull(kasten.width) : null;
    var bh = kasten ? zahlOderNull(kasten.height) : null;

    if (fw === null || fh === null || bx === null || by === null ||
        bw === null || bh === null) {
      /* Ohne Lage laesst sich nichts pruefen - und "nicht pruefbar"
         ist kein Bestehen. */
      problems.push("Flaeche und Lage des Logos sind nicht vollstaendig " +
        "angegeben. Ohne sie laesst sich weder Verzerrung noch Schutzzone " +
        "noch Lesbarkeit pruefen.");
    } else {
      /* 4. Verzerrung: das Seitenverhaeltnis IST die Marke. */
      var verhaeltnis = bh > 0 ? bw / bh : 0;
      var abweichung = Math.abs(verhaeltnis - LOGO_SEITENVERHAELTNIS) /
        LOGO_SEITENVERHAELTNIS;
      if (abweichung > LOGO_REGELN.verhaeltnisToleranz) {
        problems.push("Das Logo ist verzerrt: " + verhaeltnis.toFixed(2) +
          ":1 statt " + LOGO_SEITENVERHAELTNIS.toFixed(2) + ":1.");
      }

      /* 5. Lesbarkeit und Groessenverhaeltnis. */
      var anteil = fw > 0 ? bw / fw : 0;
      if (anteil < LOGO_REGELN.mindestBreiteAnteil) {
        problems.push("Das Logo ist zu klein (" + (anteil * 100).toFixed(1) +
          " % der Breite, noetig " +
          (LOGO_REGELN.mindestBreiteAnteil * 100) + " %). Auf einem Telefon " +
          "ist es dann keine Signatur mehr, sondern ein Fleck.");
      }
      if (anteil > LOGO_REGELN.hoechstBreiteAnteil) {
        problems.push("Das Logo ist zu gross (" + (anteil * 100).toFixed(1) +
          " % der Breite). Ein Absender wird damit zum Motiv.");
      }

      /* 6. Schutzzone: die Signatur braucht Luft, sonst klebt sie. */
      var zone = bh * LOGO_REGELN.schutzzoneHoehenAnteil;
      var links = bx, oben = by;
      var rechts = fw - (bx + bw), unten = fh - (by + bh);
      if (links < zone || oben < zone || rechts < zone || unten < zone) {
        problems.push("Die Schutzzone ist verletzt: das Logo braucht " +
          Math.round(zone) + " px Abstand, hat aber links " +
          Math.round(links) + ", oben " + Math.round(oben) + ", rechts " +
          Math.round(rechts) + ", unten " + Math.round(unten) + ".");
      }
    }

    /* 7. Der Kontrast ist eine MESSUNG, keine Annahme. */
    var k = zahlOderNull(spec.kontrast);
    if (k === null) {
      problems.push("Der Kontrast des Logos zum Hintergrund wurde nicht " +
        "gemessen. Ungeprueft ist kein Bestehen: ein Logo, von dem niemand " +
        "weiss, ob es sich abhebt, ist der Fall aus §18.");
    } else if (k < LOGO_REGELN.mindestKontrast) {
      problems.push("Das Logo verschmilzt mit dem Hintergrund (Kontrast " +
        k.toFixed(1) + ":1, noetig " + LOGO_REGELN.mindestKontrast + ":1).");
    }

    return {
      passed: problems.length === 0,
      problems: problems,
      explanation: problems.length === 0
        ? "Das kanonische Logo steht unverzerrt, lesbar, mit Schutzzone und " +
          "gemessenem Kontrast."
        : problems.join(" ")
    };
  }

  /* -------------------------------------------------------------------
     DIE MARKENPASSUNG EINES THEMAS — OHNE TEXT

     Diese Funktion stand im Zyklus-Skript. Dort war sie nicht
     erreichbar: wer das Skript importiert, fuehrt den ganzen Lauf aus.
     Die Gelegenheitsbewertung haette sie also nachbauen muessen - und
     zwei Rechenwege fuer dieselbe Frage sind zwei Wahrheiten, von
     denen eine irgendwann falsch wird.

     Geprueft wird ein Thema, nicht ein fertiger Beitrag: Befunde, die
     nur fehlenden Text beanstanden, zaehlen deshalb nicht. Der Wert
     ist gedeckelt, weil ein Thema ohne Text nicht voll belegen kann,
     dass es im Markenregister liegt.
     ------------------------------------------------------------------- */
  function topicFit(topic, entities) {
    var probe = [topic].concat(entities || []).join(" ");
    var befund = check({ hook: "", caption: probe, thesis: "" });
    var blockierend = (befund.blocking || []).filter(function (b) {
      return b.id.indexOf("unfulfilled") !== 0 && b.id !== "hook-without-body";
    });
    if (blockierend.length > 0) return 0;
    return Math.min(0.9, befund.score / 100);
  }

  var api = {
    topicFit: topicFit,
    LIMITS: LIMITS,
    BLOCKING_TERMS: BLOCKING_TERMS.map(function (t) { return t.id; }),
    WARNING_TERMS: WARNING_TERMS.map(function (t) { return t.id; }),
    HOOK_PROMISES: HOOK_PROMISES.map(function (p) { return p.id; }),
    ATLAS_ASSET_PATH: ATLAS_ASSET_PATH,
    ATLAS_TRANSFORMS: ATLAS_TRANSFORMS,
    LOGO_ASSET_PATH: LOGO_ASSET_PATH,
    LOGO_TRANSFORMS: LOGO_TRANSFORMS,
    LOGO_REGELN: LOGO_REGELN,
    LOGO_SEITENVERHAELTNIS: LOGO_SEITENVERHAELTNIS,
    check: check,
    checkAtlasUsage: checkAtlasUsage,
    checkLogoUsage: checkLogoUsage,
    maxCapsRun: maxCapsRun,
    hookEinloesung: hookEinloesung,
    textRegister: textRegister
  };

  if (isNode) module.exports = api;
  else global.VUSocialBrand = api;
})(typeof window !== "undefined" ? window : globalThis);
