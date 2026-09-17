/* =========================================================================
   VISION UNIVERSE SOCIAL — content.js
   CONTENT CREATION ENGINE (§10)

   Content entsteht NICHT durch einen einzigen Mega-Prompt.

   Neun Stufen, jede mit eigenem Eingang, eigenem Ausgang und eigener
   Pruefung:

     RESEARCH -> THESIS -> HOOK -> STRUCTURE -> DRAFT
              -> FACT CHECK -> BRAND CHECK -> PLATFORM ADAPTATION
              -> FINAL CONTENT PACKAGE

   WARUM STUFEN UND NICHT EIN AUFRUF

   Ein einzelner Aufruf erzeugt einen Text, den niemand mehr auseinander-
   nehmen kann: die Zahl im dritten Satz hat keine erkennbare Herkunft, die
   Hook laesst sich nicht gegen den Text pruefen, und ein Fehler in der
   Mitte zwingt dazu, alles neu zu erzeugen. Stufen machen jede Zwischen-
   stufe pruefbar, wiederholbar und einzeln ersetzbar.

   DIESE DATEI IST DER ORCHESTRATOR, NICHT DER AUTOR

   Sie erzeugt keinen Text. Sie fuehrt die Stufen, uebergibt Contracts,
   prueft Ergebnisse und bricht ab, wenn eine Stufe nicht liefert. Das
   Schreiben der Stufen RESEARCH bis DRAFT ist austauschbar: eine
   deterministische Vorlage (heute) oder ein Sprachmodell (spaeter). Die
   Pruefstufen bleiben in jedem Fall deterministisch (§40).

   AGENTEN REICHEN KEINE ERFUNDENEN FAKTEN WEITER (§39)

   Jede Stufe bekommt nur, was die vorige als Contract abgeliefert hat.
   Eine Stufe, die eine Zahl einfuehrt, muss sie mit einem sourceRef
   begleiten — sonst faellt sie in FACT CHECK durch, und zwar bevor
   irgendjemand den Text gesehen hat.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Schema     = isNode ? require("./schema.js")     : global.VUSocialSchema;
  var FactCheck  = isNode ? require("./fact-check.js") : global.VUSocialFactCheck;
  var Brand      = isNode ? require("./brand.js")      : global.VUSocialBrand;
  var Visual     = isNode ? require("./visual.js")     : global.VUSocialVisual;
  var Untrusted  = isNode ? require("./untrusted.js")  : global.VUSocialUntrusted;
  var Hash       = isNode ? require("../../quant/engines/hash.js") : global.VUHash;

  var STAGES = ["RESEARCH", "THESIS", "HOOK", "STRUCTURE", "DRAFT",
                "FACT_CHECK", "BRAND_CHECK", "PLATFORM_ADAPTATION", "PACKAGE"];

  /* Plattformgrenzen. Sie stehen hier und nicht im Adapter, weil sie die
     TEXTERZEUGUNG betreffen: ein Text, der erst beim Veroeffentlichen an
     der Laenge scheitert, ist zu spaet geprueft. */
  var PLATFORM_LIMITS = {
    instagram: { captionMax: 2200, hashtagMax: 30, hookIdealMax: 100, lineBreaksMatter: true },
    linkedin:  { captionMax: 3000, hashtagMax: 5,  hookIdealMax: 140, lineBreaksMatter: true },
    x:         { captionMax: 280,  hashtagMax: 3,  hookIdealMax: 100, lineBreaksMatter: false },
    facebook:  { captionMax: 5000, hashtagMax: 10, hookIdealMax: 120, lineBreaksMatter: true },
    tiktok:    { captionMax: 2200, hashtagMax: 10, hookIdealMax: 80,  lineBreaksMatter: false },
    youtube:   { captionMax: 5000, hashtagMax: 15, hookIdealMax: 100, lineBreaksMatter: true }
  };

  function stageResult(stage, ok, data, reason) {
    return { stage: stage, ok: ok === true, data: data === undefined ? null : data,
             reason: reason || null };
  }

  /* ------------------------------------------------------------------ */
  /* Die Stufen                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * RESEARCH — sammelt die Belege. Erzeugt keinen Text.
   *
   * Der Ausgang dieser Stufe ist die einzige Quelle von Zahlen fuer alle
   * folgenden. Was hier nicht drin steht, darf spaeter nicht auftauchen.
   */
  function research(opportunity, sources) {
    var refs = (sources || []).map(function (s) { return Schema.sourceRef(s); });
    var usable = refs.filter(function (r) { return r.state === "VERIFIED" || r.state === "STALE"; });
    if (usable.length === 0) {
      return stageResult("RESEARCH", false, { sources: refs },
        "Keine belastbare Quelle. Ohne Beleg entsteht kein Beitrag (§27).");
    }
    var conflicting = refs.filter(function (r) { return r.state === "CONFLICTING"; });
    return stageResult("RESEARCH", true, {
      sources: refs,
      usable: usable,
      conflicting: conflicting,
      /* Die harten Zahlen, auf die sich spaetere Stufen berufen duerfen. */
      facts: usable
        .filter(function (r) { return r.value !== null && r.value !== undefined; })
        .map(function (r) {
          return { metric: r.metric, value: r.value, unit: r.unit, entity: r.entity, source: r };
        })
    }, conflicting.length ? conflicting.length + " widerspruechliche Quelle(n) ausgeschlossen." : null);
  }

  /**
   * THESIS — die eine Aussage des Beitrags.
   *
   * Ohne These gibt es keinen Beitrag, sondern eine Zusammenfassung.
   * §57: "Welche eigene Perspektive kann Vision Universe dazu liefern?"
   */
  function thesis(opportunity, researchData, writer) {
    var text = writer && typeof writer.thesis === "function"
      ? writer.thesis(opportunity, researchData)
      : null;
    if (!text) {
      return stageResult("THESIS", false, null,
        "Keine These erzeugt. Ein Beitrag ohne eigene Aussage wird nicht gebaut.");
    }
    return stageResult("THESIS", true, { text: String(text) });
  }

  /** HOOK — der Einstieg. Stark erlaubt, unbelegt nicht. */
  function hook(opportunity, thesisData, researchData, writer) {
    var text = writer && typeof writer.hook === "function"
      ? writer.hook(opportunity, thesisData, researchData)
      : null;
    if (!text) return stageResult("HOOK", false, null, "Keine Hook erzeugt.");
    return stageResult("HOOK", true, { text: String(text) });
  }

  /** STRUCTURE — der Aufbau, noch ohne Formulierung. */
  function structure(opportunity, thesisData, researchData, strategyDecision, writer) {
    var plan = writer && typeof writer.structure === "function"
      ? writer.structure(opportunity, thesisData, researchData, strategyDecision)
      : null;
    if (!plan || !Array.isArray(plan.beats) || plan.beats.length === 0) {
      return stageResult("STRUCTURE", false, null, "Kein Aufbau erzeugt.");
    }
    return stageResult("STRUCTURE", true, plan);
  }

  /** DRAFT — der ausformulierte Text. */
  function draft(opportunity, parts, writer) {
    var text = writer && typeof writer.draft === "function" ? writer.draft(opportunity, parts) : null;
    if (!text || !text.caption) return stageResult("DRAFT", false, null, "Kein Entwurf erzeugt.");
    return stageResult("DRAFT", true, {
      caption: String(text.caption),
      cta: text.cta ? String(text.cta) : null,
      hashtags: Array.isArray(text.hashtags) ? text.hashtags.slice() : [],
      /* Die Belege, die der Entwurf beansprucht. Sie muessen aus RESEARCH
         stammen — die Pruefung dazu steht in FACT_CHECK. */
      claims: Array.isArray(text.claims) ? text.claims : []
    });
  }

  /**
   * PLATFORM ADAPTATION — dieselbe Aussage, andere Form.
   *
   * Nicht: derselbe Text mit anderem Zeilenumbruch. Wo der Text nicht
   * passt, wird gekuerzt und das GEMELDET — nicht stillschweigend
   * abgeschnitten.
   */
  function adaptToPlatform(pkg, platform) {
    var limits = PLATFORM_LIMITS[platform];
    if (!limits) {
      return stageResult("PLATFORM_ADAPTATION", false, null,
        "Keine Grenzwerte fuer Plattform '" + platform + "' hinterlegt.");
    }
    var caption = String(pkg.caption || "");
    var notes = [];
    var truncated = false;

    if (caption.length > limits.captionMax) {
      /* An einer Satzgrenze kuerzen, nicht mitten im Wort. */
      var cut = caption.slice(0, limits.captionMax);
      var lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
      caption = lastStop > limits.captionMax * 0.6 ? cut.slice(0, lastStop + 1) : cut;
      truncated = true;
      notes.push("Der Text wurde von " + String(pkg.caption).length + " auf " + caption.length +
                 " Zeichen gekuerzt (Grenze " + limits.captionMax + ").");
    }

    var hashtags = (pkg.hashtags || []).slice(0, limits.hashtagMax);
    if ((pkg.hashtags || []).length > limits.hashtagMax) {
      notes.push("Hashtags von " + pkg.hashtags.length + " auf " + limits.hashtagMax + " reduziert.");
    }
    if (String(pkg.hook || "").length > limits.hookIdealMax) {
      notes.push("Die Hook ist fuer " + platform + " laenger als ideal (" +
                 String(pkg.hook).length + " von " + limits.hookIdealMax + ").");
    }

    return stageResult("PLATFORM_ADAPTATION", true, {
      platform: platform, caption: caption, hashtags: hashtags,
      truncated: truncated, notes: notes
    });
  }

  /* ------------------------------------------------------------------ */
  /* Der Ablauf                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Fuehrt die Pipeline aus.
   *
   * @param input.opportunity        Schema.contentOpportunity
   * @param input.sources            Rohquellen fuer RESEARCH
   * @param input.strategyDecision   Ergebnis von strategy.decide()
   * @param input.visualAvailability Eingabe fuer visual.selectVisual()
   * @param input.writer             Die Stufen RESEARCH..DRAFT (Vorlage oder Modell)
   * @param options.now, options.timeSensitivity
   *
   * @returns { ok, package, stages[], failedStage, explanation }
   */
  function run(input, options) {
    input = input || {};
    options = options || {};
    var stages = [];
    var opportunity = input.opportunity || {};
    var strategyDecision = input.strategyDecision || {};
    var platform = strategyDecision.platform || opportunity.platform || "instagram";

    function stop(result) {
      stages.push(result);
      return {
        ok: false, package: null, stages: stages, failedStage: result.stage,
        explanation: "Die Pipeline endete in Stufe " + result.stage + ": " + result.reason
      };
    }

    /* 1. RESEARCH */
    var r = research(opportunity, input.sources);
    if (!r.ok) return stop(r);
    stages.push(r);

    /* 2. THESIS */
    var t = thesis(opportunity, r.data, input.writer);
    if (!t.ok) return stop(t);
    stages.push(t);

    /* 3. HOOK */
    var h = hook(opportunity, t.data, r.data, input.writer);
    if (!h.ok) return stop(h);
    stages.push(h);

    /* 4. STRUCTURE */
    var s = structure(opportunity, t.data, r.data, strategyDecision, input.writer);
    if (!s.ok) return stop(s);
    stages.push(s);

    /* 5. DRAFT */
    var d = draft(opportunity, { thesis: t.data, hook: h.data, structure: s.data, research: r.data }, input.writer);
    if (!d.ok) return stop(d);
    stages.push(d);

    /* Zwischenstand als Paket. */
    var pkg = {
      packageId: Hash.prefixedHash("pkg", {
        opportunityId: opportunity.opportunityId, platform: platform,
        hook: h.data.text, caption: d.data.caption
      }),
      opportunityId: opportunity.opportunityId || null,
      createdAt: options.now || new Date().toISOString(),
      topic: opportunity.topic || "unbenannt",
      thesis: t.data.text,
      hook: h.data.text,
      caption: d.data.caption,
      cta: d.data.cta,
      hashtags: d.data.hashtags,
      archetype: strategyDecision.archetype || null,
      claims: d.data.claims
    };

    /* 6. FACT CHECK — vor der Markenpruefung. Ein Text, der falsch ist,
          muss nicht schoen sein. */
    var fact = FactCheck.check(pkg, {
      now: options.now,
      timeSensitivity: options.timeSensitivity || strategyDecision.timeSensitivity || "TIMELY"
    });
    stages.push(stageResult("FACT_CHECK", fact.passed, fact, fact.passed ? null : fact.explanation));
    if (!fact.passed) {
      return { ok: false, package: null, stages: stages, failedStage: "FACT_CHECK",
               explanation: "Faktenpruefung nicht bestanden: " + fact.explanation };
    }

    /* Zusaetzlich: kein Beleg darf aus einer Quelle stammen, die RESEARCH
       nicht kennt. Sonst haette eine spaetere Stufe eine Zahl eingefuehrt. */
    var knownSources = r.data.sources.map(function (x) { return x.source + "|" + (x.metric || ""); });
    var foreign = (pkg.claims || []).filter(function (c) {
      if (!c.source) return true;
      return knownSources.indexOf(c.source.source + "|" + (c.source.metric || "")) === -1;
    });
    if (foreign.length > 0) {
      stages.push(stageResult("FACT_CHECK", false, { foreign: foreign },
        foreign.length + " Beleg(e) stammen nicht aus der Recherchestufe."));
      return { ok: false, package: null, stages: stages, failedStage: "FACT_CHECK",
        explanation: "Eine spaetere Stufe hat Zahlen eingefuehrt, die die Recherche nicht kennt. " +
                     "Genau das darf zwischen Agenten nicht passieren (§39)." };
    }

    /* 7. BRAND CHECK */
    var brand = Brand.check(pkg);
    stages.push(stageResult("BRAND_CHECK", brand.passed, brand, brand.passed ? null : brand.explanation));
    if (!brand.passed) {
      return { ok: false, package: null, stages: stages, failedStage: "BRAND_CHECK",
               explanation: "Markenpruefung nicht bestanden: " + brand.explanation };
    }

    /* 8. PLATFORM ADAPTATION */
    var adapted = adaptToPlatform(pkg, platform);
    if (!adapted.ok) return stop(adapted);
    stages.push(adapted);

    /* Visual. */
    var visual = Visual.selectVisual({
      archetype: pkg.archetype,
      available: input.visualAvailability || {},
      recentVisuals: input.recentVisuals || []
    });

    /* 9. PACKAGE */
    var finalPackage = Schema.contentPackage({
      packageId: pkg.packageId,
      opportunityId: pkg.opportunityId,
      createdAt: pkg.createdAt,
      topic: pkg.topic,
      thesis: pkg.thesis,
      hook: pkg.hook,
      caption: adapted.data.caption,
      cta: pkg.cta,
      hashtags: adapted.data.hashtags,
      archetype: pkg.archetype,
      visualType: visual.visualType,
      visualBrief: visual.visualType ? Visual.buildBrief({
        visualType: visual.visualType,
        title: pkg.hook,
        dataReferences: r.data.facts.map(function (f) { return f.metric + "@" + f.source.source; })
      }) : null,
      variants: (function () {
        var v = {}; v[platform] = { caption: adapted.data.caption, hashtags: adapted.data.hashtags }; return v;
      })(),
      claims: pkg.claims,
      validation: {
        factCheck: { passed: fact.passed, state: fact.state, explanation: fact.explanation },
        brandCheck: { passed: brand.passed, score: brand.score, explanation: brand.explanation },
        fatigueCheck: null   /* laeuft erst gegen das Gedaechtnis, eine Stufe spaeter */
      }
    });
    stages.push(stageResult("PACKAGE", true, { packageId: finalPackage.packageId }));

    return {
      ok: true,
      package: finalPackage,
      stages: stages,
      failedStage: null,
      visual: visual,
      adaptationNotes: adapted.data.notes,
      explanation: "Alle neun Stufen durchlaufen. Faktenpruefung " + fact.state +
        ", Markenwert " + brand.score + ", Bildform " + (visual.visualType || "keine") + "."
    };
  }

  /**
   * Eine deterministische Vorlage fuer die Stufen RESEARCH..DRAFT.
   *
   * Sie ist KEIN Ersatz fuer gute Texte. Sie existiert, damit die
   * Pipeline in CI und in der fruehen Betriebsphase vollstaendig
   * durchlaufen kann, ohne dass ein Sprachmodell angebunden sein muss —
   * und damit die Pruefstufen an echtem Material getestet werden.
   *
   * Sie erfindet nichts: jede Zahl im Text stammt aus RESEARCH und traegt
   * ihren sourceRef.
   */
  function createTemplateWriter(options) {
    options = options || {};
    return {
      /* -----------------------------------------------------------------
         WAS DIESE VORLAGE SAGEN DARF

         Sie sieht genau das, was `sourceRef` durchlaesst: Kennzahl,
         Wert, Einheit, Entitaet, Quelle. Keinen Trend, keinen Anlass,
         keine Ursache — die stehen im Signal, aber nicht im Beleg.

         Die frueheren Texte behaupteten trotzdem eine Erklaerung: die
         Hook fragte "Warum bewegt sich XOM gerade?", und die Caption
         antwortete "Der Grund liegt in den Daten: Technical Opportunity
         Score steht bei 76." Das ist keine Antwort auf die Frage. Es ist
         eine Zahl mit dem Wort "Grund" davor.

         Die Markenpruefung liess es durch, weil sie auf das Wort
         "Grund" prueft. Eine Hook-Einloesung, die an einem Wort haengt,
         ist an einem Wort zu haben — deshalb stellt die Vorlage die
         Frage jetzt gar nicht erst.
         ----------------------------------------------------------------- */
      thesis: function (opportunity, researchData) {
        var fact = researchData.facts[0];
        if (!fact) return null;
        return (fact.entity ? fact.entity + ": " : "") + fact.metric + " steht bei " +
               String(fact.value) + (fact.unit ? " " + fact.unit : "") +
               ". Das ist eine Lagebeschreibung, keine Prognose.";
      },
      hook: function (opportunity, thesisData, researchData) {
        var fact = researchData.facts[0];
        if (!fact) return null;
        /* Nennt, was da ist. Verspricht nichts, was der Text nicht
           einloest. */
        return (fact.entity || opportunity.topic) + ": " + String(fact.value) +
               (fact.unit ? " " + fact.unit : "") + " im " + fact.metric + ".";
      },
      structure: function (opportunity, thesisData, researchData) {
        return {
          beats: [
            { id: "observation", note: "Was ist passiert" },
            { id: "context", note: "Warum es passiert" },
            { id: "relevance", note: "Was es fuer Anleger bedeutet" }
          ]
        };
      },
      draft: function (opportunity, parts) {
        var facts = parts.research.facts;
        if (!facts.length) return null;
        var f = facts[0];
        var valueText = String(f.value) + (f.unit ? " " + f.unit : "");
        var wer = f.entity || opportunity.topic;

        /* Drei Saetze, und keiner behauptet mehr als der Beleg hergibt:
           was gemessen wurde, was die Zahl NICHT sagt, und warum wir sie
           trotzdem zeigen.

           Der mittlere Satz ist der wichtigste. Eine Kennzahl ohne ihre
           Grenze liest sich wie eine Aussage ueber die Zukunft, und
           genau das ist sie nicht. */
        var caption =
          "Unsere technische Auswertung bewertet " + wer + " derzeit mit " +
          valueText + " im " + f.metric + ". " +
          "Der Wert beschreibt die aktuelle Lage — nicht ihre Ursache und nicht, " +
          "was als Naechstes passiert. " +
          "Wir zeigen ihn, weil eine nachvollziehbare Zahl mehr wert ist als eine " +
          "Einschaetzung ohne Grundlage. " +
          "Keine Anlageberatung.";
        return {
          caption: caption,
          cta: options.cta || "Mehr Daten dazu auf Vision Universe.",
          hashtags: options.hashtags || ["VisionUniverse", "Investment", "Daten"],
          /* Beide Belege: der Wert UND die Bezeichnung. Die Bezeichnung
             allein kann schon eine Aussage sein — "52-Wochen-Hoch" ist
             ein Superlativ und damit belegpflichtig, auch ohne Zahl. */
          claims: [
            { text: valueText, numeric: f.value, source: f.source },
            { text: String(f.metric), numeric: null, source: f.source }
          ]
        };
      }
    };
  }

  var api = {
    STAGES: STAGES,
    PLATFORM_LIMITS: PLATFORM_LIMITS,
    research: research,
    adaptToPlatform: adaptToPlatform,
    run: run,
    createTemplateWriter: createTemplateWriter
  };

  if (isNode) module.exports = api;
  else global.VUSocialContent = api;
})(typeof window !== "undefined" ? window : globalThis);
