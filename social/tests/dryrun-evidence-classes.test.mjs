/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/dryrun-evidence-classes.test.mjs

   ZWEI KLASSEN, GETRENNT GEFUEHRT UND ZUSAMMEN GEZEIGT

   Der Dry Run laeuft gegen den ECHTEN Bestand - keine Fixtures. Das ist
   Absicht: er soll aufhoeren zu stimmen, wenn die Daten sich aendern,
   und nicht, wenn jemand die Fixture vergisst.

   Der Anlass fuer diese Datei war ein Befund, der genau so entstand.
   Der Lauf meldete "0 eigene Messungen", waehrend 25 gemessene
   Beitraege im Repository lagen: gelesen wurde `entries`, die Datei
   heisst ihre Liste `snapshots`, und ein `|| []` machte aus dem
   Fehlgriff eine Null. Die Folge war keine Kleinigkeit - platformFit
   galt als systemisch unmessbar, und der Lauf meldete
   PLATFORM_FIT_INTELLIGENCE_UNAVAILABLE auf Daten, die da waren.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dryRun, leseLeistung, LEISTUNGSLISTEN }
  from "../../scripts/social/rank-social-opportunities.mjs";

const R = dryRun();

/* ------------------------------------------- Die Klassen sind getrennt */

test("DR1 · Der Lauf weist beide Evidenzklassen getrennt aus", () => {
  const ec = R.evidenceClasses;
  assert.equal(ec.own.label, "OWN PERFORMANCE");
  assert.equal(ec.external.label, "EXTERNAL SOCIAL INTELLIGENCE");
  /* Getrennt heisst nicht unverbunden: beide gehen in dieselbe
     Rangfolge - nur nicht in dieselbe Zahl. */
  assert.equal(ec.combinedButNotMerged, true);
});

test("DR2 · Ohne aktive Quelle traegt die externe Dimension gar kein Gewicht", () => {
  /* -----------------------------------------------------------------
     DIESER TEST VERLANGTE FRUEHER EIN KLEINERES GEWICHT

     Er hiess "fremde Aufmerksamkeit wiegt leichter als eigene Messung"
     und verglich 0.08 gegen 0.14. Richtig, solange eine Quelle laeuft.

     Seit der Owner-Entscheidung laeuft keine. Ein Gewicht - auch ein
     kleines - waere dann ein Abzug fuer eine Entscheidung: das Thema
     saehe schlechter aus, weil jemand einen Schalter nicht umgelegt
     hat. Deshalb NOT_APPLIED und nicht 0.08 und erst recht nicht 0. */
  const w = R.evidenceClasses.weights;
  if (R.evidenceClasses.external.state === "NO_ACTIVE_EXTERNAL_SOURCE") {
    assert.equal(w.externalInterest, "NOT_APPLIED");
    assert.equal(R.evidenceClasses.external.carriesWeight, false);
  } else {
    /* Laeuft wieder eine Quelle, gilt die alte Aussage unveraendert. */
    assert.ok(w.externalInterest < w.audienceInterest,
      "Fremde Wirkung ist nicht unsere");
  }
});

test("DR2b · Eine abgeschaltete Quelle verschlechtert kein Ranking", () => {
  /* Der Auftrag woertlich: External darf weder Score noch Ranking
     kuenstlich verschlechtern. Geprueft am Grund, den jedes Thema
     mitfuehrt - NOT_ACTIVATED steht fuer "faellt aus der Rechnung",
     nicht fuer "fehlt dem Thema". */
  if (R.evidenceClasses.external.state !== "NO_ACTIVE_EXTERNAL_SOURCE") return;
  for (const b of R.ranked.slice(0, 5)) {
    const m = (b.missing || []).find((x) => x.dimension === "externalInterest");
    if (m) assert.equal(m.cause, "NOT_ACTIVATED", b.topic.topicId);
    assert.equal(b.externalIntelligenceState, "NOT_ACTIVE");
  }
});

test("DR3 · Die Dimensionen gehoeren je genau einer Klasse", () => {
  const ec = R.evidenceClasses;
  const doppelt = ec.own.dimensions.filter((d) => ec.external.dimensions.includes(d));
  assert.deepEqual(doppelt, [], "Keine Dimension darf in beiden Klassen stehen");
});

/* ------------------------------------ Der Befund, der diese Datei ausloeste */

