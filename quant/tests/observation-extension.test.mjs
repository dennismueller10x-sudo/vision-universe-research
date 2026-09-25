/* =========================================================================
   EINE ERWEITERUNG IST KEIN UMSCHREIBEN - UND SONST NICHTS.

   Der Anlass, 25.09.2026: die Kalenderdeckung wurde von 2025-01-01 auf
   2022-01-01 erweitert, weil zwei Pruefungen Titel vollstaendig verworfen
   haben, deren 270-Bar-Fenster aus der Deckung herausreichte. 166 Titel
   bekamen dadurch erstmals ein Technical-Bundle - und die Setup-Beobachtung
   zum selben Stichtag 2026-09-10 hatte mehr Zeilen als die veroeffentlichte.
   Der Unveraenderlichkeitswaechter hat den ganzen Lauf abgebrochen
   (Lauf 36115714241): "a published past is not rewritten".

   In der Sache hatte er recht. Nur passierte das, was er schuetzt, gar
   nicht: keine veroeffentlichte Zeile aenderte sich, es kamen Zeilen HINZU.

   Diese Datei haelt die Ausnahme so eng, wie sie gemeint ist. Sie ist die
   Stelle, an der ein spaeterer Griff nach "dann eben ueberschreiben"
   auffaellt.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extensionVerdict } from "../../scripts/quant/build-setup-observations.mjs";

const SPALTEN = ["setupState", "invalidationPrice", "exitPrice"];
const veroeffentlicht = {
  columns: SPALTEN,
  rows: { AAA: ["WATCH", 80, null], BBB: ["FORMING", 41.5, 60], CCC: ["NONE", null, null] }
};
const mit = (rows, columns) => ({ columns: columns || SPALTEN, rows });

test("more titles at the same cutoff is an extension", () => {
  const verdict = extensionVerdict(veroeffentlicht,
    mit({ ...veroeffentlicht.rows, DDD: ["WATCH", 12, null], EEE: ["NONE", null, null] }));
  assert.equal(verdict.allowed, true);
  assert.deepEqual(verdict.added, ["DDD", "EEE"]);
  assert.deepEqual(verdict.changed, []);
});

test("a changed published row is refused, and named", () => {
  const verdict = extensionVerdict(veroeffentlicht,
    mit({ ...veroeffentlicht.rows, BBB: ["CONFIRMED", 41.5, 60], DDD: ["WATCH", 12, null] }));
  assert.equal(verdict.allowed, false);
  assert.deepEqual(verdict.changed, ["BBB"]);
  /* Der Grund nennt die Sache, nicht nur ein Nein. */
  assert.match(verdict.reason, /veroeffentlichte Zeile/);
});

test("a changed price on an unchanged state is still a changed row", () => {
  /* Der Zustand allein reicht nicht: die Invalidierungsmarke ist Teil der
     Aussage, und eine stillschweigend verschobene Marke waere genau die
     Sorte Umschreibung, die §40 ausschliesst. */
  const verdict = extensionVerdict(veroeffentlicht,
    mit({ ...veroeffentlicht.rows, AAA: ["WATCH", 81, null], DDD: ["WATCH", 12, null] }));
  assert.equal(verdict.allowed, false);
  assert.deepEqual(verdict.changed, ["AAA"]);
});

test("a disappeared row is refused - it is a changed statement, not a smaller one", () => {
  const { AAA, ...ohneAAA } = veroeffentlicht.rows;
  const verdict = extensionVerdict(veroeffentlicht, mit({ ...ohneAAA, DDD: ["WATCH", 12, null] }));
  assert.equal(verdict.allowed, false);
  assert.deepEqual(verdict.changed, ["AAA"]);
});

test("identical content is not an extension either", () => {
  /* Gleicher Inhalt kommt an dieser Stelle nie an (der Hash haette vorher
     gestimmt); wenn doch, ist die Antwort NEIN und nicht 'schreib halt'. */
  const verdict = extensionVerdict(veroeffentlicht, mit({ ...veroeffentlicht.rows }));
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /Kein Titel kommt hinzu/);
});

test("different columns are refused before any row is compared", () => {
  const verdict = extensionVerdict(veroeffentlicht,
    mit({ ...veroeffentlicht.rows, DDD: ["WATCH", 12, null] }, ["setupState", "invalidationPrice"]));
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /Spalten/);
});

test("the producer records the lineage instead of extending silently", () => {
  const source = new URL("../../scripts/quant/build-setup-observations.mjs", import.meta.url);
  const text = readFileSync(source, "utf8");
  /* Die Kette der Fassungen und die Zahl der neuen Titel stehen IM
     Artefakt - sonst waere die Erweiterung von aussen nicht nachrechenbar. */
  assert.match(text, /snapshot\.lineage = \[\.\.\.\(existing\.lineage \|\| \[\]\), existing\.contentHash\]/);
  assert.match(text, /snapshot\.extendedTickers = verdict\.added\.length/);
  /* Und der Hash wird NACH den neuen Feldern gebildet, nicht davor. */
  const nachher = text.indexOf("snapshot.contentHash = snapshotHash(snapshot);", text.indexOf("snapshot.lineage ="));
  assert.ok(nachher > 0, "der Inhaltshash wird nach der Erweiterung nicht neu gebildet");
});
