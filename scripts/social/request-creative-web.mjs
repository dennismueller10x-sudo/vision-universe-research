#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/request-creative-web.mjs

   DER ANSTOSS AN DEN CREATIVE AGENT — FUER EINE WEB-STORY (Owner-
   Direktive "DIRECT CREATIVE GOLDEN PATH — FINAL GO/NO-GO", 23.09.)

   Spiegelbild von request-creative.mjs, aber ohne quant/: der Brief
   entsteht aus social/data/web-story-selection.json (von
   research-web-story.mjs geschrieben), nicht aus einem technischen
   Bundle. Ab hier ist der Weg IDENTISCH zum bestehenden: derselbe
   ChatGptWork-Adapter, dasselbe Ledger, dieselbe Kennungsformel, und
   dispatch-creative-job.mjs / open-creative-request.mjs werden
   UNVERAENDERT weiterbenutzt (beide sind bereits generisch auf
   contentId, siehe deren eigene Dateien).

   DEUTSCHER HOOK — OWNER-DIREKTIVE "WEB-FIRST + FULL-POST-GENERATION"
   (24.09.), §5.1: alle sichtbaren Texte im Post sind Deutsch. Die
   Quelle liefert den Hook oft englisch (z.B. Seeking Alpha Market
   Currents) — genau das war der reale Befund bei cand_20260924_d052c375
   ("10-year U.S. Treasury yield tops 5.1%..." unveraendert als Hook).
   web-research.js waehlt den Hook weiterhin deterministisch aus echtem
   Quelltext (Grounding, Anti-Halluzination) — aber als ENGLISCHES
   Belegmaterial (`grounding_hook_en`). Die deutsche Uebersetzung/
   Adaption liefert der Agent, grounded an denselben `evidence`-Belegen;
   der Text wird in Stufe B (render-asset.mjs, unveraendert) aufgesetzt.

   Ausfuehren:
     node scripts/social/request-creative-web.mjs
     node scripts/social/request-creative-web.mjs --write
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { hydrateVerifiedJob } from "./ingest-creative.mjs";
import { verifizierteJobsFuer, LEDGER_DATEI } from "./request-creative.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ContentBrief = require(join(ROOT, "social/engines/content-brief.js"));
const ChatGptWork = require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js"));
const Ledger = require(join(ROOT, "social/engines/invocation-ledger.js"));

export function baueEvidenzAusStory(auswahl) {
  return (auswahl.fakten || []).map(function (f, i) {
    return {
      entity: auswahl.thema || auswahl.story.title, metric: "Web-Beleg " + (i + 1),
      value: f.value, unit: f.unit || null, statement: f.statement, temporal: false,
      source: { source: auswahl.story.source, observedAt: auswahl.story.publishedAt,
        state: "PUBLISHED" }
    };
  });
}