test("DR4 · Gemessene Beitraege werden gezaehlt, nicht uebersehen", () => {
  /* Gegen den echten Bestand: liegt eine performance.json mit
     Schnappschuessen vor, MUSS der Lauf sie sehen. */
  const pfad = "social/data/performance.json";
  if (!existsSync(pfad)) return;
  const perf = JSON.parse(readFileSync(pfad, "utf8"));
  const zeilen = perf.snapshots || perf.entries || perf.measurements || [];
  if (!zeilen.length) return;
  assert.ok(R.evidenceClasses.own.measurements > 0,
    "Die Datei traegt " + zeilen.length + " Zeilen; der Lauf meldet " +
    R.evidenceClasses.own.measurements);
  assert.equal(R.evidenceClasses.own.source, "snapshots");
});

test("DR5 · Eine unbekannte Dateistruktur ist ein Befund, keine Null", () => {
  /* Gemessen, nicht im Quelltext nachgelesen: eine Datei MIT Inhalt,
     aus der keine bekannte Liste zu lesen ist, wirft. Sie still als 0
     zu lesen, hat schon einmal eine ganze Dimension verschwinden
     lassen. */
  assert.throws(() => leseLeistung({ generatedAt: "x", rows: [1, 2, 3] }),
    /keine der bekannten Listen/);
  /* Keine Datei ist dagegen wirklich nichts - und kein Fehler. */
  assert.deepEqual(leseLeistung(null).measured, []);
  assert.equal(leseLeistung(null).source, null);
});

test("DR5b · Jeder bekannte Listenname wird gefunden", () => {
  /* Der Fehlgriff war, dass genau EIN Name fehlte. Also werden alle
     geprueft, und der Name, der gefunden wurde, steht im Ergebnis. */
  for (const name of LEISTUNGSLISTEN) {
    const g = leseLeistung({ [name]: [{ window: "MATURE" }] });
    assert.equal(g.source, name);
    assert.equal(g.measured.length, 1);
    assert.equal(g.mature.length, 1);
  }
});

test("DR5c · Eine unverfuegbare Messung zaehlt nicht als gemessen", () => {
  const g = leseLeistung({ snapshots: [
    { snapshot: { state: "UNAVAILABLE", window: "MATURE" }, window: "MATURE" },
    { snapshot: { state: "VERIFIED", window: "EARLY" }, window: "EARLY" },
    { snapshot: { state: "VERIFIED", window: "MATURE" }, window: "MATURE" }
  ] });
  assert.equal(g.measured.length, 2);
  assert.equal(g.mature.length, 1);
});

test("DR6 · Reif und gemessen sind zwei verschiedene Zahlen", () => {
  const own = R.evidenceClasses.own;
  assert.equal(typeof own.measurements, "number");
  assert.equal(typeof own.mature, "number");
  assert.ok(own.mature <= own.measurements,
    "Reif ist eine Teilmenge von gemessen");
});

/* --------------------------------------- Was fehlt, wird richtig begruendet */

test("DR7 · Publikumsinteresse bleibt ungemessen — und der Grund ist der richtige", () => {
  /* Reichweite sagt, wie ein BEITRAG lief. Ob das Publikum nach einem
     THEMA fragt, sagt sie nicht. Frueher stand hier "es wurde noch
     nichts veroeffentlicht" - das stimmte einmal und wurde mit den
     ersten Messungen falsch. */
  const d = R.unavailableDimensions.find((x) => x.dimension === "audienceInterest");
  assert.ok(d);
  assert.doesNotMatch(d.reason, /noch nichts veroeffentlicht/);
  assert.match(d.reason, /THEMA/);
});

test("DR8 · Ohne externe Beobachtungen wird kein externes Interesse behauptet", () => {
  const n = R.evidenceClasses.external.observations;
  const mitWert = R.ranked.filter((b) => b.externalInterest &&
    b.externalInterest.available);
  if (n === 0) {
    assert.equal(mitWert.length, 0,
      "Ohne Beobachtungen darf kein Thema einen externen Wert tragen");
    for (const b of R.ranked.slice(0, 3)) {
      assert.match(b.externalInterest.explanation, /Abwesenheit|extern nichts/);
    }
  } else {
    /* Liegen welche vor, muss die Zuordnung ueber beobachtete Hashtags
       laufen - nie ueber Textaehnlichkeit. */
    for (const b of mitWert) {
      assert.ok((b.topic.observedHashtags || []).length > 0);
    }
  }
});

test("DR9 · Der Lauf veroeffentlicht nichts und prognostiziert nichts", () => {
  assert.equal(R.publishes, false);
  assert.equal(R.predictsPerformance, false);
  for (const b of R.ranked) assert.equal(b.predictsPerformance, false);
});

