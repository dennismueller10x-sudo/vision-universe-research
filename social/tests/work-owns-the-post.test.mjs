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
    brand_elements: { includes_logo: true, includes_atlas: i === 1, includes_hook_text_de: i === 1 } }, extra || {});
}

/* Die Lieferform des aktiven Agentenvertrags (PR #300): EIN Bogen. */
function panel(i, be) {
  return { slide_index: i, role: i === 1 ? "cover" : "story",
    brand_elements: be || { includes_logo: true, includes_atlas: i === 1, includes_hook_text_de: i === 1 } };
}

function bogen(panels, extra) {
  return Object.assign({ visual_variant_id: "sheet", visual_strategy: "CAROUSEL_SHEET",
    asset_path: "authoring/requests/x/assets/visual-01.png", mime_type: "image/png",
    width: panels.length * 1080, height: 1350, asset_byte_size: 10, asset_sha256: "a".repeat(64),
    brand_elements: { includes_logo: true, includes_atlas: true, includes_hook_text_de: true },
    carousel_sheet: { slide_count: panels.length, panel_width: 1080, panel_height: 1350, panels } },
  extra || {});
}

function ergebnis(extra) {
  return Object.assign({
    request_type: "FULL_CREATIVE", creative_format: "CAROUSEL",
    story: { title_de: "Der Chip-Gewinn", what_happened: "x", why_interesting: "Weil es Anleger betrifft." },
    sources: [{ source: "Test", url: "https://example.com/a", published_at: NOW, facts_used: ["2 Mrd."],
      opened_by_agent: true }],
    hook_variants: [{ hook_variant_id: "h", hook_type: Work.CAROUSEL_HOOK_TYPE, text: "Doppelter Gewinn, halber Jubel" }],
    caption: "Der Konzern verdoppelt seinen Gewinn. Keine Anlageberatung.",
    hashtags: ["#Halbleiter", "Boerse"], carousel_plan: [], slide_count: 3,
    editorial_gate: { story_quality: "PASS", hook_standalone_quality: "PASS",
      caption_standalone_quality: "PASS", fact_grounding: "PASS" },
    visual_variants: [bogen([panel(1), panel(2), panel(3)])],
    carousel_checks: { atlas_only_on_slide_1: true, logo_on_all_slides: true, logo_position_consistent: true },
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

test("WOP4 · Kein Stil-Mikromanagement: keine Palette, kein Stil, kein Motiv, keine Layout-Zonen", () => {
  const b = brief();
  const text = JSON.stringify(b);
  /* Pflichtfeld des Agentenvertrags - aber nur die Lieferform, kein Stil. */
  assert.equal(b.visual_strategy.strategy_id, "CAROUSEL_SHEET");
  for (const k of ["palette", "style", "composition"]) {
    assert.equal(b.visual_strategy[k], undefined, "visual_strategy." + k + " ist Stil-Mikromanagement");
  }
  assert.equal(b.grounding_hook_en, undefined, "keine vorgewaehlte Hook");
  for (const verboten of ["#5FE0C0", "20%", "one-fifth", "bold flat", "comic-panel", "Serverreihen",
    "premium cinematic 3D"]) {
    assert.ok(!text.includes(verboten), "Brief enthaelt " + verboten);
  }
  assert.equal(b.authoring_requirements.hook_variant_count, 1);
  assert.equal(b.authoring_requirements.internal_hook_exploration, true);
  assert.deepEqual(b.hook_strategy.negative_fixtures.slice(0, 2),
    ["BÖRSENGANG MIT EXISTENZWARNUNG", "50.000 DOLLAR FÜR EIN AUTO?"]);
});

test("WOP5 · Atlas nur auf Slide 1, Logo auf allen, 3-4 Slides, Editorial Gate, Quellen", () => {
  const c = brief().carousel;
  assert.match(c.atlas_contract, /AUSSCHLIESSLICH auf Slide 1/);
  assert.match(c.logo_contract, /auf ALLEN Slides/);
  assert.match(c.text_on_image, /BÖRSE\|NGANG/);
  assert.match(brief().editorial_gate.rule, /OHNE Bild/);
  const a = brief().asset_requirements;
  assert.equal(a.count, 1, "der aktive Agentenvertrag erlaubt EIN Asset (PR #300)");
  assert.match(a.deterministic_path, /\/assets\/visual-01\.png$/);
  assert.equal(a.carousel_sheet.panel_width, 1080);
  assert.equal(a.carousel_sheet.panel_height, 1350);
  assert.equal(a.carousel_sheet.gutter, 0);
  assert.equal(brief().authoring_requirements.sources_required, true);
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

test("WOP8 · Ein vollstaendiges Carousel-Ergebnis besteht die Carousel-Pruefung", () => {
  assert.deepEqual(Work.verifyCarousel(ergebnis()), []);
  const vertrag = Contract.validateResult(ergebnis(), brief());
  assert.equal(vertrag.ok, true, vertrag.explanation);
});

test("WOP9 · Atlas ausserhalb von Slide 1, fehlendes Logo, zu viele Tags, keine Quelle, Gate nicht PASS", () => {
  const ids = (r) => Work.verifyCarousel(r).map((b) => b.id);
  const mit = (panels) => ergebnis({ visual_variants: [bogen(panels)], slide_count: panels.length });
  assert.ok(ids(mit([panel(1), panel(2, { includes_logo: true, includes_atlas: true }), panel(3)]))
    .includes("atlasOutsideCover"));
  assert.ok(ids(mit([panel(1), panel(2), panel(3, { includes_logo: false, includes_atlas: false })]))
    .includes("logoMissing"));
  assert.ok(ids(ergebnis({ hashtags: ["a", "b", "c", "d", "e", "f"] })).includes("hashtags"));
  assert.ok(ids(ergebnis({ sources: [] })).includes("sources"));
  assert.ok(ids(ergebnis({ editorial_gate: { story_quality: "PASS", hook_standalone_quality: "FAIL",
    caption_standalone_quality: "PASS", fact_grounding: "PASS" } })).includes("editorialGate:hook_standalone_quality"));
  assert.ok(ids(mit([panel(1), panel(2)])).includes("slideCount"));
  const zuWenig = Contract.validateResult(ergebnis({ visual_variants: [bogen([panel(1), panel(2)])] }), brief());
  assert.equal(zuWenig.ok, false);
  /* Bogenmasse muessen zu den Paneelen passen - sonst liegt die Naht falsch. */
  assert.ok(ids(ergebnis({ visual_variants: [bogen([panel(1), panel(2), panel(3)], { width: 3000 })] }))
    .includes("sheetSize"));
  assert.ok(ids(ergebnis({ visual_variants: [slide(1)] })).includes("sheetMissing"));
  /* Ein spaeter erweiterter Vertrag mit einer Datei je Slide bleibt gueltig. */
  assert.deepEqual(Work.verifyCarousel(ergebnis({ visual_variants: [slide(1), slide(2), slide(3)] })), []);
});

/* ------------------------------------------------------------ Kandidat */

test("WOP10 · EIN Carousel = EIN Kandidat, der nichts abloest", () => {
  const urls = [1, 2, 3].map((n) => "https://research.visionuniverse.de/assets/social/c-s" + n + ".png");
  const k = baueKandidat(brief(), ergebnis(), urls, { now: NOW });
  assert.equal(k.state, "AWAITING_APPROVAL");
  assert.equal(k.supersedes, null);
  assert.deepEqual(k.supersedesAll, []);
  assert.deepEqual(k.content.imageUrls, urls);
  assert.equal(k.content.imageUrl, urls[0]);
  assert.equal(k.presentation.mediaFormat, "CAROUSEL");
  assert.equal(k.presentation.slideCount, 3);
  assert.deepEqual(k.presentation.hashtags, ["Halbleiter", "Boerse"]);
  assert.equal(k.content.caption, Hashtags.finalerText(k.presentation.captionBase, k.presentation.hashtags),
    "Vorschau = Sendung: Caption + Tags lassen sich zurueckrechnen");
  assert.equal(k.contentHash, ContentHash.contentHash(k.content));
  assert.equal(k.presentation.sources[0].url, "https://example.com/a");
  const gate = Gate.pruefe(k, { rendered: true, atlasBefund: { passed: true }, logoBefund: { passed: true },
    assetExists: true });
  assert.equal(gate.ok, true, gate.erklaerung);
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

test("WOP22 · Der Bogen wird an den Paneelgrenzen verlustfrei getrennt - Pixel fuer Pixel", () => {
  const Slice = require("../engines/png-slice.js");
  const w = 3 * 8, h = 6, bpp = 4;
  const pixel = Buffer.alloc(w * h * bpp);
  for (let i = 0; i < pixel.length; i += 1) pixel[i] = (i * 31 + 7) & 255;
  const png = Slice.schreibe({ width: w, height: h, colorType: 6, bpp, pixel });
  const teile = Slice.schneide(png, 3);
  assert.equal(teile.length, 3);
  teile.forEach((t, n) => {
    const r = Slice.lies(t.png);
    assert.equal(r.width, 8);
    assert.equal(r.height, h);
    for (let y = 0; y < h; y += 1) {
      assert.deepEqual(r.pixel.subarray(y * 8 * bpp, (y + 1) * 8 * bpp),
        pixel.subarray(y * w * bpp + n * 8 * bpp, y * w * bpp + (n + 1) * 8 * bpp));
    }
  });
  assert.throws(() => Slice.schneide(png, 5), /SLICE_WIDTH_NOT_DIVISIBLE/);
  assert.throws(() => Slice.lies(Buffer.from("kein png")), /PNG_SIGNATURE/);
});

test("WOP23 · Der Kandidat aus einem Bogen traegt 3 Slides zu je 1080x1350 und den Bogen als Herkunft", () => {
  const urls = [1, 2, 3].map((n) => "https://research.visionuniverse.de/assets/social/c-s" + n + ".png");
  const k = baueKandidat(brief(), ergebnis(), urls, { now: NOW });
  assert.equal(k.presentation.slideCount, 3);
  k.presentation.slides.forEach((s) => { assert.equal(s.width, 1080); assert.equal(s.height, 1350); });
  assert.equal(k.provenance.visual.sheet.panels, 3);
  assert.equal(k.provenance.visual.sheet.slicing, "lossless-panel-cut");
});
