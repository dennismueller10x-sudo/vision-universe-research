/* =========================================================================
   PHASE 3 §6/§12 — DIE DREI GATE-TESTS

   Zwei Dinge werden hier geprueft, und das zweite ist das wichtigere.

   1. Der MockProvider besteht alle drei Gates. Damit ist belegt, dass die
      Anforderungen erfuellbar sind - eine Spezifikation, die niemand
      bestehen kann, ist keine Spezifikation, sondern eine Ausrede.

   2. Ein Anbieter mit den ueblichen Luecken faellt durch, und zwar mit
      einer Begruendung, die den konkreten Fehler benennt. Dafuer stehen
      unten mehrere absichtlich fehlerhafte Adapter: einer, der nur den
      heutigen Stand kennt; einer, der delistete Titel verschweigt; einer,
      der periodEnd als Verfuegbarkeitszeitpunkt ausgibt.

   Der zweite Punkt ist der eigentliche Zweck: ein Test, der nur den guten
   Fall prueft, faellt nicht auf, wenn er gar nichts mehr prueft.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const Gates = require("../engines/gate-tests.js");
const Generator = require("../engines/mock-generator.js");
const MockProvider = require("../engines/mock-provider.js");

const dataset = Generator.generateDataset();
const provider = MockProvider.createMockProvider({ dataset });

/* Die Fixture-Parameter: welcher Titel, welcher Stichtag, welche Kennzahl.
   Genau diese Angaben braucht ein realer Anbietertest auch - nur mit einem
   realen Unternehmen, dessen Korrektur oder Delisting belegt ist. */
const FIXTURES = {
  GATE_A_RESTATEMENT: {
    securityId: "sec_VUF009",
    periodEnd: "2017-03-31",
    metricId: "revenue",
    beforeRestatement: "2017-09-29",
    afterRestatement: "2019-09-30"
  },
  GATE_B_DELISTING: {
    securityId: "sec_VUF008",
    duringListing: "2018-03-29",
    afterDelisting: dataset.meta.end
  },
  GATE_C_AVAILABILITY: {
    securityId: "sec_VUF010",
    asOf: "2024-06-28"
  }
};

/* Der Adapter, den ein Gate-Test erwartet. Bewusst schmal: zwei Methoden.
   Ein realer Anbieteradapter muss genau diese beiden bereitstellen, dann
   laesst er sich ohne Aenderung an den Gates pruefen. */
function mockAdapter(overrides) {
  const base = {
    getFactsAsOf(securityId, opts) {
      return Promise.resolve(provider.getFacts(securityId, opts));
    },
    getUniverseAsOf(opts) {
      return Promise.resolve(provider.getSecurities(opts));
    }
  };
  return Object.assign(base, overrides || {});
}

/* ============================================== Der gute Fall: Referenz */

test("G1 · Der MockProvider besteht Gate A (Restatement)", async () => {
  const res = await Gates.gateA(mockAdapter(), FIXTURES.GATE_A_RESTATEMENT);
  assert.equal(res.result, "PASSED", res.message);

  // Die Erstmeldung lag hoeher als die Korrektur - genau der Fall, in dem
  // ein Backtest ohne PIT-Daten zu gut aussieht.
  assert.equal(res.evidence.beforeStatus, "original");
  assert.equal(res.evidence.afterStatus, "restated");
  assert.ok(res.evidence.afterValue < res.evidence.beforeValue,
    "der Testfall soll eine Korrektur nach unten sein");
});

test("G2 · Der MockProvider besteht Gate B (Delisting)", async () => {
  const res = await Gates.gateB(mockAdapter(), FIXTURES.GATE_B_DELISTING);
  assert.equal(res.result, "PASSED", res.message);
  assert.equal(res.evidence.inHistoricalUniverse, true);
  assert.equal(res.evidence.inCurrentUniverse, false);
  assert.ok(res.evidence.fundamentalRecords > 0,
    "ohne Fundamentaldaten bleibt der Titel fuer eine fundamentale Strategie unsichtbar");
});

