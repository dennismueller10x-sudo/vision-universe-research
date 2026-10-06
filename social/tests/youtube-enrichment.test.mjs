/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/youtube-enrichment.test.mjs

   DER BILLIGE WEG — UND DIE ZUSICHERUNG, DIE IHN BILLIG HAELT

   Was ein Kanal zuletzt veroeffentlicht hat, laesst sich auf zwei Wegen
   erfahren: mit `search.list` (ein Platz von hundert je Kanal) oder
   ueber Uploads-Playlist, Playlist-Eintraege und Videos (drei Einheiten
   von zehntausend).

   Seit der Quotenkorrektur sind das verschiedene Waehrungen, und die
   Wahl ist damit keine Optimierung mehr, sondern eine Architektur:
   hundert Kanaele anzureichern kostet 300 Einheiten und KEINEN
   Suchaufruf.

   Diese Tests halten beides fest - die Zusicherung und das, was
   dabei nicht gespeichert wird.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ausVideo, planeAnreicherung } from "../../scripts/social/enrich-youtube-metrics.mjs";

/* Ein Video mit allem, was nicht mit darf. */
const VIDEO = {
  id: "vid_1",
  snippet: {
    title: "Warum 90 % der Anleger genau jetzt den groessten Fehler machen",
    description: "In diesem Video zeige ich dir mein komplettes Depot.",
    channelTitle: "Boerse einfach erklaert",
    publishedAt: "2026-09-18T10:00:00Z",
    thumbnails: { high: { url: "https://example.invalid/bild.jpg" } }
  },
  statistics: { viewCount: "48231", likeCount: "1920", commentCount: "143" }
};

const KONTEXT = { now: "2026-09-19T18:00:00Z", creatorId: "UC_aaa",
  discoveredByQuery: "beste aktien", topicCategory: "t1" };

/* ------------------------------------------ Der Titel geht nicht heraus */

test("YE1 · Kein Buchstabe des Titels oder der Beschreibung wird gespeichert", () => {
  const raus = JSON.stringify(ausVideo(VIDEO, KONTEXT));
  for (const fremd of ["Anleger", "groessten", "Fehler", "komplettes Depot",
                       "Boerse einfach", "example.invalid"]) {
    assert.equal(raus.includes(fremd), false,
      "\"" + fremd + "\" darf nicht in der Beobachtung stehen");
  }
});

test("YE2 · Der Titel wird gelesen — daraus entsteht ein Archetyp", () => {
  /* Gelesen und nicht gespeichert ist der Unterschied. Ein Modul, das
     den Titel gar nicht anfasst, koennte auch keinen Hook-Archetyp
     bestimmen. */
  const o = ausVideo(VIDEO, KONTEXT);
  assert.equal(o.hookArchetype, "QUESTION");
  assert.equal(o.formatPattern, "SHORT_VIDEO");
});

test("YE3 · Dieselbe Abstraktion wie bei Instagram, nicht eine zweite", () => {
  /* Zwei Abstraktionswege waeren zwei Musterbegriffe - ein Vergleich
     zwischen den Plattformen waere dann eine Rechnung ueber zwei
     verschiedene Dinge. */
  const o = ausVideo(VIDEO, KONTEXT);
  for (const feld of ["hookArchetype", "formatPattern", "visualPattern",
                      "storyPattern", "engagementRelative"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(o, feld), feld);
  }
  /* Ohne Bildanalyse wird das Bildmuster auch hier nicht geraten. */
  assert.equal(o.visualPattern, null);
});

/* --------------------------------------------- Unbekannt bleibt unbekannt */

test("YE4 · Abgeschaltete Likes sind null, nicht 0", () => {
  /* YouTube laesst Likes und Kommentare verbergen. Eine Null waere die
     Aussage "niemand hat reagiert" - sie waere falsch und wuerde jeden
     Mittelwert nach unten ziehen. */
  const ohne = { id: "v2", snippet: { title: "Ein Titel", publishedAt: "2026-09-18T10:00:00Z" },
    statistics: { viewCount: "1000" } };
  const o = ausVideo(ohne, KONTEXT);
  assert.equal(o.publicEngagement.likes, null);
  assert.equal(o.publicEngagement.comments, null);
  assert.equal(o.publicEngagement.views, 1000);
  /* Ohne Likes gibt es auch kein Verhaeltnis - und es wird keins geraten. */
  assert.equal(o.engagementRelative, null);
});

