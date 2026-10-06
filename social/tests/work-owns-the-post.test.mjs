/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/work-owns-the-post.test.mjs

   Owner-Auftrag "WORK OWNS THE POST" (29.09.): ONE STORY = ONE CHATGPT
   WORK JOB = ONE COMPLETE CAROUSEL. Diese Tests pruefen die Grenzen, die
   ein Rechner pruefen kann - das kreative Urteil bleibt bei Work und dem
   Owner.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { baueBrief, neueContentId, NEGATIVE_REFERENZEN } from "../../scripts/social/request-carousel.mjs";
import { baueKandidat, offeneCarouselJobs, tagOhneRaute } from "../../scripts/social/make-carousel-candidates.mjs";
import { zweigFuer } from "../../scripts/social/ingest-open-creative-jobs.mjs";
import { offeneWorkJobs } from "../../scripts/social/run-post-job.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Research = require("../engines/research-package.js");
const Contract = require("../engines/creative-contract.js");
const Work = require("../providers/authoring/chatgpt-work/adapter.js");
const ContentHash = require("../engines/content-hash.js");
const Gate = require("../engines/creative-gate.js");
const Queue = require("../engines/post-queue.js");
const Learnings = require("../engines/social-learnings.js");
const Projection = require("../engines/approval-projection.js");
const Hashtags = require("../engines/hashtags.js");

const NOW = "2026-09-29T15:00:00.000Z";

function paket() {
  return { stories: [{ id: "s1", title: "Chipkonzern verdoppelt Gewinn", source: "Test",
    url: "https://example.com/a", published_at: NOW, description: "Der Gewinn stieg auf 2 Mrd.",
    article_excerpt: "Lang genug.", extracted_numbers: [] }], already_covered_urls: [] };
}

function brief(extra) {
  return baueBrief(Object.assign({ contentId: "vu-post-20260929-aaaaaaaaaa", now: NOW,
    trigger: "MANUAL", researchMode: "WORK_WEB_RESEARCH", researchPackage: paket(),
    socialLearnings: [] }, extra || {}));
}

function slide(i, extra) {
  return Object.assign({ visual_variant_id: "v" + i, visual_strategy: "CAROUSEL", slide_index: i,
    slide_role: i === 1 ? "cover" : "story", asset_path: "authoring/requests/x/assets/slide-0" + i + ".png",
    mime_type: "image/png", width: 1080, height: 1350, asset_byte_size: 10, asset_sha256: "a".repeat(64),
    brand_elements: { includes_logo: true, includes_atlas: false, includes_hook_text_de: i === 1,
      includes_text_de: true } }, extra || {});
}

/* Die Lieferform des aktiven Agentenvertrags: EIN Bild, das Cover,
   dazu der vollstaendige Plan aller Slides (COVER_FIRST). */
function plan(i, extra) {
  return Object.assign({ slide_index: i, role: ["HOOK / COVER", "KEY INSIGHT", "EINORDNUNG"][i - 1],
    headline_de: "Aussage " + i, key_content: "Inhalt " + i, visual_concept: "Motiv " + i,
    supporting_line_de: "Kurz " + i }, extra || {});
}

function cover(extra) {
  return Object.assign(slide(1, { asset_path: "authoring/requests/x/assets/visual-01.png",
    width: 1092, height: 1440 }), extra || {});
}

function ergebnis(extra) {
  return Object.assign({
    request_type: "FULL_CREATIVE", creative_format: "CAROUSEL",
    story: { title_de: "Der Chip-Gewinn", what_happened: "x", why_interesting: "Weil es Anleger betrifft." },
    sources: [{ source: "Test", url: "https://example.com/a", published_at: NOW, facts_used: ["2 Mrd."],
      opened_by_agent: true }],
    hook_variants: [{ hook_variant_id: "h", hook_type: Work.CAROUSEL_HOOK_TYPE, text: "Doppelter Gewinn, halber Jubel" }],
    caption: "Der Konzern verdoppelt seinen Gewinn. Keine Anlageberatung.",
    hashtags: ["#Halbleiter", "Boerse"], carousel_plan: [plan(1), plan(2), plan(3)], slide_count: 3,
    editorial_gate: { story_quality: "PASS", hook_standalone_quality: "PASS",
      caption_standalone_quality: "PASS", fact_grounding: "PASS" },
    visual_variants: [cover()],
    style_references_check: [],
    carousel_checks: { no_atlas: true, logo_on_all_slides: true, logo_position_consistent: true },
    design_mode: "PREMIUM_CAMPAIGN_EDITORIAL",
    visual_concept: "Reale Szene aus der Storywelt.",
    ai_cliche_check: { result: "PASS", checked: [], redesigned: false },
    research: { web_access: true, mode_used: "WORK_WEB_RESEARCH" }
  }, extra || {});
}

/* ------------------------------------------------ duenne Recherche-Schicht */

