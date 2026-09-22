/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/scroll-stop.js

   SCROLL_STOP_QUALITY (§13, §14, §15)

   -------------------------------------------------------------------------
   §13 IST EINE OWNER-ENTSCHEIDUNG, KEINE EMPFEHLUNG
   -------------------------------------------------------------------------

   Ein normaler Feed-Post ohne starken Text IM BILD gilt nicht als
   produktionsreif. Das ist entschieden, und diese Datei ist der Ort,
   an dem die Entscheidung im Weg steht.

   Der Anlass ist messbar und lag im eigenen Haus: der gezeichnete
   Kompositionspfad setzte einen AUS DEN DATEN GERECHNETEN Satz in die
   Kopfzeile - "Seit 15.08.2025: +12,3 %." Das ist ein Beleg. Ein
   Beleg beantwortet die Frage, die niemand gestellt hat, weil der
   Grund zum Anhalten fehlte. Und der fuehrende Text mass 58 von 1350
   Pixeln: sichtbar, aber im Vorbeiscrollen nicht lesbar.

   -------------------------------------------------------------------------
   GEMESSEN WIRD AM GERENDERTEN BILD, NICHT AM ENTWURF
   -------------------------------------------------------------------------

   Die entscheidende Frage - was liest das Auge zuerst - laesst sich
   an Schriftgroessen nicht beantworten. Eine Zahl in 122 Pixeln hat
   die groessere Versalhoehe; ein Satz in 76 Pixeln ueber zwei Zeilen
   hat die dreifache Flaeche. Gemessen sind es 39.793 gegen 114.356
   Quadratpixel, und die Flaeche gewinnt den ersten Blick.

   Deshalb urteilt diese Engine ueber eine MESSUNG der fertigen Seite
   (Textflaechen, Zeilen, Kaesten), die der Renderer aus dem Browser
   zurueckliest - und nicht ueber die Absicht, die im Plan steht.

   Fehlt die Messung, faellt das Tor GESCHLOSSEN aus. Ein Bild, von
   dem niemand weiss, ob sein Text lesbar ist, hat §15 nicht
   bestanden.

   -------------------------------------------------------------------------
   WAS HIER NICHT GEFRAGT WIRD
   -------------------------------------------------------------------------

   Ob die Hook eine GUTE Hook ist. Das ist §9 und gehoert in die Hook
   Intelligence, wo mehrere Kandidaten gegeneinander bewertet werden.
   Hier wird gefragt, ob sie ueberhaupt da ist, ob sie fuehrt, ob man
   sie auf einem Telefon lesen kann und ob sie nicht bloss die Caption
   wiederholt. Eine erfundene Heuristik fuer "stark genug" waere an
   dieser Stelle ein Pruefer, der richtigen Text abweist.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Grammar = isNode ? require("./visual-grammar.js")
    : global.VUSocialVisualGrammar;
  var VQ = isNode ? require("./visual-quality.js")
    : global.VUSocialVisualQuality;
  var Brand = isNode ? require("./brand.js") : global.VUSocialBrand;

  var ZUSTAND = {
    OK: "SCROLL_STOP_OK",
    MESSUNG_FEHLT: "MESSUNG_FEHLT",
    TEXT_ON_VISUAL_FEHLT: "TEXT_ON_VISUAL_FEHLT",
    HOOK_FEHLT_AUF_BILD: "HOOK_FEHLT_AUF_BILD",
    HOOK_NICHT_DOMINANT: "HOOK_NICHT_DOMINANT",
    HOOK_ZU_KLEIN_FUER_MOBIL: "HOOK_ZU_KLEIN_FUER_MOBIL",
    HOOK_AUSSERHALB_SICHERBEREICH: "HOOK_AUSSERHALB_SICHERBEREICH",
    HOOK_WIEDERHOLT_CAPTION: "HOOK_WIEDERHOLT_CAPTION",
    HOOK_ZU_LANG: "HOOK_ZU_LANG",
    HOOK_NICHT_OBEN: "HOOK_NICHT_OBEN"
  };

  /* Ab wann ein Text den ersten Blick hat. Nicht "der groesste", sondern
     der groesste MIT ABSTAND: zwei Bloecke fast gleicher Flaeche teilen
     den Blick, und geteilt ist nicht gefuehrt. */
  var VORSPRUNG = 1.25;

  /* Wie viel Wortueberschneidung zwischen Bildtext und Caption noch
     kein Doppel ist. Dieselbe Groesse, die visual-quality.js fuer die
     Redundanz innerhalb der Karte benutzt - eine zweite Zahl daneben
     waere eine zweite Antwort auf dieselbe Frage (§2).

     Ohne Ausweichwert: der erste Entwurf hatte einen, und weil das
     Feld damals `overlap` hiess und nicht existierte, griff still die
     Ersatzzahl. Der Kommentar behauptete dann eine gemeinsame Quelle,
     die es nicht gab - eine Pruefung, die leise nichts tut, weil der
     Feldname nicht passt. Fehlt der Wert, soll es auffallen. */
  var CAPTION_UEBERSCHNEIDUNG = VQ.GRENZEN.redundanz;

  function zahl(x) { return typeof x === "number" && isFinite(x) ? x : null; }

  function befund(zustand, satz, mehr) {
    var r = { ok: zustand === ZUSTAND.OK, zustand: zustand, erklaerung: satz };
    if (mehr) Object.keys(mehr).forEach(function (k) { r[k] = mehr[k]; });
    return r;
  }

  /**
   * @param spec.messung  Was der Browser an der fertigen Seite gemessen
   *                      hat: { breite, hoehe, texte: [{rolle, flaeche,
   *                      zeilen, oben, unten, links, rechts, schrift}] }
   * @param spec.caption  Der Beitragstext, gegen den das Bild nicht
   *                      doppeln darf.
   */
  function pruefe(spec) {
    spec = spec || {};
    var m = spec.messung;

    if (!m || !Array.isArray(m.texte)) {
      return befund(ZUSTAND.MESSUNG_FEHLT,
        "Das Bild wurde nicht vermessen. Ob sein Text traegt, ist damit " +
        "unbekannt - und unbekannt ist hier nicht bestanden (§15).");
    }

    var hoehe = zahl(m.hoehe) || Grammar.FLAECHE.hoehe;
    var breite = zahl(m.breite) || Grammar.FLAECHE.breite;

    var texte = m.texte.filter(function (t) {
      return t && zahl(t.flaeche) !== null && t.flaeche > 0;
    });
    if (!texte.length) {
      return befund(ZUSTAND.TEXT_ON_VISUAL_FEHLT,
        "Auf dem gerenderten Bild steht kein Text. §13 macht " +
        "Text-on-Visual zur Vorbedingung, nicht zur Zierde: ein Bild " +
        "ohne Satz laesst die Caption die Arbeit tun, und die Caption " +
        "wird im Vorbeiscrollen nicht gelesen.");
    }

    var hooks = texte.filter(function (t) { return t.rolle === "HOOK"; });
    if (!hooks.length) {
      return befund(ZUSTAND.HOOK_FEHLT_AUF_BILD,
        "Das Bild traegt Text, aber keine Hook. Gemessen wurden nur: " +
        texte.map(function (t) { return t.rolle; }).join(", ") + ". Ein " +
        "Beleg oder ein Titel beantwortet eine Frage, die noch niemand " +
        "gestellt hat.",
        { rollen: texte.map(function (t) { return t.rolle; }) });
    }

    /* Mehrere Hook-Kaesten zaehlen als ein Block: sie sind derselbe
       Satz, nur umgebrochen. */
    var hookFlaeche = hooks.reduce(function (s, t) { return s + t.flaeche; }, 0);
    var hookSchrift = hooks.reduce(function (s, t) {
      return Math.max(s, zahl(t.schrift) || 0); }, 0);

    var andere = texte.filter(function (t) { return t.rolle !== "HOOK"; });
    var groessteAndere = andere.reduce(function (a, t) {
      return t.flaeche > a ? t.flaeche : a; }, 0);
    var staerkste = andere.filter(function (t) {
      return t.flaeche === groessteAndere; })[0] || null;

    if (groessteAndere > 0 && hookFlaeche < groessteAndere * VORSPRUNG) {
      return befund(ZUSTAND.HOOK_NICHT_DOMINANT,
        "Die Hook fuehrt nicht: sie belegt " + Math.round(hookFlaeche) +
        " Quadratpixel, " + (staerkste ? staerkste.rolle : "ein anderes " +
        "Element") + " belegt " + Math.round(groessteAndere) + ". Wer " +
        "zuerst die Zahl liest, liest sie ohne den Grund, warum sie hier " +
        "steht.",
        { hookFlaeche: Math.round(hookFlaeche),
          staerksteAndere: staerkste ? staerkste.rolle : null,
          andereFlaeche: Math.round(groessteAndere) });
    }

    /* Mobil: die Schwelle steht in der Visual Grammar. Eine zweite
       Zahl hier waere eine zweite Antwort auf dieselbe Frage (§2). */
    var anteil = hookSchrift / hoehe;
    if (!hookSchrift) {
      return befund(ZUSTAND.MESSUNG_FEHLT,
        "Zur Hook wurde keine Schriftgroesse gemessen.");
    }
    if (anteil < Grammar.MOBIL.mindestHoeheAnteil) {
      return befund(ZUSTAND.HOOK_ZU_KLEIN_FUER_MOBIL,
        "Die Hook misst " + hookSchrift + " von " + hoehe + " Pixeln (" +
        (Math.round(anteil * 1000) / 10) + "%). Unter " +
        (Math.round(Grammar.MOBIL.mindestHoeheAnteil * 1000) / 10) +
        "% ist sie auf einem Telefon im Feed sichtbar, aber nicht lesbar.",
        { schrift: hookSchrift, anteil: Math.round(anteil * 1000) / 1000 });
    }

    /* Der sichere Bereich: kein Textkasten darf in den Rand laufen, in
       dem die Plattform ihre eigenen Elemente zeichnet - und keiner
       darf ueber die Flaeche hinausragen. Ein abgeschnittener Satz ist
       der Fehler, den man erst im Konto sieht. */
    var rand = Grammar.MOBIL.sichererRand * hoehe;
    var randX = Grammar.MOBIL.sichererRand * breite;
    var raus = hooks.filter(function (t) {
      return zahl(t.oben) !== null && (
        t.oben < rand - 1 || t.unten > hoehe - rand + 1 ||
        t.links < randX - 1 || t.rechts > breite - randX + 1);
    });
    if (raus.length) {
      var e = raus[0];
      return befund(ZUSTAND.HOOK_AUSSERHALB_SICHERBEREICH,
        "Die Hook liegt im Randbereich oder darueber hinaus (oben " +
        Math.round(e.oben) + ", unten " + Math.round(e.unten) + ", links " +
        Math.round(e.links) + ", rechts " + Math.round(e.rechts) +
        "; sicher ist " + Math.round(randX) + " bis " +
        Math.round(breite - randX) + " waagerecht und " + Math.round(rand) +
        " bis " + Math.round(hoehe - rand) + " senkrecht).");
    }

    /* -----------------------------------------------------------------
       DER BLICK BETRITT DAS BILD OBEN

       Flaeche allein genuegt nicht. Ein Entwurf, in dem die Hook zwar
       der groesste Block ist, aber UNTER der Zahl steht, wurde
       gemessen und bestand - und auf dem Bild las man trotzdem zuerst
       "-38 %", weil das Auge oben anfaengt. Die erklaerte Rangfolge
       der Visual Grammar sagte HOOK vor BELEG, das gerenderte Bild
       sagte das Gegenteil, und niemand verglich die beiden.

       Die Signatur ist ausgenommen: sie steht als Absenderzeile
       immer zuoberst und ist keine Aussage.
       ----------------------------------------------------------------- */
    var hookOben = hooks.reduce(function (a, t) {
      var o = zahl(t.oben);
      return o === null ? a : (a === null ? o : Math.min(a, o)); }, null);
    var inhaltUeber = andere.filter(function (t) {
      return t.rolle !== "SIGNATUR" && zahl(t.oben) !== null &&
        hookOben !== null && t.oben < hookOben;
    });
    if (inhaltUeber.length) {
      return befund(ZUSTAND.HOOK_NICHT_OBEN,
        "Ueber der Hook steht noch Inhalt (" +
        inhaltUeber.map(function (t) { return t.rolle; }).join(", ") +
        "). Der Blick betritt das Bild oben; was dort steht, wird zuerst " +
        "gelesen - auch wenn die Hook mehr Flaeche hat.",
        { hookOben: hookOben,
          darueber: inhaltUeber.map(function (t) { return t.rolle; }) });
    }

    /* Laenge: die Grenze steht im Brand Brain und gilt fuer die Hook,
       egal ob sie im Text oder auf dem Bild steht. */
    var hookText = hooks.map(function (t) { return String(t.text || ""); })
      .join(" ").trim();
    if (hookText && Brand.LIMITS && hookText.length > Brand.LIMITS.maxHookLength) {
      return befund(ZUSTAND.HOOK_ZU_LANG,
        "Die Hook auf dem Bild ist " + hookText.length + " Zeichen lang " +
        "(hoechstens " + Brand.LIMITS.maxHookLength + "). Was man anhalten " +
        "muss, um es zu lesen, haelt niemanden an.");
    }

    /* Und sie darf nicht die Caption sein. Zweimal derselbe Satz ist
       einmal zu viel - dieselbe Redundanz, die visual-quality.js
       innerhalb der Karte findet, nur ueber die Grenze hinweg. */
    if (hookText && spec.caption) {
      /* -----------------------------------------------------------------
         DIE RICHTUNG DER FRAGE

         Der erste Entwurf rechnete `overlap(hook, caption)` - also:
         wie viele Woerter der HOOK kommen in der Caption vor. Bei
         einem kurzen Satz und einem langen Text ist das fast immer
         alles, und fuer eine Hook aus Zahl, Kennzahl und Name ist es
         zwingend: die Caption MUSS den Gegenstand und die Zahl nennen,
         sonst erklaert sie nichts.

         Damit konnte die Pruefung nur ja sagen. Eine Invariante, die
         sich nicht verletzen laesst, ist keine - und eine, die sich
         nicht erfuellen laesst, ebensowenig. Der Produktnachweis ist
         daran haengengeblieben: 100 %, bei jeder Caption, die den
         Beitrag ueberhaupt erklaert.

         Gefragt ist die andere Richtung: wie viel vom ERSTEN SATZ der
         Caption ist nichts als die Hook? Faengt der Text mit einer
         Wiederholung an, hat der Beitrag einen Grund zum Anhalten
         weniger. Erklaert er etwas, ist es kein Doppel - auch wenn er
         dabei dieselbe Zahl nennt.
         ----------------------------------------------------------------- */
      var ersterSatz = String(spec.caption).split(/(?<=[.!?])\s+/)[0] || "";
      var u = VQ.overlap(ersterSatz, hookText);
      if (ersterSatz && u >= CAPTION_UEBERSCHNEIDUNG) {
        return befund(ZUSTAND.HOOK_WIEDERHOLT_CAPTION,
          "Der erste Satz der Caption besteht zu " + Math.round(u * 100) +
          "% aus den Woertern der Hook. Dann faengt der Text mit einer " +
          "Wiederholung an - und der Beitrag hat einen Grund zum Anhalten " +
          "weniger.", { ueberschneidung: u, ersterSatz: ersterSatz });
      }
    }

    return befund(ZUSTAND.OK,
      "Die Hook fuehrt das Bild: " + Math.round(hookFlaeche) +
      " Quadratpixel gegen " + Math.round(groessteAndere) + ", " +
      hookSchrift + " Pixel Schriftgroesse (" +
      (Math.round(anteil * 1000) / 10) + "% der Bildhoehe), im sicheren " +
      "Bereich.",
      { hookFlaeche: Math.round(hookFlaeche),
        andereFlaeche: Math.round(groessteAndere),
        schrift: hookSchrift });
  }

  var api = {
    ZUSTAND: ZUSTAND,
    VORSPRUNG: VORSPRUNG,
    CAPTION_UEBERSCHNEIDUNG: CAPTION_UEBERSCHNEIDUNG,
    pruefe: pruefe
  };

  if (isNode) module.exports = api;
  else global.VUSocialScrollStop = api;
})(typeof window !== "undefined" ? window : globalThis);
