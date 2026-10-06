/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/creator-universe.test.mjs

   DAS WATCH UNIVERSE DARF NIEMANDEN BEWERTEN

   §3 verlangt dreierlei: keine handgepflegte Liste als Quelle der
   Wahrheit, Entdeckung ueber YouTube und danach Instagram Business
   Discovery, und ein versioniertes, lernendes Universum - ohne
   Accounts automatisch als gut oder schlecht zu bewerten.

   Das letzte ist das schwerste, weil sich ein Urteil in einem
   harmlosen Feldnamen versteckt. Diese Tests messen es, statt es zu
   versprechen: sie halten ein Urteilsfeld hin und verlangen, dass es
   zurueckgewiesen wird.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const C = require("../engines/creator-universe.js");

const TOPICS = [
  { topicId: "t1", family: "RANKING", entities: ["NVIDIA"] },
  { topicId: "t2", family: "RANKING", entities: ["NVIDIA"] },
  { topicId: "t3", family: "DIVIDEND", entities: ["Allianz"] }
];

function kanal(id, extra) {
  return C.eintrag(Object.assign({
    creatorId: id, platform: "youtube", handle: "@" + id,
    discoveredAt: "2026-09-19T10:00:00Z", discoveredVia: "YOUTUBE_SEARCH",
    discoveredByQuery: "beste aktien", topicIds: ["t1"], families: ["RANKING"]
  }, extra || {}));
}

/* -------------------------------------------- Keine handgepflegte Liste */

test("CD1 · Suchbegriffe stammen aus dem Content Universe, nicht aus einer Liste", () => {
  const q = C.suchbegriffe(TOPICS, {});
  assert.ok(q.length > 0);
  /* Jeder Begriff traegt, aus welchem Thema er stammt. Ein Begriff
     ohne Herkunft waere wieder eine Liste. */
  for (const e of q) assert.ok(e.topicIds.length > 0, e.query);
});

test("CD2 · Eine Entitaet lohnt eine eigene Suche erst, wenn sie wiederkehrt", () => {
  /* Dieselbe Regel wie beim Hashtag-Budget: eine Suche nach einem
     Titel, der genau einmal vorkommt, findet Kanaele, die genau
     einmal passen. */
  const q = C.suchbegriffe(TOPICS, {}).map((e) => e.query);
  assert.ok(q.includes("nvidia aktie analyse"), "NVIDIA kommt in zwei Themen vor");
  assert.equal(q.includes("allianz aktie analyse"), false, "Allianz nur in einem");
});

test("CD3 · Ohne Themen keine Suchbegriffe", () => {
  assert.deepEqual(C.suchbegriffe([], {}), []);
});

/* --------------------------------------------------- Kein Urteil, nirgends */

test("CD4 · Ein Qualitaetsfeld wird zurueckgewiesen", () => {
  for (const feld of C.VERBOTEN_URTEIL) {
    const e = kanal("k1");
    e[feld] = 0.9;
    const p = C.pruefe(e);
    assert.equal(p.ok, false, "Feld " + feld + " muss auffallen");
    assert.equal(p.findings[0].id, "creatorJudgement");
  }
});

test("CD5 · Fremder Inhalt wird zurueckgewiesen, die Adresse nicht", () => {
  for (const feld of C.VERBOTEN_INHALT) {
    const e = kanal("k1");
    e[feld] = "irgendetwas Fremdes";
    assert.equal(C.pruefe(e).ok, false, "Feld " + feld + " muss auffallen");
  }
  /* Ein Handle ist eine Adresse, kein Werk - ohne ihn gibt es keinen
     Aufruf. */
  assert.equal(C.pruefe(kanal("k1")).ok, true);
});

test("CD6 · Ein Universum mit einem beanstandeten Eintrag ist nicht benutzbar", () => {
  const schlecht = kanal("k1");
  schlecht.tier = "A";
  const u = C.universum([kanal("k0"), schlecht], {});
  assert.equal(u.ok, false);
  assert.equal(u.violations.length, 1);
  assert.equal(u.violations[0].creatorId, "k1");
});

