#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/request-carousel.mjs

   EIN KNOPFDRUCK = EIN WORK-JOB = EIN KOMPLETTES CAROUSEL (Owner-Auftrag
   "WORK OWNS THE POST", 29.09.)

   Schreibt genau einen FULL_CAROUSEL-Brief. Jeder Aufruf ist ein neuer
   Beitrag mit eigener content_id - kein zweiter Auftrag fuer dieselbe
   Story, sondern ein neuer Auftrag, dessen Story Work selbst waehlt.
   Ab hier gilt der bestehende Weg unveraendert:
   dispatch-creative-job.mjs -> open-creative-request.mjs.

   Ausfuehren:
     node scripts/social/request-carousel.mjs
     node scripts/social/request-carousel.mjs --write [--trigger MANUAL|AUTO]
       [--research-mode WORK_WEB_RESEARCH|PACKAGE_ONLY] [--content-id vu-post-...]
   Ausgabe (stdout, letzte Zeile): content_id=<id>
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { LEDGER_DATEI } from "./request-creative.mjs";
import { PAKET_DATEI } from "./build-research-package.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ChatGptWork = require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js"));
const Ledger = require(join(ROOT, "social/engines/invocation-ledger.js"));
const Learnings = require(join(ROOT, "social/engines/social-learnings.js"));
const Brand = require(join(ROOT, "social/engines/brand.js"));
const StyleRefs = require(join(ROOT, "social/engines/style-references.js"));

/* Der Forschungsmodus des automatisierten Work-Agenten. Er wird nicht
   angenommen, sondern gemessen (Faehigkeitstest vu-probe-web-20260929);
   die Konfiguration haelt das Messergebnis fest. */
export const WORK_CONFIG = "social/config/work-agent.json";

export function workKonfiguration(root) {
  const pfad = join(root, WORK_CONFIG);
  return existsSync(pfad) ? JSON.parse(readFileSync(pfad, "utf8")) : { research_mode: "PACKAGE_ONLY" };
}

export function neueContentId(nowIso, salz) {
  const tag = String(nowIso).slice(0, 10).replace(/-/g, "");
  const h = createHash("sha256").update(String(nowIso) + "|" + String(salz || "")).digest("hex");
  return "vu-post-" + tag + "-" + h.slice(0, 10);
}

export function briefIdFuer(contentId, nowIso) {
  return "brief_" + createHash("sha256").update(contentId + "|" + nowIso).digest("hex").slice(0, 16);
}

export const NEGATIVE_REFERENZEN = [
  { content_id: "vu-web-4e4d3aaef2a999a2-20260926", hook: "50.000 DOLLAR FÜR EIN AUTO?",
    why: ["isolierte Zahl statt Story", "generisches Auto auf Preisschild",
      "billige Flat-/Vektor-Anmutung", "Atlas wirkt aufgeklebt", "Logo fast unsichtbar"] },
  { content_id: "vu-web-15e2974b16c8dc4c-20260929", hook: "BÖRSENGANG MIT EXISTENZWARNUNG",
    why: ["Hook ist eine Verdichtung der englischen Headline, keine redaktionelle Aussage",
      "Worttrennung ueber den Buchfalz (BÖRSE|NGANG, EXISTENZ|WARNUNG)",
      "Risiko-Story -> Abgrund ist eine naheliegende, keine eigene Metapher"] }
];

/* Die Owner-Referenzbilder (30.09.): Manifest lesen und MESSEN, ob jede
   Datei unveraendert im Checkout liegt, aus dem der Brief-Commit entsteht.
   Das Ergebnis reist im Brief mit - gemessen, nicht behauptet. */
export function referenzen(root) {
  const pfad = join(root, StyleRefs.MANIFEST);
  if (!existsSync(pfad)) return null;
  const manifest = JSON.parse(readFileSync(pfad, "utf8"));
  const befund = StyleRefs.lieferbefund(manifest, (p) => {
    const abs = join(root, p);
    return existsSync(abs) ? readFileSync(abs) : null;
  });
  return { manifest, befund };
}

