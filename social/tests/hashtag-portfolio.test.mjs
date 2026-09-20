/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/hashtag-portfolio.test.mjs

   Meta erlaubt 30 EINZIGARTIGE Hashtags je rollierendem 7-Tage-Fenster.
   Eine erneute Abfrage desselben Hashtags innerhalb dieser Tage zaehlt
   NICHT noch einmal.

   Wer das verwechselt, haelt haeufiges Nachsehen fuer teuer und breites
   Streuen fuer billig - und es ist genau umgekehrt.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const H = require("../engines/hashtag-portfolio.js");
const U = require("../engines/content-universe.js");

const THEMEN = [
  U.topic({ family: "RANKING", entityType: "STOCK",
    entities: ["Nvidia", "Apple", "Okeanis Eco Tankers"],
    sources: ["VU_DISCOVER"], slug: "r1", title: "Starke Bilanzen" }),
  U.topic({ family: "RANKING", entityType: "STOCK",
    entities: ["Nvidia", "Microsoft"], sources: ["VU_DISCOVER"],
    slug: "r2", title: "Momentum" }),
  U.topic({ family: "EDUCATION", entityType: "NONE",
    sources: ["VU_MAGAZINE"], title: "Was ist ein ETF?" })
];

const JETZT = "2026-09-19T12:00:00Z";

/* ------------------------------------------------------------------ */
/* DIE KNAPPE RESSOURCE IST DER HASHTAG                                */
/* ------------------------------------------------------------------ */

test("HP1 · Eine erneute Abfrage im offenen Fenster kostet keinen Platz", () => {
  const nach = H.record({}, [{ hashtag: "aktien" }], JETZT);
  const z = H.fensterZustand(nach.aktien, "2026-09-22T12:00:00Z");
  assert.equal(z.state, "OPEN");
  assert.equal(z.costsSlot, false);
});

test("HP2 · Nach sieben Tagen ist der Platz wieder frei", () => {
  const nach = H.record({}, [{ hashtag: "aktien" }], JETZT);
  const z = H.fensterZustand(nach.aktien, "2026-09-27T12:00:00Z");
  assert.equal(z.state, "FREE");
  assert.equal(z.costsSlot, true);
});

test("HP3 · firstQueriedAt wird nie ueberschrieben", () => {
  /* Wer es bei jeder Abfrage neu setzt, verlaengert das Fenster
     scheinbar endlos und ueberschreitet die Grenze, ohne es zu merken. */
  let s = H.record({}, [{ hashtag: "aktien" }], JETZT);
  s = H.record(s, [{ hashtag: "aktien" }], "2026-09-21T12:00:00Z");
  assert.equal(s.aktien.firstQueriedAt, JETZT);
  assert.equal(s.aktien.lastQueriedAt, "2026-09-21T12:00:00Z");
  assert.equal(s.aktien.queryCount, 2);
});

test("HP4 · Der Plan ueberschreitet den Rahmen nie still", () => {
  const voll = {};
  for (let i = 0; i < 30; i++) {
    voll["tag" + i] = { hashtag: "tag" + i, firstQueriedAt: JETZT, queryCount: 1 };
  }
  const p = H.plan({ topics: THEMEN, now: JETZT, state: voll });
  assert.equal(p.slotsRequested, 0);
  assert.equal(p.withinLimit, true);
  assert.equal(p.windowFree, 0);
  assert.ok(p.deferred.length > 0, "Was nicht geht, wird benannt.");
});

test("HP5 · Ein Budget, das am ersten Tag leer ist, ist kein Portfolio", () => {
  /* Der erste Entwurf oeffnete alle dreissig Plaetze im ersten Lauf -
     formal innerhalb der Grenze, praktisch eine Woche Blindheit. */
  const p = H.plan({ topics: THEMEN, coreHashtags: ["aktien"], now: JETZT, state: {} });
  assert.ok(p.slotsRequested <= p.maxNewPerRun);
  assert.ok(p.spendableThisRun < p.windowFree,
    "Eine Reserve muss fuer Unvorhergesehenes bleiben.");
  assert.ok(p.reserveSlots > 0);
});

/* ------------------------------------------------------------------ */
/* KANDIDATEN AUS DEM CONTENT UNIVERSE, NICHT AUS EINER LISTE          */
/* ------------------------------------------------------------------ */

test("HP6 · Jeder Kandidat traegt seine Herkunft", () => {
  /* Ein Hashtag ohne Herkunft waere wieder eine gepflegte Liste. */
  const k = H.kandidaten(THEMEN);
  assert.ok(k.length > 0);
  for (const x of k) {
    assert.ok(x.topicIds.length > 0, "#" + x.hashtag + " gehoert zu keinem Thema.");
    assert.ok(x.families.length > 0);
  }
});

