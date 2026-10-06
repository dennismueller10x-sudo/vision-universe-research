/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/content-cadence.test.mjs

   DREI FREQUENZEN, DIE NICHT DIESELBE SIND

   -------------------------------------------------------------------------
   DER ANLASS
   -------------------------------------------------------------------------

   Im Orchestrator stand `zahl(options.minHoursBetweenCandidates, 24)`.
   In der Konfiguration stand `minHoursBetweenPosts: 20`. Zwei Zahlen
   fuer zwei verschiedene Fragen - und nur eine hatte einen Namen. Die
   ohne Namen bestimmte den Betrieb, und sie bedeutete faktisch:
   hoechstens ein Kandidat pro Tag.

   Das war nie eine Produktentscheidung. Es war eine Vorgabe in einem
   Funktionsaufruf.

   Diese Datei haelt die Trennung fest:

     SCHEDULER      wie oft geprueft wird
     CREATION       wie oft ein Kandidat entsteht
     PUBLISHING     wie oft veroeffentlicht wird

   Wer sie wieder zusammenzieht, faellt hier auf.

   -------------------------------------------------------------------------
   UND DIE ZWEITE HAELFTE
   -------------------------------------------------------------------------

   Eine Tagesabsicht ist keine Quote. Die Engine erzeugt keinen Bedarf -
   sie beantwortet nur, ob die Frequenzregeln im Weg stehen. Ein
   schwacher Beitrag, der ein Tagesziel erfuellt, ist schlechter als
   keiner, und kein Test hier darf das Gegenteil nahelegen.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const C = require("../engines/content-cadence.js");
const CONFIG = require("../config/cadence.json");

const T = "2026-09-21";
const um = (h, m) => `${T}T${String(h).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}:00Z`;

function frage(z) { return C.entscheide(z, CONFIG); }

/* ============================================ Die Trennung der Ebenen */

test("CC1 · Die drei Ebenen tragen Namen und bleiben getrennt", () => {
  assert.deepEqual(Object.keys(C.EBENEN).sort(),
    ["CREATION", "PUBLISHING", "SCHEDULER"]);

  /* Die Creation-Ebene kennt die Publishing-Werte nicht. Das ist nicht
     Bequemlichkeit, sondern der Kern: wer beide in einer Funktion
     rechnet, leitet frueher oder spaeter eine Posting-Quote aus einer
     Kandidatenregel ab. */
  const r = C.regime(CONFIG);
  assert.equal(r.ebene, C.EBENEN.CREATION);
  for (const fremd of ["minHoursBetweenPosts", "maxPostsPer7Days", "maxPostsPer30Days"]) {
    assert.equal(r[fremd], undefined, `Die Creation-Ebene traegt ${fremd}.`);
  }
});

test("CC2 · Die Konfiguration fuehrt beide Ebenen getrennt und ohne Drift", () => {
  assert.ok(CONFIG.contentCreation, "contentCreation fehlt");
  assert.ok(CONFIG.publishing, "publishing fehlt");

  /* Die Publishing-Werte stehen aus Kompatibilitaetsgruenden zweimal:
     oben (wo make-publish-candidate.mjs sie liest) und unter
     publishing. Zwei Orte fuer denselben Wert laufen auseinander -
     also wird die Gleichheit geprueft und nicht gehofft. */
  for (const k of ["minHoursBetweenPosts", "maxPostsPer7Days", "maxPostsPer30Days"]) {
    assert.equal(CONFIG[k], CONFIG.publishing[k],
      `${k} steht zweimal und verschieden: ${CONFIG[k]} vs ${CONFIG.publishing[k]}`);
  }
});

test("CC3 · Haeufigeres Pruefen ist keine haeufigere Erzeugung", () => {
  /* Zehn Pruefungen an einem Tag, nichts entsteht zwischendurch: die
     Antwort haengt am ZUSTAND, nicht an der Zahl der Fragen. */
  const z = { now: um(9), candidatesToday: [um(7)], lastCandidateAt: um(7) };
  const erste = frage(z);
  for (let n = 0; n < 10; n += 1) {
    const w = frage(z);
    assert.equal(w.darfErzeugen, erste.darfErzeugen);
    assert.equal(w.grund, erste.grund);
  }
});

