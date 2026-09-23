/* =========================================================================
   VU SOCIAL — social/tests/creative-gate.test.mjs

   HARD FINAL CREATIVE GATE (Owner-Direktive "FINAL GOLDEN PATH
   SIMPLIFICATION", 23.09., §15/§16)
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const CG = require("../engines/creative-gate.js");

function kandidat(overrides) {
  const p = Object.assign({
    hook: "Seit drei Monaten: MSFT stieg um 30,2 %.",
    caption: "Seit drei Monaten steht MSFT bei 493,78 USD...",
    captionBase: "Seit drei Monaten steht MSFT bei 493,78 USD im Schlusskurs. " +
      "Genau darin steckt die eigentliche Frage.",
    reason: "Opportunity Score 61 von 100.",
    hashtags: ["MSFT", "Aktienanalyse", "Investieren"],
    visualOrigin: "generative",
    visualType: "GENERATIVE"
  }, overrides || {});
  return { candidateId: "cand_test", contentHash: "abc123", presentation: p,
    content: { imageUrl: "https://research.visionuniverse.de/x.jpg",
      caption: p.caption } };
}

const OK_OPTIONEN = { rendered: true, atlasBefund: { passed: true },
  logoBefund: { passed: true }, assetExists: true };

test("CG1 · Ein vollstaendig bestandener Kandidat besteht das Tor", () => {
  const r = CG.pruefe(kandidat(), OK_OPTIONEN);
  assert.equal(r.ok, true, r.erklaerung);
  assert.deepEqual(r.verstoesse, []);
});

test("CG2 · Die reale MSFT-Fixture '493,78 USD Schlusskurs - MSFT.' faellt durch", () => {
  const r = CG.pruefe(kandidat({ hook: "493,78 USD Schlusskurs - MSFT." }), OK_OPTIONEN);
  assert.equal(r.ok, false);
  assert.ok(r.verstoesse.some((v) => v.id === "HOOK_SOCIAL_FIRST"));
});

test("CG3 · Die reale Ranking-Fixture '420 von 5954 geprueften Titeln' faellt durch", () => {
  const r = CG.pruefe(kandidat({ hook: "420 von 5954 geprueften Titeln - Comeback?" }), OK_OPTIONEN);
  assert.equal(r.ok, false);
  assert.ok(r.verstoesse.some((v) => v.id === "HOOK_SOCIAL_FIRST"));
});

test("CG4 · Eine echte Story ('Seit drei Monaten...') besteht HOOK_SOCIAL_FIRST", () => {
  const r = CG.pruefe(kandidat(), OK_OPTIONEN);
  assert.equal(r.befund.HOOK_SOCIAL_FIRST, true);
});

test("CG5 · Die alte Systemausgabe-Caption-Oeffnung faellt durch", () => {
  const r = CG.pruefe(kandidat({ captionBase:
    "Unsere technische Auswertung bewertet MSFT derzeit mit 493,78 USD im Schlusskurs." }),
    OK_OPTIONEN);
  assert.equal(r.ok, false);
  assert.ok(r.verstoesse.some((v) => v.id === "CAPTION_SOCIAL_FIRST"));
});

test("CG6 · Interner Begriff im oeffentlichen Text blockiert (§8)", () => {
  const r = CG.pruefe(kandidat({ hook: "Technical Opportunity Score 61,1 - MSFT." }),
    OK_OPTIONEN);
  assert.equal(r.ok, false);
  assert.ok(r.verstoesse.some((v) => v.id === "INTERNAL_JARGON"));
  assert.ok(r.befund.INTERNAL_JARGON > 0);
});

test("CG7 · Kein Hashtag blockiert", () => {
  const r = CG.pruefe(kandidat({ hashtags: [] }), OK_OPTIONEN);
  assert.equal(r.ok, false);
  assert.ok(r.verstoesse.some((v) => v.id === "HASHTAGS_PRESENT"));
});

test("CG8 · Kein bestandener Render-Durchlauf blockiert (kein zweiter Toranspruch, nur gespiegelt)", () => {
  const r = CG.pruefe(kandidat(), Object.assign({}, OK_OPTIONEN, { rendered: false }));
  assert.equal(r.ok, false);
  assert.ok(r.verstoesse.some((v) => v.id === "TEXT_ON_VISUAL_PRESENT"));
});

test("CG9 · Kein bestandener Atlas-Vertrag blockiert", () => {
  const r = CG.pruefe(kandidat(), Object.assign({}, OK_OPTIONEN,
    { atlasBefund: { passed: false } }));
  assert.equal(r.ok, false);
  assert.ok(r.verstoesse.some((v) => v.id === "ATLAS_PRESENT"));
});

test("CG10 · Kein bestandener Logo-Vertrag blockiert", () => {
  const r = CG.pruefe(kandidat(), Object.assign({}, OK_OPTIONEN,
    { logoBefund: { passed: false } }));
  assert.equal(r.ok, false);
  assert.ok(r.verstoesse.some((v) => v.id === "CANONICAL_LOGO_PRESENT"));
});

test("CG11 · Ein uebernommenes (nicht generatives) Bild besteht GENERATED_STORY_MOTIF_PRESENT nicht", () => {
  const r = CG.pruefe(kandidat({ visualOrigin: "rendered", visualType: "DATA_CARD" }),
    OK_OPTIONEN);
  assert.equal(r.ok, false);
  assert.ok(r.verstoesse.some((v) => v.id === "GENERATED_STORY_MOTIF_PRESENT"));
});

test("CG12 · Eine fehlende Bilddatei auf dem Datentraeger blockiert (ASSET_PUBLICLY_REACHABLE)", () => {
  const r = CG.pruefe(kandidat(), Object.assign({}, OK_OPTIONEN, { assetExists: false }));
  assert.equal(r.ok, false);
  assert.ok(r.verstoesse.some((v) => v.id === "ASSET_PUBLICLY_REACHABLE"));
});

test("CG13 · Fehlender Inhaltsabdruck blockiert PUBLISH_PAYLOAD_VERIFIED", () => {
  const k = kandidat();
  k.contentHash = null;
  const r = CG.pruefe(k, OK_OPTIONEN);
  assert.equal(r.ok, false);
  assert.ok(r.verstoesse.some((v) => v.id === "PUBLISH_PAYLOAD_VERIFIED"));
});

test("CG14 · Ohne Hook oder Begruendung faellt STORY_CLEAR durch", () => {
  const r = CG.pruefe(kandidat({ hook: "", reason: "" }), OK_OPTIONEN);
  assert.equal(r.ok, false);
  assert.ok(r.verstoesse.some((v) => v.id === "STORY_CLEAR"));
});

test("CG15 · Mehrere Verstoesse werden alle gemeldet, nicht nur der erste", () => {
  const r = CG.pruefe(kandidat({ hashtags: [], hook: "" }), OK_OPTIONEN);
  assert.equal(r.ok, false);
  assert.ok(r.verstoesse.length >= 2);
});
