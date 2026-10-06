/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/youtube-query-portfolio.test.mjs

   HUNDERT SUCHEN AM TAG — WER BEKOMMT SIE?

   Das Hashtag-Budget und dieses hier sehen gleich aus und verhalten
   sich entgegengesetzt:

     HASHTAG   Oeffnen kostet, Wiederholen ist gratis.
     SUCHE     Oeffnen ist billig, WIEDERHOLEN ist die Ausgabe.

   Wer die eine Logik auf die andere uebertraegt, baut einen Kern, der
   taeglich das ganze Budget frisst. Diese Tests halten die drei Regeln
   fest, die das verhindern: Anteile sind Untergrenzen, der Kern hat
   eine Obergrenze, und ungenutztes Budget verfaellt.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Q = require("../engines/youtube-query-portfolio.js");

function kandidaten(n) {
  const out = [];
  for (let i = 1; i <= n; i += 1) out.push({ query: "phrase " + i, topicIds: ["t" + i] });
  return out;
}
function laufe(stand, auswahl, at, neueKanaele) {
  return Q.record(stand, auswahl.map((s) => Object.assign({}, s,
    { ok: true, newChannels: neueKanaele === undefined ? 2 : neueKanaele })), at);
}

/* --------------------------------------------- Das Budget wird ausgegeben */

test("YQ1 · Ungenutztes Budget verfaellt — also wird es ausgegeben", () => {
  /* Der erste Entwurf rechnete die Anteile als DECKEL: bei Budget 3
     bekam das Ereignis round(3*0.25)=1, Kern und Erkundung waren am
     ersten Tag leer, und zwei Aufrufe verfielen ungenutzt. */
  const p = Q.plan({ candidates: kandidaten(4), state: {}, searchBudget: 3,
    now: "2026-09-20T06:00:00Z" });
  assert.equal(p.selected.length, 3);
  assert.equal(p.withinBudget, true);
});

test("YQ2 · Mehr Budget als Kandidaten erfindet keine Suchen", () => {
  const p = Q.plan({ candidates: kandidaten(2), state: {}, searchBudget: 10,
    now: "2026-09-20T06:00:00Z" });
  assert.equal(p.selected.length, 2);
});

test("YQ3 · Ohne Budget wird nichts gesucht", () => {
  const p = Q.plan({ candidates: kandidaten(5), state: {}, searchBudget: 0,
    now: "2026-09-20T06:00:00Z" });
  assert.deepEqual(p.selected, []);
});

/* ------------------------------------------------------ Die drei Rollen */

test("YQ4 · Was neu ist, hat Vorrang — ein Anlass verdirbt", () => {
  const p = Q.plan({ candidates: kandidaten(4), state: {}, searchBudget: 2,
    now: "2026-09-20T06:00:00Z" });
  assert.equal(p.byRole.EVENT_DRIVEN, 2);
  /* Am ersten Tag ist Unbekanntes ein Anfang, kein Ereignis - die
     VORRANGFOLGE ist beide Male dieselbe, nur die Begruendung nicht.
     Siehe YQ18. */
  for (const s of p.selected) assert.match(s.reason, /unbekannt|Neu im Programm/);
});

test("YQ5 · Am zweiten Tag rotiert das Bekannte, Neues geht weiter vor", () => {
  const kand = kandidaten(4);
  let stand = {};
  const tag1 = Q.plan({ candidates: kand, state: stand, searchBudget: 2,
    now: "2026-09-20T06:00:00Z" });
  stand = laufe(stand, tag1.selected, "2026-09-20T06:00:00Z");
  const tag2 = Q.plan({ candidates: kand, state: stand, searchBudget: 2,
    now: "2026-09-21T06:00:00Z" });
  assert.ok(tag2.byRole.EVENT_DRIVEN > 0, "Die zwei ungelaufenen sind noch neu");
  assert.equal(tag2.selected.length, 2);
});

test("YQ6 · Die Rotation nimmt den, der am laengsten nicht dran war", () => {
  const kand = kandidaten(3);
  let stand = {};
  /* Alle drei laufen, dann kommt nur einer erneut dran. */
  const p1 = Q.plan({ candidates: kand, state: stand, searchBudget: 3,
    now: "2026-09-20T06:00:00Z" });
  stand = laufe(stand, p1.selected, "2026-09-20T06:00:00Z");
  stand = laufe(stand, [p1.selected[0]], "2026-09-22T06:00:00Z");
  const p2 = Q.plan({ candidates: kand, state: stand, searchBudget: 1,
    now: "2026-09-23T06:00:00Z" });
  assert.notEqual(p2.selected[0].query, p1.selected[0].query,
    "Der zuletzt gelaufene kommt zuletzt wieder dran");
});

