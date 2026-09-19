/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/rank-social-opportunities.mjs

   DER BEWEIS: EIN QUANT-SIGNAL GEWINNT NICHT MEHR AUTOMATISCH

   Dieser Lauf erzeugt keinen Beitrag, keinen Kandidaten und keine
   Work-Ausfuehrung. Er laesst Themen aus mehreren Content Families
   gegeneinander antreten und zeigt, was dabei herauskommt.

   Gemessen wird nur, was real vorliegt. Was fehlt, bleibt UNAVAILABLE
   und wird als solches ausgewiesen - eine erfundene Zahl waere hier
   besonders teuer, weil die Rangfolge auf ihr beruhte.

   Ausfuehren:
     node scripts/social/rank-social-opportunities.mjs
     node scripts/social/rank-social-opportunities.mjs --out social/data
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { baueSlate } from "./build-opportunity-slate.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Opportunity = require(join(ROOT, "social/engines/opportunity.js"));
const Social = require(join(ROOT, "social/engines/social-opportunity.js"));
const Brand = require(join(ROOT, "social/engines/brand.js"));
const Audience = require(join(ROOT, "social/engines/audience-frame.js"));

function readJson(p, f) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : f; }
  catch { return f; }
}

const NAMEN = readJson(join(ROOT, "discover/config/company-names.json"), { names: {} }).names || {};

/* -------------------------------------------------------------------
   WAS SICH WIRKLICH MESSEN LAESST

   Jede Dimension hier kommt aus einer Datei im Repository. Keine
   Schaetzung, kein Vorgabewert, kein "0.5, damit das Feld gefuellt
   aussieht".
   ------------------------------------------------------------------- */
function messe(topic, kontext) {
  const m = {};

  /* Markenpassung: aus brand.js, derselben Rechnung wie im Zyklus. */
  m.brandFit = Brand.topicFit(topic.title || "", topic.entities);

  /* Luecke im eigenen Bestand: wann wurde diese Familie zuletzt
     behandelt? Ohne Historie ist die Luecke maximal - das ist gemessen
     und nicht geschaetzt. */
  const zuletzt = kontext.history.filter((h) => h.family === topic.family);
  m.contentGap = zuletzt.length === 0 ? 1
    : Math.min(1, (Date.parse(kontext.now) - Date.parse(zuletzt[0].at)) / (30 * 86400000));

  /* Aktualitaet des Anlasses: aus dem Stand der Quelldatei. */
  m.hoursSinceTrigger = topic.asOf
    ? (Date.parse(kontext.now) - Date.parse(topic.asOf)) / 3600000 : null;

  /* Plattformpassung braucht einen angebundenen Provider. Keiner da,
     also null - nicht 0 und nicht 0.5. */
  m.platformFit = kontext.providerConfigured ? kontext.platformFit : null;

  /* Publikumsinteresse und historische Leistung brauchen Daten, die es
     erst nach dem ersten veroeffentlichten Beitrag gibt. */
  m.audienceInterest = null;
  m.historicalPerformance = null;
  m.historicalSampleSize = 0;

  return m;
}

