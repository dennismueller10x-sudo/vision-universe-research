/* =========================================================================
   PHASE 4 — SEC-ADAPTER IN DER BESTEHENDEN PROVIDER-ABSTRACTION

   Dieser Test prueft die Integrationsgrenze, nicht die SEC-Ingestion selbst
   (die hat ihre eigene Python-Suite: python3 scripts/quant/cli.py test).

   Gegenstand hier:
     - Der Adapter erfuellt FundamentalDataProvider und laesst sich in die
       Registry aufnehmen.
     - Was er liefert, validiert gegen quant/engines/schema.js — kein
       unbekanntes Feld, keine Vendor-Leakage.
     - Die Point-in-Time-Regel ist die des Systems (availableAt <= asOf) und
       keine zweite, mitgebrachte.
     - Die drei Qualifikations-Gates aus quant/engines/gate-tests.js laufen
       gegen den Adapter. Gate B faellt durch, und das ist die richtige
       Antwort: die SEC fuehrt kein historisches Universum.

   DATENLAGE: die Fixture ist SYNTHETISCH und stammt aus der Python-Pipeline
   (scripts/quant/sec/canonical.py). Sie belegt Schema-Konformitaet und
   Vertragstreue — sie belegt NICHT, wie sich echte SEC-Daten verhalten. Der
   Live-Abruf gegen data.sec.gov hat noch nicht stattgefunden.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);

const Provider = require("../engines/provider.js");
const Schema = require("../engines/schema.js");
const Capabilities = require("../engines/capabilities.js");
const Gates = require("../engines/gate-tests.js");
const Adapter = require("../../providers/sec/adapter.js");

const FIXTURE = JSON.parse(
  readFileSync(new URL("./fixtures/sec-canonical-synthetic.json", import.meta.url), "utf8")
);
const BUNDLES = FIXTURE.bundles;
const CALENDAR = BUNDLES.find((b) => b.security.ticker === "SYNA");
const BANK = BUNDLES.find((b) => b.security.ticker === "SYNB");

function makeProvider(bundles) {
  return Adapter.createSecProvider({ loadAll: () => bundles || BUNDLES });
}

/* ------------------------------------------------- Interface und Registry */

test("SEC-Adapter erfuellt FundamentalDataProvider vollstaendig", () => {
  assert.deepEqual(
    Provider.missingMethods("FundamentalDataProvider", makeProvider()), []);
});

test("SEC-Adapter laesst sich in die Provider-Registry aufnehmen", () => {
  const registry = Provider.createRegistry();
  registry.register("FundamentalDataProvider", makeProvider());
  assert.ok(registry.has("FundamentalDataProvider"));
});

test("SEC-Adapter beansprucht kein Interface, das er nicht erfuellt", () => {
  const provider = makeProvider();
  assert.equal(Provider.implementsInterface("MarketDataProvider", provider), false);
  assert.equal(Provider.implementsInterface("EstimateDataProvider", provider), false);
  assert.equal(Provider.implementsInterface("CorporateActionsProvider", provider), false);
});

/* --------------------------------------------------- Kanonisches Schema */

test("jede gelieferte Kennzahl validiert als FundamentalFact", () => {
  const res = makeProvider().getFacts(CALENDAR.security.securityId, { asOf: "2026-01-01" });
  assert.equal(res.available, true);
  assert.ok(res.data.length > 0);
  for (const fact of res.data) {
    const check = Schema.validate("FundamentalFact", fact);
    assert.equal(check.valid, true, check.errors.join("; "));
  }
});

test("jedes gelieferte Filing validiert als Filing", () => {
  const res = makeProvider().getFilings(CALENDAR.security.securityId, {});
  assert.equal(res.available, true);
  assert.ok(res.data.length > 0);
  for (const filing of res.data) {
    const check = Schema.validate("Filing", filing);
    assert.equal(check.valid, true, check.errors.join("; "));
  }
});

test("die Security validiert als Security", () => {
  for (const bundle of BUNDLES) {
    const check = Schema.validate("Security", bundle.security);
    assert.equal(check.valid, true, check.errors.join("; "));
  }
});

test("keine Vendor-Leakage oberhalb des Adapters", () => {
  const res = makeProvider().getFacts(CALENDAR.security.securityId, { asOf: "2026-01-01" });
  assert.deepEqual(Provider.findVendorLeakage(res.data, "$facts"), []);
  assert.deepEqual(Provider.findVendorLeakage(BUNDLES.map((b) => b.security), "$sec"), []);
});

