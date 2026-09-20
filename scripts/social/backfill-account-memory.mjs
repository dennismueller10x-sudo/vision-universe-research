/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/backfill-account-memory.mjs

   DIE BESTANDSBEITRAEGE INS GEDAECHTNIS

   Das Konto hat 26 Beitraege, 16 davon gemessen. Im produktiven
   Gedaechtnis stand davon nichts — und deshalb meldete der Zyklus
   "16 gemessen, 0 zugeordnet, 0 bewertbar". Die Zahlen waren da, die
   Eintraege, an denen sie haetten haften koennen, nicht.

   -------------------------------------------------------------------------
   WAS EINGETRAGEN WIRD — UND WAS AUSDRUECKLICH NICHT
   -------------------------------------------------------------------------

   Diese Beitraege stammen NICHT aus der Pipeline. Der Owner hat sie
   veroeffentlicht, bevor es das System gab. Damit ist bekannt, WAS sie
   sind, aber nicht, warum sie so entschieden wurden.

   Eingetragen wird deshalb nur, was gemessen ist:

     publishedAt   der Zeitstempel von Instagram
     mediaFormat   REEL, CAROUSEL, IMAGE — was der Container sagt
     externalPostId, permalink
     performance   bleibt null; sie entsteht im Zyklus aus den Snapshots
                   und dem Evidenzregime, nicht hier

   NICHT eingetragen wird `archetype`. Das System hat ihn nie
   entschieden; ihn nachtraeglich zu vergeben, damit das Feld gefuellt
   aussieht, waere erfundene Vorgeschichte — und sie floesse als
   Formatwissen in genau die Entscheidungen ein, die das System danach
   trifft.

   NICHT eingetragen wird `visualType`. Das ist unser Vokabular fuer die
   gestalterische Entscheidung. Aus "Instagram meldet ein Video" folgt
   weder MOTION_GRAPHIC noch VIDEO.

   -------------------------------------------------------------------------
   EINE REGEL, NICHT ZWEI
   -------------------------------------------------------------------------

   `prove-loop-closure.mjs` baute dieselben Eintraege bisher selbst.
   Zwei Regeln fuer dieselbe Frage sind die Einladung, dass sie
   auseinanderlaufen — und dann misst der Nachweis etwas anderes als der
   Betrieb. Die Regel steht ab jetzt hier, und der Nachweis holt sie
   sich.

   Ausfuehren:
     node scripts/social/backfill-account-memory.mjs --data social/data
     node scripts/social/backfill-account-memory.mjs --data social/data --write
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { ausgabePfad } from "../quality/out-path.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EvidenceRegime = require(join(ROOT, "social/engines/evidence-regime.js"));

/**
 * Baut Gedaechtniseintraege aus gemessener Leistung.
 *
 * Genommen werden nur Zeilen mit Zahlen. Ein ungemessener Beitrag traegt
 * nichts zum Lernen bei, und ihn einzutragen hiesse, die Stichprobe
 * groesser aussehen zu lassen, als sie ist.
 */
export function eintraegeAusLeistung(perf, options = {}) {
  const zeilen = (perf && perf.snapshots) || [];
  return zeilen
    .filter((z) => z.snapshot && z.snapshot.state !== "UNAVAILABLE")
    .map((z, i) => ({
      publicationId: "ext_" + z.mediaId,
      packageId: "ext_pkg_" + i,
      publishedAt: z.publishedAt || null,
      platform: "instagram",
      topic: options.topic || "Bestandsbeitrag",
      entities: [],
      archetype: null,
      visualType: null,
      /* Die Kohorte bestimmt die Engine, nicht dieses Skript. */
      mediaFormat: EvidenceRegime.cohortFor(z),
      hook: "", caption: "", cta: null,
      externalPostId: String(z.mediaId),
      permalink: z.permalink || null,
      /* Ungemessen an dieser Stelle — nicht 0. Die Bewertung entsteht im
         Zyklus aus den Snapshots und dem Evidenzregime; sie hier
         vorwegzunehmen waere eine zweite Bewertungslogik. */
      performance: null,
      lineage: {
        origin: "ORGANIC_PRE_EXISTING",
        signalIds: [], opportunityId: null,
        hypothesis: null, strategyVersion: null, decidedMode: null
      }
    }));
}

/* --------------------------------------------------------------- Lauf */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");

  const DATA = arg("data", "social/data");
  const NOW = arg("now", new Date().toISOString());
  const perfPfad = join(ausgabePfad(ROOT, DATA), "performance.json");

  if (!existsSync(perfPfad)) {
    console.error("Keine performance.json in " + DATA + ". Ohne gemessene Zahlen gibt es " +
      "nichts einzutragen.");
    process.exit(2);
  }

  const perf = JSON.parse(readFileSync(perfPfad, "utf8"));
  const neue = eintraegeAusLeistung(perf, {});

  console.log("VISION UNIVERSE SOCIAL — Bestandsbeitraege ins Gedaechtnis");
  console.log("Gemessen:  " + neue.length + " von " + (perf.requested || 0));

  const nachFormat = {};
  for (const e of neue) nachFormat[e.mediaFormat] = (nachFormat[e.mediaFormat] || 0) + 1;
  for (const [f, n] of Object.entries(nachFormat)) console.log("  " + f + ": " + n);

  const zielPfad = join(ausgabePfad(ROOT, DATA), "content-memory.json");
  const bestand = existsSync(zielPfad)
    ? JSON.parse(readFileSync(zielPfad, "utf8")) : { entries: [] };
  const vorhanden = new Set((bestand.entries || [])
    .map((e) => e.externalPostId).filter(Boolean).map(String));

  const hinzu = neue.filter((e) => !vorhanden.has(e.externalPostId));
  console.log("\nIm Gedaechtnis bereits: " + vorhanden.size);
  console.log("Neu einzutragen:        " + hinzu.length);

  if (!WRITE) {
    console.log("\n(Kein --write: es wurde nichts geschrieben.)");
    process.exit(0);
  }

  /* Angehaengt, nicht ersetzt. Ein Gedaechtnis, das ein Lauf neu
     schreibt, ist kein Gedaechtnis. */
  mkdirSync(ausgabePfad(ROOT, DATA), { recursive: true });
  writeFileSync(zielPfad, JSON.stringify({
    generatedAt: NOW,
    entries: (bestand.entries || []).concat(hinzu)
  }, null, 2) + "\n");
  console.log("\nGeschrieben: " + DATA + "/content-memory.json  (" +
    ((bestand.entries || []).length + hinzu.length) + " Eintraege)");
}