test("G3 · Der MockProvider besteht Gate C (Verfuegbarkeitszeitpunkt)", async () => {
  const res = await Gates.gateC(mockAdapter(), FIXTURES.GATE_C_AVAILABILITY);
  assert.equal(res.result, "PASSED", res.message);
  assert.equal(res.evidence.withoutTimestamp, 0);
  assert.equal(res.evidence.availableAfterAsOf, 0);
  assert.equal(res.evidence.sampleTimestampField, "availableAt");
});

test("G4 · Alle drei zusammen, als Laufzeitbefund", async () => {
  const res = await Gates.runGateTests(mockAdapter(), FIXTURES);
  assert.equal(res.allPassed, true);
  assert.equal(res.passed, 3);
  // Bestanden heisst RUNTIME_VERIFIED - die einzige Stufe, auf der eine
  // Faehigkeit belegt statt behauptet ist.
  assert.equal(res.verificationLevel, "RUNTIME_VERIFIED");
});

/* =================================== Die schlechten Faelle: Trennschaerfe */

test("G5 · Ein Anbieter, der nur den heutigen Stand kennt, faellt durch Gate A", async () => {
  // Der haeufigste reale Fall: die Datenbank haelt je Periode genau einen
  // Wert, naemlich den zuletzt bekannten, und reicht ihn in die Vergangenheit
  // durch. Nichts daran sieht kaputt aus.
  const heutigerStand = mockAdapter({
    getFactsAsOf(securityId, opts) {
      return Promise.resolve(provider.getFacts(securityId,
        Object.assign({}, opts, { asOf: dataset.meta.end })));
    }
  });

  const res = await Gates.gateA(heutigerStand, FIXTURES.GATE_A_RESTATEMENT);
  assert.equal(res.result, "FAILED");
  assert.match(res.message, /denselben Wert/);
  assert.equal(res.evidence.beforeValue, res.evidence.afterValue);
});

test("G6 · Ein Anbieter ohne Kennzeichnung der Erstmeldung faellt durch Gate A", async () => {
  // Subtiler: die Werte unterscheiden sich, aber nichts sagt, welcher der
  // damals gemeldete war. Ohne diese Kennzeichnung laesst sich die
  // Rekonstruktion nicht pruefen, nur hoffen.
  const ohneKennzeichnung = mockAdapter({
    getFactsAsOf(securityId, opts) {
      const res = provider.getFacts(securityId, opts);
      return Promise.resolve({
        available: true,
        data: (res.data || []).map((f) => {
          const copy = Object.assign({}, f);
          delete copy.restatementStatus;
          return copy;
        })
      });
    }
  });

  const res = await Gates.gateA(ohneKennzeichnung, FIXTURES.GATE_A_RESTATEMENT);
  assert.equal(res.result, "FAILED");
  assert.match(res.message, /kennzeichnet nicht/);
});

test("G7 · Ein Anbieter ohne delistete Titel faellt durch Gate B", async () => {
  const nurUeberlebende = mockAdapter({
    getUniverseAsOf(opts) {
      const res = provider.getSecurities(opts);
      return Promise.resolve({
        available: true,
        data: (res.data || []).filter((s) => s.status !== "delisted")
      });
    }
  });

  const res = await Gates.gateB(nurUeberlebende, FIXTURES.GATE_B_DELISTING);
  assert.equal(res.result, "FAILED");
  assert.match(res.message, /fehlt im historischen Universum/);
  assert.equal(res.evidence.inHistoricalUniverse, false);
});