test("kein SEC-Begriff erreicht das kanonische Modell", () => {
  const res = makeProvider().getFacts(CALENDAR.security.securityId, { asOf: "2026-01-01" });
  const keys = new Set();
  for (const fact of res.data) Object.keys(fact).forEach((k) => keys.add(k));
  for (const forbidden of ["cik", "accession", "concept", "taxonomy", "xbrl", "form"]) {
    assert.equal([...keys].some((k) => k.toLowerCase().includes(forbidden)), false,
      `Feld mit '${forbidden}' im kanonischen Record`);
  }
});

/* ----------------------------------------------------- Point in Time */

test("die Zugriffsregel ist availableAt <= asOf", () => {
  const provider = makeProvider();
  const all = CALENDAR.facts;
  const cutoff = "2019-06-30";
  const res = provider.getFacts(CALENDAR.security.securityId, { asOf: cutoff });
  for (const fact of res.data) assert.ok(fact.availableAt <= cutoff);
  /* Und es gibt tatsaechlich spaetere Fakten, die zurueckgehalten wurden -
     sonst wuerde der Test auch bei einem Adapter bestehen, der nichts filtert. */
  assert.ok(all.some((f) => f.availableAt > cutoff));
});

test("ein frueherer Stichtag liefert nie mehr als ein spaeterer", () => {
  const provider = makeProvider();
  const early = provider.getFacts(CALENDAR.security.securityId, { asOf: "2018-01-01" });
  const late = provider.getFacts(CALENDAR.security.securityId, { asOf: "2026-01-01" });
  const earlyCount = early.available ? early.data.length : 0;
  assert.ok(earlyCount < late.data.length);
});

test("vor jeder Veroeffentlichung liefert der Adapter unavailable statt leer", () => {
  const res = makeProvider().getFacts(CALENDAR.security.securityId, { asOf: "1990-01-01" });
  assert.equal(res.available, false);
  assert.ok(res.reason);
  assert.equal(res.data, null);
});

test("dieselbe Auswahl wie Schema.latestKnownFact", () => {
  const asOf = "2024-06-30";
  const res = makeProvider().getFacts(CALENDAR.security.securityId,
    { asOf, metricId: "revenue" });
  const expected = Schema.latestKnownFact(CALENDAR.facts, "revenue", asOf);
  assert.equal(res.data[0].periodEnd, expected.periodEnd);
  assert.equal(res.data[0].value, expected.value);
});

test("Filings werden ebenfalls am Stichtag abgeschnitten", () => {
  const res = makeProvider().getFilings(CALENDAR.security.securityId, { asOf: "2019-06-30" });
  for (const filing of res.data) assert.ok(filing.filedAt <= "2019-06-30");
});

/* -------------------------------------------------------- Restatements */

test("eine Korrektur ist erst ab ihrer eigenen Veroeffentlichung sichtbar", () => {
  const provider = makeProvider();
  const id = CALENDAR.security.securityId;
  const revisions = CALENDAR.facts.filter(
    (f) => f.metricId === "revenue" && f.restatementStatus === "restated");
  assert.ok(revisions.length > 0, "Fixture muss einen Restatement-Fall enthalten");

  const revision = revisions[0];
  const dayBefore = new Date(Date.parse(revision.availableAt) - 86400000)
    .toISOString().slice(0, 10);

  const before = provider.getFacts(id, { asOf: dayBefore, metricId: "revenue",
                                         periodEnd: revision.periodEnd });
  const after = provider.getFacts(id, { asOf: revision.availableAt, metricId: "revenue",
                                        periodEnd: revision.periodEnd });
  assert.equal(before.data[0].restatementStatus, "original");
  assert.equal(after.data[0].restatementStatus, "restated");
  assert.notEqual(before.data[0].value, after.data[0].value);
});