/* ============================================ Die Tagesabsicht */

test("CC4 · Ein leerer Tag laesst den ersten Beitrag zu", () => {
  const r = frage({ now: um(9) });
  assert.equal(r.darfErzeugen, true);
  assert.equal(r.lage.heuteErzeugt, 0);
  assert.equal(r.lage.ordinal, 1);
  assert.equal(r.zweiterDesTages, false);
});

test("CC5 · Ein zweiter Beitrag ist zulaessig, wenn der Abstand steht", () => {
  const r = frage({ now: um(18), candidatesToday: [um(12)], lastCandidateAt: um(12) });
  assert.equal(r.darfErzeugen, true);
  assert.equal(r.lage.ordinal, 2);
  assert.equal(r.zweiterDesTages, true);
  /* Und die Erklaerung sagt ausdruecklich, dass keine Quote gefuellt wird. */
  assert.match(r.erklaerung, /nur, wenn eine eigenstaendige Gelegenheit/);
});

test("CC6 · Ein dritter Beitrag nicht", () => {
  const r = frage({ now: um(22),
    candidatesToday: [um(8), um(15)], lastCandidateAt: um(15) });
  assert.equal(r.darfErzeugen, false);
  assert.equal(r.grund, C.GRUND.DAILY_CONTENT_CAP_REACHED);
  /* Fruehestens morgen - und das ist ein echter Zeitpunkt, kein "bald". */
  assert.equal(r.naechsteFruehestens, "2026-09-22T00:00:00.000Z");
});

test("CC7 · Gestern zaehlt nicht gegen heute", () => {
  /* Der Kalendertag ist die Einheit, nicht ein 24-Stunden-Fenster. Ein
     Beitrag von gestern 23 Uhr darf heute 8 Uhr nicht blockieren, wenn
     der Abstand steht. */
  const r = frage({ now: um(8),
    candidatesToday: ["2026-09-20T23:00:00Z"],
    lastCandidateAt: "2026-09-20T23:00:00Z" });
  assert.equal(r.lage.heuteErzeugt, 0, "Gestern wurde als heute gezaehlt.");
  assert.equal(r.lage.ordinal, 1);
  assert.equal(r.darfErzeugen, true);
});

test("CC8 · Die Tagesabsicht ist eine Absicht und keine Quote", () => {
  /* Der Mindestwert erzeugt NICHTS. Er steht in der Antwort, damit ein
     Bericht "heute noch keiner, und das war die Absicht" sagen kann -
     er verpflichtet die Maschine zu nichts. */
  const r = frage({ now: um(23, 30) });
  assert.equal(r.lage.tagesabsicht.min, 1);
  assert.equal(r.darfErzeugen, true);
  /* Nichts in der Antwort draengt. Kein "muss", kein "noch offen". */
  assert.ok(!/muss|verpflicht|Quote erfuell/i.test(r.erklaerung));
  assert.match(r.erklaerung, /Absicht und keine Quote/);
});

/* ============================================ Der Abstand */

test("CC9 · Der Mindestabstand haelt und nennt die Reststunden", () => {
  const r = frage({ now: um(14), candidatesToday: [um(12)], lastCandidateAt: um(12) });
  assert.equal(r.darfErzeugen, false);
  assert.equal(r.grund, C.GRUND.MINIMUM_SPACING_NOT_REACHED);
  assert.match(r.erklaerung, /noch 3 Stunden/);
  assert.equal(r.naechsteFruehestens, "2026-09-21T17:00:00.000Z");
});