test("DR10 · Externes Interesse fehlt systemisch, nicht als Luecke des Themas", () => {
  /* Der Unterschied ist der ganze Punkt: eine neue Dimension darf
     bestehende Gelegenheiten nicht schlechter machen, ohne dass sich
     an ihnen etwas geaendert haette. */
  for (const b of R.ranked) {
    assert.equal(b.notApplicable.includes("externalInterest"), false,
      b.topic.topicId + ": die Frage stellt sich, sie ist nur unbeantwortet");
  }
});

/* ============================== §13: der Lauf aus den aktiven Quellen */

test("DR11 · Der Lauf laeuft ohne jede externe Quelle vollstaendig durch", () => {
  /* Der Kern der Entscheidung: 0..N Sensoren, nicht 1..N
     Abhaengigkeiten. Kein Sensor aktiv - und trotzdem eine Rangfolge. */
  assert.equal(R.externalIntelligence, "NO_ACTIVE_EXTERNAL_SOURCE");
  assert.ok(R.ranked.length > 0, "Ohne externe Quelle entsteht trotzdem eine Rangfolge");
  assert.ok(R.families && Object.keys(R.families).length >= 3,
    "Und sie ist breit, nicht auf Quant zurueckgefallen");
});

test("DR12 · Jede ruhende Quelle wird benannt, nicht verschwiegen", () => {
  assert.ok(R.externalSources.length >= 2);
  for (const q of R.externalSources) {
    assert.equal(q.state, "NOT_ACTIVATED_BY_OWNER", q.id);
    assert.equal(q.dormant, true, q.id);
    assert.ok(q.reason && q.reason.length > 10, q.id);
  }
});

test("DR13 · Own Performance erscheint je Lerndimension samt Abdeckung", () => {
  const op = R.ownPerformanceEvidence;
  assert.equal(op.dimensions.length, 12);
  for (const d of op.dimensions) {
    assert.equal(typeof d.coverage, "number");
    assert.equal(typeof d.evaluable, "boolean");
  }
  /* Und die Auswertung ist keine Prognose. */
  assert.equal(op.predictsPerformance, false);
});

test("DR14 · Warum Beitraege ohne Messwert sind, steht da", () => {
  /* "3 ungemessen" ist eine Zahl ohne Aussage. Der Unterschied
     zwischen "nicht veroeffentlicht" und "keine belastbare Basis"
     gehoert in den Bericht. */
  const gruende = R.ownPerformanceEvidence.unmeasuredReasons || [];
  if (gruende.length) {
    for (const g of gruende) {
      assert.ok(g.reason && g.reason.length > 5);
      assert.ok(g.count > 0);
    }
  }
});

test("DR15 · Explore/Exploit hat genau eine Antwort", () => {
  /* Zwei Rechnungen fuer dieselbe Frage waeren eine zu viel: die
     Saettigung beantwortet, ob eine FAMILIE ueberrepraesentiert ist -
     der Modus, ob ein Muster belastbar ist. */
  assert.ok(["EXPLORE_ONLY", "MIXED"].includes(R.exploreExploit.mode));
  if (R.exploreExploit.mode === "EXPLORE_ONLY") {
    assert.deepEqual(R.exploreExploit.exploit, []);
  }
});

test("DR16 · Jede Top-Gelegenheit traegt die verlangten Felder", () => {
  for (const b of R.ranked.slice(0, 3)) {
    const t = b.topic;
    assert.ok(t.title || t.topicId);
    assert.ok(t.family, "Content Family");
    assert.ok(t.entityType, "Entity Type");
    assert.ok(Array.isArray(t.sources) && t.sources.length, "Source");
    assert.ok(b.audienceFrame && b.audienceFrame.targetAudience, "Audience Framing");
    assert.ok(b.audienceFrame.suggestedHookStrategy, "Hook Strategy");
    assert.ok(b.audienceFrame.suggestedVisualStrategy, "Visual Strategy");
    assert.ok(b.evidenceCoverage, "Evidence Coverage");
    assert.ok(Array.isArray(b.drivers), "Opportunity Factors");
    assert.ok(b.components, "Own Performance Evidence je Thema");
    assert.ok(Array.isArray(b.missing), "UNAVAILABLE Dimensions");
    assert.equal(b.predictsPerformance, false);
  }
});

test("DR17 · Die Treiber nennen ihren Grund", () => {
  /* Abgefragt wurde einmal `explanation`; die Treiber tragen `reason`.
     Heraus kam eine Zeile mit Doppelpunkt und nichts dahinter - ein
     Faktor, der aussieht, als haette er keinen Grund. */
  for (const b of R.ranked.slice(0, 3)) {
    for (const d of b.drivers) {
      assert.ok(d.reason && d.reason.length > 3,
        b.topic.topicId + "/" + d.dimension + " ohne Grund");
    }
  }
});
