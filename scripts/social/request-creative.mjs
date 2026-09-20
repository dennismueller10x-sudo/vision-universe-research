/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/request-creative.mjs

   DER ANSTOSS AN DEN CREATIVE AGENT

   Vision Universe legt einen Brief auf einen Request-Branch. Das
   PR-Ereignis loest den Agenten aus. Er schreibt sein Ergebnis samt
   Bildasset auf denselben Branch zurueck.

   Dieses Skript macht die erste Haelfte: es baut den Brief aus dem
   kanonischen Evidenzpaket, schreibt ihn an den vorgesehenen Ort und
   traegt den Anstoss ins Ledger ein.

   -------------------------------------------------------------------------
   DER LEDGER-EINTRAG STEHT VOR DEM PULL REQUEST
   -------------------------------------------------------------------------

   Dieselbe Reihenfolge wie beim Veroeffentlichungsanspruch, und aus
   demselben Grund: zwischen "PR geoeffnet" und "Agent gestartet" liegt
   ein fremdes System. Wer erst danach eintraegt, hat bei einem Abbruch
   keinen Eintrag — und der naechste Lauf stoesst denselben Brief erneut
   an.

   -------------------------------------------------------------------------
   WAS ES NICHT TUT
   -------------------------------------------------------------------------

   Es oeffnet keinen Pull Request. Das ist eine Handlung mit
   Aussenwirkung, sie loest einen fremden Agenten aus, und sie gehoert
   deshalb in einen Schritt, den ein Mensch oder ein Workflow
   ausdruecklich ausfuehrt.

   Ausfuehren:
     node scripts/social/request-creative.mjs --symbol XOM
     node scripts/social/request-creative.mjs --symbol XOM --write
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const EvidencePackage = require(join(ROOT, "social/engines/evidence-package.js"));
const ContentBrief = require(join(ROOT, "social/engines/content-brief.js"));
const ChatGptWork = require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js"));
const Ledger = require(join(ROOT, "social/engines/invocation-ledger.js"));

export const LEDGER_DATEI = "social/data/creative-invocations.json";

/** Die Inhaltskennung. Eine Definition, in der Engine — der Zyklus
    rechnet dieselbe aus, um das Ergebnis spaeter wiederzufinden. */
export const contentIdFor = EvidencePackage.contentIdFor;

