/* =========================================================================
   VU SOCIAL — Die Herkunftskette (PV1–PV12)

   -------------------------------------------------------------------------
   WAS DIESE KETTE LEISTEN MUSS
   -------------------------------------------------------------------------

     signal -> opportunity -> strategyVersion -> archetype -> hook
     -> mediaFormat -> visual -> caption -> timing -> experiment
     -> approval -> mediaId -> measurements -> learning

   Ohne sie sind gemessene Zahlen nur Zahlen. Genau das ist der Zustand
   der 26 Bestandsbeitraege: sie haben eine mediaId und sonst nichts, und
   deshalb kann keine Reichweite dieser Welt daraus eine Aussage ueber
   Formate, Hooks oder Uhrzeiten machen.

   -------------------------------------------------------------------------
   VORWAERTS, NICHT RUECKWAERTS
   -------------------------------------------------------------------------

   Jedes Glied wird eingetragen, WENN ES ENTSTEHT. Eine Kette, die
   nachtraeglich gefuellt wird, ist eine Rekonstruktion — und eine
   Rekonstruktion ist keine Herkunft. PV6 haelt fest, dass Luecken
   benannt und nicht gefuellt werden.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { eintragAusKandidat, kettenLuecken } from "../../scripts/social/record-publication.mjs";

const require = createRequire(import.meta.url);
const Memory = require("../engines/memory.js");

const NOW = "2026-09-17T18:00:00Z";

function kandidat(over = {}) {
  return Object.assign({
    candidateId: "cand_1",
    contentHash: "a".repeat(64),
    content: { contentId: "pkg_1", imageUrl: "https://x.invalid/pkg_1.jpg",
      caption: "Ein Text." },
    presentation: { topic: "Thema A" },
    provenance: {
      signalIds: ["sig_1"], opportunityId: "opp_a", strategyVersion: "strategy_initial",
      archetype: "EXPLAIN_THE_MOVE", hook: "Ein Hook.", mediaFormat: "IMAGE",
      visualType: "DATA_CARD", caption: "Ein Text.", plannedHourUtc: 9,
      experimentId: null, decidedMode: "EXPLOIT",
      approval: { approvedBy: "owner", approvedAt: NOW, contentHash: "a".repeat(64) },
      mediaId: null, measurements: [], learning: null
    }
  }, over);
}

const antwort = { published: true, via: "APPROVAL", mediaId: "18099999999999999",
  permalink: "https://www.instagram.com/p/XYZ/", verified: true, idempotent: false };

test("PV1 · Der Eintrag traegt die vollstaendige Herkunft", () => {
  const e = eintragAusKandidat(kandidat(), antwort, { now: NOW });

  assert.equal(e.lineage.origin, "PIPELINE_APPROVED");
  assert.deepEqual(e.lineage.signalIds, ["sig_1"]);
  assert.equal(e.lineage.opportunityId, "opp_a");
  assert.equal(e.lineage.strategyVersion, "strategy_initial");
  assert.equal(e.lineage.decidedMode, "EXPLOIT");
  assert.equal(e.lineage.candidateId, "cand_1");
  assert.equal(e.lineage.approvedBy, "owner");
  assert.equal(e.lineage.contentHash, "a".repeat(64));
});

test("PV2 · Die zwei Identitaeten sind verbunden", () => {
  /* Unsere Kennung und die von Instagram. Solange die beiden nicht
     verbunden sind, ist der Rueckweg unterbrochen: die Zahlen kommen an,
     aber niemand weiss, zu welcher Entscheidung sie gehoeren. */
  const e = eintragAusKandidat(kandidat(), antwort, { now: NOW });
  assert.equal(e.packageId, "pkg_1");
  assert.equal(e.externalPostId, "18099999999999999");
  assert.equal(e.permalink, "https://www.instagram.com/p/XYZ/");
});

test("PV3 · Ein frischer Beitrag hat performance null, nicht 0", () => {
  /* Eine 0 waere die Aussage "er lief schlecht". Er ist gerade erst
     erschienen. */
  const e = eintragAusKandidat(kandidat(), antwort, { now: NOW });
  assert.equal(e.performance, null);
});

test("PV4 · Der Eintrag ueberlebt das Speichern", () => {
  /* Die Whitelist in memory.entry() hat schon einmal ein Feld
     verschluckt — und danach konnte das System nach einem Neustart nicht
     mehr sagen, unter welchem Massstab gemessen worden war. */
  const e = eintragAusKandidat(kandidat(), antwort, { now: NOW });
  const gespeichert = Memory.entry(e);

  assert.equal(gespeichert.externalPostId, "18099999999999999");
  assert.equal(gespeichert.mediaFormat, "IMAGE");
  assert.equal(gespeichert.archetype, "EXPLAIN_THE_MOVE");
  assert.equal(gespeichert.permalink, "https://www.instagram.com/p/XYZ/");
  assert.equal(gespeichert.lineage.opportunityId, "opp_a");
  assert.equal(gespeichert.lineage.strategyVersion, "strategy_initial");
  assert.deepEqual(gespeichert.lineage.signalIds, ["sig_1"]);

  /* Und die Freigabe. Diese vier Zeilen fanden den Fehler: die Felder
     standen im Eintrag, standen im Test — und fehlten in der Whitelist
     von memory.entry(). Beim Speichern waeren sie verschwunden, und
     danach haette niemand mehr sagen koennen, wer diesen oeffentlichen
     Beitrag gewollt hat. */
  assert.equal(gespeichert.lineage.candidateId, "cand_1");
  assert.equal(gespeichert.lineage.approvedBy, "owner");
  assert.equal(gespeichert.lineage.approvedAt, NOW);
  assert.equal(gespeichert.lineage.contentHash, "a".repeat(64));
});

