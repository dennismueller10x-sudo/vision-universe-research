#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/make-carousel-candidates.mjs

   EIN CAROUSEL = EIN CANDIDATE (Owner-Auftrag "WORK OWNS THE POST",
   29.09., §22/§41-§44)

   Fuer jeden VERIFIED Carousel-Job ohne Kandidaten entsteht genau ein
   Kandidat im Approval Center - unabhaengig davon, wie viele schon
   warten. Nichts wird abgeloest, nichts verdraengt: die Inbox zeigt
   alle offenen Beitraege, bis der Owner jeden einzeln entscheidet.

   Das Design gehoert Work. Diese Stufe prueft nur, was ein Rechner
   pruefen kann (Vertrag, Dateien, Bytes, Hash, Slide-Anzahl, Logo/Atlas-
   Ankuendigung, oeffentliche Sprache) und transportiert die Slides
   unveraendert.

   EINE ENTSCHEIDUNG IST ENDGUELTIG: existiert zu einer content_id bereits
   ein Kandidat - egal in welchem Zustand, auch REJECTED -, entsteht nie
   ein zweiter. Realer Befund davor: derselbe Inhalt bekam am naechsten
   Tag eine neue Kandidaten-ID und stand wieder als AWAITING_APPROVAL da.

   Ausfuehren:
     node scripts/social/make-carousel-candidates.mjs
     node scripts/social/make-carousel-candidates.mjs --write
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { hydrateVerifiedJob } from "./ingest-creative.mjs";
import { kandidatenDir, frequenzbefund, visuelleGuete } from "./make-publish-candidate.mjs";
import { ausgabePfad } from "../quality/out-path.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ContentHash = require(join(ROOT, "social/engines/content-hash.js"));
const StyleRefs = require(join(ROOT, "social/engines/style-references.js"));
const Hash = require(join(ROOT, "quant/engines/hash.js"));
const CreativeGate = require(join(ROOT, "social/engines/creative-gate.js"));
const ChatGptWork = require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js"));
const Contract = require(join(ROOT, "social/engines/creative-contract.js"));
const CadenceConfig = require(join(ROOT, "social/config/cadence.json"));

const ASSET_DIR = "assets/social";
export const CAROUSEL_PREFIX = "vu-post-";
const HINWEIS = "Keine Anlageberatung.";

function siteBase() {
  return "https://" + readFileSync(join(ROOT, "CNAME"), "utf8").trim();
}