export function baueVuBrief(auswahl, options) {
  options = options || {};
  return ContentBrief.build({
    opportunity: { opportunityId: "opp_" + auswahl.contentId, topic: auswahl.story.title,
      premise: "WEB_STORY", hasCause: false, timeSensitivity: "TIMELY" },
    strategyDecision: { archetype: "WEB_STORY", mode: "EXPLORE",
      strategyVersion: options.strategyVersion || "strategy_initial" },
    visual: { visualType: auswahl.motiv.strategy },
    evidence: baueEvidenzAusStory(auswahl),
    platform: "instagram",
    now: options.now || new Date().toISOString()
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");
  const NOW = arg("now", new Date().toISOString());
  const DATA_DIR = arg("data", "social/data");

  const auswahlPfad = join(ROOT, DATA_DIR, "web-story-selection.json");
  if (!existsSync(auswahlPfad)) {
    console.error("Keine Web-Story-Auswahl unter " + join(DATA_DIR, "web-story-selection.json") +
      ". research-web-story.mjs --write laeuft vor diesem Skript.");
    process.exit(2);
  }
  const auswahl = JSON.parse(readFileSync(auswahlPfad, "utf8"));
  const contentId = auswahl.contentId;

  console.log("VISION UNIVERSE SOCIAL — Creative Request (Web-Story)");
  console.log("content_id: " + contentId);
  console.log("Story:      " + auswahl.story.title);
  console.log("Quelle:     " + auswahl.story.source + " (" + auswahl.story.publishedAt + ")");

  /* HYDRATE BEFORE REGENERATE — dieselbe Reihenfolge wie im Quant-Pfad:
     traegt das Register bereits ein VERIFIED Ergebnis zu genau dieser
     Story (derselbe Link, derselbe Tag -> dieselbe contentId), entsteht
     kein zweiter Brief. */
  const bestehendeVerified = verifizierteJobsFuer(contentId, ROOT);
  if (bestehendeVerified.length) {
    const jobEintrag = bestehendeVerified[bestehendeVerified.length - 1];
    console.log("\n--- VERIFIED CREATIVE IM REGISTER ---");
    console.log(jobEintrag.creativeJobId + " (" + jobEintrag.state + ")");
    const hydriert = hydrateVerifiedJob(contentId, jobEintrag);
    if (hydriert.ok) {
      console.log("REUSE_VERIFIED_CREATIVE: Ergebnis bereits vorhanden unter " +
        ChatGptWork.requestDir(contentId) + "/.");
      process.exit(0);
    }
    console.log("VERIFIED_RESULT_UNAVAILABLE: " + hydriert.explanation +
      " — es wird ein neuer Brief erzeugt.");
  }

  const vuBrief = baueVuBrief(auswahl, { now: NOW });

  const agentBrief = ChatGptWork.buildAgentBrief(vuBrief, {
    contentId, variants: 1,
    hookType: "web_story_grounded_de",
    hookStrategyId: "vu-web-story-grounded-de-v1",
    hookInstruction:
      "`grounding_hook_en` ist der aus der echten Quelle deterministisch gewaehlte Hook " +
      "(siehe `source_story`) — NICHT auf Deutsch, nur Belegmaterial. Liefere GENAU EINE " +
      "Hook-Variante: eine starke, kurze, soziale DEUTSCHE Uebersetzung/Adaption dieses " +
      "Hooks. Dieselbe Kernaussage, dieselben Zahlen und Fakten aus `evidence`, keine " +
      "neuen Behauptungen, keine Prognose. Alle sichtbaren Woerter auf Deutsch — " +
      "Ausnahmen nur fuer Eigennamen, Ticker und Markennamen (Owner-Direktive " +
      "WEB-FIRST + FULL-POST-GENERATION, 24.09., §5.1/§5.2).",
    visualStrategy: auswahl.motiv.strategy,
    visualInstruction: auswahl.motiv.instruction,
    palette: auswahl.motiv.palette,
    /* KOMPOSITIONS-BEWUSSTE FREIFLAECHE (§3.1/§4, Owner-Direktive 24.09.):
       Stufe B (render-asset.mjs) setzt Logo, Atlas und Hook-Text danach
       IMMER an dieselben drei Stellen — deterministisch, damit Marken-
       Bitmap und Hook-Text pixelgenau bleiben (kein KI-Modell reproduziert
       ein konkretes Logo zuverlaessig). Damit das fertige Bild wie EIN
       Entwurf wirkt statt "Bild plus draufgeklebter Text", muss die
       generierte Szene genau dort ruhig bleiben, wo die Ueberlagerung
       spaeter hinkommt — nicht generisch "irgendwo Freiflaeche". */
    visualComposition: "portrait 4:5. Reserve calm, uncluttered negative space in exactly " +
      "three zones for a deterministic brand overlay added afterward: (1) TOP-LEFT " +
      "corner — small quiet area, no busy detail, for a brand logo; (2) a horizontal " +
      "band from the upper third to the middle-left — calm, low-contrast background " +
      "(not behind bright highlights or complex texture) for a bold headline; (3) " +
      "BOTTOM-RIGHT corner — a modest quiet area for a small brand mascot silhouette, " +
      "not the visual focal point. The main subject/action occupies the center and " +
      "right-of-center, calmer toward those three zones. It must still read as ONE " +
      "cohesive, intentionally composed photograph — not a scene with empty holes cut " +
      "out of it.",
    width: 1080, height: 1350,
    objective: "Aus einer aktuellen, oeffentlich recherchierten Story eine hochwertige, " +
      "thematisch passende Bildwelt erzeugen, die als Teil EINES fertigen Markenposts " +
      "komponiert ist (nicht als spaeter zutextendes Rohbild) — kein Diagramm, kein " +
      "Dashboard, kein Bildschirmfoto, kein generischer Boersenticker. Hook und Caption " +
      "durchgehend auf Deutsch (Owner-Direktive WEB-FIRST + FULL-POST-GENERATION, " +
      "24.09., §5.1).",
    audience: "Anleger, die aktuelle Marktentwicklungen verfolgen"
  });
  agentBrief.grounding_hook_en = auswahl.hook;
  agentBrief.evidence = baueEvidenzAusStory(auswahl).map(function (e, i) {
    return { id: "ev" + (i + 1), statement: e.statement, value: e.value, unit: e.unit,
      entity: e.entity, metric: e.metric, source: e.source.source,
      observed_at: e.source.observedAt };
  });
  agentBrief.unavailable = [];
  agentBrief.evidence_package = { package_id: contentId, as_of: auswahl.story.publishedAt,
    methodology_version: "web-research-1.0", data_version: "web-research-1.0" };
  agentBrief.source_story = { title: auswahl.story.title, link: auswahl.story.link,
    source: auswahl.story.source, publishedAt: auswahl.story.publishedAt };

  const inhalt = JSON.stringify(agentBrief, null, 2) + "\n";
  const sha = ChatGptWork.blobSha(inhalt);
  const key = ChatGptWork.processingKey(agentBrief.brief_id, contentId, sha, "1.0");
  const zielPfad = ChatGptWork.requestDir(contentId) + "/authoring-brief.json";

  console.log("\n--- REQUEST ---");
  console.log("brief_id:       " + agentBrief.brief_id);
  console.log("brief_blob_sha: " + sha);
  console.log("processing_key: " + key);
  console.log("Pfad:           " + zielPfad);

  const ledgerPfad = join(ROOT, LEDGER_DATEI);
  const bestand = existsSync(ledgerPfad) ? JSON.parse(readFileSync(ledgerPfad, "utf8")) : { entries: [] };
  const ledger = Ledger.createLedger(bestand.entries || []);
  const darf = ledger.mayInvoke(key, { now: NOW });

  console.log("\n--- LEDGER ---");
  if (!darf.ok) {
    console.error("KEIN ANSTOSS: " + darf.message);
    process.exit(4);
  }
  console.log("Frei. Kein frueherer Lauf zu diesem Schluessel.");

  if (!WRITE) {
    console.log("\n(Kein --write: es wurde nichts geschrieben.)");
    process.exit(0);
  }

  const abs = join(ROOT, zielPfad);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, inhalt);

  ledger.record({ processingKey: key, state: "REQUESTED", at: NOW, contentId,
    briefId: agentBrief.brief_id, briefBlobSha: sha,
    note: "Web-Story-Brief geschrieben nach " + zielPfad + ". PR folgt." });
  writeFileSync(ledgerPfad, JSON.stringify(ledger.snapshot({ now: NOW }), null, 2) + "\n");

  console.log("\nGeschrieben: " + zielPfad);
  console.log("Ledger:      " + LEDGER_DATEI + " (REQUESTED)");
  console.log("\nNaechster Schritt: dispatch-creative-job.mjs, dann open-creative-request.mjs " +
    "(beide unveraendert, contentId=" + contentId + ").");
}
