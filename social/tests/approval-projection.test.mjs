/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/approval-projection.test.mjs

   DIE SCHLANGE, DIE DER OWNER SIEHT

   -------------------------------------------------------------------------
   DER ANLASS
   -------------------------------------------------------------------------

   Ein Bericht in diesem Projekt meldete einmal "6 Kandidaten warten".
   Er hatte Dateien im Ordner gezaehlt. Es warteten null: drei abgeloest,
   drei auf einem Haltegrund. Die Zustandsmaschine hatte die ganze Zeit
   die richtige Antwort gegeben - nur hatte jemand daneben eine zweite
   Rechnung aufgemacht, und die war schneller zur Hand.

   Diese Datei prueft, dass es bei EINER Rechnung bleibt. Nicht, dass
   beide dasselbe ergeben - sondern dass die zweite gar nicht existiert.

   -------------------------------------------------------------------------
   UND DIE ZWEITE FRAGE
   -------------------------------------------------------------------------

   Der Owner bekommt eine Begruendung vorgelegt, bevor er etwas
   Oeffentliches freigibt. Eine erfundene Begruendung liest sich genau
   wie eine echte. Deshalb prueft diese Datei auch das: wo keine
   Provenance ist, steht NICHT_IN_DER_PROVENANCE - und kein plausibler
   Satz.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const P = require("../engines/approval-projection.js");
const O = require("../engines/owner-decision.js");

/** Ein vollstaendiger Kandidat, so wie ihn make-publish-candidate schreibt. */
function kandidat(over = {}) {
  return Object.assign({
    candidateId: "cand_test_1",
    version: 1,
    state: "AWAITING_APPROVAL",
    createdAt: "2026-09-20T08:00:00.000Z",
    contentHash: "a".repeat(64),
    content: {
      contentId: "pkg_test",
      imageUrl: "https://research.visionuniverse.de/assets/social/pkg_test.jpg",
      caption: "Der Text, der hinausginge."
    },
    presentation: {
      topic: "Technisches Setup — XOM",
      hook: "52 von 100 — und warum das keine Empfehlung ist.",
      caption: "Der Text, der hinausginge.",
      mediaFormat: "IMAGE",
      visualType: "CHART",
      mode: "EXPLOIT",
      modeReason: "Bewaehrte Wahl.",
      plannedHourUtc: 18,
      timingReason: "Zeitfenster 18:00.",
      strategyVersion: "strategy_initial",
      reason: "Opportunity Score 62 von 100.",
      opportunityScore: 62,
      alternatives: ["AAPL (58)", "JPM (55)"],
      authoring: {
        pattern: "chatgpt-work/value_first",
        authorId: "chatgpt-work",
        reason: "Markenwert 100 unter 4 bestandenen von 4 Varianten.",
        considered: 4, passed: 4
      },
      visualOrigin: "rendered",
      visualQuality: { applicable: true, passed: true, score: 82, warnings: [] }
    },
    provenance: {
      signalIds: ["sig_1"],
      opportunityId: "opp_xom",
      archetype: "STOCK_STORY",
      visual: { origin: "rendered", strategy: "CHART" },
      audienceFrame: { family: "STOCK_STORY", familyBasis: "ARCHETYPE",
        coreQuestion: "Was ist bei diesem Unternehmen gerade los?" },
      visualDirection: {
        coreIdea: "Eine einzige Kurve.",
        mobileFocalPoint: "Die Richtung des Verlaufs.",
        mustShow: ["Den Klarnamen"],
        mustNotShow: ["Keine Prognoselinie"],
        derivation: { explanation: "Abgeleitet aus CHART.",
          tension: { kind: "CONTRIBUTION_GAP" } }
      },
      visualDirectionReady: true
    }
  }, over);
}

function projiziere(kandidaten) {
  const schlange = O.warteschlange(kandidaten);
  const nachId = {};
  for (const k of kandidaten) if (k.candidateId) nachId[k.candidateId] = k;
  return P.projiziere(schlange, nachId, { now: "2026-09-20T10:00:00.000Z" });
}

/* ---------------------------------------------- Eine Rechnung, nicht zwei */

test("AP1 · activeCount wird uebernommen und nicht nachgezaehlt", () => {
  /* Die Probe zwingt beide Zahlen auseinander: die Engine sagt 7, die
     Liste hat einen Eintrag. Eine Projektion, die selbst zaehlt, meldet
     hier 1 - und waere damit der zweite Rechenweg. */
  const k = kandidat();
  const schlange = O.warteschlange([k]);
  schlange.activeCount = 7;

  const p = P.projiziere(schlange, { cand_test_1: k }, {});
  assert.equal(p.activeCount, 7,
    "Die Projektion hat selbst gezaehlt. Genau das darf sie nicht.");
  assert.equal(p.items.length, 1);
  assert.equal(p.complete, false,
    "Eine Projektion, deren Zahl und Liste auseinanderfallen, ist nicht vollstaendig.");
});

