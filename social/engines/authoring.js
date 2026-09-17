/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/authoring.js

   DIE AUTORENSCHICHT

   -------------------------------------------------------------------------
   WAS SIE IST
   -------------------------------------------------------------------------

   Eine Registry fuer Autoren und der Ablauf, der aus einem Brief einen
   ausgewaehlten Text macht:

     BRIEF -> VARIANTEN -> CLAIM BINDING -> GATES -> AUSWAHL

   Sie ist KEINE zweite Content-Pipeline. `content.js` bleibt der Ablauf;
   diese Datei ersetzt darin nur die Stufe, in der Text entsteht — und
   zwar so, dass mehrere Vorschlaege entstehen statt genau einem.

   -------------------------------------------------------------------------
   WARUM VARIANTEN
   -------------------------------------------------------------------------

   Ein einzelner Entwurf ist nicht bewertbar. Er ist entweder gut genug
   oder er scheitert, und im zweiten Fall gibt es nichts. Mehrere
   Varianten machen aus der Qualitaetspruefung eine AUSWAHL: die
   Bewertung entscheidet, welcher Text hinausgeht, und die verworfenen
   sind die Begruendung.

   Ausserdem ist erst mit Varianten messbar, WAS wirkt. Ein System, das
   immer denselben Satzbau erzeugt, kann ueber Satzbau nichts lernen.

   -------------------------------------------------------------------------
   DIE REIHENFOLGE DER TORE IST DIE SICHERUNG
   -------------------------------------------------------------------------

   Claim Binding steht VOR allem anderen. Ein Text mit einer erfundenen
   Zahl wird nicht erst schoen gefunden und dann geprueft — er faellt
   heraus, bevor ihn irgendetwas bewertet. Sonst entstuende der Anreiz,
   eine gut klingende Variante "nur ein bisschen" durchzulassen.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var ClaimBinding = isNode ? require("./claim-binding.js") : global.VUSocialClaimBinding;
  var Hash = isNode ? require("../../quant/engines/hash.js") : global.VUHash;

  function fail(m) { throw new Error("VUSocialAuthoring: " + m); }

  /* -------------------------------------------------------------------
     DER VERTRAG EINES AUTORS

       authorId      eindeutig
       kind          "deterministic" | "generative"
       capabilities  { variants: n, hooks, captions, visualLines, structure }
       available()   -> { ok, reason }   — ein Autor ohne Anbindung sagt das
       write(brief, options) -> { variants: [ ... ] }

     `available()` ist nicht hoeflich, sondern noetig: ein generativer
     Autor ohne Anbindung darf nicht scheitern, sondern muss sich vorher
     abmelden. Sonst faellt der Ausfall erst im Lauf auf, und dann fehlt
     der Text.
     ------------------------------------------------------------------- */
  function createRegistry() {
    var autoren = Object.create(null);

    function register(adapter) {
      if (!adapter || !adapter.authorId) fail("Autor ohne authorId");
      if (["deterministic", "generative"].indexOf(adapter.kind) === -1) {
        fail(adapter.authorId + ": kind muss deterministic oder generative sein");
      }
      if (typeof adapter.write !== "function") fail(adapter.authorId + ": kein write()");
      if (typeof adapter.available !== "function") fail(adapter.authorId + ": kein available()");
      if (!adapter.capabilities) fail(adapter.authorId + ": keine Capability-Deklaration");
      autoren[adapter.authorId] = adapter;
      return adapter;
    }

    return {
      register: register,
      get: function (id) { return autoren[id] || null; },
      has: function (id) { return !!autoren[id]; },
      ids: function () { return Object.keys(autoren); },
      /** Welche Autoren koennen heute wirklich schreiben? */
      usable: function () {
        return Object.keys(autoren).map(function (id) {
          var a = autoren[id];
          var v = a.available();
          return { authorId: id, kind: a.kind, ok: v.ok === true, reason: v.reason || null };
        });
      }
    };
  }

  /** Eine Variante in kanonischer Form. */
  function variant(spec) {
    spec = spec || {};
    var parts = {
      hook: spec.hook || null,
      caption: spec.caption || null,
      visualLine: spec.visualLine || null
    };
    return {
      variantId: spec.variantId || Hash.prefixedHash("var", parts),
      authorId: spec.authorId || null,
      kind: spec.kind || null,
      hook: parts.hook,
      caption: parts.caption,
      visualLine: parts.visualLine,
      cta: spec.cta || null,
      hashtags: Array.isArray(spec.hashtags) ? spec.hashtags.slice() : [],
      /* Welches Muster diese Variante verfolgt. Ohne diese Angabe laesst
         sich spaeter nicht lernen, WAS gewirkt hat — nur DASS etwas
         gewirkt hat. */
      pattern: spec.pattern || null,
      claims: Array.isArray(spec.claims) ? spec.claims.slice() : [],
      /* Wo die Schreibung repariert wurde, reist das Original mit. Ein
         Text, der als der eines Autors gilt, darf nicht unbemerkt ein
         anderer sein — auch dann nicht, wenn nur Umlaute gesetzt
         wurden. */
      textVerbatim: spec.textVerbatim || null,
      textResidue: Array.isArray(spec.textResidue) && spec.textResidue.length
        ? spec.textResidue.slice() : null,
      notes: spec.notes || null
    };
  }

  /* -------------------------------------------------------------------
     DIE BEWERTUNG

     Claim Binding zuerst, dann die uebrigen Tore. Ein Tor, das eine
     Funktion bekommt, wird aufgerufen; fehlt es, wird es uebersprungen
     und das steht im Ergebnis — ein uebersprungenes Tor ist kein
     bestandenes.
     ------------------------------------------------------------------- */
  /* -------------------------------------------------------------------
     DIE KOMPOSITION

     Hook, Bildzeile und Caption koennen jede fuer sich tadellos sein und
     zusammen dreimal dasselbe sagen. Genau das passierte im ersten
     Kandidaten aus der neuen Autorenschicht:

       Hook:      "Was diese Zahl nicht sagt: XOM, 76 im ... Score."
       Bildzeile: "Lagebeschreibung, keine Prognose."
       Caption:   "... nicht ihre Ursache und nicht, was als naechstes
                   passiert."

     Dreimal die Grenze der Aussage. Keine einzelne Pruefung sieht das:
     die Markenpruefung sieht Hook und Caption, die Bildguete sieht die
     Karte. Der Fehler sitzt DAZWISCHEN.

     Gemessen wird die paarweise Wortueberschneidung. Das ist kein
     Bedeutungsvergleich — zwei Saetze koennen dasselbe mit anderen
     Woertern sagen, und das faengt diese Pruefung nicht. Sie faengt den
     haeufigen Fall, und den faengt sie zuverlaessig.
     ------------------------------------------------------------------- */
  function normalise(s) {
    return String(s === null || s === undefined ? "" : s)
      .toLowerCase().replace(/[^a-z0-9\u00E4\u00F6\u00FC\u00DF ]+/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  /* Woerter, die in jedem deutschen Satz vorkommen und ueber
     Wiederholung nichts aussagen. */
  var FUELLWOERTER = ["der", "die", "das", "und", "ist", "im", "in", "den", "dem",
    "ein", "eine", "einer", "einem", "nicht", "mit", "von", "fuer", "f\u00FCr",
    "es", "sich", "auf", "als", "wie", "was", "bei", "zu", "wir", "sie", "er"];

  /**
   * Die Woerter, die eine Wiederholung VERRATEN.
   *
   * Nicht alle. Gegenstand, Kennzahl und Wert stehen zu Recht in Hook
   * UND Caption — ein Hook, der den Titel verschweigt, ist kein Hook.
   * Die erste Fassung mass die rohe Ueberschneidung und verwarf deshalb
   * ALLE vier Varianten: sie bestrafte genau das, was richtig war.
   *
   * Verglichen wird die RHETORISCHE Substanz: was uebrig bleibt, wenn
   * man die Belegbegriffe abzieht. Wiederholt sich die, sagt der Beitrag
   * dreimal dieselbe Sache mit denselben Mitteln.
   */
  function inhaltsWoerter(s, belegWoerter) {
    var raus = belegWoerter || [];
    return normalise(s).split(" ").filter(function (w) {
      return w.length > 2 && FUELLWOERTER.indexOf(w) === -1 && raus.indexOf(w) === -1;
    });
  }

  function belegWortliste(evidence) {
    var out = [];
    (evidence || []).forEach(function (e) {
      [e.entity, e.metric, e.value, e.unit].forEach(function (teil) {
        if (teil === null || teil === undefined) return;
        normalise(teil).split(" ").forEach(function (w) { if (w) out.push(w); });
      });
    });
    return out;
  }

  function ueberschneidung(a, b, belegWoerter) {
    var wa = inhaltsWoerter(a, belegWoerter), wb = inhaltsWoerter(b, belegWoerter);
    if (!wa.length || !wb.length) return 0;
    var setB = Object.create(null);
    wb.forEach(function (w) { setB[w] = true; });
    var treffer = wa.filter(function (w) { return setB[w]; }).length;
    return treffer / Math.min(wa.length, wb.length);
  }

  function compositionCheck(v, options) {
    options = options || {};
    var grenze = typeof options.maxOverlap === "number" ? options.maxOverlap : 0.6;
    var beleg = belegWortliste(options.evidence);

    var paare = [
      ["hook", "visualLine", ueberschneidung(v.hook, v.visualLine, beleg)],
      ["hook", "caption", ueberschneidung(v.hook, v.caption, beleg)],
      ["visualLine", "caption", ueberschneidung(v.visualLine, v.caption, beleg)]
    ];

    var zuAehnlich = paare.filter(function (p) { return p[2] >= grenze; });
    var mittel = paare.reduce(function (a, p) { return a + p[2]; }, 0) / paare.length;

    return {
      passed: zuAehnlich.length === 0,
      score: Math.round((1 - mittel) * 100),
      pairs: paare.map(function (p) {
        return { a: p[0], b: p[1], overlap: Math.round(p[2] * 100) / 100 };
      }),
      explanation: zuAehnlich.length === 0
        ? "Hook, Bildzeile und Caption tragen jeweils Eigenes bei."
        : zuAehnlich.map(function (p) {
            return p[0] + " und " + p[1] + " ueberschneiden sich zu " +
              Math.round(p[2] * 100) + " %";
          }).join("; ") + "."
    };
  }

  function evaluate(variants, brief, gates) {
    gates = gates || {};
    return (variants || []).map(function (v) {
      var gruende = [];
      var bestanden = true;

      /* 1. CLAIM BINDING — vor allem anderen. */
      var bindung = ClaimBinding.checkParts(
        { hook: v.hook, caption: v.caption, visualLine: v.visualLine },
        brief.evidence, { allowCausality: brief.allowCausality });

      if (!bindung.ok) {
        bestanden = false;
        Object.keys(bindung.parts).forEach(function (teil) {
          var b = bindung.parts[teil];
          if (!b.ok) gruende.push({ gate: "claim-binding", part: teil, message: b.explanation });
        });
      }

      /* 2. Die uebrigen Tore. Sie laufen auch bei gescheiterter Bindung
         weiter, damit der Bericht vollstaendig ist: wer nur den ersten
         Grund kennt, korrigiert einmal und scheitert am zweiten. */
      var markenwert = null;
      if (typeof gates.brand === "function") {
        var brand = gates.brand(v);
        markenwert = (brand && typeof brand.score === "number") ? brand.score : null;
        if (brand && brand.passed === false) {
          bestanden = false;
          (brand.blocking || []).forEach(function (b) {
            gruende.push({ gate: "brand", message: b.message || b.id });
          });
        }
      }

      var faktenZustand = null;
      if (typeof gates.factCheck === "function") {
        var fakt = gates.factCheck(v);
        faktenZustand = fakt ? fakt.state : null;
        if (fakt && fakt.passed === false) {
          bestanden = false;
          gruende.push({ gate: "fact-check", message: fakt.explanation || "nicht bestanden" });
        }
      }

      var duplikat = null;
      if (typeof gates.duplicate === "function") {
        var dup = gates.duplicate(v);
        duplikat = dup ? dup.similarity : null;
        if (dup && dup.blocked === true) {
          bestanden = false;
          gruende.push({ gate: "duplicate", message: dup.explanation || "zu aehnlich" });
        }
      }

      /* 3. DIE KOMPOSITION. Sie laeuft immer — sie braucht kein
         externes Tor, weil sie nur die Variante mit sich selbst
         vergleicht. */
      var komposition = compositionCheck(v, Object.assign(
        { evidence: brief.evidence }, gates.compositionOptions || {}));
      if (!komposition.passed) {
        bestanden = false;
        gruende.push({ gate: "composition", message: komposition.explanation });
      }

      return {
        variant: v,
        passed: bestanden,
        reasons: gruende,
        binding: bindung,
        composition: komposition,
        brandScore: markenwert,
        factState: faktenZustand,
        similarity: duplikat,
        gatesRun: ["claim-binding"]
          .concat(typeof gates.brand === "function" ? ["brand"] : [])
          .concat(typeof gates.factCheck === "function" ? ["fact-check"] : [])
          .concat(typeof gates.duplicate === "function" ? ["duplicate"] : []),
        gatesSkipped: []
          .concat(typeof gates.brand === "function" ? [] : ["brand"])
          .concat(typeof gates.factCheck === "function" ? [] : ["fact-check"])
          .concat(typeof gates.duplicate === "function" ? [] : ["duplicate"])
      };
    });
  }

  /**
   * Die Auswahl.
   *
   * Unter den bestandenen gewinnt der hoechste Markenwert. Bei
   * Gleichstand entscheidet die gelernte Vorliebe fuer das Muster, und
   * erst danach die Reihenfolge — eine Auswahl, die am Ende doch an der
   * Reihenfolge haengt, sagt das dann auch.
   */
  function select(bewertet, options) {
    options = options || {};
    var wissen = options.patternKnowledge || {};   /* { muster: { mean, sampleSize } } */
    var nutzung = options.patternUsage || {};      /* { muster: anzahl zuletzt } */
    var modus = options.mode === "EXPLORE" ? "EXPLORE" : "EXPLOIT";
    var minStichprobe = Number(options.minimumSampleForExploit) || 5;

    var bestanden = (bewertet || []).filter(function (b) { return b.passed; });
    if (bestanden.length === 0) {
      return {
        chosen: null,
        reason: (bewertet || []).length === 0
          ? "Kein Autor hat eine Variante geliefert."
          : "Keine von " + bewertet.length + " Varianten hat die Tore bestanden.",
        rejected: bewertet || []
      };
    }

    /* -----------------------------------------------------------------
       DIE AUSWAHL FOLGT DERSELBEN REGEL WIE DIE ARCHETYP-AUSWAHL

       Erst der Markenwert — wer die Tore schlechter besteht, gewinnt
       nicht. Dann, bei Gleichstand, dieselbe Logik wie in strategy.js:

         EXPLOIT  das Muster mit der besten GEMESSENEN Leistung, aber
                  erst ab einer Mindeststichprobe
         EXPLORE  das Muster mit der duennsten Datenlage

       Eine zweite, eigene Auswahlregel fuer Textmuster waere ein zweites
       Lernverfahren mit eigener Meinung. Und ohne diese Kopplung faellt
       die Auswahl bei gleichem Markenwert auf die Kennung zurueck — also
       auf nichts. Genau das tat sie im ersten Lauf, und sie sagte es
       auch: "4 lagen gleichauf, entschieden hat die Kennung."
       ----------------------------------------------------------------- */
    function bewaehrt(muster) {
      var k = wissen[muster];
      if (!k || Number(k.sampleSize) < minStichprobe) return null;
      return Number(k.mean);
    }

    var sortiert = bestanden.slice().sort(function (a, b) {
      var ba = a.brandScore === null ? -1 : a.brandScore;
      var bb = b.brandScore === null ? -1 : b.brandScore;
      if (bb !== ba) return bb - ba;

      /* GEMESSENES SCHLAEGT GERECHNETES.

         Die Komposition ist eine gute Heuristik; eine gemessene
         Wirkung ist eine Beobachtung. Wo beides vorliegt, gewinnt die
         Beobachtung — sonst waere das Lernen eine Zierde. */
      if (modus === "EXPLOIT") {
        var ma = bewaehrt(a.variant.pattern);
        var mb = bewaehrt(b.variant.pattern);
        if (ma !== null || mb !== null) {
          if (ma === null) return 1;
          if (mb === null) return -1;
          if (mb !== ma) return mb - ma;
        }
      }

      /* Solange nichts gemessen ist — also heute — entscheidet, wie viel
         Eigenes die drei Teile beitragen. Das ist die Frage, die vorher
         NIEMAND stellte; die Auswahl fiel deshalb auf die Kennung. */
      var ka = a.composition ? a.composition.score : 0;
      var kb = b.composition ? b.composition.score : 0;
      if (kb !== ka) return kb - ka;

      /* EXPLORE, und EXPLOIT ohne bewaehrtes Muster: das am wenigsten
         Benutzte. Zufall waere billiger und lernt langsamer. */
      var na = Number(nutzung[a.variant.pattern] || 0);
      var nb = Number(nutzung[b.variant.pattern] || 0);
      if (na !== nb) return na - nb;

      return String(a.variant.variantId).localeCompare(String(b.variant.variantId));
    });

    var gewaehlt = sortiert[0];
    var mittel = bewaehrt(gewaehlt.variant.pattern);
    var benutzt = Number(nutzung[gewaehlt.variant.pattern] || 0);

    /* Was TATSAECHLICH entschieden hat. Eine Begruendung, die den
       letzten Sortierschluessel nennt statt den wirksamen, ist eine
       falsche Begruendung — und sie steht spaeter im Kandidaten, den
       ein Mensch liest. */
    var zweiter = sortiert[1] || null;
    var beideUnbewiesen = zweiter &&
      bewaehrt(gewaehlt.variant.pattern) === null &&
      bewaehrt(zweiter.variant.pattern) === null;
    var kompositionEntschied = zweiter && beideUnbewiesen &&
      gewaehlt.brandScore === zweiter.brandScore &&
      (gewaehlt.composition ? gewaehlt.composition.score : 0) >
      (zweiter.composition ? zweiter.composition.score : 0);

    var begruendung;
    if (mittel !== null && modus === "EXPLOIT") {
      begruendung = "Muster " + gewaehlt.variant.pattern + " liegt bei n=" +
        wissen[gewaehlt.variant.pattern].sampleSize + " Beitraegen im Mittel bei " +
        Math.round(mittel) + ".";
    } else if (kompositionEntschied) {
      begruendung = "Entschieden hat die Komposition: Hook, Bildzeile und Caption " +
        "tragen bei Muster " + gewaehlt.variant.pattern + " am wenigsten dasselbe bei " +
        "(" + gewaehlt.composition.score + " gegen " +
        (zweiter.composition ? zweiter.composition.score : 0) + ").";
    } else if (modus === "EXPLORE") {
      begruendung = "Erkundung: Muster " + gewaehlt.variant.pattern +
        " wurde zuletzt " + benutzt + "-mal benutzt und hat damit die duennste Datenlage.";
    } else {
      begruendung = "Kein Muster hat genug Daten (ab n=" + minStichprobe +
        "). Gewaehlt wurde das zuletzt am seltensten benutzte (" + benutzt + "-mal).";
    }

    return {
      chosen: gewaehlt,
      mode: modus,
      reason: "Markenwert " + gewaehlt.brandScore + " unter " + bestanden.length +
        " bestandenen von " + bewertet.length + " Varianten. " + begruendung,
      alternatives: sortiert.slice(1).map(function (x) {
        return { variantId: x.variant.variantId, pattern: x.variant.pattern,
                 brandScore: x.brandScore,
                 compositionScore: x.composition ? x.composition.score : null,
                 recentUses: Number(nutzung[x.variant.pattern] || 0) };
      }),
      rejected: (bewertet || []).filter(function (b) { return !b.passed; })
    };
  }

  /** Der ganze Weg: schreiben, bewerten, auswaehlen. */
  function run(registry, brief, options) {
    options = options || {};
    var reihenfolge = options.authors || registry.ids();
    var versuche = [];
    var varianten = [];

    for (var i = 0; i < reihenfolge.length; i += 1) {
      var a = registry.get(reihenfolge[i]);
      if (!a) { versuche.push({ authorId: reihenfolge[i], ok: false, reason: "unbekannt" }); continue; }
      var v = a.available();
      if (!v.ok) { versuche.push({ authorId: a.authorId, ok: false, reason: v.reason }); continue; }

      var ergebnis = a.write(brief, options);
      var neu = (ergebnis && ergebnis.variants) || [];
      versuche.push({ authorId: a.authorId, ok: true, variants: neu.length });
      varianten = varianten.concat(neu);

      /* `firstUsable` ist die Regel fuer den Betrieb: der bevorzugte
         Autor schreibt, die uebrigen sind Rueckfall. Ohne sie liefen
         generativer und deterministischer Autor immer beide, und die
         Auswahl waere ein Wettbewerb zwischen Werkzeugen statt zwischen
         Texten. */
      if (options.firstUsable !== false && neu.length > 0) break;
    }

    var bewertet = evaluate(varianten, brief, options.gates || {});
    var auswahl = select(bewertet, options);

    return {
      briefId: brief.briefId,
      attempts: versuche,
      variants: varianten,
      evaluated: bewertet,
      selection: auswahl
    };
  }

  var api = {
    compositionCheck: compositionCheck,
    belegWortliste: belegWortliste,
    ueberschneidung: ueberschneidung,
    createRegistry: createRegistry,
    variant: variant,
    evaluate: evaluate,
    select: select,
    run: run
  };

  if (isNode) module.exports = api;
  else global.VUSocialAuthoring = api;
})(typeof window !== "undefined" ? window : globalThis);