test("CD7 · Das Universum sortiert nicht nach Qualitaet", () => {
  const u = C.universum([kanal("k1"), kanal("k2")], {});
  assert.equal(u.rankedByQuality, false);
  for (const e of u.entries) assert.equal(e.isQualityJudgement, false);
});

/* ------------------------------------- Die Naht zwischen den Plattformen */

test("CD8 · Aus einem YouTube-Kanal folgt kein Instagram-Name", () => {
  const e = kanal("k1");
  assert.equal(e.instagramHandle, null);
  assert.equal(e.instagramLinkState, "UNRESOLVED");
});

test("CD9 · Ein Instagram-Name ohne Beleg heisst UNEVIDENCED, nicht bestaetigt", () => {
  /* Der Unterschied zwischen "jemand hat das eingetragen" und "das
     ist belegt" darf nicht verschwinden. */
  const ohne = kanal("k1", { instagramHandle: "beispiel" });
  assert.equal(ohne.instagramLinkState, "UNEVIDENCED");
  const mit = kanal("k2", { instagramHandle: "beispiel",
    instagramLinkEvidence: { source: "channel_link", observedAt: "2026-09-19T10:00:00Z" } });
  assert.equal(mit.instagramLinkState, "EVIDENCED");
});

test("CD10 · Die Entdeckungsreihenfolge steht in den Daten", () => {
  const u = C.universum([], {});
  assert.deepEqual(u.discoveryOrder, ["YOUTUBE_SEARCH", "INSTAGRAM_BUSINESS_DISCOVERY"]);
});

/* --------------------------------------------------- Versioniert und lernend */

test("CD11 · Jede Version zeigt auf ihre Vorgaengerin", () => {
  const v1 = C.universum([kanal("k1")], { version: 1, createdAt: "2026-09-19T10:00:00Z" });
  const v2 = C.lernen(v1, [], { now: "2026-09-26T10:00:00Z" });
  assert.equal(v2.version, 2);
  assert.equal(v2.basedOn, 1);
  assert.ok(v2.changeReason.length > 10);
});

test("CD12 · Eine Version ohne Aenderung ist trotzdem eine Version", () => {
  /* Sie belegt, dass hingesehen wurde. Ohne sie waere "nichts
     passiert" nicht von "niemand hat nachgesehen" zu unterscheiden. */
  const v1 = C.universum([kanal("k1")], { version: 1 });
  const v2 = C.lernen(v1, [], {});
  assert.equal(v2.changed, false);
  assert.equal(v2.version, 2);
});

test("CD13 · Beobachtungen machen aus DISCOVERED ein WATCHED", () => {
  const v1 = C.universum([kanal("k1")], { version: 1 });
  const v2 = C.lernen(v1, [
    { creatorId: "k1", topicId: "t2", observedAt: "2026-09-20T09:00:00Z" }
  ], { now: "2026-09-20T12:00:00Z" });
  const e = v2.entries[0];
  assert.equal(e.state, "WATCHED");
  assert.equal(e.observationCount, 1);
  assert.equal(e.lastObservedAt, "2026-09-20T09:00:00Z");
  /* Das Thema kommt dazu: die Zuordnung waechst aus Beobachtung, nicht
     aus Pflege. */
  assert.ok(e.topicMapping.includes("t2"));
});

test("CD14 · Der Aufstieg wird als Programmrelevanz begruendet, nicht als Qualitaet", () => {
  const v1 = C.universum([kanal("k1")], { version: 1 });
  const v2 = C.lernen(v1, [{ creatorId: "k1", topicId: "t1", observedAt: "2026-09-20T09:00:00Z" }], {});
  const grund = v2.changes[0].reason;
  assert.match(grund, /UNSER Programm/);
  assert.match(grund, /keine Bewertung/);
});

test("CD15 · Ein leeres Fenster entfernt niemanden", () => {
  /* Kein Treffer kann auch heissen: nichts veroeffentlicht, oder wir
     haben nicht hingesehen. Ein einzelnes Fenster unterscheidet das
     nicht. */
  const v1 = C.universum([kanal("k1", { state: "WATCHED" })], { version: 1 });
  const v2 = C.lernen(v1, [], {});
  assert.equal(v2.entries[0].state, "WATCHED");
  assert.equal(v2.entries[0].emptyWindows, 1);
});

