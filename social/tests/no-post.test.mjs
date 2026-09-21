/* =========================================================================
   VU SOCIAL — EIN LEERER TAG BRAUCHT EINEN NACHWEIS (NP1–NP16)

   §13–§16. Die Gegenprobe zu allem hier ist immer dieselbe Frage:
   Laesst sich "wir haben gesucht" von "wir haben aufgegeben"
   unterscheiden? Ein System, das beides gleich meldet, kann den
   Unterschied spaeter nicht mehr zeigen - und niemand merkt es, weil
   die Ausgabe in beiden Faellen ruhig aussieht.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const NoPost = require("../engines/no-post.js");
const Kadenz = require("../engines/content-cadence.js");
const Ladder = require("../engines/content-ladder.js");

/* Die Form, die ein echter Lauf liefert - abgenommen von einem Lauf
   ueber die reale Platte (9 Familien, 29 Themen, Stufe 5). */
const SUCHE_MIT_FUND = {
  familiesConsidered: ["NEWS_NOW", "EARNINGS", "MARKET_EXPLAINER",
    "VU_ORIGINAL_RESEARCH", "MAGAZINE_STORY", "REPORT_STORY", "STOCK_STORY",
    "RANKING", "COMPARISON"],
  familiesConsideredCount: 9,
  opportunitiesConsidered: 29,
  fallbackDepthReached: 5,
  rejectionReasons: { FAMILY_UNAVAILABLE: 5, EVIDENCE_INSUFFICIENT: 7 },
  nichtGefragt: [{ stufe: 6, id: "MEGATREND", familien: ["MEGATREND"] }],
  gefunden: 22,
  genug: true
};

/* Und die Form einer Suche, die bis zum Ende ging und nichts fand. */
const SUCHE_LEER = {
  familiesConsidered: Ladder.alleFamilien(),
  familiesConsideredCount: Ladder.alleFamilien().length,
  opportunitiesConsidered: 0,
  fallbackDepthReached: Ladder.LEITER.length,
  rejectionReasons: { NO_TOPICS_IN_FAMILY: 9, FAMILY_UNAVAILABLE: 6 },
  nichtGefragt: [],
  gefunden: 0,
  genug: false
};

const UHR_FREI = {
  darfErzeugen: true, grund: null, erklaerung: "Heute noch kein Beitrag.",
  naechsteFruehestens: null,
  lage: { heuteErzeugt: 0, tagesabsicht: { min: 1, max: 2 } }
};
const UHR_BLOCKIERT = {
  darfErzeugen: false, grund: Kadenz.GRUND.ACTIVE_APPROVAL_QUEUE_NOT_EMPTY,
  erklaerung: "1 Beitrag wartet bereits auf deine Freigabe.",
  naechsteFruehestens: null,
  lage: { heuteErzeugt: 1, tagesabsicht: { min: 1, max: 2 } }
};

/* ------------------------------------------------ DIE DREI ZUSTAENDE */

test("NP1 · Ein Lauf mit Ergebnis ist POST_PREPARED", () => {
  const b = NoPost.beurteile({ erzeugt: 5, kadenz: UHR_FREI, leiter: SUCHE_MIT_FUND });
  assert.equal(b.zustand, NoPost.ZUSTAND.POST_PREPARED);
  /* NICHT "vollstaendig: true" - geprueft wurde kein Nachweis, weil
     sich die Frage nicht stellte. */
  assert.equal(b.vollstaendig, null);
});

test("NP2 · Ein leerer Tag ohne Nachweis ist ein BEFUND", () => {
  /* Der wichtigste Test der Datei. Ohne diesen dritten Zustand waere
     "gerechtfertigt" eine Zusicherung, die sich selbst erfuellt. */
  const b = NoPost.beurteile({ erzeugt: 0 });
  assert.equal(b.zustand, NoPost.ZUSTAND.NO_POST_UNEXPLAINED);
  assert.equal(b.vollstaendig, false);
  assert.ok(b.fehlendeTeile.includes(NoPost.TEILE.ENTSCHEIDUNG_DER_UHR));
  assert.ok(b.fehlendeTeile.includes(NoPost.TEILE.SUCHE));
  assert.match(b.erklaerung, /Befund, kein Betriebszustand/);
});

test("NP3 · Eine gesuchte, erklaerte Leere ist gerechtfertigt", () => {
  const b = NoPost.beurteile({
    erzeugt: 0, kadenz: UHR_FREI, leiter: SUCHE_LEER
  });
  assert.equal(b.zustand, NoPost.ZUSTAND.NO_POST_JUSTIFIED);
  assert.equal(b.grund, Kadenz.GRUND.NO_TOPIC_IN_ANY_FAMILY);
  assert.equal(b.nachweis.suche.vollstaendig, true);
});

/* ----------------------------------- GESUCHT ODER AUFGEGEBEN (§15) */