test("revisionId zaehlt ab 0 und der Originalwert bleibt erhalten", () => {
  /* Regression aus dem Live-Lauf: der Revisionsstand wurde pro Schleifendurchlauf
     statt pro (metricId, periodEnd) gefuehrt. Bei Instant-Kennzahlen wandert das
     Periodenende mit jedem Filing (Cover-Datum), also bekam die ERSTE Beobachtung
     einer neuen Periode revisionId 1 und den Status "restated" — eine Korrektur,
     die es nie gab. Gemessen an echten SEC-Daten: bis zu sechs solcher Zellen je
     Unternehmen, alle auf sharesOutstanding. */
  for (const bundle of BUNDLES) {
    const byCell = new Map();
    for (const fact of bundle.facts) {
      const key = `${fact.metricId}|${fact.fiscalYear}|${fact.fiscalPeriod}|${fact.periodEnd}`;
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key).push(fact);
    }
    for (const [key, facts] of byCell) {
      facts.sort((a, b) => a.revisionId - b.revisionId);
      assert.equal(facts[0].revisionId, 0,
        `${bundle.security.ticker} ${key}: niedrigste revisionId ist nicht 0`);
      assert.equal(facts[0].restatementStatus, "original",
        `${bundle.security.ticker} ${key}: erste Beobachtung ist als restated markiert`);
      /* Und die Nummerierung darf keine Luecken haben. */
      facts.forEach((f, i) => assert.equal(f.revisionId, i,
        `${bundle.security.ticker} ${key}: revisionId springt`));
    }
  }
});