test("YE5 · Die Herkunft reist mit", () => {
  const o = ausVideo(VIDEO, KONTEXT);
  assert.equal(o.provenance.platform, "youtube");
  assert.equal(o.provenance.creatorId, "UC_aaa");
  assert.equal(o.provenance.discoveredByQuery, "beste aktien");
  assert.equal(o.topicCategory, "t1");
});

/* ------------------------------------------------- Die Zusicherung: 0 Suchen */

test("YE6 · Die Anreicherung verbraucht keinen einzigen Suchaufruf", () => {
  const p = planeAnreicherung({
    universe: { entries: Array.from({ length: 50 }, (_, i) => ({
      creatorId: "UC_" + i, platform: "youtube", state: "WATCHED" })) }
  });
  assert.equal(p.searchCallsUsed, 0);
  assert.match(p.explanation, /KEIN Suchaufruf/);
});

test("YE7 · Hundert Kanaele kosten 300 Einheiten, nicht hundert Plaetze", () => {
  /* Die Zahl, die die ganze Korrektur wert macht. */
  const p = planeAnreicherung({
    maxChannelsPerRun: 100,
    universe: { entries: Array.from({ length: 100 }, (_, i) => ({
      creatorId: "UC_" + i, platform: "youtube", state: "WATCHED" })) }
  });
  assert.equal(p.channels.length, 100);
  assert.equal(p.estimatedUnits, 300);
  assert.equal(p.withinQuota, true);
});

test("YE8 · Ein knapper allgemeiner Topf verkleinert den Plan", () => {
  const p = planeAnreicherung({
    unitsUsedToday: 9994,
    universe: { entries: Array.from({ length: 50 }, (_, i) => ({
      creatorId: "UC_" + i, platform: "youtube", state: "WATCHED" })) }
  });
  assert.equal(p.channels.length, 2, "6 freie Einheiten tragen zwei Kanaele");
  assert.equal(p.withinQuota, true);
});

test("YE9 · Ausgemusterte Kanaele werden nicht angereichert", () => {
  /* Wer nicht mehr zum Programm beitraegt, kostet auch keine Einheiten
     mehr - aber er bleibt im Universum stehen. */
  const p = planeAnreicherung({
    universe: { entries: [
      { creatorId: "UC_a", platform: "youtube", state: "WATCHED" },
      { creatorId: "UC_b", platform: "youtube", state: "RETIRED_NO_PROGRAM_RELEVANCE" },
      { creatorId: "IG_c", platform: "instagram", state: "WATCHED" }
    ] }
  });
  assert.equal(p.channels.length, 1);
  assert.equal(p.channels[0].creatorId, "UC_a");
});

test("YE10 · Wer am laengsten nicht dran war, kommt zuerst", () => {
  const p = planeAnreicherung({
    maxChannelsPerRun: 2,
    universe: { entries: [
      { creatorId: "UC_neu", platform: "youtube", state: "WATCHED",
        lastEnrichedAt: "2026-09-19T00:00:00Z" },
      { creatorId: "UC_alt", platform: "youtube", state: "WATCHED",
        lastEnrichedAt: "2026-09-01T00:00:00Z" },
      { creatorId: "UC_nie", platform: "youtube", state: "WATCHED" }
    ] }
  });
  assert.equal(p.channels[0].creatorId, "UC_nie", "Noch nie angereichert zuerst");
  assert.equal(p.channels[1].creatorId, "UC_alt");
});

test("YE11 · Ein leeres Universum ist kein Fehler", () => {
  const p = planeAnreicherung({ universe: { entries: [] } });
  assert.deepEqual(p.channels, []);
  assert.equal(p.withinQuota, true);
  assert.equal(p.estimatedUnits, 0);
});