test("AP2 · Die Projektion nennt ihre Quelle und zaehlt keine Dateien", () => {
  const p = projiziere([kandidat()]);
  assert.equal(p.source, "owner-decision.warteschlange");
  assert.equal(p.countedFiles, false);
});

test("AP3 · Nur wartende Kandidaten - gehaltene und abgeloeste nie", () => {
  const bestand = [
    kandidat({ candidateId: "wartet", state: "AWAITING_APPROVAL" }),
    kandidat({ candidateId: "gehalten", state: "HELD_FOR_ENRICHMENT" }),
    kandidat({ candidateId: "verfeinern", state: "HELD_FOR_CREATIVE_REFINEMENT" }),
    kandidat({ candidateId: "publikum", state: "HELD_FOR_AUDIENCE_FIT" }),
    kandidat({ candidateId: "abgeloest", state: "SUPERSEDED" }),
    kandidat({ candidateId: "frei", state: "APPROVED" }),
    kandidat({ candidateId: "abgelehnt", state: "REJECTED" })
  ];
  const p = projiziere(bestand);

  assert.equal(p.activeCount, 1);
  assert.deepEqual(p.items.map((i) => i.candidateId), ["wartet"]);
  assert.equal(p.total, 7, "Der Bestand verschwindet nicht - er wartet nur nicht.");
  assert.equal(p.held.length, 3);
  assert.equal(p.decided.length, 3);

  /* Sechs Dateien, ein Wartender. Genau der Unterschied, der einmal
     als "6 Kandidaten warten" herauskam. */
  const text = JSON.stringify(p.items);
  for (const id of ["gehalten", "verfeinern", "publikum", "abgeloest", "frei", "abgelehnt"]) {
    assert.ok(!text.includes(id), `${id} steht in der Owner-Schlange`);
  }
});

test("AP4 · Ein unbekannter Zustand zaehlt nicht als wartend", () => {
  const p = projiziere([kandidat({ candidateId: "seltsam", state: "IRGENDWAS" })]);
  assert.equal(p.activeCount, 0);
  assert.equal(p.items.length, 0);
  assert.equal(p.unknown.length, 1,
    "Unbekannt ist etwas anderes als entschieden - und muss sichtbar bleiben.");
});

/* ------------------------------------------------ Vorschau ist Sendung */

test("AP5 · Der payload ist der Inhalt des Kandidaten, unveraendert", () => {
  const k = kandidat();
  const p = projiziere([k]);
  const i = p.items[0];

  assert.equal(i.payload.contentId, k.content.contentId);
  assert.equal(i.payload.imageUrl, k.content.imageUrl);
  assert.equal(i.payload.caption, k.content.caption,
    "Ein zweiter Vorschautext waere ein anderer Beitrag als der freigegebene.");
  assert.equal(i.contentHash, k.contentHash);

  /* Kein gekuerzter, kein aufbereiteter, kein zweiter Text. */
  assert.equal(Object.keys(i.payload).sort().join(","), "caption,contentId,imageUrl");
});

test("AP6 · Eine leere Caption ist eine leere Caption und nicht null", () => {
  /* "" und null sind verschiedene Beitraege: der eine hat keinen Text,
     der andere hat einen unbekannten. Der Abdruck unterscheidet sie. */
  const k = kandidat();
  k.content.caption = "";
  const i = projiziere([k]).items[0];
  assert.equal(i.payload.caption, "");
});

/* -------------------------------------------- Keine erfundene Begruendung */

test("AP7 · Die drei Warum-Fragen kommen aus echter Provenance", () => {
  const k = kandidat();
  const i = projiziere([k]).items[0];

  assert.equal(i.warum.thema.erklaerung.value, "Opportunity Score 62 von 100.");
  assert.equal(i.warum.thema.erklaerung.basis, "presentation.reason");

  assert.equal(i.warum.einstieg.erklaerung.value,
    "Markenwert 100 unter 4 bestandenen von 4 Varianten.");
  assert.equal(i.warum.einstieg.erklaerung.basis, "presentation.authoring.reason");

  assert.equal(i.warum.visual.kernidee.value, "Eine einzige Kurve.");
  assert.equal(i.warum.visual.ableitung.value, "Abgeleitet aus CHART.");
  assert.equal(i.warum.visual.blickpunkt.value, "Die Richtung des Verlaufs.");
});

