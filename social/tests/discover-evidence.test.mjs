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

/* -------------------------------------------------------------------
   DAS BRIEF-EVIDENZTOR ALS EIGENE, AUFRUFBARE ENTSCHEIDUNG

   Seit der Owner es zum Tor der Content-Leiter gemacht hat, urteilt
   es nicht mehr nur ueber Discover-Reihen. Diese Tests pruefen es
   direkt — nicht ueber `fromRow`, sonst pruefen sie die Reihe und
   nicht die Schwelle.
   ------------------------------------------------------------------- */

test("DE10 · Drei Belege OHNE Begruendung genuegen nicht", () => {
  assert.equal(D.genuegt(3, null), false);
  assert.equal(D.genuegt(99, null), false);
  assert.equal(D.genuegt(3, "   "), false,
    "Leerzeichen sind keine Begruendung");
  /* `true` ist die bequemste Unwahrheit: ein Aufrufer, der nur weiss
     DASS es einen Grund gibt, hat keinen Satz zu zeigen. */
  assert.equal(D.genuegt(3, true), false,
    "Ein Boolean ist kein Satz, den jemand lesen kann");
});

test("DE11 · Eine Begruendung mit zu wenig Belegen genuegt nicht", () => {
  assert.equal(D.genuegt(0, "Weil der Kurs gestiegen ist."), false);
  assert.equal(D.genuegt(D.MINDEST_BELEGE - 1, "Weil ..."), false);
  assert.equal(D.genuegt(D.MINDEST_BELEGE, "Weil ..."), true);
});

test("DE12 · Unbekannt ist nicht 'genuegt'", () => {
  assert.equal(D.genuegt(undefined, "Weil ..."), false);
  assert.equal(D.genuegt(null, "Weil ..."), false);
  assert.equal(D.genuegt(NaN, "Weil ..."), false);
  assert.equal(D.genuegt("viele", "Weil ..."), false);
});

/* -------------------------------------------------------------------
   DIE EINORDNUNG FUER REIHEN OHNE ZAHLENREGEL (§30, Candidate C)

   "row-rule" hat weder Entitaet noch Zahl und ist deshalb genau die
   Form, die EvidencePackage.fromTopicEvidence() als "Einordnung"
   erkennt (assessSufficiency(): "Die Leitzahl hat keine Einordnung").
   Eine MEGATREND-Reihe (Thema statt Zahlenregel, `r.theme` gesetzt)
   traegt aber gar kein `r.rule` - und hatte deshalb ueberhaupt keinen
   entitaets- und zahlenlosen Beleg. Jedes Megatrend-Thema verfehlte
   EVIDENCE_SUFFICIENCY damit strukturell, unabhaengig von seiner
   Beleglage - ein realer POST-ZU-THEMA-Lauf mit "Künstliche
   Intelligenz" zeigte das genau so.
   ------------------------------------------------------------------- */

const THEMA_REIHE = JSON.parse(readFileSync(
  new URL("../../discover/data/rows/US_REAL/thema-ki.json", import.meta.url), "utf8"));

test("DE13a · Eine Themen-Reihe ohne Zahlenregel bekommt trotzdem eine Einordnung", () => {
  assert.equal(THEMA_REIHE.rule, null,
    "Die Fixture muss tatsaechlich keine Zahlenregel tragen - sonst prueft der Test nichts");
  assert.ok(THEMA_REIHE.subtitle, "Die Fixture muss einen Untertitel tragen");

  const e = D.fromRow(THEMA_REIHE);
  const keineRegel = e.evidence.find((x) => x.id === "row-rule");
  assert.equal(keineRegel, undefined, "Ohne r.rule darf es keinen row-rule-Beleg geben");

  const einordnung = e.evidence.find((x) => x.id === "row-subtitle");
  assert.ok(einordnung, "Ohne Zahlenregel muss der Untertitel die Einordnung tragen");
  assert.equal(einordnung.statement, THEMA_REIHE.subtitle);
  assert.equal(einordnung.entity, undefined,
    "Die Einordnung darf keine Entitaet tragen - sonst zaehlt sie nicht als Einordnung");
  assert.equal(einordnung.value, undefined,
    "Die Einordnung darf keine Zahl tragen - sonst zaehlt sie nicht als Einordnung");
});

test("DE13b · Eine Reihe MIT Zahlenregel behaelt row-rule und bekommt zusaetzlich row-subtitle", () => {
  /* Regression: die neue Einordnung darf die bestehende Regel-Evidenz
     nicht verdraengen - RANKING-Reihen tragen beides. */
  const e = D.fromRow(REIHE);
  assert.ok(e.evidence.find((x) => x.id === "row-rule"));
  assert.ok(REIHE.subtitle, "Die Cashflow-Maschinen-Fixture muss einen Untertitel tragen");
  const einordnung = e.evidence.find((x) => x.id === "row-subtitle");
  assert.ok(einordnung);
  assert.equal(einordnung.statement, REIHE.subtitle);
});

test("DE13 · fromRow rechnet die Schwelle nicht selbst nach", () => {
  /* Eine zweite Rechnung fuer eine Frage, die schon eine hat, geht
     irgendwann auseinander. Also darf in `fromRow` keine eigene
     Zahl stehen. */
  const quelle = readFileSync(
    new URL("../engines/discover-evidence.js", import.meta.url), "utf8");
  const fromRow = quelle.slice(quelle.indexOf("function fromRow"));
  assert.ok(!/belege\.length\s*>=\s*\d/.test(fromRow),
    "fromRow vergleicht die Belegzahl selbst gegen eine Zahl");
  assert.ok(/genuegt\(belege\.length, r\.rule\)/.test(fromRow),
    "fromRow ruft das Tor nicht auf");
});