test("WOP1 · Artikeltext: Absaetze ja, Skripte/Navigation/Rauschen nein", () => {
  const html = "<nav><p>Home Markets Subscribe to our newsletter today please</p></nav>" +
    "<script>var x='<p>nicht das</p>'</script>" +
    "<p>Der Konzern meldete fuer das dritte Quartal einen Gewinn von zwei Milliarden Dollar.</p>" +
    "<p>Kurz.</p><p>Analysten hatten mit deutlich weniger gerechnet &amp; reagierten ueberrascht.</p>";
  const t = Research.artikelText(html);
  assert.match(t, /zwei Milliarden/);
  assert.match(t, /Analysten hatten mit deutlich weniger gerechnet & reagierten/);
  assert.doesNotMatch(t, /nicht das|newsletter|Kurz\./);
});

test("WOP2 · Die Recherche-Schicht waehlt keine Story: sie liefert eine Liste ohne Hook/Motiv", () => {
  const jetzt = Date.parse(NOW);
  const items = [
    { title: "Chipkonzern verdoppelt Gewinn auf 2 Mrd. Dollar", link: "https://a.example/1",
      description: "Rekord.", pubDate: new Date(jetzt - 3600e3).toUTCString(), source: "A" },
    { title: "Chipkonzern verdoppelt Gewinn auf 2 Mrd Dollar", link: "https://b.example/1",
      description: "Dieselbe Meldung.", pubDate: new Date(jetzt - 7200e3).toUTCString(), source: "B" },
    { title: "Oelpreis steigt um 5 Prozent", link: "https://c.example/1", description: "x",
      pubDate: new Date(jetzt - 3600e3).toUTCString(), source: "C" },
    { title: "Alte Meldung ueber Zinsen", link: "https://d.example/1", description: "x",
      pubDate: new Date(jetzt - 200 * 3600e3).toUTCString(), source: "D" }
  ];
  const liste = Research.kandidaten(items, { now: NOW, bereitsBehandelt: ["https://c.example/1"] });
  assert.equal(liste.length, 1, "Duplikat, bereits Behandeltes und Altes fallen weg");
  assert.equal(liste[0].id, "s1");
  for (const s of liste) {
    assert.equal(s.hook, undefined);
    assert.equal(s.motiv, undefined);
  }
});

/* ------------------------------------------------------------ der Brief */

test("WOP3 · Der Carousel-Brief reist als FULL_CREATIVE/CAROUSEL (einzig vom Agenten angenommener Typ)", () => {
  const b = brief();
  assert.equal(b.request_type, "FULL_CREATIVE");
  assert.equal(b.creative_format, "CAROUSEL");
  assert.equal(Contract.istCarousel(b), true);
  const v = Contract.validateRequest(b);
  assert.equal(v.ok, true, v.explanation);
  assert.equal(v.requestType, Contract.FULL_CAROUSEL);
  /* Der Agent weist jeden anderen request_type ab (PR #299) - also auch wir. */
  assert.equal(Contract.validateRequest({ request_type: "FULL_CAROUSEL" }).reason, "unknownRequestType");
});

test("WOP4 · Premium Campaign Editorial: Kampagnenfotografie statt KI-Bild, Rahmen statt Schablone", () => {
  const b = brief();
  const text = JSON.stringify(b);
  const a = b.art_direction;
  /* Pflichtfeld des Agentenvertrags (PR #300): die Designsprache, kein Stilrezept. */
  assert.equal(b.visual_strategy.strategy_id, "PREMIUM_CAMPAIGN_EDITORIAL");
  assert.equal(a.design_mode, "PREMIUM_CAMPAIGN_EDITORIAL");
  for (const k of ["palette", "style", "composition"]) {
    assert.equal(b.visual_strategy[k], undefined, "visual_strategy." + k + " waere ein Stilrezept");
  }
  assert.match(a.principle, /Kampagnenfotografie/);
  assert.match(a.principle, /KI soll moeglichst unsichtbar/);
  for (const verboten of ["humanoide Roboter", "Hologramme", "Neon-Trading-Charts", "Cyberpunk",
    "generische Serverhallen", "schwebende Interfaces"]) {
    assert.ok(a.forbidden_visuals.includes(verboten), "fehlt in forbidden_visuals: " + verboten);
  }
  assert.match(a.subtlety, /Subtilitaet ist ausdruecklich erlaubt/);
  assert.match(a.creative_director, /KEIN starres Template/);
  /* Das KI-Klischee-Gate ist Pflicht vor der Auslieferung. */
  assert.match(b.ai_cliche_gate.question, /offensichtlich KI-generiert/);
  assert.match(b.ai_cliche_gate.on_fail, /neu gestalten/);
  assert.equal(b.authoring_requirements.ai_cliche_check_required, true);
  /* Die Referenzkampagne wird beschrieben, nicht kopiert: keine Marke im Brief. */
  assert.ok(!/xpeng/i.test(text), "Fremdmarke im Brief");
  assert.equal(b.grounding_hook_en, undefined, "keine vorgewaehlte Hook");
  for (const alt of ["#5FE0C0", "one-fifth", "bold flat", "comic-panel", "premium cinematic 3D",
    "carousel_sheet", "panel_width"]) {
    assert.ok(!text.includes(alt), "Brief enthaelt " + alt);
  }
  assert.equal(b.authoring_requirements.hook_variant_count, 1);
  assert.deepEqual(b.hook_strategy.negative_fixtures.slice(0, 2),
    ["BÖRSENGANG MIT EXISTENZWARNUNG", "50.000 DOLLAR FÜR EIN AUTO?"]);
});

