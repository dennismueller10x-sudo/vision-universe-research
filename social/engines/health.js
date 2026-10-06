/* =========================================================================
   VISION UNIVERSE SOCIAL — health.js
   OBSERVABILITY UND SOCIAL SYSTEM HEALTH MATRIX (§41, §56)

   Vier Zustaende, und der vierte ist der wichtigste:

     PASS         laeuft und liefert
     WARNING      laeuft, aber etwas stimmt nicht ganz
     FAIL         laeuft nicht oder liefert Falsches
     UNAVAILABLE  existiert fuer uns (noch) nicht

   UNAVAILABLE IST KEIN FEHLER

   Ein Provider ohne hinterlegte Zugangsdaten ist nicht kaputt — er
   wartet auf eine Owner-Handlung. Wer beides als FAIL fuehrt, hat nach
   drei Wochen eine rote Wand und schaut nicht mehr hin.

   KEINE STILLEN FEHLER

   Eine Komponente, ueber die nichts bekannt ist, erscheint hier nicht als
   PASS und auch nicht gar nicht. Sie erscheint als UNAVAILABLE mit dem
   Grund "nie gelaufen" — dieselbe Haltung wie
   scripts/market/build-health-report.mjs: das Fehlende ist der Inhalt.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var STATES = ["PASS", "WARNING", "FAIL", "UNAVAILABLE"];

  /* Die Komponenten, ueber die der Bericht IMMER etwas sagt. Eine feste
     Liste ist Absicht: sonst verschwindet eine Komponente aus dem
     Bericht, sobald ihr Lauf nicht mehr stattfindet — und genau dann
     braucht man sie. */
  var COMPONENTS = [
    { id: "providers.auth",        label: "Provider-Authentifizierung" },
    { id: "providers.publishing",  label: "Veroeffentlichung" },
    { id: "providers.analytics",   label: "Kennzahlenabruf" },
    { id: "providers.audience",    label: "Publikumssignale" },
    { id: "signals.internal",      label: "Interne VU-Signale" },
    { id: "signals.market",        label: "Marktsignale" },
    { id: "signals.news",          label: "Nachrichtensignale" },
    { id: "signals.social",        label: "Externe Social-Signale" },
    { id: "intelligence.trend",    label: "Trend Intelligence" },
    { id: "intelligence.opportunity", label: "Opportunity Engine" },
    { id: "content.pipeline",      label: "Content-Pipeline" },
    { id: "content.validation",    label: "Fakten- und Markenpruefung" },
    { id: "scheduler",             label: "Terminierung" },
    { id: "queue",                 label: "Warteschlange" },
    { id: "learning",              label: "Learning Engine" },
    { id: "experiments",           label: "Experimente" },
    { id: "killSwitch",            label: "Kill Switch" }
  ];

  var STALE_HOURS_DEFAULT = 48;

  function fail(m) { throw new Error("VUSocialHealth: " + m); }

  /**
   * Ein Eintrag. `lastSuccessAt` ist das entscheidende Feld: ein Lauf,
   * der nie erfolgreich war, ist etwas anderes als einer, der gestern noch
   * lief.
   */
  function entry(spec) {
    spec = spec || {};
    if (!spec.component) fail("Eintrag ohne component");
    var state = spec.state || "UNAVAILABLE";
    if (STATES.indexOf(state) === -1) fail("unbekannter Zustand: " + state);
    return {
      component: spec.component,
      label: spec.label || spec.component,
      state: state,
      dataSource: spec.dataSource || null,
      lastSuccessAt: spec.lastSuccessAt || null,
      failureMode: spec.failureMode || null,
      nextAction: spec.nextAction || null,
      detail: spec.detail || null
    };
  }

  /**
   * Leitet den Zustand aus Alter und Erfolg ab.
   *
   * Die Regel: nie gelaufen -> UNAVAILABLE, nicht FAIL. Der Unterschied
   * ist die Frage, ob jemand etwas reparieren oder etwas einrichten muss.
   */
  function deriveState(spec, options) {
    options = options || {};
    var staleHours = options.staleHours || STALE_HOURS_DEFAULT;
    var nowMs = options.now ? new Date(options.now).getTime() : Date.now();

    if (spec.configured === false) {
      return { state: "UNAVAILABLE", reason: "Nicht konfiguriert." };
    }
    if (!spec.lastSuccessAt) {
      return { state: "UNAVAILABLE", reason: "Dieser Lauf hat nie erfolgreich stattgefunden." };
    }
    if (spec.lastError) {
      return { state: "FAIL", reason: spec.lastError };
    }
    var ageHours = (nowMs - Date.parse(spec.lastSuccessAt)) / 3600000;
    if (!Number.isFinite(ageHours)) {
      return { state: "WARNING", reason: "Der letzte Erfolgszeitpunkt ist nicht lesbar." };
    }
    if (ageHours > staleHours) {
      return { state: "WARNING", reason: "Letzter Erfolg vor " + Math.round(ageHours) +
               " h (Frist " + staleHours + " h)." };
    }
    return { state: "PASS", reason: "Letzter Erfolg vor " + Math.round(ageHours * 10) / 10 + " h." };
  }

  /**
   * Baut die Matrix. Komponenten ohne Eingabe erscheinen als UNAVAILABLE
   * mit ausdruecklichem Grund — sie verschwinden nicht.
   */
  function buildMatrix(inputs, options) {
    options = options || {};
    inputs = inputs || {};

    var rows = COMPONENTS.map(function (c) {
      var given = inputs[c.id];
      if (!given) {
        return entry({
          component: c.id, label: c.label, state: "UNAVAILABLE",
          failureMode: "Kein Zustandsbericht vorhanden.",
          nextAction: "Den zustaendigen Lauf einrichten oder ihn seinen Zustand schreiben lassen."
        });
      }
      var derived = given.state ? { state: given.state, reason: given.detail }
                                : deriveState(given, options);
      return entry({
        component: c.id, label: c.label,
        state: derived.state,
        dataSource: given.dataSource || null,
        lastSuccessAt: given.lastSuccessAt || null,
        failureMode: given.failureMode || (derived.state === "PASS" ? null : derived.reason),
        nextAction: given.nextAction ||
          (derived.state === "PASS" ? null : defaultAction(derived.state)),
        detail: derived.reason || given.detail || null
      });
    });

    var counts = { PASS: 0, WARNING: 0, FAIL: 0, UNAVAILABLE: 0 };
    rows.forEach(function (r) { counts[r.state]++; });

    /* Gesamtzustand.

       PASS setzt voraus, dass das System ueberwiegend eingerichtet IST.
       Zwei gruene von siebzehn Komponenten sind kein gruenes System,
       sondern ein System im Aufbau — und ein Bericht, der das PASS nennt,
       ist genau die Beschoenigung, die §45 verbietet. */
    var configuredShare = rows.length === 0 ? 0 : (counts.PASS + counts.WARNING + counts.FAIL) / rows.length;
    var overall;
    if (counts.FAIL > 0) overall = "FAIL";
    else if (configuredShare < 0.5) overall = "UNAVAILABLE";
    else if (counts.WARNING > 0 || counts.UNAVAILABLE > 0) overall = "WARNING";
    else overall = "PASS";

    return {
      generatedAt: options.now || new Date().toISOString(),
      overall: overall,
      counts: counts,
      rows: rows,
      explanation: describe(overall, counts, rows)
    };
  }

  function defaultAction(state) {
    if (state === "FAIL") return "Fehler untersuchen; die Komponente liefert Falsches oder gar nichts.";
    if (state === "WARNING") return "Pruefen, warum der Lauf ueberfaellig ist.";
    return "Einrichten oder Zugangsdaten hinterlegen.";
  }

  function describe(overall, counts, rows) {
    var failing = rows.filter(function (r) { return r.state === "FAIL"; });
    var warning = rows.filter(function (r) { return r.state === "WARNING"; });
    var parts = [];
    parts.push("Gesamtzustand " + overall + ": " + counts.PASS + " PASS, " + counts.WARNING +
               " WARNING, " + counts.FAIL + " FAIL, " + counts.UNAVAILABLE + " UNAVAILABLE.");
    if (failing.length) {
      parts.push("Fehlerhaft: " + failing.map(function (r) { return r.label; }).join(", ") + ".");
    }
    if (warning.length) {
      parts.push("Auffaellig: " + warning.map(function (r) { return r.label; }).join(", ") + ".");
    }
    if (counts.UNAVAILABLE > 0) {
      var pending = rows.filter(function (r) { return r.state === "UNAVAILABLE"; });
      parts.push("Noch nicht eingerichtet (" + pending.length + "): " +
        pending.map(function (r) { return r.label; }).join(", ") + ".");
      if (!failing.length && !warning.length) {
        parts.push("Was fehlt, fehlt weil es noch nicht eingerichtet ist — nicht weil es kaputt ist.");
      }
    }
    return parts.join(" ");
  }

  /**
   * Leitet aus der Matrix die Bereitschaftsmerkmale fuer autonomy.js ab.
   *
   * Das ist die Verbindung, die §16 verlangt: Autonomie ist ein Ergebnis
   * des gemessenen Zustands und keine Einstellung.
   */
  function toAutonomyReadiness(matrix, extras) {
    extras = extras || {};
    var byId = Object.create(null);
    (matrix.rows || []).forEach(function (r) { byId[r.component] = r; });

    function ok(id) { return byId[id] && byId[id].state === "PASS"; }
    function okAny(ids) { return ids.some(ok); }

    return {
      signalsAvailable:       okAny(["signals.internal", "signals.market", "signals.news", "signals.social"]),
      contentPipelineHealthy: ok("content.pipeline"),
      brandValidationHealthy: ok("content.validation"),
      factValidationHealthy:  ok("content.validation"),
      providerStable:         ok("providers.auth") && ok("providers.publishing"),
      publishingStable:       ok("providers.publishing"),
      analyticsCorrect:       ok("providers.analytics"),
      killSwitchPresent:      ok("killSwitch"),
      rollbackPresent:        extras.rollbackPresent === true,
      learningValidated:      ok("learning") && extras.learningValidated === true,
      experimentsValidated:   ok("experiments") && extras.experimentsValidated === true
    };
  }

  var api = {
    STATES: STATES,
    COMPONENTS: COMPONENTS,
    STALE_HOURS_DEFAULT: STALE_HOURS_DEFAULT,
    entry: entry,
    deriveState: deriveState,
    buildMatrix: buildMatrix,
    toAutonomyReadiness: toAutonomyReadiness
  };

  if (isNode) module.exports = api;
  else global.VUSocialHealth = api;
})(typeof window !== "undefined" ? window : globalThis);
