/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/content-ladder.test.mjs

   DER LEERE TAG AUS DEM FALSCHEN GRUND

   -------------------------------------------------------------------------
   WAS GEMESSEN WURDE
   -------------------------------------------------------------------------

   Die Platte fuehrte 32 Themen aus fuenf Familien; 22 bestanden das
   Evidenztor, und alle 22 waren RANKING - mit 345 Belegen. Der
   produktive Zyklus erzeugte zur selben Zeit drei Pakete, alle
   STOCK_STORY, deren Themen auf der Platte das Evidenztor NICHT
   bestehen.

   run-social-cycle.mjs enthielt kein einziges Vorkommen von "slate".
   build-opportunity-slate.mjs lief in keinem Workflow.

   Die belegstaerkste Familie des Systems hatte damit noch nie einen
   Beitrag erzeugt.

   -------------------------------------------------------------------------
   DIE ZWEI FEHLER, DIE DIESE DATEI VERHINDERT
   -------------------------------------------------------------------------

   1. DER LEERE TAG. Kein Marktsignal, also kein Beitrag - obwohl
      vierzehn Familien nie gefragt wurden.

   2. DER TICKER-FIRST-RUECKFALL MIT EXTRA-SCHRITTEN. Eine Leiter, die
      bei "diese Stufe hatte Themen" abbricht, findet auf Stufe 4 vier
      unbelegte Aktienthemen und hoert auf - waehrend auf Stufe 5
      zweiundzwanzig belegte warten. Sie saehe aus wie Breite und waere
      dieselbe Enge.

   Gezaehlt wird deshalb, was das Evidenztor BESTEHT, nicht was
   vorhanden ist.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const L = require("../engines/content-ladder.js");
const AudienceFrame = require("../engines/audience-frame.js");

/** Ein Thema in der Form, die die Platte schreibt. */
function thema(family, over = {}) {
  return Object.assign({
    topicId: family.toLowerCase() + "_" + Math.random().toString(36).slice(2, 8),
    family,
    title: "Ein Thema aus " + family,
    evidence: [{ id: "e1" }],
    evidenceSufficient: true,
    availability: "AVAILABLE"
  }, over);
}

/* ============================================ Die Leiter selbst */