test("HP7 · Eine Entitaet muss im Programm wiederkehren", () => {
  /* Ein Platz kauft eine Antwort. Eine Entitaet, die genau einmal
     vorkommt, beantwortet eine Frage ueber einen Titel - zu wenig
     unter dreissig Plaetzen, die eine Woche halten muessen. */
  const k = H.kandidaten(THEMEN);
  const namen = k.map((x) => x.hashtag);
  assert.ok(namen.includes("nvidia"), "Nvidia steht in zwei Themen.");
  assert.ok(!namen.includes("okeaniseco" ) && !namen.includes("okeanisecotankers"),
    "Okeanis steht nur in einem Thema.");
});

test("HP8 · Rechtsform und Aktienklasse gehoeren in kein Hashtag", () => {
  assert.equal(H.normalisiere("Charter Communications Class A"), "chartercommunications");
  assert.equal(H.normalisiere("Exxon Mobil Corporation"), "exxonmobil");
  assert.equal(H.normalisiere("#Aktien"), "aktien");
});

/* ------------------------------------------------------------------ */
/* AUSGEBEN, MESSEN, NICHT WIEDERHOLEN                                 */
/* ------------------------------------------------------------------ */

test("HP9 · Ein leer beobachteter Hashtag wird nicht erneut geoeffnet", () => {
  const s = H.record({}, [{ hashtag: "nvidia", observedMediaCount: 0 }], JETZT);
  const p = H.plan({ topics: THEMEN, now: "2026-09-27T13:00:00Z", state: s });
  assert.ok(p.retiredAsEmpty.some((x) => x.hashtag === "nvidia"));
  assert.ok(!p.newQueries.some((q) => q.hashtag === "nvidia"));
});

test("HP10 · Leer ist ein Befund, kein Urteil", () => {
  const s = H.record({}, [{ hashtag: "nvidia", observedMediaCount: 0 }], JETZT);
  const p = H.plan({ topics: THEMEN, now: "2026-09-27T13:00:00Z", state: s });
  assert.match(p.retiredAsEmpty[0].reason, /Befund, kein Urteil/);
});

test("HP11 · Der Bestand haelt fest, was der Auftrag verlangt", () => {
  const s = H.record({}, [{ hashtag: "etf", topicIds: ["t1"], families: ["ETF_PRODUCT"],
    observedMediaCount: 42, role: "CORE", edge: "top" }], JETZT);
  const e = s.etf;
  for (const f of ["hashtag", "firstQueriedAt", "lastQueriedAt", "queryCount",
                   "topicMapping", "contentFamilyMapping", "observedMediaCount",
                   "trendObservations", "provenance"]) {
    assert.ok(f in e, "Feld " + f + " fehlt.");
  }
  assert.equal(e.observedMediaCount, 42);
  assert.equal(e.trendObservations.length, 1);
  assert.equal(e.provenance[0].source, "meta.instagram.hashtag_search");
});

test("HP12 · Auffrischung und Neuoeffnung werden getrennt ausgewiesen", () => {
  /* Sonst sieht ein Plan teuer aus, der es nicht ist - oder umgekehrt. */
  let s = H.record({}, [{ hashtag: "aktien" }], JETZT);
  const p = H.plan({ topics: THEMEN, coreHashtags: ["aktien"],
    now: "2026-09-20T12:00:00Z", state: s });
  assert.ok(p.refresh.some((r) => r.hashtag === "aktien"));
  assert.ok(!p.newQueries.some((q) => q.hashtag === "aktien"));
  assert.match(p.refresh[0].reason, /kostet keinen Platz/);
});

/* ================================ Ein Versuch ist keine Beobachtung (HP20+) */

test("HP20 · Ein gescheiterter Versuch setzt observedMediaCount nicht auf 0", () => {
  /* Der erste echte Lauf kam mit acht `permissionRevoked` zurueck.
     Als 0 Medien eingetragen haette das behauptet, die Hashtags seien
     leer - gefragt wurden sie nie. */
  const nach = H.record({}, [
    { hashtag: "aktien", ok: false, reason: "permissionRevoked",
      message: "Die noetige Berechtigung fehlt oder wurde entzogen." }
  ], "2026-09-19T18:00:00Z");
  assert.equal(nach.aktien.observedMediaCount, null);
  assert.equal(nach.aktien.lastAttemptFailed, true);
  assert.equal(nach.aktien.attempts.length, 1);
  assert.equal(nach.aktien.attempts[0].reason, "permissionRevoked");
  /* Die Meldung der Plattform reist mit - sie nennt, WAS fehlt. */
  assert.match(nach.aktien.attempts[0].message, /Berechtigung/);
});

test("HP21 · Gegen das Budget zaehlt der Versuch trotzdem", () => {
  /* Ob Meta einen Platz verbraucht, wenn die Suche scheitert, wissen
     wir von hier aus nicht. Bei dreissig je sieben Tagen ist die
     teurere Annahme die richtige. */
  const nach = H.record({}, [
    { hashtag: "aktien", ok: false, reason: "permissionRevoked" }
  ], "2026-09-19T18:00:00Z");
  assert.equal(nach.aktien.firstQueriedAt, "2026-09-19T18:00:00Z");
  assert.equal(nach.aktien.queryCount, 1);
  assert.equal(nach.aktien.attempts[0].countedAgainstWindow, true);
});