test("AP8 · Fehlt die Provenance, steht da die Luecke und kein Satz", () => {
  /* Der Fall ist real: bis zu diesem Auftrag trug KEIN Kandidat eine
     Bildrichtung. Sie wurde im Zyklus abgeleitet und auf dem Weg in den
     Kandidaten von einer Feldliste verschluckt. Haette die Oberflaeche
     "warum dieses Visual" trotzdem beantwortet, haette sie es sich
     ausgedacht. */
  const k = kandidat();
  delete k.provenance.visualDirection;
  delete k.provenance.audienceFrame;
  delete k.presentation.authoring;

  const i = projiziere([k]).items[0];

  for (const [weg, f] of [
    ["visual.kernidee", i.warum.visual.kernidee],
    ["visual.blickpunkt", i.warum.visual.blickpunkt],
    ["visual.ableitung", i.warum.visual.ableitung],
    ["einstieg.erklaerung", i.warum.einstieg.erklaerung],
    ["anzeige.familie", i.anzeige.familie],
    ["anzeige.kernfrage", i.anzeige.kernfrage]
  ]) {
    assert.equal(f.value, null, `${weg} hat einen Wert erfunden`);
    assert.equal(f.basis, P.FEHLT, `${weg} nennt eine Herkunft, die es nicht gibt`);
  }

  /* Und was es gibt, ist weiterhin da. Eine Luecke an einer Stelle
     darf nicht die ganze Karte leeren. */
  assert.equal(i.anzeige.thema.value, "Technisches Setup — XOM");
  assert.equal(i.warum.thema.erklaerung.value, "Opportunity Score 62 von 100.");
});

test("AP9 · Jedes Anzeigefeld nennt seine Herkunft", () => {
  const i = projiziere([kandidat()]).items[0];
  for (const [name, f] of Object.entries(i.anzeige)) {
    assert.ok(f && typeof f === "object" && "value" in f && "basis" in f,
      `anzeige.${name} traegt keine Herkunft`);
    assert.ok(typeof f.basis === "string" && f.basis.length > 0);
  }
});

/* ------------------------------------------------------- Die Gueteprobe */

test("AP10 · Nicht anwendbar ist weder bestanden noch durchgefallen", () => {
  /* Ein generatives Bild traegt laut Brief keinen Text. Die Kartenprobe
     misst Text auf der Flaeche. "Bestanden" zu melden waere eine
     Pruefung zu behaupten, die nicht stattgefunden hat. */
  const k = kandidat();
  k.presentation.visualQuality = { applicable: false,
    explanation: "Generatives Bild ohne Textebene." };
  const i = projiziere([k]).items[0];

  assert.equal(i.guete.zustand, "NICHT_ANWENDBAR");
  assert.equal(i.guete.score, null, "Eine Punktzahl zu erfinden waere schlimmer als keine.");
  assert.match(i.guete.erklaerung, /ohne Textebene/);
});

test("AP11 · Eine nicht bestandene Probe heisst auch so", () => {
  const k = kandidat();
  k.presentation.visualQuality = { applicable: true, passed: false, score: 31,
    explanation: "Zu viel Text auf der Flaeche.", warnings: ["Redundanz"] };
  const i = projiziere([k]).items[0];
  assert.equal(i.guete.zustand, "NICHT_BESTANDEN");
  assert.equal(i.guete.score, 31);
  assert.deepEqual(i.guete.warnungen, ["Redundanz"]);
});

test("AP12 · Fehlt die Probe ganz, ist das kein Bestehen", () => {
  const k = kandidat();
  delete k.presentation.visualQuality;
  assert.equal(projiziere([k]).items[0].guete.zustand, P.FEHLT);
});

/* --------------------------------------------- Ein Fehlender verschwindet nicht */

test("AP13 · Ein wartender Kandidat ohne Datensatz faellt auf statt weg", () => {
  const k = kandidat();
  const schlange = O.warteschlange([k]);
  /* Die Karte ist leer: der Datensatz konnte nicht gelesen werden. */
  const p = P.projiziere(schlange, {}, {});

  assert.equal(p.activeCount, 1, "Die Zahl bleibt, was die Maschine sagt.");
  assert.equal(p.items.length, 0);
  assert.equal(p.unresolved.length, 1);
  assert.equal(p.unresolved[0].candidateId, "cand_test_1");
  assert.equal(p.complete, false,
    "Ein Beitrag, der still aus der Schlange faellt, ist einer, den niemand vermisst.");
});

