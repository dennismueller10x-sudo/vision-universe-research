/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/story-selection.test.mjs

   Evidence ist nicht Copy. Diese Tests halten die Stufe dazwischen
   fest: welche Belege tragen zusammen eine Geschichte, und was
   passiert mit den uebrigen.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const S = require("../engines/story-selection.js");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* Die echte Evidenz aus dem XOM-Lauf — 23 gebundene Belege. */
const ECHT = JSON.parse(readFileSync(
  join(ROOT, "authoring/requests/vu-xom-20260911/authoring-brief.json"), "utf8")).evidence;

test("SS1 · Der Anteil wird gelesen, nicht neu gerechnet", () => {
  /* "27.35 von 30 Punkten" steht schon in der Aussage. Ihn hier neu
     zu bilden hiesse, zwei Wahrheiten ueber dieselbe Zahl zu haben. */
  const a = S.ausschoepfung({ statement: "TREND_STRUCTURE traegt 27.35 von 30 Punkten bei." });
  assert.equal(a.value, 27.35);
  assert.equal(a.max, 30);
  assert.ok(Math.abs(a.share - 0.911666) < 0.001);

  assert.equal(S.ausschoepfung({ statement: "Volumen NORMAL." }), null);
  assert.equal(S.ausschoepfung(null), null);
});

test("SS2 · Die Schwelle ist der Leitwert selbst, nicht eine Konstante", () => {
  /* Der Kern: es gibt keine ausgedachte Zahl, ab der ein Unterschied
     "interessant" ist. Ein Teil, der ueber der Gesamtausschoepfung
     liegt, zieht nach oben; darunter bremst er. Die Daten setzen die
     Grenze. */
  const r = S.select(ECHT);
  assert.equal(r.hasTension, true);
  assert.ok(Math.abs(r.leadShare - 0.76) < 1e-9);
  assert.ok(r.tension.strength.share > r.leadShare);
  assert.ok(r.tension.drag.share < r.leadShare);
});

test("SS3 · Gefunden wird der Bogen, den die Daten hergeben", () => {
  const r = S.select(ECHT);
  assert.equal(r.tension.strength.component, "TREND_STRUCTURE");
  assert.equal(r.tension.drag.component, "VOLATILITY");
  /* Die Stuetze ist die Zahl, die ein Leser ohne Methodenkenntnis
     wiedererkennt — die laengste Rendite, nicht die groesste Zahl. */
  assert.equal(r.tension.support.id, "momentum-12m");
});

test("SS4 · Nicht verwendete Evidenz ist nicht verlorene Evidenz", () => {
  /* Die Owner-Vorgabe woertlich: keine Fakten erfinden, keine Evidence
     verlieren. Auswahl und Bestand muessen zusammen wieder den
     Bestand ergeben. */
  const r = S.select(ECHT);
  assert.equal(r.selected.length + r.unused.length, ECHT.length);
  assert.equal(r.full.length, ECHT.length);

  const ids = new Set([...r.selected, ...r.unused].map((e) => e.id));
  ECHT.forEach((e) => assert.ok(ids.has(e.id), "verloren: " + e.id));
});

test("SS5 · Die Auswahl ist klein — sonst waere sie keine", () => {
  const r = S.select(ECHT);
  assert.ok(r.selected.length < ECHT.length / 3,
    "Von 23 Belegen " + r.selected.length + " auszuwaehlen ist keine Auswahl.");
});

test("SS6 · Ohne Straddle wird kein Bogen behauptet", () => {
  /* Liegen alle Teile auf derselben Seite, gibt es keine gemessene
     Spannung. Eine zu behaupten waere genau die Erfindung, die dieses
     System nicht machen darf. */
  const einseitig = [
    { id: "score", statement: "Score 50 von 100." },
    { id: "score-contribution-a", statement: "A traegt 9 von 10 Punkten bei." },
    { id: "score-contribution-b", statement: "B traegt 8 von 10 Punkten bei." }
  ];
  const r = S.select(einseitig);
  assert.equal(r.hasTension, false);
  assert.equal(r.tension, null);
  assert.match(r.explanation, /Straddle/);
  /* Ohne Bogen wird NICHT reduziert: eine willkuerliche Auswahl waere
     schlechter als der vollstaendige Bestand. */
  assert.equal(r.selected.length, einseitig.length);
  assert.equal(r.unused.length, 0);
});

test("SS7 · Ohne Leitbeleg gibt es keinen Massstab", () => {
  const r = S.select([{ id: "irgendwas", statement: "A traegt 9 von 10 Punkten bei." }]);
  assert.equal(r.hasTension, false);
  assert.match(r.explanation, /Leitbeleg/);
});