test("PV5 · Eine vollstaendige Kette hat keine Luecken", () => {
  const k = kandidat();
  k.provenance.mediaId = "18099999999999999";
  assert.deepEqual(kettenLuecken(k), []);
});

test("PV6 · Luecken werden benannt, nicht gefuellt", () => {
  const k = kandidat();
  k.provenance.signalIds = [];
  k.provenance.archetype = null;
  const luecken = kettenLuecken(k);

  assert.ok(luecken.includes("signalIds"));
  assert.ok(luecken.includes("archetype"));
  assert.ok(luecken.includes("mediaId"), "noch nicht veroeffentlicht");

  /* Und der Eintrag traegt die Luecken als null weiter, statt sie zu
     erfinden. */
  const e = eintragAusKandidat(k, antwort, { now: NOW });
  assert.equal(e.archetype, null);
  assert.deepEqual(e.lineage.signalIds, []);
});

test("PV7 · Ein leerer Text ist keine Luecke", () => {
  /* "" ist die Entscheidung 'ohne Bildunterschrift'. Sie als fehlend zu
     zaehlen hiesse, eine getroffene Entscheidung als Versaeumnis zu
     melden. */
  const k = kandidat();
  k.provenance.mediaId = "1";
  k.provenance.caption = "";
  assert.deepEqual(kettenLuecken(k), []);
});

test("PV8 · Stunde 0 ist keine Luecke", () => {
  /* Mitternacht ist eine Uhrzeit. `!0` waere hier still das Falsche. */
  const k = kandidat();
  k.provenance.mediaId = "1";
  k.provenance.plannedHourUtc = 0;
  assert.deepEqual(kettenLuecken(k), []);
});

test("PV9 · Der Bestandsbeitrag hat die Kette ausdruecklich NICHT", () => {
  /* Das ist der Unterschied, um den es bei Controlled Live Learning
     geht. Ein Bestandsbeitrag traegt eine mediaId und eine Messung —
     aber keinen Archetyp, keinen Hook, keine Strategie-Version. Diese
     Felder nachtraeglich zu fuellen, damit die Kette vollstaendig
     aussieht, waere erfundene Vorgeschichte. */
  const bestand = Memory.entry({
    publicationId: "ext_1", packageId: "ext_pkg_0", publishedAt: "2026-08-01T10:00:00Z",
    platform: "instagram", topic: "Bestandsbeitrag",
    archetype: null, visualType: null, mediaFormat: "REEL",
    externalPostId: "17999999999999999", performance: null,
    lineage: { origin: "ORGANIC_PRE_EXISTING", signalIds: [], opportunityId: null,
      strategyVersion: null, decidedMode: null }
  });

  assert.equal(bestand.archetype, null);
  assert.equal(bestand.lineage.strategyVersion, null);
  assert.equal(bestand.mediaFormat, "REEL", "was gemessen ist, steht da");
  assert.equal(bestand.lineage.origin, "ORGANIC_PRE_EXISTING");
});

test("PV10 · Pipeline und Bestand sind unterscheidbar", () => {
  /* Ohne diese Unterscheidung liessen sich Frequenzgrenzen nicht
     anwenden und Attributionen nicht trennen. */
  const pipeline = eintragAusKandidat(kandidat(), antwort, { now: NOW });
  assert.equal(pipeline.lineage.origin, "PIPELINE_APPROVED");
  assert.notEqual(pipeline.lineage.origin, "ORGANIC_PRE_EXISTING");
});

test("PV11 · Ohne Medien-ID entsteht kein Eintrag ueber einen Beitrag", () => {
  /* Der Eintrag entsteht nur aus einer Antwort, die published:true und
     eine mediaId traegt — das prueft das Skript vor dem Schreiben. Hier
     wird festgehalten, dass der Eintrag die ID wirklich uebernimmt und
     nicht eine erfindet. */
  const e = eintragAusKandidat(kandidat(), Object.assign({}, antwort, { mediaId: null }),
    { now: NOW });
  assert.equal(e.externalPostId, null);
  assert.equal(e.publicationId, "pub_cand_1", "dann haengt die Kennung am Kandidaten");
});

test("PV12 · Die Freigabe ist Teil der Herkunft, nicht nur der Ablauf", () => {
  /* "Wer wollte das" ist bei einem oeffentlichen Beitrag die erste
     Frage. Sie muss aus derselben Quelle beantwortbar sein wie alles
     andere — nicht aus einem zweiten Protokoll, das auch fehlen koennte. */
  const e = eintragAusKandidat(kandidat(), antwort, { now: NOW });
  assert.equal(e.lineage.approvedBy, "owner");
  assert.equal(e.lineage.approvedAt, NOW);
  assert.ok(e.lineage.contentHash, "und WAS freigegeben wurde");
});