/* ------------------------------------------------ Der Waechter am Rechenweg */

test("AP14 · Die Projektion enthaelt keinen zweiten Zaehlweg", () => {
  /* Ein Quelltext-Waechter, und er ist absichtlich streng: `activeCount`
     darf genau einmal gesetzt werden, und zwar aus der Schlange.
     Jemand, der spaeter `activeCount: eintraege.length` schreibt, baut
     den Fehler zurueck, dessen Kosten oben im Kopf stehen - und der
     Test hier ist die einzige Stelle, an der das auffiele, weil beide
     Rechnungen in fast jedem Fall dasselbe ergeben. */
  const quelle = readFileSync(join(ROOT, "social/engines/approval-projection.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")      /* Kommentare erklaeren, sie rechnen nicht */
    .replace(/^\s*\/\/.*$/gm, "");

  const zuweisungen = quelle.match(/activeCount\s*:\s*[^,\n]+/g) || [];
  assert.equal(zuweisungen.length, 1,
    "activeCount wird an mehr als einer Stelle gesetzt:\n" + zuweisungen.join("\n"));
  assert.match(zuweisungen[0], /s\.activeCount/,
    "activeCount stammt nicht aus der Schlange: " + zuweisungen[0]);
});

/* =========================================================================
   DAS SKRIPT, DAS DIE PROJEKTION BAUT

   Es rechnet den Abdruck NACH, statt den einzutragenen zu glauben.
   Zwischen dem Erzeugen des Kandidaten und diesem Lauf ist die Datei
   eine Datei, und jemand kann sie bearbeiten.
   ========================================================================= */

const { baue } = await import("../../scripts/social/publish-approval-queue.mjs");
const ContentHash = require("../engines/content-hash.js");

/** Derselbe Kandidat, aber mit einem Abdruck, der zu seinem Inhalt passt. */
function echt(over = {}) {
  const k = kandidat(over);
  k.contentHash = ContentHash.contentHash({
    contentId: k.content.contentId,
    imageUrl: k.content.imageUrl,
    caption: k.content.caption
  });
  return k;
}

test("AP15 · Ein stimmiger Kandidat geht durch", () => {
  const p = baue([echt()], { now: "2026-09-20T10:00:00.000Z" });
  assert.equal(p.activeCount, 1);
  assert.equal(p.items.length, 1);
  assert.equal(p.complete, true);
});

test("AP16 · Ein nachtraeglich veraenderter Kandidat geht NICHT hinaus", () => {
  /* Der Abdruck in der Datei sagt "dieser Text"; der Text ist ein
     anderer. Was der Owner freigaebe, waere nicht das, worueber
     entschieden wurde. */
  const k = echt();
  k.content.caption = "Etwas anderes, nachtraeglich hineingeschrieben.";

  const p = baue([k], { now: "2026-09-20T10:00:00.000Z" });

  assert.equal(p.items.length, 0, "Der veraenderte Kandidat wurde uebertragen.");
  assert.equal(p.activeCount, 1, "Die Zahl bleibt die der Maschine.");
  assert.equal(p.complete, false);
  assert.equal(p.unresolved.length, 1);
  assert.equal(p.unresolved[0].reason, "CONTENT_HASH_MISMATCH");
  /* Nicht still weglassen: wer hinsieht, muss erfahren warum. */
  assert.match(p.unresolved[0].detail, /nach seiner Erzeugung veraendert/);
});

test("AP17 · Der Abdruck wird nur fuer Wartende nachgerechnet", () => {
  /* Fuer einen abgeloesten Kandidaten waere es eine Rechnung ohne
     Frage - und ein Befund, der niemanden betrifft, sieht aus wie
     ein Problem. */
  const alt = echt({ candidateId: "abgeloest", state: "SUPERSEDED" });
  alt.content.caption = "spaeter veraendert";

  const p = baue([alt, echt()], { now: "2026-09-20T10:00:00.000Z" });
  assert.equal(p.unresolved.length, 0);
  assert.equal(p.activeCount, 1);
  assert.equal(p.complete, true);
});

test("AP18 · Eine unlesbare Datei zaehlt nicht als wartend", () => {
  const p = baue([{ candidateId: "kaputt", state: null, __unlesbar: true }, echt()],
    { now: "2026-09-20T10:00:00.000Z" });
  assert.equal(p.activeCount, 1);
  assert.equal(p.unknown.length, 1, "Unbekannt bleibt unbekannt und wird nicht zu null.");
});
