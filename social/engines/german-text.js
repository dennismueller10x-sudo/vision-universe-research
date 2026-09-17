/* =========================================================================
   VISION UNIVERSE SOCIAL — Deutsche Schreibung im veroeffentlichten Text

   -------------------------------------------------------------------------
   DER BEFUND
   -------------------------------------------------------------------------

   Der Quelltext dieses Repositories ist ASCII, und das ist richtig so.
   Die QUANT-DATEN sind es auch — "SMA50 ueber SMA200", "Relative Staerke
   nicht verfuegbar", "TREND_STRUCTURE traegt 27.35 von 30 Punkten bei".

   Solange diese Saetze nur gerechnet werden, ist das folgenlos. Seit das
   Evidence Package sie an den Autor weiterreicht, werden sie zu
   veroeffentlichtem Text. Und dann steht auf einem deutschen Markenkonto
   "traegt 27.35 von 30 Punkten bei".

   -------------------------------------------------------------------------
   WARUM KEINE EINFACHE ERSETZUNG
   -------------------------------------------------------------------------

   "ue" durch "ue-mit-Punkten" zu ersetzen macht aus "Feuer" ein "Feuer"
   mit falschem Vokal, aus "neue" ein Unwort und aus "dauert" etwas, das
   kein Mensch geschrieben haette. Die Kombination steht in echtem
   Deutsch staendig: jedes "au"+"e", jedes "eu"+"e".

   Deshalb zwei getrennte Werkzeuge mit zwei verschiedenen Aufgaben:

     normalize()  repariert, WAS WIR KENNEN. Ein Woerterbuch aus exakten
                  Wortformen und wenigen produktiven Endungen. Es raet
                  nie.

     residue()    meldet, WAS WIR NICHT KENNEN. Es findet Woerter mit
                  verdaechtigen Digraphen, die weder echtes Deutsch noch
                  im Woerterbuch sind.

   Zusammen ergibt das die Eigenschaft, auf die es ankommt: Unbekanntes
   rutscht nicht still durch. Es faellt auf und blockiert.

   Ein Fehlalarm von residue() kostet einen Eintrag in ECHT_MUSTER und
   nennt das Wort, um das es geht. Ein uebersehenes "traegt" kostet
   einen Beitrag.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var ae = "ä", oe = "ö", ue = "ü";
  var Ae = "Ä", Oe = "Ö", Ue = "Ü", sz = "ß";

  /* -------------------------------------------------------------------
     DAS WOERTERBUCH

     Exakte Wortformen, klein geschrieben. Die Grossschreibung des
     ersten Buchstabens wird beim Ersetzen uebernommen, damit
     "Staerke" zu "St<ae>rke" wird und "staerke" zu "st<ae>rke".
     ------------------------------------------------------------------- */
  var WOERTER = {
    /* aus den Quant-Daten */
    "traegt": "tr" + ae + "gt",
    "traegen": "tr" + ae + "gen",
    "beitraegt": "beitr" + ae + "gt",
    "staerke": "st" + ae + "rke",
    "staerken": "st" + ae + "rken",
    "verfuegbar": "verf" + ue + "gbar",
    "unverfuegbar": "unverf" + ue + "gbar",
    "ueber": ue + "ber",
    "darueber": "dar" + ue + "ber",
    "gegenueber": "gegen" + ue + "ber",
    "naechste": "n" + ae + "chste",
    "naechster": "n" + ae + "chster",
    "naechstes": "n" + ae + "chstes",
    "naechsten": "n" + ae + "chsten",
    "bestaetigt": "best" + ae + "tigt",
    "bestaetigten": "best" + ae + "tigten",
    "bestaetigte": "best" + ae + "tigte",
    "unbestaetigt": "unbest" + ae + "tigt",
    "rueckeroberung": "R" + ue + "ckeroberung",
    "ausfuehrung": "Ausf" + ue + "hrung",
    "persoenliche": "pers" + oe + "nliche",
    "persoenlich": "pers" + oe + "nlich",
    "persoenlicher": "pers" + oe + "nlicher",
    "verfaellt": "verf" + ae + "llt",
    "haelt": "h" + ae + "lt",
    "aufwaertsbewegung": "Aufw" + ae + "rtsbewegung",
    "abwaertsbewegung": "Abw" + ae + "rtsbewegung",
    "aufwaerts": "aufw" + ae + "rts",
    "abwaerts": "abw" + ae + "rts",
    "positionsmass": "Positionsma" + sz,
    "widerstandszone": "Widerstandszone",

    /* haeufige Formen der Autoren- und Brand-Schicht */
    "fuer": "f" + ue + "r",
    "dafuer": "daf" + ue + "r",
    "wofuer": "wof" + ue + "r",
    "koennen": "k" + oe + "nnen",
    "koennte": "k" + oe + "nnte",
    "koennten": "k" + oe + "nnten",
    "kann": "kann",
    "muessen": "m" + ue + "ssen",
    "muesste": "m" + ue + "sste",
    "waere": "w" + ae + "re",
    "waeren": "w" + ae + "ren",
    "groesser": "gr" + oe + sz + "er",
    "groesste": "gr" + oe + sz + "te",
    "groessten": "gr" + oe + sz + "ten",
    "spaeter": "sp" + ae + "ter",
    "zurueck": "zur" + ue + "ck",
    "waehrend": "w" + ae + "hrend",
    "gemaess": "gem" + ae + sz,
    "veroeffentlicht": "ver" + oe + "ffentlicht",
    "veroeffentlichen": "ver" + oe + "ffentlichen",
    "veroeffentlichung": "Ver" + oe + "ffentlichung",
    "unveraendert": "unver" + ae + "ndert",
    "veraendert": "ver" + ae + "ndert",
    "ausfaellt": "ausf" + ae + "llt",
    "unspektakulaer": "unspektakul" + ae + "r",
    "spektakulaer": "spektakul" + ae + "r",
    "regulaer": "regul" + ae + "r",
    "einschaetzung": "Einsch" + ae + "tzung",
    "einschaetzungen": "Einsch" + ae + "tzungen",
    "haette": "h" + ae + "tte",
    "haetten": "h" + ae + "tten",
    "schwaeche": "Schw" + ae + "che",
    "schwaecher": "schw" + ae + "cher",
    "moeglich": "m" + oe + "glich",
    "moegliche": "m" + oe + "gliche",
    "moeglichkeit": "M" + oe + "glichkeit",
    "unmoeglich": "unm" + oe + "glich",
    "taeglich": "t" + ae + "glich",
    "jaehrlich": "j" + ae + "hrlich",
    "monatlich": "monatlich",
    "erhoeht": "erh" + oe + "ht",
    "erhoehung": "Erh" + oe + "hung",
    "verhaeltnis": "Verh" + ae + "ltnis",
    "erklaert": "erkl" + ae + "rt",
    "erklaeren": "erkl" + ae + "ren",
    "erklaerung": "Erkl" + ae + "rung",
    "waehlen": "w" + ae + "hlen",
    "waehlt": "w" + ae + "hlt",
    "gewaehlt": "gew" + ae + "hlt",
    "beruecksichtigt": "ber" + ue + "cksichtigt",
    "beruecksichtigen": "ber" + ue + "cksichtigen",
    "zusaetzlich": "zus" + ae + "tzlich",
    "ausschliesslich": "ausschlie" + sz + "lich",
    "schliesslich": "schlie" + sz + "lich",
    "massgeblich": "ma" + sz + "geblich",
    "gebuehren": "Geb" + ue + "hren",
    "geschaeft": "Gesch" + ae + "ft",
    "geschaefts": "Gesch" + ae + "fts",
    "maerkte": "M" + ae + "rkte",
    "maerkten": "M" + ae + "rkten",
    "waehrung": "W" + ae + "hrung",
    "waehrungen": "W" + ae + "hrungen",
    "erfuellt": "erf" + ue + "llt",
    "gefuehrt": "gef" + ue + "hrt",
    "gruende": "Gr" + ue + "nde",
    "begruendung": "Begr" + ue + "ndung",
    "pruefung": "Pr" + ue + "fung",
    "geprueft": "gepr" + ue + "ft",
    "ueberprueft": ue + "berpr" + ue + "ft",
    "ueberpruefung": Ue + "berpr" + ue + "fung",
    "fruehe": "fr" + ue + "he",
    "frueh": "fr" + ue + "h",
    "frueher": "fr" + ue + "her",
    "hoehe": "H" + oe + "he",
    "hoeher": "h" + oe + "her",
    "hoechste": "h" + oe + "chste",
    "waechst": "w" + ae + "chst",
    "waechse": "w" + ae + "chse",
    "wachstum": "Wachstum",
    "loesung": "L" + oe + "sung",
    "stoerung": "St" + oe + "rung"
  };

  /* -------------------------------------------------------------------
     PRODUKTIVE ENDUNGEN

     Wortklassen, die sich nicht aufzaehlen lassen, weil die Sprache
     sie beliebig neu bildet. "-taet" hat im echten Deutschen keine
     Entsprechung: kein Wort schreibt diese vier Buchstaben so.
     ------------------------------------------------------------------- */
  var ENDUNGEN = [
    { re: /taet(en|s)?\b/g, to: "t" + ae + "t$1" },
    { re: /aet(s)?\b/g,     to: ae + "t$1" }
  ];

  /* -------------------------------------------------------------------
     ECHTES DEUTSCH

     Muster, in denen "ae", "oe" oder "ue" legitim vorkommen. Sie
     schuetzen residue() davor, korrekte Woerter zu melden.

     Die drei Vokalmuster sind der grosse Teil: jedes "au"+"e"
     (dauert, Frauen, genauer) und jedes "eu"+"e" (neue, Feuer,
     Steuer) erzeugt die Buchstabenfolge "ue", ohne dass je ein
     Umlaut gemeint war.
     ------------------------------------------------------------------- */
  var ECHT_MUSTER = [
    /aue/,              /* dauert, Frauen, genauer, Mauer */
    /eue/,              /* neue, Feuer, Steuer, treue, Abenteuer */
    /oue/,              /* Silhouette */
    /uell\b|uelle|uett|uum\b|ue\b/,  /* aktuell, Duett, Kontinuum, Statue */
    /que/,              /* Frequenz, Sequenz, konsequent, Request, Queue */
    /^zoe$|^aloe$|^poe/,             /* Zoe, Aloe, Poesie, Poet */
    /^koex|^koed/,                   /* Koexistenz, koedukativ */
    /^goethe|^boeing/,
    /^michael$|^israel$|^raphael$|^rafael$|^gael$/,
    /^aero/,                         /* Aerodynamik, Aerobic */
    /^maerz$/                        /* steht in Quant-Daten oft schon richtig */
  ];

  var VERDAECHTIG = /(ae|oe|ue)/i;

  function grossWie(vorbild, wort) {
    if (!vorbild) return wort;
    var erster = vorbild.charAt(0);
    if (erster !== erster.toUpperCase() || erster === erster.toLowerCase()) {
      return wort;
    }
    return wort.charAt(0).toUpperCase() + wort.slice(1);
  }

  /* Repariert, was das Woerterbuch kennt. Zahlen, Kennungen und
     alles andere bleiben unberuehrt. */
  function normalize(text) {
    if (text === null || text === undefined) return text;
    var s = String(text);

    s = s.replace(/[A-Za-zÀ-ɏ]+/g, function (wort) {
      var treffer = WOERTER[wort.toLowerCase()];
      if (!treffer) return wort;
      return grossWie(wort, treffer);
    });

    ENDUNGEN.forEach(function (r) {
      s = s.replace(new RegExp(r.re.source, r.re.flags), function (m, g1) {
        return r.to.replace("$1", g1 || "");
      });
    });

    return s;
  }

  /* Meldet Woerter, die nach Umschrift aussehen und weder echtes
     Deutsch noch im Woerterbuch sind. */
  function residue(text) {
    if (text === null || text === undefined) return [];
    var gefunden = [];
    var gesehen = {};

    String(text).replace(/[A-Za-z]+/g, function (wort) {
      var klein = wort.toLowerCase();
      if (!VERDAECHTIG.test(klein)) return wort;
      if (gesehen[klein]) return wort;

      /* Kennungen und Abkuerzungen in Grossbuchstaben sind keine
         Prosa: TREND_STRUCTURE, SMA, ATR. Wer sie schreibt, meint
         keinen Umlaut. */
      if (wort === wort.toUpperCase() && wort.length > 1) return wort;

      for (var i = 0; i < ECHT_MUSTER.length; i += 1) {
        if (ECHT_MUSTER[i].test(klein)) return wort;
      }

      gesehen[klein] = true;
      gefunden.push(wort);
      return wort;
    });

    return gefunden;
  }

  /* Beides in einem Schritt: reparieren, dann pruefen, was blieb. */
  function clean(text) {
    var normalisiert = normalize(text);
    return { text: normalisiert, residue: residue(normalisiert) };
  }

  var api = {
    normalize: normalize,
    residue: residue,
    clean: clean,
    WOERTER: WOERTER
  };

  if (isNode) module.exports = api;
  else global.VUSocialGermanText = api;
})(typeof window !== "undefined" ? window : globalThis);