test("WOP5 · Kein Atlas, Logo fest oben links auf allen, Hook + EINE Supporting Line, 3 Slides, Cover zuerst", () => {
  const b = brief();
  const c = b.carousel;
  const a = b.art_direction;
  assert.match(a.no_atlas, /Atlas wird NICHT mehr verwendet/);
  assert.match(c.atlas_contract, /KEIN Atlas auf keinem Slide/);
  assert.equal(b.brand_assets.atlas, undefined, "keine Atlas-Datei mehr im Brief");
  assert.ok(b.constraints.some((x) => /Kein Atlas/.test(x)));
  assert.match(a.brand_anchor, /fest OBEN LINKS/);
  assert.match(a.brand_anchor, /keine freie Neuplatzierung/);
  assert.match(c.logo_contract, /fest OBEN LINKS/);
  assert.match(a.hook, /hoechstens etwa 2-3 Zeilen/);
  assert.match(a.hook, /GEMEINSAM/);
  assert.match(a.supporting_copy, /EINE kurze Supporting Line/);
  assert.match(c.slide_count, /Standard: 3 Slides/);
  assert.deepEqual(c.slides.map((x) => x.role),
    ["HERO / HOOK", "DETAIL / KEY INSIGHT", "CONTEXT / INVESTOR RELEVANCE"]);
  assert.match(a.coherence, /nicht dreimal dasselbe Bild/);
  assert.match(c.text_on_image, /BÖRSE\|NGANG/);
  assert.match(b.editorial_gate.rule, /OHNE Bild/);
  /* COVER_FIRST: der aktive Vertrag erlaubt EIN Asset (PR #300), ein Bogen scheitert (PR #303). */
  assert.equal(b.delivery.mode, "COVER_FIRST");
  assert.match(b.delivery.deliver_now, /kein Bogen/);
  const r = b.asset_requirements;
  assert.equal(r.count, 1);
  assert.match(r.deterministic_path, /\/assets\/visual-01\.png$/);
  assert.ok(!/Atlas/.test(r.format_note));
  assert.match(b.caption_guidance, /allein zum Cover/);
  /* MULTI_ASSET bleibt vorbereitet. */
  const m = brief({ delivery: "MULTI_ASSET" });
  assert.equal(m.asset_requirements.deterministic_paths.length, 4);
});

test("WOP6 · Recherchemodus, Owner-Thema, leeres Paket", () => {
  assert.match(brief().objective, /Recherchiere die aktuell relevantesten/);
  assert.match(brief({ researchMode: "PACKAGE_ONLY" }).objective, /Analysiere die aktuellen Storys im Recherchepaket/);
  assert.equal(brief().research.owner_topic, null);
  assert.match(brief({ ownerTopic: "AMD" }).research.owner_topic, /AMD/);
  assert.equal(brief().research.no_material_rule, null);
  assert.match(brief({ researchPackage: { stories: [], already_covered_urls: [] } }).research.no_material_rule,
    /KEIN Bild/);
});

test("WOP7 · Eine neue content_id je Auftrag, im vu-post-Namensraum", () => {
  const a = neueContentId(NOW, "1");
  const b = neueContentId(NOW, "2");
  assert.match(a, /^vu-post-20260929-[0-9a-f]{10}$/);
  assert.notEqual(a, b);
  assert.equal(NEGATIVE_REFERENZEN.length, 2);
});

/* ----------------------------------------------------- Ergebnisvertrag */

test("WOP8 · Ein vollstaendiges Cover-First-Ergebnis besteht die Carousel-Pruefung", () => {
  assert.deepEqual(Work.verifyCarousel(ergebnis()), []);
  const vertrag = Contract.validateResult(ergebnis(), brief());
  assert.equal(vertrag.ok, true, vertrag.explanation);
  assert.equal(Work.carouselLieferung(ergebnis()).modus, "COVER_FIRST");
  assert.equal(Work.carouselLieferung(ergebnis()).geplant, 3);
});

