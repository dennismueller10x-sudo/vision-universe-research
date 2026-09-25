/* =========================================================================
   EINE VEROEFFENTLICHTE BEOBACHTUNG WIRD NICHT ANGEFASST - AUCH NICHT
   ERWEITERT.

   Der Anlass, 25.09.2026 (Lauf 36115714241): die Kalenderdeckung wurde von
   2025-01-01 auf 2022-01-01 erweitert, weil zwei Pruefungen Titel
   vollstaendig verworfen haben, deren 270-Bar-Fenster aus der Deckung
   herausreichte. 166 Titel bekamen dadurch erstmals ein Technical-Bundle -
   und die Setup-Beobachtung zum selben Stichtag 2026-09-10 hatte mehr
   Zeilen. Der Unveraenderlichkeitswaechter riss den ganzen Lauf mit.

   Der erste Versuch hier war, die harmlose Form zuzulassen: nur Zeilen
   hinzufuegen, keine aendern. Entschieden ist es aber schon, und zwar in
   build-factor-evidence.mjs, wo dieselbe Frage einmal einen ganzen Lauf
   gekostet hat: "a comparison point has to be a value that was PUBLISHED on
   that date, not one recomputed today." Danach ist auch eine Erweiterung
   eine Neuberechnung der Vergangenheit - die 166 Titel wurden an diesem
   Stichtag nicht veroeffentlicht.

   Also dieselbe Antwort an allen drei Stellen: die veroeffentlichte Datei
   bleibt, der Lauf laeuft weiter, die Abweichung wird gemessen und
   ausgewiesen. Diese Datei haelt fest, dass hier gemessen und nicht
   entschieden wird.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extensionVerdict } from "../../scripts/quant/build-setup-observations.mjs";

const root = new URL("../../", import.meta.url).pathname;
const SPALTEN = ["setupState", "invalidationPrice", "exitPrice"];
const veroeffentlicht = {
  columns: SPALTEN,
  rows: { AAA: ["WATCH", 80, null], BBB: ["FORMING", 41.5, 60], CCC: ["NONE", null, null] }
};
const mit = (rows, columns) => ({ columns: columns || SPALTEN, rows });

test("added titles are named as added, and only as added", () => {
  const verdict = extensionVerdict(veroeffentlicht,
    mit({ ...veroeffentlicht.rows, DDD: ["WATCH", 12, null], EEE: ["NONE", null, null] }));
  assert.equal(verdict.extendsOnly, true);
  assert.deepEqual(verdict.added, ["DDD", "EEE"]);
  assert.deepEqual(verdict.changed, []);
  assert.equal(verdict.columnsDiffer, false);
  /* Und trotzdem keine Erlaubnis: das Feld gibt es nicht mehr. */
  assert.equal("allowed" in verdict, false, "die Messung darf nichts erlauben");
});

test("a changed published row is counted, not permitted away", () => {
  const verdict = extensionVerdict(veroeffentlicht,
    mit({ ...veroeffentlicht.rows, BBB: ["CONFIRMED", 41.5, 60], DDD: ["WATCH", 12, null] }));
  assert.equal(verdict.extendsOnly, false);
  assert.deepEqual(verdict.changed, ["BBB"]);
  assert.deepEqual(verdict.added, ["DDD"]);
});

test("a changed price on an unchanged state is a changed row", () => {
  /* Der Zustand allein reicht nicht: die Invalidierungsmarke ist Teil der
     Aussage, und eine stillschweigend verschobene Marke waere genau die
     Sorte Umschreibung, die §40 ausschliesst. */
  const verdict = extensionVerdict(veroeffentlicht,
    mit({ ...veroeffentlicht.rows, AAA: ["WATCH", 81, null] }));
  assert.equal(verdict.extendsOnly, false);
  assert.deepEqual(verdict.changed, ["AAA"]);
});

test("a disappeared row counts as changed, not as nothing", () => {
  const { AAA, ...ohneAAA } = veroeffentlicht.rows;
  const verdict = extensionVerdict(veroeffentlicht, mit({ ...ohneAAA, DDD: ["WATCH", 12, null] }));
  assert.equal(verdict.extendsOnly, false);
  assert.deepEqual(verdict.changed, ["AAA"]);
});

test("different columns are reported as such", () => {
  const verdict = extensionVerdict(veroeffentlicht,
    mit({ ...veroeffentlicht.rows, DDD: ["WATCH", 12, null] }, ["setupState", "invalidationPrice"]));
  assert.equal(verdict.columnsDiffer, true);
  assert.equal(verdict.extendsOnly, false);
});

test("identical content is no extension", () => {
  const verdict = extensionVerdict(veroeffentlicht, mit({ ...veroeffentlicht.rows }));
  assert.equal(verdict.extendsOnly, false);
  assert.deepEqual(verdict.added, []);
  assert.deepEqual(verdict.changed, []);
});

test("the producer writes the published path only when nothing is there", () => {
  const source = readFileSync(new URL("../../scripts/quant/build-setup-observations.mjs", import.meta.url), "utf8");
  const stelle = source.indexOf("if (existsSync(snapshotPath))");
  assert.ok(stelle > 0, "die Verzweigung auf eine vorhandene Datei ist weg");
  const block = source.slice(stelle);
  const bisElse = block.slice(0, block.indexOf("  } else {"));
  /* Kein Schreibvorgang im Zweig "Datei ist da" - das ist die Garantie. */
  assert.equal(/writeFileSync\(snapshotPath/.test(bisElse), false,
    "der Zweig fuer eine vorhandene Beobachtung schreibt");
  /* Aber auch kein Abbruch mehr bei blosser Abweichung: nur Korruption. */
  const abbrueche = [...bisElse.matchAll(/throw new Error\(([^)]*)/g)].map((m) => m[1]);
  assert.equal(abbrueche.length, 1, "erwartet genau einen Abbruch (Korruption), gefunden: " + abbrueche.length);
  assert.match(abbrueche[0], /corrupt/);
  /* Und die Abweichung landet in der Zusammenfassung, nicht nur im Log. */
  assert.match(source, /summary\.observationDrift = observationDrift/);
});

test("once a build has written it, the shipped summary carries its shape", () => {
  /* Vor der naechsten Materialisierung fehlt das Feld noch - der Produzent
     ist die Garantie (Test darueber), nicht diese Datei. Ist es da, muss es
     stimmen: derselbe Stichtag, und der Satz, der sagt, warum die
     veroeffentlichte Beobachtung stehen bleibt. */
  const summary = JSON.parse(readFileSync(root + "quant/data/product/setup-observations-v1/summary.json", "utf8"));
  if (!("observationDrift" in summary)) return;
  if (!summary.observationDrift) return;
  assert.equal(summary.observationDrift.asOf, summary.asOf);
  assert.match(summary.observationDrift.note, /nicht durch eine heutige Neuberechnung ersetzt/);
  assert.ok(Number.isFinite(summary.observationDrift.rowsPublished));
  assert.ok(Number.isFinite(summary.observationDrift.rowsToday));
});
