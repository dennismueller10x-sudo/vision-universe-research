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

   Frontend-Rebuild (quant/app): Prüfintention erhalten – der einfache
   Screener ist jetzt #/screener in quant/app/pages.js (screener(),
   factorHits(), screeningWhy()), die Trefferzeile X.stockRow (ui.js), das
   Urteil der Zeile kommt aus VM.fromScreeningRow -> overall() in
   quant/app/view-model.js, das quant/engines/plain-verdict.js aufruft.
   Geprueft wird am Verhalten des View Models ueber echte Screening-Zeilen
   und an der Quelle der Trefferliste.
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
const VM = require(join(ROOT, "quant/app/view-model.js"));
const QUELLE = readFileSync(join(ROOT, "quant/app/pages.js"), "utf8");
const VM_QUELLE = readFileSync(join(ROOT, "quant/app/view-model.js"), "utf8");
const METHODIK = readFileSync(join(ROOT, "quant/app/page-method.js"), "utf8");
const SCREENING = join(ROOT, "quant/data/product/factor-evidence-v1/screening.json.gz");

/** Der Abschnitt, der die Trefferliste des einfachen Screeners baut. */
function einfacherScreenerQuelle() {
  /* screeningWhy (Begruendung der Zeile) bis einschliesslich highHits:
     alles, was die Trefferliste des einfachen Screeners baut. */
  const ab = QUELLE.indexOf("function screeningWhy(");
  const bis = QUELLE.indexOf("/* -------------------------------------------------------- Profi-Modus");
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
  /* Am Verhalten: was die Zeile aus dem View Model zeigt (die Einordnung
     im Pill), nennt keinen festen Nenner. */
  if (existsSync(SCREENING)) {
    const j = JSON.parse(gunzipSync(readFileSync(SCREENING)));
    for (const [, werte] of Object.entries(j.rows).slice(0, 500)) {
      const row = Object.fromEntries(j.fields.map((f, i) => [f, werte[i]]));
      const v = VM.fromScreeningRow(row);
      assert.doesNotMatch(v.overall.text, /\bvon 7\b/, "die Einordnung der Zeile nennt den Nenner 7: " + v.overall.text);
    }
  }
  /* Die Gegenprobe zur Gegenprobe: der Befund selbst darf und soll im
     Code stehen. Faende dieser Test ihn nicht mehr, waere die Erklaerung
     verlorengegangen - und der naechste Umbau macht denselben Fehler.
     Frontend-Rebuild: die Erklaerung steht jetzt bei overall() im View
     Model, von dem die Trefferzeile ihre Einordnung bekommt. */
  const overall = VM_QUELLE.slice(VM_QUELLE.indexOf("* Die Einordnung eines Titels"), VM_QUELLE.indexOf("function overall("));
  assert.match(overall, /Nenner ist\s+\*?\s*die Zahl der bewerteten Faktoren, nicht sieben/,
    "die Begruendung, warum der Nenner 7 hier nicht steht, ist aus dem Code verschwunden");
});

test("die rechte Spalte wiederholt nicht die Zahl aus derselben Zeile", () => {
  /* Der Rueckfall waere, den Sortierwert erneut in die Spalte zu legen -
     genau das stand vorher da und machte zwei Drittel aller Zahlen der
     Seite aus. Frontend-Rebuild: die rechte Spalte von X.stockRow ist
     pill/side; in factorHits traegt sie die Einordnung. */
  const abschnitt = einfacherScreenerQuelle();
  const factorHits = abschnitt.slice(abschnitt.indexOf("async function factorHits("), abschnitt.indexOf("async function setupHits("));
  const aufruf = factorHits.slice(factorHits.indexOf("X.stockRow("), factorHits.indexOf("});", factorHits.indexOf("X.stockRow(")));
  assert.ok(aufruf.length > 50, "die Trefferzeile ist nicht auffindbar");
  assert.doesNotMatch(aufruf, /\bside:/,
    "die Spalte traegt wieder einen Faktorwert - dieselbe Zahl wie in der Begruendung");
  assert.match(aufruf, /v\.overall\.text/,
    "die Spalte traegt kein Klartext-Urteil mehr");
  assert.match(aufruf, /tone: v\.overall\.tone/,
    "das Urteil wird ohne Tonlage gezeichnet - dann ist es eine Beschriftung, keine Auskunft");
  /* Und die Einordnung ist wirklich ein Wort, keine Zahl. */
  const v = VM.fromScreeningRow({ "quantV2.factorEvidence.quality": 90, "quantV2.factorEvidence.growth": 80,
    "quantV2.factorEvidence.momentum": 50, "quantV2.factorEvidence.value": 20 });
  assert.doesNotMatch(v.overall.text, /\d/, "die Einordnung traegt eine Zahl: " + v.overall.text);
  assert.ok(v.overall.tone, "die Einordnung hat keine Tonlage");
});

