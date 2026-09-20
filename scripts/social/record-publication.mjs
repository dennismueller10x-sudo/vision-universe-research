/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/record-publication.mjs

   DIE MEDIEN-ID IN DIE HERKUNFTSKETTE

   Ein veroeffentlichter Beitrag hat zwei Identitaeten: unsere
   (`packageId`, die Kennung, an der Entscheidung, Bild und Anspruch
   haengen) und die von Instagram (`mediaId`, die Kennung, unter der
   Insights zurueckkommen).

   Solange die beiden nicht verbunden sind, ist der Rueckweg
   unterbrochen: die Zahlen kommen an, aber niemand weiss, zu welcher
   Entscheidung sie gehoeren. Genau das war der Zustand bei den 26
   Bestandsbeitraegen — sie haben eine mediaId und sonst nichts.

   -------------------------------------------------------------------------
   DIE KETTE ENTSTEHT VORWAERTS, NICHT RUECKWAERTS
   -------------------------------------------------------------------------

     signal -> opportunity -> strategyVersion -> archetype -> hook
     -> mediaFormat -> visual -> caption -> timing -> experiment
     -> approval -> mediaId -> measurements -> learning

   Jedes Glied wird eingetragen, wenn es entsteht. Nachtraeglich waere
   die Kette eine Rekonstruktion — und eine Rekonstruktion ist keine
   Herkunft. Dieses Skript schliesst die Glieder `approval` und
   `mediaId`; `measurements` und `learning` folgen aus der Messung.

   Ausfuehren:
     node scripts/social/record-publication.mjs --candidate cand_... \
       --response tmp/publish.json --data social/data --write
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ausgabePfad } from "../quality/out-path.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Der Gedaechtniseintrag zu einem veroeffentlichten Kandidaten.
 *
 * `performance` bleibt null — nicht 0. Der Beitrag ist gerade erst
 * erschienen; er hat noch keine Leistung, und eine 0 waere die Aussage
 * "er lief schlecht". Sie entsteht spaeter aus reifen Messungen.
 */
export function eintragAusKandidat(kandidat, antwort, meta) {
  const p = kandidat.provenance || {};
  return {
    publicationId: "pub_" + (antwort.mediaId || kandidat.candidateId),
    packageId: kandidat.content.contentId,
    publishedAt: (meta && meta.now) || new Date().toISOString(),
    platform: "instagram",
    topic: (kandidat.presentation && kandidat.presentation.topic) || null,
    entities: [],
    archetype: p.archetype || null,
    visualType: p.visualType || null,

    /* -----------------------------------------------------------------
       DIE NEUN DIMENSIONEN, DIE NIE ANKAMEN (§22–§25)

       Das Gedaechtnis hat Felder fuer sie, seit es das Gedaechtnis
       gibt. Gefuellt wurden sie nie: diese Funktion baut den Eintrag
       aus einer Feldliste, und sie standen nicht darauf. Der Ranker
       meldete pflichtgemaess "nicht mitgeschrieben" - fuer Werte, die
       zwei Dateien weiter oben vorlagen.

       Sie kommen aus dem Kandidaten und werden hier weder gerechnet
       noch ergaenzt. Fehlt der Block (alte Kandidaten), bleiben die
       Felder null - RUECKWIRKEND WIRD NICHTS ERFUNDEN (§35). */
    ...(p.learningDimensions && p.learningDimensions.werte
      ? p.learningDimensions.werte : {}),
    /* Und die Herkunft daneben: ohne sie ist ein leeres Feld in einem
       Jahr nicht mehr zu deuten - "nie gefragt" und "gefragt, keine
       Antwort" sehen beide wie null aus. */
    learningDimensionOrigin: (p.learningDimensions &&
      p.learningDimensions.herkunft) || null,
    mediaFormat: p.mediaFormat || null,
    authoringPattern: p.authoringPattern || null,
    authoringAuthorId: p.authoringAuthorId || null,
    hook: p.hook || null,
    caption: kandidat.content.caption,
    cta: null,
    externalPostId: antwort.mediaId || null,
    permalink: antwort.permalink || null,
    performance: null,
    lineage: {
      /* Der entscheidende Unterschied zu den Bestandsbeitraegen: hier
         steht, WARUM es diesen Beitrag gibt. */
      origin: "PIPELINE_APPROVED",
      signalIds: p.signalIds || [],
      opportunityId: p.opportunityId || null,
      hypothesis: p.hypothesis || null,
      experimentId: p.experimentId || null,
      strategyVersion: p.strategyVersion || null,
      decidedMode: p.decidedMode || null,
      candidateId: kandidat.candidateId,
      approvedBy: (p.approval && p.approval.approvedBy) || null,
      approvedAt: (p.approval && p.approval.approvedAt) || null,
      contentHash: kandidat.contentHash || null
    }
  };
}

