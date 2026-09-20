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
        restrictions: ["Kein Text im Bild", "Kein Logo", "Keine Kurse im Bild",
          "Keine Renditezahlen", "Kein Wasserzeichen"]
      },

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
          hookType: agentBrief.hook_strategy && agentBrief.hook_strategy.hook_type
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
            inheritedFrom: geerbt ? geerbt.fromContentId : null
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
    verifyResult: verifyResult,
    verifyAssets: verifyAssets,
    createChatGptWorkAuthor: createChatGptWorkAuthor
  };

  if (isNode) module.exports = api;
  else global.VUSocialAuthorChatGptWork = api;
})(typeof window !== "undefined" ? window : globalThis);