test("WOP9 · Atlas, fehlendes Logo, KI-Klischee, falscher Design-Modus, Tags, Quellen, Gate", () => {
  const ids = (r) => Work.verifyCarousel(r).map((b) => b.id);
  /* Atlas ist jetzt auf JEDEM Slide ein Befund - auch auf dem Cover. */
  assert.ok(ids(ergebnis({ visual_variants: [cover({ brand_elements: { includes_logo: true,
    includes_atlas: true, includes_hook_text_de: true } })] })).includes("atlasPresent"));
  assert.ok(ids(ergebnis({ carousel_plan: [plan(1, { atlas: true }), plan(2), plan(3)] }))
    .includes("atlasPresent"));
  assert.ok(ids(ergebnis({ visual_variants: [cover({ brand_elements: { includes_logo: false,
    includes_atlas: false, includes_hook_text_de: true } })] })).includes("logoMissing"));
  assert.ok(ids(ergebnis({ ai_cliche_check: { result: "FAIL" } })).includes("aiClicheCheck"));
  assert.ok(ids(ergebnis({ ai_cliche_check: undefined })).includes("aiClicheCheck"));
  assert.ok(ids(ergebnis({ design_mode: "VU_EDITORIAL_PREMIUM" })).includes("designMode"));
  assert.ok(ids(ergebnis({ carousel_checks: { atlas_only_on_slide_1: true, logo_on_all_slides: true,
    logo_position_consistent: true } })).includes("carouselCheck:no_atlas"));
  assert.ok(ids(ergebnis({ carousel_plan: [plan(1), plan(2, { visual_concept: "" }), plan(3)] }))
    .includes("planIncomplete"));
  assert.ok(ids(ergebnis({ hashtags: ["a", "b", "c", "d", "e", "f"] })).includes("hashtags"));
  assert.ok(ids(ergebnis({ sources: [] })).includes("sources"));
  assert.ok(ids(ergebnis({ editorial_gate: { story_quality: "PASS", hook_standalone_quality: "FAIL",
    caption_standalone_quality: "PASS", fact_grounding: "PASS" } })).includes("editorialGate:hook_standalone_quality"));
  assert.ok(ids(ergebnis({ carousel_plan: [plan(1), plan(2)], slide_count: 2 })).includes("slideCount"));
  /* MULTI_ASSET: eine Datei je Slide bleibt gueltig; Atlas auf irgendeinem Slide nicht. */
  assert.deepEqual(Work.verifyCarousel(ergebnis({ visual_variants: [slide(1), slide(2), slide(3)] })), []);
  assert.ok(ids(ergebnis({ visual_variants: [slide(1), slide(2, { brand_elements: { includes_logo: true,
    includes_atlas: true } }), slide(3)] })).includes("atlasPresent"));
});

/* ------------------------------------------------------------ Kandidat */

test("WOP10 · Cover-First = EIN Kandidat als Einzelbild, Plan reist mit, nichts wird abgeloest", () => {
  const url = "https://research.visionuniverse.de/assets/social/c-cover.png";
  const k = baueKandidat(brief(), ergebnis(), [url], { now: NOW });
  assert.equal(k.state, "AWAITING_APPROVAL");
  assert.equal(k.supersedes, null);
  assert.deepEqual(k.supersedesAll, []);
  assert.equal(k.content.imageUrl, url);
  assert.equal(k.content.imageUrls, undefined, "ein Bild bleibt ein Einzelbild");
  assert.equal(k.presentation.mediaFormat, "IMAGE");
  assert.equal(k.presentation.deliveryMode, "COVER_FIRST");
  assert.equal(k.presentation.slideCount, 1);
  assert.equal(k.presentation.plannedSlideCount, 3);
  assert.equal(k.presentation.carouselPlan.length, 3);
  assert.deepEqual(k.presentation.hashtags, ["Halbleiter", "Boerse"]);
  assert.equal(k.content.caption, Hashtags.finalerText(k.presentation.captionBase, k.presentation.hashtags),
    "Vorschau = Sendung: Caption + Tags lassen sich zurueckrechnen");
  assert.equal(k.contentHash, ContentHash.contentHash(k.content));
  assert.equal(k.presentation.sources[0].url, "https://example.com/a");
  /* Carousel-Pfad: Atlas verboten - fehlender Atlas besteht, gemeldeter faellt durch. */
  const gate = Gate.pruefe(k, { rendered: true, atlasVerboten: true, atlasBefund: { passed: false },
    logoBefund: { passed: true }, assetExists: true });
  assert.equal(gate.ok, true, gate.erklaerung);
  const mitAtlas = Gate.pruefe(k, { rendered: true, atlasVerboten: true, atlasBefund: { passed: true },
    logoBefund: { passed: true }, assetExists: true });
  assert.ok(mitAtlas.verstoesse.some((v) => v.id === "ATLAS_ABSENT"));
  assert.equal(k.presentation.designMode, "PREMIUM_CAMPAIGN_EDITORIAL");
  assert.equal(k.presentation.aiClicheCheck.result, "PASS");
  assert.equal(k.presentation.atlasPresent, false);

  /* MULTI_ASSET: drei Dateien = EIN Carousel-Kandidat. */
  const urls = [1, 2, 3].map((n) => "https://research.visionuniverse.de/assets/social/c-s" + n + ".png");
  const m = baueKandidat(brief(), ergebnis({ visual_variants: [slide(1), slide(2), slide(3)] }), urls, { now: NOW });
  assert.deepEqual(m.content.imageUrls, urls);
  assert.equal(m.presentation.mediaFormat, "CAROUSEL");
  assert.equal(m.presentation.slideCount, 3);
});