test("CL1 · Die zehn Stufen stehen in der Reihenfolge des Auftrags", () => {
  assert.equal(L.LEITER.length, 10);
  assert.deepEqual(L.LEITER.map((s) => s.stufe),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(L.LEITER[0].familien, ["NEWS_NOW", "EARNINGS", "MARKET_EXPLAINER"]);
  assert.deepEqual(L.LEITER[4].familien, ["RANKING", "COMPARISON"]);

  /* Die zehnte ist die redaktionelle, und sie fragt keine Familie.
     Stuende dort eine, waere eine sechzehnte Taxonomie entstanden -
     oder eine bestehende wuerde zweimal gefragt. */
  const letzte = L.LEITER[9];
  assert.equal(letzte.id, "EDITORIAL_IDEATION");
  assert.equal(letzte.ideation, true);
  assert.deepEqual(letzte.familien, []);
});

test("CL2 · Jede bestehende Content Family hat genau eine Stufe", () => {
  /* Eine Familie ohne Stufe wuerde nie gefragt - und das faellt nicht
     auf, weil ihr Fehlen wie ein leerer Tag aussieht. Geprueft wird
     gegen die Familien, die es WIRKLICH gibt, nicht gegen eine Liste
     in dieser Datei. */
  const echte = Object.keys(AudienceFrame.HOOK_VORSCHLAG || {});
  assert.ok(echte.length >= 15, "Die Familienliste wurde nicht gefunden.");

  const inLeiter = L.alleFamilien();
  for (const f of echte) {
    assert.ok(inLeiter.includes(f), `Die Familie ${f} steht auf keiner Stufe.`);
  }
  /* Und keine doppelt: zwei Stufen fuer eine Familie hiessen, sie
     zweimal zu fragen und beim zweiten Mal anders zu behandeln. */
  assert.equal(new Set(inLeiter).size, inLeiter.length);
  /* Und keine erfundene. */
  for (const f of inLeiter) {
    assert.ok(echte.includes(f), `Die Leiter kennt eine Familie, die es nicht gibt: ${f}`);
  }
});

/* ============================================ Der Kern: wann abgebrochen wird */

test("CL3 · Eine Stufe mit Themen, aber ohne Belege, beendet die Suche nicht", () => {
  /* DER ZENTRALE FALL, und er ist der reale: Stufe 4 traegt vier
     Aktienthemen ohne hinreichende Evidenz, Stufe 5 zweiundzwanzig
     belegte Ranglisten. */
  const themen = [
    thema("STOCK_STORY", { evidenceSufficient: false }),
    thema("STOCK_STORY", { evidenceSufficient: false }),
    thema("REPORT_STORY", { evidenceSufficient: false }),
    thema("RANKING")
  ];
  const b = L.suche(themen, { benoetigt: 1 });

  assert.equal(b.genug, true);
  assert.equal(b.gefunden.length, 1);
  assert.equal(b.gefunden[0].family, "RANKING",
    "Die Suche brach auf einer Stufe ab, die nichts gefunden hat.");
  assert.equal(b.fallbackDepthReached, 5);
  assert.equal(b.rejectionReasons.EVIDENCE_INSUFFICIENT, 3);
});

test("CL4 · Die Stufenreihenfolge gilt, wenn beide Stufen belegt sind", () => {
  /* Die Leiter ist eine Suchreihenfolge. Ist Stufe 4 belegt, gewinnt
     sie - nicht weil sie besser ist, sondern weil sie zuerst gefragt
     wird. */
  const themen = [thema("RANKING"), thema("STOCK_STORY")];
  const b = L.suche(themen, { benoetigt: 1 });
  assert.equal(b.gefunden[0].family, "STOCK_STORY");
  assert.equal(b.fallbackDepthReached, 4);
});

test("CL5 · Sie sucht weiter, bis genug da ist", () => {
  const themen = [thema("STOCK_STORY"), thema("RANKING"), thema("MEGATREND")];
  const eins = L.suche(themen, { benoetigt: 1 });
  assert.equal(eins.fallbackDepthReached, 4);

  const zwei = L.suche(themen, { benoetigt: 2 });
  assert.equal(zwei.gefunden.length, 2);
  assert.equal(zwei.fallbackDepthReached, 5, "Sie ist nicht tief genug gegangen.");

  const drei = L.suche(themen, { benoetigt: 3 });
  assert.equal(drei.gefunden.length, 3);
  assert.equal(drei.fallbackDepthReached, 6);
});

/* ============================================ Kein leerer Tag aus dem falschen Grund */

test("CL6 · Ohne Marktsignal werden die anderen Familien wirklich gefragt", () => {
  /* §10. Stufe 1 ist leer; die Suche endet nicht, sondern geht
     weiter - und das ist am Nachweis ablesbar, nicht nur am Ergebnis. */
  const themen = [thema("EVERGREEN")];
  const b = L.suche(themen, {
    benoetigt: 1,
    unavailableFamilies: [
      { family: "NEWS_NOW", reason: "Keine Quelle angebunden." },
      { family: "EARNINGS", reason: "Keine Quelle angebunden." },
      { family: "MARKET_EXPLAINER", reason: "Keine Quelle angebunden." }
    ]
  });
  assert.equal(b.genug, true);
  assert.equal(b.gefunden[0].family, "EVERGREEN");
  assert.equal(b.fallbackDepthReached, 8);
  assert.ok(b.familiesConsidered.length >= 12,
    "Es wurden zu wenige Familien gefragt: " + b.familiesConsidered.length);
});

test("CL7 · Unavailable und leer sind verschiedene Gruende", () => {
  /* Eine Familie ohne angebundene Quelle ist etwas anderes als eine
     mit Quelle und ohne Thema. Die Platte kennt den Unterschied; die
     Leiter ebnet ihn nicht ein. */
  const b = L.suche([thema("EVERGREEN")], {
    benoetigt: 1,
    unavailableFamilies: [{ family: "NEWS_NOW", reason: "Keine Quelle." }]
  });
  const stufe1 = b.stufen.find((s) => s.stufe === 1);
  const news = stufe1.familien.find((f) => f.family === "NEWS_NOW");
  const earnings = stufe1.familien.find((f) => f.family === "EARNINGS");

  assert.equal(news.grund, L.ABLEHNUNG.FAMILY_UNAVAILABLE);
  assert.match(news.hinweis, /Keine Quelle/);
  assert.equal(earnings.grund, L.ABLEHNUNG.NO_TOPICS_IN_FAMILY);
  assert.notEqual(news.grund, earnings.grund);
});

/* ============================================ Der Nachweis (§15) */

test("CL8 · Der Befund traegt, was §15 verlangt", () => {
  const b = L.suche([thema("RANKING"), thema("STOCK_STORY", { evidenceSufficient: false })],
    { benoetigt: 1 });

  for (const feld of ["familiesConsidered", "opportunitiesConsidered",
    "fallbackDepthReached", "rejectionReasons", "stufen", "gefunden"]) {
    assert.ok(b[feld] !== undefined, "Im Nachweis fehlt " + feld);
  }
  assert.ok(Array.isArray(b.familiesConsidered));
  assert.equal(typeof b.opportunitiesConsidered, "number");
  assert.equal(typeof b.fallbackDepthReached, "number");
});

test("CL9 · Nicht gefragt ist nicht geprueft", () => {
  /* Die bequemste Unwahrheit dieses Nachweises waere, alle neun
     Stufen als geprueft zu melden, weil es neun gibt. Was die Suche
     nicht erreicht hat, steht getrennt. */
  const b = L.suche([thema("STOCK_STORY")], { benoetigt: 1 });
  assert.equal(b.fallbackDepthReached, 4);
  assert.deepEqual(b.nichtGefragt.map((s) => s.stufe), [5, 6, 7, 8, 9, 10]);

  for (const s of b.nichtGefragt) {
    for (const f of s.familien) {
      assert.ok(!b.familiesConsidered.includes(f),
        `${f} wurde nicht gefragt, steht aber unter familiesConsidered.`);
    }
  }
});

test("CL10 · Die Zaehlung stimmt mit den Stufen ueberein", () => {
  /* Zwei Zahlen fuer dieselbe Sache laufen auseinander. Hier wird die
     Summe gegen die Einzelstufen gehalten. */
  const themen = [thema("RANKING"), thema("RANKING"),
    thema("STOCK_STORY", { evidenceSufficient: false }), thema("MEGATREND")];
  const b = L.suche(themen, { benoetigt: 99 });

  const ausStufen = b.stufen.reduce((n, s) => n + s.qualifiziert, 0);
  assert.equal(ausStufen, b.gefunden.length);

  const themenAusStufen = b.stufen.reduce(
    (n, s) => n + s.familien.reduce((m, f) => m + f.themen, 0), 0);
  assert.equal(themenAusStufen, b.opportunitiesConsidered);
});

/* ============================================ Nichts wird erfunden */

test("CL11 · Eine leere Platte erzeugt keine Gelegenheit", () => {
  /* Der teuerste denkbare Fehler: ein Fixture, das wie Breite
     aussieht. */
  const b = L.suche([], { benoetigt: 1 });
  assert.equal(b.gefunden.length, 0);
  assert.equal(b.genug, false);
  assert.equal(b.fallbackDepthReached, 10, "Sie hat nicht alle Stufen gefragt.");
  assert.equal(b.opportunitiesConsidered, 0);
  assert.match(L.erklaerung(b), /Keine erfuellte/);

  /* Und die redaktionelle Stufe, die IMMER etwas hat, hat trotzdem
     nichts GEFUNDEN. Das ist der Unterschied, auf dem die ganze
     Stufe steht: sie liefert Fragen, keine Gelegenheiten. */
  assert.ok(b.redaktionelleFragenAnzahl > 0,
    "Die redaktionelle Stufe hat nichts geliefert.");
  assert.equal(b.gefunden.length, 0,
    "Eine unbelegte Frage ist in die Fundliste geraten.");
});

test("CL12 · Sie gibt genau die Themen zurueck, die hereinkamen", () => {
  const eins = thema("RANKING", { topicId: "t_eins" });
  const b = L.suche([eins], { benoetigt: 1 });
  assert.equal(b.gefunden[0], eins, "Das Thema wurde unterwegs ersetzt.");
  assert.equal(b.gefunden[0].topicId, "t_eins");
});

test("CL13 · Bereits abgedeckte Themen zaehlen nicht erneut", () => {
  /* §19: der zweite Beitrag des Tages darf den ersten nicht
     wiederholen. */
  const a = thema("RANKING", { topicId: "t_a" });
  const b_ = thema("RANKING", { topicId: "t_b" });
  const b = L.suche([a, b_], { benoetigt: 1, bereitsAbgedeckt: ["t_a"] });
  assert.equal(b.gefunden.length, 1);
  assert.equal(b.gefunden[0].topicId, "t_b");
  assert.equal(b.rejectionReasons.ALREADY_COVERED, 1);
});

test("CL14 · Das Qualifikationstor ist austauschbar, aber nie abwesend", () => {
  /* Die Vorgabe ist das Evidenztor der Platte. Ein Aufrufer darf ein
     strengeres mitgeben - aber keines wegnehmen: ohne `qualifiziert`
     gilt weiterhin die Evidenz, nicht "alles zaehlt". */
  const themen = [thema("RANKING", { evidenceSufficient: false })];
  assert.equal(L.suche(themen, { benoetigt: 1 }).gefunden.length, 0,
    "Ohne eigenes Tor wurde alles durchgelassen.");

  const streng = L.suche([thema("RANKING")], {
    benoetigt: 1, qualifiziert: () => false });
  assert.equal(streng.gefunden.length, 0);
});

/* ============================================ Die Owner-Sprache */

test("CL15 · Die Erklaerung traegt keine Innensprache", () => {
  const b = L.suche([thema("STOCK_STORY", { evidenceSufficient: false })],
    { benoetigt: 1 });
  const satz = L.erklaerung(b);

  for (const code of Object.keys(L.ABLEHNUNG)) {
    assert.ok(!satz.includes(code), "Die Erklaerung nennt den Code " + code);
  }
  for (const feld of ["topicId", "evidenceSufficient", "fallbackDepth",
    "availability", "null", "undefined"]) {
    assert.ok(!satz.includes(feld), "Die Erklaerung nennt " + feld);
  }
  assert.ok(satz.length > 30);
});

/* =========================================================================
   DIE UEBERGABE AN DEN ZYKLUS

   Ein gefundenes Thema nuetzt nichts, wenn es die Form nicht hat, die
   der Zyklus fuer eine Gelegenheit braucht. Diese Tests halten die
   Abbildung fest - und vor allem, was sie NICHT erfindet.
   ========================================================================= */

const Schema = require("../engines/schema.js");

test("CL16 · Die Abbildung haelt das Opportunity-Schema", () => {
  /* Der erste Anlauf reichte `thema.sources` als Herkunft durch - eine
     Liste blanker Namen wie ["VU_DISCOVER"] - und das Schema wies es
     zurueck: "sourceRef.source fehlt". Das war die richtige
     Zurueckweisung. Die Herkunft steht in den Belegen. */
  const t = thema("RANKING", {
    topicId: "topic_ranking:stock:a:b:c",
    title: "Zehn bekannte Namen",
    entities: ["A", "B"],
    sources: ["VU_DISCOVER"],
    timeSensitivity: "TIMELY",
    evidence: [
      { id: "e1", source: "discover.row.x", statement: "…" },
      { id: "e2", source: "quant.factor", statement: "…" },
      { id: "ohne", statement: "ein Beleg ohne Quelle" }
    ]
  });
  const g = L.alsGelegenheit(t, { now: "2026-09-21T09:00:00Z" });

  /* Das Schema wirft, wenn etwas nicht passt - der Aufruf IST die
     Pruefung. */
  const v = Schema.contentOpportunity(g);
  assert.equal(v.topic, "Zehn bekannte Namen");
  assert.deepEqual(v.entities, ["A", "B"]);
  assert.equal(v.timeSensitivity, "TIMELY");

  /* Zwei Belege mit Quelle, einer ohne - der ohne zaehlt nicht als
     Herkunft. */
  assert.equal(v.provenance.length, 2);
  assert.equal(v.provenance[0].source, "discover.row.x");
});

test("CL17 · Die Kennung passt in eine Zeile und kollidiert nicht", () => {
  /* Die Themenkennung der Platte wurde bei einer Rangliste mit zehn
     Titeln 154 Zeichen lang. Gekuerzt wird nicht - eine abgeschnittene
     Kennung kollidiert irgendwann, und die Kollision faellt genau dann
     auf, wenn zwei Themen verschmelzen. */
  const lang = "topic_ranking:stock:" + Array.from({ length: 12 },
    (_, i) => "eine-ziemlich-lange-firma-" + i).join(":");
  const g = L.alsGelegenheit(thema("RANKING", { topicId: lang }));

  assert.ok(g.opportunityId.length <= 40,
    "Die Kennung ist " + g.opportunityId.length + " Zeichen lang.");
  assert.match(g.opportunityId, /^opp_ranking_[0-9a-f]{8}$/);

  /* Und die volle Kennung bleibt lesbar - sonst waere die Spur weg. */
  assert.equal(g.ausDerPlatte.topicId, lang);

  /* Verschiedene Themen, verschiedene Kennungen. */
  const ids = new Set();
  for (let n = 0; n < 200; n += 1) {
    ids.add(L.alsGelegenheit(thema("RANKING", { topicId: "t_" + n })).opportunityId);
  }
  assert.equal(ids.size, 200, "Zwei Themen teilen sich eine Kennung.");

  /* Dieselbe Kennung ergibt denselben Abdruck - sonst waere sie nicht
     wiederfindbar. */
  assert.equal(L.alsGelegenheit(thema("RANKING", { topicId: "stabil" })).opportunityId,
    L.alsGelegenheit(thema("RANKING", { topicId: "stabil" })).opportunityId);
});

test("CL18 · Was das Thema nicht traegt, wird nicht erfunden", () => {
  const g = L.alsGelegenheit(thema("RANKING", {
    topicId: "t_1", title: "Titel", entities: [], evidence: [] }));

  /* Ein Platte-Thema entsteht NICHT aus einem Signal. Die leere Liste
     ist die Wahrheit und kein Mangel: sie unterscheidet die beiden
     Herkuenfte, und das Lernen braucht die Unterscheidung. */
  assert.deepEqual(g.signalIds, []);

  /* Nicht jede Familie hat einen Archetyp - RANKING kommt in der
     Zuordnung gar nicht vor. Einen zu waehlen, damit das Feld gefuellt
     ist, hiesse dem Lernen eine Erzaehlform beizubringen, die niemand
     benutzt hat. */
  assert.equal(g.archetype, null);

  /* Und die Bewertung kommt von aussen. Diese Funktion bewertet
     nicht. */
  assert.equal(g.score, null);
  assert.deepEqual(g.provenance, []);
});

test("CL19 · Die Familie und die Stufe reisen mit", () => {
  /* Ohne sie liesse sich spaeter nicht sagen, aus welcher Familie ein
     Beitrag kam - und §22 verlangt content_family als Lerndimension. */
  const g = L.alsGelegenheit(thema("MEGATREND", { topicId: "t_m" }));
  assert.equal(g.ausDerPlatte.family, "MEGATREND");
  assert.equal(g.ausDerPlatte.stufe, 6);
  assert.equal(g.ausDerPlatte.evidenceSufficient, true);
});

test("CL20 · Ein Thema ohne Kennung ergibt keine Gelegenheit", () => {
  assert.equal(L.alsGelegenheit(null), null);
  assert.equal(L.alsGelegenheit({}), null);
  assert.equal(L.alsGelegenheit({ family: "RANKING" }), null);
});
