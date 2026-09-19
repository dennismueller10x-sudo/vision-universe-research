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

test("DR2 · Fremde Aufmerksamkeit wiegt leichter als eigene Messung", () => {
  const w = R.evidenceClasses.weights;
  assert.ok(w.externalInterest < w.audienceInterest,
    "Fremde Wirkung ist nicht unsere");
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
