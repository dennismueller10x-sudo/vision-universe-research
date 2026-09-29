/* =========================================================================
   DIE TREFFERZEILE DES EINFACHEN SCREENERS

   Gemessen am gebauten Release, 390 px, Vorauswahl "Qualitaet":

     Zahlen auf der Seite            112
     davon in der rechten Spalte      75
     Trefferzeilen                    25
     Zeilen mit "nur X von 7 pruefbar" 25

   Eine Zeile las sich: "GL | Globe Life | Qualitaet: stark (90) | 90 |
   nur 6 von 7 pruefbar". Zwei Befunde stecken darin.

   1. DIE ZAHL STAND ZWEIMAL. "(90)" in der Begruendung und "90" in der
      Spalte daneben - dieselbe Zahl, dieselbe Zeile.

   2. DER NENNER 7 WIRD VON KEINEM TITEL ERREICHT. Ueber 6.297 Titel
      traegt `revisions` bei 0,0 % einen Wert. Das Maximum ist 6. Der Satz
      "nur 6 von 7 pruefbar" war damit wahr und trotzdem irrefuehrend: er
      las sich als Mangel DIESES Titels, waehrend die Luecke fuer alle
      gilt. Eine Warnung, die auf jeder Zeile steht, warnt nicht mehr -
      dieselbe Fehlerklasse wie ein Waechter, der jede Nacht schreit.

   Diese Tests halten fest, was an die Stelle getreten ist, und zwar so,
   dass sie nicht selbst veralten: sie pruefen die ABLEITUNG, nicht den
   heutigen Messwert. Traegt `revisions` eines Tages Werte, bleiben sie
   gruen und die Oberflaeche zieht von allein nach.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const Evidence = require(join(ROOT, "quant/engines/factor-evidence.js"));
const Verdict = require(join(ROOT, "quant/engines/plain-verdict.js"));
const QUELLE = readFileSync(join(ROOT, "vu2/experience.js"), "utf8");
const SCREENING = join(ROOT, "quant/data/product/factor-evidence-v1/screening.json.gz");

/** Der Abschnitt, der die Trefferliste des einfachen Screeners baut. */
function einfacherScreenerQuelle() {
  const ab = QUELLE.indexOf("async function einfacherScreener()");
  const bis = QUELLE.indexOf("async function screenPage()");
  assert.ok(ab > 0 && bis > ab, "der einfache Screener ist nicht mehr auffindbar");
  return QUELLE.slice(ab, bis);
}

/* SELBST GEFUNDEN, BEIM ERSTEN LAUF DIESER TESTS.
   Die Regel unten gilt fuer das, was die Oberflaeche ZEIGT. Mein erster
   Versuch las den Abschnitt samt Kommentaren - und die erklaeren den
   Befund, indem sie die alte Zeichenkette zitieren ("nur 6 von 7
   pruefbar"). Der Test wurde rot, obwohl die Oberflaeche sauber war.
   Ein Test, der die Begruendung einer Reparatur fuer die Reparatur haelt,
   verbietet, den eigenen Befund aufzuschreiben. */