test("WOP11 · Eine Entscheidung ist endgueltig: zu einer content_id entsteht nie ein zweiter Kandidat", () => {
  const jobs = [
    { contentId: "vu-post-1", state: "CREATIVE_JOB_VERIFIED" },
    { contentId: "vu-post-2", state: "CREATIVE_JOB_VERIFIED" },
    { contentId: "vu-post-3", state: "CREATIVE_JOB_DISPATCHED" },
    { contentId: "vu-web-alt", state: "CREATIVE_JOB_VERIFIED" }
  ];
  const offen = offeneCarouselJobs(jobs, new Set(["vu-post-1"]));
  assert.deepEqual(offen.map((j) => j.contentId), ["vu-post-2"]);
  assert.equal(tagOhneRaute("##Boerse "), "Boerse");
});

test("WOP12 · Die Negativbeispiele des Owners fallen am Final Gate durch", () => {
  for (const h of ["Börsengang mit Existenzwarnung", "BÖRSENGANG MIT EXISTENZWARNUNG",
    "50.000 Dollar für ein Auto?", "10-year U.S. Treasury yield tops 5.1%"]) {
    assert.equal(Gate.istNegativeHookFixture(h), true, h);
  }
  assert.equal(Gate.istNegativeHookFixture("Doppelter Gewinn, halber Jubel"), false);
});

/* ------------------------------------------------ Abdruck und Projektion */

test("WOP13 · Abdruck: Einzelbild unveraendert, Carousel deckt alle Slides ab", () => {
  const alt = JSON.stringify({ contentId: "c", imageUrl: "https://x/1.png", caption: "t" });
  assert.equal(ContentHash.canonical({ contentId: "c", imageUrl: "https://x/1.png", caption: "t" }), alt);
  assert.equal(ContentHash.canonical({ contentId: "c", imageUrl: "https://x/1.png",
    imageUrls: ["https://x/1.png"], caption: "t" }), alt);
  assert.notEqual(ContentHash.contentHash({ contentId: "c", imageUrl: "https://x/1.png",
    imageUrls: ["https://x/1.png", "https://x/2.png"], caption: "t" }),
    ContentHash.contentHash({ contentId: "c", imageUrl: "https://x/1.png", caption: "t" }));
});

test("WOP14 · Worker und Repository rechnen denselben Carousel-Abdruck", async () => {
  const { contentHash } = await import("../../workers/vision-universe-social/src/redact.js");
  const spec = { contentId: "c", imageUrl: "https://x/1.png", imageUrls: ["https://x/1.png",
    "https://x/2.png", "https://x/3.png"], caption: "Text\n\n#A" };
  assert.equal(await contentHash(spec), ContentHash.contentHash(spec));
});

test("WOP15 · Projektion: Carousel traegt imageUrls und Slides, Einzelbild bleibt wie bisher", () => {
  const urls = [1, 2, 3].map((n) => "https://research.visionuniverse.de/assets/social/c-s" + n + ".png");
  const k = baueKandidat(brief(), ergebnis(), urls, { now: NOW });
  const e = Projection.eintrag(k);
  assert.deepEqual(e.payload.imageUrls, urls);
  assert.equal(e.carousel.slideCount, 3);
  assert.equal(e.carousel.sources[0].url, "https://example.com/a");
  const einzel = Projection.eintrag({ candidateId: "c1", content: { contentId: "x", imageUrl: urls[0],
    caption: "t" }, contentHash: "b".repeat(64) });
  assert.deepEqual(Object.keys(einzel.payload), ["contentId", "imageUrl", "caption"]);
  assert.equal(einzel.carousel, null);
});

/* ---------------------------------------------------- Post-Schlange */

test("WOP16 · Jeder Knopfdruck ist ein Auftrag; laeuft ein Work-Job, wartet er - verworfen wird nichts", () => {
  let q = Queue.leer();
  q = Queue.anmelden(q, { requestedAt: NOW, trigger: "MANUAL", runId: "1" }).queue;
  const doppelt = Queue.anmelden(q, { requestedAt: NOW, trigger: "MANUAL", runId: "1" });
  assert.equal(doppelt.neu, false, "derselbe Lauf legt keinen zweiten Auftrag an");
  q = Queue.anmelden(q, { requestedAt: "2026-09-29T15:01:00Z", trigger: "MANUAL", runId: "2" }).queue;
  assert.equal(Queue.wartende(q).length, 2);

  assert.equal(Queue.naechsterSchritt(q, 1).handlung, "WARTEN");
  const s = Queue.naechsterSchritt(q, 0);
  assert.equal(s.handlung, "DISPATCH");
  assert.equal(s.entry.runId, "1", "der aelteste zuerst");
  assert.equal(Queue.autoErlaubt(q, 0), false, "AUTO drängelt sich nicht vor wartende Auftraege");
  assert.equal(Queue.autoErlaubt(Queue.leer(), 0), true);
  assert.equal(Queue.autoErlaubt(Queue.leer(), 1), false);
});

