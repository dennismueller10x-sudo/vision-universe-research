/* =========================================================================
   VISION UNIVERSE SOCIAL — Autor: ChatGPT Work (generativ, ueber GitHub)

   -------------------------------------------------------------------------
   WARUM DIESER AUTOR ANDERS IST ALS DIE ANDEREN
   -------------------------------------------------------------------------

   Der Vorlagen-Autor antwortet sofort. Dieser antwortet SPAETER: Vision
   Universe legt einen Brief auf einen Request-Branch, oeffnet einen Pull
   Request, und das PR-Ereignis loest den Creative Agent aus. Er schreibt
   sein Ergebnis samt Bildasset auf denselben Branch zurueck.

   Der Adapter hat deshalb zwei Haelften, die sich nie gleichzeitig
   sehen:

     request(brief)   erzeugt den Brief-Inhalt und sagt, wohin er gehoert
     ingest(result)   liest, PRUEFT und uebersetzt das Ergebnis

   Dazwischen liegt ein fremdes System. Das ist keine Schwaeche der
   Bauweise, sondern ihr Zweck: der Agent bekommt kein Netz zu uns,
   keinen Schluessel, keinen Aufruf. Er bekommt eine Datei und legt eine
   Datei zurueck.

   -------------------------------------------------------------------------
   DIE KENNUNGEN LEITET VISION UNIVERSE AB — NICHT DER AGENT
   -------------------------------------------------------------------------

   Der Owner verlangt: eine einmal verwendete `hook_variant_id` darf
   niemals spaeter einen anderen Text bezeichnen.

   Das laesst sich nicht dadurch erreichen, dass man dem Agenten glaubt.
   Er koennte dieselbe Kennung zweimal vergeben, und im ersten Textproof
   tat er es beinahe: dort hiessen die Varianten `vu-proof-hook-001-a/b/c`
   — frei gewaehlt und an nichts gebunden.

   Die Kennung ist deshalb eine FUNKTION des Inhalts:

     content_id : brief_blob_sha : hook_type : ordinal

   Vision Universe rechnet sie nach und vergleicht. Weicht der Agent ab,
   ist das ein Befund und keine Geschmacksfrage — eine Kennung, die sich
   nicht nachrechnen laesst, kann spaeter keine Messung tragen.

   -------------------------------------------------------------------------
   DIE EMPFEHLUNG IST EINE EMPFEHLUNG
   -------------------------------------------------------------------------

   Der Agent darf eine redaktionelle Meinung abgeben. Sie heisst
   `recommended_hook` und traegt `is_canonical_selection: false`.

   Ein Ergebnis mit `selected_hook` wird zurueckgewiesen. Nicht, weil
   die Wahl schlecht waere, sondern weil die kanonische Auswahl zur
   Strategie gehoert und die Strategie bei Vision Universe liegt. Wer
   das einmal durchgehen laesst, hat die Verantwortungsgrenze
   verschoben, ohne sie zu verhandeln.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Authoring = isNode ? require("../../../engines/authoring.js") : global.VUSocialAuthoring;
  var German = isNode ? require("../../../engines/german-text.js") : global.VUSocialGermanText;
  var AssetTransport = isNode ? require("../../../engines/asset-transport.js")
    : global.VUSocialAssetTransport;
  var Contract = isNode ? require("../../../engines/creative-contract.js")
    : global.VUSocialCreativeContract;
  var AssetStore = isNode ? require("../../../engines/asset-store.js")
    : global.VUSocialAssetStore;
  var AssetIntegrity = isNode ? require("../../../engines/asset-integrity.js")
                              : global.VUSocialAssetIntegrity;
  var nodeCrypto = isNode ? require("crypto") : null;

  /* Der Pfad, unter dem Brief, Ergebnis und Assets liegen. Er steht im
     realen Proof und wird hier nicht neu erfunden. */
  function requestDir(contentId) {
    return "authoring/requests/" + String(contentId);
  }

  /**
   * Der Git-Blob-SHA eines Inhalts.
   *
   * Git hasht nicht den Inhalt allein, sondern "blob <laenge>" gefolgt
   * von einem Nullbyte und dem Inhalt. Diese Formel steht hier, weil die
   * Kennungen daran haengen: wer sie nachrechnen will, muss das koennen,
   * ohne Git zu starten.
   */
  function blobSha(inhalt) {
    if (!nodeCrypto) throw new Error("VUSocialAuthorChatGptWork: nur unter Node.");
    var buf = Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(String(inhalt), "utf8");
    var kopf = Buffer.from("blob " + buf.length + "\u0000", "utf8");
    return nodeCrypto.createHash("sha1").update(Buffer.concat([kopf, buf])).digest("hex");
  }

  function ordinal(i) { return String(i + 1).padStart(2, "0"); }

  /** content_id : brief_blob_sha : hook_type : ordinal */
  function hookVariantId(contentId, briefBlobSha, hookType, index) {
    return [contentId, briefBlobSha, hookType, ordinal(index)].join(":");
  }

  /** content_id : brief_blob_sha : visual : strategy : ordinal */
  function visualVariantId(contentId, briefBlobSha, strategy, index) {
    return [contentId, briefBlobSha, "visual", strategy, ordinal(index)].join(":");
  }

  /** Der Schluessel, unter dem ein Lauf hoechstens einmal verarbeitet wird. */
  function processingKey(briefId, contentId, briefBlobSha, schemaVersion) {
    return [briefId, contentId, briefBlobSha, schemaVersion || "1.0"].join(":");
  }

  /* -------------------------------------------------------------------
     DER BRIEF FUER DEN AGENTEN

     Er ist eine UEBERSETZUNG des kanonischen Content Briefs in die Form,
     die der verifizierte Proof benutzt — keine zweite Quelle. Was der
     Agent sehen darf, entscheidet weiterhin `content-brief.js`.
     ------------------------------------------------------------------- */
  function buildAgentBrief(brief, options) {
    options = options || {};
    var contentId = options.contentId || brief.contentId || brief.briefId;
    var visualStrategy = options.visualStrategy || brief.visualType || "FUTURE_TECH";

    /* -------------------------------------------------------------------
       DER ERNEUTE ANLAUF

       Schweigt der Anbieter, muss derselbe Inhalt irgendwann noch einmal
       angefragt werden koennen. Genau das war bisher nicht moeglich,
       ohne die Idempotenz zu verletzen: derselbe Brief ergibt denselben
       Blob-SHA, denselben Processing Key — und das Ledger weist den
       zweiten Anlauf zu Recht ab.

       Die Loesung braucht kein neues Verfahren. Der Anlauf steht IM
       BRIEF. Damit aendern sich seine Bytes, damit sein Blob-SHA, damit
       sein Processing Key und damit alle Varianten-Kennungen — jeder
       Anlauf ist sauber ein eigener Vorgang, und die Idempotenzgrenze
       bleibt genau da, wo sie war.

       `supersedes_attempt` haelt die Kette zusammen: der zweite Anlauf
       weiss, wessen Nachfolger er ist. Ein Neuversuch, der seine
       Vorgeschichte verliert, ist von einem Erstversuch nicht mehr zu
       unterscheiden — und dann laesst sich nicht mehr sagen, wie oft der
       Anbieter fuer diesen Inhalt gebraucht wurde.

       Erhoeht wird der Zaehler NICHT selbsttaetig. Er ist ein Parameter,
       und wer ihn setzt, hat sich entschieden.
       ------------------------------------------------------------------- */
    var anlauf = Number(options.attempt) || 1;

    return {
      schema_version: "1.0",
      fixture_type: options.fixtureType || "production_authoring_request",

      /* -----------------------------------------------------------------
         DIE ART DES AUFTRAGS

         Sie fehlte. PR 110 wollte Text neu und Bild geerbt - und wurde
         nach der einzigen Art beurteilt, die der Empfaenger kannte:
         "Text UND neues Bild". Der Request war vertragswidrig, und weil
         niemand das aussprechen konnte, sah es zwoelf Stunden lang wie
         ein Zustellungsfehler aus.
         ----------------------------------------------------------------- */
      request_type: options.requestType || Contract.FULL_CREATIVE,
      visual: options.inheritance || { mode: Contract.GENERATE_NEW_ASSET,
        regeneration_allowed: true },

      test_fixture: options.testFixture === true,
      brief_id: brief.briefId,
      content_id: contentId,
      attempt: anlauf,
      supersedes_attempt: anlauf > 1 ? (anlauf - 1) : null,
      attempt_reason: anlauf > 1 ? (options.attemptReason ||
        "Voriger Anlauf ohne beobachtbares Ergebnis.") : null,
      brand: "Vision Universe",
      language: (brief.constraints && brief.constraints.language) || "de",
      channel: options.channel || "instagram",
      format: options.format || "single-post",
      topic: brief.topic,
      objective: options.objective ||
        "Aus der freigegebenen Evidenz einen belegbaren Beitrag formulieren.",
      audience: options.audience || "Anleger mit Interesse an nachvollziehbaren Daten",

      hook_strategy: {
        strategy_id: options.hookStrategyId || ("vu-" + String(brief.archetype || "generic")
          .toLowerCase().replace(/_/g, "-") + "-v1"),
        hook_type: options.hookType || "value_first",
        instruction: options.hookInstruction ||
          "Formuliere Varianten innerhalb dieser Strategie. Keine andere Strategie " +
          "waehlen, keine Prognose, keine Empfehlung."
      },

      visual_strategy: {
        strategy_id: visualStrategy,
        instruction: options.visualInstruction ||
          "Eine hochwertige, abstrakte Szene im Vision-Universe-Register.",
        creative_freedom: "Motiv, Komposition, Lichtfuehrung und Materialitaet " +
          "innerhalb der Strategie.",
        palette: options.palette || ["deep black", "white", "chrome", "electric cyan"],
        style: options.visualStyle || "premium cinematic 3D technology visualization",
        composition: options.visualComposition || "portrait 4:5, generous negative space",
        /* Der Vorlagen-Fall (Stufe B setzt Logo/Atlas/Text danach drauf) verlangt ein
           leeres Bild — deshalb bleibt das der Standard. Der Web-First-Full-Post-Pfad
           uebergibt eine eigene, positive Liste (siehe request-creative-web.mjs) und
           verlangt stattdessen ueber `brand_assets` unten, dass der Agent Logo, Atlas
           und Text selbst hineinkomponiert. */
        restrictions: options.restrictions || ["Kein Text im Bild", "Kein Logo",
          "Keine Kurse im Bild", "Keine Renditezahlen", "Kein Wasserzeichen"]
      },

      /* -----------------------------------------------------------------
         DIE MARKENASSETS ALS DATEIEN, NICHT ALS BESCHREIBUNG (Owner-
         Direktive "GENERATIVES VOLLBILD", 26.09.)

         Vorher bekam der Agent nur eine Bildidee und liess Logo/Atlas/
         Text bewusst aus (Stufe B setzte sie danach deterministisch
         drauf) — genau das nannte der Owner "aufgeklebt aussehend".
         Jetzt bekommt er, wenn `options.brandAssets` gesetzt ist, die
         EXAKTEN Dateipfade im selben Checkout und die Anweisung, sie
         unveraendert zu verwenden statt sie nachzuzeichnen — ein Logo,
         das ein Modell frei nachmalt, ist ein anderes Zeichen (§18).

         `announcement_required` erzwingt eine explizite Rueckmeldung
         (siehe verifyResult): eine STILLE Annahme ("wird schon drin
         sein") waere wieder geglaubt statt geprueft. Gemessen werden
         kann es an dieser Stelle nicht (kein Bildanalysewerkzeug im
         Haus) — die Rueckmeldung ersetzt keine Pruefung, sie macht nur
         ehrlich sichtbar, dass keine stattgefunden hat, und macht den
         Owner im Approval Center zur tatsaechlichen Pruefinstanz.
         ----------------------------------------------------------------- */
      brand_assets: options.brandAssets || null,

      /* DIE BELEGE. Genau die, die `content-brief.js` freigegeben hat. */
      evidence: (brief.evidence || []).map(function (e) {
        return { id: e.id, entity: e.entity, metric: e.metric, value: e.value,
                 unit: e.unit, source: e.source, observed_at: e.observedAt,
                 state: e.state, note: e.note || null };
      }),
      must_not_claim: (brief.mustNotClaim || []).map(function (m) {
        return { id: m.id, text: m.text };
      }),

      asset_requirements: {
        count: (options.requestType === Contract.TEXT_REVISION) ? 0 : 1,
        preferred_mime_type: "image/png",
        preferred_width: options.width || 1080,
        preferred_height: options.height || 1350,
        deterministic_path: requestDir(contentId) + "/assets/visual-01.png",

        /* -------------------------------------------------------------
           DIE ANKUENDIGUNG IST TEIL DER LIEFERUNG

           Geprueft wird nicht die Datei gegen sich selbst, sondern die
           Datei gegen das, was der Agent ueber sie BEHAUPTET. Fehlt die
           Behauptung, gibt es nichts zu vergleichen, und der Vertrag
           wertet das als Mangel des Ergebnisses - nicht als bestandene
           Pruefung. Deshalb steht hier, was jede Bildvariante nennen
           muss, statt dass es nur im Prueferkopf existiert.
           ------------------------------------------------------------- */
        announced_fields_required: [
          "asset_path", "mime_type", "width", "height",
          "asset_byte_size", "asset_sha256"
        ],
        announcement_note:
          "asset_byte_size ist die Groesse der geschriebenen Datei in Bytes, " +
          "asset_sha256 ihr SHA-256 ueber den gesamten Inhalt. Beides wird " +
          "nach dem finalen Commit frisch zurueckgelesen und verglichen."
      },

      authoring_requirements: {
        hook_variant_count: Number(options.variants) || 4,
        stable_hook_variant_ids: true,
        hook_ids_bound_to_brief_blob_sha: true,
        visual_variant_ids_bound_to_brief_blob_sha: true,
        /* Die Grenze, um die es geht: eine Empfehlung ja, eine
           kanonische Auswahl nein. */
        recommended_hook_allowed: true,
        canonical_selected_hook_allowed: false,
        evidence_refs_required: true,
        /* Bei TEXT_REVISION ist das Bild geerbt, nicht abwesend. Die
           Pflicht faellt nicht weg - sie wandert in die Vererbung, und
           die ist strenger: sie nennt Hash, Groesse, Format und Masse. */
        actual_image_asset_required:
          options.requestType === Contract.TEXT_REVISION ? false
            : options.requireAsset !== false,
        /* Siehe `brand_assets` oben: erzwingt eine explizite
           Rueckmeldung `brand_elements` je Bildvariante (verifyResult
           unten), statt stillschweigend anzunehmen, dass Logo, Atlas
           und Hook-Text im Bild stehen. */
        brand_elements_announcement_required: options.requireBrandElementsAnnounced === true,
        publishing_allowed: false
      },

      constraints: [
        "Jede Zahl im Text muss exakt aus `evidence` stammen.",
        "Nichts ausrechnen, nichts aufrunden, keine Jahreszahlen ergaenzen.",
        "Keine anderen Titel nennen.",
        "Hook-Strategie ausschliesslich aus diesem Brief uebernehmen.",
        "Visual Strategy ausschliesslich aus diesem Brief uebernehmen.",
        "Kein `selected_hook` — nur `recommended_hook`.",
        "Keine Placeholder- oder programmatisch erzeugte Ersatzgrafik.",
        "Keine Veroeffentlichung."
      ],

      publishing_allowed: false
    };
  }

  /* -------------------------------------------------------------------
     DER CAROUSEL-AUFTRAG — EIN WORK-JOB BESITZT DEN GANZEN BEITRAG
     (Owner-Auftrag "WORK OWNS THE POST", 29.09.; Art Direction nach
     "OWNER CREATIVE DIRECTION", 30.09.)

     Work entscheidet Story, Angle, Hook, Caption, Dramaturgie und Bild.
     Vision Universe gibt Rohmaterial, Marke, die Designsprache der
     Owner-Referenzen und die Pruefkriterien mit - einen RAHMEN, keine
     Schablone: keine Layout-Zonen, keine Pixelvorgaben, kein Motiv.

     DIE LIEFERGRENZE (gemessen, nicht vermutet):
       PR #300  der aktive Agentenvertrag erlaubt EIN Asset
                (assets/visual-01.png) je FULL_CREATIVE-Auftrag.
       PR #303  ein Bogen mit drei Paneelen scheitert an der Bild-
                generierung: 1942x809 statt 3240x1350, zweimal.
       PR #296  auch ein Einzelbild kommt in den Massen des Werkzeugs
                (1092x1440), nicht in exakten 1080x1350.
     Deshalb liefert Work bis zur Vertragserweiterung ZUERST das Cover
     (COVER_FIRST) - vollendet - plus die komplette Dramaturgie aller
     Slides. MULTI_ASSET (eine Datei je Slide) ist vorbereitet und wird
     erst eingeschaltet, wenn der Owner den Work-Vertrag erweitert hat
     (social/config/work-agent.json, docs/social/WORK_OUTPUT_CONTRACT.md).
     ------------------------------------------------------------------- */
  var CAROUSEL_HOOK_TYPE = "carousel_cover_hook_de";
  var COVER_FIRST = "COVER_FIRST";
  var MULTI_ASSET = "MULTI_ASSET";
  var STANDARD_SLIDES = 3;

  var NEGATIVE_HOOKS = [
    "BÖRSENGANG MIT EXISTENZWARNUNG",
    "50.000 DOLLAR FÜR EIN AUTO?",
    "493,78 USD SCHLUSSKURS – MSFT",
    "420 VON 5954 GEPRÜFTEN TITELN",
    "10-year U.S. Treasury yield tops ..."
  ];

  function carouselSlidePfad(contentId, index) {
    return requestDir(contentId) + "/assets/slide-" + ordinal(index) + ".png";
  }

  /* Der einzige Pfad, den der aktive Agentenvertrag beschreibt (PR #300). */
  function coverPfad(contentId) {
    return requestDir(contentId) + "/assets/visual-01.png";
  }

  /**
   * Die Lieferung eines Ergebnisses: welche Slides als Datei vorliegen
   * und welche nur geplant sind. Eine Bildvariante = COVER_FIRST.
   */
  function carouselLieferung(r) {
    var v = (Array.isArray(r && r.visual_variants) ? r.visual_variants : []).slice()
      .sort(function (a, b) { return Number(a && a.slide_index) - Number(b && b.slide_index); });
    var plan = Array.isArray(r && r.carousel_plan) ? r.carousel_plan : [];
    return v.length === 1
      ? { modus: COVER_FIRST, slides: v, geliefert: 1, geplant: plan.length }
      : { modus: MULTI_ASSET, slides: v, geliefert: v.length, geplant: v.length };
  }

  /* -------------------------------------------------------------------
     DIE DESIGNSPRACHE DER OWNER-REFERENZEN (30.09., §2-§9)
     Ein Rahmen, den Work fuellt - der Wortlaut folgt der Direktive.
     ------------------------------------------------------------------- */
  var ART_DIRECTION = {
    principle: "Kein starres Template. Nicht: jeder Vision-Universe-Post sieht gleich aus. " +
      "Sondern: jeder Post sieht aus, als kaeme er von derselben hochwertigen Marke. Du " +
      "entwickelst je Story eigene Layouts, Perspektiven, Bildideen und Kompositionen - auf " +
      "der Qualitaetsstufe und in der Designsprache der Referenzbilder.",
    design_language: "PREMIUM FINANCE EDITORIAL x HIGH-END TECHNOLOGY x MODERN CAMPAIGN DESIGN",
    characteristics: [
      "tiefschwarze bzw. sehr dunkle, hochwertige Grundflaeche",
      "starke Kontraste",
      "grosse, selbstbewusste Typografie",
      "klare Informationshierarchie",
      "wenige dominante Elemente, kontrollierter Negativraum",
      "hochwertige Produkt-, Technologie- oder Finanzvisualisierung",
      "Weiss als primaere Schriftfarbe",
      "wenige gezielte Akzentfarben - bevorzugt Vision-Universe-Blau; Rot nur, wenn es " +
        "inhaltlich traegt (z. B. Risiko)",
      "hochwertige Licht- und Materialwirkung",
      "klare mobile Lesbarkeit, keine visuelle Ueberladung"
    ],
    not_wanted: [
      "billige Flat-Vector-Grafiken", "Comic-Poster", "Canva-Look", "klassische Infografik",
      "Finfluencer-Thumbnail", "ueberladene Collagen", "zehn kleine Zahlen gleichzeitig",
      "zahlreiche Pfeile, Kaesten und Icons", "generische Stockbilder",
      "zufaellige KI-Landschaften", "surrealistische Metaphern nur um kreativ zu wirken",
      "aufgerissene Buecher, Abgruende und aehnliche KI-Klischees, wenn die Story sie nicht traegt",
      "generische Serverraeume fuer jedes KI-Thema", "Text einfach auf ein beliebiges Bild gelegt"
    ],
    one_idea_per_slide: "ONE SLIDE = ONE IDEA = ONE VISUAL HIERARCHY. Jede Slide hat genau eine " +
      "dominante Aussage (etwa eine grosse Zahl oder ein kurzer Satz) - nicht sechs Zahlen, drei " +
      "Headlines, vier Icons, Diagramm und Karte auf derselben Seite.",
    typography: "Typografie ist Gestaltungselement. Die Hook darf gross und selbstbewusst sein. " +
      "Keine Bandwurmsaetze, keine winzige Textwueste, keine schlechte Worttrennung, keine Woerter " +
      "ueber Bildkanten oder Falze zerlegt, keine drei konkurrierenden Headlines. Auf dem " +
      "Smartphone muss innerhalb einer Sekunde klar sein: WAS IST DIE AUSSAGE?",
    brand_system: "Vision-Universe-Logo auf ALLEN Slides, bevorzugt oben links, innerhalb eines " +
      "Carousels in identischer Position, Groesse und Sicherheitsabstand. Atlas NUR auf Slide 1 - " +
      "als Host und Markenfigur hochwertig in die Komposition integriert, nicht wie ein Sticker " +
      "auf ein fertiges Bild gesetzt.",
    carousel_coherence: "Die Slides duerfen unterschiedliche Layouts haben (z. B. Slide 1 Atlas + " +
      "grosses Motiv + Hook, Slide 2 dominante Zahl + Produkt-/Technologievisual, Slide 3 Split " +
      "Chance/Risiko) - erwuenscht. Gemeinsam teilen sie Logo-System, Typografie-Familie, " +
      "Farbwelt, Material- und Lichtqualitaet, Designniveau und visuelle Sprache. Pruefe: lege ich " +
      "die Slides nebeneinander, erkenne ich sofort EINEN Vision-Universe-Post?",
    story_decides_motif: "Die Referenzen definieren die Designsprache, nicht das Motiv. Das Motiv " +
      "entsteht aus der Story (Halbleiter: Wafer, Lithografie, Chip-Strukturen; Rohstoffe: " +
      "Material, industrielle Anwendung; Unternehmen: Produkt, Technologie, Infrastruktur, " +
      "Geschaeftsmodell; Makro: hochwertige, nachvollziehbare finanzielle Visualisierung). Keine " +
      "mechanische Zuordnung: erst die Story verstehen, dann das Visual Concept entwickeln.",
    creative_director: "Das ist ein Rahmen, keine Schablone. Du bleibst Creative Director und " +
      "entscheidest Komposition, Bildidee, Perspektive, Motiv, Typografie-Hierarchie, den Einsatz " +
      "von Zahlen und die Layouts von Slide 2 und 3 - innerhalb der Qualitaetswelt der Referenzen.",
    success: "Nicht: drei Bilder wurden technisch erzeugt. Sondern: das sieht aus wie ein " +
      "professionelles Vision-Universe-Carousel, das der Owner freiwillig posten wuerde."
  };

  /** Die Referenzbilder im Brief: echte Dateien im Checkout, dazu die Pflicht, sie anzusehen. */
  function styleReferenzen(manifest) {
    var dateien = (manifest && manifest.files) || [];
    if (!dateien.length) return null;
    return {
      files: dateien.map(function (f) {
        return { path: f.path, sha256: f.sha256, width: f.width, height: f.height, shows: f.shows };
      }),
      instruction: "Oeffne und betrachte diese Bilddateien selbst, BEVOR du gestaltest - sie liegen " +
        "unveraendert im selben Checkout wie dieser Brief. Sie sind die visuelle Qualitaetsreferenz " +
        "(Art Direction, Typografie, Hierarchie, Komposition, Markenwirkung, Informationsdichte, " +
        "Atlas- und Logo-Integration). Nicht pixelgenau kopieren - diese Qualitaetswelt treffen.",
      not_facts: "Inhalte, Unternehmen, Aktien, Zahlen und Aussagen dieser Bilder sind KEINE " +
        "Faktenquelle und KEIN Themenvorschlag. Die Story kommt ausschliesslich aus der Recherche.",
      check_required: "Gib in `style_references_check` je Referenzdatei { path, dominant_text } an: " +
        "alle gut lesbaren Textzeilen des Bildes wortwoertlich (Headline und Zeilen darunter). " +
        "Kannst du eine Datei " +
        "nicht oeffnen, schreibe dominant_text: null - nichts erfinden."
    };
  }

  function buildCarouselBrief(options) {
    options = options || {};
    var contentId = options.contentId;
    var anlauf = Number(options.attempt) || 1;
    var mitWeb = options.researchMode !== "PACKAGE_ONLY";
    var paket = options.researchPackage || { stories: [], already_covered_urls: [] };
    var lernen = options.socialLearnings || [];
    var lieferung = options.delivery === MULTI_ASSET ? MULTI_ASSET : COVER_FIRST;
    var nurCover = lieferung === COVER_FIRST;
    var referenzen = styleReferenzen(options.styleReferences);

    return {
      schema_version: "1.0",
      fixture_type: "production_authoring_request",
      /* FULL_CREATIVE + creative_format CAROUSEL: der einzige neue-Bilder-
         Typ, den der Creative Agent annimmt (PR #299, CONTRACT_MISMATCH
         fuer jeden anderen request_type). */
      request_type: Contract.FULL_CREATIVE,
      creative_format: Contract.CAROUSEL_FORMAT,
      visual: { mode: Contract.GENERATE_NEW_ASSET, regeneration_allowed: true },
      test_fixture: options.testFixture === true,
      brief_id: options.briefId,
      content_id: contentId,
      attempt: anlauf,
      supersedes_attempt: anlauf > 1 ? (anlauf - 1) : null,
      attempt_reason: anlauf > 1 ? (options.attemptReason || null) : null,
      created_at: options.now || null,
      trigger: options.trigger || "MANUAL",
      brand: "Vision Universe",
      language: "de",
      channel: "instagram",
      format: "carousel",

      role: "Du bist Social Editor, Creative Director und Visual Designer von Vision Universe.",

      objective:
        (mitWeb
          ? "Recherchiere die aktuell relevantesten Boersen-, Aktien-, Unternehmens-, Makro-, " +
            "Technologie- und Finanznachrichten und finde daraus selbststaendig die beste Story " +
            "fuer einen Vision-Universe-Post. Das Recherchepaket unten ist Startmaterial: pruefe " +
            "die Storys an der Originalquelle, suche ergaenzend selbst und nimm eine bessere " +
            "Story, wenn du eine findest. Kannst du in diesem Lauf keine Webseiten oeffnen, " +
            "arbeite ausschliesslich mit dem Paket (Originalartikel-Auszuege sind enthalten) und " +
            "melde das ehrlich in research.web_access. "
          : "Analysiere die aktuellen Storys im Recherchepaket unten (Originalartikel, soweit " +
            "abrufbar) und waehle selbststaendig die beste Story fuer einen Vision-Universe-Post. ") +
        "Verstehe zuerst, was fuer Anleger daran wirklich interessant ist. Entwickle daraus eine " +
        "starke deutsche Social Story. Erwaege mehrere unterschiedliche Hook-Richtungen und waehle " +
        "die staerkste. Schreibe eine hochwertige deutsche Caption und bis zu 5 Hashtags. Plane " +
        "ein zusammenhaengendes Carousel (Standard: 3 Slides) in der Designsprache der " +
        "Referenzbilder. " +
        (nurCover
          ? "Erzeuge in diesem Auftrag das Cover (Slide 1) als vollendetes, finales 4:5-Creative " +
            "und beschreibe Slide 2 und 3 so vollstaendig, dass sie ohne neue Redaktion umgesetzt " +
            "werden koennen. "
          : "Erzeuge alle Slides als finale 4:5-Creatives. ") +
        "Ziel: ein Vision-Universe-Post, den ein deutscher Anleger im Feed anhaelt und den der " +
        "Owner freiwillig posten wuerde.",

      audience: "Deutschsprachige Anleger, die aktuelle Markt-, Unternehmens- und Technologie" +
        "entwicklungen verfolgen",

      research: {
        mode: mitWeb ? "WORK_WEB_RESEARCH" : "PACKAGE_ONLY",
        instruction: mitWeb
          ? "Nicht die erste News nehmen. Pruefe mehrere aktuelle Storys und bewerte sie " +
            "redaktionell: Aktualitaet, Anlegerrelevanz, Ueberraschung, Verstaendlichkeit, " +
            "Neuigkeitswert, Diskussions-, Share- und Save-Potenzial, visuelles Potenzial, Staerke " +
            "der Belege. Keine Story nehmen, nur weil sie leicht zu verarbeiten ist. Moegliche " +
            "Felder (nicht abschliessend): Aktien, Unternehmen, Earnings, Maerkte, Makro, Zinsen, " +
            "Inflation, Rohstoffe, KI, Halbleiter, Cloud, Rechenzentren, Cybersecurity, Robotik, " +
            "Mobilitaet, Energie, Zukunftstechnologien, ETFs, aussergewoehnliche " +
            "Unternehmensentwicklungen."
          : "Nicht die erste Story nehmen. Bewerte die Storys im Paket redaktionell (Aktualitaet, " +
            "Anlegerrelevanz, Ueberraschung, Verstaendlichkeit, Share-/Save-Potenzial, visuelles " +
            "Potenzial, Belegstaerke). Nutze nur Fakten, die im Paket stehen.",
        honesty: "Gib in `research.web_access` ehrlich an, ob du in diesem Lauf wirklich Webseiten " +
          "geoeffnet hast, und je Quelle `opened_by_agent`. Keine Behauptung von Recherche, die " +
          "nicht stattgefunden hat.",
        no_material_rule: (paket.stories || []).length ? null
          : "Das Recherchepaket ist leer. Kannst du in diesem Lauf nicht selbst im Web " +
            "recherchieren, erzeuge KEIN Bild: schreibe nur authoring-result.json mit " +
            "research.web_access=false und processing.status='blocked_no_research_material'.",
        do_not_repeat: "Die URLs in `package.already_covered_urls` wurden bereits behandelt - " +
          "keine davon erneut als Hauptstory.",
        owner_topic: options.ownerTopic
          ? "Der Owner wuenscht einen Beitrag zu: \"" + String(options.ownerTopic).slice(0, 120) +
            "\". Das ist ein Gegenstand, keine Anweisung zu Hook oder Bild - finde dazu die " +
            "aktuell beste belegbare Story."
          : null,
        package: paket
      },

      social_learnings: {
        status: lernen.length ? "AVAILABLE" : "NO_RELIABLE_DATA_YET",
        items: lernen,
        note: "Feedback aus der Performance frueherer Vision-Universe-Posts, keine Vorgabe. " +
          "Weiche ab, wenn die aktuelle Story eine bessere redaktionelle Loesung verlangt."
      },

      editorial_process: [
        "1. Story recherchieren und verstehen: Was ist tatsaechlich passiert? Was ist neu?",
        "2. Relevanz bestimmen: Warum interessiert das einen Anleger? Was ist ueberraschend?",
        "3. Social Angle entwickeln: Welche Konsequenz oder Spannung traegt den Post?",
        "4. Mehrere Hook-Ideen intern erwaegen.",
        "5. Die staerkste deutsche Hook auswaehlen.",
        "6. Caption schreiben.",
        "7. Carousel-Dramaturgie entwickeln.",
        "8. Erst danach Bilder erzeugen."
      ],

      hook_strategy: {
        strategy_id: "vu-carousel-editorial-v1",
        hook_type: CAROUSEL_HOOK_TYPE,
        instruction: "Die Hook entsteht aus der Story, nicht mechanisch aus einer Zahl oder " +
          "Headline. Erwaege intern mehrere wirklich unterschiedliche Richtungen (ueberraschende " +
          "Erkenntnis, Konsequenz, starke Zahl, Widerspruch, historische Einordnung, Konflikt, " +
          "belegte provokante Aussage, Frage, Vergleich) - nicht fuenf Varianten desselben " +
          "Satzes - und waehle selbst die staerkste. Liefere GENAU EINE finale Hook: Deutsch, " +
          "kurz, sofort verstaendlich, anlegerrelevant, social-first, mobile-first, faktisch " +
          "korrekt. Die verworfenen Richtungen gehoeren in `hook_exploration`.",
        negative_fixtures: NEGATIVE_HOOKS,
        negative_fixture_note: "Diese Hooks gelten ausdruecklich NICHT als gelungene Social " +
          "Hooks: Headline-Verdichtung, isolierte Zahl, Systemsprache, englischer Quelltitel."
      },

      editorial_gate: {
        rule: "Bevor du ein Bild erzeugst: waere Hook + Caption auch OHNE Bild bereits ein guter " +
          "Vision-Universe-Post? Wenn nein, KEIN Bild erzeugen - Story, Angle, Hook und Caption " +
          "zuerst verbessern. Ein schoenes Bild kaschiert keine schwache Redaktion.",
        required: ["story_quality", "hook_standalone_quality", "caption_standalone_quality",
          "fact_grounding"]
      },

      caption_guidance: "Eine deutsche Caption fuer den ganzen Beitrag: verstaendlich, " +
        "informativ, social-tauglich, kompakt, redaktionell hochwertig. Erklaert, was passiert " +
        "ist, warum es interessant ist, welche belegten Fakten zaehlen und was das fuer Anleger " +
        "bedeutet. Sie muss auch allein zum Cover funktionieren - keine Wisch-Aufforderung. " +
        "Keine internen Scores, keine Quant-, Screener- oder Systemsprache, keine erfundenen " +
        "Fakten, keine Anlageberatung vortaeuschen. Endet mit dem Hinweis, dass es keine " +
        "Anlageberatung ist.",

      hashtag_guidance: "Bis zu 5 relevante Hashtags, dynamisch aus der Story, ohne #-Zeichen " +
        "im Array. Keine Standardliste, keine internen Systembegriffe.",

      art_direction: ART_DIRECTION,
      style_references: referenzen,

      carousel: {
        slide_count: "Standard: 3 Slides. Einen vierten nur, wenn die Story ihn wirklich braucht " +
          "- keine Fuellfolie.",
        plan_first: "Plane ZUERST das ganze Carousel als eine Geschichte (`carousel_plan`), dann " +
          "erst das Bild. Die Slides sind eine Serie, keine unabhaengigen Einzelbilder.",
        slides: [
          { slide_index: 1, role: "HOOK / COVER", task: "Scroll Stop.",
            contains: "staerkste deutsche Hook, starkes Hauptmotiv aus der Story, Vision-Universe-" +
              "Logo, Atlas - moeglichst wenig weiterer Text." },
          { slide_index: 2, role: "KEY INSIGHT", task: "Die staerkste Information der Story " +
              "vermitteln: dominante Zahl, Vergleich, ueberraschender Fakt, Entwicklung oder " +
              "zentrale Erkenntnis.",
            contains: "Vision-Universe-Logo, KEIN Atlas." },
          { slide_index: 3, role: "EINORDNUNG", task: "Warum ist das fuer Anleger relevant? " +
              "Chance/Risiko, Konsequenz, was jetzt wichtig wird, Vergleich, Ausblick oder die " +
              "entscheidende Frage.",
            contains: "Vision-Universe-Logo, KEIN Atlas." }
        ],
        atlas_contract: "Atlas erscheint AUSSCHLIESSLICH auf Slide 1 - als Host und Markenfigur, " +
          "natuerlich integriert, nicht aufgeklebt. Nutze die echte Datei brand_assets.atlas; " +
          "keine neu erfundene Roboterfigur, Gesicht und Mimik wie im Referenzbild.",
        logo_contract: "Das echte Vision-Universe-Logo (brand_assets.logo) auf ALLEN Slides, " +
          "bevorzugt oben links, in identischer Position, Groesse und Safe Area. Kein " +
          "approximiertes Logo, kein neu generierter Schriftzug.",
        text_on_image: "Text im Bild ist Pflicht, vor allem die Hook auf Slide 1. Keine " +
          "Worttrennung ueber Bildfalze, harte Kanten, Gesichter, Objekte oder Kompositionsbrueche " +
          "(Negativbeispiel: BÖRSE|NGANG, EXISTENZ|WARNUNG ueber einen Buchfalz)."
      },

      delivery: nurCover
        ? {
          mode: COVER_FIRST,
          deliver_now: "Slide 1 (Cover) als EIN finales Bild. Slide 2 und 3 NICHT zeichnen - " +
            "keine Mini-Slides auf einer Leinwand, kein Bogen.",
          plan_all: "carousel_plan beschreibt ALLE Slides vollstaendig (headline_de, key_content, " +
            "visual_concept), damit sie spaeter ohne neue Redaktion entstehen koennen.",
          why: "Der aktive Work-Vertrag erlaubt ein Asset je Auftrag (PR #300); ein Mehr-Paneel-" +
            "Bogen haelt die exakten Masse nicht (PR #303). Qualitaet vor Carousel-Mechanik: " +
            "zuerst EIN perfektes Cover."
        }
        : {
          mode: MULTI_ASSET,
          deliver_now: "Jede Slide als eigenes finales Bild unter den Pfaden in " +
            "asset_requirements.deterministic_paths."
        },

      visual_strategy: {
        strategy_id: "VU_EDITORIAL_PREMIUM",
        instruction: "Premium Finance Editorial x High-End Technology x Modern Campaign Design, " +
          "in der Qualitaetswelt der Referenzbilder (style_references, art_direction). Eine " +
          "dominante Aussage je Slide, Motiv aus der Story.",
        creative_freedom: "Komposition, Bildidee, Perspektive, Motiv, Typografie-Hierarchie und " +
          "Layout entscheidest du aus der Story heraus.",
        restrictions: [
          "Kein Template, keine pixelgenaue Kopie der Referenzen",
          "Atlas nur auf Slide 1, Logo auf allen Slides an derselben Stelle",
          "Keine Worttrennung ueber Kanten, Falze oder Motive",
          "Keine erfundenen Zahlen im Bild",
          "Nichts aus der Liste art_direction.not_wanted"
        ]
      },

      quality_references: {
        positive: options.positiveReferences || [],
        positive_note: "Die Owner-Referenzbilder stehen unter style_references - sie sind der " +
          "Massstab. Nicht kopieren, nicht als Template.",
        negative: options.negativeReferences || []
      },

      brand_assets: {
        logo: (options.brandAssets && options.brandAssets.logo) || "assets/vision-universe-logo.png",
        atlas: (options.brandAssets && options.brandAssets.atlas) || "assets/atlas.png",
        instruction: "Beide Dateien liegen unveraendert im selben Checkout wie dieser Brief. Als " +
          "echte Bildreferenz verwenden und nur skaliert, zugeschnitten oder neu positioniert " +
          "einsetzen - keine Neuzeichnung, keine Farb- oder Stiltransformation. Atlas' Gesicht, " +
          "Mimik und Proportionen exakt wie im Referenzbild; Pose und Blickwinkel sind frei."
      },

      asset_requirements: nurCover
        ? {
          count: 1,
          preferred_mime_type: "image/png",
          preferred_width: options.width || 1080,
          preferred_height: options.height || 1350,
          deterministic_path: coverPfad(contentId),
          format_note: "Hochformat 4:5 (Ziel 1080x1350). Das Bildwerkzeug liefert eigene " +
            "Pixelmasse - waehle das Hochformat, skaliere oder beschneide nicht nachtraeglich, und " +
            "halte Hook, Logo und Atlas mit Sicherheitsabstand vom Rand, damit ein 4:5-Ausschnitt " +
            "nichts Wichtiges verliert. Melde die tatsaechlichen Masse ehrlich.",
          announced_fields_required: [
            "slide_index", "asset_path", "mime_type", "width", "height",
            "asset_byte_size", "asset_sha256", "brand_elements"
          ],
          announcement_note: "asset_byte_size ist die Groesse der geschriebenen Datei in Bytes, " +
            "asset_sha256 ihr SHA-256 ueber den gesamten Inhalt. Beides wird nach dem finalen " +
            "Commit frisch zurueckgelesen und verglichen. brand_elements: { includes_logo, " +
            "includes_atlas, includes_hook_text_de } als Booleans."
        }
        : {
          count: STANDARD_SLIDES + "-" + Contract.CAROUSEL_MAX,
          min: Contract.CAROUSEL_MIN,
          max: Contract.CAROUSEL_MAX,
          preferred_mime_type: "image/png",
          preferred_width: options.width || 1080,
          preferred_height: options.height || 1350,
          deterministic_paths: [1, 2, 3, 4].map(function (n) {
            return carouselSlidePfad(contentId, n - 1);
          }),
          announced_fields_required: [
            "slide_index", "asset_path", "mime_type", "width", "height",
            "asset_byte_size", "asset_sha256", "brand_elements"
          ],
          announcement_note: "Je Slide eine Datei. brand_elements je Slide: { includes_logo, " +
            "includes_atlas } - Slide 1 zusaetzlich includes_hook_text_de."
        },

      authoring_requirements: {
        hook_variant_count: 1,
        internal_hook_exploration: true,
        stable_hook_variant_ids: true,
        hook_ids_bound_to_brief_blob_sha: true,
        visual_variant_ids_bound_to_brief_blob_sha: true,
        recommended_hook_allowed: true,
        canonical_selected_hook_allowed: false,
        actual_image_asset_required: true,
        brand_elements_announcement_required: true,
        sources_required: true,
        editorial_gate_required: true,
        style_references_check_required: !!referenzen,
        publishing_allowed: false
      },

      output_contract: {
        path: requestDir(contentId) + "/authoring-result.json",
        fields: {
          schema_version: "1.0",
          brief_id: "wie in diesem Brief",
          content_id: "wie in diesem Brief",
          request_type: Contract.FULL_CREATIVE,
          creative_format: Contract.CAROUSEL_FORMAT,
          delivery_mode: lieferung,
          research: "{ web_access: bool, mode_used, stories_considered: [{ title, url, decision, reason }] }",
          story: "{ title_de, what_happened, why_interesting }",
          sources: "[{ source, url, published_at, facts_used: [..], opened_by_agent: bool }] - mindestens eine",
          hook_exploration: "[{ direction, text, rejected_because }] - die intern verworfenen Richtungen",
          hook_variants: "[GENAU EINE: { hook_variant_id, hook_type: '" + CAROUSEL_HOOK_TYPE +
            "', text, language: 'de', brief_revision, evidence_refs }]",
          recommended_hook: "{ recommended_hook_variant_id, recommendation_reason, is_canonical_selection: false }",
          caption: "deutsche Caption fuer den ganzen Beitrag",
          hashtags: "[bis zu 5 Strings ohne #]",
          carousel_plan: "[je Slide: { slide_index, role, headline_de, key_content, visual_concept, " +
            "atlas: bool }] - alle Slides, auch die noch nicht gezeichneten",
          slide_count: "Zahl der geplanten Slides (Standard 3)",
          editorial_gate: "{ story_quality, hook_standalone_quality, caption_standalone_quality, fact_grounding } - je 'PASS'",
          visual_variants: nurCover
            ? "[GENAU EINE: { visual_variant_id, visual_strategy, slide_index: 1, slide_role: 'cover', " +
              "brief_revision, asset_path, mime_type, width, height, asset_byte_size, asset_sha256, " +
              "brand_elements }]"
            : "[je Slide: { visual_variant_id, visual_strategy, slide_index (1..n), slide_role, " +
              "brief_revision, asset_path, mime_type, width, height, asset_byte_size, asset_sha256, " +
              "brand_elements }]",
          carousel_checks: "{ atlas_only_on_slide_1, logo_on_all_slides, logo_position_consistent } - " +
            "je true (bei COVER_FIRST: so geplant)",
          style_references_check: "[je Referenzdatei: { path, dominant_text }]",
          processing: "{ status: 'completed', ... }",
          publishing_allowed: false
        }
      },

      constraints: [
        "Keine erfundenen Zahlen, Fakten oder Quellen. Jede Zahl im Text stammt aus einer genannten Quelle.",
        "Keine Fakten aus den Referenzbildern.",
        "Keine Prognose, keine Kauf- oder Verkaufsempfehlung.",
        "Alle sichtbaren Woerter Deutsch - Ausnahmen nur fuer Eigennamen, Ticker und Markennamen.",
        "Kein `selected_hook` - nur `recommended_hook`.",
        "Keine Placeholder- oder programmatisch erzeugte Ersatzgrafik.",
        "Die Bilder sind FINALE Social Creatives, keine Rohbilder.",
        "Keine Veroeffentlichung."
      ],
      must_not_claim: [
        { id: "forecast", text: "Keine Prognose ueber Kurse oder Geschaeftsentwicklung." },
        { id: "recommendation", text: "Keine Empfehlung, keine Handlungsaufforderung zum Kaufen oder Verkaufen." }
      ],
      publishing_allowed: false
    };
  }

  /* Die Carousel-Pflichten, die ein Rechner pruefen kann. Das Urteil
     ueber Qualitaet bleibt beim Owner im Approval Center. */
  function verifyCarousel(r) {
    var befunde = [];
    var l = carouselLieferung(r);
    var n = l.geplant;
    if (n < Contract.CAROUSEL_MIN || n > Contract.CAROUSEL_MAX) {
      befunde.push({ id: "slideCount", message: "Carousel mit " + n + " geplanten Slides, erlaubt " +
        "sind " + Contract.CAROUSEL_MIN + "-" + Contract.CAROUSEL_MAX + "." });
    }
    if (r.slide_count !== undefined && Number(r.slide_count) !== n) {
      befunde.push({ id: "slideCountMismatch", message: "slide_count=" + r.slide_count +
        ", geplant/geliefert " + n + " Slides." });
    }
    if (l.modus === COVER_FIRST) {
      var plan = (r.carousel_plan || []).slice()
        .sort(function (a, b) { return Number(a && a.slide_index) - Number(b && b.slide_index); });
      plan.forEach(function (p, i) {
        if (!p || Number(p.slide_index) !== i + 1 || !p.headline_de || !p.visual_concept) {
          befunde.push({ id: "planIncomplete", message: "carousel_plan Slide " + (i + 1) +
            " braucht slide_index, headline_de und visual_concept." });
        } else if (i > 0 && p.atlas === true) {
          befunde.push({ id: "atlasOutsideCover", message: "carousel_plan Slide " + (i + 1) +
            " plant Atlas - Atlas gehoert nur auf Slide 1." });
        }
      });
    }
    l.slides.forEach(function (s, i) {
      if (!s || Number(s.slide_index) !== i + 1) {
        befunde.push({ id: "slideIndex", message: "Slide " + (i + 1) + " traegt slide_index=" +
          (s && s.slide_index) + " - erwartet lueckenlos ab 1." });
        return;
      }
      var be = s.brand_elements || {};
      if (be.includes_logo !== true) {
        befunde.push({ id: "logoMissing", message: "Slide " + (i + 1) + " meldet kein Logo." });
      }
      if (i === 0 && be.includes_atlas !== true) {
        befunde.push({ id: "atlasMissingOnCover", message: "Slide 1 meldet keinen Atlas." });
      }
      if (i === 0 && be.includes_hook_text_de !== true) {
        befunde.push({ id: "hookTextMissingOnCover", message: "Slide 1 meldet keine deutsche Hook im Bild." });
      }
      if (i > 0 && be.includes_atlas !== false) {
        befunde.push({ id: "atlasOutsideCover", message: "Slide " + (i + 1) +
          " meldet includes_atlas=" + be.includes_atlas + " - Atlas gehoert nur auf Slide 1." });
      }
    });
    var tags = r.hashtags;
    if (!Array.isArray(tags) || !tags.length || tags.length > 5 ||
        tags.some(function (t) { return typeof t !== "string" || !t.trim(); })) {
      befunde.push({ id: "hashtags", message: "hashtags muss 1-5 nichtleere Strings enthalten." });
    }
    var quellen = Array.isArray(r.sources) ? r.sources : [];
    if (!quellen.length || quellen.some(function (q) { return !q || !/^https?:\/\//.test(String(q.url || "")); })) {
      befunde.push({ id: "sources", message: "Mindestens eine Quelle mit http(s)-URL noetig, " +
        "jede Quelle mit url." });
    }
    var gate = r.editorial_gate || {};
    ["story_quality", "hook_standalone_quality", "caption_standalone_quality", "fact_grounding"]
      .forEach(function (k) {
        if (String(gate[k] || "").toUpperCase() !== "PASS") {
          befunde.push({ id: "editorialGate:" + k, message: "editorial_gate." + k + " ist nicht PASS." });
        }
      });
    var checks = r.carousel_checks || {};
    ["atlas_only_on_slide_1", "logo_on_all_slides", "logo_position_consistent"].forEach(function (k) {
      if (checks[k] !== true) {
        befunde.push({ id: "carouselCheck:" + k, message: "carousel_checks." + k + " ist nicht true." });
      }
    });
    var story = r.story || {};
    if (!story.title_de || !story.why_interesting) {
      befunde.push({ id: "story", message: "story.title_de und story.why_interesting sind Pflicht." });
    }
    return befunde;
  }

  /* -------------------------------------------------------------------
     DIE PRUEFUNG DES ERGEBNISSES
     ------------------------------------------------------------------- */
  function verifyResult(result, context) {
    context = context || {};
    var befunde = [];
    var r = result || {};

    function fehlt(feld, wert) {
      if (wert === null || wert === undefined || wert === "") {
        befunde.push({ id: "missing:" + feld, message: "Im Ergebnis fehlt " + feld + "." });
      }
    }

    fehlt("brief_id", r.brief_id);
    fehlt("content_id", r.content_id);
    fehlt("caption", r.caption);

    if (context.briefId && r.brief_id !== context.briefId) {
      befunde.push({ id: "briefIdMismatch",
        message: "Das Ergebnis gehoert zu Brief " + r.brief_id + ", erwartet war " +
          context.briefId + "." });
    }
    if (context.contentId && r.content_id !== context.contentId) {
      befunde.push({ id: "contentIdMismatch",
        message: "Das Ergebnis nennt Inhalt " + r.content_id + ", erwartet war " +
          context.contentId + "." });
    }

    /* DIE GRENZE. Ein `selected_hook` waere die kanonische Auswahl, und
       die gehoert zur Strategie. */
    if (r.selected_hook) {
      befunde.push({ id: "canonicalSelectionByAgent",
        message: "Das Ergebnis enthaelt `selected_hook`. Die kanonische Auswahl " +
          "gehoert zur Strategie und damit zu Vision Universe; der Agent darf nur " +
          "`recommended_hook` mit is_canonical_selection=false liefern." });
    }
    if (r.recommended_hook && r.recommended_hook.is_canonical_selection === true) {
      befunde.push({ id: "recommendationClaimsCanonical",
        message: "Die Empfehlung behauptet, kanonisch zu sein." });
    }
    if (r.publishing_allowed === true) {
      befunde.push({ id: "publishingClaimed",
        message: "Das Ergebnis behauptet, Veroeffentlichung sei erlaubt." });
    }

    /* Die Kennungen. Nachgerechnet, nicht geglaubt. */
    var varianten = Array.isArray(r.hook_variants) ? r.hook_variants : [];
    if (!varianten.length) {
      befunde.push({ id: "noHookVariants", message: "Keine Hook-Varianten im Ergebnis." });
    }

    varianten.forEach(function (v, i) {
      if (!v || !v.text) {
        befunde.push({ id: "emptyVariant", message: "Variante " + (i + 1) + " ohne Text." });
        return;
      }
      if (!context.briefBlobSha || !context.contentId) return;

      var erwartet = hookVariantId(context.contentId, context.briefBlobSha,
        v.hook_type || (context.hookType || "unknown"), i);
      if (v.hook_variant_id !== erwartet) {
        befunde.push({ id: "hookIdMismatch",
          message: "Variante " + (i + 1) + " traegt die Kennung " + v.hook_variant_id +
            ", nachgerechnet ist " + erwartet + ". Eine Kennung, die sich nicht " +
            "nachrechnen laesst, kann spaeter keine Messung tragen." });
      }
      if (v.brief_revision && v.brief_revision !== context.briefBlobSha) {
        befunde.push({ id: "briefRevisionMismatch",
          message: "Variante " + (i + 1) + " nennt eine fremde Brief-Revision." });
      }
    });

    /* Eine Kennung darf nicht zweimal vorkommen. */
    var gesehen = Object.create(null);
    varianten.forEach(function (v) {
      if (!v || !v.hook_variant_id) return;
      if (gesehen[v.hook_variant_id]) {
        befunde.push({ id: "duplicateHookId",
          message: "Die Kennung " + v.hook_variant_id + " kommt mehrfach vor." });
      }
      gesehen[v.hook_variant_id] = true;
    });

    /* -------------------------------------------------------------------
       BRAND_ELEMENTS — DIE ANKUENDIGUNG IST PFLICHT, NICHT DIE PRUEFUNG
       SELBST (siehe buildAgentBrief: brand_assets/announcement_required)

       Verlangt der Brief die Rueckmeldung, muss die erste Bildvariante
       explizit `brand_elements` mit drei Wahrheitswerten tragen. Fehlt
       das Feld oder ist einer der drei false, wird das Ergebnis
       zurueckgewiesen — genau wie bei einem fehlenden Pflichtfeld beim
       Bildtransport (announced_fields_required) einige Zeilen weiter
       unten in dieser Datei. */
    var istCarousel = context.requestType === Contract.FULL_CAROUSEL ||
      context.creativeFormat === Contract.CAROUSEL_FORMAT ||
      r.creative_format === Contract.CAROUSEL_FORMAT;
    if (istCarousel) {
      befunde = befunde.concat(verifyCarousel(r));
    } else if (context.requireBrandElements) {
      var ersteBildvariante = (Array.isArray(r.visual_variants) ? r.visual_variants : [])[0];
      var be = ersteBildvariante && ersteBildvariante.brand_elements;
      if (!be) {
        befunde.push({ id: "missingBrandElementsAnnouncement",
          message: "Der Brief verlangt eine Rueckmeldung `brand_elements` " +
            "(includes_logo/includes_atlas/includes_hook_text_de) je Bildvariante — " +
            "keine liegt vor." });
      } else if (be.includes_logo !== true || be.includes_atlas !== true ||
          be.includes_hook_text_de !== true) {
        befunde.push({ id: "brandElementsIncomplete",
          message: "brand_elements meldet nicht alle drei Pflichtelemente als " +
            "enthalten (includes_logo=" + be.includes_logo + ", includes_atlas=" +
            be.includes_atlas + ", includes_hook_text_de=" + be.includes_hook_text_de + ")." });
      }
    }

    return {
      ok: befunde.length === 0,
      findings: befunde,
      explanation: befunde.length === 0
        ? "Ergebnis vollstaendig, Kennungen nachgerechnet, Verantwortungsgrenze gewahrt."
        : befunde.length + " Befund(e): " +
          befunde.map(function (b) { return b.id; }).join(", ") + "."
    };
  }

  /** Prueft die Bildvarianten gegen die tatsaechlichen Bytes. */
  function verifyAssets(result, leseAsset) {
    var varianten = Array.isArray(result && result.visual_variants)
      ? result.visual_variants : [];
    var befunde = [];
    var geprueft = [];

    varianten.forEach(function (v) {
      if (!v || !v.asset_path) {
        befunde.push({ id: "missingAssetPath", message: "Bildvariante ohne Pfad." });
        return;
      }
      var bytes;
      try { bytes = leseAsset(v.asset_path); }
      catch (err) {
        befunde.push({ id: "assetUnreadable",
          message: "Asset nicht lesbar: " + v.asset_path + " (" +
            String(err && err.message || err).slice(0, 120) + ")" });
        return;
      }
      if (!bytes) {
        befunde.push({ id: "assetMissing", message: "Asset fehlt: " + v.asset_path });
        return;
      }

      /* -----------------------------------------------------------
         DER TRANSPORTVERTRAG, NICHT NUR DIE DATEI

         `bytes` kommt aus einem FRISCHEN Lesen vom finalen Commit -
         das ist die einzige Lesart, die den Transport prueft statt
         den Puffer, aus dem geschrieben wurde.

         Geprueft wird die ganze Kette: Typ, innere Struktur,
         Abmessungen, Groesse, Hash. PR 106 hat gezeigt, warum die
         Struktur dazugehoert: dort war das Dateiende fast richtig und
         die Mitte zerstoert.
         ----------------------------------------------------------- */
      /* Die Variante WIRD uebergeben, nicht abgeschrieben. Eine
         Abschrift laesst genau ein Feld aus, und die ausgelassene
         Pruefung faellt nicht auf. */
      var transport = AssetTransport.verifyTransfer(bytes, v,
        { freshReadback: true });

      geprueft.push({ visual_variant_id: v.visual_variant_id,
        asset_path: v.asset_path, verification: transport });

      if (!transport.ok) {
        befunde.push({ id: "assetVerification",
          /* Der Fehlertyp reist mit: ein abgerissener Transfer ist kein
             Inhaltsurteil und darf nie als eines gelernt werden. */
          failureType: transport.failureType,
          contentJudgement: false,
          message: v.asset_path + ": " + transport.explanation });
      }
    });

    return {
      ok: befunde.length === 0,
      checked: geprueft,
      findings: befunde,
      state: befunde.length === 0
        ? (geprueft.length ? "READBACK_VERIFIED" : "PENDING")
        : "RECOVERY_REQUIRED",
      explanation: befunde.length === 0
        ? (geprueft.length ? geprueft.length + " Asset(s) zurueckgelesen und geprueft."
                           : "Keine Bildvarianten im Ergebnis.")
        : befunde.map(function (b) { return b.message; }).join(" | ")
    };
  }

  /* -------------------------------------------------------------------
     DER AUTOR
     ------------------------------------------------------------------- */
  function createChatGptWorkAuthor(options) {
    options = options || {};

    /* Der Transport wird HINEINGEREICHT und nicht hier gebaut: so laesst
       sich der Autor gegen echte Dateien, gegen einen Doppelgaenger und
       gegen GitHub testen, ohne dass er drei Wege kennt.

         readResult(contentId)   -> Objekt | null
         readAsset(pfad)         -> Buffer | null
         readBriefRaw(contentId) -> Buffer | String | null   (optional)
    */
    var transport = options.transport || null;

    return {
      authorId: options.authorId || "chatgpt-work",
      kind: "generative",
      capabilities: {
        variants: Number(options.variants) || 4,
        hooks: true, captions: true, visualLines: false, structure: true,
        images: true,
        /* Netz ja — aber ueber GitHub, nicht ueber eine Modell-API. Das
           ist der Unterschied, auf dem die Kostenentscheidung beruht. */
        requiresNetwork: true,
        requiresCredentials: false,
        requiresClassicModelApi: false,
        asynchronous: true,
        transport: "github-pull-request-event"
      },

      available: function () {
        if (!transport || typeof transport.readResult !== "function") {
          return { ok: false, reason:
            "Kein Transport angebunden. Dieser Autor arbeitet ueber einen " +
            "Request-Branch und ein PR-Ereignis; ohne Lesezugriff auf das " +
            "Ergebnis kann er nichts liefern." };
        }
        return { ok: true, reason: null };
      },

      buildAgentBrief: buildAgentBrief,
      blobSha: blobSha,
      hookVariantId: hookVariantId,
      visualVariantId: visualVariantId,
      processingKey: processingKey,
      requestDir: requestDir,
      verifyResult: verifyResult,
      verifyAssets: verifyAssets,

      write: function (brief, opts) {
        opts = opts || {};
        var contentId = opts.contentId || brief.contentId || brief.briefId;

        var ergebnis;
        try { ergebnis = transport.readResult(contentId); }
        catch (err) {
          return { variants: [], reason: "Ergebnis nicht lesbar: " +
            String(err && err.message || err).slice(0, 160) };
        }

        if (!ergebnis) {
          /* Kein Ergebnis ist kein Fehler. Der Agent laeuft asynchron;
             der Lauf faellt auf den deterministischen Autor zurueck, und
             der naechste Lauf findet das Ergebnis vor. */
          return { variants: [], pending: true, reason:
            "Noch kein Creative Result fuer " + contentId + ". Der Agent arbeitet " +
            "asynchron; bis dahin schreibt der deterministische Autor." };
        }

        /* -------------------------------------------------------------
           WELCHER BRIEF GILT

           Der Agent hat eine DATEI bekommen. Sie ist das Artefakt, an
           dem er zu messen ist — nicht eine Rekonstruktion aus
           denselben Parametern.

           Der Unterschied ist nicht theoretisch: die Rekonstruktion
           haengt an einem Dutzend langer Textbausteine (Auftrag,
           Palette, Bildanweisung), die an zwei Stellen gepflegt
           werden muessten. Weicht ein Zeichen ab, weicht der Blob-SHA
           ab, und dann weichen alle vier erwarteten Varianten-Kennungen
           ab. Das Ergebnis waere formal korrekt und wuerde trotzdem
           abgewiesen.

           Deshalb: erst die echte Datei, dann eine uebergebene, und
           erst zuletzt die Rekonstruktion.
           ------------------------------------------------------------- */
        var briefRoh = null;
        if (transport && typeof transport.readBriefRaw === "function") {
          try { briefRoh = transport.readBriefRaw(contentId); }
          catch (err) { briefRoh = null; }
        }

        var agentBrief, sha;
        if (briefRoh) {
          try { agentBrief = JSON.parse(String(briefRoh)); }
          catch (err) {
            return { variants: [], reason: "Der abgelegte Agent-Brief ist kein " +
              "gueltiges JSON: " + String(err && err.message || err).slice(0, 120) };
          }
          sha = blobSha(briefRoh);
        } else {
          agentBrief = opts.agentBrief || buildAgentBrief(brief, opts);
          sha = opts.briefBlobSha ||
            blobSha(JSON.stringify(agentBrief, null, 2) + "\n");
        }

        /* Verglichen wird gegen den Brief, den der Agent BEKOMMEN hat —
           nicht gegen die interne Kennung des Content Briefs. Der Agent
           kennt nur, was in der Datei stand; ihn an etwas zu messen, das
           er nie gesehen hat, waere ein Befund ueber uns. */
        var geprueft = verifyResult(ergebnis, {
          briefId: agentBrief.brief_id || brief.briefId,
          contentId: contentId, briefBlobSha: sha,
          hookType: agentBrief.hook_strategy && agentBrief.hook_strategy.hook_type,
          requireBrandElements: !!(agentBrief.authoring_requirements &&
            agentBrief.authoring_requirements.brand_elements_announcement_required)
        });
        if (!geprueft.ok) {
          return { variants: [], reason: "Ergebnis zurueckgewiesen: " + geprueft.explanation,
            verification: geprueft };
        }

        /* -------------------------------------------------------------
           ERFUELLT DAS ERGEBNIS DEN AUFTRAG, DER GESTELLT WURDE?

           Nicht "ist ein Bild da", sondern "wurde getan, was vereinbart
           war". Bei TEXT_REVISION ist ein fehlendes Bild die Erfuellung
           und ein neues der Bruch.
           ------------------------------------------------------------- */
        var vertrag = Contract.validateResult(ergebnis, agentBrief);
        if (!vertrag.ok) {
          return { variants: [],
            reason: "Vertragsverstoss: " + vertrag.explanation,
            contract: vertrag,
            /* Ausdruecklich kein Inhaltsurteil - ein Vertragsverstoss
               sagt ueber Hook, Evidenz oder Bildstrategie nichts. */
            contentJudgement: false };
        }

        var istRevision = vertrag.requestType === Contract.TEXT_REVISION;

        var assets = istRevision
          ? { ok: true, state: "INHERITED", checked: [], findings: [],
              explanation: "Kein neues Asset erwartet - das Bild wird geerbt." }
          : verifyAssets(ergebnis, function (pfad) {
              return transport.readAsset ? transport.readAsset(pfad) : null;
            });

        /* -------------------------------------------------------------
           WAS DER AGENT MELDET UND WAS WIR NACHGESEHEN HABEN

           PR 106 trug processing.status = "completed" im selben Commit
           wie ein beschaedigtes Asset. Der Agent hat nicht gelogen - er
           hat berichtet, was er von seiner Seite sehen konnte. Das ist
           nur nicht dieselbe Frage.
           ------------------------------------------------------------- */
        var abschluss = AssetTransport.verifyCompletion({
          agentStatus: (ergebnis.processing || {}).status,
          resultJsonValid: true,
          identitiesValid: geprueft.ok,
          transfer: (assets.checked[0] || {}).verification || null
        });

        if (!assets.ok) {
          return { variants: [],
            reason: "Bildasset zurueckgewiesen: " + assets.explanation,
            assets: assets, completion: abschluss,
            failureType: AssetTransport.TRANSPORT_FEHLER,
            contentJudgement: false };
        }

        var e = (brief.evidence || [])[0] || null;
        var bild = (ergebnis.visual_variants || [])[0] || null;

        /* ---------------------------------------------------------------
           DAS GEERBTE BILD EINER TEXTREVISION

           Eine redaktionelle Ueberarbeitung erzeugt kein Bild - sie
           uebernimmt das bereits verifizierte des Quell-Objekts. Ohne
           diese Zeilen faende der Zyklus kein Asset, zeichnete
           stattdessen eine eigene Karte, und das Visual, um dessen
           Erhalt es ging, waere still ersetzt worden. Genau das ist in
           der Simulation passiert.

           Geerbt heisst NICHT ungeprueft: asset-store.inherit() liest
           frisch und laesst denselben Transportvertrag darueber
           laufen.
           --------------------------------------------------------------- */
        var geerbt = null;
        if (istRevision && transport && typeof transport.readAsset === "function") {
          var v = agentBrief.visual || {};
          /* Uebersetzt in die Form, die asset-store.inherit erwartet.
             Die Felder heissen dort anders, weil sie aus zwei Schichten
             stammen - uebersetzt wird an EINER Stelle. */
          geerbt = AssetStore.inherit({
            reuse_visual: {
              from_content_id: v.source_content_id,
              visual_variant_id: v.source_visual_variant_id,
              asset_path: v.source_asset_reference,
              asset_sha256: v.source_asset_sha256,
              asset_byte_size: v.source_byte_size,
              mime_type: v.source_mime_type,
              width: v.source_width, height: v.source_height
            }
          }, transport.readAsset,
            { freshReadback: true, contentId: contentId,
              generator: "chatgpt-work" });

          if (!geerbt.ok) {
            return { variants: [],
              reason: "Geerbtes Asset zurueckgewiesen: " + geerbt.explanation,
              assets: geerbt,
              failureType: geerbt.failureType || null,
              contentJudgement: false };
          }
          bild = { visual_variant_id: v.source_visual_variant_id,
            visual_strategy: v.source_visual_strategy || "GENERATIVE",
            brief_revision: v.source_brief_revision || null,
            asset_path: v.source_asset_reference,
            asset_sha256: v.source_asset_sha256,
            asset_byte_size: v.source_byte_size,
            mime_type: v.source_mime_type,
            width: v.source_width, height: v.source_height,
            inherited_from: v.source_content_id };
        }

        /* ---------------------------------------------------------------
           DIE SCHREIBUNG DES AGENTENTEXTES

           Der Brief liefert dem Agenten Belegsaetze. Kommen sie aus den
           Quant-Daten in ASCII-Umschrift, uebernimmt er sie so — er
           kann nicht wissen, dass "traegt" ein Fehler ist.

           Repariert wird deshalb hier, bevor der Text ein Kandidat
           wird. Der Eingriff ist rein orthografisch und
           deterministisch: dieselbe Kennung bezeichnet danach immer
           denselben Text, und der unveraenderte Originaltext reist in
           textVerbatim mit.

           Was das Woerterbuch nicht kennt, wird nicht geraten. Es steht
           in textResidue, und das Marken-Tor blockiert die betroffene
           Variante — die uebrigen laufen weiter.
           --------------------------------------------------------------- */
        /* -------------------------------------------------------------
           EINE REDAKTIONELLE KORREKTUR VON VISION UNIVERSE

           Das Ergebnis des Agenten bleibt unberuehrt auf dem
           Request-Branch - so wie PR 110 als Provenance stehen blieb.
           Was VU daran aendert, steht in einer EIGENEN Datei und wird
           hier darauebergelegt.

           Der Anlass: eine Caption behauptete "die Schwankungsbreite
           begrenzt damit den Gesamtwert auf 76 von 100". Jede Zahl
           belegt, und der Satz trotzdem falsch - VOLATILITY traegt ein
           Fuenftel der fehlenden Punkte, SETUP mehr.

           Zwei Dateien statt einer ueberschriebenen: sonst stuende
           spaeter da, der Agent habe etwas geliefert, was er nie
           geschrieben hat. Wer die Korrektur uebernimmt, uebernimmt
           auch die Verantwortung dafuer - deshalb reist sie mit. */
        var korrektur = (typeof transport.readCorrection === "function")
          ? transport.readCorrection(contentId) : null;
        var korrigiert = !!(korrektur && korrektur.caption &&
          korrektur.caption !== ergebnis.caption);

        var captionSauber = German.clean(
          korrigiert ? korrektur.caption : ergebnis.caption);

        /* -------------------------------------------------------------
           DER PFLICHTHINWEIS GEHOERT VISION UNIVERSE

           Anlauf 3 scheiterte an allen vier Varianten, weil der Caption
           der Satz "Keine Anlageberatung." fehlte. Der Agent hat nichts
           falsch gemacht: der Brief hat den Hinweis nie verlangt, und
           der Agent hat ihn sinngemaess sogar formuliert ("keine Kauf-
           beziehungsweise Verkaufsempfehlung").

           Nur ist das nicht dasselbe. Der Hinweis ist eine Marken- und
           Rechtsanforderung mit festem Wortlaut - er gehoert uns, nicht
           dem Autor. Der Vorlagen-Autor haengt ihn seit jeher an; der
           generative Autor tat es nicht. Zwei Autoren, zwei Ergebnisse
           aus demselben Brief: das ist der Fehler, nicht der fehlende
           Satz.

           Angehaengt wird nur, was noch nicht dasteht - sonst stuende er
           zweimal. */
        var hinweis = brief.constraints && brief.constraints.disclaimer;
        if (hinweis && captionSauber.text.indexOf(hinweis) === -1) {
          captionSauber = { text: captionSauber.text + " " + hinweis,
            residue: captionSauber.residue };
        }

        return {
          variants: (ergebnis.hook_variants || []).map(function (v) {
            var hookSauber = German.clean(v.text);
            var rest = hookSauber.residue.concat(captionSauber.residue);

            return Authoring.variant({
              variantId: v.hook_variant_id,
              authorId: options.authorId || "chatgpt-work",
              kind: "generative",
              hook: hookSauber.text,
              caption: captionSauber.text,
              textVerbatim: (hookSauber.text !== v.text ||
                captionSauber.text !== ergebnis.caption)
                ? { hook: v.text, caption: ergebnis.caption } : null,
              /* Reist mit, damit der Kandidat nicht behauptet, der
                 Agent habe geschrieben, was VU korrigiert hat. */
              editorialCorrection: korrigiert
                ? { by: korrektur.by || "vision-universe",
                    reason: korrektur.reason || null,
                    criterion: korrektur.criterion || null,
                    supersededCaption: ergebnis.caption,
                    correctedAt: korrektur.correctedAt || null }
                : null,
              textResidue: rest,
              /* Der Agent liefert keine Bildzeile — das Bild IST die
                 Aussage. Die Karte des deterministischen Autors braucht
                 eine; ein generatives Visual nicht. */
              visualLine: null,
              hashtags: options.hashtags || [],
              pattern: "chatgpt-work/" + (v.hook_type || "unbenannt"),
              /* -------------------------------------------------------
                 JEDER BELEG, NICHT NUR DER ERSTE

                 Hier standen zwei Claims, gebildet aus evidence[0].
                 Das genuegte, solange die Caption eine Zahl trug.

                 Anlauf 3 brachte eine Caption mit dreissig Zahlen aus
                 dreiundzwanzig Belegen - und die Faktenpruefung meldete
                 fuenf unbelegte Prozentangaben, weil zu ihnen kein
                 Claim erklaert war. Nicht weil die Zahlen erfunden
                 waren, sondern weil wir sie nicht angemeldet hatten.

                 Angemeldet wird jetzt jeder Beleg: sein Wert, seine
                 Kennzahl und sein Satz. Der Satz gehoert dazu, weil die
                 Quant-Engines ihre Zahlen darin mitliefern.
                 ------------------------------------------------------- */
              claims: (brief.evidence || []).reduce(function (acc, b) {
                var quelle = { source: b.source, entity: b.entity, metric: b.metric,
                  observedAt: b.observedAt, state: b.state || "VERIFIED" };
                if (b.value !== null && b.value !== undefined) {
                  acc.push({ text: String(b.value) + (b.unit ? " " + b.unit : ""),
                    numeric: b.value, source: quelle });
                }
                if (b.metric) acc.push({ text: String(b.metric), numeric: null, source: quelle });
                if (b.statement) acc.push({ text: String(b.statement), numeric: null, source: quelle });
                return acc;
              }, []),
              notes: "generativ ueber ChatGPT Work, Brief-Revision " + sha.slice(0, 12)
            });
          }),
          /* Was Vision Universe zusaetzlich braucht und was NICHT in die
             Variante gehoert: die Empfehlung des Agenten (unverbindlich)
             und das geprueft zurueckgelesene Bildasset. */
          recommendation: ergebnis.recommended_hook || null,
          asset: bild ? {
            visual_variant_id: bild.visual_variant_id,
            visual_strategy: bild.visual_strategy,
            brief_revision: bild.brief_revision || sha,
            asset_path: bild.asset_path,
            asset_sha256: bild.asset_sha256,
            mime_type: bild.mime_type,
            width: bild.width, height: bild.height,
            state: geerbt ? geerbt.transport : assets.state,
            /* Woher es kommt - ein geerbtes Asset soll nicht aussehen
               wie ein frisch geliefertes. */
            inherited: !!geerbt,
            inheritedFrom: geerbt ? geerbt.fromContentId : null,
            /* Die Ankuendigung des Agenten, unveraendert durchgereicht -
               geprueft wurde oben nur, DASS sie vorliegt und vollstaendig
               ist (verifyResult), nicht ob sie stimmt. Wer das liest, soll
               das nicht mit einer Messung verwechseln koennen. */
            brandElements: bild.brand_elements || null
          } : null,
          processing: ergebnis.processing || null,
          /* Beide Aussagen nebeneinander, nie die eine statt der
             anderen. */
          completion: abschluss,
          verification: geprueft,
          assets: assets,
          reason: null
        };
      }
    };
  }

  var api = {
    requestDir: requestDir,
    blobSha: blobSha,
    hookVariantId: hookVariantId,
    visualVariantId: visualVariantId,
    processingKey: processingKey,
    buildAgentBrief: buildAgentBrief,
    buildCarouselBrief: buildCarouselBrief,
    verifyCarousel: verifyCarousel,
    carouselSlidePfad: carouselSlidePfad,
    coverPfad: coverPfad,
    carouselLieferung: carouselLieferung,
    COVER_FIRST: COVER_FIRST,
    MULTI_ASSET: MULTI_ASSET,
    ART_DIRECTION: ART_DIRECTION,
    CAROUSEL_HOOK_TYPE: CAROUSEL_HOOK_TYPE,
    NEGATIVE_HOOKS: NEGATIVE_HOOKS,
    verifyResult: verifyResult,
    verifyAssets: verifyAssets,
    createChatGptWorkAuthor: createChatGptWorkAuthor
  };

  if (isNode) module.exports = api;
  else global.VUSocialAuthorChatGptWork = api;
})(typeof window !== "undefined" ? window : globalThis);
