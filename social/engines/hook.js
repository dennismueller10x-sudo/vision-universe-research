/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/hook.js

   DER HOOK ALS EIGENES OPTIMIERUNGSOBJEKT (§9)

   -------------------------------------------------------------------------
   WAS SICH HIER AENDERT
   -------------------------------------------------------------------------

   Bisher entstand der Hook als Nebenprodukt: content.js rief
   `writer.hook()` auf, bekam EINEN Satz und arbeitete damit weiter.
   Ein Satz laesst sich pruefen, aber nicht optimieren - es gibt
   nichts, womit man ihn vergleichen koennte.

   §9 verlangt das Gegenteil: benannte Archetypen, mehrere Kandidaten,
   eine Bewertung, eine begruendete Wahl. Und ausdruecklich KEINE
   mechanische Rotation - "diesmal ist der Kontrast dran" waere wieder
   ein Verfahren ohne Urteil, nur mit mehr Schritten.

   -------------------------------------------------------------------------
   ARCHETYPEN SIND KEINE SCHABLONEN MIT LUECKEN
   -------------------------------------------------------------------------

   Jeder Archetyp sagt zuerst, WAS ER BRAUCHT. Ein Kontrast braucht
   zwei Groessen, ein Extrem braucht einen Rekord, eine Mechanik
   braucht eine Ursache. Was die Evidenz nicht hergibt, erzeugt keinen
   Kandidaten - und nicht etwa einen Kandidaten mit einer Luecke.

   Das ist dieselbe Bauart wie FORMEN.braucht in
   visual-intelligence.js, und aus demselben Grund: eine Schablone,
   die sich immer fuellen laesst, erzeugt Saetze, die immer gleich
   klingen.

   -------------------------------------------------------------------------
   DIE BEWERTUNG SENKT KEINE SCHWELLE
   -------------------------------------------------------------------------

   Zwei Sorten Befund, und sie werden nicht vermischt:

   AUSSCHLUSS - eine Zahl im Hook, die in der Evidenz nicht vorkommt;
   ein Versprechen, das der Text nicht einloest; verbotenes Register.
   Solche Kandidaten fallen RAUS. Sie bekommen keinen niedrigen Wert,
   den ein anderer Vorteil wieder ausgleichen koennte.

   BEWERTUNG - unter den zulaessigen Kandidaten entscheidet eine
   Rechnung aus benannten Anteilen. Wer gewinnt, gewinnt nachlesbar.

   Die Trennung ist der Unterschied zwischen "Qualitaetsschwelle" und
   "Gewichtung". Ein Punktesystem, in dem sich ein unbelegter Wert
   durch Kuerze retten kann, hat die Schwelle gesenkt, ohne dass es
   jemand beschlossen haette.

   -------------------------------------------------------------------------
   WAS HIER NICHT ENTSCHIEDEN WIRD
   -------------------------------------------------------------------------

   Ob ein Archetyp in der VERGANGENHEIT gut lief. Das ist §38-§41 und
   gehoert in den Lernpfad; hier gibt es nur die Stelle, an der eine
   gemessene Leistung einfliesst (`leistung`). Fehlt sie, fliesst
   NICHTS ein - und nicht etwa ein neutraler Mittelwert, der so tut,
   als waere gemessen worden.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Brand = isNode ? require("./brand.js") : global.VUSocialBrand;
  var ClaimBinding = isNode ? require("./claim-binding.js")
    : global.VUSocialClaimBinding;
  var VQ = isNode ? require("./visual-quality.js") : global.VUSocialVisualQuality;
  var German = isNode ? require("./german-text.js") : global.VUSocialGermanText;

  function zahl(x) {
    if (typeof x === "number" && isFinite(x)) return x;
    var n = parseFloat(String(x).replace(",", "."));
    return isFinite(n) ? n : null;
  }
  function gefuellt(v) { return !!(v !== null && v !== undefined && String(v).trim()); }
  function liste(v) { return Array.isArray(v) ? v.slice() : []; }

  /* Eine Zahl im veroeffentlichten Text ist deutsch, und eine
     Zeichenkette bleibt, wie die Quelle sie geschrieben hat. Die Regel
     stand hier als eigene Funktion - sie steht jetzt in
     german-text.js, weil die Claims im Zyklus dieselbe Frage hatten
     und "13.4 KGV" auf der Karte landete. Zwei Antworten auf eine
     Frage sind eine zu viel. */
  var zahlDe = German.zahl;


  /* -------------------------------------------------------------------
     DIE ARCHETYPEN

     `braucht` ist die Liste der Gegenstaende aus dem Kontext, ohne die
     dieser Hook nicht entsteht. `formulieren` baut den Satz. `erwartet`
     nennt, welche Einloesung der Text dann leisten muss - nachgeprueft
     wird sie mit Brand.hookEinloesung, nicht hier.
     ------------------------------------------------------------------- */
  var ARCHETYPEN = {
    EXTREM: {
      id: "EXTREM",
      zweck: "Ein Wert, den es so lange nicht gab. Die Seltenheit ist der " +
        "Grund hinzusehen, nicht der Wert selbst.",
      braucht: ["subjekt", "extrem"],
      risiko: "Ohne den Zeitraum ist 'so hoch wie nie' eine Behauptung.",
      erwartet: ["number"],
      formulieren: function (k) {
        return "So " + k.extrem.richtung + " wie seit " + k.extrem.seit +
          " nicht: " + k.subjekt + ".";
      }
    },

    KONTRAST: {
      id: "KONTRAST",
      zweck: "Zwei Groessen, die nicht zusammenpassen. Der Abstand ist die " +
        "Geschichte.",
      braucht: ["subjekt", "vergleich"],
      risiko: "Zwei Zahlen ohne gemeinsame Achse sind kein Kontrast.",
      erwartet: ["comparison"],
      formulieren: function (k) {
        return k.vergleich.eines + " " + zahlDe(k.vergleich.wertEines) +
          k.vergleich.einheit + ", " + k.vergleich.anderes + " " +
          zahlDe(k.vergleich.wertAnderes) + k.vergleich.einheit + ".";
      }
    },

    ZAHL_MIT_BEZUG: {
      id: "ZAHL_MIT_BEZUG",
      zweck: "Eine Zahl, die erst durch ihre Bezugsgroesse etwas heisst.",
      braucht: ["subjekt", "kennzahl"],
      risiko: "Eine Zahl ohne Bezug ist gross oder klein, aber nicht viel " +
        "oder wenig.",
      erwartet: ["number"],
      formulieren: function (k) {
        return zahlDe(k.kennzahl.wert) + k.kennzahl.einheit + " " +
          k.kennzahl.name + " - " + k.subjekt + ".";
      }
    },

    WIDERSPRUCH: {
      id: "WIDERSPRUCH",
      zweck: "Was man erwartet, und was gemessen wurde. Die Luecke dazwischen " +
        "haelt den Daumen an.",
      braucht: ["subjekt", "erwartung", "kennzahl"],
      risiko: "Die Erwartung muss benannt sein, sonst widerspricht der Satz " +
        "niemandem.",
      erwartet: ["number"],
      formulieren: function (k) {
        return k.erwartung + " Gemessen: " + zahlDe(k.kennzahl.wert) +
          k.kennzahl.einheit + ".";
      }
    },

    MECHANIK: {
      id: "MECHANIK",
      zweck: "Warum etwas so ist. Verspricht eine Erklaerung und wird nur " +
        "gebaut, wenn es eine gibt.",
      braucht: ["subjekt", "ursache"],
      risiko: "Eine Warum-Frage ohne Antwort im Text ist Clickbait - genau " +
        "die Grenze, die §11 zieht.",
      erwartet: ["reason"],
      formulieren: function (k) {
        return "Warum " + k.subjekt + ": " + k.ursache;
      }
    },

    ZEITFENSTER: {
      id: "ZEITFENSTER",
      zweck: "Was sich in einem benannten Zeitraum geaendert hat.",
      braucht: ["subjekt", "veraenderung"],
      risiko: "Ohne Anfang und Ende ist eine Veraenderung kein Zeitfenster.",
      erwartet: ["number"],
      formulieren: function (k) {
        return "Seit " + k.veraenderung.seit + ": " + k.subjekt + " " +
          k.veraenderung.richtung + " " + zahlDe(k.veraenderung.betrag) +
          k.veraenderung.einheit + ".";
      }
    },

    EINORDNUNG: {
      id: "EINORDNUNG",
      zweck: "Was der Befund fuer den Leser bedeutet - die Frage, mit der " +
        "er ohnehin hinsieht.",
      braucht: ["subjekt", "bedeutung"],
      risiko: "Bedeutung ohne Beleg ist Meinung.",
      erwartet: ["reason"],
      formulieren: function (k) {
        return k.subjekt + ": " + k.bedeutung;
      }
    }
  };

  var ARCHETYP_IDS = Object.keys(ARCHETYPEN);

  /* Was ein Gegenstand des Kontexts mindestens haben muss, damit ein
     Archetyp ihn benutzen darf. An EINEM Ort, damit zwei Archetypen
     dieselbe Frage nicht verschieden beantworten - dieselbe
     Ueberlegung wie bei VORAUSSETZUNG in visual-intelligence.js. */
  var VORAUSSETZUNG = {
    subjekt: function (k) { return gefuellt(k.subjekt); },
    extrem: function (k) {
      return !!k.extrem && gefuellt(k.extrem.richtung) && gefuellt(k.extrem.seit);
    },
    vergleich: function (k) {
      return !!k.vergleich && gefuellt(k.vergleich.eines) &&
        gefuellt(k.vergleich.anderes) &&
        zahl(k.vergleich.wertEines) !== null &&
        zahl(k.vergleich.wertAnderes) !== null;
    },
    kennzahl: function (k) {
      return !!k.kennzahl && gefuellt(k.kennzahl.name) &&
        zahl(k.kennzahl.wert) !== null;
    },
    erwartung: function (k) { return gefuellt(k.erwartung); },
    ursache: function (k) { return gefuellt(k.ursache); },
    veraenderung: function (k) {
      return !!k.veraenderung && gefuellt(k.veraenderung.seit) &&
        gefuellt(k.veraenderung.richtung) &&
        zahl(k.veraenderung.betrag) !== null;
    },
    bedeutung: function (k) { return gefuellt(k.bedeutung); }
  };

  /* -------------------------------------------------------------------
     NORMALISIEREN HEISST ERGAENZEN, NICHT AUSSIEBEN

     Der erste Entwurf zaehlte die Felder auf, die er kannte, und gab
     genau die zurueck. `belege` war nicht dabei - und fiel damit
     lautlos heraus. Die Kandidaten trugen `belege: []`, die Claims
     bekamen nichts, und die Faktenpruefung meldete "184,2 USD ohne
     Beleg". Der Satz war richtig, die Herkunft war unterwegs
     verlorengegangen.

     Dieselbe Fehlerfamilie, die dieses Projekt beim Namen nennt: eine
     von Hand gefuehrte Feldliste, aus der ein Feld faellt. Deshalb
     wird jetzt vom Original ausgegangen und nur ueberschrieben, was
     wirklich umgeformt werden muss.
     ------------------------------------------------------------------- */
  function normalisiere(kontext) {
    var k = kontext || {};
    function einheit(e) { return gefuellt(e) ? " " + String(e).trim() : ""; }
    return Object.assign({}, k, {
      subjekt: gefuellt(k.subjekt) ? String(k.subjekt).trim() : null,
      extrem: k.extrem || null,
      vergleich: k.vergleich
        ? Object.assign({}, k.vergleich, { einheit: einheit(k.vergleich.einheit) })
        : null,
      kennzahl: k.kennzahl
        ? Object.assign({}, k.kennzahl, { einheit: einheit(k.kennzahl.einheit) })
        : null,
      erwartung: gefuellt(k.erwartung) ? String(k.erwartung).trim() : null,
      ursache: gefuellt(k.ursache) ? String(k.ursache).trim() : null,
      veraenderung: k.veraenderung
        ? Object.assign({}, k.veraenderung, { einheit: einheit(k.veraenderung.einheit) })
        : null,
      bedeutung: gefuellt(k.bedeutung) ? String(k.bedeutung).trim() : null
    });
  }

  /**
   * Alle Kandidaten, die die Evidenz hergibt.
   *
   * Ein Archetyp ohne seine Voraussetzungen erzeugt nichts und sagt,
   * was fehlte. Das ist kein Fehler, sondern der Normalfall: nicht
   * jede Lage traegt jeden Einstieg.
   */
  function kandidaten(kontext) {
    var k = normalisiere(kontext);
    var gebaut = [], verworfen = [];

    ARCHETYP_IDS.forEach(function (id) {
      var a = ARCHETYPEN[id];
      var fehlt = a.braucht.filter(function (b) {
        var v = VORAUSSETZUNG[b];
        return !v || !v(k);
      });
      if (fehlt.length) {
        verworfen.push({ archetyp: id, fehlt: fehlt });
        return;
      }
      var text;
      try { text = a.formulieren(k); } catch (e) {
        verworfen.push({ archetyp: id, fehlt: ["formulierung:" + e.message] });
        return;
      }
      if (!gefuellt(text)) {
        verworfen.push({ archetyp: id, fehlt: ["leerer Satz"] });
        return;
      }
      /* Welche Belege dieser Satz benutzt: genau die, deren Gegenstand
         in `braucht` steht. Keine Liste von Hand - sonst faellt beim
         naechsten Archetyp einer heraus, und die Zahl steht unbelegt
         im Text. */
      var q = (k.belege || {});
      var benutzt = [];
      a.braucht.forEach(function (b) {
        var e = q[b];
        if (!e) return;
        (Array.isArray(e) ? e : [e]).forEach(function (f) { benutzt.push(f); });
      });

      gebaut.push({ archetyp: id, text: String(text).trim(),
        erwartet: a.erwartet.slice(), belege: benutzt });
    });

    return { kandidaten: gebaut, verworfen: verworfen };
  }

  /* -------------------------------------------------------------------
     DEN KONTEXT AUS DEM ABLEITEN, WAS SCHON DASTEHT

     Nicht erfinden und nicht nachtragen. Die Research-Stufe liefert
     `facts` als {metric, value, unit, entity} - daraus entstehen
     Subjekt, Kennzahl und, wenn zwei Belege DIESELBE Kennzahl fuer
     verschiedene Gegenstaende tragen, ein Vergleich auf einer Achse.

     Alles Weitere (ein Rekord, eine Ursache, eine Erwartung) steht in
     den heutigen Belegen nicht. Dann entstehen die zugehoerigen
     Archetypen eben nicht, und `waehle` sagt, welche und woran es
     lag. Ein Feld mit einem plausiblen Satz zu fuellen waere genau
     die erfundene Evidenz, die §4 verbietet.
     ------------------------------------------------------------------- */
  function ableiten(spec) {
    spec = spec || {};
    var fakten = liste(spec.facts).filter(function (f) {
      return f && zahl(f.value) !== null; });
    var erstes = fakten[0] || null;

    var subjekt = gefuellt(spec.subjekt) ? spec.subjekt
      : (erstes && gefuellt(erstes.entity)) ? erstes.entity
        : (spec.opportunity && gefuellt(spec.opportunity.topic))
          ? spec.opportunity.topic : null;

    var kennzahl = erstes
      ? { name: erstes.metric, wert: erstes.value, einheit: erstes.unit || "" }
      : null;

    /* -----------------------------------------------------------------
       DIE ZAHL BRINGT IHREN BELEG MIT

       Sobald der Hook eine Zahl traegt, ist er belegpflichtig wie jeder
       andere Satz. Bis hierher stand der Hook neben den Claims: der
       Autor baute seine Claims aus den Fakten, die ER benutzte, und
       der Hook war einer von beiden - meistens ohne Zahl.

       Mit den Archetypen aendert sich das: ZAHL_MIT_BEZUG und KONTRAST
       setzen Werte in den Satz. Die Faktenpruefung hat das sofort
       gemeldet ("184,2 USD ohne Beleg"), und sie hatte recht.

       Deshalb reist der Beleg von hier an mit dem Kandidaten mit -
       nicht als nachgetragene Behauptung, sondern als derselbe
       Quellenverweis, aus dem der Wert stammt.
       ----------------------------------------------------------------- */
    var belege = { kennzahl: erstes || null, vergleich: null };

    /* Ein Vergleich braucht EINE Achse. Zwei Belege mit verschiedenen
       Kennzahlen nebeneinanderzustellen waere genau die ungleiche
       Achse, die visual-composition.js an der Grafik verbietet. */
    var vergleich = null;
    for (var i = 0; i < fakten.length && !vergleich; i++) {
      for (var j = i + 1; j < fakten.length; j++) {
        var a = fakten[i], b = fakten[j];
        if (a.metric && a.metric === b.metric &&
            gefuellt(a.entity) && gefuellt(b.entity) && a.entity !== b.entity) {
          vergleich = { eines: a.entity, wertEines: a.value,
            anderes: b.entity, wertAnderes: b.value,
            einheit: a.unit || a.metric };
          belege.vergleich = [a, b];
          break;
        }
      }
    }

    return {
      subjekt: subjekt,
      kennzahl: kennzahl,
      vergleich: vergleich,
      belege: belege,
      /* Diese vier stehen in den heutigen Belegen nicht. Sie bleiben
         leer, und das ist eine Aussage ueber die Evidenz. */
      extrem: spec.extrem || null,
      ursache: spec.ursache || null,
      erwartung: spec.erwartung || null,
      veraenderung: spec.veraenderung || null,
      bedeutung: spec.bedeutung || null,
      body: spec.body || null,
      caption: spec.caption || null,
      thesis: spec.thesis || null,
      evidence: liste(spec.evidence),
      leistung: spec.leistung || null,
      maxLaenge: spec.maxLaenge
    };
  }

  /* -------------------------------------------------------------------
     AUSSCHLUSSGRUENDE — KEINE ABZUEGE, SONDERN TUEREN

     Jeder hat einen Namen, weil ein verworfener Kandidat sonst nur
     verschwindet und niemand nachlesen kann, woran es lag.
     ------------------------------------------------------------------- */
  var AUSSCHLUSS = {
    UNBELEGTE_ZAHL: "UNBELEGTE_ZAHL",
    VERSPRECHEN_OFFEN: "VERSPRECHEN_OFFEN",
    REGISTER: "REGISTER",
    ZU_LANG: "ZU_LANG",
    DOPPELT_ZUR_CAPTION: "DOPPELT_ZUR_CAPTION"
  };

  /* Die Anteile der Bewertung. Sie stehen hier als Zahlen, damit eine
     Aenderung eine Codeaenderung mit Begruendung ist - und damit
     nachlesbar bleibt, warum ein Kandidat gewonnen hat. */
  var GEWICHTE = {
    /* Wie viele der ausgeloesten Versprechen der Text wirklich
       einloest. Ein Hook, der nichts verspricht, bekommt hier nichts -
       er hat auch nichts eingeloest. */
    einloesung: 30,
    /* Kuerze, gemessen an der Markengrenze. Nicht "kurz ist gut",
       sondern: je naeher an der Grenze, desto weniger. */
    kuerze: 20,
    /* Traegt der Satz den Gegenstand UND eine Zahl? Beides zusammen
       macht ihn ueberpruefbar statt bloss behauptend. */
    konkret: 30,
    /* Steht er eigenstaendig neben der Caption? */
    eigenstaendig: 20
  };

  function bewerte(kandidat, kontext) {
    var k = kontext || {};
    var text = String(kandidat.text || "");
    var body = String(k.body || k.caption || "");
    var ausschluss = [];
    var teile = {};

    /* --- Tueren ------------------------------------------------- */

    /* Jede Zahl im Hook muss in der Evidenz stehen. Die Pruefung dafuer
       gibt es seit dem Claim Binding; sie hier nachzubauen hiesse, zwei
       Antworten auf dieselbe Frage zu haben. */
    if (Array.isArray(k.evidence) && k.evidence.length) {
      var bindung = ClaimBinding.check(text, k.evidence);
      if (!bindung.ok) {
        ausschluss.push({ id: AUSSCHLUSS.UNBELEGTE_ZAHL,
          satz: "Im Hook steht etwas, das die Evidenz nicht deckt: " +
            (bindung.problems || []).map(function (p) {
              return p.message || p.id; }).join(" ") });
      }
    }

    var einloesung = Brand.hookEinloesung(text, body);
    if (body && !einloesung.ok) {
      ausschluss.push({ id: AUSSCHLUSS.VERSPRECHEN_OFFEN,
        satz: einloesung.offen.map(function (p) { return p.message; }).join(" ") });
    }

    /* Nur das, was AM TEXT liegt. Der erste Entwurf rief Brand.check()
       auf den Kandidaten - und schloss damit einen korrekten Hook aus,
       weil dem BEITRAG der Pflichthinweis bei Einzelwerten fehlte. Den
       kann ein Hook nicht tragen; er ist auch nicht der Ort dafuer.
       Ein Tor an der falschen Grenze weist richtigen Text ab. */
    var register = Brand.textRegister(text);
    if (!register.ok) {
      ausschluss.push({ id: AUSSCHLUSS.REGISTER,
        satz: register.blocking.map(function (b) { return b.message; }).join(" ") });
    }

    var grenze = zahl(k.maxLaenge) !== null ? zahl(k.maxLaenge)
      : Brand.LIMITS.maxHookLength;
    if (text.length > grenze) {
      ausschluss.push({ id: AUSSCHLUSS.ZU_LANG,
        satz: text.length + " Zeichen, erlaubt sind " + grenze + "." });
    }

    var ueberschneidung = k.caption
      ? VQ.overlap(text, String(k.caption).slice(0, 220)) : 0;
    if (ueberschneidung >= VQ.GRENZEN.redundanz) {
      ausschluss.push({ id: AUSSCHLUSS.DOPPELT_ZUR_CAPTION,
        satz: "Zu " + Math.round(ueberschneidung * 100) + " % dieselben " +
          "Woerter wie der Anfang der Caption." });
    }

    /* --- Bewertung ---------------------------------------------- */

    teile.einloesung = einloesung.ausgeloest.length
      ? (einloesung.eingeloest / einloesung.ausgeloest.length) * GEWICHTE.einloesung
      : 0;

    teile.kuerze = Math.max(0, (1 - (text.length / grenze))) * GEWICHTE.kuerze;

    var hatSubjekt = !!(kontext && kontext.subjekt) &&
      text.toLowerCase().indexOf(String(kontext.subjekt).toLowerCase()) !== -1;
    var hatZahl = /\d/.test(text);
    teile.konkret = ((hatSubjekt ? 0.5 : 0) + (hatZahl ? 0.5 : 0)) *
      GEWICHTE.konkret;

    teile.eigenstaendig = (1 - Math.min(1, ueberschneidung /
      VQ.GRENZEN.redundanz)) * GEWICHTE.eigenstaendig;

    var punkte = Object.keys(teile).reduce(function (s, n) {
      return s + teile[n]; }, 0);

    /* -----------------------------------------------------------------
       GEMESSENE LEISTUNG — ODER GAR KEINE

       Wenn der Lernpfad (§38-§41) eine gemessene Leistung dieses
       Archetyps liefert, verschiebt sie das Ergebnis. Fehlt sie,
       passiert NICHTS. Ein neutraler Mittelwert waere eine erfundene
       Messung, und erfundene Messungen sind in diesem Projekt schon
       einmal als Bericht durchgegangen.
       ----------------------------------------------------------------- */
    var leistung = (k.leistung && typeof k.leistung === "object")
      ? zahl(k.leistung[kandidat.archetyp]) : null;
    if (leistung !== null) {
      teile.leistung = leistung;
      punkte += leistung;
    }

    return {
      archetyp: kandidat.archetyp,
      text: text,
      belege: liste(kandidat.belege),
      zulaessig: ausschluss.length === 0,
      ausschluss: ausschluss,
      teile: teile,
      punkte: Math.round(punkte * 100) / 100,
      /* Ohne gemessene Leistung steht das ausdruecklich da, statt
         dass eine fehlende Zahl wie eine Null aussieht. */
      leistungGemessen: leistung !== null,
      erklaerung: ausschluss.length
        ? "Ausgeschlossen: " + ausschluss.map(function (a) {
            return a.id; }).join(", ") + "."
        : Object.keys(teile).map(function (n) {
            return n + " " + Math.round(teile[n] * 10) / 10; }).join(", ")
    };
  }

  /**
   * Der gewaehlte Hook - und die unterlegenen Kandidaten dazu.
   *
   * Die Unterlegenen bleiben stehen. Ohne sie koennte der Lernpfad
   * spaeter nie fragen, ob die Wahl die richtige war: man saehe nur,
   * was lief, nie, was zur Wahl stand.
   */
  function waehle(kontext) {
    var erzeugt = kandidaten(kontext);

    /* -----------------------------------------------------------------
       DER BESTEHENDE AUTOR TRITT MIT AN

       content.js hat seit jeher einen deterministischen Schreiber, und
       sein Satz ist oft richtig. Ihn zu ersetzen hiesse, fertige
       Arbeit neu zu bauen; ihn zu uebergehen hiesse, eine Moeglichkeit
       wegzuwerfen.

       Er tritt deshalb als Kandidat AUTOR an - auf derselben Skala,
       durch dieselben Tueren. Gewinnt er, gewinnt er nachlesbar.
       ----------------------------------------------------------------- */
    liste(kontext && kontext.zusaetzlich).forEach(function (z) {
      if (!z || !gefuellt(z.text)) return;
      erzeugt.kandidaten.push({
        archetyp: gefuellt(z.archetyp) ? String(z.archetyp) : "AUTOR",
        text: String(z.text).trim(),
        erwartet: liste(z.erwartet),
        belege: liste(z.belege)
      });
    });

    if (!erzeugt.kandidaten.length) {
      return {
        ok: false,
        grund: "KEIN_KANDIDAT",
        gewaehlt: null,
        bewertet: [],
        verworfen: erzeugt.verworfen,
        erklaerung: "Die Evidenz traegt keinen der " + ARCHETYP_IDS.length +
          " Archetypen. Fehlend: " + erzeugt.verworfen.map(function (v) {
            return v.archetyp + " (" + v.fehlt.join(", ") + ")"; }).join("; ") +
          ". Das ist ein Befund ueber die Vorarbeit, kein Grund, einen " +
          "Satz zu erfinden."
      };
    }

    var bewertet = erzeugt.kandidaten.map(function (kd) {
      return bewerte(kd, kontext); });
    var zulaessig = bewertet.filter(function (b) { return b.zulaessig; });

    if (!zulaessig.length) {
      return {
        ok: false,
        grund: "ALLE_AUSGESCHLOSSEN",
        gewaehlt: null,
        bewertet: bewertet,
        verworfen: erzeugt.verworfen,
        erklaerung: bewertet.length + " Kandidaten, alle ausgeschlossen: " +
          bewertet.map(function (b) {
            return b.archetyp + " (" + b.ausschluss.map(function (a) {
              return a.id; }).join(", ") + ")"; }).join("; ") +
          ". Eine Schwelle wird dafuer nicht gesenkt."
      };
    }

    /* Nach Punkten, und bei Gleichstand nach der Reihenfolge der
       Archetypen - deterministisch, damit derselbe Kontext denselben
       Hook ergibt. Zufall waere hier nicht Vielfalt, sondern
       Unreproduzierbarkeit. */
    var sortiert = zulaessig.slice().sort(function (a, b) {
      if (b.punkte !== a.punkte) return b.punkte - a.punkte;
      /* Bei Gleichstand die Reihenfolge der Archetypen. Ein Kandidat
         von aussen (AUTOR) steht nicht darin und bekommt deshalb den
         letzten Platz - nicht den ersten, den indexOf() mit -1 sonst
         ergaebe. */
      var ia = ARCHETYP_IDS.indexOf(a.archetyp);
      var ib = ARCHETYP_IDS.indexOf(b.archetyp);
      return (ia === -1 ? ARCHETYP_IDS.length : ia) -
        (ib === -1 ? ARCHETYP_IDS.length : ib);
    });

    var sieger = sortiert[0];
    var zweiter = sortiert[1] || null;

    return {
      ok: true,
      gewaehlt: sieger,
      /* Alle, auch die ausgeschlossenen: der Lernpfad soll sehen,
         was zur Wahl stand. */
      bewertet: bewertet,
      verworfen: erzeugt.verworfen,
      abstand: zweiter ? Math.round((sieger.punkte - zweiter.punkte) * 100) / 100
        : null,
      erklaerung: sieger.archetyp + " mit " + sieger.punkte + " Punkten" +
        (zweiter ? ", vor " + zweiter.archetyp + " (" + zweiter.punkte + ")"
          : " (einziger zulaessiger Kandidat)") + ". " +
        (sieger.leistungGemessen
          ? "Mit gemessener Leistung dieses Archetyps."
          : "Ohne gemessene Leistung - noch keine aus eigenen Beitraegen.")
    };
  }

  var api = {
    ARCHETYPEN: ARCHETYPEN,
    ARCHETYP_IDS: ARCHETYP_IDS,
    VORAUSSETZUNG: VORAUSSETZUNG,
    AUSSCHLUSS: AUSSCHLUSS,
    GEWICHTE: GEWICHTE,
    ableiten: ableiten,
    kandidaten: kandidaten,
    bewerte: bewerte,
    waehle: waehle
  };

  if (isNode) module.exports = api;
  else global.VUSocialHook = api;
})(typeof window !== "undefined" ? window : globalThis);