test("NP4 · 'Keine Familie trug ein Thema' gilt nur nach voller Suche", () => {
  /* Die Verwechslung, die dieser Nachweis unmoeglich machen soll:
     aufgehoert mit zu Ende. */
  const halb = Object.assign({}, SUCHE_LEER, {
    fallbackDepthReached: 3,
    nichtGefragt: [{ stufe: 4, id: "STOCK_REPORT", familien: ["REPORT_STORY"] }]
  });
  const b = NoPost.beurteile({ erzeugt: 0, kadenz: UHR_FREI, leiter: halb });
  assert.equal(b.zustand, NoPost.ZUSTAND.NO_POST_UNEXPLAINED);
  assert.ok(b.fehlendeTeile.includes(NoPost.TEILE.SUCHE));
});

test("NP5 · Was nicht gefragt wurde, steht im Nachweis", () => {
  const b = NoPost.beurteile({ erzeugt: 0, kadenz: UHR_FREI, leiter: SUCHE_MIT_FUND,
    ablehnungen: [{ topic: "T", stage: "FACT_CHECK", reason: "zu alt" }] });
  assert.deepEqual(b.nachweis.suche.nichtGefragt.map((n) => n.id), ["MEGATREND"]);
  assert.equal(b.nachweis.suche.vollstaendig, false);
});

test("NP6 · Die Uhr wird von der Suche getrennt gemeldet", () => {
  /* Zwei Fragen, zwei Zeitpunkte. Der erste Entwurf mischte sie und
     schrieb "3 Beitraege vorbereitet" direkt ueber "Gesucht: nein". */
  const b = NoPost.beurteile({ erzeugt: 0, kadenz: UHR_BLOCKIERT, leiter: null });
  assert.equal(b.nachweis.gesucht, false);
  assert.equal(b.nachweis.warumNichtGesucht,
    Kadenz.GRUND.ACTIVE_APPROVAL_QUEUE_NOT_EMPTY);
  assert.equal(b.nachweis.uhr.darfErzeugen, false);
});

test("NP7 · Die Uhr entscheidet vor der Geschichte", () => {
  /* Der letzte Lauf hat fuenf Pakete gebaut - und genau deshalb
     wartet jetzt einer. Gefragt ist, was JETZT passiert. */
  const b = NoPost.beurteile({ erzeugt: 5, kadenz: UHR_BLOCKIERT, leiter: SUCHE_MIT_FUND });
  assert.equal(b.zustand, NoPost.ZUSTAND.NO_POST_JUSTIFIED);
  assert.equal(b.grund, Kadenz.GRUND.ACTIVE_APPROVAL_QUEUE_NOT_EMPTY);
  /* Der Suchnachweis des letzten Laufs bleibt lesbar - er entscheidet
     hier nur nichts mehr. */
  assert.equal(b.nachweis.gesucht, true);
  assert.equal(b.nachweis.suche.themenGeprueft, 29);
});

/* ------------------------------------------- DER BENANNTE GRUND (§10) */

test("NP8 · Ein fehlendes Marktsignal beendet den Tag nicht", () => {
  const b = NoPost.beurteile({ erzeugt: 0,
    kadenz: { darfErzeugen: false, grund: "NO_MARKET_SIGNAL", lage: {} },
    leiter: SUCHE_LEER });
  assert.equal(b.zustand, NoPost.ZUSTAND.NO_POST_UNEXPLAINED);
  assert.ok(b.fehlendeTeile.includes(NoPost.TEILE.BENANNTER_GRUND));
});

test("NP9 · Ein erfundener Grund ist kein Grund", () => {
  const b = NoPost.beurteile({ erzeugt: 0,
    kadenz: { darfErzeugen: false, grund: "HEUTE_KEINE_LUST", lage: {} },
    leiter: SUCHE_LEER });
  assert.equal(b.zustand, NoPost.ZUSTAND.NO_POST_UNEXPLAINED);
});

test("NP10 · Jeder Grund der Kadenz-Engine ist hier benennbar", () => {
  /* Sonst waere ein Zustand moeglich, den die eine Engine kennt und
     die andere fuer erfunden haelt. */
  for (const g of Object.keys(Kadenz.GRUND)) {
    const zulaessig = Kadenz.grundZulaessig(g).zulaessig;
    if (!zulaessig) continue;
    const b = NoPost.beurteile({ erzeugt: 0,
      kadenz: { darfErzeugen: false, grund: g, lage: {} }, leiter: SUCHE_LEER });
    assert.equal(b.zustand, NoPost.ZUSTAND.NO_POST_JUSTIFIED,
      "nicht benennbar: " + g);
  }
});

/* ------------------------------------------------- WORAN ES LAG */