/** Welche Glieder der Kette fehlen? Eine Kette mit Luecke ist keine. */
export function kettenLuecken(kandidat) {
  const p = kandidat.provenance || {};
  const pflicht = [
    ["signalIds", (p.signalIds || []).length > 0],
    ["opportunityId", !!p.opportunityId],
    ["strategyVersion", !!p.strategyVersion],
    ["archetype", !!p.archetype],
    ["hook", !!p.hook],
    ["mediaFormat", !!p.mediaFormat],
    ["visualType", !!p.visualType],
    ["caption", typeof p.caption === "string"],
    ["plannedHourUtc", p.plannedHourUtc !== null && p.plannedHourUtc !== undefined],
    ["approval", !!p.approval],
    ["mediaId", !!p.mediaId]
  ];
  return pflicht.filter(([, da]) => !da).map(([name]) => name);
}

/* --------------------------------------------------------------- Lauf */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");

  const ID = arg("candidate", null);
  const RESP = arg("response", null);
  const DATA = arg("data", "social/data");
  const DIR = arg("dir", "social/data/publish-candidates");
  const NOW = arg("now", new Date().toISOString());

  if (!ID || !RESP) { console.error("Erwartet: --candidate und --response."); process.exit(2); }

  const kPfad = join(ausgabePfad(ROOT, DIR), ID + ".json");
  if (!existsSync(kPfad)) { console.error("Kandidat nicht gefunden: " + kPfad); process.exit(2); }
  if (!existsSync(RESP)) { console.error("Antwort nicht gefunden: " + RESP); process.exit(2); }

  const kandidat = JSON.parse(readFileSync(kPfad, "utf8"));
  const antwort = JSON.parse(readFileSync(RESP, "utf8"));

  console.log("VISION UNIVERSE SOCIAL — Veroeffentlichung eintragen");
  console.log("Kandidat:  " + ID + "  (Zustand " + kandidat.state + ")");

  if (antwort.published !== true) {
    console.error("\nDie Antwort sagt nicht, dass veroeffentlicht wurde:");
    console.error("  " + (antwort.error || "(kein Fehler genannt)") + " — " +
      (antwort.message || ""));
    console.error("\nEs wird nichts eingetragen. Ein Eintrag ueber einen Beitrag, den es");
    console.error("vielleicht nicht gibt, waere schlimmer als kein Eintrag.");
    process.exit(3);
  }
  if (!antwort.mediaId) {
    console.error("\nDie Antwort nennt keine Medien-ID. Ohne sie bleibt der Rueckweg offen.");
    process.exit(3);
  }

  kandidat.state = "PUBLISHED";
  kandidat.provenance.mediaId = antwort.mediaId;
  kandidat.provenance.permalink = antwort.permalink || null;
  kandidat.publishedAt = NOW;
  kandidat.publishResult = {
    via: antwort.via || null,
    idempotent: antwort.idempotent === true,
    verified: antwort.verified === true,
    mediaId: antwort.mediaId,
    permalink: antwort.permalink || null
  };

  const luecken = kettenLuecken(kandidat);
  console.log("Medien-ID: " + antwort.mediaId);
  console.log("Permalink: " + (antwort.permalink || "(nicht zurueckgelesen)"));
  console.log("Weg:       " + (antwort.via || "?"));

  if (luecken.length) {
    /* Kein Abbruch: der Beitrag IST veroeffentlicht, und ihn nicht
       einzutragen waere schlimmer als ihn unvollstaendig einzutragen.
       Aber die Luecke wird benannt und nicht gefuellt. */
    console.log("\nLUECKEN IN DER KETTE: " + luecken.join(", "));
    console.log("Sie werden NICHT nachtraeglich gefuellt — das waere eine Rekonstruktion,");
    console.log("und eine Rekonstruktion ist keine Herkunft.");
  } else {
    console.log("\nDie Herkunftskette ist vollstaendig: Signal bis Medien-ID.");
  }

  const eintrag = eintragAusKandidat(kandidat, antwort, { now: NOW });

  if (!WRITE) {
    console.log("\n(Kein --write: es wurde nichts geschrieben.)");
    process.exit(0);
  }

  writeFileSync(kPfad, JSON.stringify(kandidat, null, 2) + "\n");

  const memPfad = join(ausgabePfad(ROOT, DATA), "content-memory.json");
  const mem = existsSync(memPfad)
    ? JSON.parse(readFileSync(memPfad, "utf8")) : { entries: [] };

  /* Angehaengt, nicht ersetzt — und nur einmal je Medien-ID. */
  const schonDa = (mem.entries || []).some((e) =>
    String(e.externalPostId || "") === String(antwort.mediaId));
  if (schonDa) {
    console.log("\nDieser Beitrag steht bereits im Gedaechtnis. Nichts hinzugefuegt.");
  } else {
    mem.entries = (mem.entries || []).concat([eintrag]);
    mem.generatedAt = NOW;
    writeFileSync(memPfad, JSON.stringify(mem, null, 2) + "\n");
    console.log("\nGeschrieben: " + DATA + "/content-memory.json  (" +
      mem.entries.length + " Eintraege)");
  }
}
