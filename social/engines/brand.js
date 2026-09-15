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

    BLOCKING_TERMS.forEach(function (t) {
      if (new RegExp(t.re.source, t.re.flags).test(all)) blocking.push({ id: t.id, message: t.message });
    });
    WARNING_TERMS.forEach(function (t) {
      if (new RegExp(t.re.source, t.re.flags).test(all)) warnings.push({ id: t.id, message: t.message });
    });

    /* Register. */
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
    HOOK_PROMISES.forEach(function (p) {
      if (!hook) return;
      if (!p.trigger.test(hook)) return;
      if (!p.fulfilled(body)) blocking.push({ id: "unfulfilled-" + p.id, message: p.message });
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
      metrics: { exclamations: exclamations, capsRun: caps, emoji: emoji,
                 hookLength: hook.length, captionLength: caption.length },
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

  var api = {
    LIMITS: LIMITS,
    BLOCKING_TERMS: BLOCKING_TERMS.map(function (t) { return t.id; }),
    WARNING_TERMS: WARNING_TERMS.map(function (t) { return t.id; }),
    HOOK_PROMISES: HOOK_PROMISES.map(function (p) { return p.id; }),
    ATLAS_ASSET_PATH: ATLAS_ASSET_PATH,
    ATLAS_TRANSFORMS: ATLAS_TRANSFORMS,
    check: check,
    checkAtlasUsage: checkAtlasUsage,
    maxCapsRun: maxCapsRun
  };

  if (isNode) module.exports = api;
  else global.VUSocialBrand = api;
})(typeof window !== "undefined" ? window : globalThis);
