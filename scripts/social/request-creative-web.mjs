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

   Ein bereits VERIFIED Ergebnis fuer denselben content_id erzwungen
   uebergehen (z.B. um eine Prompt-Aenderung real zu testen, waehrend
   dieselbe Story weiter die Top-Story ist):
     node scripts/social/request-creative-web.mjs --write \
       --force-attempt 2 --attempt-reason "Owner-Test der Fixes X/Y/Z"
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
const Brand = require(join(ROOT, "social/engines/brand.js"));

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

/**
 * Darf ein Anlauf erzwungen werden, und mit welcher Nummer?
 *
 * Reine Entscheidung, kein I/O — testbar ohne Register, Brief oder
 * Netzwerk. Siehe die ausfuehrliche Begruendung am Aufrufer (CLI-Block
 * unten): ein erzwungener Anlauf ist eine explizite Entscheidung, kein
 * Automatismus, und braucht deshalb sowohl eine Nummer >= 2 als auch
 * eine Begruendung.
 */
export function entscheideErzwungenenAnlauf(forceAttemptRaw, attemptReason) {
  if (forceAttemptRaw === null || forceAttemptRaw === undefined) {
    return { ok: true, attempt: null, reason: null };
  }
  const anlauf = Number(forceAttemptRaw);
  if (!Number.isInteger(anlauf) || anlauf < 2) {
    return { ok: false, reason: "invalidAttempt",
      message: "--force-attempt muss eine ganze Zahl >= 2 sein " +
        "(Anlauf 1 ist der Standardweg und braucht diese Fahne nicht)." };
  }
  if (!attemptReason) {
    return { ok: false, reason: "missingReason",
      message: "--force-attempt verlangt --attempt-reason: ein erzwungener " +
        "Anlauf ist eine Entscheidung, keine Wiederholung, und die " +
        "Begruendung gehoert in den Brief (attempt_reason)." };
  }
  return { ok: true, attempt: anlauf, reason: attemptReason };
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
  const FORCE_ATTEMPT_RAW = arg("force-attempt", null);
  const ATTEMPT_REASON = arg("attempt-reason", null);

  /* ERZWUNGENER ANLAUF — EINE ENTSCHEIDUNG, KEIN AUTOMATISMUS.
     HYDRATE BEFORE REGENERATE gilt zu Recht als Standard: dieselbe
     Story soll nicht zweimal angefragt werden, nur weil ein Lauf sie
     erneut auswaehlt. Aber genau das macht einen echten Test von
     Prompt-Aenderungen unmoeglich, solange die Top-Story dieselbe
     bleibt — ein bereits VERIFIED Job wird immer wiederverwendet, egal
     wie sehr sich brandAssets.instruction seither geaendert hat.
     buildAgentBrief() kennt den Anlauf bereits als Parameter: er
     aendert die Bytes des Briefs und damit Blob-SHA und Processing
     Key, sodass ein zweiter Anlauf sauber ein eigener Vorgang ist.
     Hier wird dieser Weg nur ans CLI durchgereicht — kein neues
     Verfahren, sondern ein fehlender Zugang zu einem bestehenden. */
  const anlaufEntscheidung = entscheideErzwungenenAnlauf(FORCE_ATTEMPT_RAW, ATTEMPT_REASON);
  if (!anlaufEntscheidung.ok) {
    console.error(anlaufEntscheidung.message);
    process.exit(2);
  }
  const erzwungenerAnlauf = anlaufEntscheidung.attempt;

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
  if (bestehendeVerified.length && erzwungenerAnlauf === null) {
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
  } else if (bestehendeVerified.length) {
    const jobEintrag = bestehendeVerified[bestehendeVerified.length - 1];
    console.log("\n--- VERIFIED CREATIVE IM REGISTER ---");
    console.log(jobEintrag.creativeJobId + " (" + jobEintrag.state + ")");
    console.log("ERZWUNGENER ANLAUF " + erzwungenerAnlauf + " (" +
      ATTEMPT_REASON + "): die Wiederverwendung wird explizit uebersprungen.");
  }

  const vuBrief = baueVuBrief(auswahl, { now: NOW });

  const agentBrief = ChatGptWork.buildAgentBrief(vuBrief, {
    contentId, variants: 1,
    attempt: erzwungenerAnlauf || undefined,
    attemptReason: erzwungenerAnlauf ? ATTEMPT_REASON : undefined,
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
    /* DIE FARBWELT (Owner-Direktive "GENERATIVES VOLLBILD, COMIC-STIL",
       26.09., dritte Iteration): die erste Fassung ("premium dark
       editorial") lieferte ein photorealistisches KI-Stockfoto — Fed-
       Gebaeude, Flaggen, Banknote, ein kleiner Roboter in der Ecke. Der
       Owner hat es gegen ein echtes virales Beispiel (plakative Comic-/
       Claymation-Anzeige, uebergrosser ausdrucksstarker Charakter,
       riesige Typo, kaum Hintergrundablenkung) gehalten und geurteilt:
       "damit gehen wir unter". Die zweite Fassung traf den Stil (schwarze
       Flaeche, grosser Mint-Pfeil, dominante Typo) — aber "Atlas als
       grosse, praesente Figur" wurde vom Modell als "Atlas fuellt den
       Grossteil des Bildes" gelesen: der Owner hat das gemessen und mit
       10-20% der Bildflaeche beziffert. Diese Fassung uebernimmt den
       getroffenen Stil unveraendert und zieht ausschliesslich Atlas'
       Groesse zurueck, auf ein kleines begleitendes Element vergleichbar
       mit dem Logo. Weiterhin OHNE Atlas/Logo selbst umzuzeichnen (§12/
       §18 in social/engines/brand.js verbieten das ausdruecklich —
       erlaubt sind nur crop/scale/reframe/compose, keine Stiltrans-
       formation der Figur oder des Zeichens selbst). */
    palette: ["near-black #050505 background as a bold FLAT color field (not a " +
      "photographic scene)", "one confident teal/mint accent close to #5FE0C0 used as a " +
      "LARGE flat shape or color block (a poster panel, not a thin highlight)", "white for " +
      "the headline text, set at poster scale", "soft grey for secondary text only"],
    style: "bold flat graphic poster style — think premium app marketing ad or comic-panel " +
      "ad, NOT a photorealistic scene and NOT a moody cinematic render. High-contrast flat " +
      "color blocking, one single strong graphic idea instead of a busy realistic scene " +
      "with many literal props (no detailed buildings, no crowds of flags, no photoreal " +
      "objects laid out on a desk). Oversized, chunky, confident sans-serif headline " +
      "typography as a PRIMARY graphic element filling a large share of the frame — not a " +
      "small caption competing with a detailed background. Energetic, punchy, made to stop " +
      "a scroll, not to look like a stock photo or a finance-news thumbnail.",
    /* -------------------------------------------------------------------
       VOLLBILD STATT FREIFLAECHE (Owner-Direktive "GENERATIVES VOLLBILD",
       26.09.): vorher liess dieser Schritt fuer Logo/Atlas/Hook-Text drei
       leere Zonen frei, die Stufe B (render-asset.mjs) danach IMMER
       deterministisch fuellte. Der Owner hat das Ergebnis gesehen und es
       als "Bild plus draufgeklebter Text" abgelehnt — Stufe B entfaellt
       jetzt fuer diesen Pfad vollstaendig (siehe manual-now-web-candidate.
       mjs), der Agent komponiert das FERTIGE Bild selbst: Motiv, Hook-Text
       und Markenzeichen in einem Zug, damit es als EIN Entwurf wirkt statt
       als zwei uebereinandergelegte Schichten. ----------------------- */
    visualComposition: "portrait 4:5, edge-to-edge — no letterboxing, no black bars, the " +
      "flat color field fills the entire frame. Compose ONE finished, publish-ready brand " +
      "post — not a raw scene for later text overlay. Bake the German headline text (see " +
      "hook_strategy) directly into the image as OVERSIZED, bold, perfectly legible " +
      "typography that dominates roughly a third of the frame (upper band), set against " +
      "the flat color field, not over busy detail. The headline typography and the " +
      "supporting graphic motif (a shape, a symbol, an arrow, a gesture — one clear idea, " +
      "never a cluttered realistic scene) are the MAIN visual content and together occupy " +
      "most of the frame. Composite the exact brand mascot file (see brand_assets.atlas) " +
      "as a SMALL supporting presence only — roughly 10-20% of the frame's area, sized " +
      "like a signature character cameo (comparable to how the logo sits), not a dominant " +
      "foreground figure. It must never compete with the headline or the main motif for " +
      "attention, and never occupy the visual center of the composition. Composite the " +
      "exact brand logo file (see brand_assets.logo) small and quiet, top-left corner, as " +
      "a signature, not a design element. The result must read as ONE cohesive, " +
      "intentionally designed brand poster — logo and mascot reproduced exactly as given " +
      "(only scaled/cropped/reframed per their brand contract), never redrawn or restyled " +
      "into a different art style, and never enlarged into the main subject of the image.",
    restrictions: ["Keine Kurse im Bild", "Keine Renditezahlen", "Kein Wasserzeichen",
      "Keine Prognose-Aussage im Bildtext", "Logo und Atlas exakt aus den " +
      "angegebenen Dateien uebernehmen, nicht neu zeichnen oder stilisieren"],
    brandAssets: {
      logo: Brand.LOGO_ASSET_PATH || "assets/vision-universe-logo.png",
      atlas: Brand.ATLAS_ASSET_PATH,
      instruction: "Beide Dateien liegen unveraendert im selben Checkout wie dieser Brief. " +
        "Als Bildreferenz verwenden und unveraendert (nur skaliert) in die Szene " +
        "komponieren — keine Neuzeichnung, keine Farb- oder Stiltransformation " +
        "ausser Skalierung (§18: Logo nicht neu zeichnen oder textuell approximieren). " +
        /* GESICHTSTREUE (Owner-Test 26.09., vu-web-4e4d3aaef2a999a2-20260926):
           direkter Pixelvergleich mit dem Original-Asset zeigte ein leicht
           abweichendes Gesicht (Laecheln, Mundwinkel) trotz "exakt,
           unveraendert" — ein generatives Modell fuegt Referenzbilder nicht
           pixelgenau ein, sondern interpretiert sie neu. Der Owner hat
           entschieden: beim rein generativen Weg bleiben, aber die
           Gesichtstreue in der Anweisung so stark wie moeglich betonen. */
        "Atlas' Gesicht, Mimik und Proportionen muessen exakt dem Referenzbild " +
        "entsprechen — dasselbe Laecheln, dieselben Gesichtszuege, derselbe " +
        "Blick. Eine andere Pose, ein anderer Blickwinkel oder eine Handbewegung " +
        "sind erlaubt; eine veraenderte, neu interpretierte oder auch nur leicht " +
        "abweichende Mimik ist es nicht. " +
        /* DER FEHLENDE VERTRAG (gefunden 26.09., PR vu-web-787176986cf7f5d8-20260926):
           `brand_elements_announcement_required` stand als reine Kennzeichnung im
           Brief, ohne dass der Agent je erfuhr, WELCHE Form die Rueckmeldung haben
           muss. Er antwortete plausibel mit einer eigenen, beschreibenden Form
           (`{logo, atlas, integration}`) statt der drei Booleans, die verifyResult()
           unten tatsaechlich prueft — jedes Ergebnis fiel seither auf
           brandElementsIncomplete, obwohl Logo und Atlas nachweislich im Bild
           waren. Die Form steht jetzt woertlich im Brief, nicht nur im Pruefcode. */
        "Wichtig fuer die Rueckmeldung: gib pro Bildvariante zusaetzlich ein Feld " +
        "`brand_elements` mit GENAU diesen drei Boolean-Feldern zurueck: " +
        "`includes_logo`, `includes_atlas`, `includes_hook_text_de` — jedes nur " +
        "`true`, wenn das jeweilige Element tatsaechlich im fertigen Bild zu sehen " +
        "ist. Kein Freitext, keine anderen Feldnamen, keine Dateipfade an dieser " +
        "Stelle — nur diese drei Booleans."
    },
    requireBrandElementsAnnounced: true,
    width: 1080, height: 1350,
    objective: "Aus einer aktuellen, oeffentlich recherchierten Story EINEN fertigen, " +
      "veroeffentlichungsreifen Markenpost erzeugen: Motiv, deutscher Hook-Text, Logo und " +
      "Atlas in einem Zug komponiert — kein Diagramm, kein Dashboard, kein Bildschirmfoto, " +
      "kein generischer Boersenticker, und kein Rohbild fuer eine spaetere Ueberlagerung. " +
      "Hook und Caption durchgehend auf Deutsch (Owner-Direktive WEB-FIRST + " +
      "FULL-POST-GENERATION, 24.09., §5.1).",
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