export function tagOhneRaute(t) {
  return String(t || "").trim().replace(/^#+/, "").replace(/\s+/g, "");
}

/** Alle content_ids, zu denen es schon einen Kandidaten gibt - jeder Zustand. */
export function vorhandeneInhalte(verzeichnis) {
  const ids = new Set();
  if (!existsSync(verzeichnis)) return ids;
  for (const f of readdirSync(verzeichnis)) {
    if (!f.endsWith(".json") || f.endsWith(".request.json")) continue;
    try {
      const k = JSON.parse(readFileSync(join(verzeichnis, f), "utf8"));
      const id = (k.content && k.content.contentId) || (k.provenance && k.provenance.contentId);
      if (id) ids.add(id);
    } catch { /* unlesbar: zaehlt nicht als vorhanden, aber bricht nichts ab */ }
  }
  return ids;
}

/** Die Carousel-Jobs, die einen Kandidaten brauchen. */
export function offeneCarouselJobs(jobs, vorhanden) {
  const neueste = {};
  (jobs || []).forEach((j) => {
    if (!j || j.state !== "CREATIVE_JOB_VERIFIED") return;
    if (String(j.contentId || "").indexOf(CAROUSEL_PREFIX) !== 0) return;
    if (vorhanden.has(j.contentId)) return;
    neueste[j.contentId] = j;
  });
  return Object.values(neueste);
}

/**
 * Der Kandidat aus einem geprueften Carousel-Ergebnis. Reine Funktion
 * ueber bereits gelesene Daten - kein Dateisystem.
 */
export function baueKandidat(brief, ergebnis, slideUrls, options) {
  const now = options.now;
  /* COVER_FIRST (Ein-Asset-Vertrag): EIN Bild, das Cover. Der Kandidat
     ist dann ein Einzelbild; die geplanten Slides 2..n reisen als Plan
     mit, damit der Owner die Dramaturgie sieht, bewertet wird das Cover. */
  const lieferung = ChatGptWork.carouselLieferung(ergebnis);
  const nurCover = lieferung.modus === ChatGptWork.COVER_FIRST;
  const slides = lieferung.slides;
  const hook = String(((ergebnis.hook_variants || [])[0] || {}).text || "").trim();
  let captionBase = String(ergebnis.caption || "").trim();
  if (!/anlageberatung/i.test(captionBase)) captionBase = (captionBase + " " + HINWEIS).trim();
  const hashtags = (ergebnis.hashtags || []).map(tagOhneRaute).filter(Boolean).slice(0, 5);
  const caption = captionBase + (hashtags.length ? "\n\n" + hashtags.map((t) => "#" + t).join(" ") : "");
  const contentId = brief.content_id;

  /* Ein Bild bleibt ein Einzelbild - byte-gleich zum bisherigen Inhalt. */
  const inhalt = slideUrls.length > 1
    ? { contentId, imageUrl: slideUrls[0], imageUrls: slideUrls, caption }
    : { contentId, imageUrl: slideUrls[0], caption };
  const abdruck = ContentHash.contentHash(inhalt);
  const candidateId = "cand_" + String(now).slice(0, 10).replace(/-/g, "") + "_" +
    Hash.prefixedHash("c", { packageId: contentId, hash: abdruck }).slice(2, 10);
  const story = ergebnis.story || {};
  const plan = (ergebnis.carousel_plan || []);
  const quellen = (ergebnis.sources || []).map((q) => ({
    source: q.source || null, url: q.url, publishedAt: q.published_at || null,
    factsUsed: q.facts_used || [], openedByAgent: q.opened_by_agent === true }));
  const trigger = brief.trigger === "AUTO" ? "AUTO" : "MANUAL_NOW";

  return {
    candidateId, version: 1, supersedes: null, supersedesAll: [],
    createdAt: now, state: "AWAITING_APPROVAL",
    content: inhalt, contentHash: abdruck,
    presentation: {
      topic: story.title_de || hook,
      hook, caption, captionBase, hashtags,
      hashtagSatz: hashtags.length + " Hashtag(s) vom Creative Agent aus der Story.",
      story: { title: story.title_de || null, whatHappened: story.what_happened || null,
        whyInteresting: story.why_interesting || null },
      sources: quellen,
      slides: slides.map((s, i) => ({ index: i + 1, role: s.slide_role || (plan[i] && plan[i].role) || null,
        headline: (plan[i] && plan[i].headline_de) || null, url: slideUrls[i],
        width: s.width, height: s.height })),
      slideCount: slides.length,
      plannedSlideCount: lieferung.geplant,
      deliveryMode: lieferung.modus,
      designMode: ergebnis.design_mode || null,
      visualConcept: ergebnis.visual_concept || null,
      aiClicheCheck: ergebnis.ai_cliche_check || null,
      atlasPresent: slides.some((s) => s.brand_elements && s.brand_elements.includes_atlas === true),
      styleReferences: options.styleReferences || null,
      carouselPlan: plan,
      editorialGate: ergebnis.editorial_gate || null,
      researchMode: (ergebnis.research && ergebnis.research.mode_used) ||
        (brief.research && brief.research.mode) || null,
      webAccess: !!(ergebnis.research && ergebnis.research.web_access === true),
      visualType: "GENERATIVE", mediaFormat: nurCover ? "IMAGE" : "CAROUSEL",
      plannedHourUtc: new Date(now).getUTCHours(),
      timingSource: trigger,
      timingReason: trigger === "AUTO" ? "Automatischer Lauf desselben Work-Prozesses."
        : "JETZT POST ERSTELLEN.",
      mode: "DIRECT", modeReason: "Ein Work-Job besitzt den ganzen Beitrag (Owner-Auftrag 29.09.).",
      strategyVersion: "work-owns-the-post-1.0",
      reason: story.why_interesting || null,
      alternatives: [],
      expectedPrimaryMetric: { metric: "saves", baseline: null, expectation: null,
        note: "Erster Beitrag dieser Kohorte - keine Vergleichsbasis." },
      authoring: { briefId: brief.brief_id, authorId: "chatgpt-work", textAuthor: "chatgpt-work",
        editorialCorrection: null,
        reason: "Recherche, Story, Hook, Caption, Hashtags, Dramaturgie und Slides aus EINEM Work-Job." },
      visualOrigin: "generative", visualQuality: visuelleGuete({ origin: "generative" })
    },
    provenance: {
      contentId, briefId: brief.brief_id, requestType: Contract.FULL_CAROUSEL,
      signalIds: [], opportunityId: null, strategyVersion: "work-owns-the-post-1.0",
      visualDirection: null, visualDirectionReady: true, visualDirectionFailureType: null,
      audienceFrame: null, learningDimensions: {
        slideCount: slides.length, hookType: ChatGptWork.CAROUSEL_HOOK_TYPE,
        researchMode: (brief.research && brief.research.mode) || null },
      archetype: "WORK_STORY", hook, mediaFormat: nurCover ? "IMAGE" : "CAROUSEL", visualType: "GENERATIVE",
      visual: { origin: "generative",
        deliveryMode: lieferung.modus, plannedSlides: lieferung.geplant,
        slides: slides.map((s, i) => ({ index: i + 1, variantId: s.visual_variant_id || null,
          assetPath: s.asset_path, assetSha256: s.asset_sha256, mimeType: s.mime_type })) },
      caption, plannedHourUtc: new Date(now).getUTCHours(),
      experimentId: null, decidedMode: "DIRECT", approval: null, mediaId: null,
      measurements: [], learning: null,
      webStory: quellen[0] ? { title: story.title_de || null, link: quellen[0].url,
        source: quellen[0].source, publishedAt: quellen[0].publishedAt } : null
    },
    cadence: frequenzbefund([], CadenceConfig, now, "MANUAL_NOW")
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");
  const NOW = arg("now", new Date().toISOString());
  const DATA_DIR = arg("data", "social/data");

  console.log("VISION UNIVERSE SOCIAL — Carousel-Kandidaten");
  const registerPfad = join(ROOT, "social/data/creative-jobs.json");
  const register = existsSync(registerPfad) ? JSON.parse(readFileSync(registerPfad, "utf8")) : { jobs: [] };
  const verzeichnis = ausgabePfad(ROOT, kandidatenDir(DATA_DIR));
  const jobs = offeneCarouselJobs(register.jobs, vorhandeneInhalte(verzeichnis));
  if (!jobs.length) {
    console.log("Kein VERIFIED Carousel-Job ohne Kandidaten. Nichts zu tun.");
    process.exit(0);
  }

  let geschrieben = 0;
  for (const job of jobs) {
    const cid = job.contentId;
    console.log("\n--- " + cid + " ---");
    const dir = join(ROOT, ChatGptWork.requestDir(cid));
    if (!existsSync(join(dir, "authoring-result.json")) || !existsSync(join(dir, "authoring-brief.json"))) {
      const h = hydrateVerifiedJob(cid, job);
      if (!h.ok) { console.error("VERIFIED_RESULT_UNAVAILABLE: " + h.explanation); continue; }
    }
    const brief = JSON.parse(readFileSync(join(dir, "authoring-brief.json"), "utf8"));
    const ergebnis = JSON.parse(readFileSync(join(dir, "authoring-result.json"), "utf8"));
    if (!Contract.istCarousel(brief)) {
      console.log("Kein Carousel-Auftrag - uebersprungen.");
      continue;
    }
    const sha = ChatGptWork.blobSha(readFileSync(join(dir, "authoring-brief.json")));
    const geprueft = ChatGptWork.verifyResult(ergebnis, { briefId: brief.brief_id, contentId: cid,
      briefBlobSha: sha, hookType: brief.hook_strategy && brief.hook_strategy.hook_type,
      requestType: Contract.FULL_CAROUSEL });
    const assets = ChatGptWork.verifyAssets(ergebnis, (p) => {
      const abs = join(ROOT, String(p));
      return existsSync(abs) ? readFileSync(abs) : null;
    });
    if (!geprueft.ok || !assets.ok) {
      console.error("RESULT_REJECTED: " + [geprueft.ok ? null : geprueft.explanation,
        assets.ok ? null : assets.explanation].filter(Boolean).join(" | "));
      continue;
    }

    /* Die Dateien reisen unveraendert - keine Neugestaltung, kein Schnitt. */
    const slides = ChatGptWork.carouselLieferung(ergebnis).slides;
    const zielDir = ausgabePfad(ROOT, ASSET_DIR);
    let dateien;
    try {
      dateien = slides.map((s, i) => {
        const endung = /jpe?g/i.test(s.mime_type || "") ? "jpg" : "png";
        return { bytes: readFileSync(join(ROOT, s.asset_path)),
          name: cid + (slides.length > 1 ? "-s" + (i + 1) : "-cover") + "." + endung };
      });
    } catch (err) {
      console.error("SLIDES_UNAVAILABLE: " + String(err && err.message || err).slice(0, 200));
      continue;
    }
    const urls = dateien.map((d) => siteBase() + "/" + ASSET_DIR + "/" + d.name);
    /* REFERENCE_IMAGES_SEEN_BY_WORK: gemessen an Text, der nur im Bild steht. */
    const manifestPfad = join(ROOT, StyleRefs.MANIFEST);
    const sicht = existsSync(manifestPfad)
      ? StyleRefs.sichtung(ergebnis.style_references_check, JSON.parse(readFileSync(manifestPfad, "utf8")))
      : null;
    const referenzBefund = {
      deliveredInCheckout: !!(brief.style_references && brief.style_references.delivered_in_checkout),
      seenByWork: sicht ? sicht.measured && sicht.seen === sicht.total : false,
      seen: sicht ? sicht.seen : 0, total: sicht ? sicht.total : 0,
      satz: sicht ? sicht.satz : "Kein Manifest - nicht messbar."
    };
    console.log("REFERENCE_IMAGES_DELIVERED_TO_WORK = " + referenzBefund.deliveredInCheckout);
    console.log("REFERENCE_IMAGES_SEEN_BY_WORK = " + referenzBefund.seenByWork + " (" + referenzBefund.satz + ")");
    const kandidat = baueKandidat(brief, ergebnis, urls, { now: NOW, styleReferences: referenzBefund });

    const alleSlidesDa = dateien.every((d) => d.bytes && d.bytes.length > 0);
    const gate = CreativeGate.pruefe(kandidat, {
      rendered: true,
      atlasVerboten: true,
      atlasBefund: { passed: slides.some((s) => s.brand_elements && s.brand_elements.includes_atlas === true),
        quelle: "agent_announced" },
      logoBefund: { passed: slides.every((s) => s.brand_elements && s.brand_elements.includes_logo === true),
        quelle: "agent_announced" },
      assetExists: alleSlidesDa
    });
    console.log("Hook:   " + kandidat.presentation.hook);
    console.log("Slides: " + slides.length);
    console.log("Gate:   " + gate.erklaerung);
    if (!gate.ok) {
      console.error("GATE_FAILED: " + gate.verstoesse.map((v) => v.id).join(", ") +
        " - kein Kandidat (kein schlechter Fallback).");
      continue;
    }
    if (!WRITE) { console.log("(Kein --write.)"); continue; }

    mkdirSync(zielDir, { recursive: true });
    dateien.forEach((d) => writeFileSync(join(zielDir, d.name), d.bytes));
    mkdirSync(verzeichnis, { recursive: true });
    writeFileSync(join(verzeichnis, kandidat.candidateId + ".json"), JSON.stringify(kandidat, null, 2) + "\n");
    console.log("Kandidat: " + kandidat.candidateId + " (AWAITING_APPROVAL)");
    geschrieben += 1;
  }
  console.log("\n" + geschrieben + " neue(r) Carousel-Kandidat(en).");
}
