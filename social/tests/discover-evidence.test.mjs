/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/discover-evidence.test.mjs

   Beim Anbinden der Discover-Reihen als Evidenzquelle fiel auf, dass
   24 Karten Margen zwischen 200 % und 1567 % anzeigen - Crown Castle
   mit "1337 %" Free-Cashflow-Marge.

   Die Reihe CASHFLOW-MASCHINEN verlangt >= 15 %. Alle sechzehn Treffer
   tragen Rohwerte zwischen 1,08 und 13,37: als Prozent gelesen erfuellt
   KEINER die Regel, als Bruch gelesen waeren es 108 % bis 1337 %.
   Filter und Anzeige lesen dieselbe Zahl verschieden.

   Solange die Quelle keine Einheit mitliefert, ist jede Deutung eine
   Behauptung - auch die harmlos aussehende.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const D = require("../engines/discover-evidence.js");

const REIHE = JSON.parse(readFileSync(
  new URL("../../discover/data/rows/US_REAL/cashflow-maschinen.json", import.meta.url), "utf8"));

test("DE1 · Die Auswahlregel ist der staerkste Beleg einer Reihe", () => {
  /* Eine Liste ohne Regel ist keine Geschichte, nur eine Aufzaehlung. */
  const e = D.fromRow(REIHE);
  const regel = e.evidence.find((x) => x.id === "row-rule");
  assert.ok(regel, "Die Regel fehlt.");
  assert.match(regel.statement, /Free-Cashflow-Marge/);
});

test("DE2 · Die Abdeckung nennt auch die nicht entscheidbaren Titel", () => {
  /* "596 von 5947" ohne "2849 nicht entscheidbar" waere eine schoenere
     und falschere Aussage. */
  const e = D.fromRow(REIHE);
  const cov = e.evidence.find((x) => x.id === "row-coverage");
  assert.ok(cov);
  assert.match(cov.statement, /fehlt die noetige Kennzahl/);
});

test("DE3 · Eine Marge ohne erklaerte Einheit wird nicht zu Evidenz", () => {
  const e = D.fromRow(REIHE);
  const margen = e.evidence.filter((x) => x.metric && /Marge/i.test(x.metric));
  assert.equal(margen.length, 0,
    "Kein Margenwert darf in die Evidenz, solange die Einheit ungeklaert ist.");
  assert.ok(e.findings.some((f) => f.id === "unitUndeclared"));
});

test("DE4 · Auch die harmlos aussehende Deutung wird zurueckgewiesen", () => {
  /* 13,372093 als "13,4 %" zu lesen ist genauso geraten wie "1337 %" -
     und widersprueche der Regel der eigenen Reihe. */
  const w = D.wertAus({ value: 13.372093, status: "CALCULATED" }, "Free-Cashflow-Marge");
  assert.equal(w.ok, false);
  assert.equal(w.reason, "unitUndeclared");
  assert.match(w.message, /weder als 1337 % noch als 13\.4 %/);
});

test("DE5 · Mit erklaerter Einheit ist der Wert nutzbar", () => {
  /* Die Gegenrichtung: das Tor verbietet keine Margen, es verlangt
     eine Einheit. */
  const w = D.wertAus({ value: 18.4, status: "CALCULATED", unit: "%" }, "Nettomarge");
  assert.equal(w.ok, true);
  assert.equal(w.value, 18.4);
});

test("DE6 · Zurueckgehaltene Daten werden nicht weiterverbreitet", () => {
  /* WITHHELD_REDISTRIBUTION heisst: anzeigen ja, weitergeben nein. Ein
     Social-Beitrag IST Weitergabe. */
  const w = D.wertAus({ value: 1, status: "WITHHELD_REDISTRIBUTION" }, "Kurs");
  assert.equal(w.ok, false);
  assert.equal(w.reason, "nichtVerbreitbar");
});

test("DE7 · Ein Status, der keine Rechnung ist, traegt keinen Beleg", () => {
  assert.equal(D.wertAus({ value: 5, status: "INSUFFICIENT_HISTORY" }, "Kurs").ok, false);
  assert.equal(D.wertAus({ value: 5, status: "CALCULATED" }, "Kurs").ok, true);
});

test("DE8 · Die Reihe liefert genug Evidenz fuer eine eigene Geschichte", () => {
  const e = D.fromRow(REIHE);
  assert.equal(e.sufficient, true, e.explanation);
  assert.ok(e.evidenceCount >= 3);
  /* Und sie sagt, wie viel sie verworfen hat - eine Quelle mit vielen
     Zurueckweisungen ist eine schlechte Quelle, auch wenn der Rest
     stimmt. */
  assert.ok(e.rejectedCount > 0);
});

test("DE9 · Klarnamen statt Kuerzel in den Belegen", () => {
  const e = D.fromRow(REIHE);
  const kurse = e.evidence.filter((x) => x.metric === "Kurs");
  assert.ok(kurse.length > 0);
  for (const k of kurse) {
    assert.ok(!/^[A-Z]{2,5}:/.test(k.statement),
      "Beleg beginnt mit einem Kuerzel: " + k.statement);
  }
});