test("eine einzelne Beobachtung ist nie eine Korrektur", () => {
  for (const bundle of BUNDLES) {
    const counts = new Map();
    for (const fact of bundle.facts) {
      const key = `${fact.metricId}|${fact.fiscalYear}|${fact.fiscalPeriod}|${fact.periodEnd}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    for (const fact of bundle.facts) {
      if (fact.restatementStatus !== "restated") continue;
      const key = `${fact.metricId}|${fact.fiscalYear}|${fact.fiscalPeriod}|${fact.periodEnd}`;
      assert.ok(counts.get(key) > 1,
        `${bundle.security.ticker} ${key}: als restated markiert, aber einzige Beobachtung`);
    }
  }
});

test("aufeinanderfolgende Revisionen einer Zelle wiederholen keinen Wert", () => {
  /* Derselbe Fehler erzeugte auch Doppel-Revisionen mit identischem Wert
     (NVDA sharesOutstanding: 2464 -> 2464). Eine unveraenderte Zahl erneut zu
     melden ist keine neue Revision. */
  for (const bundle of BUNDLES) {
    const byCell = new Map();
    for (const fact of bundle.facts) {
      const key = `${fact.metricId}|${fact.fiscalYear}|${fact.fiscalPeriod}|${fact.periodEnd}`;
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key).push(fact);
    }
    for (const [key, facts] of byCell) {
      facts.sort((a, b) => a.revisionId - b.revisionId);
      for (let i = 1; i < facts.length; i++) {
        assert.notEqual(facts[i].value, facts[i - 1].value,
          `${bundle.security.ticker} ${key}: Revision ${i} wiederholt den Vorwert`);
      }
    }
  }
});

/* ------------------------------------------ Qualifikations-Gates (Phase 3) */

test("Gate A: der damals gemeldete Wert ist rekonstruierbar", async () => {
  const revision = CALENDAR.facts.find(
    (f) => f.metricId === "revenue" && f.restatementStatus === "restated");
  const before = new Date(Date.parse(revision.availableAt) - 86400000)
    .toISOString().slice(0, 10);
  const result = await Gates.gateA(makeProvider(), {
    securityId: CALENDAR.security.securityId,
    periodEnd: revision.periodEnd,
    metricId: "revenue",
    beforeRestatement: before,
    afterRestatement: revision.availableAt
  });
  assert.equal(result.result, "PASSED", result.message);
});

test("Gate C: Verfuegbarkeitszeitpunkte sind echt und sperren die Zukunft", async () => {
  const result = await Gates.gateC(makeProvider(), {
    securityId: CALENDAR.security.securityId,
    asOf: "2024-06-30"
  });
  assert.equal(result.result, "PASSED", result.message);
});

test("Gate B faellt durch — und das ist die ehrliche Antwort", async () => {
  const result = await Gates.gateB(makeProvider(), {
    securityId: CALENDAR.security.securityId,
    duringListing: "2018-06-30",
    afterDelisting: "2026-01-01"
  });
  assert.equal(result.result, "FAILED");
  assert.match(result.message, /historischen Universum/);
  assert.equal(result.evidence.inHistoricalUniverse, false);
});

test("kein Gate wird kuenstlich auf PASSED gehoben", async () => {
  const revision = CALENDAR.facts.find(
    (f) => f.metricId === "revenue" && f.restatementStatus === "restated");
  const before = new Date(Date.parse(revision.availableAt) - 86400000)
    .toISOString().slice(0, 10);
  const report = await Gates.runGateTests(makeProvider(), {
    GATE_A_RESTATEMENT: {
      securityId: CALENDAR.security.securityId, periodEnd: revision.periodEnd,
      metricId: "revenue", beforeRestatement: before,
      afterRestatement: revision.availableAt
    },
    GATE_B_DELISTING: {
      securityId: CALENDAR.security.securityId,
      duringListing: "2018-06-30", afterDelisting: "2026-01-01"
    },
    GATE_C_AVAILABILITY: { securityId: CALENDAR.security.securityId, asOf: "2024-06-30" }
  });
  assert.equal(report.gates.GATE_A_RESTATEMENT.result, "PASSED");
  assert.equal(report.gates.GATE_C_AVAILABILITY.result, "PASSED");
  assert.equal(report.gates.GATE_B_DELISTING.result, "FAILED");
  assert.equal(report.allPassed, false, "SEC darf nicht alle drei Gates bestehen");
  assert.equal(report.passed, 2);
  /* Kein SKIPPED: alle drei wurden tatsaechlich ausgefuehrt. */
  assert.equal(report.verificationLevel, "RUNTIME_VERIFIED");
});

/* ------------------------------------------------------- Faehigkeiten */

test("Faehigkeiten stammen aus dem gemeinsamen Provider-Profil", () => {
  const caps = makeProvider().capabilities;
  assert.equal(caps.providerId, "sec-edgar");
  assert.equal(caps.sets.fundamental.pointInTime, true);
  assert.equal(caps.sets.fundamental.restatements, true);
  assert.equal(caps.sets.fundamental.historicalUniverse, false);
  assert.equal(caps.sets.market.daily, false);
  assert.equal(caps.sets.market.historicalDaily, false);
  assert.equal(caps.sets.reference.historicalMembership, false);
});

test("'nicht geprueft' bleibt null und wird nie zu false", () => {
  const caps = makeProvider().capabilities;
  assert.equal(caps.sets.fundamental.delistedSecurities, null);
  assert.equal(Capabilities.explicitlyMissing(caps, "fundamental", "delistedSecurities"), false);
  assert.equal(Capabilities.explicitlyMissing(caps, "fundamental", "historicalUniverse"), true);
});

test("ein unlesbares Profil ergibt ungeprueft, nicht 'kann es nicht'", () => {
  const caps = Adapter.declaredCapabilities("/nonexistent/profiles.json");
  assert.equal(caps.sets.fundamental.pointInTime, null);
  assert.equal(caps.sets.fundamental.historicalUniverse, null);
});

/* ------------------------------------------------- Sektor und Gesundheit */

test("fuer eine Bank fehlen die strukturell undefinierten Kennzahlen", () => {
  const industrial = new Set(CALENDAR.coverage.metricIds);
  const bank = new Set(BANK.coverage.metricIds);
  assert.ok(industrial.has("netDebt"));
  assert.equal(bank.has("netDebt"), false);
  assert.equal(bank.has("investedCapital"), false);
  /* Aber die Kennzahlen, die auch fuer eine Bank definiert sind, fehlen nicht. */
  assert.ok(bank.has("revenue") && bank.has("netIncome") && bank.has("totalAssets"));
});

test("ohne ingestierte Daten meldet der Adapter not_configured statt Erfolg", () => {
  const empty = Adapter.createSecProvider({ loadAll: () => [] });
  assert.equal(empty.healthCheck().status, "not_configured");
  const res = empty.getFacts("sec_SYNA", { asOf: "2026-01-01" });
  assert.equal(res.available, false);
  assert.ok(res.reason);
});

test("mit Daten meldet der Adapter ok", () => {
  assert.equal(makeProvider().healthCheck().status, "ok");
});

test("das Fact-Panel liefert dieselben Werte wie Einzelabfragen", () => {
  const provider = makeProvider();
  const asOf = "2024-06-30";
  const panel = provider.getFactPanel(BUNDLES.map((b) => b.security.securityId), { asOf });
  assert.equal(panel.available, true);
  for (const bundle of BUNDLES) {
    const single = provider.getFacts(bundle.security.securityId, { asOf });
    assert.deepEqual(panel.data.rows[bundle.security.securityId], single.data);
  }
});

test("periodEnd ist je Kennzahl eindeutig — sonst kollidiert die PIT-Auswahl", () => {
  /* Der wichtigste Fund des Live-Laufs. quant/engines/schema.js schluesselt eine
     Kennzahl ueber metricId + periodEnd (latestKnownFact / latestKnownPeriods);
     fiscalPeriod ist gespeichert, aber NICHT Teil des Schluessels. Ein
     Jahreswert und der zugehoerige Q4-Wert teilen sich dasselbe periodEnd —
     zwoelf Monate Umsatz und drei Monate Umsatz im selben Slot. Die Engine
     wuerde stillschweigend einen von beiden waehlen. Deshalb liefert der
     kanonische Export ausschliesslich Quartale. */
  for (const bundle of BUNDLES) {
    const seen = new Map();
    for (const fact of bundle.facts) {
      const key = `${fact.metricId}|${fact.periodEnd}`;
      const prev = seen.get(key);
      if (prev !== undefined) {
        assert.equal(fact.fiscalPeriod, prev,
          `${bundle.security.ticker} ${key}: ${prev} und ${fact.fiscalPeriod} teilen ein periodEnd`);
      } else {
        seen.set(key, fact.fiscalPeriod);
      }
    }
  }
});

test("der kanonische Export liefert nur Quartale, keine Jahreszeilen", () => {
  for (const bundle of BUNDLES) {
    for (const fact of bundle.facts) {
      assert.match(fact.fiscalPeriod, /^Q[1-4]$/,
        `${bundle.security.ticker}: fiscalPeriod ${fact.fiscalPeriod} im kanonischen Export`);
    }
  }
});

test("ein Quartal traegt genau ein Periodenende", () => {
  /* Live gemessen: 113 von 3613 Zellen trugen mehrere Periodenenden unter einem
     Quartalslabel — 86 davon auf sharesOutstanding (Cover-Datum des Filings
     statt Bilanzstichtag), der Rest aus Kalender-Mehrdeutigkeit in den ersten
     duennen XBRL-Jahren. Zwei verschiedene Quartale unter einem Label sind
     keine Daten, sondern eine stille Verwechslung. */
  for (const bundle of BUNDLES) {
    const ends = new Map();
    for (const fact of bundle.facts) {
      const key = `${fact.metricId}|${fact.fiscalYear}|${fact.fiscalPeriod}`;
      if (!ends.has(key)) ends.set(key, new Set());
      ends.get(key).add(fact.periodEnd);
    }
    for (const [key, set] of ends) {
      assert.equal(set.size, 1,
        `${bundle.security.ticker} ${key}: ${set.size} verschiedene Periodenenden`);
    }
  }
});

test("unterdrueckte Zellen werden benannt, nicht verschwiegen", () => {
  for (const bundle of BUNDLES) {
    assert.ok(Array.isArray(bundle.periodEndConflicts));
    assert.equal(bundle.coverage.suppressedCells, bundle.periodEndConflicts.length);
    for (const conflict of bundle.periodEndConflicts) {
      assert.equal(conflict.reason, "AMBIGUOUS_PERIOD_END");
      assert.ok(conflict.periodEnds.length > 1);
      /* Und die unterdrueckte Zelle darf wirklich nicht mehr in den Fakten stehen. */
      const still = bundle.facts.some((f) =>
        f.metricId === conflict.metricId && f.fiscalYear === conflict.fiscalYear
        && f.fiscalPeriod === conflict.fiscalPeriod);
      assert.equal(still, false, `${conflict.metricId} wurde gemeldet, ist aber noch da`);
    }
  }
});

test("Kennzahlen ohne SEC-Quelle werden benannt statt verschwiegen", () => {
  for (const bundle of BUNDLES) {
    assert.ok(bundle.unsupportedMetrics.ebitda);
    assert.ok(bundle.unsupportedMetrics.dividendPerShare);
    assert.equal(bundle.coverage.metricIds.includes("ebitda"), false);
  }
});

test("die Fixture ist als synthetisch gekennzeichnet", () => {
  assert.match(FIXTURE._note, /SYNTHETIC/);
  for (const bundle of BUNDLES) assert.equal(bundle.dataSource.isMock, false);
});
