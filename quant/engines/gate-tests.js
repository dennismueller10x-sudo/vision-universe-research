/* =========================================================================
   VISION UNIVERSE — gate-tests.js   (Phase 3, §6, §12)

   Die drei Gate-Tests als ausfuehrbarer Code statt als Prosa.

   Vision Universe hat seit V1 drei Fixtures, die genau die drei Fehler
   nachstellen, an denen historische Auswertungen scheitern:

     MOCK_RESTATEMENT      eine spaeter korrigierte Zahl
     MOCK_DELISTED         ein Unternehmen, das es heute nicht mehr gibt
     MOCK_FUTURE_DATA_LEAK eine Information, die es damals noch nicht gab

   Bisher pruefte das System damit sich selbst. Diese Datei macht daraus
   einen Test FUER ANBIETER: dieselben drei Fragen, gestellt an eine echte
   Schnittstelle. Der MockProvider ist dabei die Referenz - er besteht alle
   drei, und daran laesst sich ablesen, wie eine bestandene Antwort aussieht.

   Warum das mehr ist als eine Formalie: die drei Fehler haben gemeinsam,
   dass sie kein Fehlerbild erzeugen. Kein Absturz, keine Luecke, keine
   auffaellige Zahl - nur ein Ergebnis, das ein wenig besser ist als die
   Wirklichkeit, und zwar immer in dieselbe Richtung.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* ------------------------------------------------------------- Gate A */
  /**
   * Kann zu einem historischen Datum exakt der damals bekannte Wert
   * rekonstruiert werden?
   *
   * Der Test stellt dieselbe Frage zweimal mit unterschiedlichem Stichtag.
   * Ein Anbieter besteht nur, wenn die Antworten sich unterscheiden UND die
   * fruehere als Erstmeldung erkennbar ist. Zwei gleiche Antworten heissen:
   * der Anbieter kennt nur den heutigen Stand und reicht ihn in die
   * Vergangenheit durch.
   */
  function gateA(adapter, params) {
    var p = params || {};
    var required = ["securityId", "periodEnd", "metricId", "beforeRestatement", "afterRestatement"];
    for (var i = 0; i < required.length; i++) {
      if (!p[required[i]]) {
        return skip("GATE_A_RESTATEMENT", "Parameter '" + required[i] + "' fehlt.");
      }
    }

    return Promise.all([
      adapter.getFactsAsOf(p.securityId, { asOf: p.beforeRestatement, periodEnd: p.periodEnd, metricId: p.metricId }),
      adapter.getFactsAsOf(p.securityId, { asOf: p.afterRestatement, periodEnd: p.periodEnd, metricId: p.metricId })
    ]).then(function (pair) {
      var before = firstFact(pair[0]);
      var after = firstFact(pair[1]);

      if (!before || !after) {
        return fail("GATE_A_RESTATEMENT",
          "Zu mindestens einem der beiden Stichtage kam kein Wert zurueck.",
          { before: !!before, after: !!after });
      }

      var evidence = {
        beforeValue: before.value, afterValue: after.value,
        beforeStatus: before.restatementStatus || null,
        afterStatus: after.restatementStatus || null,
        beforeAvailableAt: before.availableAt || before.filedAt || null,
        afterAvailableAt: after.availableAt || after.filedAt || null
      };

      if (before.value === after.value) {
        return fail("GATE_A_RESTATEMENT",
          "Beide Stichtage liefern denselben Wert. Entweder gab es keine Korrektur, " +
          "oder der Anbieter kennt nur den heutigen Stand und reicht ihn in die " +
          "Vergangenheit durch. Der Testfall muss ein Papier mit belegter Korrektur treffen.",
          evidence);
      }
      if (!before.restatementStatus || !after.restatementStatus) {
        return fail("GATE_A_RESTATEMENT",
          "Die Werte unterscheiden sich, aber der Anbieter kennzeichnet nicht, welcher " +
          "die Erstmeldung ist. Ohne diese Kennzeichnung laesst sich nicht pruefen, ob " +
          "der fruehere Wert wirklich der damals bekannte war.",
          evidence);
      }
      if (before.restatementStatus !== "original") {
        return fail("GATE_A_RESTATEMENT",
          "Der Wert zum fruehen Stichtag ist nicht als Erstmeldung gekennzeichnet (" +
          before.restatementStatus + ").", evidence);
      }
      return pass("GATE_A_RESTATEMENT",
        "Der fruehe Stichtag liefert die Erstmeldung (" + before.value + "), der spaete die " +
        "Korrektur (" + after.value + "). Die Korrektur wirkt nicht rueckwaerts.",
        evidence);
    });
  }

  /* ------------------------------------------------------------- Gate B */
  /**
   * Bleiben Wertpapiere abrufbar, die heute delistet sind?
   *
   * Der Test verlangt dreierlei: der Titel muss im historischen Universum
   * auftauchen, heute nicht mehr, und er muss auch FUNDAMENTALDATEN haben.
   * Der dritte Punkt wird am haeufigsten uebersehen: viele Anbieter fuehren
   * Kursreihen delisteter Titel und keine Bilanzen. Fuer eine Strategie, die
   * nach Fundamentaldaten auswaehlt, ist ein solcher Titel unsichtbar - und
   * der Survivorship Bias bleibt bestehen.
   */
  function gateB(adapter, params) {
    var p = params || {};
    if (!p.securityId || !p.duringListing || !p.afterDelisting) {
      return skip("GATE_B_DELISTING", "Parameter securityId, duringListing oder afterDelisting fehlt.");
    }

    return Promise.all([
      adapter.getUniverseAsOf({ asOf: p.duringListing }),
      adapter.getUniverseAsOf({ asOf: p.afterDelisting }),
      adapter.getFactsAsOf(p.securityId, { asOf: p.duringListing })
    ]).then(function (parts) {
      var during = idsOf(parts[0]);
      var after = idsOf(parts[1]);
      var facts = listOf(parts[2]);

      var evidence = {
        inHistoricalUniverse: during.indexOf(p.securityId) !== -1,
        inCurrentUniverse: after.indexOf(p.securityId) !== -1,
        fundamentalRecords: facts.length,
        universeSizeDuring: during.length,
        universeSizeAfter: after.length
      };

      if (!evidence.inHistoricalUniverse) {
        return fail("GATE_B_DELISTING",
          "Der delistete Titel fehlt im historischen Universum. Ein Backtest ueber diesen " +
          "Zeitraum saehe nur die Ueberlebenden - und zwar ohne dass es auffiele.",
          evidence);
      }
      if (evidence.inCurrentUniverse) {
        return fail("GATE_B_DELISTING",
          "Der Titel erscheint noch im heutigen Universum, obwohl er delistet ist. " +
          "Der Anbieter fuehrt das Ausscheiden nicht.", evidence);
      }
      if (!facts.length) {
        return fail("GATE_B_DELISTING",
          "Der Titel ist im historischen Universum, hat aber keine Fundamentaldaten. " +
          "Fuer eine fundamental auswaehlende Strategie bleibt er damit unsichtbar, und " +
          "der Survivorship Bias besteht fort - nur eine Ebene tiefer.", evidence);
      }
      return pass("GATE_B_DELISTING",
        "Der Titel ist im historischen Universum enthalten (" + facts.length +
        " Fundamentaldatensaetze) und heute nicht mehr.", evidence);
    });
  }

  /* ------------------------------------------------------------- Gate C */
  /**
   * Laesst sich bestimmen, wann eine Information verfuegbar wurde?
   *
   * Zwei Pruefungen: erstens muss jede Kennzahl einen Verfuegbarkeitszeitpunkt
   * tragen, der NACH dem Periodenende liegt - sonst wird periodEnd nur
   * umbenannt. Zweitens darf eine Abfrage mit Stichtag keine Kennzahl
   * liefern, die zu diesem Stichtag noch nicht veroeffentlicht war.
   */
  function gateC(adapter, params) {
    var p = params || {};
    if (!p.securityId || !p.asOf) {
      return skip("GATE_C_AVAILABILITY", "Parameter securityId oder asOf fehlt.");
    }

    return adapter.getFactsAsOf(p.securityId, { asOf: p.asOf }).then(function (res) {
      var facts = listOf(res);
      if (!facts.length) {
        return fail("GATE_C_AVAILABILITY", "Keine Kennzahlen zurueckgeliefert.", { count: 0 });
      }

      var withoutTimestamp = facts.filter(function (f) {
        return !f.availableAt && !f.filedAt && !f.publishedAt;
      });
      var leaks = facts.filter(function (f) {
        var at = f.availableAt || f.filedAt || f.publishedAt;
        return at && at > p.asOf;
      });
      var notAfterPeriod = facts.filter(function (f) {
        var at = f.availableAt || f.filedAt || f.publishedAt;
        return at && f.periodEnd && at <= f.periodEnd;
      });

      var evidence = {
        total: facts.length,
        withoutTimestamp: withoutTimestamp.length,
        availableAfterAsOf: leaks.length,
        timestampNotAfterPeriodEnd: notAfterPeriod.length,
        sampleTimestampField: facts[0].availableAt ? "availableAt"
          : facts[0].filedAt ? "filedAt" : facts[0].publishedAt ? "publishedAt" : null
      };

      if (withoutTimestamp.length) {
        return fail("GATE_C_AVAILABILITY",
          withoutTimestamp.length + " von " + facts.length + " Kennzahlen tragen keinen " +
          "Verfuegbarkeitszeitpunkt. periodEnd allein reicht nicht: zwischen Periodenende " +
          "und Veroeffentlichung liegen Wochen, und der Abstand ist nicht konstant.",
          evidence);
      }
      if (leaks.length) {
        return fail("GATE_C_AVAILABILITY",
          leaks.length + " Kennzahlen wurden geliefert, obwohl ihr Veroeffentlichungsdatum " +
          "nach dem Stichtag liegt. Die Abfrage laesst sich nicht auf den damaligen " +
          "Wissensstand einschraenken.", evidence);
      }
      if (notAfterPeriod.length === facts.length) {
        return fail("GATE_C_AVAILABILITY",
          "Kein einziger Zeitstempel liegt nach dem zugehoerigen Periodenende. Das Feld " +
          "traegt vermutlich das Periodenende unter anderem Namen.", evidence);
      }
      return pass("GATE_C_AVAILABILITY",
        facts.length + " Kennzahlen, alle mit Verfuegbarkeitszeitpunkt, keine nach dem " +
        "Stichtag veroeffentlichte darunter.", evidence);
    });
  }

  /* ------------------------------------------------------------- Ablauf */

  function runGateTests(adapter, fixtures) {
    fixtures = fixtures || {};
    return Promise.all([
      gateA(adapter, fixtures.GATE_A_RESTATEMENT),
      gateB(adapter, fixtures.GATE_B_DELISTING),
      gateC(adapter, fixtures.GATE_C_AVAILABILITY)
    ]).then(function (results) {
      var byId = {};
      results.forEach(function (r) { byId[r.gate] = r; });
      var passed = results.filter(function (r) { return r.result === "PASSED"; }).length;
      return {
        gates: byId,
        passed: passed,
        total: results.length,
        allPassed: passed === results.length,
        /* Ausdruecklich: bestanden heisst RUNTIME_VERIFIED. Das ist die
           einzige Stufe, auf der eine Faehigkeit belegt statt behauptet ist. */
        verificationLevel: results.every(function (r) { return r.result !== "SKIPPED"; })
          ? "RUNTIME_VERIFIED" : "UNKNOWN"
      };
    });
  }

  /* ------------------------------------------------------------- Helfer */

  function pass(gate, message, evidence) {
    return { gate: gate, result: "PASSED", message: message, evidence: evidence || null };
  }
  function fail(gate, message, evidence) {
    return { gate: gate, result: "FAILED", message: message, evidence: evidence || null };
  }
  function skip(gate, message) {
    return Promise.resolve({ gate: gate, result: "SKIPPED", message: message, evidence: null });
  }

  /* Die Adapterantworten kommen in zwei Formen vor: als nackte Liste oder in
     der Huelle {available, data}. Beides wird akzeptiert - der Gate-Test soll
     nicht daran scheitern, welche Konvention ein Adapter benutzt. */
  function listOf(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.data)) return res.data;
    if (res.data && Array.isArray(res.data.rows)) return res.data.rows;
    return [];
  }
  function firstFact(res) {
    var list = listOf(res);
    return list.length ? list[0] : null;
  }
  function idsOf(res) {
    return listOf(res).map(function (s) { return s.securityId || s.id || s.ticker; });
  }

  var api = {
    gateA: gateA, gateB: gateB, gateC: gateC,
    runGateTests: runGateTests,
    listOf: listOf
  };

  if (isNode) module.exports = api;
  else global.VUGateTests = api;
})(typeof window !== "undefined" ? window : globalThis);
