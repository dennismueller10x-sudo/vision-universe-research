/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/ingest-external-observation.mjs

   HIER ENDET DER FREMDE INHALT

   -------------------------------------------------------------------------
   DIE EINE STELLE, AN DER ES SCHIEFGEHEN KOENNTE
   -------------------------------------------------------------------------

   Die Antwort von Meta enthaelt Captions fremder Beitraege. Sie ist
   noetig, um Muster zu erkennen - ein Hook-Archetyp laesst sich ohne
   Text nicht bestimmen.

   Aber sie darf nicht bleiben. Dieses Skript liest die Rohantwort,
   leitet Muster ab und schreibt NUR die Muster. Die Rohdatei wird nicht
   uebernommen, und die Beobachtungsstruktur hat kein Feld, das einen
   fremden Text aufnehmen koennte.

   Ein Feld, das es nicht gibt, kann niemand versehentlich fuellen.

   Ausfuehren:
     node scripts/social/ingest-external-observation.mjs --raw tmp/observe/raw.json --write
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const External = require(join(ROOT, "social/engines/external-intelligence.js"));
const Portfolio = require(join(ROOT, "social/engines/hashtag-portfolio.js"));
const Patterns = require(join(ROOT, "social/engines/external-patterns.js"));

export const BEOBACHTUNGEN = "social/data/external-observations.json";
export const PORTFOLIO = "social/data/hashtag-portfolio.json";

function readJson(p, f) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : f; }
  catch { return f; }
}

/**
 * Aus einer Rohantwort werden Muster.
 *
 * Die Rohantwort geht hier hinein und kommt nicht wieder heraus.
 */
/**
 * Unser Themenwortschatz - aus den Content Families abgeleitet, nicht
 * von Hand gepflegt. Er dient genau einer Frage: sprechen die Beitraege
 * unter einem Hashtag unsere Sprache?
 */
export function wortschatz() {
  const raus = [];
  Object.keys(Portfolio.FAMILY_TAGS).forEach((f) => {
    Portfolio.FAMILY_TAGS[f].forEach((t) => {
      if (raus.indexOf(t) === -1) raus.push(t);
    });
  });
  return raus;
}

export function abstrahiere(roh, options) {
  options = options || {};
  const now = options.now || (roh && roh.observedAt) || new Date().toISOString();
  const vokabular = options.vocabulary || wortschatz();
  const beobachtungen = [];
  const jeHashtag = [];

  for (const r of (roh && roh.results) || []) {
    if (!r.ok) {
      jeHashtag.push({ hashtag: r.hashtag, ok: false, reason: r.reason,
        observedMediaCount: 0 });
      continue;
    }
    const medien = r.media || [];
    /* Gemessen, bevor die Medien verworfen werden - danach ist die
       Frage nicht mehr zu beantworten. Zurueck kommt eine Zahl, kein
       fremdes Wort. */
    const naehe = Patterns.themennaehe(medien, vokabular, r.hashtag);
    jeHashtag.push({ hashtag: r.hashtag, ok: true, edge: r.edge,
      observedMediaCount: medien.length, topicalRelevance: naehe });

    for (const m of medien) {
      /* Der einzige Ort, an dem eine fremde Caption gelesen wird - und
         sie verlaesst diese Funktion nicht. */
      const muster = Patterns.ausMedium(m);
      const o = External.observation({
        observationId: "extobs_" + (m.id || Math.random().toString(36).slice(2)),
        sourceId: "meta.instagram.hashtag_search",
        observedAt: now,
        topicCategory: r.hashtag,
        hookArchetype: muster.hookArchetype,
        formatPattern: muster.formatPattern,
        visualPattern: muster.visualPattern,
        storyPattern: muster.storyPattern,
        engagementRelative: muster.engagementRelative,
        trendVelocity: null,
        provenance: { platform: "instagram", via: "hashtag_search",
          hashtag: r.hashtag, edge: r.edge, mediaTimestamp: m.timestamp || null }
      });
      const gueltig = External.validateObservation(o);
      if (!gueltig.ok) continue;
      beobachtungen.push(Object.assign({}, o, {
        platform: "instagram",
        publishedAt: m.timestamp || null,
        publicEngagement: {
          likes: typeof m.like_count === "number" ? m.like_count : null,
          comments: typeof m.comments_count === "number" ? m.comments_count : null
        }
      }));
    }
  }

  return { observedAt: now, observations: beobachtungen, perHashtag: jeHashtag };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const RAW = arg("raw", "tmp/observe/raw.json");
  const WRITE = args.includes("--write");

  const roh = readJson(join(ROOT, RAW), null);
  if (!roh) { console.error("Keine Rohantwort unter " + RAW + "."); process.exit(2); }

  const erg = abstrahiere(roh);
  console.log("VISION UNIVERSE SOCIAL — Externe Beobachtung\n");
  console.log(erg.observations.length + " Muster aus " +
    erg.perHashtag.length + " Hashtag(s).");
  erg.perHashtag.forEach((h) => console.log("  #" + h.hashtag.padEnd(20) +
    (h.ok
      ? String(h.observedMediaCount).padStart(3) + " Medien, Themennaehe " +
        (h.topicalRelevance && h.topicalRelevance.measured
          ? Math.round(h.topicalRelevance.share * 100) + " %"
          : "ungemessen")
      : "FEHLER: " + h.reason)));

  const archetypen = {};
  erg.observations.forEach((o) => {
    const a = o.hookArchetype || "UNBESTIMMT";
    archetypen[a] = (archetypen[a] || 0) + 1;
  });
  console.log("\nHook-Archetypen: " + JSON.stringify(archetypen));
  console.log("\nKein fremder Text, kein fremdes Bild wurde gespeichert.");

  if (WRITE) {
    const alt = readJson(join(ROOT, BEOBACHTUNGEN), { observations: [] });
    const neu = { generatedAt: erg.observedAt,
      usage: "PATTERN_OBSERVATION_ONLY",
      observations: (alt.observations || []).concat(erg.observations) };
    mkdirSync(dirname(join(ROOT, BEOBACHTUNGEN)), { recursive: true });
    writeFileSync(join(ROOT, BEOBACHTUNGEN), JSON.stringify(neu, null, 2) + "\n");

    const p = readJson(join(ROOT, PORTFOLIO), { hashtags: {} });
    const fort = Portfolio.record(p.hashtags || {},
      erg.perHashtag.map((h) => ({ hashtag: h.hashtag, edge: h.edge,
        observedMediaCount: h.observedMediaCount,
        topicalRelevance: h.topicalRelevance,
        source: "meta.instagram.hashtag_search" })), erg.observedAt);
    writeFileSync(join(ROOT, PORTFOLIO),
      JSON.stringify({ generatedAt: erg.observedAt, hashtags: fort }, null, 2) + "\n");
    console.log("\nGeschrieben: " + BEOBACHTUNGEN + ", " + PORTFOLIO);
  }
}