/* --------------------------------------------- Der Kern hat eine Grenze */

test("YQ7 · Der Kern waechst nicht ueber seine Obergrenze", () => {
  /* Ohne Grenze wanderte jede ergiebige Suche in den Kern - und der
     Kern laeuft TAEGLICH. Nach zwei Tagen war alles Kern und die
     Rotation leer. */
  const kand = kandidaten(10);
  let stand = {};
  for (let t = 20; t <= 26; t += 1) {
    const d = "2026-09-" + t + "T06:00:00Z";
    const p = Q.plan({ candidates: kand, state: stand, searchBudget: 4, now: d });
    stand = laufe(stand, p.selected, d);
    stand = Q.lernen(stand, { maxCore: 2 }).state;
  }
  const kern = Object.keys(stand).filter((q) => stand[q].role === Q.ROLLEN.CORE);
  assert.equal(kern.length, 2);
});

test("YQ8 · Ein voller Kern stellt Aufstiege zurueck und sagt es", () => {
  /* Wer nur am Platz scheitert, darf nicht aussehen, als haette er die
     Schwelle nicht erreicht. */
  const kand = kandidaten(6);
  let stand = {};
  for (let t = 20; t <= 24; t += 1) {
    const d = "2026-09-" + t + "T06:00:00Z";
    const p = Q.plan({ candidates: kand, state: stand, searchBudget: 4, now: d });
    stand = laufe(stand, p.selected, d);
    var l = Q.lernen(stand, { maxCore: 1 });
    stand = l.state;
  }
  assert.equal(l.coreLimit, 1);
  assert.ok(l.promotionDeferredForSpace.length > 0);
  assert.match(l.explanation, /Kern ist voll/);
});

test("YQ9 · Die Rotation ueberlebt den Kern", () => {
  const kand = kandidaten(10);
  let stand = {};
  let letzte = null;
  for (let t = 20; t <= 27; t += 1) {
    const d = "2026-09-" + t + "T06:00:00Z";
    letzte = Q.plan({ candidates: kand, state: stand, searchBudget: 4, now: d });
    stand = laufe(stand, letzte.selected, d);
    stand = Q.lernen(stand, { maxCore: 2 }).state;
  }
  assert.ok(letzte.byRole.ROTATING_EXPLORATION > 0,
    "Ein Kern, der das ganze Budget frisst, ist die starre Liste");
});

test("YQ10 · Eine ausgeschoepfte Kernsuche geht zurueck in die Rotation", () => {
  const stand = {
    "alte suche": Object.assign(Q.eintrag("alte suche", { role: Q.ROLLEN.CORE }),
      { emptyRuns: 3, runCount: 9, lastRunAt: "2026-09-19T06:00:00Z" })
  };
  const l = Q.lernen(stand, { maxCore: 5 });
  assert.equal(l.state["alte suche"].role, Q.ROLLEN.EXPLORATION);
  /* Ausgeschoepft ist kein Urteil ueber die Treffer. */
  assert.match(l.changes[0].reason, /ausgeschoepft, nicht schlecht/);
  /* Und sie wird nicht geloescht - die Rotation kommt wieder vorbei. */
  assert.ok(l.state["alte suche"]);
});

/* ------------------------------------- Unbekannt ist nicht null, auch hier */

test("YQ11 · Ein gescheiterter Lauf ist keine Beobachtung von null Kanaelen", () => {
  /* Dieselbe Lehre wie im Hashtag-Portfolio. Als 0 eingetragen haette
     der Fehlschlag die Suche als ausgeschoepft gelten lassen und sie
     aus dem Kern geworfen - ein Befund aus einer Messung, die nie
     stattgefunden hat. */
  const stand = Q.record({}, [
    { query: "phrase 1", role: Q.ROLLEN.CORE, ok: false, reason: "keyInvalid",
      message: "API key not valid" }
  ], "2026-09-20T06:00:00Z");
  const e = stand["phrase 1"];
  assert.equal(e.newChannelsLastRun, null);
  assert.equal(e.emptyRuns, 0);
  assert.equal(e.lastAttemptFailed, true);
  assert.match(e.attempts[0].message, /not valid/);
});

test("YQ12 · Ein erfolgreicher Lauf mit null neuen Kanaelen ist sehr wohl ein Befund", () => {
  /* Die Gegenprobe: die Unterscheidung darf die echte Messung nicht
     mitverschlucken. */
  const stand = Q.record({}, [
    { query: "phrase 1", role: Q.ROLLEN.CORE, ok: true, newChannels: 0, channels: 12 }
  ], "2026-09-20T06:00:00Z");
  assert.equal(stand["phrase 1"].newChannelsLastRun, 0);
  assert.equal(stand["phrase 1"].emptyRuns, 1);
  assert.equal(stand["phrase 1"].lastAttemptFailed, false);
});

