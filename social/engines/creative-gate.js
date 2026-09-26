/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/creative-gate.js

   HARD FINAL CREATIVE GATE (Owner-Direktive "FINAL GOLDEN PATH
   SIMPLIFICATION", 23.09., §15)

   -------------------------------------------------------------------------
   WAS HIER NICHT NOCH EINMAL GEPRUEFT WIRD
   -------------------------------------------------------------------------

   TEXT_ON_VISUAL_PRESENT, CANONICAL_LOGO_PRESENT und ATLAS_PRESENT sind
   bereits HARTE Tore in scripts/social/render-asset.mjs::render(): ein
   Bild, das SCROLL_STOP_QUALITY, den Logo-Vertrag oder den Atlas-Vertrag
   nicht besteht, wird nicht geschrieben (wirft), und die Entscheidung
   erreicht diese Stelle dann mit `rendered: false` gar nicht erst. Sie
   hier ein zweites Mal zu pruefen waere die zweite Antwort auf dieselbe
   Frage - stattdessen wird das render()-Ergebnis (scrollStop/logoBefund/
   atlasBefund, siehe run-social-cycle.mjs) hier nur noch GELESEN, nicht
   neu gerechnet.

   AUSNAHME (Owner-Direktive "GENERATIVES VOLLBILD", 26.09.): komponiert
   der Creative Agent Logo, Atlas und Hook-Text selbst ins Bild (siehe
   manual-now-web-candidate.mjs, Zweig `agentKomponiert`), laeuft
   render() fuer dieses Bild gar nicht — es gibt kein zweites Mal
   "Draufsetzen" mehr zu vermeiden. `atlasBefund`/`logoBefund` tragen
   dort `quelle: "agent_announced"`: eine vom Adapter ERZWUNGENE
   Ankuendigung des Agenten (chatgpt-work/adapter.js::verifyResult prueft
   nur, DASS sie vorliegt und vollstaendig ist), keine unabhaengige
   Messung. Die tatsaechliche Pruefinstanz ist in diesem Fall der Owner
   im Approval Center, nicht dieses Tor.

   -------------------------------------------------------------------------
   WAS HIER NEU GEPRUEFT WIRD
   -------------------------------------------------------------------------

   Alles, was sich erst am FERTIGEN Kandidaten beantworten laesst, nicht
   schon am gerenderten Bild: gibt es ueberhaupt eine Story (nicht nur
   einen Satz), stammt das Motiv vom Creative Agent (nicht ein
   uebernommenes generisches Rechenzentrum ohne Bezug), ist die Caption
   social-first, stehen Hashtags da, ist kein interner Begriff im
   oeffentlichen Text, und ist das Bild auf dem Datentraeger wirklich
   vorhanden (nicht nur behauptet).

   -------------------------------------------------------------------------
   FAIL CLOSED, KEIN SCHLECHTER FALLBACK (§16)
   -------------------------------------------------------------------------

   Ein Verstoss blockiert den Kandidaten. Es gibt keinen Mittelweg und
   keine Karenz: "ein technisch gueltiger schlechter Beitrag ist
   schlimmer als kein Beitrag" gilt hier woertlich.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var ContentIntelligence = isNode ? require("./content-intelligence.js")
    : global.VUSocialContentIntelligence;
  var AudienceFrame = isNode ? require("./audience-frame.js")
    : global.VUSocialAudienceFrame;
  var German = isNode ? require("./german-text.js") : global.VUSocialGermanText;

  function text(v) { return String(v === null || v === undefined ? "" : v); }
  function gefuellt(v) { return !!text(v).trim(); }

  /* -------------------------------------------------------------------
     NEGATIVE HOOK FIXTURES — DIE OWNER-BEFUNDE, WOERTLICH GESPERRT

     "493,78 USD Schlusskurs - MSFT." und "420 von 5954 geprueften
     Titeln - Comeback?" sind die zwei realen Beitraege, die der Owner
     ausdruecklich als NICHT AKZEPTABEL benannt hat (§6). Beide teilen
     dieselbe Form: ein Wert plus Bezugsgroesse plus Subjekt, ohne
     Kontrast, Widerspruch oder Zeitbezug - storyKraft (hook.js)
     deprioritisiert genau diese Form bereits bei der Auswahl.

     Diese Liste ist der BACKSTOP, nicht die erste Verteidigung: sollte
     trotzdem ein Hook dieser Form gewinnen (z. B. weil kein anderer
     Archetyp Evidenz fand), faellt der Kandidat hier auf, statt still
     durchzugehen. */
  var NEGATIVE_HOOK_MUSTER = [
    /^[\d.,]+\s*[a-z%]*\s+(schlusskurs|kurs)\s*[-—]\s*[a-z0-9.]{1,10}\.?$/i,
    /\d+\s+von\s+\d+\s+gepr(ue|ü)ften\s+titeln/i
  ];

  function istNegativeHookFixture(hook) {
    var h = text(hook).trim();
    if (!h) return false;
    return NEGATIVE_HOOK_MUSTER.some(function (re) { return re.test(h); });
  }

  /* -------------------------------------------------------------------
     CAPTION_SOCIAL_FIRST — KEINE SYSTEMAUSGABE IN PROSA

     Die drei aelteren Muster in template/adapter.js oeffnen alle mit
     derselben Formulierung: "Unsere technische Auswertung bewertet ...
     mit ... im ...". Genau das war der reale MSFT-Befund. Das neue
     "social-first"-Muster (und jede chatgpt-work-Caption) oeffnet
     anders - dieser Filter erkennt die ALTE Form, nicht eine Positiv-
     liste der neuen: eine Positivliste waere bei jedem neuen Muster
     wieder zu pflegen. */
  var TECHNISCHE_CAPTION_OEFFNUNG =
    /^(unsere\s+technische\s+auswertung|wir\s+bewerten\s+titel|diese\s+zahl\s+sagt\s+nicht|wir\s+pr(ue|ü)fen\s+jeden\s+titel)/i;

  function istTechnischeCaptionOeffnung(caption) {
    var c = text(caption).trim();
    return TECHNISCHE_CAPTION_OEFFNUNG.test(c);
  }

  /**
   * @param kandidat  Das Kandidatenobjekt aus make-publish-candidate.mjs
   *                  (vor dem Schreiben) - braucht mindestens
   *                  presentation.{hook, caption, captionBase, hashtags,
   *                  visualOrigin, visualType}.
   * @param options.assetExists  Ob die Bilddatei physisch auf dem
   *                  Datentraeger existiert (der Aufrufer prueft das -
   *                  diese Engine fasst kein Dateisystem an).
   */
  function pruefe(kandidat, options) {
    options = options || {};
    var p = (kandidat && kandidat.presentation) || {};
    var verstoesse = [];

    var storyClear = gefuellt(p.hook) && gefuellt(p.reason);
    if (!storyClear) {
      verstoesse.push({ id: "STORY_CLEAR", satz: "Kein Hook oder keine " +
        "Begruendung, warum dieses Thema jetzt eine Story ist (§4)." });
    }

    var hookSocialFirst = gefuellt(p.hook) && !istNegativeHookFixture(p.hook);
    if (!hookSocialFirst) {
      verstoesse.push({ id: "HOOK_SOCIAL_FIRST", satz: "Der Hook \"" + p.hook +
        "\" hat die Form einer der Owner-benannten NEGATIVE HOOK FIXTURES " +
        "(§6): Wert plus Bezugsgroesse plus Subjekt, ohne Kontrast, " +
        "Widerspruch oder Zeitbezug." });
    }

    /* HOOK_SCROLL_STOP und TEXT_ON_VISUAL_PRESENT: siehe Dateikopf -
       bereits durch render() hart durchgesetzt. Hier wird nur
       gespiegelt, DASS render() gelaufen ist (asset.rendered), nicht
       das Ergebnis neu berechnet. */
    var textOnVisual = options.rendered === true;
    if (!textOnVisual) {
      verstoesse.push({ id: "TEXT_ON_VISUAL_PRESENT", satz: "Kein " +
        "bestandener Render-Durchlauf hinterlegt (asset.rendered)." });
    }

    var generatedMotif = p.visualOrigin === "generative" &&
      p.visualType === "GENERATIVE";
    if (!generatedMotif) {
      verstoesse.push({ id: "GENERATED_STORY_MOTIF_PRESENT", satz: "Das " +
        "Bild stammt nicht vom Creative Agent (visualOrigin=" +
        p.visualOrigin + ", visualType=" + p.visualType + ")." });
    }

    var atlasPresent = options.atlasBefund
      ? options.atlasBefund.passed === true : false;
    if (!atlasPresent) {
      verstoesse.push({ id: "ATLAS_PRESENT", satz: "Kein bestandener " +
        "Atlas-Vertrag hinterlegt (asset.atlasBefund)." });
    }

    var logoPresent = options.logoBefund
      ? options.logoBefund.passed === true : false;
    if (!logoPresent) {
      verstoesse.push({ id: "CANONICAL_LOGO_PRESENT", satz: "Kein " +
        "bestandener Logo-Vertrag hinterlegt (asset.logoBefund)." });
    }

    var captionSocialFirst = gefuellt(p.captionBase) &&
      !istTechnischeCaptionOeffnung(p.captionBase);
    if (!captionSocialFirst) {
      verstoesse.push({ id: "CAPTION_SOCIAL_FIRST", satz: "Die Caption " +
        "oeffnet mit derselben Systemausgabe-Formulierung wie der reale " +
        "MSFT-Befund (§13)." });
    }

    var hashtagsPresent = Array.isArray(p.hashtags) && p.hashtags.length > 0;
    if (!hashtagsPresent) {
      verstoesse.push({ id: "HASHTAGS_PRESENT",
        satz: "Keine Hashtags im Kandidaten." });
    }

    var oeffentlicherText = [p.hook, p.captionBase].filter(gefuellt).join(" ");
    var treffer = ContentIntelligence.interneTreffer(oeffentlicherText,
      AudienceFrame.INTERN_NICHT_IM_HOOK);
    var internalJargon = treffer.length;
    if (internalJargon > 0) {
      verstoesse.push({ id: "INTERNAL_JARGON", satz: internalJargon +
        " interne Begriffe im oeffentlichen Text: " + treffer.join(", ") + "." });
    }

    /* HOOK_CAPTION_GERMAN — Owner-Direktive "WEB-FIRST +
       FULL-POST-GENERATION" (24.09.), §5.1: alle sichtbaren Texte
       durchgehend Deutsch. Realer Befund: cand_20260924_d052c375 trug
       den englischen Quelltitel woertlich. */
    var englischeWoerter = German.englischeKontamination(oeffentlicherText);
    var hookCaptionGerman = englischeWoerter.length === 0;
    if (!hookCaptionGerman) {
      verstoesse.push({ id: "HOOK_CAPTION_GERMAN", satz: "Englische " +
        "Funktionswoerter im oeffentlichen Text (" + englischeWoerter.join(", ") +
        ") — Owner-Direktive verlangt durchgehend deutschen Text (§5.1)." });
    }

    var assetReachable = options.assetExists === true;
    if (!assetReachable) {
      verstoesse.push({ id: "ASSET_PUBLICLY_REACHABLE", satz: "Die " +
        "Bilddatei liegt nicht auf dem Datentraeger, unter dem der " +
        "Kandidat sie behauptet (assets/social/...)." });
    }

    var publishPayloadVerified = gefuellt(kandidat && kandidat.contentHash) &&
      gefuellt(kandidat && kandidat.content && kandidat.content.imageUrl) &&
      gefuellt(kandidat && kandidat.content && kandidat.content.caption);
    if (!publishPayloadVerified) {
      verstoesse.push({ id: "PUBLISH_PAYLOAD_VERIFIED", satz: "Inhaltsabdruck, " +
        "Bildadresse oder Endtext fehlen am Kandidaten." });
    }

    return {
      ok: verstoesse.length === 0,
      verstoesse: verstoesse,
      befund: {
        STORY_CLEAR: storyClear,
        HOOK_SOCIAL_FIRST: hookSocialFirst,
        HOOK_SCROLL_STOP: textOnVisual,
        TEXT_ON_VISUAL_PRESENT: textOnVisual,
        GENERATED_STORY_MOTIF_PRESENT: generatedMotif,
        ATLAS_PRESENT: atlasPresent,
        CANONICAL_LOGO_PRESENT: logoPresent,
        CAPTION_SOCIAL_FIRST: captionSocialFirst,
        HASHTAGS_PRESENT: hashtagsPresent,
        INTERNAL_JARGON: internalJargon,
        ASSET_PUBLICLY_REACHABLE: assetReachable,
        PUBLISH_PAYLOAD_VERIFIED: publishPayloadVerified,
        HOOK_CAPTION_GERMAN: hookCaptionGerman
      },
      erklaerung: verstoesse.length === 0
        ? "Alle dreizehn Bedingungen des Hard Final Creative Gate bestanden (§15)."
        : verstoesse.length + " Bedingung(en) nicht bestanden: " +
          verstoesse.map(function (v) { return v.id; }).join(", ") + "."
    };
  }

  var api = {
    NEGATIVE_HOOK_MUSTER: NEGATIVE_HOOK_MUSTER,
    istNegativeHookFixture: istNegativeHookFixture,
    istTechnischeCaptionOeffnung: istTechnischeCaptionOeffnung,
    pruefe: pruefe
  };

  if (isNode) module.exports = api;
  else global.VUSocialCreativeGate = api;
})(typeof window !== "undefined" ? window : globalThis);