test("CD16 · Drei leere Fenster nehmen ihn aus dem Programm — mit dem richtigen Grund", () => {
  let v = C.universum([kanal("k1", { state: "WATCHED" })], { version: 1 });
  for (let i = 0; i < 3; i += 1) v = C.lernen(v, [], {});
  const e = v.entries[0];
  assert.equal(e.state, "RETIRED_NO_PROGRAM_RELEVANCE");
  const grund = v.changes[v.changes.length - 1].reason;
  assert.match(grund, /kein Urteil ueber den Kanal/);
  assert.match(grund, /UNSEREM\s+Programm/);
});

test("CD17 · Eine Beobachtung setzt die leeren Fenster zurueck", () => {
  let v = C.universum([kanal("k1", { state: "WATCHED" })], { version: 1 });
  v = C.lernen(v, [], {});
  v = C.lernen(v, [{ creatorId: "k1", topicId: "t1", observedAt: "2026-09-25T09:00:00Z" }], {});
  assert.equal(v.entries[0].state, "WATCHED");
  assert.equal(v.entries[0].emptyWindows, 0);
});

test("CD17b · Wer in jedem zweiten Fenster liefert, faellt nicht heraus", () => {
  /* Der Zaehler zaehlte einmal nur aufwaerts. Sichtbar wurde das erst
     hier: abwechselnd leer und beobachtet ergibt nach sechs Fenstern
     drei leere - und ein Entfernen, das der Kanal nicht verdient
     haette. "Traegt nichts bei" heisst ununterbrochen nichts. */
  let v = C.universum([kanal("k1", { state: "WATCHED" })], { version: 1 });
  for (let i = 0; i < 6; i += 1) {
    v = C.lernen(v, i % 2 === 0 ? [] :
      [{ creatorId: "k1", topicId: "t1", observedAt: "2026-09-2" + i + "T09:00:00Z" }], {});
  }
  assert.equal(v.entries[0].state, "WATCHED");
  assert.equal(v.entries[0].observationCount, 3);
});

test("CD18 · Neu Entdeckte kommen als DISCOVERED herein, nicht bewertet", () => {
  const v1 = C.universum([], { version: 1 });
  const v2 = C.lernen(v1, [], {
    now: "2026-09-20T10:00:00Z",
    discovered: [{ creatorId: "neu1", platform: "youtube", handle: "@neu1",
      discoveredVia: "YOUTUBE_SEARCH", discoveredByQuery: "beste aktien",
      topicIds: ["t1"], families: ["RANKING"] }]
  });
  assert.equal(v2.entries.length, 1);
  assert.equal(v2.entries[0].state, "DISCOVERED");
  assert.equal(v2.entries[0].discoveredAt, "2026-09-20T10:00:00Z");
  assert.match(v2.changes[0].reason, /Content Universe/);
});

test("CD19 · Derselbe Kanal kommt nicht zweimal herein", () => {
  const v1 = C.universum([kanal("k1")], { version: 1 });
  const v2 = C.lernen(v1, [], {
    discovered: [{ creatorId: "k1", platform: "youtube", handle: "@k1" }]
  });
  assert.equal(v2.entries.length, 1);
});

/* ------------------------------------------------------------ Faehigkeiten */

test("CD20 · Ohne YouTube-Schluessel wird nicht entdeckt — und das ist kein Defekt", () => {
  const c = C.capability({});
  assert.equal(c.canDiscover, false);
  assert.match(c.explanation, /kein Defekt/);
});

test("CD21 · Unbekannte Meta-Verbindung bleibt null und wird nicht zu false", () => {
  /* §7: aus fehlenden lokalen Credentials folgt nicht, dass nichts
     verbunden ist. */
  const c = C.capability({ youtubeReady: true });
  assert.equal(c.metaConnected, null);
  assert.equal(c.canDiscover, true);
  assert.equal(c.canDeepen, false);
  assert.match(c.explanation, /nicht geprueft/);
});

test("CD22 · Vertiefen braucht beides", () => {
  assert.equal(C.capability({ youtubeReady: true, metaConnected: true }).canDeepen, true);
  assert.equal(C.capability({ youtubeReady: false, metaConnected: true }).canDeepen, false);
});