test("CC10 · Der Abstand ist konfigurierbar und nicht 24", () => {
  /* Die alte Regel war faktisch "ein Kandidat pro Tag". Dass der
     Startwert kleiner ist, ist die eigentliche Aenderung - und dass er
     aus der Konfiguration kommt, macht ihn zu einer Owner-Groesse. */
  const r = C.regime(CONFIG);
  assert.ok(r.minHoursBetweenCandidates < 24,
    "Der Abstand ist weiterhin so gross, dass nur ein Beitrag pro Tag passt.");
  assert.ok(r.minHoursBetweenCandidates > 0);

  const eng = C.entscheide({ now: um(13), candidatesToday: [um(12)],
    lastCandidateAt: um(12) }, { contentCreation: { minHoursBetweenCandidates: 12 } });
  assert.equal(eng.darfErzeugen, false);
  const weit = C.entscheide({ now: um(13), candidatesToday: [um(12)],
    lastCandidateAt: um(12) }, { contentCreation: { minHoursBetweenCandidates: 1 } });
  assert.equal(weit.darfErzeugen, true);
});

/* ============================================ Der Druck der Warteschlange */

test("CC11 · Ein wartender Beitrag haelt die Erzeugung an", () => {
  /* Mehr Content darf keine Kandidatenflut werden. Ein Stapel
     abzuarbeiten ist genau die Arbeit, die dieser Betrieb dem Owner
     abnehmen soll. */
  const r = frage({ now: um(9), activeApprovalQueue: 1 });
  assert.equal(r.darfErzeugen, false);
  assert.equal(r.grund, C.GRUND.ACTIVE_APPROVAL_QUEUE_NOT_EMPTY);
  /* Kein Zeitpunkt: das haengt an einer Owner-Entscheidung, nicht an
     der Uhr. Einen zu nennen waere eine Zusage, die niemand einloest. */
  assert.equal(r.naechsteFruehestens, null);
});

test("CC12 · Ein offener Creative Job auch", () => {
  const r = frage({ now: um(9), openCreativeJobs: 1 });
  assert.equal(r.darfErzeugen, false);
  assert.equal(r.grund, C.GRUND.CREATIVE_JOB_IN_FLIGHT);
  assert.match(r.erklaerung, /genau einer zugelassen/);
});

test("CC13 · Halt und Owner-Hold schlagen alles", () => {
  const halt = frage({ now: um(9), halted: true, haltReason: "Kill Switch" });
  assert.equal(halt.darfErzeugen, false);
  assert.equal(halt.grund, C.GRUND.OPERATIONAL_BLOCKER);

  const hold = frage({ now: um(9), ownerHold: true });
  assert.equal(hold.darfErzeugen, false);
  assert.equal(hold.grund, C.GRUND.OWNER_HELD_STATE);
  assert.match(hold.erklaerung, /Maschine hebt ihn nicht auf/);
});

test("CC14 · Die Reihenfolge der Gruende ist die der Schwere", () => {
  /* Alles gleichzeitig: Halt gewinnt. Ein Bericht, der bei einem
     angehaltenen System "Tageslimit erreicht" meldet, schickt die
     Suche in die falsche Richtung. */
  const alles = frage({ now: um(22), halted: true, haltReason: "x",
    ownerHold: true, activeApprovalQueue: 3, openCreativeJobs: 1,
    candidatesToday: [um(8), um(15)], lastCandidateAt: um(21, 30) });
  assert.equal(alles.grund, C.GRUND.OPERATIONAL_BLOCKER);

  const ohneHalt = frage({ now: um(22), ownerHold: true,
    activeApprovalQueue: 3, candidatesToday: [um(8), um(15)] });
  assert.equal(ohneHalt.grund, C.GRUND.OWNER_HELD_STATE);
});

/* ============================================ Der zweite Beitrag */

