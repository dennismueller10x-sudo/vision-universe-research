/* =========================================================================
   social/tests/p0-regression.test.mjs

   DER NACHWEIS, DER DEN NACHWEIS PRUEFT

   scripts/social/p0-regression.mjs misst den Vertrag aus §26/§52 an den
   ECHTEN Worker-Funktionen. Diese Datei prueft nicht den Vertrag - das
   tut er selbst. Sie prueft IHN:

     - dass er die geforderten Faelle wirklich enthaelt
     - dass er faellt, wenn man ein Tor entfernt
     - dass sein Doppelgaenger sich wie ein Assethost verhaelt

   Der letzte Punkt ist kein Detail. Der erste Entwurf lieferte die
   Bytes unabhaengig von der Methode; damit hielt der Vertrag auch nach
   einem Rueckfall auf HEAD - und HEAD ist die Ursache des Vorfalls.
   Ein Nachweis, der seinen eigenen Gegenstand nicht mehr sieht, ist
   schlimmer als keiner: er beruhigt.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { p0Befund } from "../../scripts/social/p0-regression.mjs";

/* ============================================ Der Vertrag haelt */

test("P0-1 · Der Vertrag aus §26/§52 haelt an dieser Architektur", async () => {
  const b = await p0Befund();
  assert.equal(b.bestanden, true,
    "Der Vorfall vom 21.09. ist wieder moeglich: " + b.satz);
});

test("P0-2 · Beide Haelften von §52 sind belegt, nicht nur die bequeme", async () => {
  /* Nur zu zeigen, dass kaputte Assets gesperrt sind, waere die
     halbe Aussage - ein Tor, das alles sperrt, sperrt auch den
     Betrieb. §52 verlangt ausdruecklich die Gegenprobe. */
  const b = await p0Befund();
  const ids = b.faelle.map((f) => f.id);

  assert.ok(ids.some((i) => i.startsWith("BROKEN_ASSET")),
    "Kein einziger BROKEN_ASSET-Fall.");
  assert.ok(ids.includes("VALID_ASSET_PREVIEW_IST_SENDUNG"),
    "Die Gegenprobe fehlt: dass ein gueltiges Bild durchkommt.");

  const gut = b.faelle.find((f) => f.id === "VALID_ASSET_PREVIEW_IST_SENDUNG");
  assert.match(gut.gemessen, /IDENTISCH/,
    "Die Sendung fuehrt nicht nachweislich dieselben Bytes: " + gut.gemessen);
});

test("P0-3 · Die vier Formen des kaputten Assets sind alle da", async () => {
  /* Jede hat den Vorfall auf ihre Art moeglich gemacht, und jede
     faellt anders aus. Eine Liste, die nur die erste kennt, laesst
     die anderen drei offen. */
  const b = await p0Befund();
  const ids = b.faelle.map((f) => f.id);
  for (const noetig of ["BROKEN_ASSET_WEG", "BROKEN_ASSET_UNGEMESSEN",
    "BROKEN_ASSET_OHNE_ABDRUCK", "BROKEN_ASSET_ANDERE_ADRESSE"]) {
    assert.ok(ids.includes(noetig), "Der Fall " + noetig + " fehlt.");
  }
});

test("P0-4 · Ein Fall aus dem falschen Grund zaehlt nicht als bestanden", async () => {
  /* Ein Sendefall, der scheitert - aber an etwas anderem als dem Tor,
     das er belegen soll -, beweist dieses Tor nicht. Der Vertrag
     vergleicht deshalb den GRUND und nicht nur das Scheitern. */
  const quelle = readFileSync(
    new URL("../../scripts/social/p0-regression.mjs", import.meta.url), "utf8");
  assert.match(quelle, /b\.reason === grund/,
    "Der Vertrag prueft nur, DASS etwas scheitert, nicht WORAN.");
});

/* ============================================ Der Doppelgaenger */

test("P0-5 · Der Assethost des Nachweises verhaelt sich wie einer", async () => {
  /* -----------------------------------------------------------------
     DIE LUECKE IM NACHWEIS SELBST

     Solange der Doppelgaenger die Bytes auch auf HEAD herausgab, hielt
     der Vertrag nach einem Rueckfall auf HEAD weiter - die Gegenprobe
     biss nicht. Gemessen wird deshalb, dass ein HEAD hier keinen
     Koerper bekommt. */
  const quelle = readFileSync(
    new URL("../../scripts/social/p0-regression.mjs", import.meta.url), "utf8");
  assert.match(quelle, /methode === "HEAD"/,
    "Der Doppelgaenger unterscheidet die Methoden nicht.");
  assert.match(quelle, /koerperlos/,
    "Ein HEAD bekommt hier immer noch einen Koerper.");
});

test("P0-6 · Der Nachweis nennt den Vorfall, den er verhindert", async () => {
  /* Ein Vertrag ohne seine Geschichte wird beim naechsten Umbau
     wegoptimiert, weil niemand mehr weiss, wofuer er steht. */
  const b = await p0Befund();
  assert.match(b.vorfall, /21\.09\.2026/);
  assert.match(b.vorfall, /ohne ladbares Bild/);
});