test("YQ13 · Ein Treffer setzt die Reihe leerer Laeufe zurueck", () => {
  let stand = Q.record({}, [{ query: "p", ok: true, newChannels: 0 }], "2026-09-20T06:00:00Z");
  stand = Q.record(stand, [{ query: "p", ok: true, newChannels: 3 }], "2026-09-21T06:00:00Z");
  assert.equal(stand.p.emptyRuns, 0);
});

/* ------------------------------------------------- Nicht in dieselbe Wand */

test("YQ14 · Nach einem terminalen Fehler wird nichts gesucht", () => {
  const stand = Q.record({}, [
    { query: "p", ok: false, reason: "keyInvalid" }
  ], "2026-09-20T06:00:00Z");
  const p = Q.plan({ candidates: kandidaten(5), state: stand, searchBudget: 4,
    now: "2026-09-20T12:00:00Z" });
  assert.equal(p.blockedByTerminalFailure, true);
  assert.deepEqual(p.selected, []);
  assert.ok(p.ownerActionRequired);
  assert.match(p.explanation, /GESPERRT/);
});

test("YQ15 · Ein erschoepftes Tageskontingent sperrt nur bis zum naechsten Tag", () => {
  /* `quotaExceeded` loest sich um Mitternacht Pacific Time von selbst.
     Es braucht keinen Menschen - und darf deshalb auch keinen
     Owner-Schritt melden. */
  const stand = Q.record({}, [
    { query: "p", ok: false, reason: "quotaExceeded" }
  ], "2026-09-20T20:00:00Z");
  const gleicherTag = Q.plan({ candidates: kandidaten(3), state: stand,
    searchBudget: 4, now: "2026-09-20T22:00:00Z" });
  assert.equal(gleicherTag.blockedByTerminalFailure, true);
  assert.equal(gleicherTag.ownerActionRequired, null,
    "Kein Owner-Schritt fuer etwas, das um Mitternacht vergeht");

  const naechsterTag = Q.plan({ candidates: kandidaten(3), state: stand,
    searchBudget: 4, now: "2026-09-22T06:00:00Z" });
  assert.equal(naechsterTag.blockedByTerminalFailure, false);
  assert.ok(naechsterTag.selected.length > 0);
});

test("YQ16 · Ein alter Schluesselfehler sperrt nicht ewig", () => {
  const stand = Q.record({}, [
    { query: "p", ok: false, reason: "keyInvalid" }
  ], "2026-09-01T06:00:00Z");
  const p = Q.plan({ candidates: kandidaten(3), state: stand, searchBudget: 4,
    now: "2026-09-20T06:00:00Z" });
  assert.equal(p.blockedByTerminalFailure, false);
});

test("YQ17 · Jede gewaehlte Suche sagt, warum sie drankommt", () => {
  /* Ein Plan ohne Begruendung je Zeile wird spaeter stillschweigend
     zur starren Liste. */
  const p = Q.plan({ candidates: kandidaten(6), state: {}, searchBudget: 4,
    now: "2026-09-20T06:00:00Z" });
  for (const s of p.selected) {
    assert.ok(s.reason && s.reason.length > 20, s.query);
    assert.ok(Object.values(Q.ROLLEN).includes(s.role));
  }
});

test("YQ18 · Ein Erstlauf wird nicht als Ereignis ausgegeben", () => {
  /* Am ersten Tag ist alles "neu", und alle Zeilen trugen die
     Begruendung "ein Anlass, der drei Tage wartet". Das las sich, als
     waere gerade etwas passiert. Passiert war: wir fangen an. */
  const kalt = Q.plan({ candidates: kandidaten(3), state: {}, searchBudget: 2,
    now: "2026-09-20T06:00:00Z" });
  for (const s of kalt.selected) {
    assert.equal(s.coldStart, true);
    assert.match(s.reason, /Anfang und kein Ereignis/);
  }

  /* Die Gegenprobe: taucht spaeter eine wirklich neue Phrase auf,
     ist sie ein Ereignis. */
  const stand = laufe({}, kalt.selected, "2026-09-20T06:00:00Z");
  const warm = Q.plan({ candidates: kandidaten(4), state: stand, searchBudget: 4,
    now: "2026-09-21T06:00:00Z" });
  const neu = warm.selected.filter((s) => s.role === Q.ROLLEN.EVENT);
  assert.ok(neu.length > 0);
  for (const s of neu) {
    assert.equal(s.coldStart, false);
    assert.match(s.reason, /Neu im Programm/);
  }
});
