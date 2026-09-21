/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/content-intelligence.js

   VIER EBENEN, DIE NICHT DASSELBE SIND (§6, §7, §8)

   -------------------------------------------------------------------------
   DER FEHLER, DEN §8 VERBIETET, IST HIER SCHON PASSIERT
   -------------------------------------------------------------------------

   Der erste gerenderte Kandidat dieses Systems trug:

       XOM: 76 im Technical Opportunity Score.

   Das ist kein schlechter Satz. Es ist ein INTERNES SIGNAL, das als
   oeffentliche Geschichte ausgegeben wurde. Wer den Score nicht kennt
   - und das ist das ganze Publikum -, liest eine Zahl ohne Bedeutung
   und einen Namen ohne Anlass.

   §8 verlangt deshalb, vier Dinge ausdruecklich zu unterscheiden:

     INTERNAL_SIGNAL   Was UNSERE Systeme gemessen haben. Rang,
                       Perzentil, Score, Faktor. Niemals oeffentlich.
     EDITORIAL_ANGLE   Die Frage, mit der ein Mensch hinsieht. Sie
                       folgt aus dem Signal, ist aber nicht das Signal.
     PUBLIC_HOOK       Der Satz, der den Daumen anhaelt (§9).
     PUBLIC_STORY      Der Beitrag, der die Hook einloest.

   -------------------------------------------------------------------------
   DIESE DATEI BAUT NICHTS NEU
   -------------------------------------------------------------------------

   Alle vier Ebenen gibt es bereits, nur ohne gemeinsamen Namen:

     INTERNAL_SIGNAL   in der Gelegenheit und ihrer Evidenz
     EDITORIAL_ANGLE   audience-frame.js: `coreQuestion`
     PUBLIC_HOOK       hook.js: der gewaehlte Kandidat
     PUBLIC_STORY      das Content Package: Caption und These

   Und audience-frame.js fuehrt seit jeher `internalTermsNotSuitableForHook`
   - die Liste der Begriffe, die nicht nach draussen gehoeren.

   Was fehlte, war das TOR. Die Liste floss in `mustNotShow` der
   Bildrichtung und in einen Bericht; kein einziger Aufruf hat je den
   veroeffentlichten TEXT dagegen geprueft. Eine Regel, die nur in
   einer Aufzaehlung steht, hat noch nie einen Satz aufgehalten.

   -------------------------------------------------------------------------
   §7 — SOCIAL-FIRST HEISST: OHNE VORWISSEN LESBAR
   -------------------------------------------------------------------------

   Ein Beitrag ist nicht social-first, weil er kurz ist. Er ist es,
   wenn er niemanden voraussetzt, der unsere Methodik kennt. Das laesst
   sich messen: kommt ein interner Begriff im oeffentlichen Text vor,
   ist die Antwort nein - unabhaengig davon, wie gut der Satz sonst ist.

   Was sich NICHT messen laesst, steht hier auch nicht: ob der Beitrag
   interessant ist, ob die Frage gut gewaehlt wurde, ob der Ton sitzt.
   Eine erfundene Heuristik dafuer waere ein Pruefer, der richtigen
   Text abweist - und davon hatten wir genug.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var AudienceFrame = isNode ? require("./audience-frame.js")
    : global.VUSocialAudienceFrame;
  var VQ = isNode ? require("./visual-quality.js") : global.VUSocialVisualQuality;

  /* Die vier Ebenen aus §8, und wo jede in diesem System wirklich
     wohnt. Der Ort steht dabei, damit niemand eine fuenfte anlegt. */
  var EBENEN = {
    INTERNAL_SIGNAL: {
      id: "INTERNAL_SIGNAL",
      zweck: "Was unsere eigenen Systeme gemessen haben: Rang, Perzentil, " +
        "Score, Faktor. Grundlage der Auswahl - nie Gegenstand des Beitrags.",
      wohnt: "opportunity/evidence",
      oeffentlich: false
    },
    EDITORIAL_ANGLE: {
      id: "EDITORIAL_ANGLE",
      zweck: "Die Frage, mit der ein Mensch hinsieht. Sie folgt aus dem " +
        "Signal und ist nicht das Signal.",
      wohnt: "audience-frame.js/coreQuestion",
      oeffentlich: false
    },
    PUBLIC_HOOK: {
      id: "PUBLIC_HOOK",
      zweck: "Der Satz, der den Daumen anhaelt (§9).",
      wohnt: "hook.js/gewaehlt",
      oeffentlich: true
    },
    PUBLIC_STORY: {
      id: "PUBLIC_STORY",
      zweck: "Der Beitrag, der die Hook einloest.",
      wohnt: "contentPackage/caption",
      oeffentlich: true
    }
  };

  var EBENEN_IDS = ["INTERNAL_SIGNAL", "EDITORIAL_ANGLE", "PUBLIC_HOOK",
    "PUBLIC_STORY"];

  /* Die Reihenfolge ist keine Sortierung, sondern eine Abhaengigkeit:
     ohne Signal keine Frage, ohne Frage keine Hook, ohne Hook keine
     Geschichte, die etwas einloest. */
  var REIHENFOLGE = EBENEN_IDS.slice();

  var BEFUND = {
    OK: "EBENEN_GETRENNT",
    EBENE_FEHLT: "EBENE_FEHLT",
    INTERNES_SIGNAL_OEFFENTLICH: "INTERNES_SIGNAL_OEFFENTLICH",
    ANGLE_IST_DAS_SIGNAL: "ANGLE_IST_DAS_SIGNAL",
    HOOK_IST_DER_ANGLE: "HOOK_IST_DER_ANGLE"
  };

  function text(v) { return String(v === null || v === undefined ? "" : v); }
  function gefuellt(v) { return !!text(v).trim(); }
  function liste(v) { return Array.isArray(v) ? v.slice() : []; }

  /* -------------------------------------------------------------------
     EIN INTERNER BEGRIFF, GEFUNDEN OHNE FALSCHE TREFFER

     "SMA" darf nicht in "SMArtphone" anschlagen, und "Perzentil" soll
     auch als "Perzentils" gefunden werden. Also Wortgrenzen um den
     ganzen Begriff, mit erlaubter deutscher Endung.

     Ein Pruefer, der richtigen Text abweist, ist in diesem Projekt
     eine eigene Fehlerfamilie. Deshalb hier lieber eine Grenze zu
     viel als ein Treffer zu viel.
     ------------------------------------------------------------------- */
  function maskiere(s) {
    return text(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /* Ein Begriff OHNE Kleinbuchstaben ist ein Kuerzel: SMA, ATR,
     MOMENTUM, TREND_STRUCTURE. Deutsche Zusammensetzungen bildet man
     mit ihnen nur mit Bindestrich ("SMA-Wert"), nie verschmolzen -
     und "SMA" mitten in "Smartphone" waere ein Pruefer, der richtigen
     Text abweist.

     Ein Begriff MIT Kleinbuchstaben ist ein Wort: Perzentil,
     Trendwert, Setup-Rang. Die verschmelzen sehr wohl -
     "Perzentilrechnung" ist derselbe interne Begriff mit Anhang, und
     ihn durchzulassen waere ein Tor, das zu schmal gebaut ist.

     Beide Fehler sind in diesem Projekt schon vorgekommen. Deshalb
     zwei Regeln statt einer Faustregel. */
  function istKuerzel(b) { return !/[a-zà-ÿ]/.test(String(b)); }

  function interneTreffer(inhalt, begriffe) {
    var t = text(inhalt);
    if (!t) return [];
    var gefunden = [];
    liste(begriffe).forEach(function (b) {
      if (!gefuellt(b)) return;
      var wort = maskiere(String(b).trim());
      var re = istKuerzel(b)
        ? new RegExp("(^|[^\\wÀ-ÿ])" + wort + "([^\\wÀ-ÿ]|$)", "i")
        : new RegExp("(^|[^\\wÀ-ÿ])" + wort + "[\\wÀ-ÿ]*", "i");
      if (re.test(t) && gefunden.indexOf(b) === -1) gefunden.push(b);
    });
    return gefunden;
  }

  /**
   * Halten die vier Ebenen auseinander?
   *
   * @param spec.internalSignal  Was gemessen wurde (Text oder Liste).
   * @param spec.editorialAngle  Die Kernfrage des Publikumsrahmens.
   * @param spec.publicHook      Der gewaehlte Hook.
   * @param spec.publicStory     Caption/These - der oeffentliche Text.
   * @param spec.internalTerms   Begriffe, die nicht nach draussen
   *                             gehoeren. Fehlen sie, gilt die Liste
   *                             aus audience-frame.js - nicht die leere.
   */
  function trenne(spec) {
    spec = spec || {};
    var verstoesse = [];

    var ebene = {
      INTERNAL_SIGNAL: liste(spec.internalSignal).length
        ? liste(spec.internalSignal).map(text).join(" ")
        : text(spec.internalSignal),
      EDITORIAL_ANGLE: text(spec.editorialAngle),
      PUBLIC_HOOK: text(spec.publicHook),
      PUBLIC_STORY: text(spec.publicStory)
    };

    REIHENFOLGE.forEach(function (id) {
      if (!gefuellt(ebene[id])) {
        verstoesse.push({ id: BEFUND.EBENE_FEHLT, ebene: id,
          satz: EBENEN[id].zweck + " Diese Ebene ist leer (" +
            EBENEN[id].wohnt + ")." });
      }
    });

    /* -----------------------------------------------------------------
       DAS EIGENTLICHE TOR

       `INTERN_NICHT_IM_HOOK` steht seit dem Publikumsrahmen in
       audience-frame.js und ist bis heute nie gegen einen
       veroeffentlichten Satz gehalten worden. Eine fehlende Liste
       heisst hier NICHT "keine Einschraenkung": dann gilt die
       kanonische. Unbekanntes als Freibrief zu lesen ist die
       Fehlerfamilie, die hier schon mehrfach zugeschlagen hat.
       ----------------------------------------------------------------- */
    var begriffe = liste(spec.internalTerms).length
      ? liste(spec.internalTerms)
      : AudienceFrame.INTERN_NICHT_IM_HOOK;

    EBENEN_IDS.filter(function (id) { return EBENEN[id].oeffentlich; })
      .forEach(function (id) {
        var treffer = interneTreffer(ebene[id], begriffe);
        if (treffer.length) {
          verstoesse.push({ id: BEFUND.INTERNES_SIGNAL_OEFFENTLICH,
            ebene: id, begriffe: treffer,
            satz: "Im oeffentlichen Text (" + id + ") steht ein interner " +
              "Begriff: " + treffer.join(", ") + ". Wer ihn nicht kennt - " +
              "und das ist das Publikum - liest eine Zahl ohne Bedeutung. " +
              "Genau dieser Satz stand auf dem ersten Kandidaten dieses " +
              "Systems." });
        }
      });

    /* Die Frage darf nicht das Signal in anderen Worten sein. */
    if (gefuellt(ebene.EDITORIAL_ANGLE) && gefuellt(ebene.INTERNAL_SIGNAL)) {
      var u = VQ.overlap(ebene.EDITORIAL_ANGLE, ebene.INTERNAL_SIGNAL);
      if (u >= VQ.GRENZEN.redundanz) {
        verstoesse.push({ id: BEFUND.ANGLE_IST_DAS_SIGNAL,
          ebene: "EDITORIAL_ANGLE", ueberschneidung: u,
          satz: "Die redaktionelle Frage ist zu " + Math.round(u * 100) +
            " % dasselbe wie das interne Signal. Dann ist sie keine Frage " +
            "an ein Publikum, sondern eine Umschreibung unserer Messung." });
      }
    }

    /* Und die Hook darf nicht die Frage sein. Die Kernfrage ist ein
       Arbeitsmittel - sie steht in jedem Beitrag derselben Familie
       gleich, und woertlich uebernommen waere sie die Schablone, die
       §19 an der Bildseite verbietet. */
    if (gefuellt(ebene.PUBLIC_HOOK) && gefuellt(ebene.EDITORIAL_ANGLE)) {
      var v = VQ.overlap(ebene.PUBLIC_HOOK, ebene.EDITORIAL_ANGLE);
      if (v >= VQ.GRENZEN.hookDoppel) {
        verstoesse.push({ id: BEFUND.HOOK_IST_DER_ANGLE,
          ebene: "PUBLIC_HOOK", ueberschneidung: v,
          satz: "Die Hook ist zu " + Math.round(v * 100) + " % die " +
            "Kernfrage selbst. Die steht in jedem Beitrag dieser Familie " +
            "gleich - dann sehen alle Beitraege gleich aus." });
      }
    }

    /* -----------------------------------------------------------------
       ZWEI FRAGEN, ZWEI ANTWORTEN

       `dicht` heisst: es ist nichts Internes nach draussen gelangt.
       Das ist die Sperre.

       `ok` heisst zusaetzlich: alle vier Ebenen sind ueberhaupt da.
       Das ist ein Befund ueber die Vorarbeit - ohne Publikumsrahmen
       gibt es die Kernfrage nicht, und deswegen einen belegten,
       markengerechten Beitrag zu verwerfen waere die falsche Antwort.

       Beides unter einem einzigen Ja/Nein zu fuehren waere ein
       Register fuer zwei Tatsachen - und dann faellt eine davon
       unbemerkt mit der anderen.
       ----------------------------------------------------------------- */
    var undicht = verstoesse.filter(function (v) {
      return v.id !== BEFUND.EBENE_FEHLT; });
    var fehlende = verstoesse.filter(function (v) {
      return v.id === BEFUND.EBENE_FEHLT; }).map(function (v) { return v.ebene; });

    return {
      ok: verstoesse.length === 0,
      dicht: undicht.length === 0,
      undicht: undicht,
      fehlendeEbenen: fehlende,
      zustand: undicht.length ? undicht[0].id
        : verstoesse.length ? verstoesse[0].id : BEFUND.OK,
      ebenen: ebene,
      geprueft: begriffe.length,
      verstoesse: verstoesse,
      erklaerung: verstoesse.length === 0
        ? "Die vier Ebenen aus §8 sind getrennt: das Signal bleibt innen, " +
          "die Frage ist eine Frage, die Hook ist nicht die Frage, und im " +
          "oeffentlichen Text steht keiner der " + begriffe.length +
          " internen Begriffe."
        : verstoesse.map(function (v) { return v.satz; }).join(" ")
    };
  }

  /* -------------------------------------------------------------------
     AUS DEM ABLEITEN, WAS SCHON DASTEHT

     Keine neuen Felder, keine zweite Quelle. Das interne Signal ist
     das, was die Gelegenheit und ihre Evidenz an Messung tragen; die
     Frage kommt aus dem Publikumsrahmen; Hook und Geschichte aus dem
     Paket.
     ------------------------------------------------------------------- */
  function ableiten(spec) {
    spec = spec || {};
    var pkg = spec.package || {};
    var opp = spec.opportunity || {};
    var rahmen = spec.audienceFrame || null;

    var signal = [];
    if (gefuellt(opp.scoreName)) signal.push(text(opp.scoreName));
    if (opp.score !== null && opp.score !== undefined) signal.push(text(opp.score));
    liste(opp.signals).forEach(function (s) {
      signal.push(text(s && s.name ? s.name : s)); });
    liste(spec.evidence).forEach(function (e) {
      if (e && gefuellt(e.metric)) signal.push(text(e.metric)); });

    return {
      internalSignal: signal.filter(gefuellt),
      editorialAngle: rahmen ? rahmen.coreQuestion : (spec.editorialAngle || null),
      publicHook: pkg.hook || spec.publicHook || null,
      publicStory: [pkg.caption, pkg.thesis].filter(gefuellt).join("\n") ||
        spec.publicStory || null,
      internalTerms: (rahmen && liste(rahmen.internalTermsNotSuitableForHook).length)
        ? rahmen.internalTermsNotSuitableForHook
        : AudienceFrame.INTERN_NICHT_IM_HOOK
    };
  }

  var api = {
    EBENEN: EBENEN,
    EBENEN_IDS: EBENEN_IDS,
    REIHENFOLGE: REIHENFOLGE,
    BEFUND: BEFUND,
    istKuerzel: istKuerzel,
    interneTreffer: interneTreffer,
    ableiten: ableiten,
    trenne: trenne
  };

  if (isNode) module.exports = api;
  else global.VUSocialContentIntelligence = api;
})(typeof window !== "undefined" ? window : globalThis);
