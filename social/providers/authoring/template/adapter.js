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

  /* -------------------------------------------------------------------
     UMLAUTE IM VEROEFFENTLICHTEN TEXT

     Der Quelltext dieses Repositories ist ASCII — aus gutem Grund: er
     laeuft durch Shells, Workflows und Editoren, deren Kodierung
     niemand garantiert.

     Der VEROEFFENTLICHTE Text ist etwas anderes. "Fuer jeden Titel" auf
     einem deutschen Markenkonto sieht aus, als haette es eine Maschine
     geschrieben, die kein Deutsch kann — und genau das waere es dann
     auch.

     Die Umlaute stehen deshalb als Escape-Sequenzen: die Datei bleibt
     ASCII, der Text wird deutsch. Beides zugleich, ohne Kompromiss.
     ------------------------------------------------------------------- */
  var AE = "\u00E4", OE = "\u00F6", UE = "\u00FC";
  var Ae = "\u00C4", Oe = "\u00D6", Ue = "\u00DC", SZ = "\u00DF";
  var STRICH = "\u2014";   /* Geviertstrich */

  var isNode = (typeof module !== "undefined" && module.exports);
  var Authoring = isNode ? require("../../../engines/authoring.js") : global.VUSocialAuthoring;

  /* Ein Wert in der Form, in der er im Text steht. */
  function wert(e) {
    return String(e.value) + (e.unit ? " " + e.unit : "");
  }

  /* -------------------------------------------------------------------
     DIE UEBRIGEN BELEGE

     Die erste Fassung nahm `evidence[0]` und liess den Rest liegen. Das
     war richtig, solange der Brief genau einen Beleg trug — und falsch,
     sobald er dreiundzwanzig traegt.

     Genommen wird, was die Engines fertig formuliert haben. Sie neu zu
     schreiben hiesse, eine zweite Lesart derselben Zahl zu erzeugen; sie
     wegzulassen hiesse, eine Karte mit einer Zahl darauf zu bauen,
     obwohl der Beleg danebenliegt.
     ------------------------------------------------------------------- */
  function belegsaetze(brief, ausser) {
    return (brief.evidence || [])
      .filter(function (e) {
        return e && e.statement && String(e.statement).trim() &&
          (!ausser || e.id !== ausser.id);
      })
      .map(function (e) { return String(e.statement).trim(); });
  }

  /** Zwei bis drei Belege, die zusammen etwas erzaehlen. */
  function auswahl(brief, ausser, wieViele) {
    var alle = belegsaetze(brief, ausser);
    /* Belege ueber verschiedene Dimensionen zuerst: drei Saetze ueber
       denselben Gegenstand sind ein Satz mit Wiederholungen. */
    var gesehen = Object.create(null);
    var breit = [];
    (brief.evidence || []).forEach(function (e) {
      if (!e || !e.statement || (ausser && e.id === ausser.id)) return;
      var dim = e.dimension || "?";
      if (gesehen[dim]) return;
      gesehen[dim] = true;
      breit.push(String(e.statement).trim());
    });
    var quelle = breit.length >= wieViele ? breit : alle;
    return quelle.slice(0, wieViele);
  }

  function satzreihe(saetze) {
    return saetze.map(function (s) {
      return /[.!?]$/.test(s) ? s : s + ".";
    }).join(" ");
  }

  /* -------------------------------------------------------------------
     WER DA GEMEINT IST — IN LESERSPRACHE

     Hier stand `e.entity`, also das Kuerzel: "XOM", "AAPL". Fuer den
     internen Research-Fall war das richtig; fuer ein breites Publikum
     ist es der Grund, nicht weiterzulesen. Wer "XOM" nicht kennt,
     erfaehrt aus dem Einstieg nicht einmal, wovon die Rede ist.

     Die Klarnamen werden HINEINGEREICHT (brief.entityNames). Diese
     Datei fuehrt keine eigene Tickerliste: eine zweite ginge gegen die
     kuratierte auseinander. Fehlt der Name, bleibt das Kuerzel stehen
     - erfunden wird keiner.
     ------------------------------------------------------------------- */
  function wer(e, brief) {
    var k = e && e.entity;
    if (!k) return (brief && brief.topic) || "der Titel";
    var namen = (brief && brief.entityNames) || {};
    var klar = namen[k];
    if (!klar) return k;
    /* Der Rechtsformzusatz gehoert nicht in einen Social-Einstieg:
       "Exxon Mobil" liest sich, "Exxon Mobil Corporation" klingt nach
       Handelsregister. */
    return String(klar)
      .replace(/,?\s+(?:Corporation|Corp\.?|Incorporated|Inc\.?|Company|Co\.?|Ltd\.?|PLC|N\.V\.|S\.A\.|AG|SE)$/i, "")
      .trim();
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
      build: function (e, brief) { return wert(e) + " " + STRICH + " " + wer(e, brief) + ", " + e.metric + "."; } },

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
     DIE CAPTION-MUSTER FUER EINE REIHE

     Dieselbe Lage wie beim Einstieg: die drei Muster oben bewerten
     EINEN Titel ("bewertet X derzeit mit 76 im Score"). Auf eine
     Auszaehlung angewandt ergaben sie "bewertet Bekannte Namen in
     Bewegung derzeit mit 33 von 5951 geprueften Titeln" - und, weil
     sie denselben einen Beleg nehmen wie der Einstieg, eine
     Ueberschneidung von 100 %. Das Kompositionstor hat das
     zurueckgewiesen, zu Recht.

     Diese drei nehmen die Auszaehlung als Rahmen und die uebrigen
     Belege als Inhalt. Umformuliert wird nichts: `auswahl()` liefert
     die Saetze, die die Engines fertig gebaut haben.
     ------------------------------------------------------------------- */
  var GRUPPEN_CAPTIONS = [
    { id: "group-rule-evidence",
      note: "Die Auszaehlung als Rahmen, die Belege als Inhalt.",
      needs: 3,
      build: function (e, brief) {
        return "Diese Auswahl umfasst " + wert(e) + " " + e.metric + ". " +
          "Was in ihr steht: " + satzreihe(auswahl(brief, e, 3)) + " " +
          "Die Liste sagt, wer die Regel erf" + UE + "llt " + STRICH +
          " nicht, was daraus folgt.";
      } },

    { id: "group-method-first",
      note: "Erst das Verfahren, dann die Auszaehlung. Fuer ein Publikum, " +
            "das wissen will, wie eine Liste zustande kommt.",
      needs: 2,
      build: function (e, brief) {
        return "Wir pr" + UE + "fen jeden Titel nach derselben Regel und " +
          "ver" + OE + "ffentlichen, was sie ergibt " + STRICH +
          " auch wenn die Liste kurz ausf" + AE + "llt. " +
          "Hier sind es " + wert(e) + " " + e.metric + ". " +
          satzreihe(auswahl(brief, e, 2)) + " " +
          "Was daraus folgt, entscheidet niemand hier f" + UE + "r Sie.";
      } },

    { id: "group-limit",
      note: "Die Grenze zuerst. Eine Liste ist eine Auswahl, keine Empfehlung.",
      needs: 2,
      build: function (e, brief) {
        return "Diese Liste sagt nicht, welcher dieser Titel der bessere ist. " +
          "Sie sagt, wer eine Regel erf" + UE + "llt: " + wert(e) + " " +
          e.metric + ". " +
          satzreihe(auswahl(brief, e, 2)) + " " +
          "Mehr behaupten wir nicht, und weniger auch nicht.";
      } }
  ];

  /* -------------------------------------------------------------------
     DIE MUSTER FUER EIN THEMA UEBER MEHRERE TITEL

     Alle vier Muster oben sind fuer EINEN Titel gebaut: sie nennen ihn
     und seine Zahl. Auf eine Rangliste ueber zehn Unternehmen
     angewandt ergaben sie den Einstieg "412,53 USD - Valero Energy,
     Kurs." Der Satz war belegt und trotzdem falsch am Platz: er las
     sich wie ein Beitrag ueber Valero, und der Rest des Textes handelt
     von der Reihe.

     Diese drei nennen die REIHE. Sie bauen auf demselben Weg aus
     demselben Beleg - nur ist der Beleg hier der, der ueber das Ganze
     spricht, und "im " + Kennzahl faellt weg, weil die Kennzahl einer
     Reihe schon ein Satzteil ist ("von 5951 geprueften Titeln").
     ------------------------------------------------------------------- */
  var GRUPPEN_HOOKS = [
    { id: "group-count",
      note: "Die Zahl der Reihe zuerst. Sie sagt in einem Blick, wie eng " +
            "die Auswahl ist.",
      build: function (e, brief) {
        return wert(e) + " " + e.metric + " " + STRICH + " " + wer(e, brief) + ".";
      } },

    { id: "group-subject",
      note: "Die Reihe zuerst. Wer ihren Titel kennt, bleibt haengen.",
      build: function (e, brief) {
        return wer(e, brief) + ": " + wert(e) + " " + e.metric + ".";
      } },

    { id: "group-limit",
      note: "Die Grenze zuerst. Eine Liste sagt, WER die Regel erfuellt - " +
            "nicht, was daraus folgt.",
      build: function (e, brief) {
        return "Was diese Liste nicht sagt: " + wer(e, brief) + ", " + wert(e) +
               " " + e.metric + ".";
      } },

    /* -------------------------------------------------------------------
       DIE BEGRUENDUNG ZUERST, NICHT DIE TREFFERZAHL

       Die drei Muster oben fuehren alle mit der rohen Zaehlung ("420 von
       5954 geprueften Titeln") und haengen den Reihennamen dahinter an -
       fuer eine Reihe wie "Comeback?" liest sich das wie ein Auszug aus
       einem Pruefbericht, nicht wie ein Grund hinzusehen. `brief.question`
       traegt seit content-brief.js den Satz, den die Reihe selbst schon
       in Lesersprache mitbringt (ihr `subtitle`, nicht ihre interne
       Filterformel) - hier fuehrt er, die Zaehlung folgt als Beleg.
       Ohne `question` faellt das Muster auf den Reihennamen zurueck, wie
       die drei Muster oben es tun. ------------------------------------- */
    { id: "group-question",
      note: "Die Begruendung der Reihe zuerst, in Lesersprache. Die " +
            "Trefferzahl folgt als Beleg, nicht als Einstieg.",
      build: function (e, brief) {
        var frage = (brief && brief.question) || wer(e, brief);
        return frage + " " + wert(e) + " " + e.metric + " erf" + UE + "llen das.";
      } }
  ];

  /* -------------------------------------------------------------------
     WELCHER BELEG DEN EINSTIEG TRAEGT

     `evidence[0]` war richtig, solange ein Brief von genau einem Titel
     handelte. Traegt er mehrere, ist der erste Beleg der erste TITEL -
     und der Einstieg spricht ueber ein Mitglied, als waere es das
     Thema.

     Gefragt wird deshalb nach einem Beleg OHNE Entitaet: er spricht
     ueber das Ganze. Gibt es keinen, bleibt es beim ersten - dann hat
     der Brief nichts ueber die Reihe, und einen Satz darueber zu
     erfinden waere schlimmer als ein enger Einstieg.
     ------------------------------------------------------------------- */
  function leitbeleg(brief) {
    var alle = (brief && brief.evidence) || [];
    var entitaeten = {};
    alle.forEach(function (x) { if (x && x.entity) entitaeten[x.entity] = true; });
    if (Object.keys(entitaeten).length >= 2) {
      var ueberDasGanze = alle.filter(function (x) { return x && !x.entity; })[0];
      if (ueberDasGanze) return ueberDasGanze;
    }
    return alle[0];
  }

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
          "Der Wert beschreibt die aktuelle Lage " + STRICH + " nicht ihre Ursache und " +
          "nicht, was als n" + AE + "chstes passiert. " +
          "Wir zeigen ihn, weil eine nachvollziehbare Zahl mehr wert ist als eine " +
          "Einsch" + AE + "tzung ohne Grundlage.";
      } },

    { id: "method-first",
      note: "Erst das Verfahren, dann die Zahl. Fuer ein Publikum, das " +
            "wissen will, woher etwas kommt.",
      build: function (e, brief) {
        return "Wir bewerten Titel nach einem festen Verfahren und ver" + OE +
          "ffentlichen das Ergebnis unver" + AE + "ndert " + STRICH +
          " auch wenn es unspektakul" + AE + "r ausf" + AE + "llt. " +
          "F" + UE + "r " + wer(e, brief) + " steht der " + e.metric + " aktuell bei " +
          wert(e) + ". " +
          "Was daraus folgt, entscheidet niemand hier f" + UE + "r Sie.";
      } },

    { id: "evidence-led",
      note: "Die Belege selbst. Nur moeglich, wenn der Brief mehr als eine " +
            "Zahl traegt — und dann die ehrlichste Form, weil nichts " +
            "umformuliert wird.",
      needs: 3,
      build: function (e, brief) {
        var belege = auswahl(brief, e, 3);
        return "Unsere technische Auswertung bewertet " + wer(e, brief) + " mit " +
          wert(e) + " im " + e.metric + ". " +
          "Was dahintersteht: " + satzreihe(belege) + " " +
          "Der Wert beschreibt die Lage " + STRICH + " nicht ihre Ursache und nicht, " +
          "was als n" + AE + "chstes passiert.";
      } },

    { id: "limit-first",
      note: "Die Grenze zuerst. Nimmt dem Leser die falsche Erwartung ab, " +
            "bevor er sie aufbaut.",
      build: function (e, brief) {
        return "Diese Zahl sagt nicht, was " + wer(e, brief) + " als n" + AE +
          "chstes tut. " +
          "Sie sagt, wie die Lage heute aussieht: " + e.metric + " bei " + wert(e) + ", " +
          "erhoben nach einem Verfahren, das f" + UE + "r jeden Titel dasselbe ist. " +
          "Mehr behaupten wir nicht, und weniger auch nicht.";
      } }
  ];

  /* Die Zeile im BILD. Kurz, und nie eine Wiederholung dessen, was die
     Karte ohnehin zeigt. */
  var VISUAL_PATTERNS = [
    { id: "limit", build: function () { return "Lagebeschreibung, keine Prognose."; } },
    { id: "method", build: function () {
        return "Gleiches Verfahren f" + UE + "r jeden Titel."; } },
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
        var e = leitbeleg(brief);
        if (!e) {
          return { variants: [], reason: "Kein Beleg im Brief. Ohne Beleg kein Satz." };
        }

        /* Spricht der Leitbeleg ueber das Ganze, gelten die Muster fuer
           die Reihe. Sonst die fuer den einzelnen Titel. Nicht beides:
           ein Einstieg ueber Valero Energy neben einem ueber die Reihe
           waeren zwei Beitraege in einem Vorschlag. */
        var muster = e.entity ? HOOK_PATTERNS : GRUPPEN_HOOKS;
        var captionMuster = e.entity ? CAPTION_PATTERNS : GRUPPEN_CAPTIONS;

        var wieViele = Math.min(
          Number(opts.variants) || muster.length, muster.length);

        var hinweis = brief.constraints && brief.constraints.disclaimer;
        var varianten = [];

        /* Muster, die mehrere Belege brauchen, fallen weg, wenn der Brief
           sie nicht traegt. Sie mit einem Beleg zu bauen ergaebe einen
           Satz mit einer Aufzaehlung aus einem Element. */
        var belegZahl = (brief.evidence || []).filter(function (x) {
          return x && x.statement; }).length;
        var moeglich = captionMuster.filter(function (x) {
          return !x.needs || belegZahl >= x.needs; });
        if (!moeglich.length) {
          return { variants: [], reason: "Kein Caption-Muster passt zu " +
            belegZahl + " Beleg(en) im Brief." };
        }

        for (var i = 0; i < wieViele; i += 1) {
          var h = muster[i % muster.length];
          var c = moeglich[i % moeglich.length];
          var v = VISUAL_PATTERNS[i % VISUAL_PATTERNS.length];

          var caption = c.build(e, brief);
          if (hinweis) caption += " " + hinweis;

          var hook = h.build(e, brief);
          var bildzeile = v.build(e, brief);

          /* -----------------------------------------------------------------
             JEDER ZITIERTE BELEGSATZ BRAUCHT SEINEN CLAIM

             Die Claims standen fest: zwei, beide aus dem Leitbeleg. Solange
             die Caption nur ueber diesen einen sprach, stimmte das. Die
             belegorientierten Muster zitieren aber ZUSAETZLICHE Saetze -
             "Valero Energy: Kurs 412.53 USD." -, und die Faktenpruefung
             fand dort Geldbetraege ohne Beleg. Sie hatte recht: der Beleg
             lag im Brief, war aber nicht deklariert.

             Gesucht wird im fertigen Text, nicht in der Musterabsicht: so
             stimmt die Liste auch fuer jedes kuenftige Muster, ohne dass
             es sie selbst pflegen muss. */
          var ganzerText = hook + " " + caption + " " + bildzeile;
          var zitiert = (brief.evidence || []).filter(function (x) {
            return x && x.id !== e.id && x.statement &&
              ganzerText.indexOf(String(x.statement).trim()) !== -1;
          });

          varianten.push(Authoring.variant({
            authorId: "template",
            kind: "deterministic",
            hook: hook,
            caption: caption,
            visualLine: bildzeile,
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
            ].concat(zitiert.map(function (x) {
              return { text: String(x.statement).trim(), numeric: x.value === undefined ? null : x.value,
                source: { source: x.source, entity: x.entity, metric: x.metric,
                  observedAt: x.observedAt, state: x.state || "VERIFIED" } };
            })),
            notes: h.note
          }));
        }

        return { variants: varianten, reason: null };
      }
    };
  }

  var api = {
    HOOK_PATTERNS: HOOK_PATTERNS.map(function (p) { return p.id; }),
    GRUPPEN_HOOKS: GRUPPEN_HOOKS.map(function (p) { return p.id; }),
    GRUPPEN_CAPTIONS: GRUPPEN_CAPTIONS.map(function (p) { return p.id; }),
    CAPTION_PATTERNS: CAPTION_PATTERNS.map(function (p) { return p.id; }),
    VISUAL_PATTERNS: VISUAL_PATTERNS.map(function (p) { return p.id; }),
    createTemplateAuthor: createTemplateAuthor
  };

  if (isNode) module.exports = api;
  else global.VUSocialAuthorTemplate = api;
})(typeof window !== "undefined" ? window : globalThis);