test("G8 · Kursreihen ohne Fundamentaldaten reichen fuer Gate B nicht", async () => {
  // Die Luecke, die am leichtesten uebersehen wird: der Titel ist im
  // Universum, hat aber keine Bilanzdaten. Eine fundamental auswaehlende
  // Strategie sieht ihn trotzdem nicht.
  const ohneFundamentaldaten = mockAdapter({
    getFactsAsOf(securityId, opts) {
      if (securityId === FIXTURES.GATE_B_DELISTING.securityId) {
        return Promise.resolve({ available: true, data: [] });
      }
      return Promise.resolve(provider.getFacts(securityId, opts));
    }
  });

  const res = await Gates.gateB(ohneFundamentaldaten, FIXTURES.GATE_B_DELISTING);
  assert.equal(res.result, "FAILED");
  assert.match(res.message, /keine Fundamentaldaten/);
  assert.match(res.message, /Survivorship/);
});

test("G9 · periodEnd als Verfuegbarkeitszeitpunkt faellt durch Gate C", async () => {
  // Der Fall, vor dem der Auftrag ausdruecklich warnt: ein Feld, das
  // aussieht wie availableAt und periodEnd enthaelt.
  const periodEndAlsAvailable = mockAdapter({
    getFactsAsOf(securityId, opts) {
      const res = provider.getFacts(securityId, opts);
      return Promise.resolve({
        available: true,
        data: (res.data || []).map((f) => Object.assign({}, f, {
          availableAt: f.periodEnd, filedAt: f.periodEnd, publishedAt: null
        }))
      });
    }
  });

  const res = await Gates.gateC(periodEndAlsAvailable, FIXTURES.GATE_C_AVAILABILITY);
  assert.equal(res.result, "FAILED");
  assert.match(res.message, /Periodenende unter anderem Namen/);
});

test("G10 · Fehlende Zeitstempel fallen durch Gate C", async () => {
  const ohneZeitstempel = mockAdapter({
    getFactsAsOf(securityId, opts) {
      const res = provider.getFacts(securityId, opts);
      return Promise.resolve({
        available: true,
        data: (res.data || []).map((f) => {
          const copy = Object.assign({}, f);
          delete copy.availableAt; delete copy.filedAt; delete copy.publishedAt;
          return copy;
        })
      });
    }
  });

  const res = await Gates.gateC(ohneZeitstempel, FIXTURES.GATE_C_AVAILABILITY);
  assert.equal(res.result, "FAILED");
  assert.match(res.message, /periodEnd allein reicht nicht/);
});

test("G11 · Daten aus der Zukunft fallen durch Gate C", async () => {
  // Genau das, was MOCK_FUTURE_DATA_LEAK nachstellt: ein Datensatz, dessen
  // Veroeffentlichung nach dem Stichtag liegt und trotzdem geliefert wird.
  const mitLeck = mockAdapter({
    getFactsAsOf(securityId, opts) {
      // Ignoriert asOf und liefert alles, was es gibt.
      return Promise.resolve(provider.getFacts(securityId,
        Object.assign({}, opts, { asOf: dataset.meta.end })));
    }
  });

  const res = await Gates.gateC(mitLeck, { securityId: "sec_VUF010", asOf: "2020-01-02" });
  assert.equal(res.result, "FAILED");
  assert.match(res.message, /nach dem Stichtag/);
  assert.ok(res.evidence.availableAfterAsOf > 0);
});

test("G12 · Ohne Fixture-Parameter wird uebersprungen, nicht bestanden", async () => {
  // Ein Gate ohne Testfall darf nicht als bestanden durchgehen. Das ist der
  // Weg, auf dem eine Pruefung stillschweigend aufhoert zu pruefen.
  for (const [gate, fn] of [["GATE_A_RESTATEMENT", Gates.gateA],
                            ["GATE_B_DELISTING", Gates.gateB],
                            ["GATE_C_AVAILABILITY", Gates.gateC]]) {
    const res = await fn(mockAdapter(), {});
    assert.equal(res.result, "SKIPPED", `${gate} wurde ohne Parameter nicht uebersprungen`);
    assert.notEqual(res.result, "PASSED");
  }

  const all = await Gates.runGateTests(mockAdapter(), {});
  assert.equal(all.allPassed, false);
  assert.equal(all.verificationLevel, "UNKNOWN",
    "uebersprungene Gates duerfen keinen Laufzeitbefund erzeugen");
});