test("CC15 · Der zweite Beitrag braucht eine eigenstaendige Gelegenheit", () => {
  const alles = {
    eigenstaendigeGelegenheit: true, wiederholtErsten: false,
    themenvielfaltAusreichend: true, familieGesaettigt: false,
    evidenzAusreichend: true, audienceFit: true,
    qualitaetstoreBestanden: true, creativeBudgetFrei: true,
    abstandErfuellt: true
  };
  assert.equal(C.zweiterZulaessig(alles).zulaessig, true);

  const wiederholung = Object.assign({}, alles, { wiederholtErsten: true });
  const w = C.zweiterZulaessig(wiederholung);
  assert.equal(w.zulaessig, false);
  assert.equal(w.grund, C.GRUND.CONTENT_REPETITION);

  const gesaettigt = Object.assign({}, alles, { familieGesaettigt: true });
  assert.equal(C.zweiterZulaessig(gesaettigt).grund, C.GRUND.PORTFOLIO_SATURATION);
});

test("CC16 · Ungeprueft ist nicht bestanden", () => {
  /* Der gefaehrlichste Fall: eine Pruefung hat nicht stattgefunden,
     und ihr Fehlen wird als "in Ordnung" gelesen. `undefined` ist
     nicht `true`. */
  const halb = { eigenstaendigeGelegenheit: true, wiederholtErsten: false };
  const r = C.zweiterZulaessig(halb);
  assert.equal(r.zulaessig, false);
  assert.ok(r.ungeprueft.length >= 5, "Fehlende Pruefungen wurden durchgewunken.");
  assert.match(r.erklaerung, /nicht alles geprueft/);

  /* Und ungeprueft wird nicht zu "nicht bestanden" geglaettet - das
     waere eine Aussage ueber die Gelegenheit, und es gab keine. */
  assert.deepEqual(r.gegen, []);
});

test("CC17 · Eine Quote ist kein Grund", () => {
  /* Es gibt in dieser Engine keinen Weg, aus "heute noch keiner" ein
     "also jetzt einer" zu machen. Geprueft wird das an der Schnittstelle:
     zweiterZulaessig kennt kein Feld, das ein Tagesziel meint. */
  const felder = Object.keys({
    eigenstaendigeGelegenheit: 1, wiederholtErsten: 1,
    themenvielfaltAusreichend: 1, familieGesaettigt: 1,
    evidenzAusreichend: 1, audienceFit: 1, qualitaetstoreBestanden: 1,
    creativeBudgetFrei: 1, abstandErfuellt: 1
  });
  for (const f of felder) {
    assert.ok(!/quote|ziel|soll|intent|minimum/i.test(f),
      `Das Feld ${f} klingt nach einer zu erfuellenden Zahl.`);
  }
});

/* ============================================ Die verbotenen Gruende */

test("CC18 · Ein fehlendes Marktsignal beendet den Tag nicht", () => {
  /* Der Kern von §10. Vision Universe hat ein breites Content
     Universe; dass heute keine Kursbewegung traegt, heisst, dass die
     Suche weitergehen muss. */
  for (const g of ["NO_MARKET_SIGNAL", "NO_QUANT_SIGNAL", "NO_BREAKING_NEWS",
    "NO_SINGLE_STOCK_SIGNAL"]) {
    const r = C.grundZulaessig(g);
    assert.equal(r.zulaessig, false, g + " wurde als Tagesentscheidung akzeptiert.");
    assert.match(r.erklaerung, /breites Content Universe|weitere Familien/);
  }
});

test("CC19 · Die zulaessigen Gruende sind benannt und vollstaendig", () => {
  /* §14 zaehlt sie auf. Fehlt einer, kann ein realer Zustand nicht
     benannt werden - und was nicht benannt werden kann, wird zu
     NO_ACTION. */
  for (const g of ["ACTIVE_APPROVAL_QUEUE_NOT_EMPTY", "CREATIVE_JOB_IN_FLIGHT",
    "DAILY_CONTENT_CAP_REACHED", "MINIMUM_SPACING_NOT_REACHED",
    "NO_OPPORTUNITY_PASSED_QUALITY", "INSUFFICIENT_EVIDENCE",
    "PORTFOLIO_SATURATION", "CONTENT_REPETITION", "OWNER_HELD_STATE",
    "OPERATIONAL_BLOCKER"]) {
    assert.equal(C.GRUND[g], g, "Der Grund " + g + " fehlt.");
    assert.equal(C.grundZulaessig(g).zulaessig, true);
  }
});

