/* =========================================================================
   VISION UNIVERSE SOCIAL — Autor: Vorlage (deterministisch)

   -------------------------------------------------------------------------
   WAS ER IST — UND WAS ER NICHT MEHR IST
   -------------------------------------------------------------------------

   Er war eine einzige Vorlage: ein Hook-Satz, ein Caption-Absatz,
   immer derselbe Bau. Damit lief die Pipeline durch, und mehr war nicht
   beabsichtigt.

   Der Owner hat den Befund benannt: die Content-Schicht ist hinter der
   uebrigen Intelligence zurueckgeblieben. Dieser Autor bleibt die
   Rueckfallebene und das CI-Fixture — aber eine Rueckfallebene, die
   nichts kann, ist keine.

   Er erzeugt deshalb jetzt VARIANTEN nach benannten Mustern. Jedes
   Muster hat eine Kennung, und die reist mit: ohne sie laesst sich
   spaeter lernen, DASS etwas gewirkt hat, aber nicht WAS.

   -------------------------------------------------------------------------
   DIE GRENZE BLEIBT DIE GLEICHE
   -------------------------------------------------------------------------

   Er sieht nur den Brief. Jede Zahl in jedem Satz stammt aus einem
   Beleg; er rechnet nichts aus, vergleicht nichts und schliesst auf
   nichts. Was der Brief unter `mustNotClaim` fuehrt, kommt in keinem
   Muster vor — das ist hier keine Selbstbeschraenkung, sondern die
   Bauweise: die Muster kennen nur Platzhalter fuer Belegwerte.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Authoring = isNode ? require("../../../engines/authoring.js") : global.VUSocialAuthoring;

  /* Ein Wert in der Form, in der er im Text steht. */
  function wert(e) {
    return String(e.value) + (e.unit ? " " + e.unit : "");
  }

  function wer(e, brief) {
    return e.entity || brief.topic || "der Titel";
  }

  /* -------------------------------------------------------------------
     DIE HOOK-MUSTER

     Jedes nennt, was es tut, und keines verspricht etwas, das der Text
     nicht einloest. Die frueher verwendete Frage "Warum bewegt sich X
     gerade?" steht hier nicht mehr: sie verspricht eine Erklaerung, und
     ein Stand ist keine.
     ------------------------------------------------------------------- */
  var HOOK_PATTERNS = [
    { id: "value-first",
      note: "Zahl zuerst. Im Feed sieht man sie vor dem Satz.",
      build: function (e, brief) { return wert(e) + " — " + wer(e, brief) + ", " + e.metric + "."; } },

    { id: "subject-first",
      note: "Gegenstand zuerst. Wer den Titel kennt, bleibt haengen.",
      build: function (e, brief) { return wer(e, brief) + ": " + wert(e) + " im " + e.metric + "."; } },

    { id: "metric-frame",
      note: "Die Kennzahl als Rahmen. Fuer Leser, die die Zahl einordnen wollen.",
      build: function (e, brief) {
        return e.metric + ", Stand heute: " + wer(e, brief) + " bei " + wert(e) + ".";
      } },

    { id: "limit-first",
      note: "Die Grenze der Aussage zuerst. Ungewoehnlich, und genau deshalb " +
            "unterscheidbar von jedem anderen Finanzkonto.",
      build: function (e, brief) {
        return "Was diese Zahl nicht sagt: " + wer(e, brief) + ", " + wert(e) + " im " +
               e.metric + ".";
      } }
  ];

  /* -------------------------------------------------------------------
     DIE CAPTION-MUSTER

     Alle drei sagen dasselbe Belegte in anderer Reihenfolge und mit
     anderem Schwerpunkt. Keines fuegt eine Aussage hinzu.
     ------------------------------------------------------------------- */
  var CAPTION_PATTERNS = [
    { id: "state-limit-reason",
      note: "Stand, Grenze, Begruendung fuers Zeigen.",
      build: function (e, brief) {
        return "Unsere technische Auswertung bewertet " + wer(e, brief) + " derzeit mit " +
          wert(e) + " im " + e.metric + ". " +
          "Der Wert beschreibt die aktuelle Lage — nicht ihre Ursache und nicht, " +
          "was als Naechstes passiert. " +
          "Wir zeigen ihn, weil eine nachvollziehbare Zahl mehr wert ist als eine " +
          "Einschaetzung ohne Grundlage.";
      } },

    { id: "method-first",
      note: "Erst das Verfahren, dann die Zahl. Fuer ein Publikum, das " +
            "wissen will, woher etwas kommt.",
      build: function (e, brief) {
        return "Wir bewerten Titel nach einem festen Verfahren und veroeffentlichen " +
          "das Ergebnis unveraendert — auch wenn es unspektakulaer ausfaellt. " +
          "Fuer " + wer(e, brief) + " steht der " + e.metric + " aktuell bei " + wert(e) + ". " +
          "Was daraus folgt, entscheidet niemand hier fuer Sie.";
      } },

    { id: "limit-first",
      note: "Die Grenze zuerst. Nimmt dem Leser die falsche Erwartung ab, " +
            "bevor er sie aufbaut.",
      build: function (e, brief) {
        return "Diese Zahl sagt nicht, was " + wer(e, brief) + " als Naechstes tut. " +
          "Sie sagt, wie die Lage heute aussieht: " + e.metric + " bei " + wert(e) + ", " +
          "erhoben nach einem Verfahren, das fuer jeden Titel dasselbe ist. " +
          "Mehr behaupten wir nicht, und weniger auch nicht.";
      } }
  ];

  /* Die Zeile im BILD. Kurz, und nie eine Wiederholung dessen, was die
     Karte ohnehin zeigt. */
  var VISUAL_PATTERNS = [
    { id: "limit", build: function () { return "Lagebeschreibung, keine Prognose."; } },
    { id: "method", build: function () { return "Gleiches Verfahren fuer jeden Titel."; } },
    { id: "plain", build: function (e) { return "Stand " + (e.observedAt || "heute").slice(0, 10) + "."; } }
  ];

  function createTemplateAuthor(options) {
    options = options || {};

    return {
      authorId: "template",
      kind: "deterministic",
      capabilities: {
        variants: HOOK_PATTERNS.length,
        hooks: true, captions: true, visualLines: true, structure: false,
        /* Er kostet nichts und braucht nichts. Das ist sein Zweck. */
        requiresNetwork: false, requiresCredentials: false
      },

      available: function () {
        return { ok: true, reason: null };
      },

      write: function (brief, opts) {
        opts = opts || {};
        var e = (brief.evidence || [])[0];
        if (!e) {
          return { variants: [], reason: "Kein Beleg im Brief. Ohne Beleg kein Satz." };
        }

        var wieViele = Math.min(
          Number(opts.variants) || HOOK_PATTERNS.length, HOOK_PATTERNS.length);

        var hinweis = brief.constraints && brief.constraints.disclaimer;
        var varianten = [];

        for (var i = 0; i < wieViele; i += 1) {
          var h = HOOK_PATTERNS[i % HOOK_PATTERNS.length];
          var c = CAPTION_PATTERNS[i % CAPTION_PATTERNS.length];
          var v = VISUAL_PATTERNS[i % VISUAL_PATTERNS.length];

          var caption = c.build(e, brief);
          if (hinweis) caption += " " + hinweis;

          varianten.push(Authoring.variant({
            authorId: "template",
            kind: "deterministic",
            hook: h.build(e, brief),
            caption: caption,
            visualLine: v.build(e, brief),
            cta: options.cta || null,
            hashtags: options.hashtags || ["VisionUniverse", "Investment", "Daten"],
            pattern: h.id + "/" + c.id,
            /* Beide Belege: der Wert UND die Bezeichnung. Die Bezeichnung
               allein kann schon eine Aussage sein. */
            claims: [
              { text: wert(e), numeric: e.value, source: { source: e.source,
                entity: e.entity, metric: e.metric, observedAt: e.observedAt,
                state: e.state || "VERIFIED" } },
              { text: String(e.metric), numeric: null, source: { source: e.source,
                entity: e.entity, metric: e.metric, observedAt: e.observedAt,
                state: e.state || "VERIFIED" } }
            ],
            notes: h.note
          }));
        }

        return { variants: varianten, reason: null };
      }
    };
  }

  var api = {
    HOOK_PATTERNS: HOOK_PATTERNS.map(function (p) { return p.id; }),
    CAPTION_PATTERNS: CAPTION_PATTERNS.map(function (p) { return p.id; }),
    VISUAL_PATTERNS: VISUAL_PATTERNS.map(function (p) { return p.id; }),
    createTemplateAuthor: createTemplateAuthor
  };

  if (isNode) module.exports = api;
  else global.VUSocialAuthorTemplate = api;
})(typeof window !== "undefined" ? window : globalThis);
