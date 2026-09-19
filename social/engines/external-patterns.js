/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/external-patterns.js

   WARUM KOENNTE DAS FUNKTIONIEREN?

   -------------------------------------------------------------------------
   NICHT: "KOPIERE DIESEN POST"
   -------------------------------------------------------------------------

   Aus einem fremden Beitrag wird hier ein ARCHETYP: stellt der Einstieg
   eine Frage, einen Gegensatz, eine Zahl, eine Korrektur? Der Text
   selbst geht in diese Funktion hinein und kommt nicht heraus.

   Was herauskommt, ist eine Beobachtung ueber eine FORM - und die
   gehoert niemandem.

   -------------------------------------------------------------------------
   KORRELATION IST KEINE URSACHE
   -------------------------------------------------------------------------

   Dass ein Archetyp bei anderen Interaktion hatte, sagt nicht, dass er
   sie verursacht hat, und schon gar nicht, dass er das bei uns taete.
   Jede Auswertung hier traegt deshalb `causalClaim: false` und wird
   erst durch ein eigenes Experiment zur Aussage.

   Eine externe Haeufung ist ein Faktor, kein Veroeffentlichungsrecht.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* Die Erkennung arbeitet auf der FORM des Einstiegs, nicht auf dem
     Thema. Ein Fragezeichen ist ein Fragezeichen, auf Deutsch wie auf
     Englisch. */
  var MUSTER = [
    { id: "QUESTION",      re: /\?|^(?:warum|wieso|weshalb|was|wie|wann|wer|welche)/i },
    { id: "MISCONCEPTION", re: /\b(?:mythos|irrtum|falsch|fehler|glaub(?:en|st)|denkst du|nicht was du)\b/i },
    { id: "WARNING",       re: /\b(?:achtung|vorsicht|warnung|finger weg|verlier|risiko)\b/i },
    { id: "HOW_TO",        re: /\b(?:so\s|schritt|anleitung|how to|tutorial|erklaert|erklärt)\b/i },
    { id: "LIST",          re: /^\s*\d+\s|(?:\b(?:\d+)\s+(?:gruende|gründe|dinge|aktien|tipps|fehler)\b)/i },
    { id: "CONTRAST",      re: /\b(?:aber|trotzdem|dennoch|obwohl|statt|vs\.?|gegen|unterschied)\b/i },
    { id: "REVEAL",        re: /\b(?:niemand|keiner|geheim|unbekannt|uebersehen|übersehen|kaum jemand)\b/i },
    { id: "NUMBER_FIRST",  re: /^\s*[+-]?\d/ }
  ];

  var STORY_MUSTER = [
    { id: "PROBLEM_SOLUTION", re: /\b(?:problem|loesung|lösung|deshalb|darum)\b/i },
    { id: "BEFORE_AFTER",     re: /\b(?:frueher|früher|damals|heute|inzwischen|seitdem)\b/i },
    { id: "PERSONAL",         re: /\b(?:ich|mein|mir|wir haben)\b/i },
    { id: "DATA_LED",         re: /\d+\s*(?:%|prozent|mrd|mio|euro|dollar)/i }
  ];

  var FORMAT_AUS_MEDIENTYP = {
    IMAGE: "SINGLE_IMAGE",
    VIDEO: "SHORT_VIDEO",
    CAROUSEL_ALBUM: "CAROUSEL"
  };

  /* Nur die ersten Zeichen: der Einstieg entscheidet, ob jemand
     weiterliest - der Rest der Caption ist eine andere Frage. */
  var EINSTIEG_ZEICHEN = 120;

  function einstieg(text) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, EINSTIEG_ZEICHEN);
  }

  /**
   * Der Archetyp eines Einstiegs.
   *
   * Gibt NUR eine Kennung zurueck. Der Text bleibt hier.
   */
  function hookArchetype(caption) {
    var e = einstieg(caption);
    if (!e) return null;
    for (var i = 0; i < MUSTER.length; i++) {
      if (MUSTER[i].re.test(e)) return MUSTER[i].id;
    }
    return null;
  }

  function storyPattern(caption) {
    var t = String(caption || "");
    if (!t) return null;
    for (var i = 0; i < STORY_MUSTER.length; i++) {
      if (STORY_MUSTER[i].re.test(t)) return STORY_MUSTER[i].id;
    }
    return null;
  }

  /**
   * Aus einem Medium wird ein Muster.
   *
   * Der einzige Ort im System, an dem eine fremde Caption gelesen wird.
   * Was zurueckkommt, enthaelt keinen Buchstaben davon.
   */
  function ausMedium(m) {
    m = m || {};
    return {
      hookArchetype: hookArchetype(m.caption),
      formatPattern: FORMAT_AUS_MEDIENTYP[m.media_type] || null,
      /* Ohne Bildanalyse laesst sich das Bildmuster nicht bestimmen.
         Es zu raten waere schlimmer als es offenzulassen. */
      visualPattern: null,
      storyPattern: storyPattern(m.caption),
      /* Absolute Zahlen fremder Kanaele sagen ueber unseren nichts.
         Das Verhaeltnis Kommentare zu Likes dagegen ist eine Form-
         eigenschaft: es misst, wie sehr ein Beitrag zum Antworten
         bringt, unabhaengig von der Kanalgroesse. */
      engagementRelative: (typeof m.like_count === "number" &&
        typeof m.comments_count === "number" && m.like_count > 0)
        ? Math.round((m.comments_count / m.like_count) * 1000) / 1000
        : null
    };
  }

  /**
   * Was sich ueber einen Archetyp sagen laesst - und was nicht.
   *
   * Gibt HAEUFIGKEITEN zurueck, keine Empfehlungen. Aus "kam oft vor"
   * folgt nicht "wirkt", und aus "wirkte dort" nicht "wirkt hier".
   */
  function auswerten(beobachtungen, options) {
    options = options || {};
    var minStichprobe = options.minimumSample === undefined ? 10 : options.minimumSample;
    var nach = {};
    (beobachtungen || []).forEach(function (o) {
      var a = o.hookArchetype;
      if (!a) return;
      nach[a] = nach[a] || { archetype: a, count: 0, engagement: [] };
      nach[a].count += 1;
      if (typeof o.engagementRelative === "number") {
        nach[a].engagement.push(o.engagementRelative);
      }
    });

    var zeilen = Object.keys(nach).map(function (a) {
      var e = nach[a];
      var median = null;
      if (e.engagement.length) {
        var s = e.engagement.slice().sort(function (x, y) { return x - y; });
        median = s[Math.floor(s.length / 2)];
      }
      return {
        archetype: a, observations: e.count,
        medianCommentRatio: median,
        /* Unter der Mindeststichprobe wird NICHTS ausgesagt. Bei n=3
           ist ein Median eine Anekdote mit Nachkommastellen. */
        interpretable: e.count >= minStichprobe,
        note: e.count >= minStichprobe ? null
          : "Nur " + e.count + " Beobachtungen; ab " + minStichprobe +
            " wird daraus eine Aussage."
      };
    }).sort(function (a, b) { return b.observations - a.observations; });

    return {
      archetypes: zeilen,
      totalObservations: (beobachtungen || []).length,
      /* Woertlich, weil die Verwechslung teuer waere. */
      causalClaim: false,
      predictsOwnPerformance: false,
      explanation: zeilen.length
        ? zeilen.length + " Archetypen beobachtet. Haeufigkeit ist keine " +
          "Wirkung, und fremde Wirkung ist nicht unsere."
        : "Keine Beobachtungen - das ist die Abwesenheit einer Messung, " +
          "kein Befund ueber fremde Muster."
    };
  }

  var api = {
    MUSTER: MUSTER,
    STORY_MUSTER: STORY_MUSTER,
    EINSTIEG_ZEICHEN: EINSTIEG_ZEICHEN,
    hookArchetype: hookArchetype,
    storyPattern: storyPattern,
    ausMedium: ausMedium,
    auswerten: auswerten
  };

  if (isNode) module.exports = api;
  else global.VUSocialExternalPatterns = api;
})(typeof window !== "undefined" ? window : globalThis);