export function baueBrief(options) {
  const brief = ChatGptWork.buildCarouselBrief({
    contentId: options.contentId,
    briefId: briefIdFuer(options.contentId, options.now),
    now: options.now,
    trigger: options.trigger,
    researchMode: options.researchMode,
    researchPackage: options.researchPackage,
    ownerTopic: options.ownerTopic || null,
    socialLearnings: options.socialLearnings,
    negativeReferences: NEGATIVE_REFERENZEN,
    positiveReferences: [],
    brandAssets: { logo: Brand.LOGO_ASSET_PATH || "assets/vision-universe-logo.png",
      atlas: Brand.ATLAS_ASSET_PATH || "assets/atlas.png" },
    width: 1080, height: 1350,
    delivery: options.delivery,
    styleReferences: options.styleReferences && options.styleReferences.manifest
  });
  if (brief.style_references && options.styleReferences) {
    const b = options.styleReferences.befund;
    brief.style_references.delivered_in_checkout = b.delivered;
    brief.style_references.delivery_measurement = b.satz;
  }
  return brief;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");
  const NOW = arg("now", new Date().toISOString());
  const DATA_DIR = arg("data", "social/data");
  const TRIGGER = arg("trigger", "MANUAL");
  const OWNER_TOPIC = arg("owner-topic", null);
  const konfig = workKonfiguration(ROOT);
  const MODUS = arg("research-mode", konfig.research_mode || "PACKAGE_ONLY");
  const CID = arg("content-id", null) || neueContentId(NOW, process.env.GITHUB_RUN_ID || process.pid);

  const paketPfad = join(ROOT, DATA_DIR, PAKET_DATEI);
  const paket = existsSync(paketPfad) ? JSON.parse(readFileSync(paketPfad, "utf8")) : null;
  if (!paket && MODUS === "PACKAGE_ONLY") {
    console.error("Kein Recherchepaket unter " + join(DATA_DIR, PAKET_DATEI) +
      " - im Modus PACKAGE_ONLY hat Work sonst nichts, woraus es waehlen kann. " +
      "build-research-package.mjs --write laeuft vorher.");
    process.exit(4);
  }

  const perfPfad = join(ROOT, DATA_DIR, "performance.json");
  const lernen = existsSync(perfPfad)
    ? Learnings.ableiten(JSON.parse(readFileSync(perfPfad, "utf8"))) : [];

  const refs = referenzen(ROOT);
  const brief = baueBrief({ contentId: CID, now: NOW, trigger: TRIGGER, researchMode: MODUS,
    researchPackage: paket || { stories: [], already_covered_urls: [] }, socialLearnings: lernen,
    ownerTopic: OWNER_TOPIC, delivery: konfig.delivery_mode || ChatGptWork.COVER_FIRST,
    styleReferences: refs });

  const inhalt = JSON.stringify(brief, null, 2) + "\n";
  const sha = ChatGptWork.blobSha(inhalt);
  const key = ChatGptWork.processingKey(brief.brief_id, CID, sha, "1.0");
  const zielPfad = ChatGptWork.requestDir(CID) + "/authoring-brief.json";

  console.log("VISION UNIVERSE SOCIAL — Carousel-Auftrag (ein Work-Job)");
  console.log("content_id:     " + CID);
  console.log("Recherche:      " + MODUS + " (" + ((paket && paket.stories.length) || 0) + " Storys im Paket)");
  console.log("Learnings:      " + lernen.length);
  console.log("Lieferung:      " + brief.delivery.mode);
  console.log("REFERENCE_IMAGES_DELIVERED_TO_WORK = " + !!(refs && refs.befund.delivered) +
    (refs ? " (" + refs.befund.satz + ")" : " (kein Manifest)"));
  console.log("processing_key: " + key);

  const ledgerPfad = join(ROOT, LEDGER_DATEI);
  const bestand = existsSync(ledgerPfad) ? JSON.parse(readFileSync(ledgerPfad, "utf8")) : { entries: [] };
  const ledger = Ledger.createLedger(bestand.entries || [], bestand.latencyObservations || []);
  const darf = ledger.mayInvoke(key, { now: NOW });
  if (!darf.ok) { console.error("KEIN ANSTOSS: " + darf.message); process.exit(4); }

  if (!WRITE) {
    console.log("\n(Kein --write: es wurde nichts geschrieben.)");
    console.log("content_id=" + CID);
    process.exit(0);
  }
  const abs = join(ROOT, zielPfad);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, inhalt);
  ledger.record({ processingKey: key, state: "REQUESTED", at: NOW, contentId: CID,
    briefId: brief.brief_id, briefBlobSha: sha,
    note: "FULL_CAROUSEL-Brief geschrieben nach " + zielPfad + ". PR folgt." });
  writeFileSync(ledgerPfad, JSON.stringify(ledger.snapshot({ now: NOW }), null, 2) + "\n");
  console.log("\nGeschrieben: " + zielPfad);
  console.log("content_id=" + CID);
}
