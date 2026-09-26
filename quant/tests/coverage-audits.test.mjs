/* =========================================================================
   DIE AUDITS MUESSEN IHRE EIGENE AUSSAGE TRAGEN.

   Vier Berichte sind entstanden, die sagen, was noch schliessbar ist und was
   nicht: die Deckungshebel, die Herkunft der Aktienzahl, die Herkunft der
   Gattung und das Dossier zur Zuordnungsluecke. Gepinnt werden hier NICHT
   ihre Zahlen - die sollen sich bewegen, wenn die Welt sich bewegt. Gehalten
   wird, dass jede Aussage ihren Beleg mitfuehrt: eine Luecke ohne Lage waere
   ein Auftrag ohne Grund, und eine Konfidenz ohne Beleg war genau der Fehler,
   der zu diesen Berichten gefuehrt hat.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const lies = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

test("jede gemessene Luecke traegt genau eine Lage und einen Beleg", () => {
  const pfad = "quant/data/product/coverage-levers-v1.json";
  if (!existsSync(join(ROOT, pfad))) return;
  const b = lies(pfad);
  assert.equal(b.schemaVersion, "coverage-levers-1.0.0");
  assert.deepEqual(Object.keys(b.cases).sort(), ["A", "B", "C", "D", "E"]);
  assert.ok(Array.isArray(b.gaps) && b.gaps.length > 5);
  for (const g of b.gaps) {
    assert.ok(["A", "B", "C", "D", "E"].includes(g.case), g.area + ": Lage '" + g.case + "'");
    assert.ok(g.area && g.finding && g.finding.length > 20, g.area + ": kein Befund");
    assert.ok(typeof g.evidence === "string" && g.evidence.length > 20, g.area + ": kein Beleg");
    assert.equal(typeof g.titles, "number");
    assert.equal(typeof g.internallyClosable, "boolean");
    /* Nur A und B duerfen als automatisch schliessbar gelten. */
    if (g.internallyClosable) assert.ok(["A", "B"].includes(g.case), g.area + ": Lage " + g.case + " als schliessbar markiert");
  }
  /* Was als noch schliessbar gilt, muss auch Titel haben - eine leere Liste
     mit einem Versprechen waere schlimmer als keine Liste. */
  for (const g of b.AUTOMATICALLY_REPAIRABLE_REMAINING || []) {
    assert.ok(g.titles > 0, g.area + ": als schliessbar gefuehrt, betrifft aber keinen Titel");
  }
  assert.ok(b.conclusion && b.conclusion.length > 30);
});

test("die Herkunft der Aktienzahl nennt die Luecke und raet nichts", () => {
  const pfad = "quant/data/product/share-count-provenance-v1.json";
  if (!existsSync(join(ROOT, pfad))) return;
  const b = lies(pfad);
  assert.equal(b.DATA_CONTRACT_GAP.state, "OPEN");
  /* Das Konzept ist die entscheidende fehlende Angabe. */
  assert.ok(b.DATA_CONTRACT_GAP.missing.includes("concept"));
  assert.ok(b.DATA_CONTRACT_GAP.whyNotHeuristic.length > 40);
  /* Jede als vermischt gefuehrte Reihe nennt mehr als eine Konzeptklasse UND
     die Konzepte selbst - sonst waere die Behauptung nicht nachpruefbar. */
  for (const z of b.MIXED_CONCEPT_SERIES || []) {
    assert.ok(z.classes.length > 1, z.ticker + "|" + z.metric + ": als vermischt gefuehrt, aber eine Klasse");
    assert.ok(z.concepts.length > 1, z.ticker + "|" + z.metric + ": keine zwei Konzepte");
    for (const c of z.concepts) assert.ok(/^(us-gaap|dei|ifrs-full):/.test(c), "kein Taxonomiepraefix: " + c);
  }
  /* Und eine harmlose Reihe hat genau eine Klasse. */
  for (const z of b.SAME_CLASS_DIFFERENT_CONCEPT || []) {
    assert.equal(z.classes.length, 1, z.ticker + "|" + z.metric);
  }
  /* Die Reichweite des Belegs steht dabei - vier belegte Reihen sind kein
     universumsweiter Befund, und der Bericht darf das nicht verwischen. */
  assert.ok(b.evidenceReach.issuersWithRawProvenance > 0);
  assert.ok(b.evidenceReach.issuersWithConsumerExport > b.evidenceReach.issuersWithRawProvenance);
});

test("keine Gattung traegt HIGH ohne Beleg, und der Bericht sagt woran das haengt", () => {
  const pfad = "quant/data/product/security-type-provenance-v1.json";
  if (!existsSync(join(ROOT, pfad))) return;
  const b = lies(pfad);
  assert.equal(b.HIGH_CONFIDENCE_WITHOUT_EVIDENCE, 0);
  assert.deepEqual(b.examplesWithoutEvidence, []);
  /* Jede vorkommende Belegart ist erklaert. */
  for (const basis of Object.keys(b.byBasis)) {
    assert.ok(b.evidenceKinds[basis], "Belegart ohne Erklaerung: " + basis);
  }
  /* Und die abhaengigen Funktionen sind benannt - der Grund, warum der TYP
     nicht angetastet wurde. */
  assert.ok((b.dependentFunctions || []).length >= 4);
  const konfidenz = b.dependentFunctions.find((f) => f.field === "securityTypeConfidence");
  assert.ok(konfidenz, "die Abhaengigkeit der Konfidenz selbst fehlt");
  assert.match(konfidenz.consumer, /keiner/);
});

test("das Dossier ist ohne Zugang benutzbar und veroeffentlicht keine Regel", () => {
  const pfad = "quant/data/providers/sec-mapping-dossier-v1.json";
  if (!existsSync(join(ROOT, pfad))) return;
  const b = lies(pfad);
  assert.equal(b.state, "BLOCKED_EXTERNAL_NETWORK");
  assert.equal(b.whatIsMissing.host, "data.sec.gov");
  assert.ok(b.issuers.length > 100);
  for (const e of b.issuers.slice(0, 50)) {
    assert.match(String(e.cik), /^\d{10}$/, "CIK nicht abrufbereit: " + e.cik);
    assert.ok(e.rawFacts > 0, e.cik + ": als betroffen gefuehrt, aber ohne rohe Tatsachen");
    assert.equal(e.mapped, 0);
  }
  /* Die heutige Registry steht dabei - ohne sie kann ein neuer Beleg nicht
     gegen den Bestand geprueft werden. */
  assert.ok(Object.keys(b.registryCoverageToday).length > 20);
  assert.ok((b.procedureWhenAccessExists || []).length >= 4);
  /* Und es enthaelt ausdruecklich KEINE Zuordnung: kein Feld, das ein Konzept
     einer Kennzahl zuweist. */
  assert.equal("proposedMappings" in b, false);
  assert.equal("newConcepts" in b, false);
  assert.match(b.doNotDo, /ohne Rohbeleg/);
});