function ohneKommentare(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/* ---------------------------------------------------------------------
   1. WAS NICHT MEHR DASTEHEN DARF
   --------------------------------------------------------------------- */

test("keine Trefferzeile nennt einen Nenner, den kein Titel erreicht", () => {
  const abschnitt = ohneKommentare(einfacherScreenerQuelle());
  assert.doesNotMatch(abschnitt, /von 7 prüfbar/,
    "der Hinweis 'von 7 prüfbar' ist zurueck - kein Titel erreicht diesen Nenner");
  assert.doesNotMatch(abschnitt, /\bvon 7\b/,
    "in der Trefferliste steht wieder ein fester Nenner 7");
  /* Die Gegenprobe zur Gegenprobe: der Befund selbst darf und soll im
     Code stehen. Faende dieser Test ihn nicht mehr, waere die Erklaerung
     verlorengegangen - und der naechste Umbau macht denselben Fehler. */
  assert.match(einfacherScreenerQuelle(), /von 7/,
    "die Begruendung, warum der Nenner 7 hier nicht steht, ist aus dem Code verschwunden");
});

test("die rechte Spalte wiederholt nicht die Zahl aus derselben Zeile", () => {
  /* Der Rueckfall waere, den Sortierwert erneut in die Spalte zu legen -
     genau das stand vorher da und machte zwei Drittel aller Zahlen der
     Seite aus. */
  const abschnitt = einfacherScreenerQuelle();
  const zeile = abschnitt.slice(abschnitt.indexOf("liste.append(hitRow("));
  const bis = zeile.indexOf("\n  }");
  const aufruf = zeile.slice(0, bis > 0 ? bis : 400);
  assert.doesNotMatch(aufruf, /Math\.round\(werte\[0\]/,
    "die Spalte traegt wieder den ersten Faktorwert - dieselbe Zahl wie in der Begruendung");
  assert.match(aufruf, /urteil\.stufe/,
    "die Spalte traegt kein Klartext-Urteil mehr");
  assert.match(aufruf, /urteil\.ton/,
    "das Urteil wird ohne Tonlage gezeichnet - dann ist es eine Beschriftung, keine Auskunft");
});

/* ---------------------------------------------------------------------
   2. WAS DASTEHT, UND WOHER ES KOMMT
   --------------------------------------------------------------------- */

test("das Urteil der Trefferzeile kommt aus derselben Engine wie die Aktienseite", () => {
  /* Zwei Urteile aus zwei Rechenwegen waeren frueher oder spaeter zwei
     verschiedene Urteile ueber denselben Titel. */
  assert.match(QUELLE, /function urteilAusEvidenz\(ev\)/,
    "die Bruecke von der Evidenzzeile zum Urteil fehlt");
  const bruecke = QUELLE.slice(QUELLE.indexOf("function urteilAusEvidenz(ev)"),
    QUELLE.indexOf("async function einfacherScreener()"));
  assert.match(bruecke, /VUPlainVerdict\.urteil/,
    "die Trefferzeile rechnet ihr Urteil selbst statt es aus der Engine zu holen");
  assert.match(bruecke, /VUFactorEvidence\.FACTOR_ORDER/,
    "die Faktoren sind aufgezaehlt statt aus der Methodik genommen");
});

test("die systemische Luecke wird gezaehlt, nicht hineingeschrieben", () => {
  /* Ein hart notierter Faktorname waere heute richtig und in drei Wochen
     eine Behauptung. Der Satz muss aus den Daten entstehen. */
  assert.match(QUELLE, /async function luekenSatz\(\)/, "der Satz zur systemischen Luecke fehlt");
  const satz = QUELLE.slice(QUELLE.indexOf("async function luekenSatz()"),
    QUELLE.indexOf("function urteilAusEvidenz(ev)"));
  assert.match(satz, /getFactorEvidenceScreening/,
    "der Satz liest die Abdeckung nicht aus dem veroeffentlichten Artefakt");
  assert.match(satz, /FACTOR_ORDER/, "er prueft nicht alle Faktoren der Methodik");
  assert.match(satz, /FACTOR_MEANING/, "der Faktorname kommt nicht aus der Methodik");
  assert.doesNotMatch(satz, /Erwartungstrend|revisions/,
    "der heute leere Faktor steht als Name im Code - das veraltet, sobald er Werte traegt");
});

/* ---------------------------------------------------------------------
   3. UEBER ECHTE DATEN
   --------------------------------------------------------------------- */

test("das Urteil laesst sich aus einer Screening-Zeile wirklich bilden", () => {
  /* Der Quelltext kann stimmen und die Spalte trotzdem leer bleiben, wenn
     die Zeilen die Faktoren gar nicht tragen. Also ueber die echten
     Daten, mit demselben Rechenweg wie die Oberflaeche. */
  if (!existsSync(SCREENING)) return;
  const j = JSON.parse(gunzipSync(readFileSync(SCREENING)));
  const felder = j.fields, rows = Object.entries(j.rows);
  assert.ok(rows.length > 1000, "die Stichprobe ist zu klein: " + rows.length);

  const iQ = felder.indexOf("quantV2.factorEvidence.quality");
  /* Dieselbe Vorauswahl wie die Oberflaeche: Qualitaet ab 70. */
  const treffer = rows.filter(([, v]) => Number.isFinite(v[iQ]) && v[iQ] >= 70).slice(0, 50);
  assert.ok(treffer.length >= 25, "zu wenige Treffer fuer die Pruefung: " + treffer.length);

  let ohneUrteil = 0;
  const stufen = new Set();
  for (const [, werte] of treffer) {
    const factors = {};
    Evidence.FACTOR_ORDER.forEach((id) => {
      const wert = werte[felder.indexOf("quantV2.factorEvidence." + id)];
      factors[id] = Number.isFinite(wert)
        ? { state: "AVAILABLE", score: wert }
        : { state: "UNAVAILABLE", reason: "INPUT_NOT_MATERIALIZED", score: null };
    });
    const u = Verdict.urteil({ factors });
    if (u.stufeId === "KEINE_DATEN") ohneUrteil++;
    else stufen.add(u.stufeId);
    /* Der Widerspruch, der die Engine einmal hatte, darf hier nicht zurueck. */
    if (u.ton === "schwach") assert.doesNotMatch(u.zaehlsatz, /^Stark/);
    if (u.ton === "gut") assert.doesNotMatch(u.zaehlsatz, /^Schwach/);
  }
  assert.equal(ohneUrteil, 0,
    ohneUrteil + " Treffer traegen kein Urteil - die Spalte bliebe dort leer");
  /* Und es muss VARIIEREN. Eine Spalte, die auf jeder Zeile dasselbe sagt,
     ist die Tapete, die wir gerade abgenommen haben. */
  assert.ok(stufen.size >= 2,
    "alle Treffer tragen dasselbe Urteil (" + [...stufen] + ") - das traegt keine Auskunft");
});

test("der Nenner des Urteils sind die geprueften Punkte, nicht die sieben", () => {
  /* Der Kern der Reparatur: das Urteil beschreibt seinen eigenen Nenner
     ("in 3 von 5 geprueften Punkten") und braucht deshalb keine Zahl, die
     kein Titel erreicht. */
  const factors = {};
  Evidence.FACTOR_ORDER.forEach((id, i) => {
    factors[id] = i < 4
      ? { state: "AVAILABLE", score: 90 - i * 25 }
      : { state: "UNAVAILABLE", reason: "INPUT_NOT_MATERIALIZED", score: null };
  });
  const u = Verdict.urteil({ factors });
  assert.equal(u.bewertet, 4);
  assert.match(u.zaehlsatz, /von 4 geprüften Punkten/,
    "der Zaehlsatz nennt einen anderen Nenner als die bewerteten Punkte: " + u.zaehlsatz);
  assert.doesNotMatch(u.zaehlsatz, /von 7/,
    "das Urteil rechnet gegen sieben, obwohl nur vier geprueft sind");
});