test("WOP17 · Ein Auftrag scheitert hoechstens dreimal, dann FAILED", () => {
  let q = Queue.anmelden(Queue.leer(), { requestedAt: NOW, trigger: "MANUAL", runId: "9" }).queue;
  const id = q.entries[0].id;
  q = Queue.fehlschlag(q, id, "a"); q = Queue.fehlschlag(q, id, "b");
  assert.equal(q.entries[0].state, "QUEUED");
  q = Queue.fehlschlag(q, id, "c");
  assert.equal(q.entries[0].state, "FAILED");
});

test("WOP18 · Offene Work-Jobs zaehlen, offene Candidates nicht", () => {
  assert.equal(offeneWorkJobs({ jobs: [{ state: "CREATIVE_JOB_DISPATCHED" },
    { state: "CREATIVE_JOB_VERIFIED" }, { state: "CREATIVE_JOB_FAILED" }] }), 1);
});

/* ---------------------------------------------------- Social Intelligence */

test("WOP19 · Social-Learnings sind Beschreibung mit Stichprobe, nie eine Anweisung", () => {
  assert.deepEqual(Learnings.ableiten({ snapshots: [] }), []);
  const snap = (typ, reach) => ({ mediaType: typ, snapshot: { state: "VERIFIED",
    metrics: { reach, likes: 1, saves: 0, shares: 0 } } });
  const l = Learnings.ableiten({ snapshots: [snap("IMAGE", 10), snap("IMAGE", 20), snap("IMAGE", 30),
    snap("VIDEO", 5)] });
  assert.ok(l.some((x) => /n=3/.test(x.statement)), "Gruppe mit Stichprobe");
  assert.ok(!l.some((x) => /Reels/.test(x.statement)), "Gruppe unter MIN_N bekommt keinen Satz");
  assert.ok(!l.some((x) => /(muss|verwende|zwingend)/i.test(x.statement)));
});

/* ---------------------------------------------------------- Transport */

test("WOP20 · Anlauf-Suffix: der Einholer findet auch Anlauf-2-Branches", () => {
  assert.equal(zweigFuer({ contentId: "vu-x", attempt: 1 }), "authoring/request/vu-x");
  assert.equal(zweigFuer({ contentId: "vu-x", attempt: 2 }), "authoring/request/vu-x-attempt2");
});

test("WOP21 · Orchestrator: Owner-Sync und Knopfdruck vor den Tests, Festschreiben immer, Lieferung loest EINHOLEN aus", () => {
  const yml = readFileSync(join(ROOT, ".github/workflows/social-orchestrator.yml"), "utf8");
  const pos = (s) => yml.indexOf(s);
  assert.ok(pos("name: Die Entscheidungen des Owners abholen") < pos("name: Tests und Isolation"));
  assert.ok(pos("name: JETZT POST ERSTELLEN - Auftrag festhalten") < pos("name: Tests und Isolation"));
  assert.match(yml, /name: Festschreiben\n\s+if: always\(\) && inputs\.nur_entscheiden != true/);
  for (const s of ["run-post-job.mjs --write", "make-carousel-candidates.mjs", "--auto-if-idle"]) {
    assert.ok(yml.includes(s), "fehlt: " + s);
  }
  assert.ok(!/node scripts\/social\/request-creative-web\.mjs/.test(yml), "alter Web-Pfad entfernt");
  const lieferung = join(ROOT, ".github/workflows/social-work-delivery.yml");
  assert.ok(existsSync(lieferung));
  const l = readFileSync(lieferung, "utf8");
  assert.match(l, /authoring\/request\/\*\*/);
  assert.match(l, /modus=EINHOLEN/);
});

test("WOP22 · Die Owner-Referenzbilder erreichen Work als Dateien - und sind keine Faktenquelle", () => {
  const StyleRefs = require("../engines/style-references.js");
  const manifest = JSON.parse(readFileSync(join(ROOT, StyleRefs.MANIFEST), "utf8"));
  assert.equal(manifest.files.length, 4);
  const befund = StyleRefs.lieferbefund(manifest, (p) => readFileSync(join(ROOT, p)));
  assert.equal(befund.delivered, true, befund.satz);

  const b = brief({ styleReferences: { manifest, befund } });
  assert.equal(b.style_references.files.length, 4);
  assert.equal(b.style_references.delivered_in_checkout, true);
  assert.match(b.style_references.not_facts, /KEINE Faktenquelle und KEIN Themenvorschlag/);
  assert.match(b.style_references.check_required, /dominant_text/);
  assert.equal(b.authoring_requirements.style_references_check_required, true);
  assert.ok(b.constraints.includes("Keine Fakten aus den Referenzbildern."));

  /* Kein Markerwort steht im Klartext im Brief - Work kann es nur im Bild finden. */
  const marker = new Set(manifest.files.flatMap((f) => f.marker_sha256));
  const imBrief = StyleRefs.woerter(JSON.stringify(b)).map((w) => StyleRefs.sha256("vu-style-ref:" + w));
  assert.ok(!imBrief.some((h) => marker.has(h)), "ein Markerwort steht im Brief");
});

