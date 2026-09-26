/* =========================================================================
   DIE ZUSAMMENHÄNGENDE AUSKUNFT ÜBER EINE AKTIE — REGELBASIERT.

   Gemessen am 26.09.2026 über die zwölf Archetypen der Stichprobe: die
   Module sagen einzeln die Wahrheit und zusammen nicht dasselbe.

     1. 743 Titel trugen den Satz „X ist mit schwach die klarste Stärke."
        Er ist aus gemessenen Zahlen gebaut und trotzdem falsch: die
        SCHWÄCHSTE Eigenschaft eines schwachen Titels ist keine Stärke, und
        „stark" und „schwach" im selben Satz macht aus einer Einordnung ein
        Rätsel. Deshalb ist „Stärke" hier an das Band gebunden und nicht an
        die Reihenfolge: wer nicht über dem Mittelfeld liegt, wird nicht als
        Stärke genannt.

     2. Die Reise beantwortete elf Fragen an elf Stellen und keine davon
        zusammen. Ein Leser bekam Kursstärke in der Leiste, die Bewegung im
        Gitter, das Setup in der Kaskade, Chance und Risiko in der
        Mustertabelle - und musste sich den Satz selbst bilden, den er
        eigentlich gesucht hat.

   WAS DIESES MODUL TUT: aus der bereits veröffentlichten Evidenz EINE
   Auskunft bilden - ein Satz, drei Gruppen (dafür, dagegen, noch nicht
   bewertbar), der Setup-Zustand mit seinen vier Fragen, der Anlagestil in
   Alltagssprache und die Asymmetrie ähnlicher Lagen.

   WAS ES NICHT TUT: rechnen, Schwellen erfinden, Daten lesen, eine Prognose
   bilden, eine Empfehlung geben. Es bekommt die Antworten der Dienste
   übergeben und ordnet sie. Jede einzelne Aussage trägt ihren Beleg mit
   (`evidence`), und eine Aussage ohne Beleg entsteht hier nicht - ein Test
   hält das gegen jede Aussage, die dieses Modul erzeugen kann.

   Die Bänder, die Asymmetriegrenzen und die Stilschwelle sind KEINE neuen
   Zahlen: sie stehen in quant-v2.json (ratingBands), im Musterartefakt
   (asymmetry) und in der Reisemessung (40 % Stilpassung). Ein zweiter Satz
   Schwellen hier wäre eine zweite Methodik.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var FactorEvidence = isNode ? require("./factor-evidence.js") : global.VUFactorEvidence;

  var SCHEMA_VERSION = "intelligence-brief-1.0.0";

  /* Welche Bänder als Stärke und welche als Schwäche gelten - GELESEN und
     nicht wiederholt. Die Faktor-Engine führt diese Grenze, seit derselbe
     Fehler ihren eigenen Zusammenfassungssatz betraf; zwei Kopien davon
     wären zwei Definitionen von „Stärke" auf einer Seite. NEUTRAL gehört in
     keine von beiden: „liegt im mittleren Bereich" ist weder das eine noch
     das andere, und genau diese Lücke war der Fehler in den 743 Sätzen. */
  var STRENGTH_BANDS = FactorEvidence.STRENGTH_BANDS;
  var WEAKNESS_BANDS = FactorEvidence.WEAKNESS_BANDS;

  /* Die Asymmetriegrenzen der Musterfläche, unverändert übernommen. */
  var ASYMMETRY_UP = 1.1;
  var ASYMMETRY_DOWN = 0.9;

  /* Ab welcher Passung ein Stil „passt". Dieselbe Zahl führt die
     Reisemessung als Schwelle für ein ausdrückliches Nein. */
  var STYLE_FIT = 40;

  /* Wie nah am Jahreshoch als „Nähe" gilt - dieselbe Zahl, die die
     reduzierte Kursstruktur-Auskunft schon benutzt. */
  var NEAR_HIGH = -0.1;

  /* ---------------------------------------------------------------------
     DIE SÄTZE JE EIGENSCHAFT.

     Eine Eigenschaft in Alltagssprache, in zwei Richtungen. Das ist NICHT
     die Wiederholung des Faktorwerts: „Bewertung: Position 18 %" sagt einem
     Anfänger nichts, „eine hohe Bewertung" sagt es ihm. Die Richtung ist
     dabei der Punkt, an dem eine Verwechslung teuer wäre: ein HOHER
     Bewertungsscore heißt GÜNSTIG bewertet, weil die Methodik den Kehrwert
     einordnet. Wer das umdreht, schreibt das Gegenteil hin.
     --------------------------------------------------------------------- */
  var PHRASES = {
    quality:       { high: "eine solide Bilanz",             low: "eine angreifbare Bilanz" },
    growth:        { high: "kräftiges Wachstum",             low: "schwaches Wachstum" },
    momentum:      { high: "eine starke Kursentwicklung",    low: "eine schwache Kursentwicklung" },
    value:         { high: "eine günstige Bewertung",        low: "eine hohe Bewertung" },
    profitability: { high: "eine hohe Ertragskraft",         low: "eine schwache Ertragskraft" },
    revisions:     { high: "steigende Erwartungen",          low: "fallende Erwartungen" },
    risk:          { high: "ruhige Kursschwankungen",        low: "starke Kursschwankungen" }
  };

  /* Der Setup-Zustand als Satz. Die internen Namen stehen im Wörterbuch;
     hier steht, was der Zustand für die Auskunft oben bedeutet. */
  var SETUP_SENTENCE = {
    CONFIRMED:      "Ein bestätigtes Setup liegt vor.",
    SETUP_FORMING:  "Ein Setup ist im Aufbau, aber noch nicht bestätigt.",
    WATCH:          "Ein bestätigtes Setup liegt noch nicht vor; die Lage ist beobachtungswürdig.",
    NO_SETUP:       "Ein Setup liegt derzeit nicht vor.",
    ACTIVE:         "Ein Setup läuft.",
    RISK_RISING:    "Das Risiko in einem laufenden Setup nimmt zu.",
    INVALIDATED:    "Ein Setup ist ungültig geworden.",
    EXIT:           "Ein Setup ist beendet."
  };
  var SETUP_LABEL = {
    CONFIRMED: "Bestätigt", SETUP_FORMING: "Im Aufbau", WATCH: "Beobachten",
    NO_SETUP: "Kein Setup", ACTIVE: "Läuft", RISK_RISING: "Risiko steigt",
    INVALIDATED: "Ungültig", EXIT: "Beendet"
  };

  /* ---------------------------------------------------------------------
     WELCHE VERÄNDERUNG ZU WELCHER EIGENSCHAFT GEHÖRT.

     Gemessen am ersten Lauf dieses Moduls: AAPL bekam zehn Zeilen in der
     Spalte „spricht dafür", und sieben davon sagten dieselbe Sache -
     Kurstempo, Stärke gegenüber dem Markt, Trendstruktur und Nähe zum
     Jahreshoch sind vier Messungen derselben Kursbewegung, die eine Zeile
     darüber schon als Stärke genannt war. Eine Liste, in der eine Aussage
     siebenmal steht, ist keine Abwägung mehr.

     Deshalb diese Zuordnung: je Eigenschaft höchstens eine Veränderung, und
     keine, wenn die Eigenschaft in derselben Spalte schon steht. Die Tabelle
     ist Darstellung und keine Methodik - ein Test hält sie gegen die
     Veränderungs-Engine, damit eine neue Veränderung nicht lautlos
     durchfällt.
     --------------------------------------------------------------------- */
  var CHANGE_FACTOR = {
    momentumPace: "momentum",
    relativeStrengthPace: "momentum",
    trendStructure: "momentum",
    highProximity: "momentum",
    volatilityRegime: "risk",
    volumeRegime: null,
    revenueAcceleration: "growth",
    grossMarginChange: "profitability",
    fcfMarginChange: "profitability",
    revisionsTrend: "revisions",
    scoreMomentum: null
  };

  /* Die Reihenfolge der Aussagen in einer Spalte. Eine Eigenschaft wiegt
     schwerer als eine Veränderung derselben Eigenschaft, und die
     Kursstruktur steht dazwischen. Das ist Lesereihenfolge und kein Rang. */
  var WEIGHT = { factor: 0, pattern: 1, price: 2, change: 3 };

  function finite(value) { return typeof value === "number" && Number.isFinite(value); }
  function prozent(value) {
    return finite(value) ? value.toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " %" : null;
  }
  function anteil(value) {
    return finite(value) ? (value * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " %" : null;
  }
  function gross(text) {
    return typeof text === "string" && text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }
  function verbinde(teile) {
    if (!teile.length) return "";
    if (teile.length === 1) return teile[0];
    return teile.slice(0, -1).join(", ") + " und " + teile[teile.length - 1];
  }

  /* Ein Beleg ist eine Quelle, ein Feld und ein Wert. Weniger ist keiner:
     „steigende Profitabilität" ohne die Zahl dahinter wäre eine Behauptung,
     und dieses Modul soll genau die nicht erzeugen. */
  function beleg(source, field, value, unit) {
    return { source: source, field: field, value: value === undefined ? null : value, unit: unit || null };
  }

  /* ---------------------------------------------------------------------
     WAS DIE STÄRKE ODER SCHWÄCHE TREIBT.

     Innerhalb einer bewerteten Eigenschaft ist das die Einzelkennzahl mit
     dem höchsten (bei einer Schwäche: niedrigsten) Wert. Ihre Bezeichnung
     steht im Artefakt und ist bereits Alltagssprache - es wird keine zweite
     erfunden.
     --------------------------------------------------------------------- */
  function treiber(factor, richtung) {
    var mit = (factor.components || []).filter(function (c) {
      return c.state === "AVAILABLE" && finite(c.score);
    });
    if (!mit.length) return null;
    var sortiert = mit.slice().sort(function (a, b) {
      return richtung === "low" ? a.score - b.score : b.score - a.score;
    });
    return sortiert[0];
  }

  function factorAussage(factor, richtung) {
    var phrase = PHRASES[factor.id] ? PHRASES[factor.id][richtung] : null;
    if (!phrase) return null;
    var fahrer = treiber(factor, richtung);
    return {
      kind: "factor", factorId: factor.id, weight: WEIGHT.factor,
      text: gross(phrase),
      why: fahrer ? fahrer.label + (finite(fahrer.raw) ? " · " + fahrer.raw.toLocaleString("de-DE", { maximumFractionDigits: 2 }) : "")
        : (factor.bandPlain || null),
      evidence: [beleg("factorEvidence", factor.id, factor.score, "percentile")]
        .concat(fahrer ? [beleg("factorComponent", factor.id + "." + fahrer.id, fahrer.raw, fahrer.unit || null)] : [])
    };
  }

  /* ---------------------------------------------------------------------
     DER EINE SATZ.

     Aufbau, immer gleich: Stärken, dann Schwächen, dann das Setup. Ein Satz
     ohne bewertete Eigenschaft sagt genau das und nennt den Grund - er
     erfindet nicht eine dritte Formulierung für „keine Daten".
     --------------------------------------------------------------------- */
  function headline(factors, setupState, unavailableHeadline) {
    var bewertet = factors.filter(function (f) { return f.state === "AVAILABLE" && finite(f.score); });
    var stark = bewertet.filter(function (f) { return STRENGTH_BANDS.indexOf(f.band) >= 0; })
      .sort(function (a, b) { return b.score - a.score; }).slice(0, 2);
    var schwach = bewertet.filter(function (f) { return WEAKNESS_BANDS.indexOf(f.band) >= 0; })
      .sort(function (a, b) { return a.score - b.score; }).slice(0, 2);

    var teile = [], belege = [], zustand = "UNAVAILABLE";
    if (stark.length) {
      teile.push("Die Aktie zeigt " + verbinde(stark.map(function (f) { return PHRASES[f.id].high; })));
      if (schwach.length) teile[0] += ", dagegen " + verbinde(schwach.map(function (f) { return PHRASES[f.id].low; }));
      teile[0] += ".";
      zustand = "AVAILABLE";
    } else if (schwach.length) {
      teile.push("Die Aktie zeigt " + verbinde(schwach.map(function (f) { return PHRASES[f.id].low; })) + ".");
      zustand = "AVAILABLE";
    } else if (bewertet.length) {
      /* Der Fall, der die 743 Sätze erzeugt hat: alles bewertet, nichts
         auffällig. Das ist eine Aussage und keine Lücke. */
      teile.push("Keine der " + bewertet.length + " bewerteten Eigenschaften liegt über oder unter dem Mittelfeld des Vergleichs.");
      zustand = "AVAILABLE";
    } else {
      /* OHNE EINE BEWERTETE EIGENSCHAFT SOLL DER GRUND IM SATZ STEHEN.
       *
       * Gemessen: 784 der 786 Titel ohne einen einzigen Faktorwert werden
       * einfach noch nicht lange genug gehandelt - das ändert sich von
       * selbst, und für einen Leser ist das eine völlig andere Auskunft als
       * „nicht bewertbar". Die Zahl kommt aus der Faktor-Engine, die sie
       * ohnehin je Faktor führt; genannt wird die NÄCHSTE Schwelle, nicht
       * die höchste. */
      var grenze = null;
      factors.forEach(function (f) {
        if (!f.history || !finite(f.history.requiredBars)) return;
        if (!grenze || f.history.requiredBars < grenze.requiredBars) grenze = f.history;
      });
      if (grenze && finite(grenze.bars)) {
        teile.push("Für eine Einordnung dieses Titels werden " + grenze.requiredBars +
          " Handelstage benötigt; aktuell liegen " + grenze.bars + " vor.");
        belege.push(beleg("factorEvidence", "bars", grenze.bars, "sessions"));
      } else {
        teile.push(unavailableHeadline || "Für diesen Titel ist noch keine der sieben Eigenschaften bewertbar.");
      }
    }
    /* Auch der Satz „nichts liegt über oder unter dem Mittelfeld" ist eine
       Aussage über gemessene Werte und trägt deshalb deren Belege - sonst
       stünde genau die Aussage ohne Beleg da, die dieses Modul verhindern
       soll. */
    (stark.length || schwach.length ? stark.concat(schwach) : bewertet).forEach(function (f) {
      belege.push(beleg("factorEvidence", f.id, f.score, "percentile"));
    });

    var setupSatz = setupState && SETUP_SENTENCE[setupState] ? SETUP_SENTENCE[setupState] : null;
    if (setupSatz) { teile.push(setupSatz); belege.push(beleg("setupObservation", "classification.state", setupState, null)); }

    return {
      sentence: teile.join(" "),
      state: zustand === "AVAILABLE" && setupSatz ? "COMPLETE" : (zustand === "AVAILABLE" || setupSatz ? "PARTIAL" : "UNAVAILABLE"),
      strengths: stark.map(function (f) { return f.id; }),
      weaknesses: schwach.map(function (f) { return f.id; }),
      setupState: setupState || null,
      evidence: belege
    };
  }

  /* ---------------------------------------------------------------------
     DAFÜR, DAGEGEN, NOCH NICHT BEWERTBAR.

     Die drei Gruppen sind nicht drei Sortierungen derselben Liste: die
     dritte trägt, was ausdrücklich NICHT bewertet wurde, und ohne sie liest
     sich eine kurze Dafür-Liste wie ein Urteil. Jede Aussage nennt ihren
     Beleg; die Zahl steht in der zweiten Zeile und nicht im Satz, damit die
     Gruppe lesbar bleibt.
     --------------------------------------------------------------------- */
  function groups(sources, factors) {
    var pro = [], contra = [], unknown = [];

    factors.forEach(function (factor) {
      if (factor.state === "AVAILABLE" && finite(factor.score)) {
        if (STRENGTH_BANDS.indexOf(factor.band) >= 0) { var p = factorAussage(factor, "high"); if (p) pro.push(p); }
        else if (WEAKNESS_BANDS.indexOf(factor.band) >= 0) { var c = factorAussage(factor, "low"); if (c) contra.push(c); }
        return;
      }
      /* Nicht bewertbar - mit dem Grund, den die Faktor-Engine schon in
         Alltagssprache führt. Ein zweiter Satz dafür wäre eine zweite
         Erklärung für eine Ursache. */
      unknown.push({
        kind: "factor", factorId: factor.id, weight: WEIGHT.factor,
        text: factor.label,
        why: factor.reasonHeadline || null,
        reason: factor.reason || null,
        explanation: factor.reasonText || null,
        evidence: [beleg("factorEvidence", factor.id + ".reason", factor.reason || null, null)]
      });
    });

    /* Welche Eigenschaften in welcher Spalte schon genannt sind - eine
       Veränderung derselben Eigenschaft sagt dort nichts Neues. */
    var genannt = { pro: {}, contra: {} };
    pro.forEach(function (e) { if (e.factorId) genannt.pro[e.factorId] = true; });
    contra.forEach(function (e) { if (e.factorId) genannt.contra[e.factorId] = true; });

    var change = sources.change || (sources.factors && sources.factors.change) || null;
    var belegtGruppe = { pro: {}, contra: {} };
    ((change && change.items) || []).forEach(function (item) {
      if (item.state !== "AVAILABLE") return;
      var spalte = item.direction === "IMPROVING" ? "pro" : item.direction === "DETERIORATING" ? "contra" : null;
      if (!spalte) return;
      var gruppe = Object.prototype.hasOwnProperty.call(CHANGE_FACTOR, item.id) ? CHANGE_FACTOR[item.id] : undefined;
      /* Eine Veränderung, die dieses Modul nicht kennt, verschwindet nicht -
         sie steht ohne Gruppe und wird gezeigt. Verschlucken wäre schlimmer
         als eine Zeile zu viel. */
      if (gruppe) {
        if (genannt[spalte][gruppe]) return;
        if (belegtGruppe[spalte][gruppe]) return;
        /* EINE GESCHICHTE GEHÖRT NICHT IN ZWEI SPALTEN.
         *
         * Gemessen am ersten Lauf der Kohärenzmessung: bei 95 von 120 Titeln
         * stand dieselbe Eigenschaft auf beiden Seiten - „Eine schwache
         * Kursentwicklung" dagegen und „Kurstempo verbessert sich" dafür.
         * Beides ist wahr und beides ist gemessen: das eine ist die Lage, das
         * andere ihre Richtung. Als zwei Spalteneinträge liest es sich
         * trotzdem wie ein Widerspruch, und der Leser muss den Zusammenhang
         * selbst herstellen.
         *
         * Die Veränderung tritt deshalb NEBEN die Eigenschaft, die sie
         * betrifft, und nicht in die Gegenspalte. Keine Aussage geht
         * verloren; sie steht an der Stelle, an der sie etwas erklärt. */
        var gegen = spalte === "pro" ? "contra" : "pro";
        if (genannt[gegen][gruppe]) {
          var ziel = (gegen === "pro" ? pro : contra).filter(function (e) {
            return e.kind === "factor" && e.factorId === gruppe;
          })[0];
          if (ziel) {
            ziel.why = (ziel.why ? ziel.why + " · " : "") + item.label +
              (spalte === "pro" ? " verbessert sich zuletzt" : " verschlechtert sich zuletzt");
            ziel.evidence = ziel.evidence.concat([beleg("changeEngine", item.id || item.label,
              finite(item.magnitude) ? item.magnitude : null, item.unit || null)]);
            belegtGruppe[spalte][gruppe] = true;
            return;
          }
        }
        belegtGruppe[spalte][gruppe] = true;
      }
      (spalte === "pro" ? pro : contra).push({
        kind: "change", factorId: gruppe || null, itemId: item.id || null, weight: WEIGHT.change,
        text: item.label + (spalte === "pro" ? " verbessert sich" : " verschlechtert sich"),
        why: item.plain || null,
        evidence: [beleg("changeEngine", item.id || item.label,
          finite(item.magnitude) ? item.magnitude : null, item.unit || null)]
      });
    });

    /* Die Kursstruktur trägt zwei Dinge, die ein Leser sofort einordnet und
       die in keiner Eigenschaft stehen: die Nähe zum Jahreshoch und die
       Schwankungslage. Beide nur, wenn sie GEMESSEN sind. */
    var stock = sources.stock || {};
    var hoch = stock.distanceTo52wHigh && finite(stock.distanceTo52wHigh.value) ? stock.distanceTo52wHigh.value : null;
    if (hoch !== null && !genannt.pro.momentum && !genannt.contra.momentum) {
      if (hoch >= NEAR_HIGH) {
        pro.push({ kind: "price", factorId: null, weight: WEIGHT.price,
          text: "Nähe zum 52-Wochen-Hoch", why: "Abstand " + anteil(hoch),
          evidence: [beleg("priceFactors", "distanceTo52wHigh", hoch, "ratio")] });
      } else if (hoch <= -0.3) {
        contra.push({ kind: "price", factorId: null, weight: WEIGHT.price,
          text: "Deutlicher Abstand zum 52-Wochen-Hoch", why: "Abstand " + anteil(hoch),
          evidence: [beleg("priceFactors", "distanceTo52wHigh", hoch, "ratio")] });
      }
    }
    var technical = sources.technical || null;
    if (technical && technical.state === "AVAILABLE" && technical.volatility &&
        ["HIGH", "EXTREME"].indexOf(technical.volatility.code) >= 0 && !genannt.contra.risk) {
      contra.push({ kind: "price", factorId: "risk", weight: WEIGHT.price,
        text: "Erhöhte Schwankungsbreite", why: technical.volatility.label || null,
        evidence: [beleg("technical", "volatility.regime", technical.volatility.code, null)] });
    }

    /* Chance und Risiko ähnlicher Lagen - als EINE Aussage je Seite und
       nicht als Tabelle. Die Zahlen gehören der Grundgesamtheit; der Satz
       sagt das, und die Musterfläche sagt es ausführlich. */
    var patterns = sources.patterns || null;
    if (patterns && patterns.state === "AVAILABLE" && (patterns.holds || []).length) {
      var auf = patterns.holds.filter(function (r) { return finite(r.asymmetry) && r.asymmetry >= ASYMMETRY_UP; }).length;
      var ab = patterns.holds.filter(function (r) { return finite(r.asymmetry) && r.asymmetry <= ASYMMETRY_DOWN; }).length;
      if (auf) pro.push({
        kind: "pattern", factorId: null, weight: WEIGHT.pattern,
        text: "Ähnliche Situationen waren historisch nach oben stärker ausgeprägt",
        why: auf + " von " + patterns.holds.length + " erfüllten Mustern",
        evidence: [beleg("patternMatch", "holds.asymmetryUp", auf, "count")] });
      if (ab) contra.push({
        kind: "pattern", factorId: null, weight: WEIGHT.pattern,
        text: "Ähnliche Situationen waren historisch nach unten stärker ausgeprägt",
        why: ab + " von " + patterns.holds.length + " erfüllten Mustern",
        evidence: [beleg("patternMatch", "holds.asymmetryDown", ab, "count")] });
    } else if (patterns && patterns.state !== "AVAILABLE") {
      /* NUR wenn der Vergleich fehlt. Ein Titel, auf den kein Muster
         zutrifft, HAT einen Vergleich - er ist ausdrücklich negativ
         ausgegangen. Beides in dieselbe Gruppe zu legen hiesse, einen Befund
         als Datenlücke auszugeben, und die Musterzeile daneben sagt dann das
         Gegenteil. */
      unknown.push({ kind: "pattern", factorId: null, weight: WEIGHT.pattern,
        text: "Wie ähnliche Situationen historisch ausgingen",
        why: "Für diesen Titel liegt kein Mustervergleich vor", reason: patternReason(patterns),
        explanation: null,
        evidence: [beleg("patternMatch", "reason", patternReason(patterns), null)] });
    }

    var setup = sources.setup || null;
    if (setup && setup.state !== "AVAILABLE") {
      unknown.push({ kind: "setup", factorId: null, weight: WEIGHT.pattern,
        text: "Ob sich eine Situation aufbaut",
        why: "Für diesen Titel liegt keine Setup-Beobachtung vor",
        reason: (setup.unavailability && setup.unavailability.reason) || setup.reason || "UNAVAILABLE",
        explanation: null,
        evidence: [beleg("setupObservation", "reason",
          (setup.unavailability && setup.unavailability.reason) || setup.reason || "UNAVAILABLE", null)] });
    }

    /* Lesereihenfolge: Eigenschaft, Mustervergleich, Kursstruktur,
       Veränderung. Innerhalb einer Stufe bleibt die Reihenfolge, in der die
       Dienste die Werte veröffentlichen - stabil und nicht nach Größe
       sortiert, weil eine Sortierung nach Wert ein Rang wäre. */
    var stabil = function (liste) {
      return liste.map(function (e, i) { return { e: e, i: i }; })
        .sort(function (a, b) { return (a.e.weight - b.e.weight) || (a.i - b.i); })
        .map(function (x) { return x.e; });
    };
    return { pro: stabil(pro), contra: stabil(contra), unknown: stabil(unknown) };
  }

  function patternReason(patterns) {
    if (!patterns) return "UNAVAILABLE";
    return (patterns.unavailability && patterns.unavailability.reason) || patterns.reason || "UNAVAILABLE";
  }

  /* ---------------------------------------------------------------------
     DAS SETUP ALS HANDLUNGSLOGIK - VIER FRAGEN, VIER ANTWORTEN.

       Zustand        die zugeordnete Regel
       Warum          ihre erfüllten Bedingungen
       Was als Nächstes  die offenen Bedingungen der nächsthöheren Stufe
       Was macht es ungültig  die Bedingungen, die den Zustand gerade tragen

     Die Kaskade ist nach Entscheidungsvorrang geordnet: eine Regel mit
     kleinerer `order` entscheidet früher und beschreibt in der
     entscheidbaren Stufe den stärkeren Zustand. Diese Eigenschaft wird
     nicht angenommen - ein Test hält sie gegen die veröffentlichte
     Zuordnung, damit die Seite nicht die falsche Richtung nennt, wenn die
     Methodik sich einmal ändert.

     Was hier NICHT passiert: ein Kursziel, ein Zeitpunkt, eine Aussage
     darüber, ob ein Zustand eintritt. Die Bedingungen sind die der Regel,
     und der Satz sagt, dass es ein Vergleich mit dem heutigen Stand ist.
     --------------------------------------------------------------------- */
  function setupLogic(setup) {
    if (!setup || setup.state !== "AVAILABLE") {
      return { state: "UNAVAILABLE",
        reason: (setup && ((setup.unavailability && setup.unavailability.reason) || setup.reason)) || "UNAVAILABLE",
        /* Der Grund JE TITEL wird mitgegeben, nicht nur sein Code: die Fläche
           soll denselben Satz sagen können wie die Kursstruktur-Sektion -
           zwei Sätze für eine Ursache sind für einen Leser zwei Ursachen. */
        unavailability: (setup && setup.unavailability) || null,
        label: null, sentence: null, why: null, next: null, invalidation: null };
    }
    var zustand = setup.classification && setup.classification.state ? setup.classification.state : null;
    var regel = setup.matchedRule || null;
    var bedingungen = (setup.conditions || []).slice();
    var erfuellt = bedingungen.filter(function (c) { return c.met; });
    var kaskade = (setup.cascade || []).filter(function (r) { return r.tier === "POINT_IN_TIME" && !r.unanswerable; });
    var eigene = kaskade.filter(function (r) { return regel && r.ruleId === regel.ruleId; })[0] || null;

    /* Die nächsthöhere entscheidbare Stufe: früherer Vorrang, offene
       Bedingungen vorhanden, und von denen die mit den wenigsten offenen. */
    var hoeher = kaskade.filter(function (r) {
      return (!eigene || r.order < eigene.order) && r.matched !== true && (r.open || []).length > 0;
    }).sort(function (a, b) { return (a.open || []).length - (b.open || []).length || b.order - a.order; });
    var naechste = hoeher[0] || null;

    var next = naechste
      ? { state: naechste.state, label: SETUP_LABEL[naechste.state] || naechste.state,
          sentence: "Für die nächste Stufe (" + (SETUP_LABEL[naechste.state] || naechste.state) + ") " +
            (naechste.open.length === 1 ? "fehlt noch eine von " : "fehlen noch " + naechste.open.length + " von ") +
            naechste.conditions.filter(function (c) { return c.measurable !== false; }).length +
            " messbaren Bedingungen.",
          open: naechste.open.slice(), ruleId: naechste.ruleId, reason: null,
          evidence: [beleg("setupCascade", naechste.ruleId + ".open", naechste.open.length, "count")] }
      : { state: null, label: null, reason: "NO_HIGHER_DECIDABLE_STATE",
          sentence: "In der entscheidbaren Stufe gibt es über diesem Zustand keine weitere Regel. " +
            "Die Verlaufszustände darüber verlangen eine geordnete Beobachtungshistorie und sind noch nicht freigeschaltet.",
          open: [], ruleId: null,
          evidence: [beleg("setupCascade", "higherDecidableRules", 0, "count")] };

    var invalidation = erfuellt.length
      ? { sentence: "Dieser Zustand trägt " + erfuellt.length + " erfüllte Bedingung" +
            (erfuellt.length === 1 ? "" : "en") + ". Fällt eine davon weg, gilt er nicht mehr.",
          conditions: erfuellt.slice(), reason: null,
          evidence: [beleg("setupObservation", "conditions.met", erfuellt.length, "count")] }
      : { sentence: zustand === "NO_SETUP"
            ? "Es gibt derzeit keinen Zustand, der ungültig werden könnte: keine Regel der entscheidbaren Stufe trifft zu."
            : "Für diesen Zustand liegen keine erfüllten Bedingungen im Artefakt - ohne sie wird hier nicht behauptet, was ihn beenden würde.",
          conditions: [], reason: zustand === "NO_SETUP" ? "NO_STATE_TO_INVALIDATE" : "CONDITIONS_NOT_PUBLISHED",
          evidence: [beleg("setupObservation", "conditions.met", 0, "count")] };

    return {
      state: zustand, label: SETUP_LABEL[zustand] || zustand, reason: null,
      sentence: SETUP_SENTENCE[zustand] || null,
      why: { sentence: regel && regel.plain ? regel.plain : null,
        met: erfuellt.length,
        measurable: bedingungen.filter(function (c) { return c.measurable !== false; }).length,
        ruleId: regel ? regel.ruleId : null,
        evidence: [beleg("setupObservation", "matchedRule", regel ? regel.ruleId : null, null)] },
      next: next, invalidation: invalidation,
      asOf: setup.asOf || null,
      isNot: ["KURSZIEL", "EINSTIEGSREGEL", "PROGNOSE"]
    };
  }

  /* ---------------------------------------------------------------------
     DER ANLAGESTIL IN EINEM SATZ.

     „Momentum Leader 71 %" ist eine Zahl mit einem Namen daneben. Was ein
     Leser braucht, steht schon im Ergebnis: welcher Stil am ehesten passt,
     was er erfüllt, was fehlt - und welche Bedingung nicht einmal messbar
     war, denn die zählt weder als erfüllt noch als verletzt.

     Passt kein Stil über der Schwelle, wird der nächstliegende genannt und
     als solcher bezeichnet. Ein „kein Stil passt" ohne den nächstliegenden
     verschweigt eine Antwort, die vorliegt.
     --------------------------------------------------------------------- */
  function strategyLogic(match) {
    if (!match || match.state !== "AVAILABLE") {
      return { state: "UNAVAILABLE", reason: (match && match.reason) || "UNAVAILABLE",
        sentence: null, profileId: null, label: null, match: null, nearest: false,
        fulfils: [], missing: [], blocking: [] };
    }
    var verfuegbar = (match.profiles || []).filter(function (p) { return p.state === "AVAILABLE" && finite(p.match); })
      .sort(function (a, b) { return b.match - a.match; });
    if (!verfuegbar.length) {
      return { state: "UNAVAILABLE", reason: "NO_MEASURABLE_PROFILE", sentence: null,
        profileId: null, label: null, match: null, nearest: false, fulfils: [], missing: [], blocking: [] };
    }
    var beste = verfuegbar[0];
    var passt = beste.match >= STYLE_FIT;
    var erfuellt = beste.conditions.filter(function (c) { return c.state === "MET"; });
    var offen = beste.conditions.filter(function (c) { return c.state === "NOT_MET"; });
    var unmessbar = beste.conditions.filter(function (c) { return c.state === "NOT_MEASURABLE"; });

    return {
      state: "AVAILABLE", reason: null,
      profileId: beste.profileId, label: beste.label, match: beste.match, nearest: !passt,
      sentence: passt
        ? "Am ehesten passt die Aktie derzeit zum Stil " + beste.label + "."
        : "Kein Anlagestil passt derzeit klar. Am nächsten kommt " + beste.label + ".",
      plain: beste.plain || null,
      mainRisk: beste.mainRisk || null,
      fulfils: erfuellt.map(function (c) { return { label: c.label, value: c.value }; }),
      missing: offen.map(function (c) { return { label: c.label, value: c.value, threshold: c.threshold }; }),
      /* Nicht messbar ist der Grund, warum eine bessere Passung gar nicht
         möglich war - er gehört neben die fehlenden und nicht in denselben
         Topf. */
      blocking: unmessbar.map(function (c) { return { label: c.label, field: c.field }; }),
      alternatives: verfuegbar.slice(1, 3).map(function (p) { return { label: p.label, match: p.match }; }),
      historicalEvidence: beste.historicalEvidence || null,
      evidence: [beleg("strategyMatch", beste.profileId, beste.match, "percent")]
    };
  }

  /* ---------------------------------------------------------------------
     CHANCE GEGEN RISIKO IN ÄHNLICHEN LAGEN.

     Die Musterfläche zeigte Trefferzahlen. Was ein Leser daraus nicht
     ablesen konnte, ist die eigentliche Frage: war die Aufwärtsseite stärker
     erhöht als die Abwärtsseite, auf wie vielen Fällen beruht das, und hat
     es auch außerhalb des Trainingsfensters gehalten. Alle vier Größen
     stehen im Artefakt.

     Der Satz beschreibt die Grundgesamtheit und sagt es auch. Er wird nicht
     dadurch zu einer Aussage über diesen Titel, dass er auf seiner Seite
     steht - derselbe Vorbehalt, den das Artefakt selbst mitführt.
     --------------------------------------------------------------------- */
  function median(values) {
    var s = values.filter(finite).slice().sort(function (a, b) { return a - b; });
    if (!s.length) return null;
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function patternLogic(patterns) {
    if (!patterns || patterns.state !== "AVAILABLE") {
      return { state: "UNAVAILABLE", reason: patternReason(patterns), sentence: null,
        direction: null, upside: null, downside: null, asymmetry: null, sample: null, robust: null };
    }
    var holds = patterns.holds || [];
    if (!holds.length) {
      return { state: "NO_PATTERN_HOLDS", reason: null,
        sentence: "Keines der vorregistrierten Muster trifft heute auf diesen Titel zu. Das ist ein Befund und keine Datenlücke.",
        direction: null, upside: null, downside: null, asymmetry: null,
        sample: null, robust: null, measurable: patterns.coverage ? patterns.coverage.measurable : null,
        evidence: [beleg("patternMatch", "holds", 0, "count")] };
    }
    var asym = median(holds.map(function (r) { return r.asymmetry; }));
    var gewinn = median(holds.map(function (r) { return r.conditionalRate; }));
    var verlust = median(holds.map(function (r) { return r.conditionalLossRate; }));
    var basis = median(holds.map(function (r) { return r.baseRate; }));
    var basisVerlust = median(holds.map(function (r) { return r.baseLossRate; }));
    var faelle = holds.reduce(function (sum, r) { return sum + (finite(r.support) ? r.support : 0); }, 0);
    var belastbar = holds.filter(function (r) { return finite(r.outOfSampleLift) && r.outOfSampleLift > 1; }).length;

    var richtung = !finite(asym) ? null : asym >= ASYMMETRY_UP ? "UP" : asym <= ASYMMETRY_DOWN ? "DOWN" : "BALANCED";
    var satz = richtung === "UP"
      ? "Ähnliche Situationen hatten historisch mehr Aufwärts- als Abwärtsasymmetrie."
      : richtung === "DOWN"
        ? "Historisch war das Chance-Risiko-Verhältnis in ähnlichen Situationen ungünstig."
        : richtung === "BALANCED"
          ? "Historisch hielten sich Chance und Risiko in ähnlichen Situationen die Waage."
          : null;

    return {
      state: "AVAILABLE", reason: null, sentence: satz, direction: richtung,
      upside: { conditional: gewinn, base: basis,
        sentence: finite(gewinn) && finite(basis)
          ? "In " + anteil(gewinn) + " der ähnlichen Fälle folgte ein starker Gewinn; in der Grundgesamtheit waren es " + anteil(basis) + "."
          : null },
      downside: { conditional: verlust, base: basisVerlust,
        sentence: finite(verlust) && finite(basisVerlust)
          ? "In " + anteil(verlust) + " der ähnlichen Fälle folgte ein deutlicher Verlust; in der Grundgesamtheit waren es " + anteil(basisVerlust) + "."
          : null },
      asymmetry: asym, holds: holds.length,
      sample: faelle,
      sampleSentence: "Gezählt über " + faelle.toLocaleString("de-DE") + " vergleichbare Beobachtungen der Vergangenheit.",
      robust: belastbar,
      robustSentence: belastbar + " von " + holds.length + " Mustern hielten auch außerhalb des Zeitraums, in dem sie gefunden wurden.",
      horizon: patterns.horizon || null,
      caveat: patterns.caveats ? patterns.caveats.statement : null,
      evidence: [beleg("patternMatch", "holds.asymmetryMedian", asym, "ratio"),
        beleg("patternMatch", "holds.support", faelle, "count")]
    };
  }

  /* ---------------------------------------------------------------------
     WELCHE METHODIK GILT.

     M39 hat die Branchenvorlage auf die Faktorseite gebracht. Die Auskunft
     oben muss sie genauso tragen, sonst wechselt die Methodik dort wieder
     lautlos: dieselbe Beschriftung, ein anderes Gewicht, kein Wort dazu.
     --------------------------------------------------------------------- */
  function methodologySwitch(factors) {
    var template = factors && factors.template ? factors.template : null;
    if (!template || !template.id) return { active: false, id: null, version: null, label: null, appliesTo: null };
    return { active: true, id: template.id, version: template.version || null,
      label: template.label || null, appliesTo: template.appliesTo || null };
  }

  /* ---------------------------------------------------------------------
     DIE VOLLSTÄNDIGE AUSKUNFT.
     --------------------------------------------------------------------- */
  function build(sources) {
    var src = sources || {};
    var evidence = src.factors || null;
    var factors = evidence && Array.isArray(evidence.factors) ? evidence.factors : [];
    var setup = setupLogic(src.setup);
    var drei = groups(src, factors);
    var kopf = headline(factors, setup.state, evidence && evidence.state !== "AVAILABLE"
      ? "Für diesen Titel liegt noch keine auswertbare Einordnung der sieben Eigenschaften vor."
      : null);

    /* Zwei Aussagen mit demselben Wortlaut sind für einen Leser ein Fehler
       der Seite, auch wenn beide stimmen. Sie werden hier zusammengeführt
       und nicht doppelt ausgegeben - gezählt wird, wie viele es waren. */
    var gesehen = {}, doppelt = 0;
    ["pro", "contra", "unknown"].forEach(function (key) {
      drei[key] = drei[key].filter(function (entry) {
        var schluessel = key + "|" + String(entry.text).toLowerCase().replace(/\s+/g, " ").trim();
        if (gesehen[schluessel]) { doppelt += 1; return false; }
        gesehen[schluessel] = true;
        return true;
      });
    });

    return {
      schemaVersion: SCHEMA_VERSION,
      ticker: (evidence && evidence.ticker) || (src.stock && src.stock.ticker) || null,
      headline: kopf,
      pro: drei.pro, contra: drei.contra, unknown: drei.unknown,
      duplicatesMerged: doppelt,
      setup: setup,
      strategy: strategyLogic(src.match),
      pattern: patternLogic(src.patterns),
      methodologySwitch: methodologySwitch(evidence),
      /* Was diese Auskunft ausdrücklich nicht ist. Sie steht im Modell und
         nicht in einer Bildunterschrift, damit keine Fläche etwas anderes
         daraus machen kann. */
      isNot: ["PROGNOSE", "EMPFEHLUNG", "KURSZIEL", "GESAMTSCORE"]
    };
  }

  /* Jede Aussage, die dieses Modul erzeugt, muss ihren Beleg tragen. Diese
     Funktion sagt, wo das nicht der Fall ist - und ein Test hält sie gegen
     die echten Artefakte, statt auf eine Konvention zu vertrauen. */
  function statementsWithoutEvidence(brief) {
    var fehlt = [];
    if (!brief) return ["no brief"];
    ["pro", "contra", "unknown"].forEach(function (key) {
      (brief[key] || []).forEach(function (entry) {
        if (!entry.text) fehlt.push(key + ": statement without text");
        if (!Array.isArray(entry.evidence) || !entry.evidence.length) fehlt.push(key + ": '" + entry.text + "' without evidence");
      });
    });
    if (brief.headline && brief.headline.state !== "UNAVAILABLE" &&
        (!Array.isArray(brief.headline.evidence) || !brief.headline.evidence.length)) {
      fehlt.push("headline without evidence");
    }
    [["setup", brief.setup && brief.setup.next], ["setup", brief.setup && brief.setup.invalidation],
     ["strategy", brief.strategy], ["pattern", brief.pattern]].forEach(function (paar) {
      var block = paar[1];
      if (!block || !block.sentence) return;
      if (!Array.isArray(block.evidence) || !block.evidence.length) fehlt.push(paar[0] + ": sentence without evidence");
    });
    return fehlt;
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STRENGTH_BANDS: STRENGTH_BANDS.slice(),
    WEAKNESS_BANDS: WEAKNESS_BANDS.slice(),
    ASYMMETRY_UP: ASYMMETRY_UP,
    ASYMMETRY_DOWN: ASYMMETRY_DOWN,
    STYLE_FIT: STYLE_FIT,
    NEAR_HIGH: NEAR_HIGH,
    PHRASES: JSON.parse(JSON.stringify(PHRASES)),
    SETUP_SENTENCE: Object.assign({}, SETUP_SENTENCE),
    SETUP_LABEL: Object.assign({}, SETUP_LABEL),
    headline: headline,
    groups: groups,
    setupLogic: setupLogic,
    strategyLogic: strategyLogic,
    patternLogic: patternLogic,
    methodologySwitch: methodologySwitch,
    statementsWithoutEvidence: statementsWithoutEvidence,
    build: build
  };

  if (isNode) module.exports = api;
  else global.VUIntelligenceBrief = api;
})(typeof window !== "undefined" ? window : globalThis);
