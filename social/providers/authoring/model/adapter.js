/* =========================================================================
   VISION UNIVERSE SOCIAL — Autor: Sprachmodell (generativ)

   -------------------------------------------------------------------------
   DER ZUSTAND DIESER DATEI
   -------------------------------------------------------------------------

   Sie ist vollstaendig und sie laeuft — aber sie hat heute keinen
   Client. Im Repository existiert kein Modellanbieter, kein Schluessel
   und keine Abrechnung; einen einzufuehren ist eine Owner-Entscheidung
   ueber laufende Kosten und nicht eine Implementierungsfrage.

   Deshalb meldet sich dieser Autor OHNE Client ab, statt zu scheitern.
   `available()` sagt nein mit Begruendung, und der Ablauf faellt auf den
   deterministischen Autor zurueck. Ein Ausfall, der erst im Lauf
   auffaellt, waere ein Beitrag ohne Text.

   -------------------------------------------------------------------------
   WAS ER DEM MODELL GIBT — UND WAS NICHT
   -------------------------------------------------------------------------

   Er gibt den Brief. Nur den Brief. Kein Signal, keine Suche, kein
   Werkzeug, keinen Zugriff auf das Gedaechtnis, keine Moeglichkeit,
   etwas zu veroeffentlichen.

   Das ist keine Vorsicht gegen ein bestimmtes Modell. Es ist die
   einzige Bauweise, in der die Frage "woher stammt diese Zahl"
   beantwortbar bleibt: eine Zahl im Ergebnis kann nur aus dem Brief
   stammen — oder sie ist erfunden, und dann faengt sie das Claim
   Binding.

   -------------------------------------------------------------------------
   WARUM DIE ANTWORT TROTZDEM GEPRUEFT WIRD
   -------------------------------------------------------------------------

   Ein Prompt ist eine Bitte, keine Garantie. Ein Modell, das angewiesen
   wurde, nichts zu erfinden, erfindet seltener — nicht nie. Die
   Prompt-Anweisungen hier senken die Trefferwahrscheinlichkeit; die
   Verteidigung ist das Claim Binding dahinter.

   Deshalb sind die Tests dieser Datei ueberwiegend FEINDLICH: der
   Doppelgaenger liefert erfundene Zahlen, fremde Ticker, Prognosen und
   Anweisungen. Ein Test, der nur die brave Antwort prueft, prueft die
   Braveheit des Doppelgaengers.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Authoring = isNode ? require("../../../engines/authoring.js") : global.VUSocialAuthoring;
  var Brief = isNode ? require("../../../engines/content-brief.js") : global.VUSocialContentBrief;

  /**
   * Der Prompt.
   *
   * Er steht hier im Klartext und nicht verstreut, weil er die
   * Schnittstelle zum einzigen nichtdeterministischen Teil des Systems
   * ist. Wer wissen will, was das Modell gesehen hat, liest diese
   * Funktion — und `buildPrompt(brief)` gibt dasselbe zurueck, was
   * gesendet wurde.
   */
  function buildPrompt(brief, options) {
    options = options || {};
    var anzahl = Number(options.variants) || 4;
    var c = brief.constraints || {};

    var zeilen = [];
    zeilen.push("Du schreibst Vorschlaege fuer einen Social-Media-Beitrag von Vision Universe.");
    zeilen.push("");
    zeilen.push("DIE EINZIGEN FAKTEN, DIE DU BENUTZEN DARFST:");
    Brief.evidenceLines(brief).forEach(function (l) { zeilen.push("  " + l); });
    zeilen.push("");
    zeilen.push("WAS DU NICHT BEHAUPTEN DARFST:");
    (brief.mustNotClaim || []).forEach(function (m) { zeilen.push("  - " + m.text); });
    zeilen.push("");
    zeilen.push("Jede Zahl in deinem Text muss exakt aus der Liste oben stammen. Rechne nichts");
    zeilen.push("aus, runde nicht auf, ergaenze keine Jahreszahlen, nenne keine anderen Titel.");
    zeilen.push("Ein Text ohne Zahl ist besser als ein Text mit einer erfundenen.");
    zeilen.push("");
    zeilen.push("FORM:");
    zeilen.push("  Sprache: " + (c.language || "de"));
    zeilen.push("  Register: " + (c.register || "sachlich"));
    zeilen.push("  Hook hoechstens " + (c.hookMax || 120) + " Zeichen.");
    zeilen.push("  Caption hoechstens " + (c.captionMax || 2200) + " Zeichen.");
    if (c.requireDisclaimer) {
      zeilen.push("  Die Caption endet mit: " + c.disclaimer);
    }
    zeilen.push("");
    zeilen.push("KONTEXT (nicht als Fakten verwendbar):");
    zeilen.push("  Thema: " + (brief.topic || "—"));
    zeilen.push("  Archetyp: " + (brief.archetype || "—"));
    zeilen.push("  Bildform: " + (brief.visualType || "—"));
    if (brief.learned && brief.learned.hookPatterns && brief.learned.hookPatterns.length) {
      zeilen.push("  Bisher gemessen wirksam: " + brief.learned.hookPatterns.join(", "));
    } else {
      zeilen.push("  Bisher gemessen wirksam: nichts. Variiere bewusst.");
    }
    zeilen.push("");
    zeilen.push("Liefere " + anzahl + " deutlich verschiedene Varianten als JSON:");
    zeilen.push('  {"variants":[{"pattern":"kurzname","hook":"...","caption":"...",' +
      '"visualLine":"..."}]}');
    zeilen.push("Verschieden heisst: anderer Einstieg, andere Reihenfolge, anderer");
    zeilen.push("Schwerpunkt — nicht dieselben Saetze umgestellt.");

    return zeilen.join("\n");
  }

  /** Was vom Modell zurueckkommt, ist Text. Auch dann, wenn JSON erwartet wurde. */
  function parseResponse(raw) {
    if (raw && typeof raw === "object" && Array.isArray(raw.variants)) return raw.variants;
    var s = String(raw === null || raw === undefined ? "" : raw);

    /* Ein Modell rahmt JSON gerne in Fliesstext oder Codebloecke. */
    var block = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (block) s = block[1];

    var anfang = s.indexOf("{");
    var ende = s.lastIndexOf("}");
    if (anfang === -1 || ende <= anfang) return [];
    try {
      var o = JSON.parse(s.slice(anfang, ende + 1));
      return Array.isArray(o.variants) ? o.variants : [];
    } catch (err) {
      return [];
    }
  }

  /**
   * @param options.client   { complete(prompt, opts) -> Promise<string>|string }
   *                         Fehlt er, meldet sich der Autor ab.
   * @param options.modelId  nur fuer die Protokollierung
   */
  function createModelAuthor(options) {
    options = options || {};
    var client = options.client || null;

    return {
      authorId: options.authorId || "model",
      kind: "generative",
      capabilities: {
        variants: Number(options.variants) || 4,
        hooks: true, captions: true, visualLines: true, structure: true,
        /* Beides true — und genau deshalb ist der Einsatz eine
           Owner-Entscheidung und keine Implementierungsfrage. */
        requiresNetwork: true, requiresCredentials: true,
        modelId: options.modelId || null
      },

      available: function () {
        if (!client || typeof client.complete !== "function") {
          return { ok: false, reason:
            "Kein Modell-Client angebunden. Im Repository existiert kein Anbieter und " +
            "kein Schluessel; das Anbinden kostet laufend Geld und ist deshalb eine " +
            "Owner-Entscheidung. Bis dahin schreibt der deterministische Autor." };
        }
        return { ok: true, reason: null };
      },

      buildPrompt: buildPrompt,

      write: function (brief, opts) {
        opts = opts || {};
        var prompt = buildPrompt(brief, opts);

        var antwort;
        try {
          antwort = client.complete(prompt, { maxTokens: opts.maxTokens || 1200 });
        } catch (err) {
          /* Ein Ausfall des Modells ist kein Grund, irgendetwas zu
             erfinden — und auch keiner, den Lauf abzubrechen. Es gibt
             dann eben keine generativen Varianten. */
          return { variants: [], reason: "Modellaufruf gescheitert: " +
            String(err && err.message || err).slice(0, 200) };
        }

        var roh = parseResponse(antwort);
        if (!roh.length) {
          return { variants: [], reason: "Die Antwort enthielt keine lesbaren Varianten." };
        }

        var e = (brief.evidence || [])[0] || null;

        return {
          variants: roh.slice(0, Number(opts.variants) || 4).map(function (v, i) {
            return Authoring.variant({
              authorId: options.authorId || "model",
              kind: "generative",
              hook: v.hook ? String(v.hook) : null,
              caption: v.caption ? String(v.caption) : null,
              visualLine: v.visualLine ? String(v.visualLine) : null,
              hashtags: Array.isArray(v.hashtags) ? v.hashtags : (options.hashtags || []),
              pattern: v.pattern ? "model/" + String(v.pattern) : "model/unbenannt-" + (i + 1),
              /* Die Belege werden NICHT vom Modell uebernommen. Es
                 bekommt sie, es erfindet sie nicht — und was es
                 zurueckschickt, ist Text und keine Quellenangabe. */
              claims: e ? [
                { text: String(e.value) + (e.unit ? " " + e.unit : ""), numeric: e.value,
                  source: { source: e.source, entity: e.entity, metric: e.metric,
                            observedAt: e.observedAt, state: e.state || "VERIFIED" } },
                { text: String(e.metric), numeric: null,
                  source: { source: e.source, entity: e.entity, metric: e.metric,
                            observedAt: e.observedAt, state: e.state || "VERIFIED" } }
              ] : [],
              notes: "generativ, Modell " + (options.modelId || "unbenannt")
            });
          }),
          reason: null
        };
      }
    };
  }

  var api = {
    buildPrompt: buildPrompt,
    parseResponse: parseResponse,
    createModelAuthor: createModelAuthor
  };

  if (isNode) module.exports = api;
  else global.VUSocialAuthorModel = api;
})(typeof window !== "undefined" ? window : globalThis);
