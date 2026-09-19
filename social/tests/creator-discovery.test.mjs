/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/creator-discovery.test.mjs

   DIE ANTWORT IST VOLLER FREMDER TEXTE. DIE ERNTE IST ES NICHT.

   Eine YouTube-Antwort traegt Titel, Beschreibungen und Vorschaubilder.
   §5 verbietet, sie zu uebernehmen. Das ist keine Absichtserklaerung,
   sondern eine messbare Eigenschaft: hier wird eine Antwort voller
   fremder Saetze hineingegeben und die Ausgabe danach DURCHSUCHT.

   Derselbe Test hat im Hashtag-Pfad schon einmal etwas gefunden, das
   ein Kommentar nicht gefunden haette.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { ernte, planeEntdeckung } from "../../scripts/social/discover-creators.mjs";

const require = createRequire(import.meta.url);
const YouTube = require("../engines/youtube-source.js");

/* Eine realistisch geformte Antwort - mit allem, was nicht mit darf. */
const ANTWORT = {
  items: [
    { id: { kind: "youtube#channel", channelId: "UC_aaa" },
      snippet: {
        channelId: "UC_aaa",
        customUrl: "@beispielkanal",
        title: "Die 5 besten Aktien fuer 2026 — mein Depot",
        description: "Jeden Montag neue Analysen zu Aktien und ETFs.",
        thumbnails: { high: { url: "https://example.invalid/bild.jpg" } }
      } },
    { id: { kind: "youtube#channel", channelId: "UC_bbb" },
      snippet: {
        channelId: "UC_bbb",
        title: "Boerse einfach erklaert",
        description: "Finanzbildung ohne Bullshit.",
        thumbnails: { default: { url: "https://example.invalid/zwei.jpg" } }
      } }
  ]
};

const KONTEXT = { query: "beste aktien", topicIds: ["t1", "t2"], families: ["RANKING"] };

test("CE1 · Kein Buchstabe der fremden Texte verlaesst die Ernte", () => {
  const raus = JSON.stringify(ernte(ANTWORT, KONTEXT));
  for (const fremd of ["besten Aktien", "mein Depot", "Jeden Montag",
                       "einfach erklaert", "ohne Bullshit", "example.invalid"]) {
    assert.equal(raus.includes(fremd), false,
      "\"" + fremd + "\" darf nicht in der Ernte stehen");
  }
});

test("CE2 · Genau zwei Felder kommen herueber: Kennung und Adresse", () => {
  const k = ernte(ANTWORT, KONTEXT)[0];
  assert.equal(k.creatorId, "UC_aaa");
  assert.equal(k.handle, "@beispielkanal");
  /* Fehlt die Adresse, wird sie nicht erfunden - der billige
     channels.list-Aufruf holt sie nach. */
  assert.equal(ernte(ANTWORT, KONTEXT)[1].handle, null);
});

test("CE3 · Die Herkunft reist mit: welche Suche, aus welchen Themen", () => {
  const k = ernte(ANTWORT, KONTEXT)[0];
  assert.equal(k.discoveredVia, "YOUTUBE_SEARCH");
  assert.equal(k.discoveredByQuery, "beste aktien");
  assert.deepEqual(k.topicIds, ["t1", "t2"]);
  /* Ohne Herkunft waere ein Eintrag wieder eine handgepflegte Liste. */
  assert.deepEqual(k.families, ["RANKING"]);
});

test("CE4 · Derselbe Kanal zweimal ist einmal", () => {
  const doppelt = { items: ANTWORT.items.concat(ANTWORT.items) };
  assert.equal(ernte(doppelt, KONTEXT).length, 2);
});

test("CE5 · Eine leere oder kaputte Antwort ergibt nichts, nicht einen Fehler", () => {
  assert.deepEqual(ernte(null, KONTEXT), []);
  assert.deepEqual(ernte({}, KONTEXT), []);
  assert.deepEqual(ernte({ items: [{ snippet: {} }] }, KONTEXT), []);
});

test("CE6 · Der Plan nennt die Kosten DIESES Laufs, nicht die des Tages", () => {
  /* Vier Suchen kosten 400. Daneben "8600 Detailabrufe" zu lesen,
     waere eine Zahl, die dieser Lauf nicht ausgibt. */
  const p = planeEntdeckung({ searches: 4 });
  assert.equal(p.thisRunCost, 4 * YouTube.KONTINGENT.costs["search.list"]);
  assert.match(p.explanation, /kostet 400 von/);
});

test("CE7 · Der Plan nimmt nicht mehr Suchen, als das Kontingent traegt", () => {
  const p = planeEntdeckung({ searches: 200 });
  assert.ok(p.queries.length <= YouTube.KONTINGENT.dailyUnits /
    YouTube.KONTINGENT.costs["search.list"]);
  assert.ok(p.thisRunCost <= p.quota.free);
});

test("CE8 · Die Suchphrasen stammen aus dem realen Content Universe", () => {
  /* Keine Fixture: der Plan laeuft gegen den tatsaechlichen Bestand.
     Faende er nichts, waere die Ableitung kaputt und nicht der Test. */
  const p = planeEntdeckung({ searches: 4 });
  assert.ok(p.candidates > 0, "Aus dem Content Universe entstehen Suchphrasen");
  assert.ok(p.queries.length > 0);
  for (const q of p.queries) assert.ok(q.topicIds.length > 0);
});

test("CE9 · Der Plan traegt die faellige Kontingentpruefung mit", () => {
  /* Solange die Primaerquelle ungelesen ist, darf ein Lauf das nicht
     uebersehen koennen. */
  const p = planeEntdeckung({ searches: 1 });
  assert.equal(p.quotaCheck.due, true);
});