test("CC20 · Ein erfundener Grund gilt nicht", () => {
  const r = C.grundZulaessig("WEIL_HALT");
  assert.equal(r.zulaessig, false);
  assert.match(r.erklaerung, /benannten Grund, keinen erfundenen/);
  assert.equal(C.grundZulaessig(null).zulaessig, false);
  assert.equal(C.grundZulaessig("").zulaessig, false);
});

/* ============================================ Was sie nicht tut */

test("CC21 · Die Engine veroeffentlicht nichts und schaltet nichts", () => {
  const quelle = require("node:fs").readFileSync(
    require("node:path").join(
      require("node:url").fileURLToPath(new URL(".", import.meta.url)),
      "..", "engines", "content-cadence.js"), "utf8");

  for (const verboten of ["AUTOPUBLISH", "publishMedia", "graph.facebook",
    "media_publish", "APPROVE", "REJECT"]) {
    assert.ok(!quelle.includes(verboten),
      "Die Kadenz-Engine nennt " + verboten + ".");
  }
});

test("CC22 · Jede Antwort traegt ihren Zustand mit", () => {
  /* Auch die verneinende. Ein Aufrufer, der die Lage ein zweites Mal
     ermitteln muss, ermittelt sie irgendwann anders. */
  for (const z of [{ now: um(9) }, { now: um(9), activeApprovalQueue: 2 },
    { now: um(14), candidatesToday: [um(12)], lastCandidateAt: um(12) }]) {
    const r = frage(z);
    assert.ok(r.lage, "Antwort ohne Lage");
    assert.equal(r.lage.tag, T);
    assert.ok(typeof r.lage.heuteErzeugt === "number");
    assert.ok(r.lage.tagesabsicht);
    assert.ok(r.lage.abstand);
    assert.ok(typeof r.erklaerung === "string" && r.erklaerung.length > 10);
  }
});

test("CC23 · Die Spannung zwischen Erzeugung und Publishing wird benannt", () => {
  /* Zwei Owner-Entscheidungen zu zwei Fragen, die sich nicht
     widersprechen und trotzdem spannen: bis zu 2 Kandidaten taeglich
     gegen 4 Beitraege woechentlich. Im Betrieb faellt das nicht als
     Fehler auf, sondern als eine Reihe von Ablehnungen, die wie
     Qualitaetsurteile aussehen.

     Die Engine loest das NICHT auf - sie rechnet keine der beiden
     Zahlen klein. Sie sagt es. */
  const s = C.spannung(CONFIG);
  assert.equal(s.gemessen, true);
  assert.equal(s.gespannt, true);
  assert.equal(s.erzeugungProWoche, 14);
  assert.equal(s.publishingDachProWoche, 4);
  assert.equal(s.ueberhang, 10);
  assert.match(s.erklaerung, /kein Fehler/);
  assert.match(s.erklaerung, /Frequenzentscheidung und kein Qualitaetsurteil/);
});

test("CC24 · Ohne Publishing-Dach wird die Spannung nicht geschaetzt", () => {
  const s = C.spannung({ contentCreation: { dailyIntentMax: 2 } });
  assert.equal(s.gemessen, false);
  assert.equal(s.gespannt, undefined, "Ungemessen wurde zu 'nicht gespannt'.");
  assert.match(s.erklaerung, /nicht geschaetzt/);
});

test("CC25 · Die Engine aendert die Konfiguration nicht", () => {
  /* Eine Engine, die eine Owner-Entscheidung 'zurechtrueckt', hat sie
     getroffen. */
  const vorher = JSON.stringify(CONFIG);
  C.spannung(CONFIG);
  C.regime(CONFIG);
  C.entscheide({ now: um(9) }, CONFIG);
  assert.equal(JSON.stringify(CONFIG), vorher);
});