/* --------------------------------------------------------------- Lauf */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");

  const SYMBOL = String(arg("symbol", "")).toUpperCase();
  const NOW = arg("now", new Date().toISOString());

  if (!SYMBOL) { console.error("Kein --symbol."); process.exit(2); }

  const bundlePfad = join(ROOT, "quant/data/technical/instruments", SYMBOL + ".json");
  if (!existsSync(bundlePfad)) {
    console.error("Kein technisches Bundle fuer " + SYMBOL + ".");
    process.exit(2);
  }

  const roh = JSON.parse(readFileSync(bundlePfad, "utf8"));
  const paket = EvidencePackage.fromTechnicalBundle(roh.bundle, {
    entity: SYMBOL, source: roh.bundle.source, now: NOW });

  console.log("VISION UNIVERSE SOCIAL — Creative Request");
  console.log("Titel:      " + SYMBOL);
  console.log("Datenstand: " + paket.asOf);
  console.log("Evidenz:    " + paket.evidence.length + " Aussagen ueber " +
    paket.dimensionsAvailable.length + " Dimensionen");
  for (const u of paket.unavailable) {
    console.log("            nicht verfuegbar: " + u.dimension + " — " + u.reason);
  }

  /* ---------------------------------------------------- Die Hinlaenglichkeit */
  const hinreichend = EvidencePackage.assessSufficiency(paket);
  console.log("\n--- STORY SUFFICIENCY ---");
  console.log(hinreichend.explanation);
  if (!hinreichend.sufficient) {
    console.log("\nKEIN REQUEST. Ein hoher Score allein ist keine Geschichte.");
    process.exit(0);
  }

  /* ------------------------------------------------------------ Der Brief */
  const contentId = contentIdFor(SYMBOL, paket.asOf);

  const vuBrief = ContentBrief.build({
    opportunity: { opportunityId: "opp_" + contentId, topic:
      SYMBOL + " — technische Lage zum " + paket.asOf,
      premise: "SECURITY_METRIC", hasCause: false, timeSensitivity: "TIMELY" },
    strategyDecision: { archetype: "STOCK_STORY", mode: "EXPLORE",
      strategyVersion: arg("strategy-version", "strategy_initial") },
    visual: { visualType: "FUTURE_TECH" },
    evidence: paket.evidence.map((e) => ({
      entity: e.entity, metric: e.metric, value: e.value, unit: e.unit,
      statement: e.statement, temporal: e.temporal === true,
      source: { source: e.source, observedAt: e.observedAt, state: e.state } })),
    platform: "instagram",
    now: NOW
  });

  const agentBrief = ChatGptWork.buildAgentBrief(vuBrief, {
    contentId,
    variants: 4,
    hookType: "value_first",
    hookStrategyId: "vu-stock-story-value-first-v1",
    hookInstruction:
      "Formuliere vier deutlich verschiedene Hooks innerhalb dieser Strategie. " +
      "Jede Zahl muss exakt aus `evidence` stammen. Keine Prognose, keine " +
      "Empfehlung, keine Ursachenbehauptung.",
    visualStrategy: "FUTURE_TECH",
    visualInstruction:
      "Eine hochwertige, abstrakte Future-Tech-Szene im Vision-Universe-Register. " +
      "Sie illustriert Messung und Einordnung — nicht Kursverlauf und nicht Gewinn.",
    palette: ["deep black", "white", "chrome", "electric cyan", "subtle violet"],
    visualComposition: "portrait 4:5, centered, generous negative space",
    width: 1080, height: 1350,
    objective:
      "Aus der freigegebenen technischen Evidenz einen belegbaren, nuechternen " +
      "Beitrag formulieren, der die Leitzahl EINORDNET statt sie zu feiern.",
    audience: "Anleger, die wissen wollen, woher eine Zahl kommt"
  });

  /* Die Belege reisen als eigener Block mit — der Agent bekommt die
     fertigen Saetze der Engines und nicht nur Zahlenpaare. */
  agentBrief.evidence = paket.evidence.map((e) => ({
    id: e.id, dimension: e.dimension, statement: e.statement,
    value: e.value, unit: e.unit, entity: e.entity, metric: e.metric,
    source: e.source, observed_at: e.observedAt, pointer: e.pointer
  }));
  agentBrief.unavailable = paket.unavailable;
  agentBrief.evidence_package = {
    package_id: paket.packageId, as_of: paket.asOf,
    methodology_version: paket.methodologyVersion, data_version: paket.dataVersion
  };

  const inhalt = JSON.stringify(agentBrief, null, 2) + "\n";
  const sha = ChatGptWork.blobSha(inhalt);
  const key = ChatGptWork.processingKey(agentBrief.brief_id, contentId, sha, "1.0");
  const zielPfad = ChatGptWork.requestDir(contentId) + "/authoring-brief.json";

  console.log("\n--- REQUEST ---");
  console.log("content_id:      " + contentId);
  console.log("brief_id:        " + agentBrief.brief_id);
  console.log("brief_blob_sha:  " + sha);
  console.log("processing_key:  " + key);
  console.log("Pfad:            " + zielPfad);
  console.log("Erwartete Kennungen:");
  for (let i = 0; i < agentBrief.authoring_requirements.hook_variant_count; i += 1) {
    console.log("  " + ChatGptWork.hookVariantId(contentId, sha,
      agentBrief.hook_strategy.hook_type, i));
  }

  /* ----------------------------------------------------------- Das Ledger */
  const ledgerPfad = join(ROOT, LEDGER_DATEI);
  const bestand = existsSync(ledgerPfad)
    ? JSON.parse(readFileSync(ledgerPfad, "utf8")) : { entries: [] };
  const ledger = Ledger.createLedger(bestand.entries || []);

  const darf = ledger.mayInvoke(key, { now: NOW });
  console.log("\n--- LEDGER ---");
  if (!darf.ok) {
    /* -----------------------------------------------------------------
       EIN VERWEIGERTER ANSTOSS IST KEIN ERFOLG

       Hier stand `process.exit(0)`. Damit las jede Automation, die den
       Rueckgabewert prueft - und das ist der Sinn eines Rueckgabewerts -
       die Verweigerung als "in Ordnung, weiter". Ein Gatter, das mit 0
       endet, ist kein Gatter, sondern ein Hinweis.
       ----------------------------------------------------------------- */
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

  /* Der Eintrag steht VOR dem Pull Request. */
  ledger.record({ processingKey: key, state: "REQUESTED", at: NOW,
    contentId, briefId: agentBrief.brief_id, briefBlobSha: sha,
    note: "Brief geschrieben nach " + zielPfad + ". PR folgt." });

  writeFileSync(ledgerPfad,
    JSON.stringify(ledger.snapshot({ now: NOW }), null, 2) + "\n");

  console.log("\nGeschrieben: " + zielPfad);
  console.log("Ledger:      " + LEDGER_DATEI + " (REQUESTED)");
  console.log("\nNaechster Schritt: Branch pushen und Pull Request oeffnen.");
  console.log("Das PR-Ereignis loest den Creative Agent aus.");
}