test("WOP23 · Sichtung wird gemessen: passender Bildtext ja, erfundener oder fehlender nein", () => {
  const StyleRefs = require("../engines/style-references.js");
  const manifest = { files: [
    { path: "x/ref-a.png", marker_sha256: [StyleRefs.markerHash("Leuchtturm")] },
    { path: "x/ref-b.png", marker_sha256: [StyleRefs.markerHash("Wolkenkratzer")] }] };
  const gut = StyleRefs.sichtung([{ path: "ref-a.png", dominant_text: "Der LEUCHTTURM steht" },
    { path: "ref-b.png", dominant_text: "wolkenkratzer." }], manifest);
  assert.equal(gut.seen, 2);
  const halb = StyleRefs.sichtung([{ path: "ref-a.png", dominant_text: "Leuchtturm" },
    { path: "ref-b.png", dominant_text: "Ein schoenes Bild" }], manifest);
  assert.equal(halb.seen, 1);
  const nichts = StyleRefs.sichtung(undefined, manifest);
  assert.equal(nichts.measured, false);
  /* Eine veraenderte Datei gilt nicht als geliefert. */
  const lief = StyleRefs.lieferbefund({ files: [{ path: "a", sha256: StyleRefs.sha256("original") }] },
    () => Buffer.from("veraendert"));
  assert.equal(lief.delivered, false);
});

test("WOP24 · Meldet der Agent den Abbruch, schliesst der Abgleich den Job - ein Neustart danach nicht", async () => {
  const { letzteAgentMeldung } = await import("../../scripts/social/sync-creative-invocations.mjs");
  const Job = require("../engines/creative-job.js");
  const KEY = "brief_x:vu-post-1:abc:1.0";
  const meldung = (art, status, at, key) => ({ created_at: at,
    body: "VU_CREATIVE_AGENT_" + art + "\nprocessing_key: " + (key || KEY) + "\nstatus: " + status });
  const abbruch = [meldung("INVOCATION", "STARTED", "2026-09-29T21:08:42Z"),
    meldung("FAILURE", "ASSET_CONTRACT_MISMATCH", "2026-09-29T21:13:52Z"),
    meldung("INVOCATION", "STARTED", "2026-09-29T22:00:00Z", "brief_y:anderer:def:1.0")];
  assert.equal(letzteAgentMeldung(abbruch, KEY).art, "FAILURE");
  assert.equal(letzteAgentMeldung(abbruch, KEY).status, "ASSET_CONTRACT_MISMATCH");
  const neustart = abbruch.concat([meldung("INVOCATION", "STARTED", "2026-09-29T21:20:00Z")]);
  assert.equal(letzteAgentMeldung(neustart, KEY).art, "INVOCATION", "ein spaeterer Start hebt den Abbruch auf");
  assert.equal(letzteAgentMeldung(abbruch, "unbekannt"), null);

  assert.equal(Job.EVIDENZ.AGENT_ABBRUCH_GEMELDET, "CREATIVE_JOB_FAILED");
  const reg = Job.createRegistry([{ creativeJobId: "job_1", contentId: "vu-post-1", processingKey: KEY,
    state: "CREATIVE_JOB_DISPATCHED", prNumber: 303, history: [],
    createdAt: "2026-09-29T21:07:05Z", updatedAt: "2026-09-29T21:07:05Z" }]);
  const r = reg.reconcile("job_1", "AGENT_ABBRUCH_GEMELDET",
    { now: "2026-09-30T06:00:00Z", agentStatus: "ASSET_CONTRACT_MISMATCH" });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.to, "CREATIVE_JOB_FAILED");
  assert.equal(reg.all()[0].failureType, "AGENT_REPORTED_ASSET_CONTRACT_MISMATCH");
});