export function dryRun(options) {
  options = options || {};
  const now = options.now || new Date().toISOString();
  const slate = baueSlate();

  const memory = readJson(join(ROOT, "social/data/content-memory.json"), { entries: [] });
  const history = (memory.entries || [])
    .filter((e) => e.publishedAt)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .map((e) => ({ family: e.contentFamily || null, at: e.publishedAt }));

  const meta = readJson(join(ROOT, "social/data/meta-connection.json"), null);
  const providerConfigured = !!(meta && meta.connected);

  const kontext = { now, history, providerConfigured, platformFit: null };

  const signale = {};
  for (const t of slate.topics) signale[t.topicId] = messe(t, kontext);

  /* Was fehlt, weil das SYSTEM jung ist - nicht, weil das Thema
     schlecht waere. Ohne diese Unterscheidung entstuende ein
     Stillstand: bewerten erst mit Publikumsdaten, Publikumsdaten erst
     durchs Veroeffentlichen. */
  const systemisch = ["audienceInterest", "historicalPerformance"]
    .concat(providerConfigured ? [] : ["platformFit"]);

  const rang = Social.rank(slate.topics, {
    scorer: (eingang, opts) => Opportunity.score(eingang,
      Object.assign({}, opts, { systemicallyUnavailable: systemisch })),
    history, signals: signale
  });

  /* Audience Framing gehoert VOR das Authoring - also auch vor jede
     Aussage darueber, was aus einer Gelegenheit werden koennte. */
  const mitRahmen = rang.ranked.map((b) => Object.assign({}, b, {
    audienceFrame: Audience.frame(b.topic, { names: NAMEN })
  }));

  return {
    generatedAt: now,
    purpose: "NORTH_STAR_SHIFT_PROOF",
    publishes: false,
    slateSize: slate.topics.length,
    ranked: mitRahmen,
    rejected: rang.rejected,
    families: rang.families,
    familyCount: rang.familyCount,
    unavailableDimensions: [
      { dimension: "audienceInterest", reason: "Keine Publikumsdaten - es wurde noch nichts veroeffentlicht." },
      { dimension: "historicalPerformance", reason: "Keine Leistungsdaten - dieselbe Ursache." },
      { dimension: "platformFit", reason: providerConfigured ? null : "Kein Social-Provider konfiguriert." }
    ].filter((d) => d.reason),
    predictsPerformance: false
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--out");
  const OUT = i === -1 ? null : args[i + 1];
  const r = dryRun();

  console.log("VISION UNIVERSE SOCIAL — Social Opportunity Dry Run");
  console.log("Zweck: " + r.purpose + " — kein Beitrag, kein Kandidat, keine Work-Ausfuehrung\n");
  console.log("Themen im Slate: " + r.slateSize +
    " | bewertbar: " + r.ranked.length + " | Familien: " + r.familyCount);
  console.log("Familienverteilung: " + JSON.stringify(r.families) + "\n");

  const top = r.ranked.slice(0, Number(args[args.indexOf("--top") + 1]) || 5);
  top.forEach((b, n) => {
    const t = b.topic;
    const a = b.audienceFrame;
    console.log("=".repeat(70));
    console.log("[" + (n + 1) + "] " + (t.title || t.topicId) + "   Score " + b.score);
    console.log("    Content Family : " + t.family);
    console.log("    Entity Type    : " + t.entityType +
      " (" + (t.entities.length === 0 ? "ohne Entitaet" : t.entities.length) + ")");
    console.log("    Source         : " + t.sources.join(", "));
    console.log("    Entstand aus   : " + (b.derivedFrom || "keinem Marktsignal"));
    console.log("    Evidence       : " + (t.evidenceRefs.join(", ") || "—"));
    console.log("    --- Audience Framing ---");
    console.log("    Fuer wen       : " + a.targetAudience);
    console.log("    Vorwissen      : " + a.assumedKnowledge);
    console.log("    Warum jetzt    : " + a.whyNow);
    console.log("    Warum wichtig  : " + a.whyCare);
    console.log("    Kernfrage      : " + a.coreQuestion);
    console.log("    Klarnamen      : " + (a.publicEntityNames.join(", ") || "—"));
    console.log("    Nicht im Hook  : " + (a.internalTermsNotSuitableForHook.join(", ") || "—"));
    console.log("    Rahmen-Basis   : " + a.basis);
    if (a.findings.length) {
      a.findings.forEach((f) => console.log("    ! " + f.id + ": " + f.message));
    }
    console.log("    --- Vorschlaege (keine Prognose) ---");
    console.log("    Hook Strategy  : " + a.suggestedHookStrategy);
    console.log("    Visual Strategy: " + a.suggestedVisualStrategy);
    console.log("    Explore/Exploit: " + (b.saturation.measured
      ? (b.saturation.value > 0.4 ? "EXPLORE (Familie gesaettigt)" : "EXPLOIT")
      : "EXPLORE (keine Historie — nichts zu bestaetigen)"));
    console.log("    --- Faktoren ---");
    b.drivers.slice(0, 3).forEach((d) => console.log("      + " + (d.label || d.dimension) +
      ": " + (d.explanation || "")));
    console.log("    Saettigung     : " + b.saturation.explanation);
    console.log("    Nicht anwendbar: " + b.notApplicable.join(", "));
    console.log("    Ungemessen     : " + b.missing.map((x) => x.dimension).join(", "));
  });

  console.log("=".repeat(70));
  console.log("\n--- WAS NICHT GEMESSEN WERDEN KANN ---");
  r.unavailableDimensions.forEach((d) =>
    console.log("  " + d.dimension + ": " + d.reason));
  console.log("\nKeine dieser Zahlen ist eine Leistungsprognose. predictsPerformance = " +
    r.predictsPerformance + ". Bei n=0 sagt eine Rangfolge, worueber zu sprechen");
  console.log("sich lohnen KOENNTE - nicht, was funktionieren wird.");

  if (r.rejected.length) {
    console.log("\n--- NICHT BEWERTBAR (" + r.rejected.length + ") ---");
    const gruende = {};
    r.rejected.forEach((b) => {
      const g = b.explanation || "unbekannt";
      gruende[g] = (gruende[g] || 0) + 1;
    });
    Object.keys(gruende).forEach((g) => console.log("  " + gruende[g] + "x " + g));
  }

  if (OUT) {
    const ziel = join(ROOT, OUT, "social-opportunity-dryrun.json");
    mkdirSync(dirname(ziel), { recursive: true });
    writeFileSync(ziel, JSON.stringify(r, null, 2) + "\n");
    console.log("\nGeschrieben: " + join(OUT, "social-opportunity-dryrun.json"));
  }
}
