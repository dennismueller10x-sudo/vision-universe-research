#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/manual-now-web-candidate.mjs

   DER FERTIGE KANDIDAT AUS EINER WEB-STORY (Owner-Direktive "DIRECT
   CREATIVE GOLDEN PATH — FINAL GO/NO-GO", 23.09.)

   Letzter Schritt des Direct Creative Editor: liegt zu
   social/data/web-story-selection.json ein VERIFIED Creative-Ergebnis
   vor (chatgpt-work hat die Bildwelt geliefert), wird komponiert
   (Stufe B, render-asset.mjs — unveraendert), geprueft (Hard Final
   Creative Gate — unveraendert) und als Publish Candidate geschrieben,
   in genau der Form, die das bestehende Approval Center liest
   (dieselben Felder wie make-publish-candidate.mjs baut).

   FAIL CLOSED: liegt noch kein VERIFIED Ergebnis vor, entsteht KEIN
   Kandidat. chatgpt-work arbeitet asynchron (siehe dessen Adapter) —
   der naechste Lauf (JETZT PRUEFEN oder Zeitplan) findet das Ergebnis,
   sobald es da ist, ueber denselben Weg.

   Ausfuehren:
     node scripts/social/manual-now-web-candidate.mjs --data social/data --write
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { hydrateVerifiedJob } from "./ingest-creative.mjs";
import { verifizierteJobsFuer } from "./request-creative.mjs";
import { kandidatenDir, frequenzbefund, visuelleGuete } from "./make-publish-candidate.mjs";
import { ausgabePfad } from "../quality/out-path.mjs";
import * as AssetRenderer from "./render-asset.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ContentHash = require(join(ROOT, "social/engines/content-hash.js"));
const OwnerDecision = require(join(ROOT, "social/engines/owner-decision.js"));
const Hash = require(join(ROOT, "quant/engines/hash.js"));
const CreativeGate = require(join(ROOT, "social/engines/creative-gate.js"));
const AutorChatGptWork = require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js"));
const CadenceConfig = require(join(ROOT, "social/config/cadence.json"));

const ASSET_DIR = "assets/social";
const SITE_BASE = "https://" + readFileSync(join(ROOT, "CNAME"), "utf8").trim();

function transportFuer(root) {
  return {
    readResult: function (contentId) {
      const pfad = join(root, "authoring/requests", String(contentId), "authoring-result.json");
      return existsSync(pfad) ? JSON.parse(readFileSync(pfad, "utf8")) : null;
    },
    readAsset: function (relPfad) {
      const pfad = join(root, String(relPfad));
      return existsSync(pfad) ? readFileSync(pfad) : null;
    },
    readBriefRaw: function (contentId) {
      const pfad = join(root, "authoring/requests", String(contentId), "authoring-brief.json");
      return existsSync(pfad) ? readFileSync(pfad) : null;
    }
  };
}

/** Aus einer materialisierten VERIFIED-Story das Bild-Asset UND den vom
    Agenten gelieferten deutschen Hook/Caption holen — derselbe Weg, den
    run-social-cycle.mjs fuer den Quant-Pfad benutzt
    (AutorChatGptWork.createChatGptWorkAuthor(...).write()).

    DEUTSCHER TEXT KOMMT VOM AGENTEN (Owner-Direktive "WEB-FIRST +
    FULL-POST-GENERATION", 24.09., §5.1): web-research.js waehlt den
    Hook weiterhin deterministisch aus echtem Quelltext (Grounding),
    aber nur als englisches Belegmaterial (`grounding_hook_en`, siehe
    request-creative-web.mjs). Die deutsche Uebersetzung liefert der
    Agent als hook_variants[0]/caption — FAIL CLOSED, wenn keine
    Variante vorliegt: kein Rueckfall auf den englischen Quelltext. */
export function holeAsset(contentId, root) {
  const autor = AutorChatGptWork.createChatGptWorkAuthor({
    transport: transportFuer(root), variants: 1 });
  const ergebnis = autor.write({ contentId }, { contentId });
  if (!ergebnis || !ergebnis.asset) {
    return { ok: false, reason: (ergebnis && ergebnis.reason) || "Kein Bild-Asset im Ergebnis." };
  }
  const variante = (ergebnis.variants || [])[0];
  if (!variante || !variante.hook || !variante.caption) {
    return { ok: false, reason: "Kein deutscher Hook/Caption vom Creative Agent im " +
      "Ergebnis (hook_variants leer oder unvollstaendig) — kein Rueckfall auf den " +
      "englischen Quelltext." };
  }
  return { ok: true, asset: ergebnis.asset, hook: variante.hook, caption: variante.caption };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");
  const NOW = arg("now", new Date().toISOString());
  const DATA_DIR = arg("data", "social/data");

  console.log("VISION UNIVERSE SOCIAL — Publish Candidate (Web-Story)");

  const auswahlPfad = join(ROOT, DATA_DIR, "web-story-selection.json");
  if (!existsSync(auswahlPfad)) {
    console.error("Keine Web-Story-Auswahl unter " + join(DATA_DIR, "web-story-selection.json") + ".");
    process.exit(2);
  }
  const auswahl = JSON.parse(readFileSync(auswahlPfad, "utf8"));
  const contentId = auswahl.contentId;
  console.log("content_id: " + contentId);
  console.log("Story:      " + auswahl.story.title);

  const verified = verifizierteJobsFuer(contentId, ROOT);
  if (!verified.length) {
    console.log("\nNOCH_NICHT_VERIFIZIERT: Zu " + contentId + " liegt noch kein " +
      "CREATIVE_JOB_VERIFIED im Register. chatgpt-work arbeitet asynchron - der " +
      "naechste Lauf findet das Ergebnis, sobald es da ist.");
    process.exit(4);
  }
  const jobEintrag = verified[verified.length - 1];
  const hydriert = hydrateVerifiedJob(contentId, jobEintrag);
  if (!hydriert.ok) {
    console.error("\nVERIFIED_RESULT_UNAVAILABLE: " + hydriert.explanation);
    process.exit(4);
  }
  console.log("\nVERIFIED: " + jobEintrag.creativeJobId);

  const assetBefund = holeAsset(contentId, ROOT);
  if (!assetBefund.ok) {
    console.error("\nKEIN_BILD_ASSET: " + assetBefund.reason);
    process.exit(4);
  }
  const bild = assetBefund.asset;
  const pkg = { hook: assetBefund.hook, packageId: contentId, caption: assetBefund.caption };

  /* =====================================================================
     VOLLBILD VOM AGENTEN STATT STUFE B (Owner-Direktive "GENERATIVES
     VOLLBILD", 26.09.)

     Traegt das Ergebnis eine geprueft VOLLSTAENDIGE brand_elements-
     Ankuendigung (siehe chatgpt-work/adapter.js::verifyResult — das ist
     bereits erzwungen, kein stiller Normalfall), hat der Agent Logo,
     Atlas und Hook-Text selbst ins Bild komponiert. Stufe B
     (render-asset.mjs) wuerde dann ein ZWEITES Mal draufsetzen — genau
     das "Bild plus draufgeklebter Text", das der Owner ausdruecklich
     abgelehnt hat. Der gelieferte Bild-Byte-Strom wird stattdessen
     unveraendert uebernommen.

     ATLAS_PRESENT/CANONICAL_LOGO_PRESENT/TEXT_ON_VISUAL_PRESENT sind auf
     diesem Pfad eine AGENTEN-ANKUENDIGUNG, keine unabhaengige Messung
     (kein Bildanalysewerkzeug im Haus) — kenntlich gemacht in
     `presentation.visualComposition` und im Hard Final Creative Gate
     (creative-gate.js), das genau deshalb zwischen "gemessen" und
     "angekuendigt" unterscheidet. Der Owner im Approval Center ist die
     tatsaechliche Pruefinstanz fuer dieses Bild. */
  const agentKomponiert = !!(bild.brandElements &&
    bild.brandElements.includes_logo === true &&
    bild.brandElements.includes_atlas === true &&
    bild.brandElements.includes_hook_text_de === true);

  let ziel, gerendert, imageUrl;

  if (agentKomponiert) {
    const quellPfad = join(ROOT, String(bild.asset_path));
    if (!existsSync(quellPfad)) {
      console.error("\nCREATIVE_GENERATION_FAILED (Vollbild): Asset nicht auffindbar unter " +
        bild.asset_path + ".");
      console.error("Kein Rueckfall — kein Kandidat.");
      process.exit(4);
    }
    const bytes = readFileSync(quellPfad);
    const endung = /png/i.test(bild.mime_type || "") ? "png"
      : /jpe?g/i.test(bild.mime_type || "") ? "jpg" : "png";
    ziel = join(ausgabePfad(ROOT, ASSET_DIR), pkg.packageId + "." + endung);
    mkdirSync(dirname(ziel), { recursive: true });
    writeFileSync(ziel, bytes);
    gerendert = { bytes: bytes.length,
      atlas: { passed: true, quelle: "agent_announced" },
      logo: { passed: true, quelle: "agent_announced" } };
    imageUrl = SITE_BASE + "/" + ASSET_DIR + "/" + pkg.packageId + "." + endung;
    console.log("\nVollbild vom Creative Agent uebernommen: " + pkg.packageId + "." + endung +
      " (" + gerendert.bytes + " Bytes, Logo/Atlas/Text agentenangekuendigt).");
  } else {
    /* --------------------------------------------------------- STUFE B */
    const bildplan = AssetRenderer.planGeschichte(pkg, {
      asset_path: bild.asset_path, state: bild.state,
      asset_sha256: bild.asset_sha256, mime_type: bild.mime_type
    }, { root: ROOT });

    if (!bildplan.ok) {
      console.error("\nCREATIVE_GENERATION_FAILED (Stufe B): " + bildplan.reason + " — " +
        (bildplan.message || ""));
      console.error("Kein Rueckfall auf ein schwaches Bild — kein Kandidat.");
      process.exit(4);
    }

    ziel = join(ausgabePfad(ROOT, ASSET_DIR), pkg.packageId + ".jpg");
    try {
      gerendert = AssetRenderer.render(bildplan, ziel, {
        schrift: AssetRenderer.ladeSchrift(ROOT), caption: pkg.caption
      });
    } catch (err) {
      console.error("\nCREATIVE_GENERATION_FAILED (Rendern): " + (err && err.message || err));
      console.error("Kein Rueckfall — kein Kandidat.");
      process.exit(4);
    }
    console.log("\nGerendert: " + pkg.packageId + " (" + gerendert.bytes + " Bytes)");
    imageUrl = SITE_BASE + "/" + ASSET_DIR + "/" + pkg.packageId + ".jpg";
  }
  const inhalt = { contentId: pkg.packageId, imageUrl, caption:
    pkg.caption + (auswahl.hashtags.length ? "\n\n" +
      auswahl.hashtags.map((t) => "#" + t).join(" ") : "") };
  const abdruck = ContentHash.contentHash(inhalt);
  const candidateId = "cand_" + NOW.slice(0, 10).replace(/-/g, "") + "_" +
    Hash.prefixedHash("c", { packageId: pkg.packageId, hash: abdruck }).slice(2, 10);

  const verzeichnis = ausgabePfad(ROOT, kandidatenDir(DATA_DIR));
  let offene = [];
  let vorgaenger = null;
  let version = 1;
  if (existsSync(verzeichnis)) {
    offene = readdirSync(verzeichnis)
      .filter((f) => f.endsWith(".json") && !f.endsWith(".request.json"))
      .map((f) => ({ datei: f, daten: JSON.parse(readFileSync(join(verzeichnis, f), "utf8")) }))
      .filter((x) => OwnerDecision.istMaschinell(x.daten.state) && x.daten.state !== "SUPERSEDED")
      .sort((a, b) => String(a.daten.createdAt).localeCompare(String(b.daten.createdAt)));
    if (offene.length) {
      vorgaenger = offene[offene.length - 1];
      version = Math.max.apply(null, offene.map((x) => Number(x.daten.version) || 1)) + 1;
    }
  }

  const identisch = offene.filter((x) => x.daten.contentHash === abdruck);
  if (identisch.length) {
    console.log("\nUNVERAENDERT — bereits ein offener Kandidat mit demselben Inhalt: " +
      identisch[0].daten.candidateId + ".");
    process.exit(0);
  }

  const kandidat = {
    candidateId, version,
    supersedes: vorgaenger ? vorgaenger.daten.candidateId : null,
    supersedesAll: offene.map((x) => x.daten.candidateId),
    createdAt: NOW, state: "AWAITING_APPROVAL",
    content: inhalt, contentHash: abdruck,
    presentation: {
      topic: auswahl.story.title, hook: pkg.hook, caption: inhalt.caption,
      captionBase: pkg.caption,
      hashtags: auswahl.hashtags, hashtagDetail: auswahl.hashtagDetail,
      hashtagVerworfen: auswahl.hashtagVerworfen, hashtagSatz: auswahl.hashtagSatz,
      visualType: "GENERATIVE", mediaFormat: "IMAGE",
      plannedHourUtc: new Date(NOW).getUTCHours(),
      timingSource: "MANUAL_NOW", timingReason: "Direct Creative Editor — sofort.",
      mode: "DIRECT", modeReason: "Web-First Content Research (Owner-Direktive 23.09.).",
      strategyVersion: "web-research-1.0",
      reason: "Staerkste aktuelle Web-Story (" + auswahl.storyScore.toFixed(1) + "/10): " +
        auswahl.storyErklaerung,
      opportunityScore: Math.round(auswahl.storyScore * 10),
      alternatives: [],
      expectedPrimaryMetric: { metric: "reach", baseline: null, expectation: null,
        note: "Erster Web-First-Beitrag dieser Kohorte — keine Vergleichsbasis." },
      authoring: { briefId: null, authorId: "chatgpt-work", editorialCorrection: null,
        textAuthor: "chatgpt-work", reason: "web-research.js waehlt den Hook " +
          "deterministisch aus echtem Quelltext (Grounding), liefert ihn aber nur als " +
          "englisches Belegmaterial (grounding_hook_en). Die deutsche Uebersetzung/" +
          "Adaption von Hook und Caption liefert der Creative Agent, grounded an " +
          "denselben Belegen (Owner-Direktive WEB-FIRST + FULL-POST-GENERATION, " +
          "24.09., §5.1)." },
      visualOrigin: "generative", visualQuality: visuelleGuete({ origin: "generative" })
    },
    provenance: {
      signalIds: [], opportunityId: null, strategyVersion: "web-research-1.0",
      visualDirection: null, visualDirectionReady: true, visualDirectionFailureType: null,
      audienceFrame: null, learningDimensions: null,
      archetype: "WEB_STORY", hook: pkg.hook, mediaFormat: "IMAGE", visualType: "GENERATIVE",
      visual: { origin: "generative", variantId: bild.visual_variant_id || null,
        strategy: bild.visual_strategy || null, assetPath: bild.asset_path,
        assetSha256: bild.asset_sha256, mimeType: bild.mime_type },
      caption: inhalt.caption, plannedHourUtc: new Date(NOW).getUTCHours(),
      experimentId: null, decidedMode: "DIRECT", approval: null, mediaId: null,
      measurements: [], learning: null,
      webStory: { title: auswahl.story.title, link: auswahl.story.link,
        source: auswahl.story.source, publishedAt: auswahl.story.publishedAt }
    },
    cadence: frequenzbefund([], CadenceConfig, NOW, "MANUAL_NOW")
  };

  const gate = CreativeGate.pruefe(kandidat, {
    rendered: true, atlasBefund: gerendert.atlas, logoBefund: gerendert.logo,
    assetExists: existsSync(ziel)
  });
  console.log("\n--- HARD FINAL CREATIVE GATE ---");
  console.log(gate.erklaerung);
  if (!gate.ok) {
    console.error("\nGATE_FAILED: " + gate.verstoesse.map((v) => v.id).join(", "));
    console.error("Kein Kandidat wird geschrieben (§16 — kein schlechter Fallback).");
    process.exit(4);
  }

  console.log("\n--- KANDIDAT " + candidateId + " ---");
  console.log("Topic:   " + kandidat.presentation.topic);
  console.log("Hook:    " + kandidat.presentation.hook);
  console.log("Bild:    " + imageUrl);

  if (!WRITE) {
    console.log("\n(Kein --write: es wurde nichts geschrieben.)");
    process.exit(0);
  }

  mkdirSync(verzeichnis, { recursive: true });
  writeFileSync(join(verzeichnis, candidateId + ".json"), JSON.stringify(kandidat, null, 2) + "\n");
  console.log("\nGeschrieben: " + join(kandidatenDir(DATA_DIR), candidateId + ".json"));
}