test("WOP25 · Owner 03.10.: aggressive Hook, Text auf jedem Slide, drei Bilder in EINEM Auftrag", () => {
  const b = brief({ delivery: "MULTI_ASSET" });
  const h = b.hook_strategy;
  assert.match(h.instruction, /SCROLL-STOPPER/);
  assert.match(h.instruction, /AGGRESSIVSTE/);
  assert.ok(h.tone.some((t) => /3 bis 6 Woerter/.test(t)));
  assert.deepEqual(h.tone_examples, ["RIVIAN SCHLÄGT DIE WALL STREET.", "TOTGESAGT. JETZT REKORD.",
    "DIE NÄCHSTEN 90 TAGE ENTSCHEIDEN ALLES."]);
  assert.match(h.fact_limit, /Jede Zuspitzung muss belegt sein/);
  assert.ok(h.negative_fixtures.includes("RIVIAN SCHALTET EINEN GANG HÖHER."));
  assert.ok(h.negative_fixtures.includes("REKORD GESCHAFFT. JETZT KOMMT DER SCHWERE TEIL."));
  assert.equal(Gate.istNegativeHookFixture("RIVIAN SCHALTET EINEN GANG HÖHER."), true);
  assert.equal(Gate.istNegativeHookFixture("TOTGESAGT. JETZT REKORD."), false);
  assert.match(b.research.instruction, /Routinemeldungen/);

  /* Text auf Slide 2 und 3 ist Pflicht - weniger extrem als die Hook. */
  assert.match(b.carousel.text_on_image, /auf JEDEM Slide Pflicht/);
  assert.match(b.carousel.text_on_image, /weniger extrem als die Hook/);
  assert.match(b.carousel.slides[1].contains, /PFLICHT: eine starke deutsche Headline/);
  assert.match(b.carousel.slides[2].contains, /PFLICHT: eine starke deutsche Headline/);

  /* Drei Bilder in einem Auftrag. */
  assert.equal(b.delivery.mode, "MULTI_ASSET");
  assert.match(b.delivery.deliver_now, /ALLE Slides in DIESEM einen Auftrag/);
  assert.match(b.asset_requirements.deterministic_paths[2], /slide-03\.png$/);
  assert.match(b.asset_requirements.announcement_note, /includes_text_de/);
  const cfg = JSON.parse(readFileSync(join(ROOT, "social/config/work-agent.json"), "utf8"));
  assert.equal(cfg.delivery_mode, "MULTI_ASSET");

  /* Ein Slide ohne Text faellt durch. */
  const ohneText = ergebnis({ visual_variants: [slide(1), slide(2, { brand_elements: {
    includes_logo: true, includes_atlas: false, includes_text_de: false } }), slide(3)] });
  assert.ok(Work.verifyCarousel(ohneText).map((x) => x.id).includes("slideTextMissing"));
  assert.deepEqual(Work.verifyCarousel(ergebnis({ visual_variants: [slide(1), slide(2), slide(3)] })), []);
});

test("WOP26 · Owner-Storno: nur ein nie gestarteter Auftrag, nur mit gemessener Stille", () => {
  const Job = require("../engines/creative-job.js");
  const KEY = "brief_s:vu-post-s:abc:1.0";
  const storno = { contentId: "vu-post-s", processingKey: KEY, decidedBy: "OWNER",
    decidedAt: "2026-10-03T05:50:00Z" };
  const job = (extra) => Object.assign({ creativeJobId: "job_s", contentId: "vu-post-s",
    processingKey: KEY, state: "CREATIVE_JOB_DISPATCHED", prNumber: 364, observedStarts: 0,
    history: [], createdAt: "2026-10-02T21:00:45Z", updatedAt: "2026-10-02T21:00:45Z" }, extra || {});
  const gemessen = { now: "2026-10-03T06:00:00Z", ownerStorno: storno,
    agentMeldungGemessen: true, agentMeldungVorhanden: false };

  assert.equal(Job.EVIDENZ.OWNER_STORNO_NIE_GESTARTET, "CREATIVE_JOB_SUPERSEDED");
  const reg = Job.createRegistry([job()]);
  const r = reg.reconcile("job_s", "OWNER_STORNO_NIE_GESTARTET", gemessen);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.to, "CREATIVE_JOB_SUPERSEDED");
  assert.equal(Job.OFFEN.includes(reg.all()[0].state), false, "der Slot ist frei");

  const abgewiesen = (j, opt) => {
    const x = Job.createRegistry([job(j)]).reconcile("job_s", "OWNER_STORNO_NIE_GESTARTET",
      Object.assign({}, gemessen, opt));
    assert.equal(x.ok, false);
    assert.equal(x.geaendert, false);
    return x.message;
  };
  assert.match(abgewiesen({}, { agentMeldungVorhanden: true }), /Agent-Meldung/);
  assert.match(abgewiesen({}, { agentMeldungGemessen: undefined }), /nicht gemessen/);
  assert.match(abgewiesen({ observedStarts: 2 }), /Start/);
  assert.match(abgewiesen({ state: "CREATIVE_JOB_IN_FLIGHT" }), /CREATIVE_JOB_IN_FLIGHT/);
  assert.match(abgewiesen({ processingKey: "brief_s:vu-post-s:anderer:1.0" }), /Storno-Entscheidung nennt/);
  assert.match(abgewiesen({}, { ownerStorno: Object.assign({}, storno, { decidedBy: "SCRIPT" }) }),
    /Owner-Entscheidung/);
  assert.ok(Job.KEINE_EVIDENZ.includes("OWNER_VERMUTUNG"), "eine Vermutung bleibt unzulaessig");

  /* Die echte Entscheidung nennt genau den Auftrag aus PR #364. */
  const datei = JSON.parse(readFileSync(join(ROOT, "social/data/owner-job-storno.json"), "utf8"));
  const e = datei.entries.find((x) => x.prNumber === 364);
  assert.equal(e.decidedBy, "OWNER");
  assert.equal(e.contentId, "vu-post-20261002-fd3c1bcd00");
  assert.ok(e.processingKey.startsWith("brief_6c4b03d96db69f6d:vu-post-20261002-fd3c1bcd00:"));
});
