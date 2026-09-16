/* =========================================================================
   VISION UNIVERSE SOCIAL — strategy-memory.js
   DAS VERSIONIERTE STRATEGIE-GEDAECHTNIS (§9, §12)

   -------------------------------------------------------------------------
   WOZU
   -------------------------------------------------------------------------

   Die Learning Engine kann eine neue Strategieversion VORSCHLAGEN. Bis
   heute fiel dieser Vorschlag ins Leere: er wurde nirgends aufbewahrt,
   und der naechste Lauf begann wieder bei den Startwerten. Ein System,
   das jeden Morgen vergisst, was es gestern gelernt hat, hat keinen
   Kreislauf, sondern eine Schleife.

   Dieses Modul ist der Speicher dazwischen. Es haelt die Kette der
   Versionen, nicht nur die letzte:

     strategy_initial  ->  v2 (Beleg A)  ->  v3 (Beleg B)  ->  ...

   -------------------------------------------------------------------------
   WARUM DIE KETTE UND NICHT NUR DER STAND
   -------------------------------------------------------------------------

   Weil die Fragen, die spaeter gestellt werden, historisch sind:

     Warum wurde dieser Hook gewaehlt?
     Welche Evidenz hat die Entscheidung beeinflusst?
     Welche Strategie-Version war aktiv?

   Ein einzelner Parametersatz beantwortet keine davon. Die Kette
   beantwortet alle drei — und sie macht Rollback zu einem Schritt
   zurueck statt zu einer Rekonstruktion.

   -------------------------------------------------------------------------
   WAS HIER NICHT PASSIERT
   -------------------------------------------------------------------------

   Dieses Modul entscheidet nichts. Es bewertet keine Evidenz und
   veraendert keine Parameter — das tut ausschliesslich die Learning
   Engine, mit ihren Schwellen und ihrer invarianten Grenze (§51). Hier
   wird aufbewahrt, verkettet und zurueckgegeben. Die Trennung ist
   Absicht: ein Speicher, der auch urteilt, ist der Ort, an dem eine
   Regel spaeter heimlich zweimal steht.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var Schema = isNode ? require("./schema.js") : global.VUSocialSchema;

  /* Die Startwerte. Sie sind keine gelernte Erkenntnis, sondern der
     Anfang — und sie sind als solcher gekennzeichnet, damit sie spaeter
     nicht als Evidenz missverstanden werden. */
  function initialVersion(now) {
    return Schema.strategyVersion({
      versionId: "strategy_initial",
      createdAt: now || null,
      parentVersionId: null,
      parameters: {},
      rationale: "Startwerte. Keine Evidenz — dies ist der Anfang der Kette, " +
        "nicht das Ergebnis einer Messung.",
      observationIds: [],
      /* Der Anfang ist nicht umkehrbar: es gibt nichts davor. */
      reversible: false
    });
  }

  function createStrategyMemory(persisted, options) {
    options = options || {};
    var now = options.now || null;

    var versions = (persisted && Array.isArray(persisted.versions) && persisted.versions.length)
      ? persisted.versions.map(function (v) { return Schema.strategyVersion(v); })
      : [initialVersion(now)];

    /* Beobachtungen bleiben erhalten, auch die unbelastbaren. Gerade die:
       "n=1, nicht ausreichend" ist beim naechsten Lauf n=2, und ohne die
       aufbewahrte Beobachtung finge das Zaehlen wieder bei eins an. */
    var observations = (persisted && Array.isArray(persisted.observations))
      ? persisted.observations.slice() : [];

    function current() { return versions[versions.length - 1]; }

    function history() { return versions.slice(); }

    function allObservations() { return observations.slice(); }

    function recordObservations(list) {
      var neu = 0;
      (list || []).forEach(function (o) {
        if (!o || !o.observationId) return;
        var schonDa = observations.some(function (x) {
          return x.observationId === o.observationId;
        });
        if (schonDa) return;
        observations.push(o);
        neu += 1;
      });
      return neu;
    }

    /**
     * Uebernimmt einen Vorschlag der Learning Engine.
     *
     * Ein Vorschlag mit `changed: false` erzeugt KEINE neue Version. Das
     * ist der haeufigste Fall und kein Fehler: eine Versionskette, die
     * bei jedem Lauf waechst, obwohl sich nichts geaendert hat, macht die
     * Frage "wann hat sich die Strategie zuletzt bewegt" unbeantwortbar.
     */
    function apply(proposal, meta) {
      meta = meta || {};
      if (!proposal || proposal.changed !== true) {
        return {
          committed: false,
          version: current(),
          reason: (proposal && proposal.explanation) ||
            "Kein Vorschlag mit belastbarer Evidenz."
        };
      }

      var vorherige = current();
      var neueVersion = Schema.strategyVersion({
        versionId: proposal.version.versionId ||
          ("strategy_v" + (versions.length + 1)),
        createdAt: meta.now || now,
        parentVersionId: vorherige.versionId,
        parameters: proposal.version.parameters || {},
        rationale: proposal.explanation || null,
        observationIds: (proposal.applied || []).map(function (a) {
          return a.observationId;
        }).filter(Boolean),
        reversible: true
      });

      versions.push(neueVersion);
      return { committed: true, version: neueVersion, previous: vorherige,
        reason: proposal.explanation || null };
    }

    /**
     * Zurueck zu einer frueheren Version.
     *
     * Rollback haengt eine NEUE Version an, die die alten Parameter
     * traegt — es loescht nichts. Eine Geschichte, aus der man Eintraege
     * entfernen kann, ist als Beweis wertlos.
     */
    function rollbackTo(versionId, meta) {
      meta = meta || {};
      var ziel = versions.filter(function (v) { return v.versionId === versionId; })[0];
      if (!ziel) {
        return { ok: false, version: current(),
          reason: "Version '" + versionId + "' ist nicht in der Kette." };
      }
      if (ziel.reversible === false && versions.length > 1 &&
          ziel.versionId !== "strategy_initial") {
        return { ok: false, version: current(),
          reason: "Version '" + versionId + "' ist als nicht umkehrbar markiert." };
      }

      var neueVersion = Schema.strategyVersion({
        versionId: "strategy_v" + (versions.length + 1) + "_rollback",
        createdAt: meta.now || now,
        parentVersionId: current().versionId,
        parameters: JSON.parse(JSON.stringify(ziel.parameters || {})),
        rationale: "Rueckkehr zu " + versionId +
          (meta.reason ? ": " + meta.reason : "") +
          ". Die Zwischenversionen bleiben in der Kette stehen.",
        observationIds: [],
        reversible: true
      });
      versions.push(neueVersion);
      return { ok: true, version: neueVersion, restoredFrom: versionId };
    }

    /** Der Stand, wie er auf die Platte geht. */
    function snapshot(meta) {
      meta = meta || {};
      return {
        generatedAt: meta.now || now,
        currentVersionId: current().versionId,
        versions: versions.slice(),
        observations: observations.slice()
      };
    }

    return {
      current: current,
      history: history,
      observations: allObservations,
      recordObservations: recordObservations,
      apply: apply,
      rollbackTo: rollbackTo,
      snapshot: snapshot,
      size: function () { return versions.length; }
    };
  }

  var api = {
    createStrategyMemory: createStrategyMemory,
    initialVersion: initialVersion
  };

  if (isNode) module.exports = api;
  else global.VUSocialStrategyMemory = api;
})(typeof window !== "undefined" ? window : globalThis);