/* ---------------------------------------------------------------------
   2. WAS DASTEHT, UND WOHER ES KOMMT
   --------------------------------------------------------------------- */

test("das Urteil der Trefferzeile kommt aus derselben Engine wie die Aktienseite", () => {
  /* Zwei Urteile aus zwei Rechenwegen waeren frueher oder spaeter zwei
     verschiedene Urteile ueber denselben Titel. Frontend-Rebuild: die
     Bruecke ist VM.fromScreeningRow; Aktienseite (VM.stock) und
     Trefferzeile gehen beide durch VM.overall -> VUPlainVerdict.urteil. */
  const factorHits = QUELLE.slice(QUELLE.indexOf("async function factorHits("), QUELLE.indexOf("async function setupHits("));
  assert.match(factorHits, /VM\.fromScreeningRow\(s\.evidence\)/,
    "die Bruecke von der Evidenzzeile zum Urteil fehlt");
  const overall = VM_QUELLE.slice(VM_QUELLE.indexOf("function overall("), VM_QUELLE.indexOf("function proCon("));
  assert.match(overall, /PV\.urteil\(/,
    "die Trefferzeile rechnet ihr Urteil selbst statt es aus der Engine zu holen");
  assert.match(VM_QUELLE, /require\("\.\.\/engines\/plain-verdict\.js"\) : global\.VUPlainVerdict/);
  /* Die Faktoren kommen aus der Methodik: die Liste des View Models ist
     dieselbe wie die der Faktor-Engine. */
  assert.deepEqual(VM.ORDER, Evidence.FACTOR_ORDER,
    "die Faktoren sind anders aufgezaehlt als in der Methodik");
  /* Aktienseite und Trefferzeile kommen fuer dieselben Werte zum selben Urteil. */
  const werte = { quality: 92, growth: 78, momentum: 40, value: 22, profitability: 81, risk: 55 };
  const row = Object.fromEntries(Object.entries(werte).map(([id, v]) => ["quantV2.factorEvidence." + id, v]));
  const zeile = VM.fromScreeningRow(row).overall;
  const seite = VM.stock({ factors: { state: "AVAILABLE", factors: Object.entries(werte).map(([id, score]) => ({ id, state: "AVAILABLE", score, components: [] })) } }).overall;
  assert.equal(zeile.id, seite.id);
  assert.equal(zeile.text, seite.text);
});

test("die systemische Luecke wird gezaehlt, nicht hineingeschrieben", () => {
  /* Ein hart notierter Faktorname waere heute richtig und in drei Wochen
     eine Behauptung. Der Satz muss aus den Daten entstehen.
     Frontend-Rebuild: luekenSatz() aus dem alten Screener ist entfallen;
     die systemische Luecke nennt jetzt die Methodik-Seite
     (quant/app/page-method.js). Dort wird geprueft, dass sie aus der
     veroeffentlichten Verteilung (ctx.distributionRows ->
     getFactorEvidenceScreening) gezaehlt und nicht an einen Faktornamen
     geschrieben ist. */
  const app = readFileSync(join(ROOT, "quant/app/app.js"), "utf8");
  assert.match(app, /distributionRows: function[\s\S]*?getFactorEvidenceScreening\(\)/,
    "die Verteilung liest die Abdeckung nicht aus dem veroeffentlichten Artefakt");
  assert.match(app, /VUQuantViewModel\.ORDER\.forEach/, "sie prueft nicht alle Faktoren der Methodik");
  const quelle = ohneKommentare(METHODIK) + ohneKommentare(QUELLE);
  assert.match(quelle, /distribution(?:Rows)?\(\)/, "die Methodik-Seite liest die Verteilung nicht");
  assert.doesNotMatch(quelle, /id === "revisions"|"Erwartungstrend[^"]*ohne Daten|höchstens sechs von sieben/,
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
    /* Und die Oberflaeche (View Model) kommt ueber dieselbe Zeile zum
       selben Urteil. */
    const row = Object.fromEntries(felder.map((f, i) => [f, werte[i]]));
    const v = VM.fromScreeningRow(row).overall;
    assert.equal(v.id, u.stufeId, "Trefferzeile und Engine urteilen verschieden");
    assert.notEqual(v.id, "KEINE_DATEN");
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
  /* Dasselbe am View Model, das die Oberflaeche zeichnet. */
  const vm = VM.overall(Evidence.FACTOR_ORDER.map((id, i) => VM.factorView(i < 4
    ? { id, state: "AVAILABLE", score: 90 - i * 25, components: [] }
    : { id, state: "UNAVAILABLE", reason: "INPUT_NOT_MATERIALIZED", components: [] })));
  assert.equal(vm.rated, 4);
  assert.match(vm.sub, /von 4 gemessenen Eigenschaften/, "die Oberflaeche nennt einen anderen Nenner: " + vm.sub);
  assert.doesNotMatch(vm.sub + vm.text, /von 7/);
});