test("NP11 · Die Torstufen werden gezaehlt, nicht zusammengefasst", () => {
  const b = NoPost.beurteile({ erzeugt: 0, kadenz: UHR_FREI, leiter: SUCHE_MIT_FUND,
    ablehnungen: [
      { topic: "A", stage: "FACT_CHECK", reason: "zu alt" },
      { topic: "B", stage: "FACT_CHECK", reason: "zu alt" },
      { topic: "C", stage: "AUTHORING", reason: "keine Variante" }
    ] });
  assert.deepEqual(b.nachweis.tore.jeStufe, { FACT_CHECK: 2, AUTHORING: 1 });
  assert.equal(b.grund, Kadenz.GRUND.NO_OPPORTUNITY_PASSED_QUALITY);
  assert.match(b.erklaerung, /2x FACT_CHECK/);
});

test("NP12 · Die Torstufen kommen aus den Daten, nicht aus einer Liste", () => {
  /* Eine neue Torstufe soll im Nachweis auftauchen, ohne dass jemand
     sie irgendwo nachtraegt. */
  const z = NoPost.nachStufe([{ stage: "EINE_GANZ_NEUE_STUFE" }]);
  assert.deepEqual(z, { EINE_GANZ_NEUE_STUFE: 1 });
});

test("NP13 · Eine Suche ohne jeden Ablehnungsgrund traegt nichts", () => {
  const stumm = Object.assign({}, SUCHE_LEER, { rejectionReasons: {} });
  const b = NoPost.beurteile({ erzeugt: 0, kadenz: UHR_FREI, leiter: stumm });
  assert.equal(b.zustand, NoPost.ZUSTAND.NO_POST_UNEXPLAINED);
  assert.ok(b.fehlendeTeile.includes(NoPost.TEILE.ABLEHNUNGEN));
});

/* ------------------------------------------ DER SATZ FUER DEN OWNER */

test("NP14 · Der Owner-Satz nennt keine Codes", () => {
  const b = NoPost.beurteile({ erzeugt: 0, kadenz: UHR_FREI, leiter: SUCHE_LEER });
  assert.doesNotMatch(b.erklaerung, /NO_TOPIC_IN_ANY_FAMILY|EVIDENCE_INSUFFICIENT/);
  assert.match(b.erklaerung, /Keine Quelle trug heute ein Thema/);
});

test("NP15 · Steht die Uhr im Weg, nennt der Satz den naechsten Zeitpunkt", () => {
  const b = NoPost.beurteile({ erzeugt: 0, leiter: null,
    kadenz: Object.assign({}, UHR_BLOCKIERT,
      { naechsteFruehestens: "2026-09-21T00:00:00.000Z" }) });
  assert.match(b.erklaerung, /2026-09-21T00:00:00\.000Z/);
});

test("NP16 · Die gefundene Anzahl wird in beiden Formen gelesen", () => {
  /* `suche()` gibt eine Liste, der Zyklusbericht eine Zahl. Wer nur
     eine kennt, schreibt "undefined belegt" in den Bericht. */
  const alsListe = NoPost.beurteile({ erzeugt: 0, kadenz: UHR_FREI,
    leiter: Object.assign({}, SUCHE_MIT_FUND, { gefunden: [1, 2, 3] }),
    ablehnungen: [{ topic: "A", stage: "X", reason: "y" }] });
  const alsZahl = NoPost.beurteile({ erzeugt: 0, kadenz: UHR_FREI,
    leiter: Object.assign({}, SUCHE_MIT_FUND, { gefunden: 3 }),
    ablehnungen: [{ topic: "A", stage: "X", reason: "y" }] });
  assert.equal(alsListe.nachweis.suche.gefunden, 3);
  assert.equal(alsZahl.nachweis.suche.gefunden, 3);
});

test("NP17 · Die Suche nennt nur Gruende, die einen Tag beenden duerfen", () => {
  /* Die Zusicherung, die die NIE_ALLEIN-Pruefung im Suchzweig
     unerreichbar macht. Sie zu behaupten waere billig; sie zu pruefen
     ist der Unterschied.

     Durchgespielt werden die Formen, die eine reale Leiter liefern
     kann: mit und ohne Themen, mit und ohne Ablehnungsgruende, mit
     und ohne Tor-Ablehnungen des Zyklus. */
  const formen = [
    [null, []],
    [SUCHE_LEER, []],
    [SUCHE_MIT_FUND, []],
    [SUCHE_MIT_FUND, [{ topic: "A", stage: "FACT_CHECK", reason: "x" }]],
    [Object.assign({}, SUCHE_LEER, { rejectionReasons: { ALREADY_COVERED: 4 } }), []],
    [Object.assign({}, SUCHE_LEER, { rejectionReasons: { EVIDENCE_INSUFFICIENT: 9 } }), []],
    [Object.assign({}, SUCHE_LEER, { rejectionReasons: {} }), []]
  ];
  for (const [leiter, ablehnungen] of formen) {
    const g = NoPost.grundAusSuche(leiter, ablehnungen);
    assert.ok(g, "kein Grund fuer " + JSON.stringify(leiter && leiter.rejectionReasons));
    assert.equal(Kadenz.grundZulaessig(g).zulaessig, true,
      "Die Suche nennt einen Grund, der keinen Tag beenden darf: " + g);
  }
});