test("HP22 · Ein ungefragter Hashtag wird nicht als leer ausgemustert", () => {
  /* Ohne diese Unterscheidung haette ein gescheiterter Lauf acht
     Hashtags fuer das naechste Fenster gesperrt - mit der Begruendung
     "nur 0 Medien beobachtet", aus einer Messung, die nie stattfand. */
  const bestand = H.record({}, [
    { hashtag: "aktien", ok: false, reason: "permissionRevoked" }
  ], "2026-09-19T18:00:00Z");
  const p = H.plan({
    topics: [{ topicId: "t1", family: "RANKING", entities: [] }],
    coreHashtags: ["aktien"], state: bestand,
    now: "2026-09-27T18:00:00Z"
  });
  const zurueck = (p.deferredAsEmpty || p.retiredAsEmpty || []).map((x) => x.hashtag);
  assert.equal(zurueck.includes("aktien"), false,
    "Ungefragt ist nicht leer");
});

test("HP23 · Ein echter Leerbefund mustert weiterhin aus", () => {
  /* Die Gegenprobe: die Regel darf nicht verschwinden, nur weil sie
     jetzt genauer hinsieht. */
  const bestand = H.record({}, [
    { hashtag: "aktien", ok: true, observedMediaCount: 0 }
  ], "2026-09-19T18:00:00Z");
  assert.equal(bestand.aktien.observedMediaCount, 0);
  assert.equal(bestand.aktien.lastAttemptFailed, false);
  const p = H.plan({
    topics: [{ topicId: "t1", family: "RANKING", entities: [] }],
    coreHashtags: ["aktien"], state: bestand,
    now: "2026-09-27T18:00:00Z"
  });
  const zurueck = (p.deferredAsEmpty || p.retiredAsEmpty || []).map((x) => x.hashtag);
  assert.equal(zurueck.includes("aktien"), true);
});

test("HP24 · Nach einem terminalen Fehler werden keine neuen Plaetze ausgegeben", () => {
  /* Zwei Laeufe gegen dieselbe fehlende Berechtigung waeren sechzehn
     moeglicherweise verbrauchte Plaetze und null Beobachtungen. */
  const bestand = H.record({}, [
    { hashtag: "aktien", ok: false, reason: "permissionRevoked" }
  ], "2026-09-19T18:00:00Z");
  const p = H.plan({
    topics: THEMEN, coreHashtags: ["boerse", "etf"], state: bestand,
    now: "2026-09-20T09:00:00Z"
  });
  assert.equal(p.blockedByTerminalFailure, true);
  assert.equal(p.newQueries.length, 0);
  assert.ok(p.ownerActionRequired);
  assert.equal(p.ownerActionRequired.reason, "permissionRevoked");
  assert.match(p.explanation, /GESPERRT/);
});

test("HP25 · Die kostenlose Auffrischung laeuft weiter — sie kostet keinen Platz", () => {
  /* Sobald die Berechtigung da ist, liefert der naechste Lauf sofort,
     ohne einen weiteren Platz auszugeben. Die Sperre darf das nicht
     mitnehmen. */
  const bestand = H.record({}, [
    { hashtag: "aktien", ok: false, reason: "permissionRevoked" }
  ], "2026-09-19T18:00:00Z");
  const p = H.plan({
    topics: THEMEN, coreHashtags: ["aktien"], state: bestand,
    now: "2026-09-20T09:00:00Z"
  });
  assert.ok(p.refresh.some((r) => r.hashtag === "aktien"));
});

test("HP26 · Ein nicht-terminaler Fehler sperrt nicht", () => {
  /* Eine Ratenbegrenzung geht vorbei; eine fehlende Berechtigung nicht.
     Die Sperre gilt nur dem, was ein Mensch beheben muss. */
  const bestand = H.record({}, [
    { hashtag: "aktien", ok: false, reason: "rateLimited" }
  ], "2026-09-19T18:00:00Z");
  const p = H.plan({
    topics: THEMEN, coreHashtags: ["boerse"], state: bestand,
    now: "2026-09-20T09:00:00Z"
  });
  assert.equal(p.blockedByTerminalFailure, false);
  assert.ok(p.newQueries.length > 0);
});

test("HP27 · Nach dem Fenster sperrt ein alter Fehler nicht mehr", () => {
  /* Ein Befund von vor acht Tagen ist kein Befund ueber heute. Sonst
     bliebe das Portfolio fuer immer stehen. */
  const bestand = H.record({}, [
    { hashtag: "aktien", ok: false, reason: "permissionRevoked" }
  ], "2026-09-01T18:00:00Z");
  const p = H.plan({
    topics: THEMEN, coreHashtags: ["boerse"], state: bestand,
    now: "2026-09-20T09:00:00Z"
  });
  assert.equal(p.blockedByTerminalFailure, false);
});
