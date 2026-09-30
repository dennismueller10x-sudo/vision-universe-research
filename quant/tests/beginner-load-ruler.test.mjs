/* =========================================================================
   DAS LINEAL SELBST

   `measure-beginner-load.mjs` entscheidet, welche Seite als naechste
   umgebaut wird. Ein Lineal, das sich nach der Form der Seite biegt,
   lenkt die Arbeit auf die falsche Stelle - und niemand merkt es, weil
   die Zahl ja aus einer Messung kommt.

   ZWEI FEHLER HATTE ES BEREITS, BEIDE DERSELBEN ART: gemessen wurde ueber
   die Seite statt ueber das, was ein Mensch als Einheit liest.

   1. KLICKZIELE zaehlten Elemente in zugeklappten <details> mit, weil
      Chromium dafuer weiterhin ein Rechteck liefert. Gemessen: 436
      statt 237 - um 84 % zu hoch.

   2. LANGE SAETZE wurden ueber den zusammengepressten Seitentext
      getrennt (`text.split(/[.!?] /)`). Damit verschmolz jede
      Ueberschrift mit dem folgenden Absatz zu einem Satz, bis irgendwo
      ein Punkt kam. Gemessen fuer die Strategien-Seite: 11 statt 1.
      Die Zahl bestrafte Seiten dafuer, viele Bloecke zu haben.

   Aufgefallen ist der zweite Fehler nur, weil zwei Messungen sich
   widersprachen. Diese Tests halten beide Reparaturen fest - damit der
   naechste Umbau des Werkzeugs nicht still dieselbe Abkuerzung nimmt.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const QUELLE = readFileSync(join(ROOT, "scripts/vu2/measure-beginner-load.mjs"), "utf8");

test("Sätze werden je Textblock gezählt, nicht über die ganze Seite", () => {
  assert.doesNotMatch(QUELLE, /text\.split\(\/\[\.!\?\] \/\)/,
    "die Saetze werden wieder ueber den Seitentext getrennt - dann verschmelzen " +
    "Ueberschrift und Absatz zu einem langen Satz, den niemand geschrieben hat");
  assert.match(QUELLE, /querySelectorAll\('p,li,h1,h2,h3/,
    "es wird nicht mehr ueber Blockelemente gezaehlt");
  /* Verschachtelte Bloecke duerfen nicht doppelt zaehlen. */
  assert.match(QUELLE, /if \(b\.querySelector\(/,
    "ein Block, der weitere Bloecke enthaelt, wird mitgezaehlt - sein Text zaehlt dann zweimal");
});

test("nur sichtbares zählt — auch bei Sätzen und Klickzielen", () => {
  /* Der gemeinsame Nenner beider Fehler: was zugeklappt ist, liest
     niemand. Die Sichtbarkeitspruefung muss fuer beide Zaehlungen
     gelten. */
  assert.match(QUELLE, /checkVisibility/,
    "die Sichtbarkeitspruefung ist verschwunden - zugeklappte Inhalte zaehlen dann wieder mit");
  const satzteil = QUELLE.slice(QUELLE.indexOf("const bloecke"), QUELLE.indexOf("const langeSaetze"));
  assert.match(satzteil, /\.filter\(sichtbar\)/,
    "die Saetze werden ohne Sichtbarkeitspruefung gesammelt");
  const zielteil = QUELLE.slice(QUELLE.indexOf("const entscheidungen"));
  assert.match(zielteil.slice(0, 260), /\.filter\(sichtbar\)/,
    "die Klickziele werden ohne Sichtbarkeitspruefung gezaehlt");
});

test("die Begründung beider Reparaturen steht im Werkzeug", () => {
  /* Eine Messung, deren Fehlerklasse nur im Commit steht, wird beim
     naechsten Umbau wieder eingebaut. Die gemessenen Zahlen gehoeren an
     die Stelle, an der jemand die Abkuerzung wieder nehmen wuerde. */
  assert.match(QUELLE, /11 lange Saetze|11 statt 1/,
    "der gemessene Beleg fuer den Satz-Fehler fehlt im Werkzeug");
  assert.match(QUELLE, /Strategien/,
    "die Seite, an der der Fehler auffiel, ist nicht mehr genannt");
});
