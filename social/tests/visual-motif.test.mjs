/* =========================================================================
   VU SOCIAL — Das Motiv folgt der Story (VM1-VM8)

   request-creative.mjs bat den Creative Agent bisher immer um dieselbe
   abstrakte Future-Tech-Szene, unabhaengig vom Symbol. Diese Tests halten
   fest, dass die Branche - aus der amtlichen SIC-Klassifikation, die
   ohnehin schon im Repository liegt - jetzt ein konkretes Motiv traegt,
   und dass ein unbekannter oder fehlender Code sicher auf den bisherigen
   generischen Rueckfall faellt statt etwas zu raten.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VisualMotif = require("../engines/visual-motif.js");

test("VM1 · Ein Halbleitertitel bekommt eine Halbleiter-Szene", () => {
  /* NVDA steht in der echten SIC-Taxonomie unter 3674 - dieselbe
     Klassifikation, mit der die SEC-Einreichung selbst arbeitet. */
  const m = VisualMotif.motivFuer("NVDA", ".");
  assert.equal(m.sic4, "3674");
  assert.equal(m.strategy, "SEMICONDUCTOR_WORLD");
  assert.match(m.instruction, /Halbleiterfertigung|Wafer/);
});

test("VM2 · Ein Energietitel bekommt eine Energie-Szene, nicht die generische", () => {
  const m = VisualMotif.motivFuer("XOM", ".");
  assert.equal(m.sic4, "2911");
  assert.match(m.instruction, /Energieinfrastruktur/);
  assert.notEqual(m.instruction, VisualMotif.STANDARD.instruction);
});

test("VM3 · Ein Fahrzeugtitel bekommt eine Fahrzeug-/Sensorwelt-Szene", () => {
  const m = VisualMotif.motivFuer("GM", ".");
  assert.equal(m.sic4, "3711");
  assert.equal(m.strategy, "ROBOTICS");
  assert.match(m.instruction, /Sensorwelt|Fahrzeug/);
});

test("VM4 · Ein Softwaretitel bekommt eine Rechenzentrums-/KI-Szene", () => {
  const m = VisualMotif.motivFuer("ADBE", ".");
  assert.equal(m.sic4, "7372");
  assert.equal(m.strategy, "AI_INFRASTRUCTURE");
});

test("VM5 · Ein unbekanntes Symbol faellt sicher auf den generischen Rueckfall - nichts wird geraten", () => {
  const m = VisualMotif.motivFuer("ZZZZ_KEIN_SYMBOL", ".");
  assert.equal(m.sic4, null);
  assert.equal(m.strategy, VisualMotif.STANDARD.strategy);
  assert.equal(m.instruction, VisualMotif.STANDARD.instruction);
  assert.match(m.explanation, /Kein SIC-Eintrag/);
});

test("VM6 · Jedes Motiv traegt eine erklaerbare Herkunft", () => {
  const m = VisualMotif.motivFuer("NVDA", ".");
  assert.match(m.explanation, /^SIC 3674 /);
});

test("VM7 · Die Palette ist fuer jeden Aufruf eine eigene Kopie", () => {
  /* Kein geteiltes Array - ein Aufrufer, der die Palette veraendert,
     darf nicht den naechsten Aufruf beeinflussen. */
  const a = VisualMotif.motivFuer("NVDA", ".");
  const b = VisualMotif.motivFuer("NVDA", ".");
  a.palette.push("rot");
  assert.equal(b.palette.includes("rot"), false);
});

test("VM8 · Kein Motiv nennt eine lesbare Fremdmarke", () => {
  /* Jede Anweisung an den Agenten schliesst explizit aus, was §11 des
     Auftrags verbietet - eine dritte Marke im generierten Bild. */
  for (const code of Object.keys(VisualMotif.SIC4_MOTIVE)) {
    const eintrag = VisualMotif.SIC4_MOTIVE[code];
    assert.match(eintrag.instruction, /[Kk]eine lesbare Marke/,
      "SIC " + code + " (" + eintrag.label + ") nennt keinen Fremdmarken-Ausschluss");
  }
});
